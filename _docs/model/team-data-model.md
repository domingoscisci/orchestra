# Team Data Model

## Purpose and status

This document describes the implemented persistent model for a Team run and
the minimal assignment handshake. The broader work board remains proposed and
is not implemented.

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
- `leadMemberId`: the Team Lead's member ID; it does not change during the run.
- `createdAt`: creation time.
- `originalAgent`: the agent role to restore when the Team Run is completed.

The complete roster, names, roles, acronyms, session identities, and hierarchy
are created with the run and remain fixed for its lifetime. A different team
structure requires a new run. The root session ID is the Team Lead's embedded
session ID.

### TeamMember

- `id`: stable member identifier within the run.
- `runId`: owning run.
- `name`: display name within the team.
- `acronym`: required short name, unique within the run. Generate it from the
  name's initials during onboarding; append a number to resolve collisions.
- `role`: selected OpenCode agent role.
- `session`: the member's single embedded OpenCode session:
  - `id`: OpenCode session ID, unique within the run.
  - `parentSessionId`: parent OpenCode session ID, when present.
  - `status`: latest observed execution state: `started`, `concluded`, or
    `interrupted`. This is not a terminal state of the OpenCode session; a
    later execution in the same session may change it again.
  - `updatedAt`: time the latest observed execution event was applied.
- `assignment`: the member's latest task assignment, when present:
  - `id`: unique assignment ID used to correlate assignment, acknowledgment,
    and report calls.
  - `assignedByMemberId`: Team Lead or Domain Lead who assigned the work.
  - `task`: the assignment instructions.
  - `status`: `pending_ack`, `started`, `blocked`, or `completed`.
  - `createdAt` and `updatedAt`: assignment timestamps.
  - `summary`: required for `blocked` or `completed`; the reason or final result.

Only one active assignment (`pending_ack` or `started`) may exist per member.
After a terminal status, a new assignment replaces the member's previous
assignment record. OpenCode session history remains the record of earlier
attempts; this field is not a task board or full assignment history.

The session tree is the canonical team hierarchy. A member's parent is derived
by resolving `session.parentSessionId` to another member's `session.id`; do not
persist a second, independently editable member-parent relationship. Update
session status from OpenCode execution events without duplicating the full event
history. After a plugin restart, the last persisted status may be stale if an
event was missed. Before starting an execution, verify that OpenCode accepts
continuation of the existing session ID; the stored status alone does not
establish that.

### Domain

- `id`: stable domain identifier within the run.
- `runId`: owning run.
- `name`: responsibility area.
- `leadMemberId`: Domain Lead.
- `memberIds`: members participating in the domain.

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
- `assigneeMemberId`: current assignee, when assigned; at most one at a time.
- `workstreamId`: optional workstream.
- `report`: a read-time view of the most recent submitted execution report,
  absent when no execution has submitted a report. It is not an independent
  source of truth.
- `updatedAt`: time of the latest board update.

The `id` is the identifier agents use to refer to the task; all schema
references use the same value. There is no separate display ID. Short IDs such
as `T1` or `R1` are examples; prefixes have no required meaning.

The Team Lead may assign work to any other roster member. A Domain Lead may
assign work only to other members of its domain. Other members cannot assign
work. The existing session hierarchy remains independent of domain membership.

Assignments use three tools: `assign_task` submits work to the target's
existing session and returns while the task is `pending_ack`;
`acknowledge_task` changes it to `started` after the recipient understands the
task and begins a concrete action, or to `blocked` with a reason;
`report_task` closes a started assignment as `completed` or `blocked` with a
summary. The initial acknowledgment updates shared state without prompting the
assigner. Completion or a block prompts the assigner once, so that lead can
coordinate follow-up work. A non-lead assigner relays only actionable updates
to its parent when needed. A blocked attempt requires an explicit new
assignment to retry. No timeout or automatic queue is used. Assignment
dispatch and agent creation/removal do not change the fixed team roster.

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
├── TeamMember ── embedded session.parentSessionId ──> TeamMember.session.id
├── Domain ── leadMemberId / memberIds ──> TeamMember
├── Workstream
└── Task ── optional workstreamId ──> Workstream
    ├── Dependency ── blockedByTaskId ──> Task
    └── TaskExecution ── memberId ──> TeamMember ──> embedded session
```

Every referenced member, task, and workstream must belong to the same run as
the record that references it. Each execution's session is derived from its
member. Dependencies must not point to the same task. Dependency cycles must be
rejected.

## Persistence shape

For team state, store one JSON document per Team Run in OpenCode plugin storage
under `team:<mainSessionID>`. The document contains TeamRun, TeamMember records
with their embedded sessions and latest assignments, and optional Domain
records. These remain distinct model entities even though they share one
storage value. The Team Lead's OpenCode session ID is the key suffix; each run
has a separate key.

The board entities remain outside this implementation scope and retain the
proposed separate-record layout: workstreams, tasks, dependencies, and task
executions are stored independently. The lightweight member assignment is only
the team coordination handshake and is not a board Task or TaskExecution. The
example JSON is a logical model snapshot, not the literal value stored under a
team key.

OpenCode plugin storage does not provide a verified atomicity or concurrency
guarantee. Orchestra serializes event-driven team updates within the plugin
instance; this does not provide cross-process locking or crash-safe transactions.

## State transitions

```text
Assignment: pending_ack → started → completed
                        └→ blocked
             pending_ack ─→ blocked

Task:      todo → doing → review → done
                         ↑       │
                         └─ doing┘  (Lead requests more work)

Execution: started → concluded
                  └→ interrupted

Session status (latest observed execution): started → concluded
                                           └→ interrupted
                    a later execution may set it to started again
```

An interrupted attempt can be followed by a new execution for the same task.
The task may remain `doing` until the Lead or a subsequent execution moves it
forward. Session lifecycle and task-attempt lifecycle remain distinct even
though session metadata is embedded in the member record.

## Open implementation questions

- Verify storage concurrency before adding concurrent board-record updates.
- Define validation and recovery behavior for missing or stale OpenCode session
  references when implementing persistence.
