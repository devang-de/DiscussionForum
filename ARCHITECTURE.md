# Architecture Documentation

## System Overview

Plug and Play Agents is a multi-agent orchestration system where:

1. **A Coordinator** (LLM-based) understands user requirements and creates a task plan
2. **Specialized Agents** (AgentRuntime instances) execute tasks with tools
3. **A Message Bus** enables asynchronous agent communication
4. **A Task Executor** manages dependencies and parallelism
5. **A Frontend UI** visualizes progress in real-time

## Core Concepts

### AgentRuntime

The `AgentRuntime` is the fundamental execution unit for any AI agent. It implements a tool-use loop:

```
START
  ↓
Wait for incoming message on bus
  ↓
Call LLM with system prompt + conversation history
  ↓
Parse LLM response for tool calls
  ↓
Execute tools (read_file, write_file, run_command, etc.)
  ↓
Update message history with tool results
  ↓
Is task done? → YES: Publish result and exit
             → NO: Loop back to LLM call
```

**Key Features**:

- Async, event-driven execution
- Tool budget (max calls per task, default 50)
- Graceful error handling with retries
- Automatic bus integration (publish status, subscribe to messages)
- Model-agnostic (works with any LLM provider via `llm_call` callback)

**Relevant Code**: `backend/app/core/runtime.py`

### MessageBus

A pub/sub system for agent-to-agent communication without a central orchestrator.

**Topic Model**:

```
session.{session_id}.agent.{agent_id}    ← Directed message to agent
session.{session_id}.broadcast            ← Broadcast to all agents
session.{session_id}.result.{agent_id}    ← Agent publishes result
session.{session_id}.status.{agent_id}    ← Agent publishes status
system.agent.spawn                        ← Lifecycle events
```

**Wildcards Supported**:

```
session.*.status.*                        ← All agent status updates
session.sess_123.result.*                 ← All results in session
```

**Guarantees**:

- FIFO message ordering per topic
- Bounded history (last 100 messages per topic) for late joiners
- Async pub/sub with callback support
- Bridge callbacks for WebSocket relay

**Relevant Code**: `backend/app/core/bus.py`

### TaskGraph & TaskExecutor

A `TaskGraph` is a DAG (directed acyclic graph) of work units with dependencies.

**TaskNode Structure**:

```python
TaskNode(
    id="task_1",
    title="Implement login form",
    owner_agent="frontend_developer",
    kind=TaskKind.WORK,                    # or QUALITY_GATE, REWORK
    dependencies=["task_design"],           # Blocks until these complete
    quality_gate=QualityGate(...),         # If this is a gate task
    status=TaskStatus.READY,               # PENDING → READY → IN_PROGRESS → DONE/FAILED
    result="implementation complete",
    error=None,
)
```

**TaskExecutor Algorithm**:

1. Topological sort to find initial ready tasks
2. Dispatch ready tasks to agents via bus (concurrent)
3. Wait for results via `session.{id}.result.{agent_id}` subscriptions
4. Update task statuses and re-evaluate readiness
5. Repeat until all tasks done or graph is blocked
6. Handle failures: mark dependents as BLOCKED
7. Trigger rework loops for failed quality gates

**Parallelism**: All tasks with no blocking dependencies run simultaneously.

**Rework Routes**:

```python
ReworkRoute(
    owner_agent="frontend_developer",
    target_agent="frontend_developer",     # Who fixes it
    category="implementation",
    affected_task_ids=["task_1"],          # What to rerun
    max_attempts=3
)
```

If a quality gate fails, the executor creates a REWORK task, executes it, then reruns the gate.

**Relevant Code**: `backend/app/service/task_executor.py`

### Tool System

Tools are callable actions agents can invoke. Each tool is:

```python
Tool(
    name="read_file",
    description="Read a file from the codebase",
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "File path"}
        },
        "required": ["path"],
    },
    fn=async_or_sync_function,
)
```

**Built-in Tools**:

- `read_file(path, max_length=50000)` → File contents
- `write_file(path, content)` → Success/error
- `search_code(pattern, path=".", max_results=50)` → Matching lines
- `search_files(pattern, root=".")` → Matching file paths
- `list_directory(path)` → Directory contents
- `run_command(command, cwd=".")` → Command output

**Safety Constraints**:

- Path traversal blocked (paths stay within project root)
- Commands restricted (no destructive or network operations)
- Output truncated (50KB max per tool result)
- Execution timeouts enforced

**Relevant Code**: `backend/app/core/default_tools.py`, `backend/app/core/tools.py`

### Agent Profiles

An `AgentProfile` specifies an agent's:

- **Identity**: id, name
- **Capabilities**: skills, allowed_actions, allowed_tools
- **Scope**: preferred_file_scopes, domains
- **Constraints**: can_modify_files, can_review, can_deploy
- **System Prompt**: Instructions for the agent

Profiles are loaded from `backend/app/data/agents.json` and used by:

- **AgentFactory**: To configure runtimes
- **Coordinator**: To select appropriate agents
- **TaskExecutor**: To dispatch tasks to capable agents

**Relevant Code**: `backend/app/domain/agent.py`, `backend/app/service/agent_registry.py`

## Workflow Sequence

### End-to-End Flow

```
1. User provides GitHub issue URL
   └─→ Frontend: POST /sessions with issue_url
       └─→ Backend creates Session

2. Coordinator analyzes issue
   └─→ Coordinator LLM call: "Understand this requirement"
       └─→ Extract requirements, tech stack, effort estimate

3. Select planning agents
   └─→ Coordinator LLM: "Which agents should discuss this?"
       └─→ Based on AgentProfile skills & description

4. Planning discussion
   └─→ AgentFactory creates runtimes for selected agents
       └─→ Each agent receives task description via bus
       └─→ Agents reason about approach, ask questions (@mentions)
       └─→ Coordinator monitors discussion, decides when to finalize

5. Coordinator creates task graph
   └─→ LLM call: "Create a task DAG with dependencies"
       └─→ Output: List of tasks, dependencies, quality gates

6. Select execution agents
   └─→ Based on task owner_agent and AgentProfile

7. Execute task graph
   └─→ TaskExecutor runs the DAG
       └─→ For each ready task:
           └─→ Dispatch to agent via bus
           └─→ Agent uses tools (read_file, write_file, run_command)
           └─→ Agent publishes result to result topic
           └─→ Executor collects result, updates status

8. Quality gates
   └─→ QA agent runs tests, linters, type-checks
       └─→ If PASS: Continue
       └─→ If FAIL: Trigger rework_route

9. Rework (if needed)
   └─→ TaskExecutor creates REWORK task
       └─→ Target agent fixes issues
       └─→ Rerun quality gate

10. Deployment
    └─→ DevOps agent deploys code
        └─→ QA validates deployment
        └─→ Post results to GitHub

11. Deliver results
    └─→ Coordinator posts final comment to GitHub issue
        └─→ Include: Plan summary, task results, deployed URL, lessons learned
```

### Message Flow During Execution

```
Coordinator publishes:
  session.{id}.broadcast: {
    "type": "task_ready",
    "task_id": "task_1",
    "agent_id": "frontend_developer",
    "content": "Implement login form..."
  }

Frontend AgentRuntime subscribes to:
  session.{id}.agent.frontend_developer

Runtime receives message → Calls LLM → Executes tools → Publishes result:
  session.{id}.result.frontend_developer: {
    "task_id": "task_1",
    "status": "done",
    "content": "Created app/components/LoginForm.tsx with...",
    "files_created": ["app/components/LoginForm.tsx"],
  }

TaskExecutor subscribes to:
  session.{id}.result.*

Executor receives result → Updates task status → Evaluates next ready tasks
```

## Backend Architecture

### Directory Breakdown

```
backend/app/
├── core/                       Core infrastructure (no business logic)
│   ├── runtime.py             AgentRuntime: Tool-use loop with LLM
│   ├── bus.py                 MessageBus: Pub/sub system
│   ├── tools.py               Tool and ToolRegistry classes
│   ├── default_tools.py       Built-in tools (read_file, write_file, etc.)
│   └── agent_factory.py       Creates AgentRuntime instances from profiles
│
├── domain/                     Domain models (pure data, no logic)
│   ├── agent.py               AgentProfile
│   ├── message.py             Message (agent-to-agent communication)
│   ├── session.py             Session (workflow state)
│   ├── task.py                TaskNode, TaskGraph, TaskStatus, QualityGate
│   └── github.py              GitHub-related models
│
├── service/                    Business logic & orchestration
│   ├── orchestration.py       Main workflow (being refactored)
│   ├── coordinator.py         LLM-based coordinator
│   ├── task_executor.py       DAG execution engine
│   ├── agent_factory.py       Factory for creating agents
│   ├── agent_registry.py      Loads agent profiles from JSON
│   ├── bus_websocket_bridge.py Streams bus events to frontend
│   ├── workspace_manager.py   Manages isolated execution workspaces
│   ├── llm.py                 LLM provider integration
│   ├── discussion.py          Planning discussion with AutoGen
│   ├── deployment.py          Deployment logic
│   ├── github_subtasks.py     GitHub issue creation
│   ├── github_client.py       GitHub API wrapper
│   └── ...
│
├── router/                     API endpoints (FastAPI routers)
│   ├── sessions.py            /sessions endpoints
│   ├── agents.py              /agents endpoints
│   └── github.py              /github endpoints
│
├── store/                      Data persistence
│   └── memory.py              In-memory session store
│
├── websocket/                  WebSocket communication
│   └── manager.py             ConnectionManager for real-time events
│
├── utils/                      Helpers
│   ├── github_client.py       GitHub API client
│   └── github_parser.py       GitHub issue parsing
│
└── main.py                     FastAPI app setup
```

### Dependency Graph

```
FastAPI app (main.py)
  │
  ├─→ Routers (sessions, agents, github)
  │   └─→ Service layer (orchestration, coordinator, task_executor, etc.)
  │       └─→ Core layer (runtime, bus, tools)
  │           └─→ Domain models (agent, session, task, message)
  │
  └─→ WebSocket bridge (bus_websocket_bridge.py)
      └─→ Core bus
          └─→ WebSocket manager
```

**Inversion of Control**:

- Config and dependencies are injected (bus, registry, etc.)
- No global state (except event loop reference)
- Easy to mock for testing

### Key Service Classes

#### Coordinator

```python
class Coordinator:
    async def analyze(session: Session) → dict:
        """LLM: Understand the GitHub issue"""

    async def select_planning_agents(session: Session) → list[str]:
        """LLM: Which agents should discuss this?"""

    async def run_discussion(session: Session, agents: list[str]) → None:
        """Start planning discussion with AutoGen"""

    async def create_task_graph(session: Session) → TaskGraph:
        """LLM: Create task DAG with dependencies"""

    async def select_execution_agents(graph: TaskGraph) → list[str]:
        """Based on task owner_agent, which agents to start?"""

    async def decide_on_rework(gate: QualityGate) → ReworkRoute | None:
        """Does this need rework? If so, route to which agent?"""
```

#### TaskExecutor

```python
class TaskExecutor:
    async def execute_graph(graph: TaskGraph) → ExecutionReport:
        """Run all tasks respecting dependencies"""

    def _find_ready_tasks(graph: TaskGraph) → list[TaskNode]:
        """Tasks with all deps done"""

    async def _dispatch_task(task: TaskNode) → None:
        """Send to agent via bus"""

    async def _collect_results(task_ids: list[str]) → dict:
        """Wait for results via bus subscriptions"""
```

#### WorkspaceManager

```python
class WorkspaceManager:
    async def prepare_workspace(session: Session) → str:
        """Clone repo, checkout branch, return workspace path"""

    def get_workspace_path(session_id: str) → str:
        """Get execution path for this session"""

    async def cleanup_workspace(session_id: str) → None:
        """Remove isolated workspace"""
```

## Frontend Architecture

### Key Components

#### CallRoom (Main Page)

`frontend/app/call-room/page.tsx`

- Manages session state (messages, agents, tasks, quality gates)
- Connects to WebSocket for real-time events
- Renders ChatTranscript, TaskGraphDAG, and PixelOffice
- Handles user interactions (message input, takeover requests)

**State Management**:

```typescript
const [sessionId, setSessionId] = useState<string>("");
const [messages, setMessages] = useState<Message[]>([]);
const [taskGraph, setTaskGraph] = useState<TaskGraph | null>(null);
const [agentStatuses, setAgentStatuses] = useState<Record<string, string>>({});
const [qualityGates, setQualityGates] = useState<QualityGate[]>([]);
```

**WebSocket Handling**:

```typescript
ws.onmessage = (event) => {
  const runtimeEvent: RuntimeEvent = JSON.parse(event.data);
  switch (runtimeEvent.type) {
    case "message":
      setMessages((prev) => [...prev, runtimeEvent.payload]);
    case "agent_status":
      setAgentStatuses((prev) => ({ ...prev, [agent]: status }));
    case "task_status":
      updateTaskStatus(runtimeEvent.payload);
    // ...
  }
};
```

#### PixelOffice (Agent Visualization)

`frontend/app/components/PixelOffice/PixelOffice.tsx`

- Canvas-based 2D animation of agents in a virtual office
- Each agent has a character sprite that moves around
- Activities shown: "Thinking", "Writing Code", "Testing", "Deploying"
- Click on agents to see their status and recent messages
- Responsive to runtime events from bus

**Asset System**:

- Character sprites (16 directions of movement)
- Furniture and room decorations
- Floor and wall textures
- Dynamic sprite loading from `/public/pixel-agents/`

**Event Adapter**:
`frontend/app/components/PixelOffice/eventAdapter.ts`

Converts RuntimeEvents to PixelOffice state:

```typescript
buildPixelOfficeState(events: RuntimeEvent[]): PixelOfficeState {
  // Transform runtime events → visual agent positions, activities, messages
  // Track which agents are active, their current task, time spent
}
```

#### ChatTranscript (Message History)

`frontend/app/components/ChatTranscript.tsx`

- Displays all messages (agents, coordinator, user)
- Markdown rendering for formatted output
- Timestamps and sender info
- Task references (when message is about a specific task)
- Scrolls to latest message

#### TaskGraphDAG (Dependency Visualization)

`frontend/app/components/TaskGraphDAG.tsx`

- Renders task DAG as an interactive graph
- Shows dependencies with arrows
- Color-coded by status (pending, ready, in-progress, done, failed)
- Click to expand task details
- Shows quality gates and rework routes

### API Client

`frontend/lib/api.ts`

Provides typed HTTP and WebSocket interfaces:

```typescript
async function createSession(issue_url?: string): Promise<Session>;
async function getSession(id: string): Promise<Session>;
async function postMessage(id: string, content: string): Promise<Message>;
function subscribeToSession(
  id: string,
  callback: (event: RuntimeEvent) => void,
): () => void;
```

### Real-Time Event Types

```typescript
type RuntimeEventType =
  | "message" // New agent or coordinator message
  | "agent_status" // Agent is thinking/executing/done
  | "tool_event" // Agent called a tool
  | "task_status" // Task state changed
  | "quality_gate_status" // QA gate passed/failed
  | "deployment_status" // Deploy started/finished
  | "routing_decision" // Rework route triggered
  | "handoff" // Agent-to-agent handoff
  | "message_stream_start" // Streaming message beginning
  | "message_stream_delta" // Chunk of streamed message
  | "message_stream_done"; // Streaming message complete
```

## Data Models

### Session

Tracks all state for a single workflow execution:

```python
Session(
    id: str,                          # Unique identifier
    issue_url: str | None,            # GitHub issue URL
    status: SessionStatus,            # new → planning → executing → delivered
    messages: list[Message],          # Full conversation history
    selected_agents: list[str],       # Agents selected for this workflow
    task_graph: TaskGraph | None,     # Generated DAG
    created_at: datetime,

    # Workflow state (preserved for agent handoff)
    planning_agents: list[str],
    execution_agents: list[str],
    workflow_plan: dict,
    quality_gates: list[dict],
    rework_loops: list[dict],
    task_execution_report: dict,
    workspace: dict,
    deployment: dict,
    deployed_url: str | None,
)
```

### Message

Agent-to-agent or coordinator-to-user communication:

```python
Message(
    id: str,
    sender: str,                      # Agent id or "coordinator"
    sender_type: MessageType,         # AGENT, COORDINATOR, USER
    content: str,                     # Message text (markdown)
    recipients: list[str],            # Target agents (for @mentions)
    related_task_id: str | None,      # Which task is this about?
    timestamp: datetime,
)
```

### TaskNode & TaskGraph

```python
TaskNode(
    id: str,
    title: str,
    owner_agent: str,                 # Who executes this
    kind: TaskKind,                   # WORK, QUALITY_GATE, REWORK
    dependencies: list[str],          # Task IDs this depends on
    description: str = "",
    status: TaskStatus = PENDING,
    quality_gate: QualityGate | None,
    result: str = "",                 # Output from agent
    error: str | None,                # Error message if failed
    attempts: int = 0,
    max_attempts: int = 3,
)

TaskGraph(
    nodes: list[TaskNode],
    description: str = "",
    quality_gates: list[QualityGate] = [],
)
```

### AgentProfile

```python
AgentProfile(
    id: str,
    name: str,
    skills: list[str],                # Technologies, languages
    description: str,                 # Role and responsibilities
    allowed_actions: list[str],       # What they can do
    allowed_tools: list[str],         # Tool names (from ToolRegistry)
    preferred_file_scopes: list[str], # Glob patterns
    planning_capabilities: list[str],
    execution_capabilities: list[str],
    domains: list[str],               # Problem domains
    system_prompt: str,               # LLM instructions
    output_contract: dict,            # Expected output schema
    can_modify_files: bool,
    can_review: bool,
    can_deploy: bool,
    is_internal: bool,
)
```

## Error Handling & Resilience

### Agent Failures

If an agent fails:

1. TaskExecutor marks task as FAILED
2. Dependent tasks become BLOCKED
3. If max_attempts not reached, task can be retried
4. Otherwise, workflow terminates with error

**Retry Strategy**:

- Max 3 attempts per task (configurable)
- Exponential backoff between retries
- Clear error messages logged to session

### Quality Gate Failures

If a quality gate fails:

1. Gate status set to FAILED
2. Rework route triggers (if defined)
3. REWORK task created and dispatched to target_agent
4. After rework, gate rerun
5. If still failing: escalate or terminate

### Message Bus Resilience

- Bounded history (100 messages per topic) allows late joiners to catch up
- Async nature prevents cascading timeouts
- Wildcard subscriptions enable flexible routing
- Failed publishes logged (not retried to avoid duplicates)

### Workspace Cleanup

- On session end, WorkspaceManager cleans up isolated workspace
- Prevents disk bloat from long-running agents
- Can be triggered manually via API

## Testing Strategy

### Unit Tests

**Core Infrastructure** (`tests/test_runtime.py`, `test_bus.py`, `test_tools.py`):

- Tool execution (sync, async, errors)
- MessageBus pub/sub logic
- AgentRuntime tool-use loop

**Domain Models** (`tests/test_domain.py`):

- Session state transitions
- TaskGraph topological validation

**Services** (`tests/test_task_executor.py`, `test_coordinator.py`):

- TaskExecutor DAG traversal
- Rework route triggering
- Coordinator LLM prompts

### Integration Tests

**End-to-End Workflows** (`tests/test_vertical_slice.py`):

- Full workflow from issue to deployment
- Agent communication via bus
- Task graph execution with rework

**API Tests** (`tests/test_sessions.py`):

- REST endpoints
- WebSocket events
- Error responses

### Mocking Strategy

```python
# Mock LLM for deterministic tests
async def mock_llm(messages, tools, model):
    # Return pre-configured response
    return {
        "choices": [{"message": {"tool_calls": [...]}}]
    }

# Mock filesystem for isolation
@pytest.fixture
def temp_workspace(tmp_path):
    # Agents operate in isolated temp directory
    yield str(tmp_path)
```

### CI/CD

Tests run on every commit:

```yaml
test:
  script:
    - cd backend && pytest -v --cov
    - cd frontend && npm test
```

## Security Considerations

### Path Traversal Prevention

All file paths are validated:

```python
def _safe_resolve(relative_path: str) -> str:
    resolved = (_PROJECT_ROOT / relative_path).resolve()
    if not str(resolved).startswith(str(_PROJECT_ROOT.resolve())):
        raise PermissionError(f"Path escapes project root: {relative_path}")
    return str(resolved)
```

### Command Execution Restrictions

- Agents can't run arbitrary commands
- Only approved command patterns (e.g., `npm test`, `pytest`)
- Output truncated to prevent log bombs
- Timeouts enforced (15 sec per tool call)

### API Authentication

- GitHub token for issue access
- OpenAI key for LLM calls
- Session IDs are unguessable UUIDs
- No sensitive data in logs

### Agent Tool Scope

Each agent has:

- Allowed tools list (e.g., can't all agents write files)
- Preferred file scopes (regex patterns)
- Boolean flags (can_modify_files, can_deploy)

These are enforced at tool registration time.

## Performance Optimization

### Caching

- Agent profiles cached after first load
- Tool descriptions cached in registry
- Task graph topological sort cached until graph changes

### Parallelism

- TaskExecutor dispatches all ready tasks at once
- Agents run concurrently via asyncio
- WebSocket broadcasts use fan-out to all connections

### LLM Efficiency

- System prompts reused across same agent
- Message history truncated (last N messages)
- Tool calls batched where possible
- Streaming responses for long outputs

### Resource Limits

- File reads truncated (50KB default)
- Search results limited (200 matches)
- Message bus history bounded (100/topic)
- Tool call budget per agent (50 default)

## Deployment Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Browser                             │
│                      (localhost:3000)                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                  HTTP & WebSocket
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    Frontend (Next.js)                           │
│                                                                  │
│  ├─ API client (http)                                           │
│  ├─ WebSocket connector                                         │
│  └─ UI (PixelOffice, ChatTranscript, TaskGraphDAG)             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                  HTTP & WebSocket
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                  Backend (FastAPI)                              │
│                 (localhost:8000)                                │
│                                                                  │
│  ├─ Routers (sessions, agents, github)                          │
│  ├─ Coordinator (LLM-based planning)                            │
│  ├─ TaskExecutor (DAG execution)                                │
│  ├─ AgentFactory (runtime creation)                             │
│  ├─ MessageBus (pub/sub in-memory)                              │
│  ├─ AgentRegistry (profiles + tools)                            │
│  ├─ WorkspaceManager (isolated execution)                       │
│  └─ WebSocket Manager (client connections)                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
             File I/O, Command Execution
                           │
                    ┌──────▼──────┐
                    │   Filesystem │
                    │   & Shell    │
                    └─────────────┘
                           │
             External APIs (OpenAI, GitHub)
                           │
          ┌─────────────────┴──────────────────┐
          │                                    │
    ┌─────▼──────┐                     ┌──────▼─────┐
    │ OpenAI API │                     │ GitHub API │
    │ (gpt-4)    │                     │ (issues)   │
    └────────────┘                     └────────────┘
```

### Database (Future)

Currently: In-memory session store
Future: PostgreSQL with persistence layer (`app/store/memory.py` → `app/store/db.py`)

---

This architecture enables:

- **Modularity**: Core, domain, service, router layers are independent
- **Scalability**: Message bus allows N agents without central coordination
- **Testability**: Mocks can replace core components
- **Extensibility**: New agents, tools, and tasks are plugins, not core changes
- **Observability**: All events flow through bus (audit trail)

For implementation details, see the code and tests.
