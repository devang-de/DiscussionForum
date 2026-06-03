"""Load agent profiles from JSON."""

import json
import os
from pathlib import Path

from app.domain.agent import AgentPool, AgentProfile


def load_agent_pool() -> AgentPool:
    """Load all agent profiles from agents.json."""
    data_path = Path(__file__).parent / "agents.json"
    if not data_path.exists():
        return AgentPool()

    with open(data_path) as f:
        agents_data = json.load(f)

    agents = []
    for item in agents_data:
        agents.append(AgentProfile(
            id=item["id"],
            name=item["name"],
            role=item["role"],
            expertise=item.get("expertise", []),
            personality=item.get("personality", ""),
            stance=item.get("stance", "neutral"),
            avatar_emoji=item.get("avatar_emoji", "🤖"),
            avatar_color=item.get("avatar_color", "#6366f1"),
            system_prompt=item.get("system_prompt", ""),
            can_moderate=item.get("can_moderate", False),
        ))

    return AgentPool(agents=agents)
