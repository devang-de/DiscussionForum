"""Coordinator — the brain that orchestrates spontaneous multi-agent discussions.

The coordinator:
1. Analyzes the topic and defines scope
2. Selects relevant agents from the pool
3. Decides who speaks next in real-time (not round-robin)
4. Can have agents just react (👍/👎) when nothing new to say
5. Monitors if agents go off-topic and issues guidance
6. Decides when the discussion naturally concludes via LLM
7. Generates a comprehensive summary
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session as DBSession

from app.core.llm import LLMClient
from app.domain.agent import AgentPool
from app.domain.message import DiscussionMessage, MessageSender, MessageType, Reaction
from app.domain.session import Participant, Session
from app.store.database import (
    MessageModel,
    ParticipantModel,
    ReactionModel,
    SessionModel,
)


class Coordinator:
    """Orchestrates spontaneous multi-agent discussions."""

    def __init__(self, llm: LLMClient, agent_pool: AgentPool):
        self.llm = llm
        self.agent_pool = agent_pool

    # ------------------------------------------------------------------
    # Phase 1: Scope Definition
    # ------------------------------------------------------------------

    async def define_scope(self, topic: str, expectations: Optional[str] = None) -> Dict[str, Any]:
        """Analyze the topic and define the discussion scope."""
        prompt = f"""You are a Discussion Coordinator. Analyze this topic and define the scope.

Topic: "{topic}"
User expectations: {expectations or "Not specified — define a comprehensive scope yourself."}

Define:
1. A clear scope statement (2-3 sentences)
2. 3-5 key questions that should be explored
3. The core perspectives needed (e.g., ethical, technical, social, economic)
4. What a successful outcome looks like

Return as JSON:
{{"scope": "...", "key_questions": ["..."], "perspectives_needed": ["..."], "success_criteria": "..."}}"""

        messages = [{"role": "system", "content": "You are a skilled discussion coordinator. You design productive, balanced group discussions."},
                     {"role": "user", "content": prompt}]
        result = await self.llm.chat_json(messages, temperature=0.7, max_tokens=512)
        return result

    # ------------------------------------------------------------------
    # Phase 2: Agent Selection
    # ------------------------------------------------------------------

    async def select_agents(
        self, topic: str, scope: Dict[str, Any], user_invited: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Select the best agents for this discussion."""
        if user_invited and len(user_invited) >= 3:
            selected = [a for a in self.agent_pool.agents if a.id in user_invited]
            return {
                "selected_agents": [a.id for a in selected],
                "reasoning": "User-specified agents",
                "agent_details": [{"id": a.id, "name": a.name, "role": a.role, "avatar_emoji": a.avatar_emoji} for a in selected],
            }

        agent_descriptions = "\n".join(
            f"- {a.id}: {a.name} ({a.role}). Expertise: {', '.join(a.expertise)}. Stance: {a.stance}. Personality: {a.personality}"
            for a in self.agent_pool.agents
        )

        prompt = f"""You are selecting agents for a group discussion.

Topic: "{topic}"
Scope: {json.dumps(scope)}
Perspectives needed: {', '.join(scope.get('perspectives_needed', []))}

Available agents:
{agent_descriptions}

Select 4-6 agents that will create a balanced, productive discussion. Consider:
1. Diversity of perspectives (include both optimistic and skeptical voices)
2. Relevant expertise for the topic
3. Good mix of personalities for engaging discussion

Return as JSON:
{{
  "selected_agents": ["agent_id1", "agent_id2", ...],
  "reasoning": "Why these agents were chosen",
  "agent_details": [{{"id": "...", "name": "...", "role": "...", "avatar_emoji": "..."}}]
}}"""

        messages = [
            {"role": "system", "content": "You are an expert at assembling diverse, productive discussion panels. Select agents that maximize insight and minimize echo chambers."},
            {"role": "user", "content": prompt},
        ]
        result = await self.llm.chat_json(messages, temperature=0.7, max_tokens=512)
        return result

    # ------------------------------------------------------------------
    # Phase 3: Spontaneous Turn Decision
    # ------------------------------------------------------------------

    async def decide_next_action(
        self,
        session: Session,
        history: List[DiscussionMessage],
        agents: List[Participant],
        turn_count: int,
    ) -> Dict[str, Any]:
        """LLM decides: who speaks next, should someone just react, or are we done?

        Returns:
            {
                "action": "speak" | "react" | "done" | "guidance",
                "agent_id": "...",           # for speak/react
                "reasoning": "...",           # why this agent
                "guidance": "...",            # when action="guidance" or agents go off-topic
                "target_message_id": "...",   # for react
                "emoji": "👍" | "👎",         # for react
            }
        """
        # Build context for the coordinator
        agent_summary = "\n".join(
            f"- {p.name} (id: {p.id}): spoken {p.turns_used} times"
            for p in agents
        )

        recent_history = ""
        for m in history[-8:]:
            mid = m.id[:8]
            role = "Human" if m.sender_id == "human" else m.sender_name
            recent_history += f"[{mid}] [{role}]: {m.content[:200]}\n"

        prompt = f"""You are the moderator of a spontaneous group discussion. Your job is to keep the conversation engaging and productive.

**Topic:** {session.topic}
**Scope:** {session.scope or 'Comprehensive exploration'}
**Turn:** {turn_count}

**Participants:**
{agent_summary}

**Recent discussion:**
{recent_history}

Decide what should happen next. Choose ONE action:

1. **speak** — Pick an agent who should contribute now. They might have a relevant perspective, want to respond to someone, or have been quiet for too long.
2. **react** — An agent has nothing substantial to add but wants to show agreement or disagreement with a recent message via 👍 or 👎. Pick the agent, target message ID (from brackets), and emoji. Use this frequently — it keeps the discussion alive without redundancy.
3. **guidance** — The discussion is going off-topic or getting circular. The coordinator should gently redirect. Include guidance text AND pick the next speaker.
4. **done** — ONLY use this when the discussion has been thoroughly exhausted. ALL participants should have spoken at least 2-3 times, key disagreements explored, and no new perspectives emerging.

**IMPORTANT guidelines:**
- Do NOT end the discussion after everyone has spoken just once. Let agents respond to each other, challenge points, and build deeper insights.
- Prefer "speak" or "react" for at least 12-18 turns before even considering "done".
- Use "react" liberally — agents can show quick agreement/disagreement with 👍/👎 without a full message. This is great when an agent has already made their point.
- Don't let the same agent speak twice in a row unless they're directly addressed.
- Encourage quieter agents to speak up.
- A lively discussion has back-and-forth, not just one statement per person.

Return JSON:
{{
  "action": "speak" | "react" | "guidance" | "done",
  "agent_id": "id of the agent (required for speak/react/guidance)",
  "reasoning": "Brief explanation of your decision",
  "guidance": "Gentle redirection text (only for guidance action, or if off-topic)",
  "target_message_id": "full message ID to react to (only for react action)",
  "emoji": "👍 or 👎 (only for react action)"
}}"""

        messages = [
            {"role": "system", "content": "You are an expert discussion moderator. You keep conversations productive, balanced, and on-topic. You know when to let agents speak, when they should just react, and when to end."},
            {"role": "user", "content": prompt},
        ]
        result = await self.llm.chat_json(messages, temperature=0.5, max_tokens=512)
        return result

    # ------------------------------------------------------------------
    # Phase 4: Summarization
    # ------------------------------------------------------------------

    async def generate_summary(self, session: Session, messages: List[DiscussionMessage]) -> str:
        """Generate a comprehensive discussion summary."""
        transcript = "\n".join(
            f"[{m.sender_name}] ({m.sender_type}): {m.content}" for m in messages
        )

        prompt = f"""Summarize this group discussion concisely:

**Topic:** {session.topic}
**Participants:** {', '.join(p.name for p in session.participants if p.type == 'agent')}

**Full Transcript:**
{transcript}

Write a CONCISE summary (2-3 paragraphs max) that covers:
1. Overview (1-2 sentences)
2. Key points and areas of agreement
3. Main disagreements and overall conclusion

Keep it brief and scannable. Use Markdown with clear headings. No more than 300 words total."""

        messages = [
            {"role": "system", "content": "You are a skilled summarizer. Create clear, balanced, insightful summaries of group discussions."},
            {"role": "user", "content": prompt},
        ]
        return await self.llm.chat(messages, temperature=0.5, max_tokens=600)



# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def save_session(db: DBSession, session: Session) -> SessionModel:
    """Persist a Session domain object to the DB."""
    db_session = db.query(SessionModel).filter(SessionModel.id == session.id).first()
    if not db_session:
        db_session = SessionModel(
            id=session.id,
            topic=session.topic,
            scope=session.scope,
            user_expectations=session.user_expectations,
            state=session.state.value,
            max_rounds=session.max_rounds,
            current_round=session.turn_state.round_number,
            current_speaker_id=session.turn_state.current_speaker_id,
            summary=session.summary,
            error=session.error,
        )
        db.add(db_session)
    else:
        db_session.state = session.state.value
        db_session.scope = session.scope
        db_session.current_round = session.turn_state.round_number
        db_session.current_speaker_id = session.turn_state.current_speaker_id
        db_session.summary = session.summary
        db_session.error = session.error
        db_session.updated_at = datetime.now(timezone.utc)

    # Sync participants
    for p in session.participants:
        db_participant = db.query(ParticipantModel).filter(
            ParticipantModel.session_id == session.id,
            ParticipantModel.agent_id == p.id,
        ).first()
        if not db_participant:
            db_participant = ParticipantModel(
                session_id=session.id,
                agent_id=p.id,
                name=p.name,
                type=p.type,
                avatar_url=p.avatar_url,
                max_turns=p.max_turns,
                turns_used=p.turns_used,
            )
            db.add(db_participant)
        else:
            db_participant.turns_used = p.turns_used

    db.commit()
    db.refresh(db_session)
    return db_session


def save_message(db: DBSession, msg: DiscussionMessage) -> MessageModel:
    """Persist a message to the DB."""
    db_msg = MessageModel(
        id=msg.id,
        session_id=msg.session_id,
        sender_id=msg.sender_id,
        sender_name=msg.sender_name,
        sender_type=msg.sender_type.value,
        sender_avatar=msg.sender_avatar,
        content=msg.content,
        reply_to_id=msg.reply_to_id,
        reply_to_sender=msg.reply_to_sender,
        msg_type=msg.msg_type.value,
        is_final=msg.is_final,
        created_at=msg.created_at,
    )
    db.add(db_msg)

    for r in msg.reactions:
        db_reaction = ReactionModel(
            id=r.id,
            message_id=r.message_id,
            sender_id=r.sender_id,
            sender_name=r.sender_name,
            emoji=r.emoji,
        )
        db.add(db_reaction)

    db.commit()
    return db_msg


def load_messages(db: DBSession, session_id: str) -> List[DiscussionMessage]:
    """Load messages with reactions for a session."""
    db_msgs = db.query(MessageModel).filter(
        MessageModel.session_id == session_id
    ).order_by(MessageModel.created_at).all()

    messages = []
    for m in db_msgs:
        reactions = [
            Reaction(id=r.id, message_id=r.message_id, sender_id=r.sender_id,
                     sender_name=r.sender_name, emoji=r.emoji)
            for r in m.reactions
        ]
        messages.append(DiscussionMessage(
            id=m.id,
            session_id=m.session_id,
            sender_id=m.sender_id,
            sender_name=m.sender_name,
            sender_type=MessageSender(m.sender_type),
            sender_avatar=m.sender_avatar,
            content=m.content,
            reply_to_id=m.reply_to_id,
            reply_to_sender=m.reply_to_sender,
            msg_type=MessageType(m.msg_type),
            reactions=reactions,
            is_final=m.is_final or False,
            created_at=m.created_at,
        ))
    return messages
