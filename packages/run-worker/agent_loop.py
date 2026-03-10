import asyncio
import os
import time
import traceback

from fle.agents.llm.parsing import parse_response
from fle.commons.models.conversation import Conversation
from fle.commons.models.game_state import GameState
from fle.env.gym_env.observation import Observation
from fle.env.gym_env.action import Action

import config
from factorio_setup import connect_factorio, render_map, setup_gym_env
from llm_helpers import (
    _coerce_messages_to_text_only,
    _should_use_text_only_messages,
    build_api_factory,
    build_formatter,
)
from prompts import build_system_prompt
from reporting import report_complete, report_step
from session import claim_session, release_session
from vcs_helpers import parse_vcs_directives


async def run(steps: int, broker_url: str, username: str):
    """Main agent loop: claim session, observe-think-act, release."""
    model = config.MODEL
    server_host = config.SERVER_HOST
    force_provider = config.FORCE_LLM_PROVIDER
    custom_api_enabled = force_provider == "custom" or config.CUSTOM_API
    text_only_messages = _should_use_text_only_messages(model, custom_api_enabled)

    api_factory = build_api_factory(
        model=model,
        force_provider=force_provider,
        custom_api_enabled=custom_api_enabled,
        custom_api_url=config.CUSTOM_API_URL,
        custom_api_key=config.CUSTOM_API_KEY,
    )
    formatter = build_formatter(api_factory)

    print(f"Using model: {model}")

    session_id = None  # Only set in standalone (non-run) mode

    if config.RUN_ID:
        # Managed by broker — RCON_PORT is passed via env
        rcon_port = int(os.environ["RCON_PORT"])
        print(f"Run mode (run_id={config.RUN_ID}), using RCON port {rcon_port}")
    else:
        # Standalone mode — claim a session from the broker
        session_id, rcon_port, _slot = claim_session(broker_url, username)

    # Set the RCON port env var for FLE
    os.environ["FLE_RCON_PORT"] = str(rcon_port)

    instance = connect_factorio(server_host, rcon_port)
    vcs_repo, gym_env, obs_formatter = setup_gym_env(instance)

    system_prompt = build_system_prompt(instance)
    conversation = Conversation()
    conversation.set_system_message(system_prompt)

    last_result: str | None = None
    observation: Observation | None = None
    cumulative_score = 0.0
    consecutive_fle_errors = 0
    MAX_CONSECUTIVE_FLE_ERRORS = 5

    run_error: str | None = None
    try:
        for step in range(1, steps + 1):
            print(f"\n{'='*60}")
            print(f"Step {step}/{steps}")
            print(f"{'='*60}")

            # ── Observe ──────────────────────────────────────────────
            try:
                if observation is None:
                    observation = gym_env.get_observation(agent_idx=0)
                formatted_obs = obs_formatter.format(observation)
                obs_text = formatted_obs.raw_str
            except Exception as obs_err:
                consecutive_fle_errors += 1
                print(f"ERROR: observation failed ({consecutive_fle_errors}/{MAX_CONSECUTIVE_FLE_ERRORS}): {obs_err}")
                traceback.print_exc()
                observation = None
                if config.RUN_ID:
                    report_step(broker_url, config.RUN_ID, step_idx=step,
                                code="# observation failed", result=str(obs_err),
                                error_occurred=True, production_score=cumulative_score)
                if consecutive_fle_errors >= MAX_CONSECUTIVE_FLE_ERRORS:
                    raise RuntimeError(f"Aborting: {MAX_CONSECUTIVE_FLE_ERRORS} consecutive FLE errors — Factorio server likely dead")
                time.sleep(2)
                continue

            if last_result is not None:
                obs_text += f"\n\n## Result from previous step\n{last_result}\n"

            print(f"Score: {cumulative_score}")

            conversation.add_user_message(obs_text)

            # Format conversation (handles summarization of old messages)
            formatted = await formatter.format_conversation(conversation)
            messages = formatter.to_llm_messages(formatted)

            # Inject map rendering into the last user message
            map_b64 = render_map(instance)
            if map_b64 and not text_only_messages:
                for i in range(len(messages) - 1, -1, -1):
                    if messages[i]["role"] == "user":
                        text = messages[i]["content"]
                        messages[i]["content"] = [
                            {"type": "text", "text": text if isinstance(text, str) else str(text)},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{map_b64}"}},
                            {"type": "text", "text": "[Map view around player. Use legend to identify entities.]"},
                        ]
                        break
            elif text_only_messages:
                messages = _coerce_messages_to_text_only(messages)

            total_chars = sum(
                len(m.get("content", "")) if isinstance(m.get("content"), str)
                else sum(len(b.get("text", "")) for b in m["content"] if b.get("type") == "text")
                for m in messages
            )
            print(f"Context: {len(messages)} messages, ~{total_chars} chars")

            # ── Think ────────────────────────────────────────────────
            print("Thinking...")
            try:
                response = await asyncio.wait_for(
                    api_factory.acall(messages=messages, max_tokens=4096),
                    timeout=120,
                )
            except asyncio.TimeoutError:
                print("ERROR: LLM call timed out after 120s")
                conversation.add_agent_message("# LLM call timed out")
                last_result = "ERROR: LLM call timed out — check API key, rate limits, or context size"
                observation = None
                continue
            except Exception as api_err:
                print(f"ERROR: LLM API call failed after retries: {type(api_err).__name__}: {api_err}")
                conversation.add_agent_message("# LLM API call failed")
                last_result = f"ERROR: API call failed: {api_err}"
                observation = None
                continue

            policy = parse_response(response)
            if policy is None:
                conversation.add_agent_message("# No valid code generated")
                last_result = "ERROR: no valid Python in LLM response"
                print("Warning: LLM response contained no valid Python code")
                observation = None
                continue

            code = policy.code
            conversation.add_agent_message(policy.meta.text_response)

            print(f"Code:\n{code}")

            # Parse VCS directives before execution
            directives, remaining_code = parse_vcs_directives(code)
            vcs_results = []
            for directive in directives:
                try:
                    if directive == "UNDO":
                        prev_id = vcs_repo.undo()
                        if prev_id:
                            vcs_repo.apply_to_instance(prev_id)
                            observation = gym_env.get_observation(agent_idx=0)
                            vcs_results.append(f"Undone to commit {prev_id[:8]}")
                        else:
                            vcs_results.append("Nothing to undo")
                    elif directive.startswith("TAG:"):
                        name = directive[4:]
                        vcs_repo.tag_commit(name)
                        vcs_results.append(f"Tagged as '{name}'")
                    elif directive.startswith("RESTORE:"):
                        ref = directive[8:]
                        tag_id = vcs_repo.get_tag(ref)
                        if tag_id:
                            vcs_repo.apply_to_instance(tag_id)
                            observation = gym_env.get_observation(agent_idx=0)
                            vcs_results.append(f"Restored to '{ref}'")
                        else:
                            vcs_results.append(f"Tag '{ref}' not found")
                    elif directive == "HISTORY":
                        history = vcs_repo.get_history(max_count=5)
                        lines = [f"  {h['id'][:8]}: {h['message']}" for h in history]
                        vcs_results.append("Recent history:\n" + "\n".join(lines))
                except Exception as vcs_err:
                    vcs_results.append(f"VCS error: {vcs_err}")

            # If only VCS directives (no code), skip gym step
            if directives and not remaining_code.strip():
                last_result = "VCS: " + "; ".join(vcs_results)
                if config.RUN_ID:
                    report_step(
                        broker_url, config.RUN_ID, step_idx=step,
                        code=code,
                        result=last_result,
                        error_occurred=False,
                        reward=0,
                        production_score=cumulative_score,
                    )
                continue

            exec_code = remaining_code if remaining_code.strip() else code

            # ── Act ──────────────────────────────────────────────────
            print("Executing...")
            action = Action(code=exec_code, agent_idx=0)
            try:
                obs_dict, reward, terminated, truncated, info = gym_env.step(action)
                observation = Observation.from_dict(obs_dict)
            except Exception as step_err:
                consecutive_fle_errors += 1
                print(f"ERROR: step execution crashed ({consecutive_fle_errors}/{MAX_CONSECUTIVE_FLE_ERRORS}): {step_err}")
                traceback.print_exc()
                last_result = f"ERROR: Step crashed: {step_err}"
                observation = None
                if config.RUN_ID:
                    report_step(broker_url, config.RUN_ID, step_idx=step,
                                code=code, result=str(step_err),
                                error_occurred=True, production_score=cumulative_score)
                if consecutive_fle_errors >= MAX_CONSECUTIVE_FLE_ERRORS:
                    raise RuntimeError(f"Aborting: {MAX_CONSECUTIVE_FLE_ERRORS} consecutive FLE errors — Factorio server likely dead")
                time.sleep(2)
                continue

            consecutive_fle_errors = 0

            error_occurred = info["error_occurred"]
            result_text = info["result"]
            production_score = info["production_score"]
            cumulative_score = production_score
            achievements = info.get("achievements")

            if error_occurred:
                last_result = f"ERROR: {result_text}"
                print(f"Error: {result_text}")
            else:
                last_result = f"Score: {production_score} (reward: {reward:+.1f}), Output: {result_text}"
                print(f"Result: score={production_score}, reward={reward:+.1f}, output={result_text}")

            if vcs_results:
                last_result = "VCS: " + "; ".join(vcs_results) + "\n" + last_result

            # Auto-commit game state after each step
            try:
                gs = GameState.from_instance(instance)
                vcs_repo.commit(gs, f"Step {step}: {'ERR' if error_occurred else 'OK'} score={production_score}", policy=exec_code)
            except Exception as e:
                print(f"VCS commit warning: {e}")

            if config.RUN_ID:
                report_step(
                    broker_url, config.RUN_ID, step_idx=step,
                    code=code,
                    result=result_text,
                    error_occurred=error_occurred,
                    reward=reward,
                    production_score=production_score,
                    achievements=achievements,
                )

    except KeyboardInterrupt:
        print("\nInterrupted by user.")
        run_error = "Interrupted"
    except Exception as e:
        print(f"\nFatal error: {e}")
        traceback.print_exc()
        run_error = str(e)
    else:
        run_error = None
    finally:
        if config.RUN_ID:
            report_complete(
                broker_url, config.RUN_ID,
                final_score=cumulative_score if cumulative_score > 0 else None,
                status="failed" if run_error else "completed",
                error=run_error,
            )

        if session_id:
            release_session(broker_url, session_id)

        try:
            gym_env.close()
        except Exception:
            pass
