# Agent System & Profiles

## Overview

An **Agent** in Plug and Play Agents is an autonomous process that:

1. Waits for incoming messages (tasks) via the message bus
2. Reasons with an LLM about how to accomplish the task
3. Calls tools (read_file, write_file, run_command) to interact with the codebase
4. Publishes results back to the bus
5. Reports status updates throughout

This document describes how agents are defined, created, and executed.

## AgentProfile

Each agent is defined by an **AgentProfile** (a Pydantic model) that specifies its capabilities and constraints:

```python
class AgentProfile(BaseModel):
    id: str                                    # Unique identifier
    name: str                                  # Human-readable name

    # Capabilities
    skills: List[str]                         # Technologies/domains (e.g., ["python", "fastapi"])
    description: str                          # Role description
    allowed_actions: List[str]                # What it can do (e.g., ["create_file", "run_tests"])
    allowed_tools: List[str]                  # Specific tools (e.g., ["read_file", "write_file"])

    # Constraints
    preferred_file_scopes: List[str]          # Glob patterns (e.g., ["backend/**/*.py"])
    planning_capabilities: List[str]          # Can it plan? (e.g., ["analyze", "design"])
    execution_capabilities: List[str]         # Can it execute? (e.g., ["implement", "test"])
    domains: List[str]                        # Problem domains (e.g., ["web", "backend"])
    can_modify_files: bool                    # Can write to codebase
    can_review: bool                          # Can review others' work
    can_deploy: bool                          # Can deploy code
    is_internal: bool                         # System-only agent

    # Prompts & Contracts
    system_prompt: str                        # LLM instructions for this agent
    output_contract: Dict[str, Any]           # Expected output schema
```

## Included Agent Profiles

### Architect (`architect`)

**Role**: Plans system design and creates task graphs

**Skills**: system-design, planning, refactoring, requirements-analysis

**Capabilities**:

- Analyze requirements and break into tasks
- Design system architecture
- Create DAGs with dependencies
- Define quality gates
- Recommend rework routes

**Tools**: read_file, search_code, list_directory

**Example Task**:

```
Analyze this GitHub issue and create a task DAG with dependencies.
For each task, specify:
- Title and description
- Owner agent (which specialist should do it)
- Dependencies (what must finish first)
- Quality gates (how to validate)
- Rework routes (if it fails, who fixes it)
```

### Frontend Developer (`frontend_developer`)

**Role**: Builds React/Next.js user interfaces

**Skills**: react, typescript, nextjs, css, tailwind, component-design

**Capabilities**:

- Implement React components
- Create pages and layouts
- Add interactions and state management
- Write component tests
- Optimize performance

**Tools**: read_file, write_file, search_code, list_directory, run_command

**Example Task**:

```
Build a login form component with:
- Email and password input fields
- Form validation
- Submit button with loading state
- Error message display
- Unit tests with 80%+ coverage
```

**Constraints**:

- Must use TypeScript (no .js files)
- Must use Tailwind CSS for styling
- Must write tests alongside implementation
- Must run `npx tsc --noEmit` to verify compilation

### Backend Developer (`backend_developer`)

**Role**: Implements Python/FastAPI server-side logic

**Skills**: python, fastapi, sqlalchemy, postgres, api-design, database-schema

**Capabilities**:

- Implement FastAPI endpoints
- Design database schemas
- Create service layers
- Write API tests
- Optimize queries

**Tools**: read_file, write_file, search_code, list_directory, run_command

**Example Task**:

```
Implement user authentication endpoints:
- POST /auth/signup: Create user account
- POST /auth/login: Authenticate and return token
- POST /auth/logout: Invalidate token
- GET /users/me: Get current user info

Include:
- Password hashing with bcrypt
- JWT token generation
- Request validation with Pydantic
- Unit tests
- Integration tests
```

### QA Tester (`qa_tester`)

**Role**: Validates code quality via tests and reviews

**Skills**: testing, code-review, performance-testing, accessibility

**Capabilities**:

- Run automated tests
- Review code for bugs and style
- Check test coverage
- Validate accessibility
- Performance profiling

**Tools**: read_file, search_code, run_command, list_directory

**Example Task**:

```
Review the frontend component for:
1. Run tests: npm test
2. TypeScript validation: npx tsc --noEmit
3. Code review:
   - Does it use React best practices?
   - Is accessibility considered (ARIA labels, semantic HTML)?
   - Are there console errors or warnings?
4. Report coverage and any issues
```

### DevOps / Deployer (`devops_deployer`)

**Role**: Handles deployment and infrastructure

**Skills**: docker, ci-cd, kubernetes, terraform, deployment

**Capabilities**:

- Build and deploy applications
- Manage CI/CD pipelines
- Configure infrastructure
- Monitor deployments
- Rollback if needed

**Tools**: read_file, run_command, list_directory

**Example Task**:

```
Deploy the application to Vercel:
1. Build the frontend: npm run build
2. Deploy: vercel deploy --prod
3. Wait for deployment to complete
4. Run smoke tests against deployed URL
5. Return the deployed URL
```

## AgentRuntime

The **AgentRuntime** is the execution engine that brings an AgentProfile to life.

### Initialization

```python
from app.core.runtime import AgentRuntime
from app.core.tools import ToolRegistry
from app.core.default_tools import create_default_tools
from app.core.bus import MessageBus

# Create tools
tools = create_default_tools()  # read_file, write_file, search_code, etc.

# Create runtime
agent = AgentRuntime(
    agent_id="frontend_developer",
    system_prompt="""
You are the Frontend Developer Agent. Your role is to build React/Next.js interfaces.

Skills: react, typescript, nextjs, tailwind

Tools you have:
- read_file: Read existing code
- write_file: Create new files
- search_code: Find code patterns
- run_command: Run npm, npx, etc.

Constraints:
- Use TypeScript only (.tsx files)
- Use Tailwind CSS
- Write tests alongside code
- Complete all code (no stubs)
""",
    tools=tools,
    model="gpt-4.1",
    llm_call=openai_call,  # Async function that calls OpenAI API

    # Optional: Connect to message bus
    bus=message_bus,
    session_id="sess_abc123",
)
```

### Execution Loop

```
1. Wait for incoming message on bus
   ↓
2. Call LLM with:
   - System prompt (role, skills, constraints)
   - Conversation history (messages so far)
   - Available tools (JSON schema)
   ↓
3. Parse LLM response for tool calls
   ↓
4. Execute tools (one at a time or in parallel)
   ↓
5. Update conversation history with tool results
   ↓
6. Call LLM again with updated context
   ↓
7. Repeat steps 3-6 until agent says "I'm done"
   ↓
8. Publish result to bus and exit
```

### Running an Agent

```python
# Synchronous (blocking)
result = await agent.run("Implement a login form component")

# Returns: String with summary of what was done
# "Created LoginForm.tsx with email/password inputs, validation, tests"
```

### Bus Integration

When connected to a message bus, the agent:

1. **Subscribes** to incoming tasks:

   ```
   session.{session_id}.agent.{agent_id}
   ```

2. **Publishes** status updates:

   ```
   session.{session_id}.status.{agent_id}
   ```

   Statuses: "thinking", "executing_tools", "done", "error"

3. **Publishes** results:

   ```
   session.{session_id}.result.{agent_id}
   ```

   Content: task result, files modified, duration, etc.

### Tool Execution

When the LLM decides to call a tool, the agent:

1. **Validates** tool call is in allowed list
2. **Extracts** parameters from LLM response
3. **Executes** the tool (may be sync or async)
4. **Captures** output/errors
5. **Updates** conversation with tool result
6. **Continues** LLM loop

Example LLM response:

```json
{
  "choices": [
    {
      "message": {
        "tool_calls": [
          {
            "id": "call_1",
            "function": {
              "name": "read_file",
              "arguments": "{\"path\": \"frontend/app/page.tsx\"}"
            }
          }
        ]
      }
    }
  ]
}
```

Agent executes:

```python
tool_output = await tools.get("read_file").execute(path="frontend/app/page.tsx")
# → {"path": "...", "content": "export default function...", "truncated": false}
```

### Tool Budget

Agents have a **tool call budget** to prevent infinite loops:

```python
agent = AgentRuntime(
    ...,
    tool_call_budget=50,  # Max 50 tool calls per task
)
```

If budget exceeded, agent stops and returns error.

### Error Handling

If a tool fails, the agent handles it gracefully:

```python
try:
    result = await tool.execute(**args)
except Exception as e:
    result = {"error": str(e)}
    # Continue with error message in context
```

## AgentFactory

The **AgentFactory** creates configured `AgentRuntime` instances from `AgentProfile` objects:

```python
from app.service.agent_factory import AgentFactory

factory = AgentFactory(bus=message_bus, session_id="sess_abc123")

# Create a frontend developer agent
profile = registry.get("frontend_developer")
agent = factory.create_agent(profile)

# Agent is now fully configured and can run
result = await agent.run("Build the checkout page")
```

### Factory Logic

```python
class AgentFactory:
    def create_agent(self, profile: AgentProfile) -> AgentRuntime:
        # 1. Build system prompt from profile
        system_prompt = self._build_system_prompt(profile)

        # 2. Create tool registry with allowed tools
        tools = ToolRegistry()
        for tool_name in profile.allowed_tools:
            tool = get_default_tool(tool_name)
            tools.register(tool)

        # 3. Create and return runtime
        return AgentRuntime(
            agent_id=profile.id,
            system_prompt=system_prompt,
            tools=tools,
            bus=self.bus,
            session_id=self.session_id,
        )

    def _build_system_prompt(self, profile: AgentProfile) -> str:
        # If profile has system_prompt, use it
        # Otherwise, generate from profile fields

        if profile.system_prompt:
            return profile.system_prompt

        return f"""
You are the {profile.name} agent.

Role: {profile.description}

Skills: {', '.join(profile.skills)}

You can perform these actions:
{format_list(profile.allowed_actions)}

You have access to these tools:
{format_list(profile.allowed_tools)}

You can only modify these types of files:
{format_list(profile.preferred_file_scopes)}

Constraints:
- Can modify files: {profile.can_modify_files}
- Can review work: {profile.can_review}
- Can deploy: {profile.can_deploy}

When given a task:
1. Understand what's being asked
2. Plan your approach
3. Use tools to implement
4. Verify your work (run tests, type-check, etc.)
5. Report what you did and any issues

Be thorough, complete all code (no stubs), and verify everything compiles/runs.
"""
```

## System Prompts

A well-crafted system prompt is crucial for agent behavior. Key elements:

### Role & Context

```
You are the Frontend Developer Agent. Your role is to build user interfaces
using React, TypeScript, and Tailwind CSS.
```

### Skills

```
Skills: react, typescript, nextjs, tailwind, component-design, testing

You are experienced in:
- React hooks and component composition
- TypeScript strict mode
- Responsive design with Tailwind
- Testing with Vitest and React Testing Library
```

### Tools

```
You have access to these tools:
- read_file(path): Read file contents
- write_file(path, content): Create or update files
- search_code(pattern): Find code patterns
- run_command(cmd): Run npm, npx, etc.
- list_directory(path): Browse project structure
```

### Constraints

```
Constraints:
1. Use TypeScript ONLY — no .js or .jsx files
2. React files must be .tsx
3. Use Tailwind CSS for all styling
4. Always write tests alongside code
5. Run npx tsc --noEmit to verify compilation
6. Complete all code — no stubs or placeholders
7. Include all imports — files should be standalone
```

### Process

```
When you receive a task:
1. First, explore the codebase (read existing files, understand structure)
2. Plan which files you need to create/modify
3. Generate ONE file at a time using write_file
4. After all files, run tests and type-checking
5. Report results with file paths
```

### Example Output Contract

```
Your response should include:
- Summary of what you implemented
- List of files created/modified with paths
- Test results (passing/failing)
- Any issues encountered
- Next steps if needed
```

## Agent Selection

The **Coordinator** selects which agents are appropriate for a task:

```python
async def select_agents_for_task(task: TaskNode) -> list[str]:
    # Use LLM to analyze task and match against all agent profiles

    prompt = f"""
Given this task:
Title: {task.title}
Description: {task.description}

And these agents:
{list_all_agent_profiles()}

Which agents are best suited? Consider:
- Skills required vs. available
- File scopes they can access
- Can they modify vs. only review
- Have they done similar work before

Return a JSON list of agent IDs ranked by fit.
"""

    response = await llm.call(prompt)
    return parse_json_list(response)
```

## Testing Agents

### Unit Test Example

```python
@pytest.mark.asyncio
async def test_frontend_agent():
    # Create agent
    profile = AgentProfile(
        id="test_frontend",
        name="Test Frontend",
        skills=["react"],
        description="Test agent",
        allowed_tools=["read_file", "write_file"],
        can_modify_files=True,
    )

    factory = AgentFactory(bus=MessageBus(), session_id="test")
    agent = factory.create_agent(profile)

    # Mock LLM to return specific tool calls
    async def mock_llm(messages, tools, model):
        return {
            "choices": [{
                "message": {
                    "tool_calls": [{
                        "id": "call_1",
                        "function": {
                            "name": "write_file",
                            "arguments": '{"path": "test.tsx", "content": "export default function Test() {}"}'
                        }
                    }]
                }
            }]
        }

    agent.llm_call = mock_llm

    # Run task
    result = await agent.run("Create a test component")

    # Verify
    assert "test.tsx" in result or "Test" in result
```

### Integration Test Example

```python
@pytest.mark.asyncio
async def test_agent_via_bus():
    # Set up bus and session
    bus = MessageBus()
    session_id = "test_sess"

    # Create agent
    profile = registry.get("frontend_developer")
    factory = AgentFactory(bus=bus, session_id=session_id)
    agent = factory.create_agent(profile)

    # Start agent in background
    agent_task = asyncio.create_task(agent.run(
        "Implement a button component"
    ))

    # Simulate task dispatch
    await asyncio.sleep(0.1)  # Let agent start
    await bus.publish(
        f"session.{session_id}.agent.frontend_developer",
        "coordinator",
        {
            "task_id": "task_1",
            "description": "Create a reusable Button component"
        }
    )

    # Wait for result
    result = await asyncio.wait_for(agent_task, timeout=10)

    assert "Button" in result
```

## Best Practices

### 1. Write Focused System Prompts

- Be specific about role and constraints
- List tools explicitly
- Give clear examples of expected output
- Set realistic expectations (no AI magic)

### 2. Choose Appropriate Tool Scope

- Restrictive file scopes prevent accidents
- Explicit tool lists prevent misuse
- Can_modify_files flag is key

### 3. Monitor Agent Behavior

- Log all tool calls and results
- Check token usage
- Monitor success rates per agent type

### 4. Test Thoroughly

- Unit test individual agents
- Integration test agent-to-bus communication
- End-to-end test full workflows

### 5. Handle Failures Gracefully

- Set tool budgets to prevent infinite loops
- Catch and log tool execution errors
- Provide clear error messages to coordinator

---

For implementation details, see:

- `backend/app/core/runtime.py` — AgentRuntime
- `backend/app/service/agent_factory.py` — Factory
- `backend/app/service/agent_registry.py` — Profile loading
- `backend/app/data/agents.json` — Profile definitions
