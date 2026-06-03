"""Multi-Agent Discussion Forum — FastAPI Application.

Start with:
    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from app.core.bus import MessageBus
from app.core.llm import LLMClient
from app.data import load_agent_pool
from app.domain.agent import AgentPool
from app.service.discussion_engine import DiscussionEngine
from app.store.database import SessionLocal, init_db
from app.websocket.manager import ConnectionManager

# ---------------------------------------------------------------------------
# Global singletons
# ---------------------------------------------------------------------------
bus = MessageBus()
llm = LLMClient()
agent_pool: AgentPool = load_agent_pool()
ws_manager = ConnectionManager()

discussion_engine = DiscussionEngine(
    bus=bus,
    llm=llm,
    agent_pool=agent_pool,
    db_session_factory=SessionLocal,
)


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    print(f"✅ Loaded {len(agent_pool.agents)} agents: {[a.name for a in agent_pool.agents]}")
    print(f"✅ LLM configured: {llm.is_configured}")
    print(f"✅ Bus ready, WebSocket manager ready")
    yield
    # Shutdown
    print("👋 Shutting down")


app = FastAPI(
    title="Multi-Agent Discussion Forum",
    description="A platform for structured multi-agent discussions with human participation",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow local dev + deployed frontend (set FRONTEND_URL env var)
frontend_url = os.getenv("FRONTEND_URL", "")
allowed_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
if frontend_url:
    allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
from app.router.sessions import router as sessions_router
from app.router.agents import router as agents_router

app.include_router(sessions_router)
app.include_router(agents_router)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "agents_loaded": len(agent_pool.agents),
        "llm_configured": llm.is_configured,
        "active_sessions": len(discussion_engine._active_sessions),
    }
