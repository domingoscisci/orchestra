# 0001: Do not integrate OpenChamber Workflows into Orchestra

Status: Accepted  
Date: 2026-11-19  
Decision owners: Orchestra maintainers  
Supersedes: none  
Superseded by: none

## Context

Orchestra uses a fixed team roster, explicit task assignment, acknowledgment,
and completion or block reporting. OpenChamber Workflows provides a separate
fan-out execution model with its own agents, approval, and run lifecycle.

Review of the available tool contract and runtime behavior showed that the
native workflow lifecycle does not provide the control and integration points
needed for Orchestra's relevant use cases. Connecting the two reliably would
require Orchestra to reproduce substantial workflow logic or depend on
interfaces that are not part of the verified plugin contract.

## Decision drivers

- Preserve Orchestra's fixed roster, assignment authorization, and
  acknowledgment/report lifecycle.
- Avoid duplicating workflow scheduling, persistence, approval, and recovery.
- Avoid reliance on undocumented or unavailable plugin-to-tool interfaces.
- Keep OpenChamber-owned execution state authoritative.

## Options considered

### Integrate the native workflow lifecycle

#### Advantages

- Could reuse OpenChamber's fan-out execution for independent work.
- Avoids implementing a separate parallel-agent scheduler.

#### Disadvantages

- Workflow agents are not Orchestra roster members and cannot fulfill its
  assignment lifecycle.
- The verified plugin contract does not provide the reliable dispatch,
  association, and lifecycle hooks Orchestra needs.
- Tracking state across separate persistence and reporting systems would add
  complexity without providing the required control.

### Reimplement or wrap workflow behavior in Orchestra

#### Advantages

- Could provide tighter integration with Orchestra's team state and rules.

#### Disadvantages

- Would duplicate OpenChamber's workflow scheduling, run persistence, approval,
  and recovery logic.
- A wrapper around an unsupported interface would be fragile and would not
  establish a supported contract.

### Do not integrate Workflows

#### Advantages

- Preserves Orchestra's existing team and assignment model.
- Avoids duplicating workflow infrastructure or relying on unverified APIs.

#### Disadvantages

- Orchestra does not gain native workflow fan-out for auxiliary work.
- Users must use Orchestra's existing delegation paths for supported work.

## Decision

Orchestra will not integrate or reimplement OpenChamber Workflows for its
current use cases. A user may use the native workflow tool independently, but
its agents and results are not part of Orchestra's team or assignment lifecycle.

## Rationale

The native tool's execution model does not expose the supported integration
surface Orchestra would need. Recreating that surface inside Orchestra would
mean copying the workflow system's logic, undermining the reason to integrate
with the native feature.

The investigation verified `workflow.check` and `workflow.list` in the active
OpenChamber session. It did not run a workflow, so run approval, status/result,
report delivery, stop/resume, and persistence behavior were not live-verified.
These findings describe the inspected contract and runtime at the time of the
investigation; they are not a guarantee about future OpenChamber versions.

## Consequences

### Positive

- Orchestra's fixed roster and assignment invariants remain its only supported
  team execution model.
- No workflow state or run store needs to be mirrored in Orchestra.
- Future changes can reassess integration if OpenChamber provides a supported
  API that meets Orchestra's requirements.

### Negative

- Native workflow fan-out is not available as an Orchestra-managed capability.
- Workflow submissions and reports must not be treated as Orchestra task
  assignments, acknowledgments, or completion reports.

### Follow-up actions

- Revisit this decision only if OpenChamber exposes a stable, supported
  integration contract for dispatch, team association, and lifecycle reporting.
- Verify the relevant contract and runtime behavior again before proposing a
  future integration.

## References

- OpenChamber [Workflows guide](https://github.com/openchamber/openchamber/blob/main/packages/docs/content/docs/workflows.mdx)
- OpenChamber [workflow runtime documentation](https://github.com/openchamber/openchamber/blob/main/packages/web/server/lib/workflows/DOCUMENTATION.md)
- OpenChamber [workflow actions](https://github.com/openchamber/openchamber/blob/main/packages/web/server/lib/openchamber-control/actions.ts)
- OpenChamber [managed tool declarations](https://github.com/openchamber/openchamber/blob/main/packages/web/server/lib/agent-tool/runtime.ts)
- Orchestra [team management plan](../planning/0002-approved-team-management.md)
