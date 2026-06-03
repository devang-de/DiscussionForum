"""SQLAlchemy database setup and ORM models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, relationship, sessionmaker

import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/discussion_forum.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all database tables."""
    Base.metadata.create_all(bind=engine)


# ---------------------------------------------------------------------------
# ORM Models
# ---------------------------------------------------------------------------

class SessionModel(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    topic = Column(String, nullable=False)
    scope = Column(Text, nullable=True)
    user_expectations = Column(Text, nullable=True)
    state = Column(String, default="created", index=True)
    summary = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    max_rounds = Column(Integer, default=3)
    current_round = Column(Integer, default=0)
    current_speaker_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    messages = relationship("MessageModel", back_populates="session", lazy="dynamic", cascade="all, delete-orphan")
    participants = relationship("ParticipantModel", back_populates="session", lazy="dynamic", cascade="all, delete-orphan")


class ParticipantModel(Base):
    __tablename__ = "participants"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    type = Column(String, default="agent")  # human, agent, coordinator
    avatar_url = Column(String, nullable=True)
    max_turns = Column(Integer, default=3)
    turns_used = Column(Integer, default=0)
    joined_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    session = relationship("SessionModel", back_populates="participants")


class MessageModel(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(String, nullable=False)
    sender_name = Column(String, nullable=False)
    sender_type = Column(String, default="agent")
    sender_avatar = Column(String, nullable=True)
    content = Column(Text, nullable=False)
    reply_to_id = Column(String, nullable=True)
    reply_to_sender = Column(String, nullable=True)
    msg_type = Column(String, default="text")
    is_final = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    session = relationship("SessionModel", back_populates="messages")
    reactions = relationship("ReactionModel", back_populates="message", lazy="dynamic", cascade="all, delete-orphan")


class ReactionModel(Base):
    __tablename__ = "reactions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    message_id = Column(String, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(String, nullable=False)
    sender_name = Column(String, nullable=False)
    emoji = Column(String, nullable=False)  # "👍" or "👎"

    message = relationship("MessageModel", back_populates="reactions")


class AgentProfileModel(Base):
    __tablename__ = "agent_profiles"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    expertise = Column(Text, default="[]")  # JSON list
    personality = Column(Text, default="")
    stance = Column(String, default="neutral")
    avatar_emoji = Column(String, default="🤖")
    avatar_color = Column(String, default="#6366f1")
    system_prompt = Column(Text, default="")
    can_moderate = Column(Boolean, default=False)
