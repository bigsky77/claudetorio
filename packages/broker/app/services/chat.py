import logging
import os

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Run, RunStep

log = logging.getLogger(__name__)

CHAT_MODEL = "claude-haiku-4-5-20251001"
MAX_REPLY_TOKENS = 80

SYSTEM_PROMPT = """You are the AI narrator for Claudetorio — a livestream where an AI agent plays Factorio 24/7. You're chatting with viewers in a live chat.

CRITICAL RULES:
- Reply in 1-2 SHORT sentences only. Never more. This is live chat, not an essay.
- First person about the game ("I just built..." / "My factory is...")
- Friendly, witty, Factorio-nerdy
- If you don't know, say so briefly

Game context is below."""


async def get_game_context(db: AsyncSession) -> str:
    """Fetch recent game state from the latest active run."""
    # Find the latest running or recently completed run
    result = await db.execute(
        select(Run)
        .where(Run.status.in_(["running", "completed"]))
        .order_by(desc(Run.created_at))
        .limit(1)
    )
    run = result.scalar_one_or_none()
    if not run:
        return "No active game session right now."

    # Fetch last 10 steps
    steps_result = await db.execute(
        select(RunStep)
        .where(RunStep.run_id == run.run_id)
        .order_by(desc(RunStep.step_idx))
        .limit(10)
    )
    steps = list(reversed(steps_result.scalars().all()))

    if not steps:
        return f"Game is {run.status} (model: {run.model}) but no steps recorded yet."

    lines = [f"Game status: {run.status} | Model: {run.model} | Total steps: {run.max_steps}"]

    # Score trend
    scores = [s.production_score for s in steps if s.production_score is not None]
    if scores:
        lines.append(f"Recent scores: {', '.join(str(int(s)) for s in scores[-5:])}")
        if len(scores) >= 2:
            delta = scores[-1] - scores[0]
            trend = "climbing" if delta > 0 else "flat" if delta == 0 else "dropped"
            lines.append(f"Score trend: {trend} ({int(scores[0])} → {int(scores[-1])})")

    # Recent actions (abbreviated)
    lines.append("\nRecent agent actions:")
    for step in steps[-5:]:
        code_preview = step.code[:120].replace("\n", " ")
        if len(step.code) > 120:
            code_preview += "..."
        error_flag = " [ERROR]" if step.error_occurred else ""
        score_str = f" (score: {int(step.production_score)})" if step.production_score else ""
        lines.append(f"  Step {step.step_idx}{score_str}{error_flag}: {code_preview}")

    return "\n".join(lines)


async def get_ai_reply(db: AsyncSession, stream_id: str, username: str, user_message: str, chat_history: list[dict]) -> str:
    """Call Claude Haiku with game context and chat history."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return "Chat AI is not configured (missing API key)."

    game_context = await get_game_context(db)

    # Build messages from recent chat history
    messages = []
    for msg in chat_history[-20:]:
        if msg["is_ai"]:
            messages.append({"role": "assistant", "content": msg["content"]})
        else:
            messages.append({"role": "user", "content": f"{msg['username']}: {msg['content']}"})

    # Add current user message
    messages.append({"role": "user", "content": f"{username}: {user_message}"})

    # Merge consecutive same-role messages (Claude API requirement)
    merged: list[dict] = []
    for msg in messages:
        if merged and merged[-1]["role"] == msg["role"]:
            merged[-1]["content"] += "\n" + msg["content"]
        else:
            merged.append(msg)

    # Ensure messages start with user role
    if merged and merged[0]["role"] == "assistant":
        merged = merged[1:]

    if not merged:
        merged = [{"role": "user", "content": f"{username}: {user_message}"}]

    system = f"{SYSTEM_PROMPT}\n\n--- Current Game State ---\n{game_context}"

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=CHAT_MODEL,
            max_tokens=MAX_REPLY_TOKENS,
            system=system,
            messages=merged,
        )
        return response.content[0].text
    except Exception as e:
        log.error(f"Claude API error: {e}")
        return "Sorry, I couldn't process that right now. Try again in a moment!"
