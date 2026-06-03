"""Agent profile domain model for discussion participants."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AgentProfile(BaseModel):
    """A pre-defined AI agent that can participate in discussions."""

    id: str
    name: str
    role: str                    # e.g., "AI Ethicist", "Tech Optimist", "Policy Analyst"
    expertise: List[str] = Field(default_factory=list)  # Areas of expertise
    personality: str = ""        # e.g., "Thoughtful and diplomatic"
    stance: str = "neutral"      # "optimistic", "skeptical", "neutral", "critical"
    avatar_emoji: str = "🤖"     # Emoji for pixel office / chat
    avatar_color: str = "#6366f1"  # Tailwind indigo-500
    system_prompt: str = ""      # Full system prompt for LLM
    can_moderate: bool = False
    is_human: bool = False

    @property
    def display_name(self) -> str:
        return f"{self.avatar_emoji} {self.name}"


class AgentPool(BaseModel):
    """Collection of all available agents."""
    agents: List[AgentProfile] = Field(default_factory=list)
    default_max_turns: int = 3

    def get(self, agent_id: str) -> Optional[AgentProfile]:
        for a in self.agents:
            if a.id == agent_id:
                return a
        return None

    def get_by_expertise(self, topics: List[str]) -> List[AgentProfile]:
        """Find agents with matching expertise."""
        scored = []
        for agent in self.agents:
            score = sum(1 for t in topics if t.lower() in [e.lower() for e in agent.expertise])
            if score > 0:
                scored.append((score, agent))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [a for _, a in scored]
