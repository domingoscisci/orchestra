# 0002-draft-team-management

- Status: Approved
- Owner: TBD
- Created: 2026-11-13
- Related issues: none

## Steps

- [ ] Implement the team document storage, serialized session-state updates,
      and structural model validation with focused tests.
- [ ] Add operational team instructions to TEAM.md, reference them from
      AGENTS.md, and test the instruction/validation boundary.
- [ ] Validate the integrated team-management flow and update model
      documentation to match the implemented team storage shape.

## Problem statement

The onboarding flow creates and activates a roster, but Orchestra needs a
persistent team model for the lifetime of a run. The model must preserve the
team structure, track current OpenCode session state, and support the agreed
team rules without implementing the task board.

## Why this matters

Persistent, validated team records provide a stable basis for later
coordination features. Keeping agent-facing operating instructions separate
from code-enforced model constraints avoids relying on a prompt to protect data
integrity.

## Assumptions

- The team consists of one TeamRun, TeamMember records with an embedded
  OpenCode session, and optional Domain records.
- Persist the team as one JSON-serializable document under the key
  `team:<mainSessionID>`, following the tested `ctx.storage` convention in the
  [session management runbook](../runbooks/manage-child-sessions.md). TeamRun,
  TeamMember, Session, and Domain remain distinct model entities within that
  document.
- The full roster, names, roles, acronyms, session identities, hierarchy, and
  domains are fixed after onboarding for the lifetime of the run.
- The stored session `status` is the state of the latest observed execution in
  that session, not a terminal OpenCode session state. Map execution events as
  follows: `started` to `started`, `succeeded` to `concluded`, and `failed` or
  `interrupted` to `interrupted`. A later execution can change the same
  session's status again. `updatedAt` records the latest applied event; full
  event history remains owned by OpenCode.
- After a plugin restart, the last persisted status may be stale if an event was
  missed. The status alone must not be treated as proof that OpenCode will
  accept continuation of the session.
- Existing onboarding JSON is not migrated. This plan supports newly created
  teams only; existing team state in the old format is intentionally not
  preserved by this transition.
- Event-driven updates to the same team document must be serialized by the
  plugin to avoid lost updates. The storage API has no verified atomicity or
  concurrency guarantee; do not rely on concurrent writes being safe.
- Structural invariants are validated by application code. The model rules
  remain documented in rules.yaml; agent operating guidance is written in
  TEAM.md and referenced by AGENTS.md.
- INV-B03 (hierarchical direct messaging) is included in TEAM.md as an
  operational rule. General member validity and same-run membership are
  model-level preconditions and need not be repeated in each behavioral rule.
- Existing /team setup remains the roster creation flow; this plan adds the
  persistent team model around that flow rather than redesigning onboarding.

## Options considered

### Keep all team behavior in onboarding prompts

This is insufficient for persistent model integrity and would mix runtime
instructions with constraints that must be enforced by code.

### Separate model validation from operational instructions

Use rules.yaml as the invariant specification for validation, implement those
checks in the model/service layer, and keep behavioral guidance such as INV-B03
in TEAM.md. AGENTS.md points agents to TEAM.md.

## Scope

### In scope

- Persist and read TeamRun, TeamMember, embedded session metadata, and optional
  Domain entities in one team document keyed by the main session ID.
- Validate the team structural invariants relevant to creation and persisted
  state: INV-S01 through INV-S06 and INV-S14, adapting S06 to fixed membership
  with no archive/removal workflow.
- Keep team structure immutable after onboarding while updating the latest
  observed execution status and `updatedAt` from OpenCode events.
- Replace the old onboarding JSON for newly created teams without migrating
  existing team state.
- Create TEAM.md with operational rules, including INV-B03, and create or
  update root AGENTS.md to reference TEAM.md.
- Test valid and invalid team structures, domain membership, acronym
  uniqueness, serialized session-event updates, and the operational-rule
  documentation.
- Update the model/example documentation to describe the implemented team
  storage shape; keep the persistence layout for out-of-scope board entities
  separate unless team implementation requires a change.

### Out of scope

- Workstream, Task, Dependency, TaskExecution, reports, assignments, execution
  lifecycle, task authorization, and board UI/API.
- Team membership changes, archival, removal, reparenting, or role changes after
  run creation.
- Implementing direct-message transport or enforcement in the messaging
  subsystem; INV-B03 is included as operational guidance in TEAM.md.
- Duplicating general identity/run-membership preconditions inside each
  behavioral rule.
- Migrating existing team state stored in the old onboarding JSON format.

## Risks and unknowns

- Replacing the old onboarding JSON without migration means existing team state
  is not carried forward; this is an accepted compatibility break for this
  scope.
- Storage does not provide a verified atomicity/concurrency guarantee.
  Event-driven updates to a team document must be serialized within the plugin;
  this does not establish cross-process locking or crash-safe transactions.
- Prompt instructions cannot guarantee structural integrity; validators must
  reject invalid records independently of agent compliance.
- rules.yaml currently includes board invariants as well as team invariants;
  implementation must select only the team validation rules in this phase.
- The existing model documentation proposes separate key-value records for
  board entities; it must clearly distinguish that proposal from this phase's
  single team document.

## Acceptance criteria

- Team data is stored and read as a JSON-serializable document under
  `team:<mainSessionID>`; different main sessions do not share team state.
- TeamRun, members, embedded session metadata, and optional domains round-trip
  without changing the model's entity boundaries.
- Existing onboarding JSON is not migrated; this behavior is documented and
  tested so the compatibility break is intentional rather than accidental.
- Session `status` is explicitly documented as the latest observed execution
  state, not a terminal session state. Updates map verified
  `session.execution.*` events to model states (`started` → `started`,
  `succeeded` → `concluded`, `failed` or `interrupted` → `interrupted`) and are
  serialized so overlapping handlers cannot overwrite one another's updates.
- A focused test applies `started → succeeded → started → failed` to one
  session and verifies each resulting status and `updatedAt`. Documentation and
  tests establish that a persisted status may be stale after missed events or a
  plugin restart, and cannot alone establish whether OpenCode accepts
  continuation.
- Structural invariants INV-S01 through INV-S06 and INV-S14 are enforced both
  when creating a team and when reading persisted team state. Invalid state is
  rejected rather than silently accepted.
- TEAM.md documents INV-B03 as an agent operating rule for hierarchical direct
  messaging; no messaging transport enforcement is added. General member
  validity and same-run membership remain model-level preconditions.
- Root AGENTS.md points agents to TEAM.md.
- Tests cover valid and invalid structures, domain references, acronym
  uniqueness, separated state for different main sessions, overlapping session
  updates, repeated execution-state transitions on one session, stale status
  limitations, and the documented instruction/validation boundary.
- `_docs/team-data-model.md` accurately distinguishes the team document shape
  from any still-proposed persistence layout for out-of-scope board entities.

## Promotion criteria

- [x] Team storage shape, keying, and no-migration behavior are documented and
      reflected in the implementation scope.
- [x] Team structural invariants and their code enforcement are mapped clearly.
- [x] Operational rules in TEAM.md are separated from model validation, and
      AGENTS.md references TEAM.md.
- [x] INV-B03 wording and scope are agreed for operational guidance.
- [x] Verified event signals, serialized update behavior, storage limitations,
      and test approach are clear.
- [x] Objective, exclusions, acceptance criteria, and implementation sequence
      are sufficiently specific for approval.
