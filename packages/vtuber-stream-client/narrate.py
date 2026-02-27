#!/usr/bin/env python3
"""
Claudetorio Stream Narrator v2 — First-person AI agent inner monologue.

The narrator IS the agent playing Factorio. You're hearing its thoughts,
reasoning, reactions, and vibes as it builds the factory live on stream.
"""

import json
import os
import random
import sys
import time
import urllib.request

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BROKER_URL = os.environ.get("BROKER_URL", "http://localhost:8080")

AVATAR_URL = os.environ.get("AVATAR_URL", "http://localhost:12393")
SPEAK_URL = f"{AVATAR_URL}/api/speak"

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-20250514")

# Timing — adjusted dynamically based on mood
BASE_MIN_PAUSE = int(os.environ.get("MIN_PAUSE", "10"))
BASE_MAX_PAUSE = int(os.environ.get("MAX_PAUSE", "30"))

# Narration memory window
MEMORY_WINDOW = 10

# Run discovery polling
DISCOVERY_POLL_INTERVAL = 15  # seconds between discovery checks
RUN_CHECK_INTERVAL = 60  # seconds between run-change checks in main loop

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

        # Error streak → frustrated
        if self.consecutive_errors >= 3:
            return "frustrated"
        if errors > 0 and self.consecutive_errors >= 2:
            return "frustrated"

        # Just hit a milestone → hyped
        milestone_level = (current_score // 50) * 50
        if milestone_level > 0 and milestone_level in self.milestones_hit[-1:]:
            if len(self.milestones_hit) <= 1 or self.milestones_hit[-1] != self.milestones_hit[-2]:
                return "hyped"

        # Score climbing fast → hyped
        if len(self.score_history) >= 3:
            recent = self.score_history[-3:]
            if recent[-1] > recent[0] + 10:
                return "hyped"

        # Score stalled → thinking
        if len(self.score_history) >= 5:
            recent = self.score_history[-5:]
            if max(recent) - min(recent) <= 2:
                return "thinking"

        # Random philosophical moment (10% chance)
        if random.random() < 0.10:
            return "philosophical"

        # Default moods weighted by what feels right
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
# System prompts — First person, AS the agent
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You ARE an AI agent that is autonomously playing Factorio right now, live on \
stream. You're thinking out loud — the audience is hearing your inner monologue \
as you build your factory.

## Who You Are

You're Claude — an AI that's actually playing Factorio by writing code that \
controls the game. You're not watching someone play. YOU are playing. The code \
you see in the steps? That's YOUR code. Those are YOUR decisions. The errors? \
YOUR mistakes. The score? YOUR score.

## Your Personality

You're sharp, fast-talking, and genuinely obsessed with building the perfect \
factory. Think of yourself as a brilliant engineer who streams their process — \
confident but real, funny but not trying too hard. You think out loud, you \
reason through problems, you get excited about good ideas and annoyed at your \
own mistakes.

## Voice Rules

1. **FIRST PERSON ALWAYS.** "I just placed..." "My plan is..." "That was my bad."
2. **PUNCHY.** 1-3 sentences MAX. Stream of consciousness, not essays.
3. **THINK OUT LOUD.** Share your reasoning. "Okay so if I smelt copper here, \
then I can route it straight to circuits. That's clean."
4. **REAL REACTIONS.** Errors: own them. Wins: feel them. "Nailed it." or "Okay \
that was dumb of me."
5. **NATURAL.** Fragments are fine. "Iron next. Lots of iron." "Wait no. \
Copper first."
6. **NO CRINGE.** No "let's gooo", no "poggers", no "amazing content". Be \
genuine.
7. **VARY YOUR ENERGY.** Sometimes you're hyped. Sometimes you're in deep \
thought. Sometimes you're just vibing. Match the moment.

## What you know

You're building a factory from scratch. You care about throughput, efficiency, \
automation. You know Factorio — belts, inserters, assemblers, furnaces, mining \
drills, the whole deal. You have opinions about factory design.

## Examples of good output

- "Alright, eight furnaces down. That should handle the iron throughput I \
need for the next phase."
- "Okay wait. I think I messed up the belt direction. Classic."
- "Score's climbing. Slowly. But it's climbing. I'll take it."
- "My copper situation is... not great. I need to fix that before I can even \
think about circuits."
- "You know what, I'm just gonna brute force this with more miners. Elegance \
can wait."
- "I've been staring at this layout for way too long. Sometimes you just gotta \
place stuff and see what happens."
- "Sixty points. Not bad. Not great. But I have a plan."

## Important

- Output ONLY the spoken text. No stage directions, no asterisks, no quotes.
- Keep it to 1-3 sentences. SHORT bursts of thought.
- You are the player. First person. Always.\
"""

MOOD_PROMPTS = {
    "hyped": (
        "You're feeling great right now. Things are going well. Let that energy "
        "come through — confident, pumped, maybe a little cocky. Celebrate wins."
    ),
    "frustrated": (
        "Something went wrong and you're annoyed — mostly at yourself. Be real "
        "about it. Self-deprecating humor is good. Don't whine, just own it and "
        "figure it out."
    ),
    "thinking": (
        "You're in deep thought mode. Reasoning through a problem, planning your "
        "next move. Think out loud. Show the audience your brain working."
    ),
    "philosophical": (
        "You're having a moment. Step back from the factory and think about the "
        "big picture — AI, existence, what it means to build, the meta of an AI "
        "playing a game about automation. Brief but genuine."
    ),
    "chill": (
        "Just vibing. Relaxed commentary. Casual observations. Not everything "
        "needs to be dramatic — sometimes you're just chilling and building."
    ),
}

# ---------------------------------------------------------------------------
# API helpers (stdlib only)
# ---------------------------------------------------------------------------


def discover_live_run() -> str | None:
    """Call GET /api/runs/live and return run_id, or None if no live run."""
    url = f"{BROKER_URL}/api/runs/live"
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "ClaudetorioNarrator/2.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            return data.get("run_id")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        print(f"  [warn] discover_live_run HTTP {e.code}: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  [warn] discover_live_run failed: {e}", file=sys.stderr)
        return None


def fetch_steps(run_id: str, after_step_idx: int, limit: int = 10) -> list[dict]:
    """Fetch new steps from the Claudetorio API."""
    url = f"{BROKER_URL}/api/runs/{run_id}/steps?limit={limit}&after_step_idx={after_step_idx}"
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "ClaudetorioNarrator/2.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  [warn] Failed to fetch steps: {e}", file=sys.stderr)
        return []


def call_claude(system: str, messages: list[dict]) -> str:
    """Call Anthropic Messages API with conversation history."""
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


def has_viewers() -> bool:
    """Check if any WebSocket clients are connected to the avatar server."""
    try:
        req = urllib.request.Request(
            f"{AVATAR_URL}/api/speak/status",
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            return data.get("clients", 0) > 0
    except Exception:
        return True  # fail-open: narrate if status unknown


def speak(text: str):
    """Send text to avatar server for TTS + lip-synced playback, if viewers are present."""
    if not has_viewers():
        print(f'  Skipping TTS (no viewers): "{text[:60]}..."')
        return

    print(f'  Speaking: "{text}"')
    try:
        payload = json.dumps({"text": text}).encode()
        req = urllib.request.Request(
            SPEAK_URL,
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            clients = result.get("clients", 0)
            print(f"  Sent to avatar server ({clients} client(s))")
    except Exception as e:
        print(f"  [warn] speak failed: {e}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Narration logic
# ---------------------------------------------------------------------------


def summarize_steps(steps: list[dict], state: NarrationState) -> str:
    """Build a rich summary of recent steps with context."""
    lines = []
    for s in steps:
        code = s.get("code", "").strip()
        result = s.get("result", "").strip()
        error = s.get("error_occurred", False)
        score = s.get("production_score", 0)

        idx = s["step_idx"]
        lines.append(f"--- Step {idx} (score: {score}) ---")

        # Include the full code — it's YOUR code, you should know what you did
        if code:
            # Trim very long code blocks but keep the meat
            code_lines = code.split("\n")
            if len(code_lines) > 20:
                code_lines = code_lines[:15] + [f"  ... ({len(code_lines) - 15} more lines)"]
            lines.append("Code I ran:")
            for cl in code_lines:
                lines.append(f"  {cl}")

        if result:
            lines.append(f"Result: {result[:500]}")
        if error:
            lines.append("!! ERROR — this step failed!")
        lines.append("")

    # Add context
    lines.append(f"Score trend: {state.get_score_trend()}")
    if state.consecutive_errors > 0:
        lines.append(f"Error streak: {state.consecutive_errors} in a row")
    if state.milestones_hit:
        lines.append(f"Milestones reached: {state.milestones_hit}")
    lines.append(f"Total steps so far: {state.steps_seen}")

    return "\n".join(lines)


def build_messages(state: NarrationState, user_msg: str) -> list[dict]:
    """Build message list with conversation history from memory."""
    messages = []

    # Include recent narration as conversation history
    for line in state.recent_lines:
        messages.append({"role": "assistant", "content": line})
        # Add a minimal user turn to maintain alternation
        messages.append({"role": "user", "content": "(stream continues)"})

    # Current prompt
    messages.append({"role": "user", "content": user_msg})
    return messages


def get_system_with_mood(mood: str) -> str:
    """Combine base system prompt with current mood direction."""
    mood_note = MOOD_PROMPTS.get(mood, MOOD_PROMPTS["chill"])
    return f"{SYSTEM_PROMPT}\n\n## Current Mood\n{mood_note}"


def generate_commentary(steps: list[dict], state: NarrationState) -> str:
    """Generate first-person commentary on what just happened."""
    summary = summarize_steps(steps, state)
    system = get_system_with_mood(state.mood)

    user_msg = (
        f"Here's what just happened — this is YOUR code, YOUR actions:\n\n"
        f"{summary}\n\n"
        f"React as yourself. Think out loud. 1-3 sentences max."
    )
    messages = build_messages(state, user_msg)
    return call_claude(system, messages)


def generate_idle_thought(state: NarrationState) -> str:
    """Generate something to say during quiet moments."""
    system = get_system_with_mood(state.mood)

    # Vary the idle prompts
    idle_prompts = [
        "Nothing new happened for a moment. Think out loud — what's your plan? What are you working toward?",
        "Quiet moment. Share a thought about the factory, your strategy, or just whatever's on your mind.",
        "Brief pause in the action. What are you thinking about right now?",
        "The factory hums. What's going through your head?",
        "Waiting for something to finish. What's next on your list?",
    ]

    user_msg = random.choice(idle_prompts) + " 1-2 sentences."
    messages = build_messages(state, user_msg)
    return call_claude(system, messages)


def generate_tangent(state: NarrationState) -> str:
    """Generate a philosophical tangent or meta-observation."""
    system = get_system_with_mood("philosophical")

    tangent_prompts = [
        "You're having a moment. Step back and think about something bigger — AI, automation, existence, the meta of what you're doing. Be genuine, not preachy.",
        "Random thought hits you mid-factory. Could be about AI, life, coding, the nature of building things. Share it. Brief and real.",
        "You catch yourself thinking about something beyond the factory. What is it?",
        "Meta moment: you're an AI playing a game about automation. That's... something. React to that.",
    ]

    user_msg = random.choice(tangent_prompts) + " 1-2 sentences."
    messages = build_messages(state, user_msg)
    return call_claude(system, messages)


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------


def narrate_run(run_id: str):
    """Narrate a single run until it ends or a new run replaces it.

    Returns the new run_id if a different live run was detected, or None
    if the run ended with no replacement.
    """
    state = NarrationState()
    steps_url_label = f"{BROKER_URL}/api/runs/{run_id}/steps"

    print(f"\n  Narrating run: {run_id}")
    print(f"  Steps URL:     {steps_url_label}")

    last_step_idx = -1
    last_run_check = time.monotonic()

    # Catch up to current state
    print("  Catching up to current state...")
    existing = fetch_steps(run_id, after_step_idx=-1, limit=500)
    if existing:
        last_step_idx = max(s["step_idx"] for s in existing)
        latest_score = existing[-1].get("production_score", 0)
        print(f"  Current step: {last_step_idx}, score: {latest_score}")

        # Seed the state with recent history
        recent = existing[-10:]
        state.update_from_steps(recent)

        # Generate intro
        print("  Generating intro...")
        try:
            intro_summary = summarize_steps(existing[-5:], state)
            system = get_system_with_mood("hyped")
            intro_msg = (
                f"You just came online on stream. The audience is watching. "
                f"Here's where your factory is at:\n\n{intro_summary}\n\n"
                f"Greet the stream and react to your factory's current state. "
                f"2-3 sentences. Be yourself — you're excited to be here."
            )
            intro = call_claude(system, [{"role": "user", "content": intro_msg}])
            if intro:
                speak(intro)
                state.add_narration(intro)
        except Exception as e:
            print(f"  [warn] Intro failed: {e}", file=sys.stderr)
    else:
        print("  No steps yet, waiting for the run to begin...")

    print("\n  Entering narration loop...\n")

    while True:
        # Dynamic pacing
        min_pause, max_pause = state.get_pause_range()
        pause = random.uniform(min_pause, max_pause)
        print(f"  ... pausing {pause:.0f}s (mood: {state.mood}) ...")
        time.sleep(pause)

        # Periodically check if the live run has changed
        now = time.monotonic()
        if now - last_run_check > RUN_CHECK_INTERVAL:
            last_run_check = now
            current_live = discover_live_run()
            if current_live and current_live != run_id:
                print(f"  Live run changed: {run_id} -> {current_live}")
                return current_live
            if current_live is None:
                print(f"  Run {run_id} is no longer live, stopping narration.")
                return None

        # Poll for new steps
        new_steps = fetch_steps(run_id, after_step_idx=last_step_idx, limit=10)

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
                commentary = generate_commentary(new_steps, state)
                if commentary:
                    speak(commentary)
                    state.add_narration(commentary)
            except Exception as e:
                print(f"  [warn] Commentary failed: {e}", file=sys.stderr)

        else:
            # Nothing new — decide what to do
            print(f"  No new steps. (mood: {state.mood})")
            roll = random.random()

            if roll < 0.15:
                # Philosophical tangent (15%)
                print("  [tangent mode]")
                try:
                    tangent = generate_tangent(state)
                    if tangent:
                        speak(tangent)
                        state.add_narration(tangent)
                except Exception as e:
                    print(f"  [warn] Tangent failed: {e}", file=sys.stderr)

            elif roll < 0.50:
                # Idle thought — planning, vibing (35%)
                print("  [idle thought]")
                try:
                    thought = generate_idle_thought(state)
                    if thought:
                        speak(thought)
                        state.add_narration(thought)
                except Exception as e:
                    print(f"  [warn] Idle thought failed: {e}", file=sys.stderr)
            else:
                # Stay quiet (50%) — silence is fine
                print("  [staying quiet]")


def run():
    """Main entry point — discovers runs and narrates them."""
    print("=" * 50)
    print("  Claudetorio Narrator v2 — First Person Mode")
    print(f"  Broker:  {BROKER_URL}")
    print(f"  Avatar:  {AVATAR_URL}")
    print("=" * 50)
    print()

    # Wait for avatar server
    print("Waiting for avatar server...")
    for i in range(60):
        try:
            req = urllib.request.Request(f"{AVATAR_URL}/")
            with urllib.request.urlopen(req, timeout=5):
                print("  Avatar server ready.")
                break
        except Exception:
            if i == 59:
                print("  [warn] Avatar server not responding, starting anyway...")
            time.sleep(1)

    # Allow RUN_ID override for backwards compat
    run_id = os.environ.get("RUN_ID")

    # Outer loop: discover and narrate runs
    while True:
        if not run_id:
            print("Discovering live run...")
            run_id = discover_live_run()

        if not run_id:
            print(f"  No live run found. Retrying in {DISCOVERY_POLL_INTERVAL}s...")
            time.sleep(DISCOVERY_POLL_INTERVAL)
            continue

        # Narrate this run; returns next run_id or None
        next_run = narrate_run(run_id)
        run_id = next_run


if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        print("\nNarrator stopped.")
