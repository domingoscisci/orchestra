# Team Data Model

## Purpose and status

This document defines the proposed persistent model for a Team run and its
work board. It records the agreed domain model; it does not claim that these
entities or workflows are implemented.

The [glossary](../../GLOSSARY.md) defines the canonical terms.

## Boundary

A **Team Run** is one activity rooted in a main OpenCode session. Its team,
session state, domains, workstreams, tasks, dependencies, and task executions
belong to that run. A later run receives a separate board; teams and boards are
not reused across runs.

The **Board** is the work-planning view for one run: its tasks, workstreams, and
task dependencies. It is a logical grouping, not a separately persisted entity;
the records that make it up are stored under their owning run.

OpenCode remains the source of the full conversation and event history.
Orchestra stores the current session state and the board information needed to
coordinate work, rather than duplicating the OpenCode event log.

## Entities

### TeamRun

- `id`: stable run identifier.
- `rootSessionId`: ID of the main OpenCode session that owns the run; it equals
  the Team Lead's session ID.
- `leadMemberId`: the Team Lead's member ID; it does not change during the run.
- `createdAt`: creation time.

### TeamMember

- `id`: stable member identifier within the run.
- `runId`: owning run.
- `name`: display name within the team.
- `role`: selected OpenCode agent role.
- `sessionId`: the member's OpenCode session ID; one session per member in a
  run.
- `archivedAt`: optional timestamp; absent for active members.

The session tree is the canonical hierarchy for active members. A member's
parent is derived from the parent of their session; do not persist a second,
independently editable member-parent relationship. Archived member records stay
in storage for historical references but are excluded from the active team.

### Session

- `id`: OpenCode session ID.
- `runId`: owning run.
- `memberId`: the team member using this session.
- `parentSessionId`: parent OpenCode session ID, when present.
- `status`: current lifecycle state: `started`, `concluded`, or `interrupted`.
- `updatedAt`: time of the latest status update.
- `deletedAt`: optional timestamp when the OpenCode session is deleted.

Update the current status from OpenCode events. Do not duplicate the full event
history. When an OpenCode session is deleted during member archival, retain its
session record and ID in storage for historical references; set `deletedAt`.
Before starting an execution, verify that OpenCode accepts continuation of the
existing session ID; the stored lifecycle status alone does not establish that.

### Domain

- `id`: stable domain identifier within the run.
- `runId`: owning run.
- `name`: responsibility area.
- `leadMemberId`: Domain Lead.
- `memberIds`: active members participating in the domain.

Domains describe people and responsibilities. They are distinct from
workstreams, which group tasks; a task or workstream does not inherit domain
membership implicitly.

### Workstream

- `id`: stable workstream identifier within the run.
- `runId`: owning run.
- `name`: coherent task grouping.

A workstream may have no tasks or several tasks. A task belongs to zero or one
workstream. Workstreams have no required relationship to domains.

### Task

- `id`: stable task identifier within the run.
- `runId`: owning run.
- `title` and `description`: objective and expected result.
- `status`: `todo`, `doing`, `review`, or `done`.
- `assigneeMemberId`: current active assignee, when assigned; at most one at a
  time.
- `workstreamId`: optional workstream.
- `report`: a read-time view of the most recent submitted execution report,
  absent when no execution has submitted a report. It is not an independent
  source of truth.
- `updatedAt`: time of the latest board update.

The Team Lead creates tasks and manages assignment and dependencies. A Domain
Lead may create tasks and assign them only to members in its descendant
subtree. Any assigned agent may update only their assigned task, submit its
execution report, and move it to `review`. The Team Lead may move any reviewed
task to `done` only when its latest submitted execution report has outcome
`completed`, or back to `doing` for more work. A Domain Lead may accept a
reviewed task assigned to a member in its descendant subtree and move it to
`done` under the same condition.

### Execution report

Each `TaskExecution` may have a report describing that attempt. This is the
canonical report; task-level report views are derived from the most recent
execution report and MUST NOT replace execution provenance. A combined read
snapshot may include both the canonical execution report and its derived task
view.

- `summary`: free text describing the work and its rationale. For `partial` or
  `blocked`, explain the remaining work or the blocking issue here.
- `outcome`: `completed`, `partial`, or `blocked`.
- `filesModified`: array of modified file paths; empty when no files changed.
- `tests`: array of checks, each with a `name` and `result` (`passed`,
  `failed`, or `not_run`).
- `references`: optional array of references such as commit IDs or pull request
  URLs.

`outcome` describes the result of the attempt, not the task's workflow status.
The assigned agent submits the report with the execution. A report with outcome
`partial` or `blocked` may be submitted for review; the task status remains
distinct from the report outcome.

### Dependency

- `taskId`: the blocked task.
- `blockedByTaskId`: the prerequisite task.

A dependency means only “blocked by”: the blocked task cannot proceed until its
prerequisite is `done` and its task-level report view has outcome `completed`.

### TaskExecution

- `id`: unique ID for this attempt.
- `runId`: owning run.
- `taskId`: task being attempted.
- `memberId`: agent performing the attempt.
- `sessionId`: OpenCode session used for the attempt.
- `status`: `started`, `concluded`, or `interrupted`.
- `startedAt` and `endedAt`: attempt timestamps; `endedAt` is absent while
  active.
- `report`: this attempt's report, when one has been submitted.

Each assignment or resumption creates a new execution, preserving earlier
attempts. An agent and a task can each have at most one active execution at a
time. Concluding an execution submits the task for review; it does not itself
mark the task `done`.

## Relationships

```text
TeamRun
├── TeamMember ── Session ── parentSessionId ──> Session
├── Domain ── leadMemberId / memberIds ──> TeamMember
├── Workstream
└── Task ── optional workstreamId ──> Workstream
    ├── Dependency ── blockedByTaskId ──> Task
    └── TaskExecution ── memberId / sessionId ──> TeamMember / Session
```

Every referenced member, session, task, and workstream must belong to the same
run as the record that references it. Dependencies must not point to the same
task. Dependency cycles must be rejected.

## Persistence shape

Use separate key-value records for runs, members, sessions, domains, workstreams,
tasks, dependencies, and task executions. Avoid rewriting a whole run document
when an agent updates one task. Generate stable IDs for records and retain the
OpenCode session IDs as external identifiers. Store reports on execution
records; derive the task-level report view rather than persisting a second copy.

This layout reduces collisions between writes to different tasks, but does not
by itself guarantee atomic updates or prevent two writers from updating the
same record. The storage API's concurrency guarantees must be verified before
relying on concurrent board writes.

## State transitions

```text
Task:      todo → doing → review → done
                         ↑       │
                         └─ doing┘  (Lead requests more work)

Execution: started → concluded
                  └→ interrupted

Session:   started → concluded
                  └→ interrupted
```

An interrupted attempt can be followed by a new execution for the same task.
The task may remain `doing` until the Lead or a subsequent execution moves it
forward. Session and execution state are stored separately because session
lifecycle and task-attempt lifecycle are related but not interchangeable.

## Open implementation questions

- Verify whether storage writes are atomic and what happens when the same
  record is updated concurrently.
- Define validation and recovery behavior for missing or stale OpenCode session
  references when implementing persistence.
