# Architecture

## Orchestrator

The orchestrator is the central coordinator for user requests.

- Receives the user request.
- Decides whether to use the planner agent or not.
- If no planner is required, it assigns a series of agents and their work prompts.
- If the planner is required, it provides the user query and the selected agents to the planner.
- After all work finishes, the final result is produced by the orchestrator.
- A task is marked completed by the orchestrator.

## Agents

- **browser**
  - Researches the user query and returns summarized answers.
- **planner**
  - Breaks the user query into steps and assigns other agents either linearly or in parallel.
- **file**
  - Handles CRUD operations for files only.
- **automation**
  - Follows the user's request and performs automation in web browsers.

## Interface

### Session

#### Design

```json
{
  "task": [
    {"name": "task1", "status": "pending|completed"},
    {"name": "task2", "status": "pending|completed"}
  ],
  "agents": [
    {"name": "agent1", "status": "IDLE|WORKING|ERROR"},
    {"name": "agent2", "status": "IDLE|WORKING|ERROR"}
  ],
  "task_queue": [
    {"name": "agent1", "task": "prompt or instruction"},
    {"name": "agent2", "task": "prompt or instruction"}
  ]
}
```

### Memory

```json
{
  "long_term": [
    {
      "mem_type": "user_preference",
      "summarization": ["something something", "something something"]
    },
    {
      "mem_type": "research_results",
      "summarization": ["something something", "something something"]
    }
  ],
  "short_term": [
    {
      "sessionid": "#2",
      "summarization": ["something something", "something something"]
    }
  ],
  "session_term": ["something something", "something something"]
}
```

### Execution

- Execution is sandboxed within the user's initial or current working directory path.
- When the CLI starts, the current path is set as the execution boundary.
- If a user task is received, the orchestrator decides the scope and path for the task.

## Workflow

- If the planner is called, the planner defines the steps for each agent.
- Each agent executes tasks linearly.
- Each agent's tool execution and results are compressed every loop with only the required information.
- Compressed results may introduce latency.
- Each task result is returned to the orchestrator.
- The orchestrator sends current tasks and session state to the planner.
- The planner marks tasks as pending or completed.
- The planner may append tasks to the existing workflow and continue.

## Execution Paths

- Orchestrator -> planner (if planning is required) -> multiple or single agent calls -> agent runs -> save memory to long, short, or session -> agent results -> orchestrator verifies status -> planner marks pending/completed tasks -> agents
- Orchestrator -> single agent requirement for simple prompts -> agent call -> result -> orchestrator END

## Problems

- The planner is too powerful and currently owns the lifecycle, but the orchestrator should retain initiative.
- Memory design is too broad:
  - working memory
  - session memory
  - episodic memory
  - semantic memory
  - procedural memory
- The summarization agent is weak.

## Assignments

### Assignment 1

- Agent output for success:

```json
{
  "task": "something",
  "action_required": [],
  "action_taken": [],
  "status": "COMPLETED|PENDING"
}
```

- Agent output for failure:

```json
{
  "task": "something",
  "status": "ERROR",
  "root_cause": []
}
```

### Assignment 2

- Recreate a secondary validation workflow.
- Pass the state to the planner and create a validation plan.
- Orchestrate the validation plan to the agents, such as:
  - is this file present?
  - is the file diff present?
  - are research queries relevant?
- Send validation tasks back to the orchestrator and execute them.
- If validation passes, finish; otherwise retry or continue with planner guidance.

### Assignment 3

- State values:
  - ASSIGNED
  - INPROGRESS
  - COMPLETED
  - ERROR
  - INVESTIGATION
  - RETRYING
  - CANCELLED
  - CLOSED
  - VERIFIED

### Assignment 4

- Compression memory levels:
  - Level 1:
    - Compress agent results or pre-agent results when a context limit is reached.
    - Remove unwanted wording and keep only relevant task details.
  - Level 2:
    - Orchestration compression becomes aggressive when a state changes.
  - Level 3:
    - After all tasks are completed and verified, compress maximally.
    - Return only important information and a concise summary of what happened in the session.
    - Save memory according to the planned structure.
