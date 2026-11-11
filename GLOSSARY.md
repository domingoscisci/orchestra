# Orchestra Team Model

This glossary defines the team and work-planning terms used in Orchestra.

## Team structure

**Team**:
A group of agents with defined roles, coordinated by a Team Lead.

**Agent**:
An entity entrusted with work for the team. Each agent has exactly one role.

**Model**:
The technology used by an agent; it can be replaced independently of the
agent.

**Role**:
A set of instructions and responsibilities for a specific kind of work. A
team may have multiple agents with the same role.

**Team Lead**:
The agent responsible for coordinating the team as a whole.

**Domain Lead**:
The agent responsible for coordinating work and agents in a specific domain.

## Work organization

**Task**:
The smallest unit of work, defined by an objective and a verifiable expected
result, independently of who performs it. The same task can have multiple
independent executions.

**Task Execution**:
An agent's attempt to complete a task, with its own status and result. An agent
can have only one active task execution at a time.

**Workstream**:
A coherent group of related tasks that contributes to a partial outcome.
Workstreams can proceed in parallel and may depend on one another.
_Avoid_: Phase, Step

**Workflow**:
The organization of a team's work through tasks, workstreams, and their
dependencies, including which work proceeds sequentially or in parallel.
_Avoid_: Workplan
