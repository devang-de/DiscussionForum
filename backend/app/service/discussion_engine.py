"""DiscussionEngine — Spontaneous, coordinator-driven multi-agent discussions.

No rigid turn-taking or rounds. The coordinator orchestrates:
- Decides who speaks next based on conversation flow
- Can have agents just react (👍/👎) when nothing new to say
- Monitors discussion quality and guides off-topic agents
- Decides when discussion naturally concludes via LLM
- Human can interject at any time, not just during a "human turn"
"""

from __future__ import annotations

import asyncio
import json
import re
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional

from app.core.bus import MessageBus
from app.core.llm import LLMClient
from app.domain.agent import AgentPool, AgentProfile
from app.domain.message import DiscussionMessage, MessageSender, MessageType, Reaction
from app.domain.session import Participant, Session, SessionState, TurnState
from app.service.coordinator import (
    Coordinator,
    load_messages,
    save_message,
    save_session,
)


class DiscussionEngine:
    """Runs spontaneous multi-agent discussions coordinated by an LLM moderator."""

    def __init__(
        self,
        bus: MessageBus,
        llm: LLMClient,
        agent_pool: AgentPool,
        db_session_factory,
    ):
        self.bus = bus
        self.llm = llm
        self.agent_pool = agent_pool
        self.coordinator = Coordinator(llm, agent_pool)
        self.db_session_factory = db_session_factory
        self._active_sessions: Dict[str, Session] = {}
        self._opening_sent: Dict[str, bool] = {}
        self._cancel_flags: Dict[str, bool] = {}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @contextmanager
    def _get_db(self):
        db = self.db_session_factory()
        try:
            yield db
        finally:
            db.close()

    # ------------------------------------------------------------------
    # Session Lifecycle
    # ------------------------------------------------------------------

    def create_session(self, topic: str, expectations: Optional[str] = None,
                       max_rounds: int = 3, invited_agents: Optional[List[str]] = None) -> Session:
        session = Session(
            id=str(uuid.uuid4()), topic=topic,
            user_expectations=expectations, max_rounds=max_rounds,
            state=SessionState.CREATED, turn_state=TurnState(),
        )
        session.participants.append(Participant(
            id="human", name="You", type="human", max_turns=999))
        self._active_sessions[session.id] = session
        self._opening_sent[session.id] = False
        self._cancel_flags[session.id] = False
        with self._get_db() as db:
            save_session(db, session)
        return session

    async def start_scoping(self, session_id: str) -> AsyncGenerator[Dict[str, Any], None]:
        session = self._active_sessions.get(session_id)
        if not session:
            yield {"type": "error", "message": "Session not found"}
            return

        session.state = SessionState.SCOPING
        yield {"type": "status", "message": "Analyzing topic..."}
        await self._publish_status(session_id, "scoping", "Analyzing topic...")

        scope = await self.coordinator.define_scope(session.topic, session.user_expectations)
        session.scope = scope.get("scope", "")
        yield {"type": "scope_defined", "scope": scope.get("scope", ""),
               "key_questions": scope.get("key_questions", []),
               "perspectives_needed": scope.get("perspectives_needed", [])}

        yield {"type": "status", "message": "Selecting agents..."}

        selection = await self.coordinator.select_agents(session.topic, scope)
        session.participants = [p for p in session.participants if p.type == "human"]
        for ad in selection.get("agent_details", []):
            agent = self.agent_pool.get(ad["id"])
            if agent:
                session.participants.append(Participant(
                    id=agent.id, name=agent.name, type="agent",
                    max_turns=999))  # unlimited — coordinator decides when done

        session.state = SessionState.AWAITING_APPROVAL
        with self._get_db() as db:
            save_session(db, session)
        yield {"type": "agents_selected", "agents": selection.get("agent_details", []),
               "reasoning": selection.get("reasoning", ""), "scope": scope}

    # ------------------------------------------------------------------
    # Discussion — Spontaneous, Coordinator-Driven
    # ------------------------------------------------------------------

    async def start_discussion(self, session_id: str) -> AsyncGenerator[Dict[str, Any], None]:
        session = self._active_sessions.get(session_id)
        if not session:
            yield {"type": "error", "message": "Session not found"}
            return

        session.state = SessionState.IN_PROGRESS
        agents = [p for p in session.participants if p.type == "agent"]

        with self._get_db() as db:
            save_session(db, session)

            # One-time opening message
            if not self._opening_sent.get(session_id, False):
                self._opening_sent[session_id] = True
                opening = await self._build_opening(session)
                save_message(db, opening)
                yield {"type": "message", "message": opening.model_dump(mode="json")}
                await self._publish_msg(session_id, opening)

            # Spontaneous discussion loop
            MAX_TURNS = 30  # safety cap
            turn_count = 0

            while turn_count < MAX_TURNS:
                turn_count += 1

                # Check if cancelled
                if self._cancel_flags.get(session_id, False):
                    break

                # Load current history
                history = load_messages(db, session_id)

                # Coordinator decides: who speaks next, or are we done?
                decision = await self.coordinator.decide_next_action(
                    session, history, agents, turn_count)

                action = decision.get("action", "done")

                if action == "done" or action == "summarize":
                    break

                if action == "react":
                    # Agent just wants to react — no full message
                    agent_id = decision.get("agent_id", "")
                    target_msg_id = decision.get("target_message_id", "")
                    emoji = decision.get("emoji", "👍")

                    await self._handle_agent_reaction(
                        session_id, agent_id, target_msg_id, emoji, session, db)

                    yield {"type": "status",
                           "message": decision.get("reasoning", f"Agent reacted {emoji}")}
                    continue

                # action == "speak": get the designated speaker
                agent_id = decision.get("agent_id", "")
                if not agent_id:
                    # Fallback: pick agent with fewest turns
                    agent_id = self._pick_least_active(agents)

                agent_profile = self.agent_pool.get(agent_id)
                agent_participant = next(
                    (p for p in agents if p.id == agent_id), None)
                if not agent_profile or not agent_participant:
                    continue

                # Check if coordinator wants to guide
                guidance = decision.get("guidance", "")
                if guidance:
                    guidance_msg = DiscussionMessage(
                        id=str(uuid.uuid4()),
                        session_id=session_id,
                        sender_id="coordinator",
                        sender_name="Coordinator",
                        sender_type=MessageSender.COORDINATOR,
                        content=f"💡 _{guidance}_",
                        msg_type=MessageType.SYSTEM)
                    save_message(db, guidance_msg)
                    yield {"type": "message",
                           "message": guidance_msg.model_dump(mode="json")}

                # Agent speaks
                yield {"type": "status",
                       "message": f"{agent_participant.name} is thinking..."}
                await self._publish_status(session_id, "agent_thinking",
                                           f"{agent_participant.name} is thinking...",
                                           agent_id=agent_participant.id)

                prompt = self._build_turn_prompt(
                    agent_profile, session, history, agents,
                    decision.get("reasoning", ""))

                try:
                    response = await self.llm.chat(
                        [{"role": "system", "content": agent_profile.system_prompt},
                         {"role": "user", "content": prompt}],
                        temperature=0.75, max_tokens=512)

                    # Parse reactions embedded in response
                    clean, reactions = self._parse_reactions(
                        response, agent_profile)

                    msg = DiscussionMessage(
                        id=str(uuid.uuid4()),
                        session_id=session_id,
                        sender_id=agent_participant.id,
                        sender_name=agent_profile.name,
                        sender_type=MessageSender.AGENT,
                        content=clean,
                        reactions=reactions)

                    save_message(db, msg)
                    agent_participant.turns_used += 1
                    session.turn_state.total_messages += 1
                    save_session(db, session)

                    yield {"type": "message",
                           "message": msg.model_dump(mode="json")}
                    await self._publish_msg(session_id, msg)

                except Exception as e:
                    yield {"type": "error",
                           "message": f"{agent_profile.name} error: {e}"}
                    continue

                await asyncio.sleep(0.3)

            # Summarize
            session.state = SessionState.SUMMARIZING
            yield {"type": "status", "message": "Writing summary..."}

            all_msgs = load_messages(db, session_id)
            summary = await self.coordinator.generate_summary(session, all_msgs)
            session.summary = summary
            session.state = SessionState.COMPLETED

            summary_msg = DiscussionMessage(
                id=str(uuid.uuid4()), session_id=session_id,
                sender_id="coordinator", sender_name="Coordinator",
                sender_type=MessageSender.COORDINATOR, content=summary,
                msg_type=MessageType.SYSTEM, is_final=True)
            save_message(db, summary_msg)
            save_session(db, session)

            yield {"type": "summary",
                   "message": summary_msg.model_dump(mode="json")}
            await self._publish_msg(session_id, summary_msg)
            yield {"type": "complete", "session_id": session_id}

    async def human_input(self, session_id: str, content: str) -> AsyncGenerator[Dict[str, Any], None]:
        """Human interjects at any time. Saves message, then continues discussion."""
        session = self._active_sessions.get(session_id)
        if not session:
            yield {"type": "error", "message": "Session not found"}
            return

        # Cancel any in-progress discussion stream
        self._cancel_flags[session_id] = True
        await asyncio.sleep(0.2)
        self._cancel_flags[session_id] = False

        with self._get_db() as db:
            human_msg = DiscussionMessage(
                id=str(uuid.uuid4()), session_id=session_id,
                sender_id="human", sender_name="You",
                sender_type=MessageSender.HUMAN, content=content)
            save_message(db, human_msg)
            yield {"type": "message", "message": human_msg.model_dump(mode="json")}
            await self._publish_msg(session_id, human_msg)

        # Continue the discussion
        async for event in self.start_discussion(session_id):
            yield event

    # ------------------------------------------------------------------
    # Prompt Building
    # ------------------------------------------------------------------

    def _build_group_context(self, session: Session) -> str:
        """Build the shared group context that all agents see."""
        agents = [p for p in session.participants if p.type == "agent"]
        agent_list = "\n".join(
            f"- **{p.name}**: {self.agent_pool.get(p.id).role if self.agent_pool.get(p.id) else 'Participant'}"
            for p in agents)

        return f"""# Group Discussion

**Topic:** {session.topic}
**Scope:** {session.scope or 'Comprehensive exploration'}

**Participants:**
{agent_list}

**Discussion guidelines:**
- Write as if you're in a team chat — natural, concise, collegial
- Address specific people by name when responding: "@Name, I agree..." or "@Name, I'd push back on..."
- Build on others' points instead of repeating them
- Disagree constructively — challenge ideas, not people
- Each message should be 2-4 sentences
- Use specific evidence or reasoning, not vague statements
- IMPORTANT: If you agree or disagree with someone but have nothing substantially NEW to add, REACT instead of writing a full message. Use [REACT:message_id:👍] to agree or [REACT:message_id:👎] to disagree — where message_id is the short ID in brackets like [a1b2c3d4]. This keeps the conversation lively without redundancy.
- Example: [REACT:a1b2c3d4:👍] means you agree with that message
- You can include a reaction AND a short message if needed, but prefer just the reaction when your point has already been made by someone else"""

    def _build_turn_prompt(self, agent: AgentProfile, session: Session,
                           history: List[DiscussionMessage],
                           all_agents: List[Participant],
                           coordinator_reasoning: str = "") -> str:
        """Build a spontaneous turn prompt."""

        group_ctx = self._build_group_context(session)

        # Format recent history (last 10 messages)
        recent = history[-10:] if len(history) > 10 else history
        history_text = ""
        for m in recent:
            role = "Human" if m.sender_id == "human" else m.sender_name
            mid = m.id[:8]
            history_text += f"[{mid}] [{role}]: {m.content}\n\n"

        coordinator_hint = ""
        if coordinator_reasoning:
            coordinator_hint = f"\n**Why you were chosen to speak now:** {coordinator_reasoning}"

        return f"""{group_ctx}

**You are {agent.name}** — {agent.role}. {agent.personality}

**Recent discussion:**
{history_text}
{coordinator_hint}

**It's your turn to contribute.** You can:
- Share a new perspective or insight
- Respond to a specific person by name (e.g., "@Marcus, I think that overlooks...")
- Build on or challenge a previous point
- AGREE or DISAGREE using a reaction: [REACT:<message_id>:👍] or [REACT:<message_id>:👎]
  where <message_id> is the short ID shown in brackets (e.g., [a1b2c3d4])
  USE THIS when someone already said what you would say — it shows engagement without repetition
- Keep to 2-4 sentences. Be substantive. Don't repeat what's already been said.
- If your entire response would just be 'I agree' or 'I disagree', use a [REACT:...] tag instead."""

    # ------------------------------------------------------------------
    # Reactions
    # ------------------------------------------------------------------

    async def _handle_agent_reaction(
        self, session_id: str, agent_id: str, target_msg_id: str,
        emoji: str, session: Session, db
    ):
        """Record an agent's reaction to a message."""
        agent_profile = self.agent_pool.get(agent_id)
        if not agent_profile:
            return

        reaction = Reaction(
            id=str(uuid.uuid4()),
            message_id=target_msg_id,
            sender_id=agent_id,
            sender_name=agent_profile.name,
            emoji=emoji)
        from app.store.database import ReactionModel
        db.add(ReactionModel(
            id=reaction.id, message_id=target_msg_id,
            sender_id=agent_id, sender_name=agent_profile.name,
            emoji=emoji))
        db.commit()

    def _parse_reactions(self, text: str, agent: AgentProfile) -> tuple[str, List[Reaction]]:
        reactions = []
        clean = text
        for match in re.finditer(r'\[REACT:([^:]+):([^\]]+)\]', text):
            mid, emoji = match.group(1), match.group(2).strip()
            if emoji in ("👍", "👎"):
                reactions.append(Reaction(id=str(uuid.uuid4()), message_id=mid,
                                          sender_id=agent.id, sender_name=agent.name,
                                          emoji=emoji))
            clean = clean.replace(match.group(0), "")
        return clean.strip(), reactions

    async def _build_opening(self, session: Session) -> DiscussionMessage:
        agents = [p for p in session.participants if p.type == "agent"]
        content = f"""# {session.topic}

{session.scope or ''}

**Discussants:** {', '.join(a.name for a in agents)}

Let's have a spontaneous, thoughtful discussion. Jump in when you have something to say, react to each other's points, and let the conversation flow naturally."""

        return DiscussionMessage(
            id=str(uuid.uuid4()), session_id=session.id,
            sender_id="coordinator", sender_name="Coordinator",
            sender_type=MessageSender.COORDINATOR, content=content,
            msg_type=MessageType.SYSTEM)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _pick_least_active(self, agents: List[Participant]) -> str:
        """Pick agent with fewest turns used as fallback."""
        if not agents:
            return ""
        return min(agents, key=lambda p: p.turns_used).id

    async def _publish(self, sid: str, evt: str, data: Any):
        await self.bus.publish(f"session.{sid}.{evt}", "engine",
                               {"type": evt, "data": data})

    async def _publish_status(self, sid: str, status: str, msg: str,
                              agent_id: Optional[str] = None):
        await self.bus.publish(f"session.{sid}.status", "engine",
                               {"status": status, "message": msg,
                                "agent_id": agent_id})

    async def _publish_msg(self, sid: str, msg: DiscussionMessage):
        await self.bus.publish(f"session.{sid}.message", msg.sender_id,
                               msg.model_dump(mode="json"))
