#!/usr/bin/env python3
"""
Claudetorio VTuber Narrator — First-person AI agent inner monologue.

Adapted from claudetorio-pump-stream/narrate.py.
Polls the broker for replay steps and narrates as the agent playing Factorio.
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
RUN_ID = os.environ["RUN_ID"]
STEPS_URL = f"{BROKER_URL}/api/runs/{RUN_ID}/steps"

AVATAR_URL = os.environ.get("AVATAR_URL", "http://localhost:12393")
SPEAK_URL = f"{AVATAR_URL}/api/speak"

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
CLAUDE_MODEL = os.environ.get("COMMENTARY_MODEL", "claude-haiku-4-5-20251001")

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

        errors_this_batch = 0
        for s in steps:
            score = s.get("production_score", 0)
            self.score_history.append(score)
            if score > self.peak_score:
                self.peak_score = score
            if s.get("error_occurred"):
                errors_this_batch += 1
                self.total_errors += 1

        if len(self.score_history) > 50:
            self.score_history = self.score_history[-50:]

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
# API helpers (stdlib only — no external dependencies)
# ---------------------------------------------------------------------------


def fetch_steps(after_step_idx: int, limit: int = 10) -> list[dict]:
    """Fetch new steps from the broker API (no auth required)."""
    url = f"{STEPS_URL}?limit={limit}&after_step_idx={after_step_idx}"
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "ClaudetorioVTuber/1.0",
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


def speak(text: str):
    """TTS playback. Tries the avatar server first (lip-synced); falls back to speak.py."""
    print(f'  Speaking: "{text}"')

    # Try avatar server (lip-synced TTS — requires claudetorio-stream-avatar fork)
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
        return
    except Exception as e:
        print(f"  [info] Avatar TTS unavailable ({e}), trying ElevenLabs fallback", file=sys.stderr)

    # Fallback: ElevenLabs → PulseAudio via speak.py (audio captured by FFmpeg)
    if not ELEVENLABS_API_KEY:
        print("  [warn] No ELEVENLABS_API_KEY, skipping TTS", file=sys.stderr)
        return
    try:
        subprocess.run(
            ["python3", "/app/speak.py", text],
            timeout=90,
            check=True,
        )
    except Exception as e:
        print(f"  [warn] speak.py fallback failed: {e}", file=sys.stderr)


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

        if code:
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
    for line in state.recent_lines:
        messages.append({"role": "assistant", "content": line})
        messages.append({"role": "user", "content": "(stream continues)"})
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


def run():
    """Main narration loop."""
    state = NarrationState()

    print("=" * 50)
    print("  Claudetorio VTuber Narrator")
    print(f"  RUN_ID:  {RUN_ID}")
    print(f"  Broker:  {BROKER_URL}")
    print(f"  Avatar:  {AVATAR_URL}")
    print(f"  Model:   {CLAUDE_MODEL}")
    print("=" * 50)
    print()

    # Wait for avatar server (entrypoint already waits, but safety net here too)
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

    last_step_idx = -1

    # Catch up to current state (replay may already have steps)
    print("Catching up to current state...")
    existing = fetch_steps(after_step_idx=-1, limit=500)
    if existing:
        last_step_idx = max(s["step_idx"] for s in existing)
        latest_score = existing[-1].get("production_score", 0)
        print(f"  Current step: {last_step_idx}, score: {latest_score}")

        recent = existing[-10:]
        state.update_from_steps(recent)

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
        print("  No steps yet, waiting for the replay to begin...")

    print("\nEntering narration loop...\n")

    while True:
        min_pause, max_pause = state.get_pause_range()
        pause = random.uniform(min_pause, max_pause)
        print(f"  ... pausing {pause:.0f}s (mood: {state.mood}) ...")
        time.sleep(pause)

        new_steps = fetch_steps(after_step_idx=last_step_idx, limit=10)

        if new_steps:
            last_step_idx = max(s["step_idx"] for s in new_steps)
            state.update_from_steps(new_steps)
            print(
                f"  Got {len(new_steps)} new step(s), "
                f"step {last_step_idx}, mood: {state.mood}"
            )

            try:
                commentary = generate_commentary(new_steps, state)
                if commentary:
                    speak(commentary)
                    state.add_narration(commentary)
            except Exception as e:
                print(f"  [warn] Commentary failed: {e}", file=sys.stderr)

        else:
            print(f"  No new steps. (mood: {state.mood})")
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


if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        print("\nNarrator stopped.")
