# 0004: Bound child-agent creation to the caller's role

Status: Accepted
Date: 2026-11-25
Decision owners: Domingo Scisci
Supersedes: the `create_agent` scope clause in
[ADR 0003](0003-native-permission-and-audit.md)

## Context

`orchestra.create_agent` accepted a caller-supplied agent role and session ID,
and defaulted the role to `build`. A restricted agent could therefore create
and prompt a child with broader shell and file-write capabilities, bypassing
the protection gained by removing the free-standing `switch_agent` tool.

The host and project do not define a reliable ordering of agent privilege
levels. Checking that a role exists does not prove that it is no more
privileged than the caller.

## Decision

- A child created by `create_agent` inherits exactly the calling session's
  `agent` identity.
- Do not accept a caller-supplied child role or session ID.
- If the calling session has no agent identity, fail closed; never fall back to
  `build`.
- Preserve the caller as the child's parent and retain the existing active-team
  restriction; active teams use `assign_task`.
- Keep the optional caller-selected model override. It does not change the
  child's agent/tool role.
- If the initial child prompt fails, attempt to remove the child. If cleanup
  also fails, preserve the prompt error and report cleanup as incomplete
  without exposing the child session ID.

## Rationale

Matching the child role to the caller prevents this tool from creating a child
with a different configured permission set. A host permission prompt would add
approval friction without structurally constraining the requested role. A
static role allowlist would require an owner-maintained privilege taxonomy
that the host does not provide.

## Consequences

- Agents cannot delegate to a different specialized role through this tool.
- Callers without a host-reported agent identity cannot use `create_agent`.
- The caller may choose a different provider/model for the child. This can
  change cost, capability, and where the prompt is processed, but not the
  configured tool permissions of the inherited agent role.
- Cleanup is best effort because the host may fail to remove a session; report
  that failure instead of silently implying the child is gone.
- The child inherits the caller's configured role; this does not constrain
  same-user shell/API access or claim to be an OS security boundary.
- Tests must prove same-role inheritance and that alternate roles, explicit
  IDs, and missing caller identity cannot create a child.

## Validation

SD1 reports the implementation and focused tests complete on 2026-11-25;
TL independently ran the full suite (138 passing) and rebuilt all three
bundles twice with identical hashes. CR1's post-build content review passed;
the CI rebuild-and-diff gate remains open. Tests cover role inheritance,
rejected role/ID selection, missing or mismatched caller identity, prompt
failure, and both successful and failed cleanup.

## References

- [ADR 0003: Native permission gate and panel audit](0003-native-permission-and-audit.md)
- [Public release plan](../planning/0005-approved-public-release-v0.0.1.md)
