# 0004-approved-orchestra-activation-confirmation

- Status: In Progress — timeout and HTTP 503 unavailable-service UI verified
  by owner-reported NAS smoke
- Owner: TBD
- Created: 2026-11-19
- Target: N/A
- Related draft: 0004 (same file, promoted)
- Related plans: [0003-approved-orchestra-openchamber-extension.md](0003-approved-orchestra-openchamber-extension.md)
- Related issues: none
- Related PRs: none
- Related ADRs:
  - [0002: Require out-of-band panel approval for sensitive operations](../adr/0002-out-of-band-panel-approval.md)

## Steps

- [x] Define the activation acknowledgment contract, server lifecycle, and
      secure local connection for the extension service.
- [x] Implement correlated activation status and session-scoped active-team
      lookup without creating a second canonical store.
- [x] Build and smoke-test the integrated extension on OpenChamber desktop.

## Problem statement

The extension can save a team and ask the current chat to activate it, but it
cannot currently distinguish an accepted prompt from a successfully activated
team.

## Why this matters

The panel should report activation only after the plugin confirms success. A
live agent/task dashboard is explicitly deferred to a separate future plan.

## Assumptions

- The OpenCode plugin remains authoritative for team creation, validation, and
  runtime state.
- The plugin's current `ctx.storage` team document is the canonical runtime
  source. `.team.yml` remains the extension-owned saved-team configuration.
- The extension panel communicates through the OpenChamber SDK and cannot
  fetch a plugin's `localhost` server directly from its sandboxed iframe.
- A package-owned extension service can act as the panel's host-managed bridge
  to the plugin's loopback API, subject to user approval.
- A team activation request needs a correlation ID so the panel displays the
  result for the request it initiated, not a stale activation.
- The activation success boundary is the existing tool's successful return:
  team state and child sessions are created, team guides are updated, and the
  lead-agent switch succeeds. A thrown error is a failed result after rollback.

## Decisions resolved during grill

- Publish a read-only view of the plugin's existing `ctx.storage` state. Do not
  add a second SQLite database or copy runtime state into `.team.yml`.
- This plan covers activation confirmation and a compact active-team badge
  scoped to the current session. A live agent/task dashboard needs a separate
  plan after this bridge is validated.
- Start the server when the plugin loads, before any team activation request.
  Require singleton startup and clean shutdown with the plugin lifecycle.
- Use a dynamically selected loopback port. Publish the endpoint and private
  shared token in a user-private runtime file for the extension service to read;
  remove that file during clean shutdown.
- Correlate each activation with a panel-generated request ID. The plugin records
  pending/success/failure receipts in `ctx.storage`, and the API exposes the
  result by ID.
- Pass the panel-generated ID through the activation message as an explicit
  `activate_team` tool parameter; do not infer it from whichever receipt is
  newest.
- Apply the pending timeout in the panel. On timeout, show an unknown/pending
  result and allow a status check; do not convert the plugin's receipt to
  failure without an authoritative outcome.
- Store the discovery file in the plugin's per-user data directory with
  restrictive permissions, readable only by the plugin and authorized service.
- Poll the correlated receipt at a modest interval, stopping at a terminal
  result or when the panel view closes. Keep server-sent events as a possible
  future optimization, not a first-release requirement.
- In the first release, expose `pending`, `activated`, and `failed` from the
  plugin. The panel may show `unknown` for timeout or an unreachable service;
  it must not misreport that as a plugin failure.
- Keep the HTTP server read-only for the panel. Team activation remains in the
  existing chat/tool flow; the panel only reads correlated activation results
  and the current session's active-team summary.
- Keep at most the 50 most recent activation receipts in `ctx.storage`.
- On startup, validate any existing discovery file and replace it only when its
  endpoint is not a valid live Orchestra server; do not blindly remove another
  running plugin instance's file.
- After a panel timeout, let the user check the same request ID again; do not
  automatically send a second activation request.
- Before implementation, verify file access and the local API bridge on
  desktop. Web support is evaluated separately and does not block the first
  desktop release.
- Support current OpenChamber desktop versions at release and record the
  versions tested. Web support may follow after a separate compatibility check.
- Set the desktop minimum to the oldest version proven to support the bridge;
  retain `>=2.7.2` only if the technical spike verifies it.
- Request the host's explicit service permissions. If the user denies them, do
  not bypass the restriction; keep chat activation available and show that panel
  confirmation is unavailable.
- Run the extension service only while the relevant panel view is open; stop
  its polling and bridge use when the view closes.
- Keep the extension service narrow: expose only defined operations for
  checking activation receipts and current-session team status, not a generic
  HTTP proxy. The activation tool itself creates and updates each receipt.
- Show a short, useful activation error without stack traces, tokens, local
  paths, or internal data. Keep connection failures distinct as unknown.
- Show only the activation request initiated from the current panel view; do not
  turn the first release into a receipt-history screen.
- Return only the request ID, state, update time, and a short safe error
  description in an activation receipt.
- On panel load or session change, query the plugin's canonical state for the
  current session and restore the active-team badge when present. Do not infer
  active state from client memory or carry it across sessions.
- Ignore lookup responses for a session that is no longer the panel's current
  session.
- Return only the active team's saved configuration ID when available and the
  minimum role/domain summary needed to match legacy active teams to `.team.yml`.
- Keep the panel's active-team presentation to a badge; a team/task dashboard
  and active-team details remain out of scope.
- Create the pending receipt before validation/activation begins and record a
  failure for every handled error, including preflight validation failures.
- Treat a repeated request ID as idempotent: return its existing receipt and do
  not start activation a second time.

## Technical spike (2026-11-20)

The OpenChamber SDK 2.7.2 service contract was checked against the tagged SDK
documentation:

- `contributes.service` and `host.serviceRequest` are available. The host
  starts a packaged service process and proxies panel requests to its loopback
  HTTP listener. The host also supplies the service port, bearer token, and a
  per-extension data directory.
- The service capability requires explicit approval. Permission declarations
  are advisory, not an operating-system sandbox; the service runs with the
  user's full access.
- The host manages service lifetime. By default it starts on the first request
  and stops after ten idle minutes; `keepRunning` would keep it alive beyond
  panel use. The SDK does not promise an immediate stop when the panel closes.
- The service's data directory is for extension-owned files; the OpenCode
  plugin does not receive that path through the documented contract. Sharing
  discovery data therefore needs a separately agreed per-user path convention.
- The user selected a shared per-user Orchestra data directory. Both processes
  will derive its path using the operating system's standard data location;
  owner-only permissions protect other OS accounts, not same-user processes.
- File permissions can restrict access by other OS users, but cannot isolate
  the plugin and service from other processes running as the same user.
- The user accepts the host-managed service stopping after ten idle minutes.
  Panel polling must stop when the panel closes; do not enable `keepRunning`.

The documentation-level spike is complete. A separate probe package was then
installed and approved by the user. The user-provided panel result showed
`serviceStatus: stopped` before the first request, then HTTP 200 with
`connected: true` and a ready mock plugin. The service read the discovery file
from the shared OS temp directory and reached the mock plugin over loopback.
This verifies host-managed service startup, `serviceRequest`, same-host
file access, and loopback access in the desktop setup.

The probe used a mock plugin and the OS temp directory, not Orchestra's actual
OpenCode plugin or the final per-user data path. Immediate stop on panel close
and the host's idle shutdown were not tested.

## User-reported active-session test (2026-11-21)

The user reports that team activation succeeded in `dassiIngest`. After
reopening OpenChamber, the panel did not show the active badge; another
activation attempt reported that the team was already active. The session
transcript confirms both tool outcomes, but not successful badge restoration.
The session identifier is not published.

## Options considered

### Plugin-owned loopback API with extension-service bridge

The plugin starts a loopback HTTP server that reads the canonical team document
from `ctx.storage` and exposes a minimal read-only API. The extension's
host-managed service proxies the required routes to the panel through
`serviceRequest`.

Advantages: follows the Ensemble pattern, supports a live state view, and
keeps writes and canonical state in the plugin.

Costs: adds a local server, an extension service permission, port discovery,
authentication, lifecycle handling, and web/desktop integration tests.

### Separate SQLite state database

The plugin copies runtime state into a dashboard database, as Ensemble does.

This is rejected for the current direction: it duplicates canonical state
already held in `ctx.storage` and risks divergent team/status records.

### Shared activation receipt only

The plugin records an activation result that the panel reads through the
OpenChamber file API. This remains a lower-scope fallback if exposing the full
read-only API proves too risky or the live status view is deferred.

## Open questions

- Verify the final shared per-user data path with the real OpenCode plugin.

## Scope

### In scope

- A plugin-owned, loopback-only API that reads correlated activation receipts.
- A read-only current-session team-status endpoint for restoring the active
  badge after panel reopen.
- An extension service bridge accessed by the panel through `serviceRequest`.
- Correlated activation results with pending, activated, and failed states.
- User-visible service permissions, security review, regression tests, and
  OpenChamber desktop smoke tests.

### Out of scope

- A second team/task database owned by the extension.
- Exposing the plugin API to the local network or the public internet.
- Replacing the existing team activation and session-creation logic.
- Mobile and VS Code support unless the host adds the required extension
  service capabilities.
- The live agent/task dashboard and its history/output fields; define these in
  a separate plan after activation confirmation is validated.

## Risks and unknowns

- The plugin server must not expose team data to arbitrary local processes;
  loopback binding alone may not be sufficient protection.
- Plugin restarts, port conflicts, and stale server processes can make status
  appear unavailable or out of date.
- The runtime discovery file must be private, atomically written, and removed
  on shutdown.
- The extension service is a process with the user's permissions and requires
  explicit approval; its scope must stay narrow.
- Polling can create excess requests; the API should return compact snapshots
  and use a modest refresh interval.
- The panel's session-state lookup and badge restoration remain to be verified
  with the real plugin and final per-user path.

## Acceptance criteria

- [x] The panel reports activation only after the plugin's successful tool
      result, correlated to the request ID from that panel view.
- [x] Reopening or changing the panel's session restores the active badge only
      when the canonical plugin state says a team is active in that session.
- [x] Denied service permission is reported without sensitive details
      (owner-reported desktop smoke, 2026-11-25).
- [x] A denied team activation reaches a terminal panel state from its matching
      audit event (owner-reported NAS smoke, 2026-11-26).
- [x] A pending activation times out to an unavailable/unknown state with
      `Check again`; after the native permission denial, rechecking reports
      activation denied (owner-reported NAS smoke, 2026-11-26).
- [x] The unavailable-service state is displayed distinctly and without
      sensitive details (owner-reported NAS smoke with the test-only HTTP 503
      probe, 2026-11-26).
- [x] The bridge binds to loopback, authenticates with a private token, follows
      plugin/panel lifecycles, and exposes no activation write endpoint.
- [x] Desktop probe confirms `serviceRequest`, service startup, shared temp-file
      access, and loopback connection to a local plugin stand-in.
- [x] Record the shared per-user path as
      `/home/openchamber/.local/share/orchestra` (owner-reported plugin process
      environment). The guest-service contract passes the same `HOME`; its
      resolver selects the same path, though no service PID was captured.
- [x] The tagged integrated extension builds, passes regression tests, and
      passes the package checker; GitHub CI passed on `v0.0.1` (see plan 0005).

## Dependencies

- OpenChamber desktop must support the extension service, private discovery-file
  access, and calls to the plugin's loopback API. The mock desktop probe passed;
  verify the final path with the real plugin.

## Validation plan

- Focused tests cover receipt correlation, duplicate IDs, success, and handled
  failure, plus session-scoped active-team lookup and badge restoration. The
  timeout and test-only HTTP 503 unavailable-service UI now have owner-reported
  NAS smoke evidence. Grant-denied and service-start-failure states remain
  unverified.
- Build the extension and smoke-test the approved flow on desktop.
- Create a child session, retrieve it through the supported session API, and
  confirm `session.get` returns its `parentID`. Record the host version and
  observed value; this is a prerequisite for relying on the plugin's
  root-session activation guard.
- Record the tested OpenChamber version and verify the declared minimum.

## Current blockers

- Historical note: the read-only bridge constraint above was superseded by
  ADR 0003. The panel remains read-only for operation decisions; native host
  permission prompts gate sensitive actions.
- The earlier badge-restoration failure is superseded by the smoke result below.
  The matching-audit denied-activation and timeout/recheck states have
  owner-reported NAS smoke evidence. The test-only HTTP 503 unavailable-service
  UI also passed in the owner-reported NAS smoke. Grant-denied and
  service-start-failure states remain unverified.
- OpenChamber's service contract does not promise immediate process shutdown
  when the panel closes; the accepted fallback is its ten-minute idle stop.

## Desktop smoke test (2026-11-25)

- User-reported result on OpenChamber 2.8.0 and OpenCode 2.3.2: local extension
  installation and panel opening succeeded; service permission approval and
  denial were both tested successfully.
- Owner-reported M3 smoke on the NAS: native `ask` prompts appeared for
  `activate_team`, `complete_team`, and `delete_agent`; a rejected activation
  was denied, and explicit configured `deny` blocked activation without a
  prompt, active team, `TEAM.md`, or `AGENTS.md`. Audit outcomes were coherent.
  The owner confirms this used a clean/isolated profile. These are
  owner-reported runtime results; no prompt capture or host trace was saved.
- Team activation succeeded after rebuilding the panel UUID fallback.
  Reopening restored the active badge, and a different session did not inherit
  it.
- A child session's `parentID` was checked and confirmed to point to its Lead
  session.
- Path probe, owner-reported: four OpenCode candidate processes had
  `HOME=/home/openchamber` and no `XDG_DATA_HOME` or
  `ORCHESTRA_DATA_DIRECTORY`; the plugin resolver therefore selects
  `/home/openchamber/.local/share/orchestra`. The guest-service contract passes
  `HOME`, so the service resolves the same default path; no service process was
  visible in this probe. Timeout and unavailable-service UI remain unverified.
- The earlier report that badge restoration was missing is superseded by this
  smoke result.

## Timeout and denied-activation smoke (2026-11-26)

- Owner-reported NAS result: after approximately ten minutes, the panel showed
  `Status unavailable` and `Check again` for `nas-activation-smoke`. The
  supplied screenshot shows no token, local path, or stack trace.
- The owner reports that after denying the pending native activation
  permission and clicking `Check again`, the panel reported activation denied.
- Host versions were not reconfirmed for this run. This verifies the
  timeout/recheck path only; see the following section for the separate
  unavailable-service smoke.

## Unavailable-service probe smoke (2026-11-26)

- Owner-provided NAS screenshot from the separate `Orchestra Service Probe`
  panel shows: “The team status could not be verified. The Orchestra service is
  unavailable or unauthorized.”
- The same screenshot shows the audit-history unavailable fallback and no
  token, local path, or stack trace. No team was created for this check.
- The test service passed `/health` and returned HTTP 503 for application
  requests. This verifies the panel's HTTP 503 handling only, not a denied
  service grant or a service process that fails to start. Host versions were
  not reconfirmed.
