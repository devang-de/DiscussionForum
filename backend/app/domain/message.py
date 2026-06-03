"""Discussion message and reaction models."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class MessageType(str, Enum):
    TEXT = "text"
    SYSTEM = "system"       # Coordinator announcements
    TURN_ANNOUNCE = "turn_announce"  # "It's now X's turn"


class MessageSender(str, Enum):
    HUMAN = "human"
    AGENT = "agent"
    COORDINATOR = "coordinator"
    SYSTEM = "system"


class Reaction(BaseModel):
    """A reaction (👍/👎/etc) on a message."""
    id: str
    message_id: str
    sender_id: str
    sender_name: str
    emoji: str  # "👍" or "👎"


class DiscussionMessage(BaseModel):
    """A single message in the discussion."""
    id: str
    session_id: str
    sender_id: str                  # Agent ID, "human", or "coordinator"
    sender_name: str                # Display name
    sender_type: MessageSender = MessageSender.AGENT
    sender_avatar: Optional[str] = None  # Emoji or URL
    content: str                    # Markdown text
    reply_to_id: Optional[str] = None   # Replying to a specific message
    reply_to_sender: Optional[str] = None  # "@AgentName"
    msg_type: MessageType = MessageType.TEXT
    reactions: List[Reaction] = Field(default_factory=list)
    is_final: bool = False           # Is this the final summary?
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ReactionRequest(BaseModel):
    """Request to add a reaction to a message."""
    message_id: str
    emoji: str  # "👍" or "👎"
