# Architecture — Multi-Agent Discussion Forum

A platform where users create discussion topics and watch a panel of AI agents debate spontaneously, coordinated by an LLM moderator.

## Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS | Discussion UI with real-time transcript |
| **Backend** | FastAPI (Python), SQLAlchemy, SQLite | Session management, discussion engine, API |
| **AI** | OpenAI-compatible API (GPT-4o by default) | Agent responses, coordinator decisions |
| **Streaming** | Server-Sent Events (SSE) | Real-time discussion flow to the frontend |
| **WebSocket** | FastAPI WebSocket + custom MessageBus | Optional real-time sync across connections |

## High-Level Architecture

```
┌──────────────────────┐     SSE / WebSocket     ┌──────────────────────┐
│                      │◄────────────────────────│                      │
│   Next.js Frontend   │────────────────────────►│   FastAPI Backend    │
│   (localhost:3000)   │  REST (POST/GET)        │   (localhost:8000)   │
│                      │                         │                      │
└──────────────────────┘                         └──────────┬───────────┘
                                                            │
                                                    ┌───────▼───────────┐
                                                    │   OpenAI API      │
                                                    │   (GPT-4o)        │
                                                    └───────────────────┘
```

## Backend Component Tree

```
main.py                          # FastAPI app, lifespan, CORS, singletons
├── router/sessions.py           # REST + SSE endpoints for sessions
├── router/agents.py             # Agent profile listing
├── websocket/manager.py         # WebSocket connection manager
│
├── service/
│   ├── coordinator.py           # LLM-driven moderator: scope, select agents, decide turns
│   └── discussion_engine.py     # Core loop: agent prompting, reaction parsing, streaming
│
├── domain/
│   ├── session.py               # Session, Participant, TurnState, SessionCreate models
│   ├── message.py               # DiscussionMessage, Reaction, MessageType
│   └── agent.py                 # AgentProfile, AgentPool models
│
├── core/
│   ├── llm.py                   # OpenAI API client (async, JSON mode, fallback)
│   └── bus.py                   # Internal pub/sub message bus
│
├── data/
│   ├── agents.json              # 8 pre-defined agent personas
│   └── __init__.py              # load_agent_pool() loader
│
└── store/
    └── database.py              # SQLAlchemy ORM: Session, Message, Reaction, Participant tables
```

## Discussion Flow

```
1. CREATE SESSION
   User submits topic → POST /api/sessions → Session created (state: created)

2. SCOPING (SSE stream)
   Frontend POSTs /api/sessions/{id}/scope →
   Coordinator.define_scope() → LLM analyzes topic → scope, key questions
   Coordinator.select_agents() → LLM picks 4-6 agents → displayed to user

3. DISCUSSION (SSE stream)
   User approves → POST /api/sessions/{id}/start →
   Engine enters spontaneous loop:
   ┌─────────────────────────────────────────────────┐
   │ Coordinator.decide_next_action() → LLM decides: │
   │   • "speak" → Engine builds prompt, agent responds via LLM  │
   │   • "react" → Engine records 👍/👎 on a message │
   │   • "guidance" → Coordinator redirects discussion │
   │   • "done" → loop exits, summary generated      │
   └─────────────────────────────────────────────────┘
   Each message/react is saved to DB and streamed as SSE.

4. SUMMARIZATION
   Coordinator.generate_summary() → LLM writes concise summary
   Final message streamed with is_final=true

5. HUMAN INTERJECTION
   User can send messages at any time via POST /api/sessions/{id}/message
   Engine handles: cancels current stream, saves human message, resumes discussion
```

## Key Design Decisions

- **No rigid rounds** — The LLM coordinator decides who speaks next based on conversation flow, not a fixed rotation
- **Reactions** — Agents embed `[REACT:message_id:👍]` tags in responses; engine parses them and saves as Reaction objects
- **Simulated responses** — When no OPENAI_API_KEY is configured, the LLM client returns sample responses for dev/testing
- **SQLite** — Simple, zero-config database. Sessions, messages, reactions, and participants are persisted
- **SSE over WebSocket** — SSE is used for the primary discussion stream (simpler, unidirectional). WebSocket is available for optional multi-client sync
- **MessageBus** — Internal pub/sub decouples the engine from I/O. The SSE router and WebSocket manager subscribe independently

## Data Flow (SSE Streaming)

```
Frontend                Backend                        LLM
   │                      │                              │
   │── POST /start ──────►│                              │
   │                      │── decide_next_action() ─────►│
   │                      │◄── {action: "speak", ...} ───│
   │                      │                              │
   │                      │── build prompt ─────────────►│
   │                      │◄── agent response ───────────│
   │                      │                              │
   │                      │── save message to DB         │
   │◄── SSE: {type:"message", message:{...}} ────────────│
   │                      │                              │
   │                      │── (repeat until "done")      │
   │                      │                              │
   │◄── SSE: {type:"summary", message:{...}} ────────────│
   │◄── SSE: {type:"complete"} ──────────────────────────│
```

## Frontend Component Tree

```
app/
├── layout.tsx                   # Root layout (Inter font, metadata)
├── page.tsx                     # Home page: create discussion form
├── discussion/[id]/page.tsx     # Discussion page: transcript + agent sidebar + SummaryPanel
├── components/
│   ├── SummaryPanel.tsx         # Overlay panel with stats + markdown summary
│   └── PixelOffice.tsx          # (Removed — formerly canvas-based agent viz)
├── globals.css                  # Tailwind utilities + custom component classes
│
lib/
└── api.ts                       # TypeScript API client: fetch, SSE stream helpers
```

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `OPENAI_API_KEY` | OpenAI API key for LLM calls | (required for live AI) |
| `OPENAI_BASE_URL` | OpenAI-compatible API endpoint | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | Model to use | `gpt-4o` |
| `NEXT_PUBLIC_API_URL` | Backend URL in frontend | `http://localhost:8000` |
