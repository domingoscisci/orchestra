# 0003: Use native permission prompts with panel audit

Status: Accepted, partially superseded by [ADR 0004](0004-bound-create-agent-role.md)
Date: 2026-11-24
Decision owners: Domingo Scisci
Supersedes: [ADR 0002](0002-out-of-band-panel-approval.md)

## Context

ADR 0002 made panel tickets mandatory for sensitive team operations. Follow-up
reviews found that the ticket flow adds state and failure modes, while the
owner's accepted threat model treats same-user shell/API access as trusted.
The product needs a proportionate control for ordinary model tool calls, not
an OS security boundary.

The installed OpenCode plugin API exposes `ctx.permission.assert` and an
`evaluate` hook. A prior isolated probe found that an unmatched custom action
resolved without prompting. The hook's ability to force an `ask` for a custom
action has not yet been verified in the supported runtime.

## Decision

- Gate `activate_team`, `complete_team`, and `delete_agent` with the native
  OpenCode permission prompt. The original `create_agent` scope decision is
  superseded by [ADR 0004](0004-bound-create-agent-role.md).
- Register a permission-evaluation hook for only those Orchestra actions and
  set their effect to `ask`, unless the host has an explicit `deny`.
- Call `ctx.permission.assert` after validating inputs and resolving targets,
  but before side effects and outside serialized mutation queues.
- Use separate action names per operation. Put bounded, readable operation
  details in `resources`; omit `save` so the plugin does not request persistent
  permission. The host may still offer an `always` choice.
- Keep the panel non-authoritative and read-only for these operations. It shows
  the audit timeline, not a pre-action review card; bounded operation resources
  are passed to the native permission prompt. Do not require a second panel
  approval.
- Store bounded audit records in `ctx.storage`, not a per-setup in-memory map.
  Expose them through a session-scoped read-only service route.
- Propagate permission denial. Record the denial before returning the error;
  no side effect may occur on denial. If the permission API or hook is
  unavailable, fail closed for the three sensitive operations.
- Re-resolve `delete_agent`'s target after the permission prompt, because the
  session may change while the prompt is open.

## Rationale

The native prompt is the host-supported consent mechanism for ordinary tool
calls. A single prompt avoids requiring both a panel click and a host prompt.
The panel remains useful for post-operation audit and inspection, but it is not
a pre-action review surface or the authorization source.

## Consequences

### Positive

- The model cannot authorize these operations by supplying a boolean tool
  argument.
- Sensitive operations do not depend on the panel being open.
- A bounded audit trail can be read after an operation from the panel.
- Routine operations remain usable without extra confirmations.

### Negative and accepted limits

- This is not protection against code running as the same OS user, which may
  edit configuration or call local APIs.
- The host controls permission prompt rendering and may allow a persistent
  `always` choice. The evaluation hook deliberately rewrites every non-`deny`
  effect to `ask`, so a saved `always` allow is overridden for these actions.
- Audit records are local and not tamper-evident.
- Audit entries record the authorization decision, not whether the subsequent
  operation completed successfully.
- The panel has no pre-action review surface. `complete_team` and `delete_agent`
  details are available in the audit after the prompt, not as a rich panel card.
- The audit route uses the local service bearer token and a host-resolved
  session root. It is not a boundary against the same OS user.

## Validation required before closing M3

- In an isolated supported host, verify the hook changes each custom action
  to `ask` and the native prompt appears.
- Verify `reject` produces no session, storage, file, or prompt side effects.
- Verify an explicit `deny` remains final and does not get overridden.
- Verify missing permission support fails closed.
- Verify audit writes are bounded, session-scoped, and visible through the
  service and panel after both allow and deny.
- Independently review the implementation and generated bundles.

## References

- [ADR 0002, superseded](0002-out-of-band-panel-approval.md)
- [Public release plan](../planning/0005-approved-public-release-v0.0.1.md)
