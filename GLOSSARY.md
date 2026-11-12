# Orchestra Team Model

This glossary defines the team and work-planning terms used in Orchestra.

## Team structure

**Team**:
A group of agents with defined roles, coordinated by a Team Lead for one run.

**Team Run**:
One team activity rooted in a main OpenCode session. Its team structure,
sessions, and board belong to that run.

**Run**:
Short form of Team Run. Use Team Run when the distinction from other kinds of
runs matters.

**Board**:
The work-planning view for one Team Run, comprising its tasks, workstreams, and
task dependencies.

**Agent**:
An entity entrusted with work for the team. Each agent has exactly one role.

**Team Member**:
An agent participating in one Team Run, associated with one OpenCode session in
that run.

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

**Domain**:
An area of responsibility with a Domain Lead and participating team members.

**Session**:
An OpenCode conversation associated with one team member in a run. Session
parent/child relationships define the team hierarchy.

## Work organization

**Task**:
The smallest unit of work, defined by an objective and a verifiable expected
result, independently of who performs it. The same task can have multiple
independent executions.

**Task Execution**:
An agent's attempt to complete a task, with its own status and result. An agent
can have only one active task execution at a time.

**Task Status**:
The board state of a task: `todo`, `doing`, `review`, or `done`. `review` means
the agent has submitted its result and the Team Lead must approve it.

**Workstream**:
A coherent group of related tasks that contributes to a partial outcome.
Each task belongs to at most one workstream. Workstreams are distinct from
domains and can proceed in parallel.
_Avoid_: Phase, Step

**Task Dependency**:
A blocking relationship in which one task cannot proceed until another task is
done.

**Task Report**:
An agent's free-text summary plus structured outcome, modified files, test
results, and optional references. The summary explains why work is partial or
blocked.

**Workflow**:
The organization of a team's work through tasks, workstreams, and their
dependencies, including which work proceeds sequentially or in parallel.
_Avoid_: Workplan
