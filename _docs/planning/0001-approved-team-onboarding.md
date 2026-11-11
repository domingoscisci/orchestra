# 0001-approved-team-onboarding

- Status: Done
- Owner: TBD
- Created: 2026-11-10
- Related issues: none

## Steps

- [x] Implement the `/team setup` onboarding command and validated roster flow.
- [x] Implement team activation, replacement, rollback, and completion.
- [x] Add scripted smoke tests for success and failure scenarios.
- [x] Update usage documentation and close the plan after validation.

## Problem statement

Orchestra needs an onboarding flow that turns a user's project and activity
into a clearly defined team of agents and roles.

## Why this matters

The onboarding must produce a team with clear coordination and valid role
assignments without asking users to repeat information or leaving ownership
ambiguous.

## Assumptions

- A team has exactly one Team Lead, operating in the main session.
- Every agent has exactly one functional role; multiple agents may share a role.
- The role catalog includes all OpenCode agent definitions available to the
  project (project-local, global, and built-in), with each definition's short
  description and source shown when available.
- Team Lead role choices must be visible and usable in the main session
  (`primary` or `all`); participant role choices must be visible and usable in
  child sessions (`subagent` or `all`). Both lists exclude hidden definitions.
  `list_lead` and `list_agent` apply these filters locally to
  `ctx.agent.list()`.
- The user starts onboarding explicitly with `/team setup` and approves the
  final summary within that same interaction; there is no separate start
  command.
- Each roster entry is a separate team agent using one selected role
  definition; the same definition may be selected for multiple agents.
- Team Lead and Domain Lead are coordination appointments, not functional
  roles.
- If multiple functional roles are available, the user selects the Team Lead's
  role. If only one role is available, it can be assigned directly.
- A team may consist only of its Team Lead for a task the lead can complete
  alone.
- A Team Lead cannot also be a Domain Lead.
- A team is created for the current activity only. Reusing or persisting teams
  is deferred to a later phase.
- The user chooses the participating agents and any Domain Leads; the Team Lead
  does not generate the roster on the user's behalf.
- The user adds participants individually by name and role, and assigns Domain
  Lead appointments and their domain scopes to roster members. Each domain has
  a name, one Domain Lead, and an explicit list of participating agents. The
  user decides whether a domain needs a Domain Lead; no minimum team size is
  imposed. One agent may lead multiple domains.
- The Team Lead uses the existing main session. On approval, onboarding creates
  child sessions first and switches that same main session to the selected Team
  Lead definition last.
- If a Team is already active, replacing it requires confirmation. The old Team
  remains active until the new Team has been created successfully.
- OpenCode 2.2.6 does not support updating session metadata through the plugin
  API. Orchestra stores the original agent and active roster in a private,
  session-keyed JSON file under `.opencode/orchestra/teams/`; it does not modify
  unrelated session metadata. On completion, the user confirms in chat,
  onboarding restores the original agent, then removes only that team's file.
- Completed child sessions remain available as history and are not reused by a
  later Team.
- If no compatible role definition is available, onboarding stops and explains
  what is missing; it does not create or edit role files.
- Cancelling before approval creates no child sessions and does not change the
  main session.
- If child-session creation fails, onboarding removes sessions created by that
  attempt. If any removal fails, it reports the remaining session IDs and keeps
  the main session and any previous active Team unchanged.
- Missing required values or invalid/duplicate participant names are reported;
  the user must correct them before seeing the final summary. Any roster change
  after the summary requires approval of the updated summary.
- If switching the main session to the new Team Lead or saving the new Team
  state file fails, onboarding removes the new child sessions and leaves the
  main session and previous Team unchanged. Failed removals are reported by
  session ID.
- When closing a Team, the original agent is restored before Orchestra's active
  roster file is removed. If either operation fails, the state file is kept and
  the failure is reported so closure can be retried.

## Options considered

### Team Lead and Domain Lead as separate appointments

The Team Lead coordinates the whole team. Domain Leads coordinate agents in
specific areas and do not also hold the Team Lead appointment.

### Team Lead may also be a Domain Lead

This could reduce the number of agents needed, but combines overall and
domain-level coordination in one agent and makes domain grouping less useful.

## Rough scope

### In scope

- Explain and collect the Team Lead's functional role.
- Switch the existing main session to the selected Team Lead definition after
  user confirmation.
- Let the user define the team roster, functional roles, optional Domain Leads,
  and their domains' members.
- List available OpenCode agent definitions with short descriptions and source
  when available, and allow multiple roster entries to use the same definition.
- Recheck the selected role definitions before activation; if any are no longer
  available or compatible, explain the issue and let the user correct the
  roster without changing sessions.
- Show the user-defined roster and request explicit confirmation before any
  session or agent changes.
- Restore the original main-session agent when the user confirms completion.

### Out of scope

- Implementing the onboarding tools.
- Defining all possible role templates or domain taxonomies.
- Defining collaboration on a single shared Task Execution.
- Persisting or reusing a team across activities.
- Planning or assigning Tasks and Workstreams; that is a later workflow phase.

## Risks and unknowns

- Too many onboarding questions may make simple, single-agent work cumbersome.
- Too few questions may produce ambiguous ownership or invalid role
  assignments.
- Switching the current main session or creating child sessions may fail after
  some setup has already succeeded.

## Implementation note

The current plugin API cannot write session metadata. Team state therefore
lives in `.opencode/orchestra/teams/<session-id>.json`; this is local runtime
state, not a reusable team definition. The shared command source is
`src/commands/team.md`; README documents copying it into project or global
OpenCode command directories. Runtime state remains ignored.

## Validation approach

The required smoke suite has four scripted groups. It uses predefined user
answers and simulated OpenCode APIs, so it runs without a real user, provider
credentials, or model calls.

1. A Team containing only a Team Lead.
2. A Team with a Team Lead, Developer, and Reviewer, without a Domain Lead.
3. A Team with repeated roles and a user-selected Domain Lead, including the
   domain's member list.
4. Safety checks for cancellation, child-session creation failure, failed
    rollback, failed Team Lead switch or state save, failed closure, and
   replacement of an active Team.

The first three groups exercise setup, approval, activation, completion, and
restoration of the original agent. Assertions cover role-mode and hidden-agent
filters, unchanged main-session ID, child creation before switching the main
agent, preservation of unrelated session metadata, and retention of child-session
history. Safety checks verify that cancellation has no effects, failed setup
does not replace the active Team, and incomplete rollback or closure is reported
without discarding the state needed for recovery.

A real OpenCode smoke test is manual-only and isolated to temporary sessions.
It may use a configured test model and is not part of the default automated
suite.

## Promotion criteria

- [x] The Team Lead, participant, and Domain Lead rules are complete and
  consistent.
- [x] Role selection, filtering, and missing or changed role behavior are
  specified.
- [x] Roster inputs, domain membership, validation, and approval are specified.
- [x] Activation, replacement, rollback, closure, and metadata behavior are
  specified for success and failure cases.
- [x] The four scripted smoke groups and manual-only live test are specified.
- [x] The roster-only scope and acceptance criteria are agreed before
  implementation.
