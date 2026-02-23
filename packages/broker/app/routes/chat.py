from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies import get_db
from ..models import ChatMessage
from ..schemas import ChatMessageCreate, ChatMessageResponse
from ..services.chat import get_ai_reply

router = APIRouter()


@router.get("/api/chat/{stream_id}/messages", response_model=List[ChatMessageResponse])
async def get_messages(
    stream_id: str,
    after_id: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.stream_id == stream_id, ChatMessage.id > after_id)
        .order_by(ChatMessage.id)
        .limit(limit)
    )
    return result.scalars().all()


@router.post("/api/chat/{stream_id}/messages", response_model=List[ChatMessageResponse])
async def send_message(
    stream_id: str,
    body: ChatMessageCreate,
    db: AsyncSession = Depends(get_db),
):
    # Store user message
    user_msg = ChatMessage(
        stream_id=stream_id,
        username=body.username,
        content=body.content,
        is_ai=False,
    )
    db.add(user_msg)
    await db.flush()

    # Fetch recent chat history for context
    history_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.stream_id == stream_id)
        .order_by(ChatMessage.id.desc())
        .limit(20)
    )
    history_rows = list(reversed(history_result.scalars().all()))
    chat_history = [
        {"username": m.username, "content": m.content, "is_ai": m.is_ai}
        for m in history_rows
    ]

    # Get AI reply
    ai_text = await get_ai_reply(db, stream_id, body.username, body.content, chat_history)

    ai_msg = ChatMessage(
        stream_id=stream_id,
        username="Claudetorio",
        content=ai_text,
        is_ai=True,
    )
    db.add(ai_msg)
    await db.commit()

    # Refresh to get server-generated fields
    await db.refresh(user_msg)
    await db.refresh(ai_msg)

    return [user_msg, ai_msg]
