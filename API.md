# API Reference

## Overview

The Plug and Play Agents API provides HTTP endpoints for session management, agent querying, and GitHub integration. Real-time events are streamed via WebSocket.

**Base URL**: `http://localhost:8000` (development)

## Authentication

Currently, the API does not require authentication for local development. In production:

- GitHub API access requires `GITHUB_TOKEN` environment variable
- OpenAI API access requires `OPENAI_API_KEY` environment variable
- Session IDs act as opaque identifiers (not guessable UUIDs)

## Endpoints

### Sessions

#### `POST /sessions`

Create a new session.

**Request**:

```json
{
  "issue_url": "https://github.com/owner/repo/issues/123",
  "issue_url": null // Optional; can be provided later
}
```

**Response** (201):

```json
{
  "id": "sess_abc123xyz",
  "issue_url": "https://github.com/owner/repo/issues/123",
  "status": "new",
  "messages": [],
  "selected_agents": [],
  "task_graph": null,
  "created_at": "2024-05-20T10:30:00Z",
  "updated_at": "2024-05-20T10:30:00Z",
  "planning_agents": [],
  "execution_agents": [],
  "quality_gates": [],
  "deployed_url": null,
  "qa_passed": false
}
```

#### `GET /sessions/{session_id}`

Retrieve session details.

**Response** (200):

```json
{
  "id": "sess_abc123xyz",
  "issue_url": "...",
  "status": "executing",
  "messages": [
    {
      "id": "msg_1",
      "sender": "coordinator",
      "sender_type": "COORDINATOR",
      "content": "I've analyzed the GitHub issue. Here's my plan...",
      "recipients": ["frontend_developer", "backend_developer"],
      "related_task_id": null,
      "timestamp": "2024-05-20T10:31:00Z"
    },
    ...
  ],
  "selected_agents": ["frontend_developer", "backend_developer", "qa_tester"],
  "task_graph": {
    "nodes": [
      {
        "id": "task_1",
        "title": "Design system architecture",
        "owner_agent": "architect",
        "kind": "work",
        "dependencies": [],
        "description": "Plan the overall structure",
        "status": "done",
        "result": "Architecture planned",
        "error": null,
        "attempts": 1,
        "max_attempts": 3
      },
      ...
    ],
    "description": "Multi-step implementation plan",
    "quality_gates": []
  },
  ...
}
```

#### `GET /sessions`

List all sessions.

**Query Parameters**:

- `limit`: Max results (default: 50)
- `offset`: Pagination offset (default: 0)
- `status`: Filter by status (new, planning, executing, delivered, failed)

**Response** (200):

```json
{
  "sessions": [
    { /* session object */ },
    ...
  ],
  "total": 42,
  "limit": 50,
  "offset": 0
}
```

#### `POST /sessions/{session_id}/message`

Send a message to the coordinator (triggers processing).

**Request**:

```json
{
  "content": "Start analyzing the issue and create a plan"
}
```

**Response** (200):

```json
{
  "human_message": {
    "id": "msg_user_1",
    "sender": "user",
    "sender_type": "USER",
    "content": "Start analyzing...",
    "recipients": [],
    "related_task_id": null,
    "timestamp": "2024-05-20T10:32:00Z"
  },
  "coordinator_reply": {
    "id": "msg_coord_1",
    "sender": "coordinator",
    "sender_type": "COORDINATOR",
    "content": "I'm on it! Analyzing the GitHub issue...",
    "recipients": [],
    "related_task_id": null,
    "timestamp": "2024-05-20T10:32:01Z"
  }
}
```

#### `DELETE /sessions/{session_id}`

Delete a session and clean up workspace.

**Response** (204): No content

### Messages

#### `GET /sessions/{session_id}/messages`

Get all messages in a session (paginated).

**Query Parameters**:

- `limit`: Max results (default: 100)
- `offset`: Pagination offset (default: 0)
- `sender`: Filter by sender (e.g., "coordinator", "frontend_developer")

**Response** (200):

```json
{
  "messages": [
    { /* message object */ },
    ...
  ],
  "total": 127,
  "limit": 100,
  "offset": 0
}
```

### Agents

#### `GET /agents`

List all available agent profiles.

**Response** (200):

```json
{
  "agents": [
    {
      "id": "architect",
      "name": "Architect",
      "skills": ["system-design", "planning", "refactoring"],
      "description": "Plans system architecture and creates task graphs",
      "allowed_actions": ["read_file", "search_code", "list_directory"],
      "allowed_tools": ["read_file", "search_code", "list_directory"],
      "preferred_file_scopes": ["**/*"],
      "can_modify_files": false,
      "can_review": true,
      "can_deploy": false,
      "is_internal": false
    },
    {
      "id": "frontend_developer",
      "name": "Frontend Developer",
      "skills": ["react", "typescript", "nextjs", "css", "tailwind"],
      "description": "Builds React/Next.js user interfaces",
      "allowed_actions": [
        "create_file", "edit_file", "read_file", "run_command",
        "create_component", "implement_page", "add_interaction",
        "write_test", "run_tests", "install_package"
      ],
      "allowed_tools": [
        "read_file", "write_file", "search_code", "list_directory", "run_command"
      ],
      "preferred_file_scopes": ["frontend/**/*.tsx", "frontend/**/*.ts"],
      "can_modify_files": true,
      "can_review": true,
      "can_deploy": false,
      "is_internal": false
    },
    ...
  ]
}
```

#### `GET /agents/{agent_id}`

Get a specific agent profile.

**Response** (200):

```json
{
  "id": "frontend_developer",
  "name": "Frontend Developer",
  ...
}
```

#### `GET /agents/{agent_id}/tools`

Get tools available to a specific agent.

**Response** (200):

```json
{
  "agent_id": "frontend_developer",
  "tools": [
    {
      "name": "read_file",
      "description": "Read file contents from the codebase",
      "parameters": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string",
            "description": "Relative path to the file"
          },
          "max_length": {
            "type": "integer",
            "description": "Max bytes to read (default: 50000)"
          }
        },
        "required": ["path"]
      }
    },
    {
      "name": "write_file",
      "description": "Write or create a file in the codebase",
      "parameters": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string",
            "description": "Path where file should be created"
          },
          "content": {
            "type": "string",
            "description": "File contents"
          }
        },
        "required": ["path", "content"]
      }
    },
    ...
  ]
}
```

### GitHub Integration

#### `POST /github/issue/{owner}/{repo}/{issue_number}/comment`

Post a comment to a GitHub issue (requires valid GITHUB_TOKEN).

**Request**:

```json
{
  "session_id": "sess_abc123xyz",
  "comment": "# Implementation Complete\n\nAll tasks finished. Deployed to: https://example.com"
}
```

**Response** (200):

```json
{
  "comment_id": 1234567,
  "url": "https://github.com/owner/repo/issues/123#issuecomment-1234567",
  "body": "# Implementation Complete\n..."
}
```

#### `POST /github/issue/{owner}/{repo}/issues`

Create a GitHub issue (for subtasks).

**Request**:

```json
{
  "title": "Implement login form",
  "body": "Part of larger feature implementation\n\n- [ ] Create React component\n- [ ] Add styling\n- [ ] Write tests",
  "labels": ["enhancement", "frontend"]
}
```

**Response** (201):

```json
{
  "issue_number": 456,
  "url": "https://github.com/owner/repo/issues/456",
  "title": "Implement login form",
  "body": "..."
}
```

### Health & Diagnostics

#### `GET /health`

Health check endpoint.

**Response** (200):

```json
{
  "status": "ok"
}
```

## WebSocket API

### Connection

```javascript
const ws = new WebSocket("ws://localhost:8000/sessions/{session_id}/ws");

ws.onopen = () => console.log("Connected");
ws.onmessage = (event) => {
  const runtimeEvent = JSON.parse(event.data);
  console.log(runtimeEvent.type, runtimeEvent.payload);
};
ws.onerror = (error) => console.error("WebSocket error", error);
ws.onclose = () => console.log("Disconnected");
```

### Event Types & Payloads

#### `message`

New message from an agent or coordinator.

```json
{
  "type": "message",
  "payload": {
    "id": "msg_1",
    "sender": "coordinator",
    "sender_type": "COORDINATOR",
    "content": "I've completed my analysis...",
    "recipients": ["frontend_developer"],
    "related_task_id": null,
    "timestamp": "2024-05-20T10:33:00Z"
  }
}
```

#### `agent_status`

Agent state change (thinking, executing tools, done, error).

```json
{
  "type": "agent_status",
  "payload": {
    "agent_id": "frontend_developer",
    "status": "executing_tools",
    "message": "Writing file app/components/LoginForm.tsx",
    "timestamp": "2024-05-20T10:33:15Z"
  }
}
```

#### `tool_event`

Agent called a tool.

```json
{
  "type": "tool_event",
  "payload": {
    "agent_id": "frontend_developer",
    "tool_name": "write_file",
    "tool_input": {
      "path": "app/components/LoginForm.tsx",
      "content": "export default function LoginForm() { ... }"
    },
    "tool_output": {
      "path": "app/components/LoginForm.tsx",
      "written": true,
      "bytes": 1234
    },
    "timestamp": "2024-05-20T10:33:16Z"
  }
}
```

#### `task_status`

Task state changed (ready, in_progress, done, failed).

```json
{
  "type": "task_status",
  "payload": {
    "task_id": "task_1",
    "status": "done",
    "result": "Component implemented with tests passing",
    "error": null,
    "timestamp": "2024-05-20T10:34:00Z"
  }
}
```

#### `quality_gate_status`

QA gate executed (passed/failed).

```json
{
  "type": "quality_gate_status",
  "payload": {
    "gate_id": "tests_pass",
    "status": "passed",
    "message": "All tests passing, coverage at 85%",
    "affected_task_ids": ["task_1", "task_2"],
    "timestamp": "2024-05-20T10:34:30Z"
  }
}
```

#### `deployment_status`

Deployment progress.

```json
{
  "type": "deployment_status",
  "payload": {
    "status": "deploying",
    "message": "Building Docker image...",
    "deployed_url": null,
    "timestamp": "2024-05-20T10:35:00Z"
  }
}
```

After deployment completes:

```json
{
  "type": "deployment_status",
  "payload": {
    "status": "deployed",
    "message": "Successfully deployed",
    "deployed_url": "https://app-abc123.vercel.app",
    "timestamp": "2024-05-20T10:36:00Z"
  }
}
```

#### `routing_decision`

Rework route triggered due to quality gate failure.

```json
{
  "type": "routing_decision",
  "payload": {
    "gate_id": "tests_pass",
    "status": "failed",
    "rework_route": {
      "owner_agent": "qa_tester",
      "target_agent": "frontend_developer",
      "category": "implementation",
      "affected_task_ids": ["task_1"],
      "reason": "Test failures: LoginForm missing email validation",
      "attempt": 1,
      "max_attempts": 3
    },
    "timestamp": "2024-05-20T10:34:35Z"
  }
}
```

## Data Types

### Session

```typescript
interface Session {
  id: string;
  issue_url: string | null;
  status:
    | "new"
    | "issue_loaded"
    | "planning"
    | "executing"
    | "delivering"
    | "failed";
  messages: Message[];
  selected_agents: string[];
  task_graph: TaskGraph | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601

  // Workflow state
  planning_agents: string[];
  execution_agents: string[];
  workflow_plan: Record<string, unknown>;
  quality_gates: Array<Record<string, unknown>>;
  rework_loops: Array<Record<string, unknown>>;
  task_execution_report: Record<string, unknown>;
  workspace: Record<string, unknown>;
  deployment: Record<string, unknown>;
  deployed_url: string | null;
  qa_passed: boolean;
  deploy_test_passed: boolean;
}
```

### Message

```typescript
interface Message {
  id: string;
  sender: string; // Agent ID or "coordinator"
  sender_type: "AGENT" | "COORDINATOR" | "USER";
  content: string; // Markdown text
  recipients: string[]; // Target agent IDs (for @mentions)
  related_task_id: string | null; // If about a specific task
  timestamp: string; // ISO 8601
}
```

### TaskGraph

```typescript
interface TaskGraph {
  nodes: TaskNode[];
  description: string;
  quality_gates: Array<{
    id: string;
    name: string;
    status: "pending" | "in_progress" | "passed" | "failed";
    affected_task_ids: string[];
  }>;
}

interface TaskNode {
  id: string;
  title: string;
  owner_agent: string;
  kind: "work" | "quality_gate" | "rework";
  dependencies: string[]; // Task IDs
  description: string;
  status: "pending" | "ready" | "in_progress" | "done" | "failed" | "blocked";
  result: string;
  error: string | null;
  attempts: number;
  max_attempts: number;
  quality_gate?: {
    id: string | null;
    name: string;
    status: "pending" | "in_progress" | "passed" | "failed";
    affected_task_ids: string[];
    rework_route?: {
      owner_agent: string;
      target_agent: string;
      category: string;
      affected_task_ids: string[];
      max_attempts: number | null;
    };
  };
}
```

### AgentProfile

```typescript
interface AgentProfile {
  id: string;
  name: string;
  skills: string[];
  description: string;
  allowed_actions: string[];
  allowed_tools: string[];
  preferred_file_scopes: string[];
  planning_capabilities: string[];
  execution_capabilities: string[];
  domains: string[];
  system_prompt: string;
  output_contract: Record<string, unknown>;
  can_modify_files: boolean;
  can_review: boolean;
  can_deploy: boolean;
  is_internal: boolean;
}
```

### Tool

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
      }
    >;
    required: string[];
  };
}
```

## Rate Limiting

Currently, no rate limiting is enforced. In production, consider:

- 100 requests/minute per IP
- 10 concurrent WebSocket connections per session
- 10 sessions per user per hour

## Error Responses

All errors follow this format:

```json
{
  "detail": "Human-readable error message",
  "error_code": "SPECIFIC_ERROR_CODE",
  "timestamp": "2024-05-20T10:33:00Z"
}
```

Common error codes:

- `SESSION_NOT_FOUND` (404)
- `INVALID_AGENT_ID` (400)
- `GITHUB_API_ERROR` (502)
- `LLM_API_ERROR` (502)
- `WORKSPACE_ERROR` (500)
- `INTERNAL_SERVER_ERROR` (500)

## Example: Full Workflow

```bash
# 1. Create session
curl -X POST http://localhost:8000/sessions \
  -H "Content-Type: application/json" \
  -d '{"issue_url": "https://github.com/owner/repo/issues/123"}'

# Returns: {"id": "sess_abc123xyz", "status": "new", ...}

# 2. Send message to start workflow
curl -X POST http://localhost:8000/sessions/sess_abc123xyz/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Start analyzing and planning"}'

# 3. Connect WebSocket to monitor progress
# ws = new WebSocket('ws://localhost:8000/sessions/sess_abc123xyz/ws')

# 4. Check session status periodically
curl http://localhost:8000/sessions/sess_abc123xyz

# 5. When done, post results to GitHub
curl -X POST http://localhost:8000/github/issue/owner/repo/123/comment \
  -H "Content-Type: application/json" \
  -d '{"session_id": "sess_abc123xyz", "comment": "Implementation complete..."}'

# 6. Clean up
curl -X DELETE http://localhost:8000/sessions/sess_abc123xyz
```

---

See [README.md](README.md) for Python/TypeScript client examples.
