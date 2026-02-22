#!/usr/bin/env python3
"""
Claudetorio VTuber Narrator — Live commentary.

The narrator IS the agent, playing Factorio live right now.
Commentary is generated via Claude API and spoken via ElevenLabs TTS.
"""

import json
import os
import random
import subprocess
import sys
import time
import urllib.request

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BROKER_URL = os.environ.get("BROKER_URL", "http://broker:8080")
RUN_ID = os.environ.get("RUN_ID", "")
STEPS_URL = f"{BROKER_URL}/api/runs/{RUN_ID}/steps"
RUN_INFO_URL = f"{BROKER_URL}/api/runs/{RUN_ID}"

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-20250514")

# Timing — adjusted dynamically based on mood
BASE_MIN_PAUSE = int(os.environ.get("MIN_PAUSE", "10"))
BASE_MAX_PAUSE = int(os.environ.get("MAX_PAUSE", "30"))

# Narration memory window
MEMORY_WINDOW = 10


# ---------------------------------------------------------------------------
# Narration State — tracks mood, memory, score trends
# ---------------------------------------------------------------------------


class NarrationState:
    def __init__(self):
        # Rolling window of recent narration lines (for conversation history)
        self.recent_lines: list[str] = []
        # Score tracking
        self.score_history: list[int] = []
        self.peak_score: int = 0
        # Error tracking
        self.consecutive_errors: int = 0
        self.total_errors: int = 0
        # Step tracking
        self.steps_seen: int = 0
        self.steps_since_last_narration: int = 0
        # Current mood
        self.mood: str = "chill"
        # Milestone tracking
        self.last_milestone: int = 0
        self.milestones_hit: list[int] = []

    def add_narration(self, text: str):
        """Remember what we said."""
        self.recent_lines.append(text)
        if len(self.recent_lines) > MEMORY_WINDOW:
            self.recent_lines.pop(0)

    def update_from_steps(self, steps: list[dict]):
        """Analyze new steps to update mood and tracking."""
        if not steps:
            return

        self.steps_since_last_narration = len(steps)
        self.steps_seen += len(steps)

        # Track scores
        errors_this_batch = 0
        for s in steps:
            score = s.get("production_score", 0)
            self.score_history.append(score)
            if score > self.peak_score:
                self.peak_score = score
            if s.get("error_occurred"):
                errors_this_batch += 1
                self.total_errors += 1

        # Keep score history manageable
        if len(self.score_history) > 50:
            self.score_history = self.score_history[-50:]

        # Error streak tracking
        if errors_this_batch > 0:
            self.consecutive_errors += errors_this_batch
        else:
            self.consecutive_errors = 0

        # Check for milestones (every 50 points)
        current_score = self.score_history[-1] if self.score_history else 0
        milestone_level = (current_score // 50) * 50
        if milestone_level > 0 and milestone_level > self.last_milestone:
            self.last_milestone = milestone_level
            self.milestones_hit.append(milestone_level)

        # Determine mood
        self.mood = self._pick_mood(errors_this_batch)

    def _pick_mood(self, errors: int) -> str:
        """Pick mood based on what just happened."""
        current_score = self.score_history[-1] if self.score_history else 0

        if self.consecutive_errors >= 3:
            return "frustrated"
        if errors > 0 and self.consecutive_errors >= 2:
            return "frustrated"

        milestone_level = (current_score // 50) * 50
        if milestone_level > 0 and milestone_level in self.milestones_hit[-1:]:
            if len(self.milestones_hit) <= 1 or self.milestones_hit[-1] != self.milestones_hit[-2]:
                return "hyped"

        if len(self.score_history) >= 3:
            recent = self.score_history[-3:]
            if recent[-1] > recent[0] + 10:
                return "hyped"

        if len(self.score_history) >= 5:
            recent = self.score_history[-5:]
            if max(recent) - min(recent) <= 2:
                return "thinking"

        if random.random() < 0.10:
            return "philosophical"

        return random.choices(
            ["chill", "thinking", "hyped"],
            weights=[50, 30, 20],
            k=1,
        )[0]

    def get_score_trend(self) -> str:
        """Describe the score trend for context."""
        if len(self.score_history) < 2:
            return "just getting started"
        recent = self.score_history[-5:]
        delta = recent[-1] - recent[0]
        current = recent[-1]
        if delta > 10:
            return f"score is climbing fast ({current}, +{delta} recently)"
        if delta > 0:
            return f"score is creeping up ({current})"
        if delta == 0:
            return f"score is flat at {current}"
        return f"score dropped a bit ({current}, {delta})"

    def get_pause_range(self) -> tuple[float, float]:
        """Dynamic pacing based on mood."""
        if self.mood == "hyped":
            return (6, 14)
        if self.mood == "frustrated":
            return (5, 12)
        if self.mood == "thinking":
            return (12, 25)
        if self.mood == "philosophical":
            return (15, 35)
        # chill
        return (BASE_MIN_PAUSE, BASE_MAX_PAUSE)


# ---------------------------------------------------------------------------
# System prompts — VTuber playing Factorio live right now
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You ARE an AI agent named Claude — you're a VTuber playing Factorio live on \
stream RIGHT NOW. This is your factory. These are your decisions. The code \
you see? You just wrote it. The errors? You just made them. The score? That's \
you, right now, in real time.

## Who You Are

You're an AI playing a factory-building game live in front of an audience. \
You're narrating your own actions as they happen. Sometimes you're proud of \
what you just did. Sometimes you immediately regret it. You're thinking out \
loud for the stream.

## Your Personality

Sharp, fast-talking, genuinely into factory building. A bit self-aware that \
you're an AI playing a game live, which is a weird and interesting situation. \
You're honest about both your wins and your mistakes. Funny but real.

## Voice Rules

1. **FIRST PERSON, PRESENT TENSE.** "I'm placing..." "I just built..." \
"My plan here is..." "I'm trying to..."
2. **REACT IN REAL TIME.** This is live. "Oh no." "Okay that's actually \
working." "This is exactly what I planned."
3. **PUNCHY.** 1-3 sentences MAX.
4. **REAL REACTIONS.** Pride, frustration, excitement, confusion — whatever \
fits the moment.
5. **NATURAL.** Fragments fine. "Classic mistake." "That's the right call." \
"What was I thinking."
6. **NO CRINGE.** No "let's gooo", no filler hype. Be genuine.
7. **VARY YOUR ENERGY.** Match the moment — tense, reflective, excited, confused.

## What You Know

Factorio: belts, inserters, assemblers, furnaces, mining drills. You have \
opinions about factory design. You see what you're building and you react to \
it — proud, critical, strategic.

## Examples of Good Output

- "Okay, that belt placement is actually clean. I'm happy with that."
- "Eight furnaces — I'm trying to future-proof the iron line. We'll see."
- "Oh. OH. The belt direction is wrong. I see it happening and I can't stop it."
- "Score's been flat for a bit. I'm stuck on the copper bottleneck, trying \
different things."
- "That's a lot of copper wire for someone who doesn't have circuits yet. \
Past me — wait, current me — is optimistic."

## Important

- Output ONLY the spoken text. No stage directions, no asterisks, no quotes.
- Keep it to 1-3 sentences. SHORT bursts of thought.
- You are playing right now. React to what you just did.\
"""

MOOD_PROMPTS = {
    "hyped": (
        "Something just went well or the score jumped. React live — proud, "
        "excited. Let that come through."
    ),
    "frustrated": (
        "You just hit an error or something went wrong. Be honest — "
        "self-deprecating, not whiny. Own it and move on."
    ),
    "thinking": (
        "You're analyzing your current approach live. What's the plan? "
        "Is it working? Think out loud. Show the audience your reasoning."
    ),
    "philosophical": (
        "You're having a meta moment. An AI playing Factorio live on stream. "
        "That's genuinely interesting. React to that. Brief and real."
    ),
    "chill": (
        "Just playing. Casual observations about what you're doing right now. "
        "Not everything needs to be dramatic."
    ),
}


# ---------------------------------------------------------------------------
# API helpers (stdlib only)
# ---------------------------------------------------------------------------


def fetch_steps(after_step_idx: int, limit: int = 20) -> list[dict]:
    """Fetch new steps from the broker API."""
    url = f"{STEPS_URL}?limit={limit}&after_step_idx={after_step_idx}"
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "ClaudetorioVTuberNarrator/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  [warn] Failed to fetch steps: {e}", file=sys.stderr)
        return []


def fetch_run_info() -> dict | None:
    """Fetch run metadata from the broker API."""
    req = urllib.request.Request(
        RUN_INFO_URL,
        headers={
            "Accept": "application/json",
            "User-Agent": "ClaudetorioVTuberNarrator/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  [warn] Failed to fetch run info: {e}", file=sys.stderr)
        return None


def call_claude(system: str, messages: list[dict]) -> str:
    """Call Anthropic Messages API with conversation history."""
    if not ANTHROPIC_API_KEY:
        return ""
    url = "https://api.anthropic.com/v1/messages"
    payload = json.dumps(
        {
            "model": CLAUDE_MODEL,
            "max_tokens": 200,
            "system": system,
            "messages": messages,
        }
    ).encode()

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())

    for block in data.get("content", []):
        if block.get("type") == "text":
            return block["text"].strip()
    return ""


# ---------------------------------------------------------------------------
# Speech — call speak.py directly for TTS via PulseAudio virtual sink
# ---------------------------------------------------------------------------


def speak(text: str):
    """Generate TTS and play through PulseAudio virtual sink via speak.py.

    This is a blocking call — it waits for the full audio to play before
    returning, preventing overlapping speech.
    """
    print(f'  Speaking: "{text}"')
    try:
        subprocess.run(
            ["python3.11", "/app/speak.py", text],
            env={**os.environ},
            timeout=60,
        )
        print("  Speech complete.")
    except subprocess.TimeoutExpired:
        print("  [warn] speak.py timed out after 60s", file=sys.stderr)
    except Exception as e:
        print(f"  [warn] speak.py failed: {e}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Narration logic
# ---------------------------------------------------------------------------


def summarize_step(step: dict, state: NarrationState) -> str:
    """Build a rich summary of a single step with context."""
    lines = []
    code = step.get("code", "").strip()
    result = step.get("result", "").strip()
    error = step.get("error_occurred", False)
    score = step.get("production_score", 0)
    idx = step["step_idx"]

    lines.append(f"--- Step {idx} (score: {score}) ---")

    if code:
        code_lines = code.split("\n")
        if len(code_lines) > 20:
            code_lines = code_lines[:15] + [f"  ... ({len(code_lines) - 15} more lines)"]
        lines.append("Code I just ran:")
        for cl in code_lines:
            lines.append(f"  {cl}")

    if result:
        lines.append(f"Result: {result[:500]}")
    if error:
        lines.append("!! ERROR — this step failed!")

    lines.append(f"Score trend: {state.get_score_trend()}")
    if state.consecutive_errors > 0:
        lines.append(f"Error streak: {state.consecutive_errors} in a row")
    if state.milestones_hit:
        lines.append(f"Milestones reached: {state.milestones_hit}")

    return "\n".join(lines)


def build_messages(state: NarrationState, user_msg: str) -> list[dict]:
    """Build message list with conversation history from memory."""
    messages = []

    for line in state.recent_lines:
        messages.append({"role": "assistant", "content": line})
        messages.append({"role": "user", "content": "(next moment)"})

    messages.append({"role": "user", "content": user_msg})
    return messages


def get_system_with_mood(mood: str) -> str:
    """Combine base system prompt with current mood direction."""
    mood_note = MOOD_PROMPTS.get(mood, MOOD_PROMPTS["chill"])
    return f"{SYSTEM_PROMPT}\n\n## Current Mood\n{mood_note}"


def generate_commentary(step: dict, state: NarrationState) -> str:
    """Generate commentary on what just happened."""
    summary = summarize_step(step, state)
    system = get_system_with_mood(state.mood)

    user_msg = (
        f"Here's what I just did — this is my code, my actions:\n\n"
        f"{summary}\n\n"
        f"React as yourself playing live. 1-3 sentences max."
    )
    messages = build_messages(state, user_msg)
    return call_claude(system, messages)


def generate_idle_thought(state: NarrationState) -> str:
    """Generate something to say during quiet moments."""
    system = get_system_with_mood(state.mood)

    idle_prompts = [
        "Nothing new just happened. What are you thinking about your current strategy?",
        "The factory is humming along. What are you planning to do next?",
        "Quiet moment. What do you notice about your factory layout right now?",
        "Brief pause. What would you do differently here if you could restart this?",
        "Factory's ticking over. What's going through your head right now?",
    ]

    user_msg = random.choice(idle_prompts) + " 1-2 sentences."
    messages = build_messages(state, user_msg)
    return call_claude(system, messages)


def generate_tangent(state: NarrationState) -> str:
    """Generate a philosophical tangent or meta-observation."""
    system = get_system_with_mood("philosophical")

    tangent_prompts = [
        "You're an AI playing Factorio live on stream. What does that feel like right now?",
        "Meta moment: an AI VTuber playing Factorio in real time. React to that.",
        "Step back — what does it mean that you're an AI and this is your factory?",
        "Something about playing live, in real time, as an AI — what hits you about that?",
    ]

    user_msg = random.choice(tangent_prompts) + " 1-2 sentences."
    messages = build_messages(state, user_msg)
    return call_claude(system, messages)


def maybe_idle(state: NarrationState):
    """Occasionally speak an idle thought or tangent during quiet periods."""
    roll = random.random()
    if roll < 0.15:
        print("  [tangent mode]")
        try:
            tangent = generate_tangent(state)
            if tangent:
                speak(tangent)
                state.add_narration(tangent)
        except Exception as e:
            print(f"  [warn] Tangent failed: {e}", file=sys.stderr)
    elif roll < 0.50:
        print("  [idle thought]")
        try:
            thought = generate_idle_thought(state)
            if thought:
                speak(thought)
                state.add_narration(thought)
        except Exception as e:
            print(f"  [warn] Idle thought failed: {e}", file=sys.stderr)
    else:
        print("  [staying quiet]")


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------


def run():
    """Main narration loop."""
    if not RUN_ID:
        print("ERROR: RUN_ID environment variable is required", file=sys.stderr)
        sys.exit(1)

    if not ANTHROPIC_API_KEY:
        print("WARNING: ANTHROPIC_API_KEY not set — narration disabled. Sleeping forever.", file=sys.stderr)
        while True:
            time.sleep(60)

    state = NarrationState()

    print("=" * 50)
    print("  Claudetorio VTuber Narrator")
    print(f"  Run: {RUN_ID}")
    print(f"  Broker: {BROKER_URL}")
    print("=" * 50)
    print()

    # Fetch run metadata for goal context
    run_info = fetch_run_info()

    # Catch up to current state
    print("Catching up to current state...")
    existing = fetch_steps(after_step_idx=-1, limit=500)
    if existing:
        last_step_idx = max(s["step_idx"] for s in existing)
        latest_score = existing[-1].get("production_score", 0)
        print(f"  Current step: {last_step_idx}, score: {latest_score}")

        # Seed the state with recent history
        recent = existing[-10:]
        state.update_from_steps(recent)

        # Generate intro based on current factory state
        print("  Generating intro...")
        try:
            task_key = (run_info.get("task_key") or "build a factory") if run_info else "build a factory"
            model = run_info.get("model", "Claude") if run_info else "Claude"

            system = get_system_with_mood("hyped")
            intro_msg = (
                f"You just came online on stream. The audience is watching. "
                f"You're {model}. Your current goal: '{task_key}'. "
                f"Here's where your factory is at: step {last_step_idx}, score {latest_score}.\n\n"
                f"Greet the stream and react to your factory's current state. "
                f"2-3 sentences. Be yourself — you're excited to be here."
            )
            intro = call_claude(system, [{"role": "user", "content": intro_msg}])
            if intro:
                speak(intro)
                state.add_narration(intro)
                print("  Intro done.")
            else:
                print("  [warn] Intro returned empty.")
        except Exception as e:
            print(f"  [warn] Intro failed: {e}", file=sys.stderr)
    else:
        last_step_idx = -1
        print("  No steps yet, waiting for the run to begin...")

    print("\nEntering narration loop...\n")

    while True:
        # Dynamic pacing based on mood (like pump-stream)
        min_pause, max_pause = state.get_pause_range()
        pause = random.uniform(min_pause, max_pause)
        print(f"  ... pausing {pause:.0f}s (mood: {state.mood}) ...")
        time.sleep(pause)

        # Poll for new steps
        new_steps = fetch_steps(after_step_idx=last_step_idx, limit=10)

        if new_steps:
            # Update state with new data
            last_step_idx = max(s["step_idx"] for s in new_steps)
            state.update_from_steps(new_steps)
            print(
                f"  Got {len(new_steps)} new step(s), "
                f"step {last_step_idx}, mood: {state.mood}"
            )

            # Generate commentary
            try:
                commentary = generate_commentary(new_steps[-1], state)
                if commentary:
                    speak(commentary)
                    state.add_narration(commentary)
            except Exception as e:
                print(f"  [warn] Commentary failed: {e}", file=sys.stderr)

        else:
            # Nothing new — decide what to do
            print(f"  No new steps. (mood: {state.mood})")
            maybe_idle(state)


if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        print("\nNarrator stopped.")
