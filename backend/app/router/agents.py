"""REST API for agent profiles."""

from fastapi import APIRouter, Depends

from app.domain.agent import AgentPool

router = APIRouter(prefix="/api/agents", tags=["agents"])


def get_agent_pool() -> AgentPool:
    from app.main import agent_pool
    return agent_pool


@router.get("")
async def list_agents(pool: AgentPool = Depends(get_agent_pool)):
    """List all available agents."""
    return {
        "agents": [
            {
                "id": a.id,
                "name": a.name,
                "role": a.role,
                "expertise": a.expertise,
                "personality": a.personality,
                "stance": a.stance,
                "avatar_emoji": a.avatar_emoji,
                "avatar_color": a.avatar_color,
            }
            for a in pool.agents
        ],
        "default_max_turns": pool.default_max_turns,
    }


@router.get("/{agent_id}")
async def get_agent(agent_id: str, pool: AgentPool = Depends(get_agent_pool)):
    """Get a specific agent profile."""
    agent = pool.get(agent_id)
    if not agent:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Agent not found")
    return {
        "id": agent.id,
        "name": agent.name,
        "role": agent.role,
        "expertise": agent.expertise,
        "personality": agent.personality,
        "stance": agent.stance,
        "avatar_emoji": agent.avatar_emoji,
        "avatar_color": agent.avatar_color,
        "system_prompt_preview": agent.system_prompt[:300] + "..." if len(agent.system_prompt) > 300 else agent.system_prompt,
    }
