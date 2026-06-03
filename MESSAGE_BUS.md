# Message Bus Deep Dive

The **MessageBus** is the nervous system of Plug and Play Agents. It enables asynchronous, decoupled communication between agents without a central orchestrator.

## Core Concepts

### Topic-Based Routing

Messages are routed by **topic**, a hierarchical string path similar to MQTT:

```
session.{session_id}.agent.{agent_id}      ← Direct message to agent
session.{session_id}.broadcast              ← Message to all agents in session
session.{session_id}.result.{agent_id}      ← Result published by agent
session.{session_id}.status.{agent_id}      ← Status updates (thinking, tool_use, done)
system.agent.spawn                          ← System-level events (agent lifecycle)
system.event.{type}                         ← Other system events
```

### Wildcards

Subscriptions support fnmatch-style wildcards:

```python
# Subscribe to all agent status updates in a session
bus.subscribe("session.sess_123.status.*", on_status_update)

# Subscribe to all results in all sessions
bus.subscribe("session.*.result.*", on_result)

# Subscribe to all agent messages
bus.subscribe("session.*.agent.*", on_agent_message)

# Subscribe to all system events
bus.subscribe("system.*.*", on_system_event)
```

### Message Model

```python
@dataclass
class BusMessage:
    id: str                            # Unique message ID
    topic: str                         # Route (e.g., session.123.agent.frontend)
    sender: str                        # Who sent it (agent_id, "coordinator", etc.)
    content: Dict[str, Any]            # Payload
    timestamp: datetime                # When sent
    metadata: Dict[str, Any] = ...    # Extra info (priority, tags, etc.)
```

Example message:

```python
BusMessage(
    id="msg_abc123",
    topic="session.sess_456.agent.frontend_developer",
    sender="coordinator",
    content={
        "task_id": "task_1",
        "instructions": "Build the login form component",
        "context": "User authentication feature for the app",
        "constraints": [
            "Use TypeScript",
            "Use Tailwind CSS for styling",
            "Must include email validation"
        ]
    },
    timestamp=datetime.now(timezone.utc),
    metadata={"priority": "high"}
)
```

## Architecture

### In-Memory Storage

```
MessageBus
├── _messages: Dict[str, List[BusMessage]]
│   ├── "session.123.status.frontend": [msg1, msg2, ...]  ← Last 100 msgs
│   ├── "session.123.result.backend": [msg3, msg4, ...]
│   └── ...
│
└── _subscribers: Dict[str, List[Callable]]
    ├── "session.123.agent.frontend": [on_msg1, on_msg2]
    ├── "session.*.status.*": [on_all_status]
    └── ...
```

### Operations

#### Publish (Write)

```python
await bus.publish(
    topic="session.sess_123.agent.frontend_developer",
    sender="coordinator",
    content={"task_id": "task_1", "instructions": "..."}
)
```

1. Create `BusMessage` with unique ID, timestamp
2. Store in `_messages[topic]` (append, keep last 100)
3. Find all matching subscriptions using fnmatch
4. Call each callback with the message (async/sync)
5. Call bridge callbacks (for WebSocket relay)

#### Subscribe (Read)

```python
def on_message(msg: BusMessage):
    print(f"Got: {msg.content}")

bus.subscribe("session.sess_123.agent.frontend_developer", on_message)
```

1. Add callback to `_subscribers[topic]`
2. Return unsubscribe function
3. Future publishes to this topic trigger callback

#### Subscribe with History

```python
async def on_message_with_history(msg: BusMessage):
    print(f"Got: {msg.content}")

await bus.subscribe_with_history(
    "session.sess_123.result.*",
    on_message_with_history
)
```

1. Get last 100 messages for matching topics
2. Call callback with each (replay history)
3. Then subscribe to future messages

### Matching Algorithm

Wildcard matching uses Python's `fnmatch`:

```python
fnmatch.fnmatch("session.sess_123.status.frontend", "session.*.status.*")
# → True

fnmatch.fnmatch("session.sess_123.agent.frontend", "session.*.status.*")
# → False

fnmatch.fnmatch("system.event.deploy", "system.*.*")
# → True
```

## Usage Patterns

### 1. Direct Agent Communication

Agent sends task result, TaskExecutor collects it:

```python
# In agent
await bus.publish(
    topic=f"session.{session_id}.result.{agent_id}",
    sender=agent_id,
    content={
        "task_id": "task_1",
        "status": "done",
        "result": "Created LoginForm component"
    }
)

# In TaskExecutor
async def collect_result(agent_id: str):
    result = None
    def on_result(msg: BusMessage):
        nonlocal result
        result = msg.content

    bus.subscribe(f"session.{session_id}.result.{agent_id}", on_result)

    # Wait for result (with timeout)
    while result is None:
        await asyncio.sleep(0.1)
    return result
```

### 2. Broadcasting to All Agents

Coordinator broadcasts a message, any interested agent can listen:

```python
# Coordinator announces phase change
await bus.publish(
    topic=f"session.{session_id}.broadcast",
    sender="coordinator",
    content={"phase": "executing", "message": "Starting task execution"}
)

# All agents can listen
async def on_broadcast(msg: BusMessage):
    if msg.content.get("phase") == "executing":
        print("Coordinator says execution has started")

bus.subscribe(f"session.{session_id}.broadcast", on_broadcast)
```

### 3. Agent Status Tracking

Agents publish status, UI subscribes to all statuses:

```python
# In agent (while running)
for i in range(10):
    await bus.publish(
        topic=f"session.{session_id}.status.{agent_id}",
        sender=agent_id,
        content={
            "phase": "executing_tools",
            "tool": "write_file",
            "file": f"file_{i}.py",
            "progress": f"{i}/10"
        }
    )
    # ... do work ...

# In WebSocket handler (streaming to frontend)
def on_status(msg: BusMessage):
    # Relay to all connected clients
    send_to_all_clients({"type": "agent_status", "payload": msg.content})

bus.subscribe(f"session.{session_id}.status.*", on_status)
```

### 4. Message History (Late Joiner)

A client that connects late can catch up on recent messages:

```python
# Client just connected to WebSocket
# Get recent messages before live subscription
recent = await bus.get_history(f"session.{session_id}.result.*", limit=50)
for msg in recent:
    send_to_client({"type": "message", "payload": msg.content})

# Now listen for new results
def on_new_result(msg: BusMessage):
    send_to_client({"type": "message", "payload": msg.content})

bus.subscribe(f"session.{session_id}.result.*", on_new_result)
```

## Implementation Details

### Thread Safety

The bus uses Python's `asyncio` for concurrency, not threading:

```python
# All subscribers run in the same event loop
# Safe: no mutex needed, event-driven ordering

async def publish(...):
    # Single-threaded, async operations
    for callback in matching_subscribers:
        if asyncio.iscoroutinefunction(callback):
            await callback(msg)
        else:
            callback(msg)  # Sync callback runs in executor
```

**Warning**: If a callback raises an exception, it's logged but doesn't block other callbacks.

### Bridge Callbacks

For relaying to external systems (e.g., WebSocket):

```python
def on_any_message(msg: BusMessage):
    # Send to all connected WebSocket clients
    manager.broadcast({
        "type": msg.topic.split(".")[-2],  # Extract event type
        "payload": msg.content
    })

bus.register_bridge(on_any_message)
```

### Performance Characteristics

| Operation      | Time Complexity | Notes                              |
| -------------- | --------------- | ---------------------------------- |
| Publish        | O(S)            | S = matching subscriptions         |
| Subscribe      | O(1)            | Add to list                        |
| History lookup | O(T)            | T = topics, with early termination |
| Wildcard match | O(T \* P)       | T = topics, P = pattern length     |

**Optimization**: Subscriptions are stored as a flat list per topic, not a tree. Matching is done with `fnmatch` which is optimized for glob patterns.

## Integration with AgentRuntime

### AgentRuntime uses the bus for:

```python
class AgentRuntime:
    def __init__(self, ..., bus: MessageBus, session_id: str):
        self.bus = bus
        self.session_id = session_id
        self.agent_id = agent_id

    async def run(self, incoming_message: str) -> str:
        # Subscribe to messages for this agent
        task_complete = asyncio.Event()

        async def on_task_message(msg: BusMessage):
            # Coordinator assigned a task
            task_complete.set()

        self.bus.subscribe(
            f"session.{self.session_id}.agent.{self.agent_id}",
            on_task_message
        )

        # Wait for task
        await task_complete.wait()

        # Process task with LLM and tools
        result = await self._llm_tool_loop(incoming_message)

        # Publish result
        await self.bus.publish(
            topic=f"session.{self.session_id}.result.{self.agent_id}",
            sender=self.agent_id,
            content={
                "status": "done",
                "result": result,
                "files_modified": [...],
                "duration": elapsed_time
            }
        )

        return result
```

## Integration with TaskExecutor

### TaskExecutor orchestrates agents via bus:

```python
class TaskExecutor:
    async def execute_graph(self, graph: TaskGraph) -> ExecutionReport:
        # For each ready task
        for task in self._find_ready_tasks(graph):
            # Dispatch to agent
            await self.bus.publish(
                topic=f"session.{self.session_id}.agent.{task.owner_agent}",
                sender="executor",
                content={
                    "task_id": task.id,
                    "title": task.title,
                    "description": task.description,
                    "files": [...],
                    "constraints": [...]
                }
            )

            # Wait for result
            result = await self._wait_for_result(task.id)

            # Update task status
            task.status = "done" if result["status"] == "ok" else "failed"
            task.result = result["content"]

            # Mark dependent tasks as ready
            self._update_readiness(graph, task)
```

## Broker Patterns

### Request-Reply

```python
# Requester
async def ask_agent(question: str):
    reply_received = asyncio.Event()
    reply_data = None

    def on_reply(msg: BusMessage):
        nonlocal reply_data
        reply_data = msg.content
        reply_received.set()

    bus.subscribe(f"session.{sid}.reply.requester", on_reply)

    await bus.publish(
        f"session.{sid}.agent.responder",
        "requester",
        {"question": question}
    )

    await asyncio.wait_for(reply_received.wait(), timeout=30)
    return reply_data

# Responder
def on_question(msg: BusMessage):
    answer = answer_the_question(msg.content["question"])
    await bus.publish(
        f"session.{msg.session_id}.reply.{msg.sender}",
        "responder",
        {"answer": answer}
    )

bus.subscribe(f"session.{sid}.agent.responder", on_question)
```

### Publish-Subscribe

```python
# Publisher (coordinator)
await bus.publish(
    f"session.{sid}.broadcast",
    "coordinator",
    {"event": "task_ready", "task_id": "task_1"}
)

# Multiple subscribers
async def on_task_ready(msg: BusMessage):
    if msg.content["event"] == "task_ready":
        print(f"Task {msg.content['task_id']} is ready!")

bus.subscribe(f"session.{sid}.broadcast", on_task_ready)
```

### Fan-Out

```python
# Dispatcher publishes to multiple agents
for agent_id in ready_agents:
    await bus.publish(
        f"session.{sid}.agent.{agent_id}",
        "dispatcher",
        {"task": task_description}
    )

# Each agent processes independently
async def on_task(msg: BusMessage):
    result = await execute_task(msg.content["task"])
    await bus.publish(
        f"session.{sid}.result.{agent_id}",
        agent_id,
        result
    )
```

## Testing the Bus

```python
import pytest
from app.core.bus import MessageBus

@pytest.mark.asyncio
async def test_pub_sub():
    bus = MessageBus()
    received = []

    def on_msg(msg):
        received.append(msg)

    bus.subscribe("test.topic", on_msg)

    await bus.publish("test.topic", "sender", {"data": "value"})

    assert len(received) == 1
    assert received[0].content["data"] == "value"

@pytest.mark.asyncio
async def test_wildcards():
    bus = MessageBus()
    received = []

    def on_msg(msg):
        received.append(msg)

    bus.subscribe("session.*.status.*", on_msg)

    await bus.publish("session.s1.status.agent1", "agent1", {})
    await bus.publish("session.s1.status.agent2", "agent2", {})
    await bus.publish("session.s1.agent.agent1", "agent1", {})  # Won't match

    assert len(received) == 2

@pytest.mark.asyncio
async def test_history():
    bus = MessageBus()

    # Publish some messages
    for i in range(5):
        await bus.publish(f"test.{i}", "sender", {"num": i})

    # Subscribe with history
    messages = await bus.get_history("test.*")
    assert len(messages) == 5

@pytest.mark.asyncio
async def test_bridge():
    bus = MessageBus()
    bridge_calls = []

    def bridge_callback(msg):
        bridge_calls.append(msg)

    bus.register_bridge(bridge_callback)
    await bus.publish("test.topic", "sender", {})

    assert len(bridge_calls) == 1
```

## Troubleshooting

### Messages Not Being Received?

1. **Check topic match**: Topic must match subscription pattern
2. **Check timing**: Subscriber must be registered _before_ publish
3. **Check sender**: Ensure publish actually happened (check logs)

### Callback Not Being Called?

1. **Wildcard mismatch**: Use `fnmatch_many` to test patterns
2. **Async/await**: If callback is async, ensure it's awaited
3. **Exception in callback**: Check logs for exceptions

### Memory Growing Unbounded?

1. **Set max_history**: Bounded to 100 msgs/topic by default
2. **Unsubscribe**: Call returned unsubscribe function when done
3. **Bridge callback**: Ensure it doesn't leak memory

### Performance Issues?

1. **Too many subscribers**: Reduce number of wildcard subscriptions
2. **Slow callback**: Make callbacks fast, do heavy work async
3. **Large messages**: Truncate payloads, use references instead

---

For more information, see the implementation in [backend/app/core/bus.py](backend/app/core/bus.py).
