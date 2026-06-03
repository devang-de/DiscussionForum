# Documentation Index

Welcome to the Plug and Play Agents documentation. Here's what you need to read based on your role:

## Quick Navigation

### For First-Time Users

1. **[README.md](README.md)** ← Start here
   - Project overview
   - Key features
   - Getting started (5 min setup)
   - Basic usage workflows
   - Deployment guide

### For Developers

2. **[DEVELOPMENT.md](DEVELOPMENT.md)**
   - Development environment setup
   - Code style guide (Python & TypeScript)
   - Testing patterns and practices
   - Common development tasks
   - Troubleshooting guide
   - Git workflow

3. **[ARCHITECTURE.md](ARCHITECTURE.md)**
   - System architecture overview
   - Core concepts (AgentRuntime, MessageBus, TaskGraph)
   - Backend organization
   - Frontend architecture
   - Data models
   - Performance & security considerations

### For Advanced Topics

4. **[API.md](API.md)**
   - REST API endpoints
   - WebSocket real-time events
   - Data type definitions
   - Error responses
   - Example workflows

5. **[MESSAGE_BUS.md](MESSAGE_BUS.md)**
   - Message bus architecture
   - Topic-based routing with wildcards
   - Publishing and subscribing patterns
   - Integration with agents
   - Testing message flows
   - Troubleshooting

6. **[AGENTS.md](AGENTS.md)**
   - Agent system overview
   - AgentProfile specification
   - Included agent types
   - AgentRuntime execution model
   - Creating new agents
   - System prompts
   - Testing agents

## Documentation Map

```
README.md                  ← Overview & setup
  ├─ Quick Start
  ├─ Architecture (high-level)
  ├─ Usage (API examples)
  └─ Troubleshooting

DEVELOPMENT.md            ← How to code & test
  ├─ Environment setup
  ├─ Code standards
  ├─ Testing guide
  ├─ Adding tools
  ├─ Adding agents
  └─ Performance tips

ARCHITECTURE.md           ← How it all fits together
  ├─ Core concepts
  ├─ Backend structure
  ├─ Frontend structure
  ├─ Data models
  ├─ Workflows
  └─ Deployment

API.md                    ← HTTP & WebSocket API
  ├─ Endpoint reference
  ├─ Data types
  ├─ WebSocket events
  └─ Example usage

MESSAGE_BUS.md            ← How agents communicate
  ├─ Topic model
  ├─ Pub/sub patterns
  ├─ Integration patterns
  ├─ Testing
  └─ Troubleshooting

AGENTS.md                 ← Agent system details
  ├─ AgentProfile model
  ├─ Agent types
  ├─ AgentRuntime loop
  ├─ AgentFactory
  ├─ System prompts
  └─ Testing
```

## By Use Case

### "I want to run this locally"

→ [README.md](README.md#getting-started)

### "I want to understand the architecture"

→ [ARCHITECTURE.md](ARCHITECTURE.md)

### "I want to add a new feature"

→ [DEVELOPMENT.md](DEVELOPMENT.md) → [ARCHITECTURE.md](ARCHITECTURE.md)

### "I want to create a new agent"

→ [AGENTS.md](AGENTS.md)

### "I want to add a new tool"

→ [DEVELOPMENT.md](DEVELOPMENT.md#adding-a-new-tool) → [AGENTS.md](AGENTS.md)

### "I want to integrate with the API"

→ [API.md](API.md)

### "I want to understand agent communication"

→ [MESSAGE_BUS.md](MESSAGE_BUS.md)

### "Something isn't working"

→ [DEVELOPMENT.md](DEVELOPMENT.md#troubleshooting) → [README.md](README.md#troubleshooting)

### "I want to write tests"

→ [DEVELOPMENT.md](DEVELOPMENT.md#testing)

### "I want to optimize performance"

→ [ARCHITECTURE.md](ARCHITECTURE.md#performance-optimization) → [README.md](README.md#performance--scaling)

## Key Concepts Quick Reference

### AgentRuntime

**What**: Core execution engine for an AI agent  
**Where**: `backend/app/core/runtime.py`  
**Doc**: [AGENTS.md](AGENTS.md#agentruntime)

### MessageBus

**What**: Pub/sub system for agent communication  
**Where**: `backend/app/core/bus.py`  
**Doc**: [MESSAGE_BUS.md](MESSAGE_BUS.md)

### TaskGraph

**What**: DAG of tasks with dependencies  
**Where**: `backend/app/domain/task.py`  
**Doc**: [ARCHITECTURE.md](ARCHITECTURE.md#taskgraph--taskexecutor)

### TaskExecutor

**What**: Executes task graphs in parallel  
**Where**: `backend/app/service/task_executor.py`  
**Doc**: [ARCHITECTURE.md](ARCHITECTURE.md#taskgraph--taskexecutor)

### Coordinator

**What**: LLM-based planning and decision-making  
**Where**: `backend/app/service/coordinator.py`  
**Doc**: [ARCHITECTURE.md](ARCHITECTURE.md#coordinator)

### AgentFactory

**What**: Creates configured AgentRuntime instances  
**Where**: `backend/app/service/agent_factory.py`  
**Doc**: [AGENTS.md](AGENTS.md#agentfactory)

### AgentProfile

**What**: Specification of agent capabilities  
**Where**: `backend/app/domain/agent.py`  
**Doc**: [AGENTS.md](AGENTS.md#agentprofile)

### ToolRegistry

**What**: Registry of callable tools agents can use  
**Where**: `backend/app/core/tools.py`  
**Doc**: [ARCHITECTURE.md](ARCHITECTURE.md#tool-system)

## Typical Developer Workflows

### Setting Up the Project

1. Clone repo
2. Read [README.md](README.md#getting-started)
3. Follow setup commands
4. Run tests from [DEVELOPMENT.md](DEVELOPMENT.md#testing)

### Adding a Backend Feature

1. Read [ARCHITECTURE.md](ARCHITECTURE.md#backend-architecture)
2. Identify which service layer to modify
3. Check [DEVELOPMENT.md](DEVELOPMENT.md) for code standards
4. Write tests following patterns in [DEVELOPMENT.md](DEVELOPMENT.md#backend-testing)
5. Update agents if new tools are needed

### Adding a Frontend Component

1. Read [ARCHITECTURE.md](ARCHITECTURE.md#frontend-architecture)
2. Check existing components in `frontend/app/components/`
3. Follow TypeScript standards from [DEVELOPMENT.md](DEVELOPMENT.md#typescript-frontend)
4. Write component tests (examples in [DEVELOPMENT.md](DEVELOPMENT.md#frontend-testing))

### Adding a New Agent

1. Read [AGENTS.md](AGENTS.md#agentprofile)
2. Define profile in `backend/app/data/agents.json`
3. Create system prompt (examples in [AGENTS.md](AGENTS.md#system-prompts))
4. Add to registry (`backend/app/service/agent_registry.py`)
5. Test following [AGENTS.md](AGENTS.md#testing-agents)

### Debugging an Issue

1. Check [DEVELOPMENT.md](DEVELOPMENT.md#troubleshooting)
2. Check [README.md](README.md#troubleshooting)
3. Read relevant architecture doc ([ARCHITECTURE.md](ARCHITECTURE.md), [MESSAGE_BUS.md](MESSAGE_BUS.md), etc.)
4. Write minimal test case to reproduce
5. Check logs and add debug logging

## External References

- **Existing Plans**: See `plan.md` and `project-plans.md` in repo root
- **FastAPI**: https://fastapi.tiangolo.com/
- **Next.js**: https://nextjs.org/docs
- **Pydantic**: https://docs.pydantic.dev/
- **React Hooks**: https://react.dev/reference/react/hooks
- **TypeScript**: https://www.typescriptlang.org/docs/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **Pytest**: https://docs.pytest.org/
- **Vitest**: https://vitest.dev/

## Document Status

| Document        | Status      | Last Updated | Coverage                                 |
| --------------- | ----------- | ------------ | ---------------------------------------- |
| README.md       | ✅ Complete | May 2026     | Overview, setup, usage, deployment       |
| DEVELOPMENT.md  | ✅ Complete | May 2026     | Setup, testing, code style, common tasks |
| ARCHITECTURE.md | ✅ Complete | May 2026     | System design, components, data models   |
| API.md          | ✅ Complete | May 2026     | Endpoints, WebSocket events, examples    |
| MESSAGE_BUS.md  | ✅ Complete | May 2026     | Bus system, patterns, testing            |
| AGENTS.md       | ✅ Complete | May 2026     | Agent profiles, runtime, creation        |

## Contributing to Documentation

When adding features:

1. Update relevant docs
2. Add example code if applicable
3. Update this index if creating new docs
4. Keep docs close to code (same repo)
5. Link to code files where appropriate

## Quick Links

- **Source Code**: `backend/app/` and `frontend/app/`
- **Tests**: `backend/tests/` and `frontend/tests/`
- **Data**: `backend/app/data/`
- **Configuration**: `pyproject.toml`, `tsconfig.json`, `next.config.ts`

---

**Note**: This documentation is version 0.1.0 and covers the active development state. See `plan.md` for upcoming architectural changes.

For questions or issues with documentation, open a GitHub issue or submit a PR.
