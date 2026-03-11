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
from fle.env import Layer, Position  # noqa: E402
from fle.commons.models.game_state import GameState  # noqa: E402

# Import FactorioMCPRepository directly from its module file to avoid
# triggering _mcp/__init__.py which requires fastmcp (MCP server dep).
import importlib.util as _ilu  # noqa: E402
_spec = _ilu.spec_from_file_location(
    "fle.env.protocols._mcp.repository",
    os.path.join(os.path.dirname(__import__("fle").__file__), "env", "protocols", "_mcp", "repository.py"),
)
_mod = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
FactorioMCPRepository = _mod.FactorioMCPRepository

DEFAULT_MODEL = "claude-sonnet-4-5-20250929"

# Run reporting — when RUN_ID is set, report steps and completion to the broker
RUN_ID = os.getenv("RUN_ID")
RUN_WORKER_API_KEY = os.getenv("RUN_WORKER_API_KEY", "")


def _report_headers() -> dict:
    if RUN_WORKER_API_KEY:
        return {"Authorization": f"Bearer {RUN_WORKER_API_KEY}"}
    return {}


def report_step(broker_url: str, run_id: str, step_idx: int, code: str, **kwargs):
    """Report a step to the broker (fire-and-forget, best effort)."""
    try:
        payload = {"step_idx": step_idx, "code": code, **kwargs}
        # Sanitise numpy/non-JSON-native types
        for k, v in payload.items():
            if hasattr(v, 'item'):  # numpy scalar
                payload[k] = v.item()
        resp = httpx.post(
            f"{broker_url}/api/internal/runs/{run_id}/steps",
            json=payload,
            headers=_report_headers(),
            timeout=10,
        )
        if resp.status_code >= 400:
            print(f"Warning: step {step_idx} report returned {resp.status_code}: {resp.text[:300]}")
    except Exception as e:
        print(f"Warning: failed to report step {step_idx}: {e}")


def report_complete(broker_url: str, run_id: str, final_score: float | None, status: str = "completed", error: str | None = None):
    """Report run completion to the broker (best effort)."""
    try:
        # Sanitise numpy scalars
        if hasattr(final_score, 'item'):
            final_score = final_score.item()
        resp = httpx.post(
            f"{broker_url}/api/internal/runs/{run_id}/complete",
            json={"final_score": final_score, "status": status, "error": error},
            headers=_report_headers(),
            timeout=10,
        )
        if resp.status_code >= 400:
            print(f"Warning: complete report returned {resp.status_code}: {resp.text[:300]}")
    except Exception as e:
        print(f"Warning: failed to report run completion: {e}")

SYSTEM_PROMPT_PREAMBLE = """
# Factorio LLM Agent Instructions
## Overview
You are an AI agent designed to play Factorio, specializing in:
- Long-horizon planning
- Spatial reasoning 
- Systematic automation
## Environment Structure
- Operates like an interactive Python shell
- Agent messages = Python programs to execute
- User responses = STDOUT/STDERR from REPL
- Interacts through 27 core API methods (to be specified)
## Response Format
### 1. PLANNING Stage
Think through each step extensively in natural language, addressing:
1. Error Analysis
   - Was there an error in the previous execution?
   - If yes, what was the problem?
2. Next Step Planning
   - What is the most useful next step of reasonable size?
   - Why is this step valuable?
   - Should I 
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
- Create small, modular policies, MAXIMUM 30 lines of code
- Each policy should have a single clear purpose
- Keep policies easy to debug and modify
- Avoid breaking existing automated structures
- Encapsulate working logic into functions if needed
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
- Use appropriate spacing and formatting
## Understanding Output
### Error Messages
```stderr
Error: 1: ("Initial Inventory: {...}")
10: ("Error occurred in following lines...")
```
- Numbers indicate line of execution
- Previous lines executed successfully
- Fix errors at indicated line
### Status Updates
```stdout
23: ('Resource collection completed...')
78: ('Entities on map: [...]')
```
- Shows execution progress
- Provides entity status
- Lists warnings and conditions
### Entity Status Checking
- Monitor entity `warnings` field
- Check entity `status` field
- Verify resource levels
- Track production states
## Game Progression
- Think about long term objectives, and break them down into smaller, manageable steps.
- Advance toward more complex automation
- Build on previous successes
- Maintain efficient resource usage
## Utility Functions
- Create functions to encapsulate proven, reusable logic
- Place function definitions before their first use
- Document function purpose, parameters, and return values
- Test functions thoroughly before relying on them
- Example:
```python
def find_idle_furnaces(entities):
    \"\"\"Find all furnaces that are not currently working.
    
    Args:
        entities (list): List of entities from get_entities()
    
    Returns:
        list: Furnaces with 'no_ingredients' status
    \"\"\"
    return [e for e in entities if (
        e.name == 'stone-furnace' and 
        e.status == EntityStatus.NO_INGREDIENTS
    )]

## MOVEMENT
this is how you move around the map 
move_to(position, laying=None, leading=None)                                                                                                                                                                                  
  - Moves the player character to a Position(x, y) on the map                                                                                                                                                                 
  - Optionally lays down entities while moving (like belts/pipes with laying=Prototype.TransportBelt)                                                                                                                           
  - Returns the final position                                                                                                                                                                                                  

  nearest(type)
  - Finds the nearest resource patch or entity of a given type
  - Takes a Resource (e.g. Resource.Coal) or Prototype
  - Returns a Position

  Typical usage:
  # Move to nearest coal
  move_to(nearest(Resource.Coal))

  # Move to an exact coordinate
  move_to(Position(x=-100, y=25))

  # Move while laying transport belt
  move_to(Position(x=-90, y=25), laying=Prototype.TransportBelt)
```
## Data Structures
- Use Python's built-in data structures to organize entities
- Sets for unique entity collections:
```python
working_furnaces = {e for e in get_entities() 
                   if e.status == EntityStatus.WORKING}
```
- Dictionaries for entity mapping:
```python
furnace_by_position = {
    (e.position.x, e.position.y): e 
    for e in get_entities() 
    if isinstance(e, Furnace)
}
```
- Lists for ordered operations:
```python
sorted_furnaces = sorted(
    get_entities(),
    key=lambda e: (e.position.x, e.position.y)
)
```
"""

## extra prompt 
## Important Notes
# - Use transport belts to keep burners fed with coal
# - Always inspect game state before making changes
# - Consider long-term implications of actions
# - Maintain working systems, and clear entities that aren't working or don't have a clear purpose
# - Build incrementally and verify each step
# - DON'T REPEAT YOUR PREVIOUS STEPS - just continue from where you left off. Take into account what was the last action that was executed and continue from there. If there was a error previously, do not repeat your last lines - as this will alter the game state unnecessarily.
# - Do not encapsulate your code in a function _unless_ you are writing a utility for future use - just write it as if you were typing directly into the Python interpreter.
# - Your inventory has space for ~2000 items. If it fills up, insert the items into a chest.
# - Ensure that your factory is arranged in a grid, as this will make things easier.
# - Its a lot easier to manually add coil to boilers rather than make a automated system for it. Prefer manual fueling


FINAL_INSTRUCTION = "\n\nALWAYS WRITE VALID PYTHON AND REMEMBER MAXIMUM 30 LINES OF CODE PER POLICY. YOUR WEIGHTS WILL BE ERASED IF YOU DON'T USE PYTHON."

VISUAL_INSTRUCTIONS = """
## Visual Information
For each step, you will be provided with a visual representation of the current game state.
This image shows:
- The player's position (crosshair marker)
- Existing entities and their orientation
- Resources, water, and terrain features
- Spatial relationships between elements
- A legend showing the shapes and colours of each entity

Use this visual information to:
- Plan efficient factory layouts
- Verify entity placement
- Identify resource locations
- Guide navigation decisions
- Diagnose issues with automation

Correlate what you see in the image with the textual output from your code to make better decisions.
"""

VCS_INSTRUCTIONS = """
## Version Control
Your game state is automatically saved after each step. Use VCS directives as comments
at the START of your code:

- `# VCS:TAG:name` — Save a named checkpoint (before risky operations)
- `# VCS:UNDO` — Undo the last step, restoring previous game state
- `# VCS:RESTORE:name` — Restore a named checkpoint
- `# VCS:HISTORY` — Show recent commits

### Workflow
1. Tag before risky changes: `# VCS:TAG:before_belt_rework`
2. If it breaks, undo: `# VCS:UNDO`
3. Tag milestones: `# VCS:TAG:power_working`
"""


def render_map(instance, radius=20):
    """Render map around player, return base64 PNG or None."""
    try:
        ns = instance.namespaces[0]
        player_pos = Position(0, 0)
        if hasattr(ns, "PLAYER") and hasattr(ns.PLAYER, "position"):
            player_pos = ns.PLAYER.position
        elif hasattr(ns, "player_location"):
            player_pos = ns.player_location
        img = ns._render(position=player_pos, layers=Layer.ALL)
        return img.to_base64()
    except Exception as e:
        print(f"Warning: map render failed: {e}")
        return None


def parse_vcs_directives(code):
    """Extract # VCS: directives from code. Returns (directives, remaining_code)."""
    directives = []
    remaining = []
    for line in code.strip().split('\n'):
        stripped = line.strip()
        if stripped.startswith('# VCS:'):
            directives.append(stripped[6:])
        else:
            remaining.append(line)
    return directives, '\n'.join(remaining)


def _coerce_messages_to_text_only(messages):
    """Convert structured/multimodal chat content into plain strings."""
    coerced = []
    for msg in messages:
        content = msg.get("content")
        if isinstance(content, list):
            text_parts = []
            for part in content:
                if not isinstance(part, dict):
                    text_parts.append(str(part))
                    continue
                if part.get("type") == "text":
                    text_parts.append(str(part.get("text", "")))
                elif part.get("type") == "image_url":
                    text_parts.append("[Image attached]")
                else:
                    text_parts.append(str(part))
            coerced.append({**msg, "content": "\n".join(p for p in text_parts if p)})
        elif content is None:
            coerced.append({**msg, "content": ""})
        else:
            coerced.append({**msg, "content": str(content)})
    return coerced


def _should_use_text_only_messages(model: str, custom_api_enabled: bool) -> bool:
    """Providers like DeepSeek and some OpenAI-compatible endpoints reject image_url blocks."""
    if custom_api_enabled:
        return True
    return "deepseek" in (model or "").lower()


async def run(steps: int, broker_url: str, username: str):
    """Main agent loop: claim session, observe-think-act, release."""
    model = os.getenv("MODEL", DEFAULT_MODEL)
    server_host = os.getenv("SERVER_HOST", "localhost")
    forced_llm_provider = (os.getenv("FORCE_LLM_PROVIDER", "") or "").strip().lower() or None
    custom_api_enabled = forced_llm_provider == "custom" or os.getenv("CUSTOM_API", "").lower() in ("true", "1", "yes")
    text_only_messages = _should_use_text_only_messages(model, custom_api_enabled)
    forced_provider_config = None

    # If CUSTOM_API=true, register a "custom" provider using CUSTOM_API_URL and CUSTOM_API_KEY.
    # This lets you point at any OpenAI-compatible API (Groq, Ollama, vLLM, etc.)
    # without the model name needing to match a built-in provider.
    if custom_api_enabled:
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

    # Register "gpt" prefix so gpt-* models route to the openai provider
    # (APIFactory only matches provider keys as substrings of the model name)
    if "gpt" not in APIFactory.PROVIDERS:
        APIFactory.PROVIDERS["gpt"] = APIFactory.PROVIDERS["openai"]

    if forced_llm_provider == "custom":
        forced_provider_config = APIFactory.PROVIDERS.get("custom")
    elif forced_llm_provider == "anthropic":
        forced_provider_config = APIFactory.PROVIDERS.get("claude")
    elif forced_llm_provider == "openai":
        forced_provider_config = APIFactory.PROVIDERS.get("openai")
    elif forced_llm_provider:
        print(f"Warning: unknown FORCE_LLM_PROVIDER={forced_llm_provider!r}; falling back to model-based detection")

    if forced_llm_provider and not forced_provider_config:
        raise ValueError(f"FORCE_LLM_PROVIDER={forced_llm_provider} could not be resolved")
    if forced_provider_config:
        print(
            f"Forcing LLM provider to '{forced_llm_provider}' "
            f"(base_url={forced_provider_config.get('base_url')})"
        )
        APIFactory._get_provider_config = lambda self, m, cfg=forced_provider_config: cfg

    api_factory = APIFactory(model)

    # Patch acall retry: limit to 3 attempts and log errors instead of silent infinite retry
    from tenacity import stop_after_attempt, before_sleep_log  # noqa: E402
    api_factory.acall.retry.stop = stop_after_attempt(3)
    api_factory.acall.retry.before_sleep = before_sleep_log(logging.getLogger("acall"), logging.WARNING)

    formatter = RecursiveReportFormatter(
        chunk_size=16,
        llm_call=api_factory.acall,
    )

    print(f"Using model: {model}")

    session_id = None  # Only set in standalone (non-run) mode

    if RUN_ID:
        # Managed by broker — RCON_PORT is passed via env, no session claim needed
        rcon_port = int(os.environ["RCON_PORT"])
        print(f"Run mode (run_id={RUN_ID}), using RCON port {rcon_port}")
    else:
        # Standalone mode — claim a session from the broker
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

    # Resolve hostname to IP — factorio-rcon-py can fail with Docker hostnames
    # import socket
    # try:
    #     server_ip = socket.gethostbyname(server_host)
    #     print(f"Resolved {server_host} -> {server_ip}")
    # except socket.gaierror:
    #     server_ip = server_host
    #     print(f"DNS resolution failed for {server_host}, using as-is")
    server_ip = server_host
    # Dismiss Factorio's "achievements will be disabled" warning.
    # On a fresh save, the first /sc command triggers a warning and is NOT executed.
    # Sending it twice "confirms" and unlocks the Lua console for FLE.
    from factorio_rcon import RCONClient as _WarmupRCON
    from fle.cluster.run_envs import RCON_PASSWORD as _rcon_pw
    for attempt in range(3):
        try:
            _warmup = _WarmupRCON(server_ip, rcon_port, _rcon_pw)
            # send the same command twice to dismiss the achievements warning
            _warmup.send_command("/sc rcon.print('warmup')")
            _warmup.send_command("/sc rcon.print('warmup')")
            _warmup.close()
            print("RCON warmup OK (achievements warning dismissed)")
            break
        except Exception as e:
            print(f"RCON warmup attempt {attempt+1} failed: {e}")
            import time; time.sleep(2)

    # Patch: FLE's connect_to_server calls RCONClient(connect_on_init=True) then
    # immediately calls .connect() again, causing a double-connect that confuses
    # the RCON protocol state. Fix by defaulting connect_on_init to False.
    from factorio_rcon import RCONClient as _OrigRCON
    _orig_init = _OrigRCON.__init__
    def _patched_init(self, ip_address, port, password, timeout=None, connect_on_init=False):
        _orig_init(self, ip_address, port, password, timeout=timeout, connect_on_init=connect_on_init)
    _OrigRCON.__init__ = _patched_init
    print(f"Connecting to Factorio at {server_ip}:{rcon_port}...")
    instance = FactorioInstance(
        address=server_ip,
        tcp_port=rcon_port,
        fast=True,
        all_technologies_researched=False,
        clear_entities=False,
    )
    # Set non-agent players (stream client) to spectator mode
    instance.rcon_client.send_command(
        "/sc for _, p in pairs(game.players) do "
        "if not global.agent_characters then break end; "
        "local is_agent = false; "
        "for _, c in pairs(global.agent_characters) do "
        "if c.valid and c.associated_player == p then is_agent = true; break end "
        "end; "
        "if not is_agent then p.set_controller({type = defines.controllers.spectator}) end "
        "end"
    )

    # Remove enemies (global.remove_enemies doesn't exist on vanilla saves)
    instance.rcon_client.send_command(
        "/sc game.forces['enemy'].kill_all_units(); "
        "game.map_settings.enemy_expansion.enabled = false; "
        "game.map_settings.enemy_evolution.enabled = false; "
        "for _, e in pairs(game.surfaces[1].find_entities_filtered({type='unit-spawner'})) do e.destroy() end"
    )

    # Initialize version control for game state
    vcs_repo = FactorioMCPRepository(instance)

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
    system_prompt = (
        SYSTEM_PROMPT_PREAMBLE
        + VISUAL_INSTRUCTIONS
        + VCS_INSTRUCTIONS
        + "\n" + instance.get_system_prompt()
    )

    conversation = Conversation()
    conversation.set_system_message(system_prompt)
    last_result: str | None = None
    observation: Observation | None = None
    cumulative_score = 0.0
    consecutive_fle_errors = 0
    MAX_CONSECUTIVE_FLE_ERRORS = 5

    run_error: str | None = None
    try:
        # 3. Agent loop
        for step in range(1, steps + 1):
            print(f"\n{'='*60}")
            print(f"Step {step}/{steps}")
            print(f"{'='*60}")

            # ── Observe ──────────────────────────────────────────────
            # FLE/RCON calls are unstable: any call can return None or
            # raise when the Factorio server is unhealthy.  Wrap the
            # entire observe→think→act cycle so one bad step doesn't
            # kill the run.
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
                if RUN_ID:
                    report_step(broker_url, RUN_ID, step_idx=step,
                                code="# observation failed", result=str(obs_err),
                                error_occurred=True, production_score=cumulative_score)
                if consecutive_fle_errors >= MAX_CONSECUTIVE_FLE_ERRORS:
                    raise RuntimeError(f"Aborting: {MAX_CONSECUTIVE_FLE_ERRORS} consecutive FLE errors — Factorio server likely dead")
                import time; time.sleep(2)
                continue

            if last_result is not None:
                obs_text += f"\n\n## Result from previous step\n{last_result}\n"

            print(f"Score: {cumulative_score}")

            conversation.add_user_message(obs_text)

            # Format conversation (handles summarization of old messages)
            formatted = await formatter.format_conversation(conversation)
            messages = formatter.to_llm_messages(formatted)
            # Inject map rendering into the last user message (OpenAI image_url format
            # because acall uses AsyncOpenAI / chat.completions.create)
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

            total_chars = sum(len(m.get("content", "")) if isinstance(m.get("content"), str) else sum(len(b.get("text", "")) for b in m["content"] if b.get("type") == "text") for m in messages)
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

            # Extract code from response
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
                if RUN_ID:
                    report_step(
                        broker_url, RUN_ID, step_idx=step,
                        code=code,
                        result=last_result,
                        error_occurred=False,
                        reward=0,
                        production_score=cumulative_score,
                    )
                continue

            # If both directives and code, prepend VCS results to next observation
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
                if RUN_ID:
                    report_step(broker_url, RUN_ID, step_idx=step,
                                code=code, result=str(step_err),
                                error_occurred=True, production_score=cumulative_score)
                if consecutive_fle_errors >= MAX_CONSECUTIVE_FLE_ERRORS:
                    raise RuntimeError(f"Aborting: {MAX_CONSECUTIVE_FLE_ERRORS} consecutive FLE errors — Factorio server likely dead")
                import time; time.sleep(2)
                continue

            # Step succeeded — reset error counter
            consecutive_fle_errors = 0

            # Structured results from info dict
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

            # Prepend VCS results if any
            if vcs_results:
                last_result = "VCS: " + "; ".join(vcs_results) + "\n" + last_result

            # Auto-commit game state after each step
            try:
                gs = GameState.from_instance(instance)
                vcs_repo.commit(gs, f"Step {step}: {'ERR' if error_occurred else 'OK'} score={production_score}", policy=exec_code)
            except Exception as e:
                print(f"VCS commit warning: {e}")

            # Report step to broker if managed by a run
            if RUN_ID:
                report_step(
                    broker_url, RUN_ID, step_idx=step,
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
        # Report run completion to broker if managed by a run
        if RUN_ID:
            report_complete(
                broker_url, RUN_ID,
                final_score=cumulative_score if cumulative_score > 0 else None,
                status="failed" if run_error else "completed",
                error=run_error,
            )

        # 4. Release session (standalone mode only)
        if session_id:
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
