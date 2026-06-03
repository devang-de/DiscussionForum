"""REST API for discussion sessions."""

from __future__ import annotations

import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession

from app.domain.agent import AgentPool
from app.domain.message import DiscussionMessage
from app.domain.session import SessionCreate
from app.service.discussion_engine import DiscussionEngine
from app.store.database import get_db
from app.websocket.manager import ConnectionManager

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

def get_engine() -> DiscussionEngine:
    """Dependency injection — to be configured at app startup."""
    from app.main import discussion_engine
    return discussion_engine


def get_agent_pool() -> AgentPool:
    from app.main import agent_pool
    return agent_pool


def get_ws_manager() -> ConnectionManager:
    from app.main import ws_manager
    return ws_manager


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("")
async def create_session(
    payload: SessionCreate,
    engine: DiscussionEngine = Depends(get_engine),
):
    """Create a new discussion session."""
    session = engine.create_session(
        topic=payload.topic,
        expectations=payload.expectations,
        max_rounds=payload.max_rounds,
        invited_agents=payload.invited_agents,
    )
    return {
        "session_id": session.id,
        "topic": session.topic,
        "state": session.state.value,
        "participants": [
            {"id": p.id, "name": p.name, "type": p.type, "avatar_url": p.avatar_url}
            for p in session.participants
        ],
    }


@router.get("")
async def list_sessions(
    db: DBSession = Depends(get_db),
):
    """List recent sessions."""
    from app.store.database import SessionModel
    sessions = db.query(SessionModel).order_by(
        SessionModel.created_at.desc()
    ).limit(20).all()
    return {
        "sessions": [
            {
                "id": s.id,
                "topic": s.topic,
                "state": s.state,
                "max_rounds": s.max_rounds,
                "created_at": s.created_at.isoformat() if s.created_at else "",
            }
            for s in sessions
        ],
    }


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    engine: DiscussionEngine = Depends(get_engine),
    db: DBSession = Depends(get_db),
):
    """Delete a discussion session and its stored data."""
    from app.store.database import SessionModel

    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    engine._cancel_flags[session_id] = True
    engine._active_sessions.pop(session_id, None)
    engine._opening_sent.pop(session_id, None)
    engine._cancel_flags.pop(session_id, None)

    db.delete(session)
    db.commit()
    return {"detail": "Session deleted"}


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    engine: DiscussionEngine = Depends(get_engine),
    db: DBSession = Depends(get_db),
):
    """Get session details with messages."""
    from app.service.coordinator import load_messages
    from app.store.database import ParticipantModel, SessionModel

    session = engine._active_sessions.get(session_id)
    messages = load_messages(db, session_id)

    if session:
        return {
            "id": session.id,
            "topic": session.topic,
            "scope": session.scope,
            "state": session.state.value,
            "participants": [
                {"id": p.id, "name": p.name, "type": p.type, "avatar_url": p.avatar_url,
                 "turns_used": p.turns_used, "max_turns": p.max_turns}
                for p in session.participants
            ],
            "turn_state": session.turn_state.model_dump(),
            "messages": [m.model_dump(mode="json") for m in messages],
            "summary": session.summary,
            "created_at": session.created_at.isoformat(),
        }

    session_model = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session_model:
        raise HTTPException(status_code=404, detail="Session not found")

    participants = db.query(ParticipantModel).filter(
        ParticipantModel.session_id == session_id
    ).all()

    return {
        "id": session_model.id,
        "topic": session_model.topic,
        "scope": session_model.scope,
        "state": session_model.state,
        "participants": [
            {"id": p.agent_id, "name": p.name, "type": p.type, "avatar_url": p.avatar_url,
             "turns_used": p.turns_used, "max_turns": p.max_turns}
            for p in participants
        ],
        "turn_state": {
            "current_speaker_id": session_model.current_speaker_id,
            "round_number": session_model.current_round,
            "total_messages": len(messages),
            "pending_reactions": {},
        },
        "messages": [m.model_dump(mode="json") for m in messages],
        "summary": session_model.summary,
        "created_at": session_model.created_at.isoformat(),
    }


@router.post("/{session_id}/scope")
async def start_scoping(
    session_id: str,
    engine: DiscussionEngine = Depends(get_engine),
):
    """Start the scoping phase — coordinator defines scope and selects agents."""
    session = engine._active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    async def event_stream():
        async for event in engine.start_scoping(session_id):
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/{session_id}/start")
async def start_discussion(
    session_id: str,
    engine: DiscussionEngine = Depends(get_engine),
):
    """Approve agent selection and start the discussion."""
    session = engine._active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    async def event_stream():
        async for event in engine.start_discussion(session_id):
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/{session_id}/message")
async def human_message(
    session_id: str,
    content: str = Query(..., min_length=1),
    engine: DiscussionEngine = Depends(get_engine),
):
    """Send a message as the human participant and continue the discussion."""
    session = engine._active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    async def event_stream():
        async for event in engine.human_input(session_id, content):
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------


@router.websocket("/{session_id}/ws")
async def session_websocket(
    websocket: WebSocket,
    session_id: str,
    ws_manager: ConnectionManager = Depends(get_ws_manager),
    engine: DiscussionEngine = Depends(get_engine),
):
    """Real-time WebSocket connection for a session."""
    await ws_manager.connect(session_id, websocket)

    # Register bus bridge to forward events to this WebSocket
    bus = engine.bus

    async def forward_to_ws(msg):
        await ws_manager.broadcast_to_session(
            session_id,
            {"type": "bus_event", "topic": msg.topic, "data": msg.content},
        )

    unsub = bus.subscribe(f"session.{session_id}.*", forward_to_ws)

    try:
        # Send initial state
        session = engine._active_sessions.get(session_id)
        if session:
            await ws_manager.send_to_connection(websocket, {
                "type": "session_state",
                "data": {
                    "id": session.id,
                    "topic": session.topic,
                    "state": session.state.value,
                },
            })

        # Keep connection alive
        while True:
            data = await websocket.receive_text()
            # Handle any client-to-server messages if needed
    except WebSocketDisconnect:
        pass
    finally:
        unsub()
        ws_manager.disconnect(session_id, websocket)
