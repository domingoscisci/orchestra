# 0002: Require out-of-band panel approval for sensitive operations

Status: Superseded by [ADR 0003](0003-native-permission-and-audit.md)
Date: 2026-11-24
Decision owners: Domingo Scisci
Supersedes: Read-only bridge constraint in planning/0004
Superseded by:
[0003: Native permission gate and panel audit](0003-native-permission-and-audit.md)

## Context

The plugin currently accepts `approved: true` from model-generated tool
arguments. A direct tool call can activate a team without a panel interaction.
The panel's prompt-to-chat flow loses approval provenance, and the plugin does
not verify that the applied configuration is the one shown to the user.

The project already has an OpenChamber panel, a host-managed extension service,
and a plugin-owned loopback API. The installed OpenChamber SDK 2.7.2 documents
`host.serviceRequest` as a host-authenticated request to that extension's
service. Both current HTTP relays expose GET routes only.

## Decision drivers

- Model text and tool arguments must not be treated as user approval.
- Approval must be outside model context and bound to what the user reviewed.
- Sensitive operations must fail closed when the bridge is unavailable.
- Keep normal assignment and child-agent workflows usable without approving
  every routine state update.
- Use controls proportionate to the risk without making routine app use
  impractical.

## Options considered

### Keep the prompt-to-tool boolean

#### Advantages

- No new transport or UI work.

#### Disadvantages

- The model can supply the boolean; a direct tool call bypasses the panel.
- The value does not bind approval to the exact applied payload.

### Use the existing panel-service-plugin bridge

#### Advantages

- The panel can send approval through `host.serviceRequest`, outside model
  context.
- A plugin-side one-time record can bind operation, session, project, payload,
  and expiry before a tool performs side effects.
- Reuses the existing extension service and loopback relay.

#### Disadvantages

- Requires narrow POST routes and panel UI work.
- Requires the panel to be open and its service capability granted.
- Does not protect against a malicious process running as the same OS user and
  reading local process credentials or the plugin discovery token.
- POST forwarding and route behavior still require runtime validation.

### Reuse host permission answers or build a service surface

#### Advantages

- Could provide stronger host-mediated user interaction.

#### Disadvantages

- `sessionAnswers` is documented for answering permission requests and forms;
  its semantics for Orchestra actions are unverified and may be a mismatch.
- `service.surface` would add a larger, disproportionate UI/transport design.

## Decision

Use a three-phase ticket flow over the panel → host-managed service → plugin
loopback bridge for `activate_team`, `complete_team`, and `delete_agent`:

1. The tool creates or retrieves a pending ticket from the actual validated
   tool payload and returns `approval_required` without performing the requested
   operation.
2. The panel lists pending tickets for the current session, presents the
   operation summary, and sends the user's approve/deny decision through the
   authenticated service bridge.
3. The model may invoke the tool again with the ticket ID. The plugin checks
   operation, session, project, team/target scope, expiry, and a digest of the
   actual payload; it consumes the ticket before performing side effects.

The panel does not calculate or supply the payload digest. The model-supplied
`approved` or `confirmed` fields are not authoritative.

Keep `create_agent` model-callable as a routine operation within its existing
caller-session scope. Continue enforcing team membership and state invariants
for ordinary assignment/report updates.

## Rationale

Independent read-only reviews found no other proportionate communication
channel in the current architecture. OpenChamber documents the service request
API and per-extension host grant. The current implementation does not yet
include the needed POST routes; this decision does not claim the route works
until it is exercised in the supported host.

The ticket bridge is a user-confirmation and audit layer, not an authorization
boundary against code running as the same OS user. An agent with shell/file
tools can read local credentials and call local APIs. The owner accepts this
same-user limitation as a trade-off in favor of usable controls: protect the
ordinary sensitive-tool path with OpenCode's native
`ctx.permission.assert` prompt, and retain the panel ticket flow for clear
payload review and an audit trail. This is a proportionate safeguard, not a
defense against a shell-capable agent deliberately bypassing the prompt.
Runtime verification is still required: the earlier probe did not establish
that a custom Orchestra action prompts, and forcing `ask` through a plugin
permission-evaluation hook remains unverified.

## Consequences

### Positive

- Direct model tool calls without a matching panel approval fail closed.
- The native host prompt is intended to gate the ordinary sensitive-tool path;
  this behavior is not yet runtime-verified for custom Orchestra actions.
- Neither the prompt nor ticket bridge prevents deliberate same-user shell/API
  bypass.
- A changed roster or target cannot use an approval for different content.
- Expired or replayed approval cannot authorize a second operation.

### Negative

- Sensitive operations require the panel to be open and the extension service
  capability to be available.
- Pure chat activation/closure/deletion is no longer supported.
- Same-user processes remain inside the trust boundary.
- Under the current tool permissions, a model may itself be such a same-user
  process. This is accepted as trusted execution in the threat model; the
  controls target ordinary model tool calls, not hostile same-user code.

### Follow-up actions

- Add and test the narrow POST relay routes.
- Add panel approval flows for activation, team closure, and child-session
  deletion.
- For child deletion, show the resolved target and its descendants before
  approval; the host's cascade behavior must be disclosed.
- Verify exact session/project/payload binding, expiry, replay rejection,
  service failure behavior, and no-side-effect rejection.
- Obtain independent security review before closing M3.
- Verify in the supported host that `ctx.permission.assert` prompts and rejects
  for each sensitive custom action under the intended permission rules.

## References

- [Public release plan](../planning/0005-approved-public-release-v0.0.1.md)
- OpenChamber SDK 2.7.2 `GUEST_SERVICES.md` and `API.md`
