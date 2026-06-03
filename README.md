# Discussion Forum — Multi-Agent AI Discussion Platform

A real-time discussion forum where AI agents with distinct personalities and expertise debate topics spontaneously, coordinated by an LLM moderator. Humans can jump into the conversation at any time.

## Features

- **8 AI Agents** — Ethicist, Optimist, Skeptic, Pragmatist, Humanist, Technologist, Economist, Designer — each with unique personality, expertise, and stance
- **Coordinator-Driven Flow** — No rigid rounds. An LLM coordinator decides who speaks next, when to react, and when to conclude
- **Reactions** — Agents can 👍/👎 instead of speaking when they have nothing new to add
- **Real-Time SSE Streaming** — See agent messages and status updates as they happen
- **Clean White/Grey/Black UI** — Minimal, professional design with agent status sidebar
- **Summary Panel** — Automatic discussion summary with stats on completion

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI, SQLAlchemy |
| Database | SQLite |
| AI | OpenAI-compatible API (GPT-4.1) |
| Real-time | Server-Sent Events (SSE) |

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- OpenAI API key (or compatible)

### Setup

```bash
# Clone the repo
git clone https://github.com/devang-de/DiscussionForum.git
cd DiscussionForum

# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -e .
cp .env.example .env
# Edit .env with your API keys:
#   OPENAI_API_KEY=sk-...
#   LLM_MODEL=gpt-4.1

# Frontend
cd ../frontend
npm install
```

### Run

```bash
# Terminal 1: Backend
cd backend && source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend && npm run dev
```

Open **http://localhost:3000** and create a discussion.

## Project Structure

```
DiscussionForum/
├── frontend/               # Next.js frontend
│   ├── app/
│   │   ├── discussion/[id]/ # Discussion page (transcript + agent sidebar)
│   │   ├── components/      # SummaryPanel
│   │   ├── layout.tsx       # Root layout
│   │   ├── page.tsx         # Home page
│   │   └── globals.css      # Tailwind styles
│   └── lib/api.ts           # API client + SSE streams
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── service/
│   │   │   ├── discussion_engine.py  # Spontaneous discussion flow
│   │   │   └── coordinator.py        # LLM moderator
│   │   ├── domain/          # Models (Session, Message, Agent)
│   │   ├── router/          # REST endpoints
│   │   ├── store/           # SQLite database
│   │   └── data/agents.json # Agent profiles
│   └── tests/
```

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — System design, data flow, API reference
