# Development Guide

This guide covers setup, coding standards, testing practices, and common development tasks.

## Quick Start

### Setup (5 minutes)

```bash
# Clone and navigate
git clone <repo>
cd PlugAndPlayAgents

# Backend
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
# Edit .env with your keys

# Frontend (new terminal)
cd frontend
node --version  # Verify 18+
npm install

# Start both
# Terminal 1:
cd backend && source venv/bin/activate && uvicorn app.main:app --reload

# Terminal 2:
cd frontend && npm run dev

# Open http://localhost:3000/call-room
```

### Environment Variables

**Backend** (`backend/.env`):

```bash
OPENAI_API_KEY=sk-...          # Required for LLM calls
GITHUB_TOKEN=ghp_...           # Required for GitHub API
GITHUB_API_URL=https://api.github.com
DATABASE_URL=sqlite:///app.db  # For future use
LOG_LEVEL=INFO
DEBUG=false
```

**Frontend** (`frontend/.env.local`):

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### First Test Run

```bash
# Backend
cd backend
pytest tests/test_runtime.py -v
pytest tests/test_bus.py -v

# Frontend
cd frontend
npm test
```

## Code Structure

### Backend Organization

```
backend/app/
├── core/        ← Core infrastructure (reusable, testable)
│   ├── runtime.py      AgentRuntime: LLM + tools loop
│   ├── bus.py          MessageBus: pub/sub
│   ├── tools.py        Tool registry
│   ├── default_tools.py Built-in tools
│   └── agent_factory.py Factory for runtimes
│
├── domain/      ← Data models (Pydantic, no logic)
│   ├── agent.py        AgentProfile
│   ├── message.py      Message
│   ├── session.py      Session
│   ├── task.py         TaskNode, TaskGraph
│   └── github.py       GitHub models
│
├── service/     ← Business logic (orchestration, workflows)
│   ├── orchestration.py Main workflow
│   ├── coordinator.py    Planning & decision-making
│   ├── task_executor.py  DAG execution
│   ├── agent_factory.py  Concrete factory
│   ├── agent_registry.py Profile loading
│   ├── bus_websocket_bridge.py Event relay
│   ├── workspace_manager.py Isolated workspaces
│   ├── discussion.py    Planning chat
│   ├── deployment.py    Deploy logic
│   ├── github_subtasks.py GitHub issue creation
│   ├── llm.py           LLM provider integration
│   └── ...
│
├── router/      ← REST API endpoints
│   ├── sessions.py     /sessions endpoints
│   ├── agents.py       /agents endpoints
│   └── github.py       /github endpoints
│
├── store/       ← Data persistence
│   └── memory.py       In-memory storage (→ DB later)
│
├── websocket/   ← Real-time communication
│   └── manager.py      WebSocket connections
│
├── utils/       ← Helpers (GitHub client, parsers, etc.)
│
└── main.py      ← FastAPI app setup
```

### Frontend Organization

```
frontend/
├── app/
│   ├── call-room/
│   │   └── page.tsx           Main session interface
│   │
│   ├── components/
│   │   ├── ChatTranscript.tsx    Message history
│   │   ├── TaskGraphDAG.tsx      Dependency visualization
│   │   ├── IssueInput.tsx        GitHub URL input
│   │   └── PixelOffice/
│   │       ├── PixelOffice.tsx       Canvas visualization
│   │       ├── eventAdapter.ts       Runtime → visual state
│   │       ├── types.ts              Type definitions
│   │       └── ...
│   │
│   ├── page.tsx              Home page
│   ├── layout.tsx            Root layout
│   ├── globals.css           Tailwind setup
│   │
│   └── ... other app routes
│
├── lib/
│   └── api.ts                HTTP & WebSocket client
│
├── public/
│   └── pixel-agents/         Sprite assets
│
├── tests/
│   ├── setup.ts              Test configuration
│   └── *.test.tsx            Component tests
│
├── package.json
├── tsconfig.json
├── next.config.ts
└── vitest.config.ts
```

## Coding Standards

### Python (Backend)

**Style Guide**: PEP 8 with type hints

```python
"""Module docstring with one-line summary.

Extended description if needed, including:
- What this module does
- Key classes and functions
- Important implementation notes
"""

from typing import Any, Dict, List, Optional
from dataclasses import dataclass

# Constants: UPPER_CASE
MAX_RETRIES = 3
DEFAULT_TIMEOUT = 15

# Classes: PascalCase
class MessageBus:
    """Pub/sub message bus for agent communication.

    Topic-based routing with wildcard support and bounded history.
    """

    def __init__(self, max_history: int = 100) -> None:
        """Initialize the bus.

        Args:
            max_history: Max messages per topic to keep (for late joiners).
        """
        self._history: Dict[str, List[BusMessage]] = {}
        self._subscribers: Dict[str, List[Callable]] = {}
        self._max_history = max_history

    async def publish(
        self,
        topic: str,
        sender: str,
        content: Dict[str, Any],
    ) -> None:
        """Publish a message to a topic.

        Args:
            topic: Target topic (supports wildcards: session.*.status)
            sender: Identifier of sender (agent_id or 'coordinator')
            content: Message payload
        """
        # Implementation...

# Functions: snake_case
def _safe_resolve(relative_path: str) -> str:
    """Resolve a path, ensuring it stays within project root."""
    # ...

# Type hints everywhere
def add_numbers(a: int, b: int) -> int:
    return a + b

# Docstrings for all public APIs
async def expensive_computation() -> str:
    """Do expensive computation asynchronously.

    Returns:
        The result string.

    Raises:
        ValueError: If computation fails.
    """
    # ...
```

**Async/Await**: Use async for I/O-bound operations (tools, bus, LLM)

```python
# Good: Async for tools
async def execute_agent_task(agent: AgentRuntime) -> str:
    return await agent.run("Do something")

# Good: Concurrent tasks
results = await asyncio.gather(
    agent1.run("Task 1"),
    agent2.run("Task 2"),
    agent3.run("Task 3"),
)
```

**Error Handling**: Specific exceptions with context

```python
try:
    with open(file_path, "r") as f:
        return f.read()
except FileNotFoundError:
    logger.error(f"File not found: {file_path}")
    return {"error": f"File not found: {file_path}", "path": file_path}
except Exception as e:
    logger.exception(f"Failed to read {file_path}: {e}")
    raise
```

### TypeScript (Frontend)

**Style Guide**: TypeScript strict mode, ESLint, Prettier

```typescript
// Imports organized: external → internal → types
import React, { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/Button";
import type { Session, Message } from "@/lib/api";

// Type definitions come first
interface SessionProps {
  sessionId: string;
  onMessageSent?: (msg: string) => void;
}

interface SessionState {
  messages: Message[];
  isLoading: boolean;
  error: Error | null;
}

// Components: PascalCase, full JSDoc
/**
 * Displays the call room interface for an active session.
 *
 * Shows chat, task graph, and agent visualization in real-time.
 */
export default function CallRoom({ sessionId, onMessageSent }: SessionProps) {
  // State: use descriptive names
  const [state, setState] = useState<SessionState>({
    messages: [],
    isLoading: false,
    error: null,
  });

  // Callbacks: use useCallback to prevent unnecessary re-renders
  const handleMessageSend = useCallback(async (content: string) => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const response = await fetch(`/api/sessions/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error("Failed to send message");
      onMessageSent?.(content);
    } catch (error) {
      setState(prev => ({ ...prev, error: error as Error }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [sessionId, onMessageSend]);

  return <div>{/* UI */}</div>;
}

// Utilities: camelCase functions
export async function fetchSessionData(sessionId: string): Promise<Session> {
  const response = await fetch(`/api/sessions/${sessionId}`);
  if (!response.ok) throw new Error("Failed to fetch session");
  return response.json();
}

// Constants: UPPER_CASE
const POLL_INTERVAL_MS = 1000;
const MAX_RETRIES = 3;
```

## Testing

### Backend Testing

**Unit Tests**: Core infrastructure and domain models

```python
# tests/test_runtime.py
import pytest
from app.core.runtime import AgentRuntime
from app.core.tools import Tool, ToolRegistry

@pytest.fixture
def mock_llm():
    """Mock LLM for deterministic testing."""
    async def _mock(messages, tools, model):
        # Return predefined response
        return {
            "choices": [{"message": {
                "tool_calls": [{"id": "call_1", "function": {"name": "read_file", "arguments": '{"path": "README.md"}'}}]
            }}]
        }
    return _mock

@pytest.mark.asyncio
async def test_agent_tool_use(mock_llm):
    """Test that agent can call tools."""
    tools = ToolRegistry()
    tools.register(Tool(
        name="read_file",
        description="Read a file",
        parameters={"type": "object", "properties": {"path": {"type": "string"}}},
        fn=lambda path: {"content": "test"},
    ))

    agent = AgentRuntime(
        agent_id="test",
        tools=tools,
        llm_call=mock_llm,
    )

    result = await agent.run("Read README.md")
    assert "README" in result or "test" in result
```

**Integration Tests**: End-to-end workflows

```python
# tests/test_vertical_slice.py
@pytest.mark.asyncio
async def test_full_workflow():
    """Test complete issue → deployment workflow."""
    session = Session(id="test_sess")
    bus = MessageBus()

    # Create coordinator and agents
    coordinator = Coordinator(bus=bus, session_id=session.id)

    # Analyze issue
    await coordinator.analyze(session)
    assert session.status != SessionStatus.NEW

    # Plan and execute
    graph = await coordinator.create_task_graph(session)
    executor = TaskExecutor(bus=bus, session_id=session.id)

    report = await executor.execute_graph(graph)
    assert report.total_tasks == len(graph.nodes)
```

**Fixtures**: Reusable test setup

```python
@pytest.fixture
def temp_workspace(tmp_path):
    """Isolated workspace for testing."""
    return str(tmp_path)

@pytest.fixture
async def message_bus():
    """In-memory message bus."""
    return MessageBus()

@pytest.fixture
async def session(message_bus):
    """Test session with bus."""
    return Session(
        id="test",
        # ...
    )
```

### Frontend Testing

**Component Tests**: Vitest + React Testing Library

```typescript
// tests/page.test.tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CallRoom from "@/app/call-room/page";

describe("CallRoom", () => {
  beforeEach(() => {
    // Mock fetch
    global.fetch = vi.fn();
  });

  it("displays session loading state", () => {
    render(<CallRoom />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("displays messages after loading", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: "sess_1",
          messages: [
            { id: "msg_1", sender: "coordinator", content: "Hello" },
          ],
        }),
      })
    );

    render(<CallRoom />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
  });

  it("sends message on input", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));

    render(<CallRoom />);

    const input = screen.getByPlaceholderText(/type a message/i);
    await user.type(input, "Start planning");
    await user.click(screen.getByText("Send"));

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/message"),
      expect.objectContaining({ method: "POST" })
    );
  });
});
```

**Running Tests**

```bash
# Backend
cd backend
pytest                          # Run all
pytest tests/test_runtime.py    # Specific file
pytest -k "tool_use"            # By pattern
pytest -v --tb=short            # Verbose + short tracebacks
pytest --cov                    # With coverage report

# Frontend
cd frontend
npm test                        # Run all (watch mode)
npm test -- --run               # Single run (CI)
npm test -- page.test.tsx       # Specific file
npm test -- --coverage          # With coverage
```

## Common Tasks

### Adding a New Tool

1. **Implement function** in `backend/app/core/default_tools.py`:

```python
def _custom_tool(param: str) -> dict[str, Any]:
    """Do custom thing with param."""
    try:
        result = perform_operation(param)
        return {"result": result}
    except Exception as e:
        return {"error": str(e)}
```

2. **Create Tool object**:

```python
tool = Tool(
    name="custom_tool",
    description="Does custom thing with text",
    parameters={
        "type": "object",
        "properties": {
            "param": {"type": "string", "description": "Input parameter"}
        },
        "required": ["param"],
    },
    fn=_custom_tool,
)
```

3. **Register it**:

```python
def create_default_tools() -> ToolRegistry:
    registry = ToolRegistry()
    # ... other tools ...
    registry.register(tool)
    return registry
```

4. **Allow agents to use it** in `backend/app/data/agents.json`:

```json
{
  "id": "frontend_developer",
  "allowed_tools": ["read_file", "write_file", "custom_tool"]
  // ...
}
```

5. **Test it**:

```python
@pytest.mark.asyncio
async def test_custom_tool():
    tools = ToolRegistry()
    tools.register(tool)

    agent = AgentRuntime(agent_id="test", tools=tools)
    result = await agent.run("Use custom_tool with param 'test'")
    assert "result" in result or "error" in result
```

### Adding a New Agent

1. **Define profile** in `backend/app/data/agents.json`:

```json
{
  "id": "security_auditor",
  "name": "Security Auditor",
  "skills": ["security", "owasp", "penetration-testing"],
  "description": "Audits code for security vulnerabilities",
  "allowed_tools": ["read_file", "search_code", "run_command"],
  "preferred_file_scopes": ["**/*.py", "**/*.ts"],
  "can_modify_files": false,
  "can_review": true,
  "can_deploy": false
}
```

2. **Generate system prompt** or use default in `AgentFactory.create_agent()`:

```python
system_prompt = f"""
You are the {profile.name}. Your role: {profile.description}

Skills: {', '.join(profile.skills)}

You can use these tools:
{list_tools_desc}

Constraints:
- You cannot modify files
- Focus on finding vulnerabilities and recommending fixes
- Report issues with severity levels
"""
```

3. **Test agent creation**:

```python
@pytest.mark.asyncio
async def test_security_auditor_creation():
    registry = AgentRegistry()
    profile = registry.get("security_auditor")

    factory = AgentFactory(bus=MessageBus(), session_id="test")
    agent = factory.create_agent(profile)

    assert agent.agent_id == "security_auditor"
    assert "read_file" in agent.tools.list_tools()
```

### Adding a New Endpoint

1. **Create router** in `backend/app/router/`:

```python
# backend/app/router/security.py
from fastapi import APIRouter, HTTPException
from app.domain.agent import AgentProfile

router = APIRouter(prefix="/security", tags=["security"])

@router.get("/audit/{session_id}")
async def get_audit_report(session_id: str) -> dict:
    """Get security audit report for session."""
    session = get_session(session_id)  # Your session store
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "session_id": session_id,
        "audit_results": session.security_audit or [],
    }
```

2. **Include in main.py**:

```python
# backend/app/main.py
from app.router import security

app.include_router(security.router)
```

3. **Test it**:

```python
@pytest.mark.asyncio
async def test_audit_endpoint(client, session):
    response = client.get(f"/security/audit/{session.id}")
    assert response.status_code == 200
    assert "audit_results" in response.json()
```

### Debugging an Agent

```python
import logging

# Enable debug logging
logging.basicConfig(level=logging.DEBUG)

# Mock LLM to see what's being sent
async def debug_llm(messages, tools, model):
    print("Messages sent to LLM:")
    for msg in messages:
        print(f"  {msg['role']}: {msg['content'][:100]}...")
    print(f"Tools available: {[t['function']['name'] for t in tools]}")

    # Return a real call or mock
    return await real_llm_call(messages, tools, model)

# Create agent with debug LLM
agent = AgentRuntime(
    agent_id="debug_agent",
    llm_call=debug_llm,
    tools=tools,
)

# Run and observe
result = await agent.run("Test task")
print(f"Result: {result}")
```

### Running a Single Test

```bash
# Backend
cd backend
pytest tests/test_runtime.py::test_agent_tool_use -v

# Frontend
cd frontend
npm test -- page.test.tsx -t "displays session"
```

### Profiling Slow Code

```python
import time
import logging

logger = logging.getLogger(__name__)

def timed(func):
    """Decorator to measure function execution time."""
    async def wrapper(*args, **kwargs):
        start = time.time()
        try:
            return await func(*args, **kwargs) if asyncio.iscoroutinefunction(func) else func(*args, **kwargs)
        finally:
            duration = time.time() - start
            logger.info(f"{func.__name__} took {duration:.2f}s")
    return wrapper

@timed
async def slow_operation():
    # ...
    pass
```

## Troubleshooting

### Backend Import Errors

```
ModuleNotFoundError: No module named 'app'
```

**Fix**: Install in editable mode from backend directory

```bash
cd backend
pip install -e .
```

### Type Errors in Frontend

```
Type 'X' is not assignable to type 'Y'
```

**Fix**: Check `tsconfig.json` is in strict mode and build:

```bash
cd frontend
npm run build
```

### WebSocket Timeout

**Symptom**: UI shows "connecting..." forever

**Fix**:

1. Check backend is running: `curl http://localhost:8000/health`
2. Check WebSocket bridge is installed: `app.service.bus_websocket_bridge` in main.py
3. Check CORS: frontend origin is in allowed list in `main.py`

### Agent Not Using Tool

**Symptom**: Agent says "I cannot use this tool"

**Check**:

1. Tool is registered in agent's `ToolRegistry`
2. Tool name is in agent's `allowed_tools` list (not just global list)
3. LLM can see tool in prompt: enable debug logging

### Tests Hang

**Symptom**: Pytest/npm test doesn't finish

**Fix**:

1. Check for infinite loops or missing `await`
2. Ensure all async operations are awaited
3. Add timeout: `pytest --timeout=10`

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/add-new-agent

# Make changes, test locally
pytest
npm test

# Commit with clear message
git commit -m "feat(agent): add security auditor agent"

# Push and create PR
git push origin feature/add-new-agent

# After review and CI passes, merge
git merge feature/add-new-agent
```

## Performance Optimization Tips

1. **Use async for I/O**: Don't block event loop
2. **Batch LLM calls**: Combine multiple prompts
3. **Cache profiles**: Load agent profiles once
4. **Limit history**: Truncate messages in context
5. **Set tool budgets**: Max tool calls per agent
6. **Profile hot paths**: Use `cProfile` for CPU, `memory_profiler` for memory

## Security Checklist

- [ ] Path validation in file tools
- [ ] Command injection prevention
- [ ] API key not logged
- [ ] Session IDs are UUIDs (unpredictable)
- [ ] Rate limits on endpoints
- [ ] CORS origins whitelist
- [ ] Input validation on all endpoints
- [ ] Error messages don't leak paths/keys

---

**Happy coding!** 🚀

For more, see the main [README.md](README.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
