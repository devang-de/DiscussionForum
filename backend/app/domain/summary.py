"""Discussion summary model."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class KeyPoint(BaseModel):
    """A key point extracted from the discussion."""
    text: str
    raised_by: str  # Agent name
    supported_by: List[str] = Field(default_factory=list)  # Who agreed
    opposed_by: List[str] = Field(default_factory=list)    # Who disagreed


class DiscussionSummary(BaseModel):
    """Coordinator's summary of the discussion."""
    session_id: str
    topic: str
    scope: Optional[str] = None
    key_points: List[KeyPoint] = Field(default_factory=list)
    consensus: Optional[str] = None       # Areas of agreement
    disagreements: Optional[str] = None   # Areas of disagreement
    conclusion: str = ""                   # Final synthesis
    next_steps: Optional[str] = None       # Suggested next steps
    participants: List[str] = Field(default_factory=list)  # Who participated
    message_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
