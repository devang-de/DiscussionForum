# Discussion Forum — Multi-Agent Architecture Plan

## Executive Summary

**Goal:** Build a real-time discussion forum powered by a multi-agent AI system, using the PlugAndPlayAgents architecture (MessageBus, AgentRuntime, TaskGraph, Coordinator) as the blueprint.

**Core Innovation:** Beyond standard forum features (topics, replies, categories), this forum has a team of AI agents that moderate, summarize, recommend, and assist users — all communicating over a shared MessageBus with real-time WebSocket updates to the frontend.

**Tech Stack:**
- **Backend:** Python/FastAPI + SQLAlchemy + SQLite (→ Postgres)
- **Frontend:** Next.js + TypeScript + Tailwind CSS + PixelOffice visualization
- **Agent System:** AgentRuntime + MessageBus + ToolRegistry
- **Real-time:** WebSocket via bus-websocket bridge
- **AI:** OpenAI API (GPT-4.1) for agent reasoning

---

## Phase 1: Core Forum Backend (No Agents Yet)

### 1.1 Data Models

```python
# backend/app/domain/user.py
class User(BaseModel):
    id: str                    # UUID
    username: str
    email: str
    password_hash: str
    avatar_url: str | None
    bio: str
    created_at: datetime
    is_moderator: bool
    reputation: int            # Upvotes earned

# backend/app/domain/category.py
class Category(BaseModel):
    id: str
    name: str                  # e.g., "General", "Tech", "Announcements"
    slug: str
    description: str
    sort_order: int
    topic_count: int

# backend/app/domain/thread.py
class Thread(BaseModel):
    id: str
    title: str
    content: str               # Markdown body of first post
    category_id: str
    author_id: str
    is_pinned: bool
    is_locked: bool
    view_count: int
    reply_count: int
    upvote_count: int
    created_at: datetime
    updated_at: datetime
    tags: list[str]            # e.g., ["python", "help"]

# backend/app/domain/reply.py
class Reply(BaseModel):
    id: str
    thread_id: str
    author_id: str
    content: str               # Markdown
    parent_reply_id: str | None  # For nested replies
    upvote_count: int
    is_solution: bool          # Marked as solution by thread author
    created_at: datetime
    updated_at: datetime

# backend/app/domain/vote.py
class Vote(BaseModel):
    id: str
    user_id: str
    target_type: str           # "thread" or "reply"
    target_id: str
    direction: int             # +1 or -1
    created_at: datetime
```

### 1.2 REST API Endpoints

```
# Auth
POST   /auth/register          — Create account
POST   /auth/login              — Get JWT token
POST   /auth/logout             — Invalidate token
GET    /users/me                — Current user profile
GET    /users/{username}        — Public user profile
PATCH  /users/me                — Update profile

# Categories
GET    /categories              — List all categories
GET    /categories/{slug}       — Get category details
POST   /categories              — [Moderator] Create category
PATCH  /categories/{slug}       — [Moderator] Update category
DELETE /categories/{slug}       — [Moderator] Delete category

# Threads
GET    /categories/{slug}/threads          — List threads (paginated, sorted)
POST   /categories/{slug}/threads          — Create new thread
GET    /threads/{id}                       — Get thread with replies
PATCH  /threads/{id}                       — [Author] Edit thread
DELETE /threads/{id}                       — [Author/Mod] Delete thread
POST   /threads/{id}/pin                   — [Moderator] Pin thread
POST   /threads/{id}/lock                  — [Moderator] Lock thread

# Replies
GET    /threads/{id}/replies               — List replies (paginated)
POST   /threads/{id}/replies               — Create reply
PATCH  /replies/{id}                       — [Author] Edit reply
DELETE /replies/{id}                       — [Author/Mod] Delete reply
POST   /replies/{id}/mark-solution         — [Thread author] Mark as solution

# Voting
POST   /threads/{id}/vote                  — Upvote/downvote thread
POST   /replies/{id}/vote                  — Upvote/downvote reply
DELETE /threads/{id}/vote                  — Remove vote
DELETE /replies/{id}/vote                  — Remove vote

# Search
GET    /search?q={query}&category={slug}   — Full-text search

# Agent Endpoints (Phase 2+)
GET    /threads/{id}/summary               — AI-generated summary
GET    /recommendations                    — Recommended threads for user
POST   /moderation/report                  — Report content
GET    /moderation/queue                   — [Moderator] Review queue
```

### 1.3 WebSocket Events

```json
// New reply in a thread the user is viewing
{ "type": "new_reply", "payload": { "thread_id": "...", "reply": {...} } }

// Thread status change (locked, pinned)
{ "type": "thread_updated", "payload": { "thread_id": "...", "changes": {...} } }

// New thread in a category the user is browsing
{ "type": "new_thread", "payload": { "category_slug": "...", "thread": {...} } }

// Vote count changed
{ "type": "vote_updated", "payload": { "target_type": "...", "target_id": "...", "upvote_count": N } }

// Agent status events (Phase 2+)
{ "type": "agent_status", "payload": { "agent_id": "moderator", "status": "analyzing", ... } }
{ "type": "agent_message", "payload": { "agent_id": "summarizer", "thread_id": "...", "content": "..." } }
```

### 1.4 Database Schema (SQLAlchemy)

```python
# Tables: users, categories, threads, replies, votes, tags, thread_tags
# Indexes: on (category_id, created_at), (author_id), (thread_id, created_at)
# Full-text search on threads.title, threads.content, replies.content
```

---

## Phase 2: Multi-Agent System Integration

### 2.1 MessageBus Setup

Wire the same MessageBus pattern from PlugAndPlayAgents into the forum. Topics:

```
session.{session_id}.agent.{agent_id}     — Direct messages to an agent
session.{session_id}.broadcast             — Broadcast to all agents in session
session.{session_id}.result.{agent_id}     — Agent publishes result
session.{session_id}.status.{agent_id}     — Status updates (thinking, working, done)
forum.moderation.flagged                   — Moderator agent subscribes
forum.thread.{id}.new_reply               — Summarizer agent subscribes
forum.user.{id}.activity                   — Recommender agent subscribes
```

### 2.2 Agent Profiles

#### Moderator Agent (`moderator`)

**Role:** Reviews flagged content, detects spam/abuse, enforces community guidelines.

**Skills:** content-moderation, spam-detection, policy-enforcement

**Tools:** read_thread, read_reply, flag_content, remove_content, warn_user, ban_user

**Triggers:**
- User reports content → creates moderation task
- New thread/reply posted → background scan for policy violations
- Periodic scan of recent activity

**Output:** Moderation action (approve/flag/remove) with reasoning.

**System Prompt:**
```
You are the Moderator Agent. Your role is to keep the forum safe and civil.

Guidelines:
- No spam, advertising, or self-promotion outside designated areas
- No harassment, hate speech, or personal attacks
- No NSFW content
- Be respectful and constructive in feedback
- When in doubt, flag for human review rather than removing

When you receive a moderation task:
1. Read the flagged content carefully
2. Check context (thread, parent replies, user history)
3. Decide: APPROVE (no violation), FLAG (needs human review), REMOVE (clear violation)
4. Provide reasoning for your decision
5. If removing, suggest edit to make compliant (if possible)
```

#### Summarizer Agent (`summarizer`)

**Role:** Creates concise summaries of long threads, extracts key points and decisions.

**Skills:** text-summarization, key-point-extraction, tl-dr-generation

**Tools:** read_thread, read_replies, post_summary

**Triggers:**
- Thread reaches 20+ replies → auto-generate summary
- User requests: "@summarizer summarize this thread"
- Thread is marked as solved → create final summary with solution

**Output:** Markdown summary posted as a pinned/system reply.

**System Prompt:**
```
You are the Summarizer Agent. Your role is to help users quickly understand long discussions.

When summarizing a thread:
1. Read all replies to understand the full discussion
2. Identify the original question/problem
3. Extract key viewpoints and arguments from each side
4. If a solution was reached, highlight it prominently
5. Note any unresolved questions
6. Keep summaries concise (3-5 paragraphs)
7. Use bullet points for key takeaways
8. Link to important replies by number

Format:
## Thread Summary

**Original Question:** ...
**Key Points:**
- Point 1
- Point 2
**Solution/Conclusion:** ...
**Open Questions:** ...
```

#### Recommender Agent (`recommender`)

**Role:** Suggests related threads, helps users discover relevant content.

**Skills:** content-recommendation, similarity-matching, user-profiling

**Tools:** search_threads, get_user_history, get_trending, get_similar_threads

**Triggers:**
- User creates a new thread → suggest similar existing threads ("Your question may already be answered…")
- User views a thread → show "Related Discussions" sidebar
- Periodic: generate trending/popular threads

**Output:** List of recommended thread IDs with relevance scores.

#### Search Assistant Agent (`search_assistant`)

**Role:** Helps users find answers using natural language queries.

**Skills:** semantic-search, question-answering, knowledge-retrieval

**Tools:** search_threads, read_thread, read_replies

**Triggers:**
- User uses `/search` with natural language
- User asks: "@search how do I..."

**Output:** Ranked list of relevant threads with excerpts showing the answer.

#### Onboarding Agent (`onboarding`)

**Role:** Welcomes new users, guides them through forum features.

**Skills:** user-onboarding, tutorial-generation, faq-answering

**Tools:** get_user, send_welcome_message, get_categories, get_popular_threads

**Triggers:**
- New user registers → send welcome message
- User visits for first time → show getting-started guide

**Output:** Personalized welcome message and suggested first actions.

### 2.3 AgentFactory Integration

Same pattern as PlugAndPlayAgents:

```python
# backend/app/service/agent_factory.py
class AgentFactory:
    def __init__(self, bus: MessageBus, session_id: str):
        ...
    
    def create_agent(self, profile: AgentProfile) -> AgentRuntime:
        # Build system prompt from profile
        # Wire bus + session_id
        # Register agent-specific tools
        ...
    
    def start_all(self, agent_ids: list[str]) -> dict[str, AgentRuntime]:
        ...
```

### 2.4 Agent Triggers & Automation

Agents don't run continuously — they're triggered by events:

```python
# backend/app/service/agent_triggers.py

async def on_new_thread(thread: Thread):
    """When a new thread is created:"""
    # 1. Moderator: background scan for spam
    bus.publish("forum.moderation.scan", "system", {"thread_id": thread.id})
    
    # 2. Recommender: check for duplicates
    bus.publish("forum.recommend.duplicate_check", "system", {"thread_id": thread.id})

async def on_new_reply(reply: Reply, thread: Thread):
    """When a new reply is posted:"""
    # 1. Summarizer: check if thread needs summary (20+ replies)
    if thread.reply_count >= 20 and thread.reply_count % 10 == 0:
        bus.publish("forum.summarizer.update", "system", {"thread_id": thread.id})
    
    # 2. Moderator: background scan
    bus.publish("forum.moderation.scan", "system", {"reply_id": reply.id})

async def on_user_registered(user: User):
    """When a new user signs up:"""
    bus.publish("forum.onboarding.welcome", "system", {"user_id": user.id})

async def on_content_reported(report: Report):
    """When content is flagged by a user:"""
    bus.publish("forum.moderation.flagged", "system", {"report": report.dict()})
```

---

## Phase 3: Frontend UI

### 3.1 Pages

```
/                             — Home page (categories, trending threads)
/discuss/{slug}                — Category page (thread list with filters)
/discuss/{slug}/new            — Create new thread form
/thread/{id}                   — Thread view (replies, agent sidebar)
/thread/{id}?reply={id}        — Link to specific reply
/search?q={query}               — Search results
/user/{username}                — User profile
/login                          — Login page
/register                       — Registration page
/moderation                     — [Moderator] Review queue
```

### 3.2 Key Components

#### ThreadView (`frontend/app/thread/[id]/page.tsx`)

- Main reply feed with Markdown rendering
- Reply composer (Markdown editor with preview)
- Upvote/downvote buttons with real-time count update
- "Mark as Solution" button (thread author only)
- Pin/Lock buttons (moderators only)
- Report button on each reply
- Agent sidebar: summary, related threads, moderation status

#### AgentSidebar (`frontend/app/components/AgentSidebar.tsx`)

- Shows active agents for current thread
- Thread summary (from Summarizer agent)
- Related discussions (from Recommender agent)
- Moderation status (from Moderator agent)
- Search assistant chat box

#### PixelOffice (`frontend/app/components/PixelOffice/PixelOffice.tsx`)

Adapted from PlugAndPlayAgents — shows agents as characters in a virtual office:
- Moderator at a desk reviewing flagged content
- Summarizer at a desk reading threads
- Recommender at a whiteboard connecting related threads
- Search Assistant at a help desk
- Onboarding agent at a welcome desk

Agents animate when they're actively working (thinking, analyzing, posting).

#### CategoryPage (`frontend/app/discuss/[slug]/page.tsx`)

- Thread list with sort options (latest, most upvoted, most replies, trending)
- Pin/lock indicators
- Tag filters
- "New Thread" button
- Agent-generated thread summaries (2-line preview)

#### SearchPage (`frontend/app/search/page.tsx`)

- Search bar with natural language support
- Results powered by Search Assistant agent
- Filter by category, date range, solved/unsolved
- Snippets showing relevant excerpts

### 3.3 Real-Time Features

Using WebSocket (from Phase 1):

- Live reply counter updates
- "New reply" notification while reading a thread
- Vote count animations (increment/decrement in real-time)
- Agent status indicators ("Moderator is analyzing this thread…")
- Typing indicators when other users are writing replies

---

## Phase 4: Agent Workflows (LangGraph)

### 4.1 Moderation Workflow

```
User reports content
    ↓
Coordinator creates moderation task
    ↓
Moderator agent receives task via bus
    ↓
Moderator reads content + context + user history
    ↓
Moderator decides: APPROVE | FLAG | REMOVE
    ↓
If REMOVE: content hidden, user notified
If FLAG: added to human review queue
If APPROVE: report dismissed, reporter notified
    ↓
Result published to bus → WebSocket → Frontend update
```

### 4.2 Summarization Workflow

```
Thread reaches 20+ replies
    ↓
Trigger published to bus
    ↓
Summarizer agent receives task
    ↓
Reads all replies, extracts key points
    ↓
Generates structured summary
    ↓
Posts summary as pinned reply
    ↓
Thread updated with summary_id
    ↓
Frontend shows collapsible summary at top of thread
```

### 4.3 Recommendation Workflow

```
User opens a thread
    ↓
Recommender agent triggered
    ↓
Analyzes thread content + tags + user history
    ↓
Searches for similar threads
    ↓
Returns ranked list with relevance scores
    ↓
Agent sidebar shows "Related Discussions"
```

---

## Phase 5: File-by-File Implementation Checklist

### Backend Files to Create:

| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI app setup, CORS, routers |
| `backend/app/domain/user.py` | User model |
| `backend/app/domain/category.py` | Category model |
| `backend/app/domain/thread.py` | Thread model |
| `backend/app/domain/reply.py` | Reply model |
| `backend/app/domain/vote.py` | Vote model |
| `backend/app/domain/message.py` | Message model (for bus) |
| `backend/app/domain/agent.py` | AgentProfile model |
| `backend/app/core/bus.py` | MessageBus (adapted from PlugAndPlayAgents) |
| `backend/app/core/runtime.py` | AgentRuntime (adapted from PlugAndPlayAgents) |
| `backend/app/core/tools.py` | Tool + ToolRegistry |
| `backend/app/core/default_tools.py` | Forum-specific tools |
| `backend/app/router/auth.py` | Auth endpoints |
| `backend/app/router/categories.py` | Category endpoints |
| `backend/app/router/threads.py` | Thread endpoints |
| `backend/app/router/replies.py` | Reply endpoints |
| `backend/app/router/votes.py` | Vote endpoints |
| `backend/app/router/search.py` | Search endpoints |
| `backend/app/router/agents.py` | Agent interaction endpoints |
| `backend/app/router/moderation.py` | Moderation endpoints |
| `backend/app/service/agent_factory.py` | Agent factory |
| `backend/app/service/agent_registry.py` | Load agent profiles |
| `backend/app/service/agent_triggers.py` | Event → agent task triggers |
| `backend/app/service/coordinator.py` | LLM-based workflow coordinator |
| `backend/app/service/bus_websocket_bridge.py` | Bus → WebSocket relay |
| `backend/app/store/database.py` | SQLAlchemy setup, session management |
| `backend/app/websocket/manager.py` | WebSocket connection manager |
| `backend/app/data/agents.json` | Agent profile definitions |
| `backend/tests/test_auth.py` | Auth tests |
| `backend/tests/test_threads.py` | Thread CRUD tests |
| `backend/tests/test_replies.py` | Reply tests |
| `backend/tests/test_votes.py` | Vote tests |
| `backend/tests/test_agents.py` | Agent tests |
| `backend/tests/test_bus.py` | MessageBus tests |

### Frontend Files to Create:

| File | Purpose |
|------|---------|
| `frontend/app/page.tsx` | Home page |
| `frontend/app/layout.tsx` | Root layout with navigation |
| `frontend/app/globals.css` | Tailwind + CSS variables |
| `frontend/app/login/page.tsx` | Login page |
| `frontend/app/register/page.tsx` | Registration page |
| `frontend/app/discuss/[slug]/page.tsx` | Category/thread list |
| `frontend/app/thread/[id]/page.tsx` | Thread view + replies |
| `frontend/app/search/page.tsx` | Search page |
| `frontend/app/user/[username]/page.tsx` | User profile |
| `frontend/app/moderation/page.tsx` | Moderation queue |
| `frontend/app/components/ThreadCard.tsx` | Thread list item |
| `frontend/app/components/ReplyCard.tsx` | Individual reply |
| `frontend/app/components/ReplyComposer.tsx` | Markdown reply editor |
| `frontend/app/components/AgentSidebar.tsx` | Agent panel in thread view |
| `frontend/app/components/CategoryNav.tsx` | Category sidebar/nav |
| `frontend/app/components/VoteButtons.tsx` | Upvote/downvote component |
| `frontend/app/components/TagBadge.tsx` | Tag display |
| `frontend/app/components/MarkdownRenderer.tsx` | Markdown with syntax highlighting |
| `frontend/app/components/SearchBar.tsx` | Search input with suggestions |
| `frontend/app/components/UserAvatar.tsx` | Avatar with reputation |
| `frontend/app/components/PixelOffice/` | Agent visualization (from PlugAndPlayAgents) |
| `frontend/lib/api.ts` | HTTP + WebSocket client |
| `frontend/lib/auth.ts` | JWT token management |
| `frontend/tests/` | Component tests |

---

## Phase 6: Forum-Specific Agent Tools

Default tools agents can use (extends standard read_file/write_file/search):

```python
# backend/app/core/forum_tools.py

# Content tools
def read_thread(thread_id: str) -> dict:
    """Read a thread and all its replies."""
    
def read_reply(reply_id: str) -> dict:
    """Read a specific reply."""

def post_summary(thread_id: str, content: str) -> dict:
    """Post a summary as a system reply."""

# Moderation tools
def flag_content(target_type: str, target_id: str, reason: str) -> dict:
    """Flag content for human review."""
    
def remove_content(target_type: str, target_id: str, reason: str) -> dict:
    """Remove violating content."""
    
def warn_user(user_id: str, message: str) -> dict:
    """Send a warning to a user."""

# Search/Recommendation tools
def search_threads(query: str, category: str = None, limit: int = 10) -> dict:
    """Search threads by content."""
    
def get_user_history(user_id: str) -> dict:
    """Get user's recent activity."""
    
def get_similar_threads(thread_id: str, limit: int = 5) -> dict:
    """Find threads similar to the given one."""
    
def get_trending(limit: int = 10) -> dict:
    """Get trending threads."""

# User tools
def get_user(user_id: str) -> dict:
    """Get user profile."""
    
def send_welcome_message(user_id: str) -> dict:
    """Send welcome message to new user."""
```

---

## Phase 7: Testing Strategy

### Backend Tests

- **Unit:** Model validation, tool execution, MessageBus pub/sub
- **Integration:** API endpoints with test database, agent tool-use loop
- **End-to-end:** Full moderation workflow, summarization pipeline

### Frontend Tests

- **Component:** ThreadCard, ReplyCard, VoteButtons render correctly
- **Integration:** ThreadView loads replies, WebSocket updates UI
- **PixelOffice:** Event adapter maps agent status to animations

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Browser                               │
│                 (Next.js Frontend :3000)                        │
│                                                                  │
│  ┌──────────┐  ┌───────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ ThreadView│  │AgentSidebar│  │ PixelOffice │  │  SearchBar  │ │
│  └─────┬─────┘  └─────┬─────┘  └──────┬──────┘  └──────┬──────┘ │
└────────┼──────────────┼───────────────┼───────────────┼────────┘
         │      HTTP & WebSocket        │               │
         └──────────────┬───────────────┴───────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│                  Backend (FastAPI :8000)                        │
│                                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ Routers  │  │  Coordinator │  │  Bus → WebSocket Bridge │  │
│  │ (auth,   │  │  (LLM-based  │  │  (real-time events)     │  │
│  │ threads, │  │   planning)  │  │                         │  │
│  │ replies, │  └──────┬───────┘  └─────────────────────────┘  │
│  │ votes,   │         │                                        │
│  │ search)  │         │                                        │
│  └────┬─────┘         │                                        │
│       │               │                                        │
│  ┌────▼───────────────▼─────────────────────────────────────┐ │
│  │                     MessageBus                            │ │
│  │  forum.moderation.flagged  forum.thread.{id}.new_reply   │ │
│  │  forum.summarizer.trigger  forum.recommend.request       │ │
│  │  session.{id}.agent.{agent}  session.{id}.result.{agent} │ │
│  └────┬──────────────┬──────────────┬──────────────┬────────┘ │
│       │              │              │              │           │
│  ┌────▼─────┐  ┌─────▼────┐  ┌─────▼────┐  ┌─────▼─────┐     │
│  │ Moderator│  │Summarizer│  │Recommender│  │  Search   │     │
│  │ AgentRun │  │AgentRun  │  │AgentRun   │  │ AgentRun  │     │
│  │ + tools  │  │ + tools  │  │ + tools   │  │ + tools   │     │
│  └──────────┘  └──────────┘  └───────────┘  └───────────┘     │
│                                                                  │
│  ┌──────────────┐  ┌──────────────────┐                        │
│  │ AgentFactory │  │  AgentRegistry   │                        │
│  └──────────────┘  └──────────────────┘                        │
│                                                                  │
│  ┌──────────────────────────────────────┐                       │
│  │           Database (SQLite)          │                       │
│  │  users | categories | threads        │                       │
│  │  replies | votes | tags | reports    │                       │
│  └──────────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
                         │
                ┌────────▼────────┐
                │   OpenAI API    │
                │   (GPT-4.1)     │
                └─────────────────┘
```

---

## Key Design Decisions from PlugAndPlayAgents

1. **MessageBus over direct calls:** Agents communicate asynchronously through topics, not direct function calls. This enables loose coupling and easy addition of new agents.

2. **AgentRuntime tool-use loop:** Every agent follows the same pattern — receive task → call LLM → use tools → update state → repeat. This ensures agents can take multi-step actions.

3. **Coordinator as orchestrator:** A central LLM-based coordinator decides which agents to invoke, not hardcoded workflows. Agents declare capabilities; coordinator routes tasks.

4. **Bus → WebSocket bridge:** All bus activity streams to the frontend in real-time. Users see agent progress, status changes, and results without polling.

5. **Agent profiles over hardcoded agents:** Agent capabilities are defined in JSON profiles. Adding a new agent means adding a profile + system prompt, not changing orchestration code.

6. **Forum-specific tools extend default tools:** Agents have forum-aware tools (read_thread, flag_content, post_summary) on top of standard tools (read_file, write_file, search).

---

## Getting Started (For Codebuff to Build)

1. Set up the backend FastAPI app with SQLAlchemy models
2. Implement REST endpoints (auth, threads, replies, votes, categories)
3. Set up WebSocket connection manager
4. Copy MessageBus from reference design docs
5. Create AgentRuntime and ToolRegistry
6. Define agent profiles in agents.json
7. Build AgentFactory that wires profiles → runtimes
8. Implement forum-specific tools
9. Wire bus events to WebSocket bridge
10. Set up agent triggers (on_new_thread, on_new_reply, etc.)
11. Build frontend pages and components
12. Wire frontend WebSocket to backend bus events

---

**Reference Files in this directory:**
- `ARCHITECTURE.md` — Full system architecture from PlugAndPlayAgents
- `AGENTS.md` — Agent system & profiles deep dive
- `MESSAGE_BUS.md` — MessageBus patterns and API
- `API.md` — REST & WebSocket API reference
- `DEVELOPMENT.md` — Code standards, testing, and workflow
- `DOCUMENTATION.md` — Documentation index and navigation
