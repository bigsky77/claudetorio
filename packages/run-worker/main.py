import argparse
import asyncio
import logging
import os
import traceback

import httpx
from dotenv import load_dotenv

# Load .env BEFORE any FLE imports — FLE captures env vars (like FLE_RCON_PASSWORD)
# at module-level import time, so they must be set first.
load_dotenv()

# Surface retry errors from APIFactory.acall (tenacity logs to "tenacity" logger)
logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(name)s %(levelname)s: %(message)s")
logging.getLogger("openai").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)

from fle.agents.llm.api_factory import APIFactory  # noqa: E402
from fle.agents.llm.parsing import parse_response  # noqa: E402
from fle.agents.formatters import RecursiveReportFormatter  # noqa: E402
from fle.commons.models.conversation import Conversation  # noqa: E402
from fle.env.gym_env.environment import FactorioGymEnv  # noqa: E402
from fle.env.gym_env.observation import Observation  # noqa: E402
from fle.env.gym_env.observation_formatter import BasicObservationFormatter  # noqa: E402
from fle.env.gym_env.action import Action  # noqa: E402

DEFAULT_MODEL = "claude-sonnet-4-5-20250929"

SYSTEM_PROMPT_PREAMBLE = """\
# Factorio LLM Agent Instructions

## Overview
You are an AI agent designed to play Factorio, specializing in:
- Long-horizon planning
- Spatial reasoning
- Systematic automation

Your goal is to maximize your production score by building an efficient factory.

## CRITICAL: You never need to move
ALL actions work from any distance. NEVER call `move_to` before `harvest_resource`, `place_entity`, or any other action. Just call the action directly with the target position. For example:
```python
coal_pos = nearest(Resource.Coal)
harvest_resource(coal_pos, quantity=20)  # Works from anywhere — do NOT move_to first
```

## Environment Structure
- Operates like an interactive Python shell
- Your messages = Python programs to execute
- Responses = STDOUT/STDERR from REPL
- All FLE namespace methods and types are available (e.g. `place_entity`, `move_to`, `craft_item`, `inspect_inventory`, `get_entities`, `harvest_resource`, `connect_entities`, `insert_item`, `extract_item`, `set_research`, `get_research_progress`, `Prototype`, `Resource`, `Direction`, `Position`, `Technology`, etc.)
- You do NOT need to import anything. All tools and types are pre-imported.

## Response Format

### 1. PLANNING Stage
Think through each step extensively in natural language, addressing:
1. Error Analysis
   - Was there an error in the previous execution?
   - If yes, what was the problem?
2. Next Step Planning
   - What is the most useful next step of reasonable size?
   - Why is this step valuable?
3. Action Planning
   - What specific actions are needed?
   - What resources are required?

### 2. POLICY Stage
Write Python code to execute the planned actions:
```python
# Code must be enclosed in Python tags
your_code_here
```

## Best Practices

### Modularity
- Create small, modular policies, MAXIMUM 50 lines of code
- Each policy should have a single clear purpose
- Keep policies easy to debug and modify
- Avoid breaking existing automated structures

### Debugging & Verification
- Use print statements to monitor important state
- Implement assert statements for self-verification
- Use specific, parameterized assertion messages
- Example: `assert condition, f"Expected {expected}, got {actual}"`

### State Management
- Consider entities needed for each step
- Track entities across different inventories
- Monitor missing requirements
- Preserve working automated structures

### Error Handling
- Fix errors as they occur
- Don't repeat previous steps
- Continue from last successful execution
- Avoid unnecessary state changes
- Analyze the root cause of entities that aren't working, and prioritize automated solutions (like transport belts) above manual triage

### Code Structure
- Write code as direct Python interpreter commands
- Only encapsulate reusable utility code into functions
- Do not wrap your code in a main function — just write it directly

## Game Progression
- Start by finding ore patches with `nearest(Resource.IronOre)`, `nearest(Resource.Coal)`, etc.
- Use `get_resource_patch(Resource.IronOre, position)` to find the size and bounds of ore patches
- Use `harvest_resource(position, quantity)` to manually gather resources — it searches a radius, so you don't need to be exactly on the resource
- Craft basic items: stone furnaces, burner mining drills, transport belts
- Set up automated mining with burner mining drills on ore patches, then smelt with stone furnaces
- Research automation technology, then build assembling machines
- Expand production chains step by step
- Always keep fuel (coal) in burner entities
- Think about long term objectives, break them down into smaller, manageable steps
- Build incrementally and verify each step

## Important Notes
- DON'T REPEAT YOUR PREVIOUS STEPS — continue from where you left off
- If there was an error previously, fix it rather than re-running everything
- Your inventory has space for ~2000 items. If it fills up, insert items into a chest
- Arrange your factory in a grid for easier management
- Use `print()` to log information you want to see

ALWAYS WRITE VALID PYTHON AND REMEMBER MAXIMUM 50 LINES OF CODE PER POLICY.
"""


async def run(steps: int, broker_url: str, username: str):
    """Main agent loop: claim session, observe-think-act, release."""
    model = os.getenv("MODEL", DEFAULT_MODEL)
    server_host = os.getenv("SERVER_HOST", "localhost")

    # If CUSTOM_API=true, register a "custom" provider using CUSTOM_API_URL and CUSTOM_API_KEY.
    # This lets you point at any OpenAI-compatible API (Groq, Ollama, vLLM, etc.)
    # without the model name needing to match a built-in provider.
    if os.getenv("CUSTOM_API", "").lower() in ("true", "1", "yes"):
        custom_url = os.getenv("CUSTOM_API_URL")
        custom_key = os.getenv("CUSTOM_API_KEY")
        if not custom_url or not custom_key:
            raise ValueError("CUSTOM_API=true requires CUSTOM_API_URL and CUSTOM_API_KEY")
        custom_provider = {
            "base_url": custom_url,
            "api_key_env": "CUSTOM_API_KEY",
            "key_manager_provider": "custom",
        }
        APIFactory.PROVIDERS["custom"] = custom_provider
        # Always route to custom provider — override detection entirely
        APIFactory._get_provider_config = lambda self, m: custom_provider

    api_factory = APIFactory(model)
    formatter = RecursiveReportFormatter(
        chunk_size=16,
        llm_call=api_factory.acall,
    )

    print(f"Using model: {model}")

    # 1. Claim a session from the broker
    print(f"Claiming session from {broker_url} as '{username}'...")
    resp = httpx.post(
        f"{broker_url}/api/session/claim",
        json={"username": username},
        timeout=30,
    )

    # If user already has an active session (409), release it and retry
    if resp.status_code == 409:
        detail = resp.json().get("detail", "")
        print(f"Stale session detected: {detail}")
        # Extract session_id from the error detail
        # Format: "User 'x' already has active session <id> on slot <n>"
        parts = detail.split("active session ")
        if len(parts) > 1:
            stale_id = parts[1].split(" ")[0]
            print(f"Releasing stale session {stale_id}...")
            try:
                release_resp = httpx.post(
                    f"{broker_url}/api/session/{stale_id}/release",
                    json={},
                    timeout=30,
                )
                release_resp.raise_for_status()
                print("Stale session released, retrying claim...")
            except Exception as e:
                print(f"Warning: failed to release stale session: {e}")
        resp = httpx.post(
            f"{broker_url}/api/session/claim",
            json={"username": username},
            timeout=30,
        )

    resp.raise_for_status()
    claim = resp.json()

    session_id = claim["session_id"]
    rcon_port = claim["rcon_port"]
    slot = claim["slot"]
    print(f"Claimed session {session_id} (slot {slot}, rcon_port {rcon_port})")

    # Set the RCON port env var for FLE
    os.environ["FLE_RCON_PORT"] = str(rcon_port)

    # 2. Connect FLE
    from fle.env.instance import FactorioInstance

    print(f"Connecting to Factorio at {server_host}:{rcon_port}...")
    instance = FactorioInstance(
        address=server_host,
        tcp_port=rcon_port,
        fast=True,
        all_technologies_researched=False,
        clear_entities=False,
    )

    # Wrap instance in gym env for structured observations and step tracking
    gym_env = FactorioGymEnv(
        instance=instance,
        task=None,
        error_penalty=0.0,
        pause_after_action=False,
    )
    obs_formatter = BasicObservationFormatter(
        include_inventory=True,
        include_entities=True,
        include_flows=True,
        include_task=False,
        include_messages=False,
        include_functions=False,
        include_research=True,
        include_game_info=True,
        include_raw_output=True,
    )

    # Build system prompt with FLE API docs.
    system_prompt = SYSTEM_PROMPT_PREAMBLE + "\n" + instance.get_system_prompt()

    conversation = Conversation()
    conversation.set_system_message(system_prompt)
    last_result: str | None = None
    observation: Observation | None = None
    cumulative_score = 0.0

    try:
        # 3. Agent loop
        for step in range(1, steps + 1):
            print(f"\n{'='*60}")
            print(f"Step {step}/{steps}")
            print(f"{'='*60}")

            # Observe — first step gets a fresh observation, subsequent steps
            # use the observation returned by gym_env.step()
            if observation is None:
                observation = gym_env.get_observation(agent_idx=0)
            formatted_obs = obs_formatter.format(observation)
            obs_text = formatted_obs.raw_str
            if last_result is not None:
                obs_text += f"\n\n## Result from previous step\n{last_result}\n"

            print(f"Score: {cumulative_score}")

            conversation.add_user_message(obs_text)

            # Format conversation (handles summarization of old messages)
            formatted = await formatter.format_conversation(conversation)
            messages = formatter.to_llm_messages(formatted)
            total_chars = sum(len(m.get("content", "")) for m in messages)
            print(f"Context: {len(messages)} messages, ~{total_chars} chars")

            # Call LLM (with timeout — acall retries forever on errors)
            print("Thinking...")
            try:
                response = await asyncio.wait_for(
                    api_factory.acall(messages=messages, max_tokens=4096),
                    timeout=120,
                )
            except asyncio.TimeoutError:
                print("ERROR: LLM call timed out after 120s (likely silent retries on API errors)")
                conversation.add_agent_message("# LLM call timed out")
                last_result = "ERROR: LLM call timed out — check API key, rate limits, or context size"
                observation = gym_env.get_observation(agent_idx=0)
                continue

            # Extract code from response
            policy = parse_response(response)
            if policy is None:
                conversation.add_agent_message("# No valid code generated")
                last_result = "ERROR: no valid Python in LLM response"
                print("Warning: LLM response contained no valid Python code")
                observation = gym_env.get_observation(agent_idx=0)
                continue

            code = policy.code
            conversation.add_agent_message(policy.meta.text_response)

            print(f"Code:\n{code}")

            # Act via gym env
            print("Executing...")
            action = Action(code=code, agent_idx=0)
            obs_dict, reward, terminated, truncated, info = gym_env.step(action)
            observation = Observation.from_dict(obs_dict)

            # Structured results from info dict
            error_occurred = info["error_occurred"]
            result_text = info["result"]
            production_score = info["production_score"]
            cumulative_score = production_score

            if error_occurred:
                last_result = f"ERROR: {result_text}"
                print(f"Error: {result_text}")
            else:
                last_result = f"Score: {production_score} (reward: {reward:+.1f}), Output: {result_text}"
                print(f"Result: score={production_score}, reward={reward:+.1f}, output={result_text}")

    except KeyboardInterrupt:
        print("\nInterrupted by user.")
    except Exception as e:
        print(f"\nFatal error: {e}")
        traceback.print_exc()
    finally:
        # 4. Release session
        print(f"\nReleasing session {session_id}...")
        try:
            release_resp = httpx.post(
                f"{broker_url}/api/session/{session_id}/release",
                json={},
                timeout=30,
            )
            release_resp.raise_for_status()
            release_data = release_resp.json()
            print(f"Session released. Final score: {release_data.get('final_score', '?')}")
        except Exception as e:
            print(f"Warning: failed to release session: {e}")

        # 5. Cleanup
        try:
            gym_env.close()
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(description="Claudetorio autonomous agent worker")
    parser.add_argument("--steps", type=int, default=10, help="Number of agent steps to run")
    parser.add_argument("--broker-url", type=str, default=os.getenv("BROKER_URL", "http://localhost:8080"), help="Broker API URL")
    parser.add_argument("--username", type=str, default=os.getenv("BROKER_USERNAME", "run_worker"), help="Username for session claim")
    args = parser.parse_args()

    asyncio.run(run(steps=args.steps, broker_url=args.broker_url, username=args.username))


if __name__ == "__main__":
    main()
