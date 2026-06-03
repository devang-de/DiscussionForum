"""Discussion session domain model."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SessionState(str, Enum):
    CREATED = "created"           # Just created, coordinator hasn't started
    SCOPING = "scoping"           # Coordinator is defining scope & selecting agents
    AWAITING_APPROVAL = "awaiting_approval"  # Showing selected agents to user
    IN_PROGRESS = "in_progress"   # Discussion is active
    PAUSED = "paused"             # Human intervened, waiting
    SUMMARIZING = "summarizing"   # Coordinator writing summary
    COMPLETED = "completed"       # Done


class Participant(BaseModel):
    """A participant in the discussion (human or agent)."""
    id: str
    name: str
    type: str = "agent"  # "human" | "agent" | "coordinator"
    avatar_url: Optional[str] = None
    max_turns: int = 3
    turns_used: int = 0
    joined_at: datetime = Field(default_factory=datetime.utcnow)


class TurnState(BaseModel):
    """Current turn state of the discussion."""
    current_speaker_id: Optional[str] = None
    round_number: int = 0
    total_messages: int = 0
    pending_reactions: Dict[str, List[str]] = Field(default_factory=dict)  # msg_id -> [agent_ids who should react]


class Session(BaseModel):
    """A multi-agent discussion session."""
    id: str
    topic: str
    scope: Optional[str] = None  # Coordinator-defined scope
    user_expectations: Optional[str] = None  # What the user wants from the discussion
    state: SessionState = SessionState.CREATED
    participants: List[Participant] = Field(default_factory=list)
    turn_state: TurnState = Field(default_factory=TurnState)
    messages: List[Any] = Field(default_factory=list)  # List of DiscussionMessage
    summary: Optional[str] = None
    error: Optional[str] = None
    max_rounds: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SessionCreate(BaseModel):
    """Payload for creating a new discussion session."""
    topic: str
    expectations: Optional[str] = None  # Optional user-defined expectations
    max_rounds: Optional[int] = None
    invited_agents: Optional[List[str]] = None  # User can optionally specify agents
