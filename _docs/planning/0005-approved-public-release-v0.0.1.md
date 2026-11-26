# 0005-approved-public-release-v0.0.1

- Status: In Progress — security, integrated validation, and release gates open
- Owner: Domingo Scisci (Team Lead coordinates)
- Created: 2026-11-23
- Target: N/A
- OpenChamber plan: `1f109ec6-8b29-4a21-b966-58380271ff1b`
- Related plans:
  - [0003-approved-orchestra-openchamber-extension.md](0003-approved-orchestra-openchamber-extension.md)
  - [0004-approved-orchestra-activation-confirmation.md](0004-approved-orchestra-activation-confirmation.md)
- Related issues: none
- Related PRs: none
- Related ADRs:
  - [0003: Native permission gate and panel audit](../adr/0003-native-permission-and-audit.md)
  - [0002: Require out-of-band panel approval for sensitive operations](../adr/0002-out-of-band-panel-approval.md)
  - [0004: Bound child-agent creation to the caller's role](../adr/0004-bound-create-agent-role.md)

## Steps

- [x] Resolve owner decisions in the grill and explicitly approve this plan
      before implementation.
- [ ] Remediate the security blockers and correctness risks on the release
      branch.
- [x] Complete public documentation, licensing, metadata, and first-run
      guidance.
- [ ] Add CI/security workflows and configure the agreed GitHub gates. The
      workflow is present locally but has never run; GitHub checks and branch
      protection remain unconfigured.
- [ ] Complete integrated release validation, including plan 0004's existing
      desktop build/smoke test, regression, adversarial,
      bundle-reproducibility, and independent security checks.
- [ ] Sanitize the source tree, inventory refs, and verify a private backup;
      keep the repository private.
- [ ] Integrate the release candidate into `main` via PR, then rewrite and
      verify all public refs; align version, tag, and release notes while
      private.
- [ ] Make the repository public and verify the published v0.0.1 Git/ZIP
      installation only after the owner's explicit approval.

## Current status update (2026-11-25)

This section supersedes older baseline and blocker statements below wherever
they conflict. Historical evidence is retained with its original dates.

- Public documentation, licensing, metadata, and the local CI workflow are
  present in the working tree. The workflow has never run on GitHub; it is not
  committed, and no PR exists.
- The owner reports M3 native permission prompts for `activate_team`,
  `complete_team`, and `delete_agent` on OpenChamber 2.8.0 / OpenCode 2.3.2.
  Approval, activation denial, and explicit configured `deny` were reported;
  denial produced no active team or project guide files. The owner confirms
  the smoke used a clean/isolated profile and native prompts appeared for all
  three operations. This remains owner-reported evidence, not a captured host
  trace. The panel
  provides a read-only audit timeline, not a pre-action review card; bounded
  operation resources are sent to the native prompt, whose rendered details
  have not been captured.
- SD1 implemented L4 constant-time bearer comparison in `src/index.ts` and
  `service/main.ts`, with rejection tests. SA independently reviewed the L4
  source and tests. CR1 confirmed M3 side-effect ordering and the earlier
  bundles' direct bearer comparisons. SD1 has also implemented the ADR 0004
  `create_agent` policy in source and tests: child
  role inherits the caller, caller-selected role/ID are rejected, and missing
  caller identity fails closed. CR1 confirms the source satisfies ADR 0004,
  and follow-up review verified exact caller-session binding and prompt-failure
  cleanup coverage.
- ACSA's independent rescan closed H1 (`switch_agent`) and H2 in source and
  bundle. The owner-reported NAS smoke is recorded as a functional M3 PASS.
  The owner has since confirmed the clean/isolated profile condition and
  prompts for all three operations. No prompt/host trace was saved, so this is
  still owner-reported evidence, not an independent capture. ACSA's earlier
  rescan lacked this clarification.
  ACSA also found a medium H1
  escalation through `create_agent`: a caller can choose an unvalidated role,
  defaults to `build`, and may supply a child session ID. The owner chose to
  bind child roles to the caller's role, reject creation when that identity is
  missing, and remove caller-selected IDs. ADR 0004 records the decision;
  source implementation is reported complete and CR1 reviewed it against the
  ADR. Before rebuild, the plugin artifact still contained the old
  implementation. CR1's post-build content review now passes for the reviewed
  control-flow surfaces; this is not byte-for-byte proof. ACSA's spot check
  finds H1 tool removal, L4 comparisons, `create_agent` restrictions, and the
  audit marker in the bundles. The CI rebuild-and-diff gate remains open;
  `.github/` is untracked and the workflow has never run.
- The panel-ticket approval flow was intentionally removed under ADR 0003.
  Ticket-specific findings in the historical review log below are superseded;
  current authorization uses native host prompts and a read-only audit view.
- CR1 noted one low UX edge: if a model omits `requestId` from an activation
  tool call, its denied audit record cannot be matched to the panel request, so
  polling may continue to the 10-minute unknown state. The panel's normal
  handoff instructs the model to preserve the ID; this edge is not a security
  finding and has not been hardened.
- ACSA's post-final-build rescan reports PASS for the required code behaviors
  across source and all three bundles, with no new high/medium finding. It
  explicitly distinguishes content spot-checks from byte-for-byte parity:
  only the CI rebuild-and-diff job proves the latter, and it has not run.
  Findings reconciled as current: M3 evidence, untracked release files,
  historical SMOKE-001 artifacts requiring the approved history rewrite, and
  the SDK 2.7.2 versus declared host engine >=2.8.0 mismatch. ACSA also notes
  unreachable legacy TeamSetup UI in the panel; neither item has been changed.
- SA's source review confirms child role inheritance, rejection ordering,
  fail-closed behavior, and prompt-failure cleanup. It notes that the existing
  caller-selected model remains separate from the role-permission boundary.
  The owner chose to keep model selection explicit; this may change cost,
  capability, or provider handling, but does not change the inherited tool role.
- The owner chose to surface a cleanup-incomplete signal if prompt submission
  and child removal both fail. SD1 reports this behavior and focused tests
  complete: successful cleanup preserves the original prompt error; failed
  cleanup is surfaced without the child ID.
- CR1 found a denied activation could leave the panel polling a missing receipt
  while the audit already said denied. FD1 reports a source fix: the panel
  stops polling only when a denied `activate_team` audit record matches the
  current request ID; it does not fabricate an activation receipt. Two
  regression tests were reported. The integrated rebuild now includes this
  panel fix.
- SD1 added tests for denied `complete_team`/`delete_agent` side effects and
  activation receipt retry handling, plus `create_agent` role-inheritance and
  fail-closed, caller-session binding, and prompt-cleanup coverage.
- After the last source edit, TL ran `bun run build:extension` twice; both
  succeeded and SHA-256 hashes were identical:
  `panel/main.js` `5908a292c16e70ab69d3d8e7c41a2fffe86e50f2c842cd3ab24ed067e6854d15`,
  `plugin/index.js` `28cb32b84c2a009ed915b37da51501682e9677c695567c7a4a5f4e79906644ec`,
  `service/main.js` `e324a532bb2a9fd640f77319e2a67fa1e95382d6726dd728f6ff1d91cd5fd112`.
- Content checks after rebuild found `constantTimeEqual` in plugin and service,
  the `create_agent` rejection and missing-identity strings in the plugin, and
  the denied-activation and cleanup-incomplete states in the bundles. No bare
  `headers.authorization !==` comparison or ticket-flow marker remained in the
  generated bundles.
- After this rebuild, TL ran `bun run check:extension` (package ready),
  `bun test` (138 passed, 0 failed, 8 files), and `git diff --check` (pass).
  These local checks do not establish a clean frozen install or GitHub Actions
  run. CR1's post-build content review passed; ACSA's independent content
  checks agree. The generated bundles are uncommitted and the byte-parity CI
  job has never run.
- Before the candidate commit, 19 release-related files were untracked,
  including source, tests, workflow, public docs, and plans. They are now
  included in the PR candidate; ACSA verified none were ignored by
  `.gitignore`.
- Owner-directed SMOKE-001 handling: the three historical files were recovered
  from commit `b808350` into a protected external archive; each archived blob
  hash matches its Git source blob. A complete-history Git bundle was created
  and verified. Because `b808350` is an ancestor of both `main` and
  `feature/openchamber-extension`, an isolated mirror rewrote both target refs
  to remove the three paths. A scan found none of those paths in either
  rewritten history, and the rewritten feature still descends from rewritten
  `main`. A candidate bundle contains only those two refs.
- The owner supplied the GitHub noreply address; all author and committer emails
  in both target histories were rewritten to it and checked. After explicit
  owner approval, the rewritten `main` and feature refs were atomically
  force-pushed to the private repository. PR #1 is open and preserves the
  existing commits. No merge, tag, release, or visibility change has occurred.
- In the rewritten candidate checkout, `bun install --frozen-lockfile`,
  `bun run build:extension`, and `bun run check:extension` succeeded. One full
  test run passed (138 tests). All three rebuilt bundles compared byte-for-byte
  equal to the verified source-checkout bundles. This is local evidence, not
  GitHub CI.
- ASE's final verdict must follow the stable-source rebuild and independent
  review; that review is now complete. ASE records G1 code controls as PASS,
  limited to content verification of source and the 12:36-12:41 artifacts.
  M3 is implemented and fail-closed in code; clean-profile runtime prompt
  behavior is owner-confirmed but has no saved prompt/host trace.
  Byte-for-byte source/bundle parity is unproven because the CI rebuild-and-diff
  job has not run. The release remains blocked on parity and publication
  process, not on a code-control FAIL.
- Plan 0004's badge, permission, child-parent smoke, and Linux path probe are
  owner-reported. The plugin resolves to
  `/home/openchamber/.local/share/orchestra`; the guest-service contract passes
  the same `HOME`, so its resolver selects that path too, although no service
  process was visible in the probe. Timeout/unavailable-service UI remains
  unverified.
- The repository remains private. The pre-rewrite history bundle is verified;
  PR #1 is open. No merge, tag, release, branch protection, or visibility
  change has been performed.

## Objective

Prepare Orchestra for a safe, professionally documented public GitHub release
of v0.0.1. The repository is currently private. The release must not expose
credentials, unintended personal or operational data, or unresolved
privilege-escalation and prompt-injection risks.

The intended distribution is the OpenChamber Git/ZIP extension, not npm. The
owner confirmed that the package and release should both be version 0.0.1.
`package.json` is now 0.0.1; the installed extension still requires the
committed bundles.

## Initial baseline (2026-11-23; superseded by current status above)

- Repository: `domingoscisci/orchestra`, private, default branch `main`.
- `feature/openchamber-extension` is 11 commits ahead of `main`; it contains
  the current extension work. `experiment/plugin-storage` is excluded from the
  public repository, per the grill.
- There are no tags, GitHub Releases, Actions workflows, or branch protection.
- `package.json` says 0.1.0. No root `LICENSE`, `CHANGELOG.md`,
  `CONTRIBUTING.md`, `SECURITY.md`, or `CODE_OF_CONDUCT.md` exists.
- Distribution is Git/ZIP through OpenChamber. No npm publishing is planned.
- `plugin/index.js`, `panel/main.js`, and `service/main.js` are committed and
  required at install time. `bun.lock` pins `@openchamber/sdk` 2.7.2, which
  provides the bundler binary. A clean rebuild and byte-for-byte bundle match
  have not been verified.
- The security audit found no credentials in the inspected working tree or
  refs. It found session IDs, token/cost records, local paths, and author email
  that the grill decided to remove from every published ref.
- ASE's initial security verdict on 2026-11-23 was FAIL:
  - H1: `orchestra.switch_agent` may let a restricted member switch into an
    agent with broader host tools/permissions.
  - H2: repository-controlled team fields can enter `TEAM.md` and agent/chat
    prompts as instructions.
  - M3: write-capable tools did not call `ctx.permission.assert`. This finding
    is superseded: M3 is implemented and fail-closed in code; runtime prompt
    behavior remains owner-reported, not captured. See the current status
    update above for ASE's scoped G1 PASS and evidence limitations.
- Other reported issues include the plugin/service
  `ORCHESTRA_DATA_DIRECTORY` mismatch, unverified caller-supplied session ID
  semantics, weak secret-file ignore coverage, and an unvalidated mobile
  manifest claim.
- Plan 0004 is still In Progress; its existing desktop build/smoke-test step
  remains open. Reuse its existing todo rather than duplicating it.

## Decisions resolved in the grill (2026-11-23)

The owner approved the direction of this plan without authorizing
implementation or any Git/publication operation.

- License: MIT, copyright holder Domingo Scisci.
- History: clean the operational artifacts and rewrite every ref that will be
  published, replacing the commit author email with a noreply address. The
  rewrite happens while the repository is private, from a verified backup.
- Public refs: publish `main` and the `v0.0.1` tag only.
  `experiment/plugin-storage` is excluded from the public repository.
- Integration: bring the release candidate to `main` through a pull request,
  preserving the commits rather than squashing them.
- `switch_agent`: remove the free-standing tool; keep only the internal uses the
  team lifecycle requires, reachable without agent-callable escalation.
- `ctx.permission.assert`: must pass a runtime verification before it is relied
  on, and must precede every write-capable side effect.
- Local team artifacts (`AGENTS.md`, `TEAM.md`, `.team.yml`): ignored, never
  committed with the current roster.
- Agent roles: ship documentation for creating project-local role files; no
  example role set is published in v0.0.1.
- Adversarial coverage: automated wherever the behavior can be asserted; any
  case that requires a live model is recorded as manual evidence.
- Host support: declare only the hosts and version actually smoke-tested.
- CI: add the recommended least-privilege checks before the release candidate.
- Release gate: zero unresolved high/medium findings, evidence per acceptance
  criterion, and fail-closed recovery. Rewrite, merge/push, tag/release, and
  visibility change each require separate explicit approval.

## Items to record before the matching gate

Data collection, not open design questions:

- Effective agent aliases and role identifiers at release time.

### Owner decisions and recorded items (2026-11-24, release session)

- Contacts: `security.regain404@silomails.com` for both security reports and
  the Code of Conduct. `SECURITY.md` and `CODE_OF_CONDUCT.md` are written;
  README and CONTRIBUTING link to them.
- Tested host: OpenChamber 2.8.0 with OpenCode 2.3.2. `engines.openchamber` is
  `>=2.8.0`; README requirements and support scope, and the CHANGELOG known
  limitations, state 2.8.0 or later.
- Full desktop smoke setup: the owner selected a clean temporary OpenChamber
  profile. A disposable local project with minimal `smoke-lead` and
  `smoke-worker` role files is prepared outside the repository; no personal
  project or repository files will be used as the smoke-test target.
- Mobile claim: `contributes.panel.mobile` is removed, so the manifest no
  longer declares the mobile workspace; README and CHANGELOG state that mobile
  is unsupported in 0.0.1. `tests/extension-package.test.ts` asserts the
  absence. The installed SDK schema only accepts the literal `true`, so the key
  is omitted rather than set to `false`.
- SMOKE-001 archive: the owner chose deletion over redaction. `_docs/tests/`
  (three files: the audit, the token/cost CSV, and the benchmark prompt) is
  removed from the working tree; it must also be absent from every published
  ref after the rewrite. The internal `openchamber://session/ses_…` link in
  plan 0004 is replaced with a plain statement.
- Ref inventory (2026-11-24): local and remote `main` 91b5a0a, `feature/
  openchamber-extension` 61a4ac1 (11 commits ahead), `experiment/
  plugin-storage` cff5129 (excluded from publication). No tags, no stashes, no
  other remote refs. Local `refs/agents/*` checkpoint refs stay local and are
  never pushed.
- `package.json` metadata completed: `author`, `homepage`, `bugs`.
- `.gitignore` extended with `.npmrc`, `.netrc`, private-key and certificate
  extensions, and `*.log`.
- Local verification after these edits: `bun test` 123 passed, 0 failed, twice;
  `bun run check:extension` passes.
- Still open: CI has never run; no pre-integration backup exists; M3 evidence
  and desktop smoke results remain to be recorded in plan 0004.

### M3 implementation status (2026-11-24; historical)

The host-probe conclusions and open items in this dated record are superseded
where they conflict with the 2026-11-25 status update above and the reported
desktop smoke below. Keep this record as history, not as the current verdict.

- Implemented the native permission hook and `permission.assert` gates for
  `activate_team`, `complete_team`, and `delete_agent`. The hook preserves an
  explicit host `deny`; missing permission support fails closed.
- Re-resolves the child target and descendant set after the delete prompt.
- Serializes the post-prompt activation receipt recheck and pending write,
  preventing concurrent retries from replacing an activated receipt. Root and
  membership checks still precede receipt-based returns.
- Replaced panel approval tickets and POST decision routes with operation
  details and a read-only, session-root-scoped audit history capped at 100
  records in shared plugin storage; rejects audit details beyond the panel's
  bounds.
- Validates the persisted original agent against the current visible primary
  agents before restoring it.
- Bounds `complete_team` and `delete_agent` permission resources to the same
  audit limits; a duplicate activation that resumes after the pending TTL now
  preserves an activated receipt or an existing active team.
- ADR 0003 records that audit entries describe authorization decisions, not
  operation outcomes.
- Local validation: `bun test` passed (123 tests); the extension build and
  package check must be rerun after the final source edits.
- Host smoke attempt (2026-11-24): calls ran in temporary directories and
  sessions, but used the existing desktop profile, so saved permissions and
  host configuration were not isolated. Activation succeeded after the owner
  accepted; completion succeeded after acceptance; a deletion test child was
  created and deleted after acceptance. A later activation returned `Tool.Error`
  after the owner rejected and left its directory empty. The session agents
  reported that no native prompt appeared, while the owner reported accepting
  and rejecting decisions. No prompt capture or host trace resolves this
  discrepancy. Do not count these runs as proof that the hook forces `ask`.
- M3 remains open: repeat the smoke in a clean supported-host profile, verify
  the native prompt visually for all three actions, and test explicit `deny`
  without side effects. Record the exact host version. CR1's independent review
  covered the pre-follow-up code; source and bundles still need follow-up review.
- The OpenChamber version actually smoke-tested, and the resulting minimum for
  `engines.openchamber` and the `mobile` manifest claim.
- The GitHub checks and protections available on the target repository.
- The complete ref inventory covered by the rewrite.
- The private security-reporting and Code-of-Conduct contacts, which the grill
  did not settle. They block SECURITY.md and CODE_OF_CONDUCT.md content but not
  remediation work.

No license, contact, history rewrite, force-push, merge, tag, release, or
visibility change was approved by this plan on its own.

## Proposed domains and agent ownership

| Workstream | Accountable agents | File/decision boundary |
|---|---|---|
| Scope, decisions, and approval gates | TL; PM (Design) | PM maintains user-facing scope and acceptance criteria; TL integrates and obtains owner decisions. |
| Plugin authorization and prompt boundary | SA coordinates; SD1 implements; ASE sets security criteria; CR1 reviews | TL assigns task directly. SD1 owns only plugin implementation files named in the task; confirm exact paths at dispatch. |
| Panel activation and input handling | FD1 implements; CR2 reviews | TL assigns task directly. FD1 owns panel implementation and its tests. |
| Service and runtime configuration | SD2 implements; SA advises; TRA analyzes evidence | TL assigns task directly. SD2 owns service implementation and focused tests. |
| Adversarial test design | PE drafts cases; ASE owns security criteria; WA checks workflow coverage; TRA analyzes results; ACSA independently rescans | TL assigns each task directly; QA lead ASE coordinates its domain. |
| User docs and first-run | TW writes; PM reviews | TL assigns task directly. TW owns public docs and runbook; role-file guidance is documentation only. |
| GitHub automation and history hygiene | GWM implements; ASE and CR2 review | TL assigns task directly. GWM owns `.github/` and the Git/release procedure. |
| Final release gate | ASE, ACSA, TRA, GWM; TL consolidates | Gate evidence must be independent of implementation authors; owner retains destructive and visibility approvals. |

UD, DE, and FD2 are not assigned because no release workstream requires design
work, data-pipeline work, or published example role files. They can be added
only if scope expands. Per `TEAM.md`, the Team Lead assigns work directly with
`assign_task`; no agent starts work based on this ownership map alone. Each
assignment must define input, output, owned files, exclusions, validation, and
failure behavior. Track acknowledgment, status, blockers, and the single final
report through the team task tools. Do not treat dispatch or acknowledgment as
evidence that work passed review.

## Scope

### In scope

- Fix H1, H2, and M3 with code-enforced controls; prompts and model-supplied
  booleans are not authorization.
- Validate team/member fields at panel and plugin trust boundaries; treat
  repository-controlled configuration as untrusted data, never as authority or
  executable instructions. Test hostile and legitimate values to avoid
  instruction-pattern heuristics as the security boundary.
- Verify `ctx.permission.assert` runtime behavior before relying on it; if it
  does not enforce as declared, stop and redesign.
- Resolve the plugin/service data-directory mismatch and determine the
  caller-supplied session ID behavior, with tests or an explicit owner-approved
  risk disposition.
- Close plan 0004's desktop build/smoke-test step on the release candidate.
- Add focused regression coverage and at least 20 adversarial prompt-injection
  cases, with a recorded baseline and independent regression check.
- Rebuild all committed bundles from a clean frozen Bun install and compare the
  outputs; do not add a second bundler dependency unless this check proves the
  lockfile insufficient.
- Review all public-facing files and all refs to be exposed. Remove or redact
  approved internal data; update `.gitignore` for secret files and local
  activation artifacts.
- Add accurate Git/ZIP installation, first-run, update, uninstall, permissions,
  data-retention, and support-scope documentation.
- Add a release runbook for pre-publication checks, approved history rewrite,
  tag/release, visibility change, verification, and recovery.
- Add owner-approved LICENSE, CHANGELOG, CONTRIBUTING, SECURITY,
  CODE_OF_CONDUCT, and relevant package metadata.
- Correct the README's model/runbook links, internal session URL, obsolete
  claims, and the mobile/support claims without erasing accepted history.
- Add minimum GitHub CI/security workflows with least-privilege permissions and
  required checks. Keep release and visibility changes human-controlled.
- Align package version, tag, branch, and release notes on v0.0.1.

### Out of scope

- npm publishing, marketplace distribution, docs-site generation, API-reference
  generation, translations, or broad redesign.
- Automatic force-pushes, automatic public-visibility changes, or unattended
  release publication.
- Adding support for web, mobile, VS Code, or direct OpenCode hosts unless
  separately tested and approved.
- Unrelated refactors, or treating role prompts as authorization.

## Implementation phases and parallelism

### Phase 0: Grill and owner decisions

- Completed: the grill approved the direction and the decisions are recorded
  above.
- Implementation starts only when the Team Lead dispatches work under this
  plan; approving the plan is not approval of any Git or publication operation.

### Phase 1: Parallel work on disjoint surfaces

Run these independent workstreams in parallel:

- **Plugin core — SD1, SA coordination:** remove the free-standing
  `switch_agent` tool and keep only the internal switch the team lifecycle
  needs; add host permission assertions before every write-capable side effect;
  validate/safely encode roster fields in generated `TEAM.md` and bootstrap
  prompts.
- **Panel — FD1:** stop sending the full repository-controlled `.team.yml`
  config as an unreviewed chat prompt; preserve explicit activation intent and
  validate the structured handoff.
- **Service/config — SD2:** make plugin/service data-directory resolution
  consistent, test the configured path, and verify caller-supplied session ID
  semantics.
- **Docs and first-run — TW with PM review:** produce public-facing docs and
  the role-file creation guidance; write the release runbook with GWM.
- **GitHub automation — GWM, with ASE/CR2 review:** add CI for frozen Bun
  install, `bun test`, `bun run build:extension`, package check, and a
  `git diff --exit-code` gate for all three committed bundles. Add the agreed
  CodeQL/dependency/secret checks with minimal token permissions. Do not use
  privileged `pull_request_target` patterns or expose secrets to untrusted PRs.
- **Adversarial test contract — PE/WA:** define at least 20 test inputs
  covering member names/acronyms, domains, activity titles, saved YAML, and
  hostile instructions; specify expected rejection or safe-data behavior.

File ownership is exclusive during parallel edits. In particular, one owner
controls `package.json`, one controls `.github/`, one controls public docs, and
one controls each source area. The build script regenerates all bundles
together: do not run overlapping builds or let parallel branches write the
same generated artifacts. Rebuild once after source integration, then review
the generated diff.

### Phase 2: Integrated regression and desktop validation

- Run focused tests for each fixed trust/authorization boundary and all failure
  paths.
- The regression tests must fail against the pre-fix implementation; tests that
  pass on old code do not close a finding.
- Run the full `bun test` suite, the package checker, frozen clean build, and
  bundle-diff gate.
- Complete plan 0004's existing OpenChamber desktop smoke test on the
  integrated release candidate. Record host version, install/update path,
  service permission grant/denial behavior, activation result, badge restoration
  after panel reopen, and data-directory path.
- TRA analyzes results; CR1/CR2 review separate code surfaces; ASE owns the
  security verdict and ACSA performs the independent rescan.
- Any unresolved high/medium finding, failing check, unexplained bundle diff,
  or failed supported-host smoke test blocks release.

### Phase 3: Public-surface preparation (private repository only)

- Inventory all local and remote refs, tags, and GitHub-held refs. Record the
  intended public set (`main` and `v0.0.1`) and explicitly exclude
  `experiment/plugin-storage`.
- Remove the SMOKE-001 session IDs, token/cost records, absolute paths, the
  internal session URL, image metadata, and the commit author email, per the
  grill.
- Keep accepted decisions as history, but remove private identifiers and mark
  superseded proposals clearly.
- Add ignore coverage for `.env`, `.env.*`, key/certificate files, `.npmrc`,
  `.netrc`, logs, and local team artifacts, and keep `AGENTS.md`, `TEAM.md`,
  and `.team.yml` ignored.
- Create and verify an access-controlled pre-integration backup outside the
  working tree. Do not rewrite history yet; first integrate the approved PR
  while the repository is private.
- If any sensitive data remains in the current source tree, stop before
  integration and remove it from the affected files.

### Phase 4: Release branch, CI gates, and private tag

- Ensure the extension work is integrated; do not release the current stale
  `main`.
- Bring the reviewed release candidate to `main` through a pull request that
  preserves the commits; do not squash.
- After the PR is merged, make a fresh inventory of all refs. Create and verify
  a new backup of the merged state, freeze pushes, then rewrite every ref
  intended for public exposure so the reviewed `main` history contains no
  excluded operational data and uses the approved noreply author email.
  Preserve the approved commit sequence; expect rewritten commit IDs.
- Exclude `experiment/plugin-storage` from the public repository. Verify that
  only `main` and the eventual `v0.0.1` tag are exposed; do not publish other
  branches or tags.
- Configure branch protection after history cleanup; require the agreed CI
  checks, block force-push/deletion, and account for the single-maintainer
  review limitation.
- Re-run required checks against the rewritten `main`. If rewriting invalidates
  the PR or branch-protection evidence, obtain fresh review/check evidence
  before proceeding.
- Align `package.json` to 0.0.1; create annotated tag `v0.0.1` on
  the exact green `main` SHA and draft human-reviewed release notes.
- Create the tag and GitHub Release while the repository is still private.
  Verify the tag points to the sanitized, checked `main` SHA and scan the tag
  and every intended public ref again before the visibility gate.
- Every history rewrite/force-push, merge/push, tag/release, and visibility
  operation requires its own explicit owner approval.

### Phase 5: Public visibility and post-release verification

- ASE records PASS only after H1/H2/M3 are fixed, the ACSA rescan is clean, and
  privacy/history gates pass.
- TRA records passing tests/build/smoke evidence; GWM verifies branch, tag,
  required checks, and release contents.
- TL presents the final go/no-go checklist. The owner explicitly approves the
  visibility change; silence is not approval.
- Make the repository public last. Then verify an anonymous public clone/ZIP at
  tag `v0.0.1`, installation without an accidental npm path, and the documented
  first-run/update flow.
- If any public issue exposes data, assume copies/forks/caches cannot be
  recalled; contain the issue and rotate credentials only if a credential is
  later found.

## Acceptance criteria

- Owner-approved plan with the MIT license and copyright holder recorded;
  security and conduct contacts supplied before their files are published.
- Plan 0004's desktop smoke step completed with the tested OpenChamber version
  and supported-host scope recorded.
- H1, H2, and M3 resolved by enforcement at the code/host boundary, with
  regression tests and independent review.
- At least 20 adversarial prompt-injection cases pass; untrusted repository
  content is never treated as agent instruction.
- A clean Git/ZIP installation follows the README without an undocumented
  build step; activation is correlated to the initiating panel request, and
  reopening the panel restores the badge only for the active session.
- If service permission is denied, chat activation remains usable and the panel
  reports that confirmation is unavailable without exposing a stack trace,
  token, or local path.
- `ORCHESTRA_DATA_DIRECTORY` works consistently across plugin and service;
  caller-supplied session ID semantics are tested or have an explicit accepted
  risk disposition.
- Full `bun test`, package check, clean frozen build, and bundle-diff CI pass.
- ACSA's independent rescan and ASE's final security gate pass; no unresolved
  high/medium security finding remains.
- README accurately covers install, prerequisites, permissions, data
  retention, update/uninstall, first successful team flow, and supported hosts.
- A release runbook gives ordered prechecks, approvals, verification, abort,
  and recovery steps for history cleanup and public release.
- LICENSE, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG, and approved
  package metadata are complete; all public links resolve.
- No unintended secret, session ID, cost data, local path, or generated local
  roster is reachable from any ref intended for publication, unless the owner
  explicitly declassifies a named item in writing.
- The release SHA is on `main`; CI is green; package version, tag, and release
  notes consistently say v0.0.1.
- The owner separately approved history rewrite/force-push, merge/tag/release,
  and public visibility changes.

Evidence must be recorded per criterion as:

`AC ID | command/test | result | producer | date`

Numbers without a command or test name are not validation evidence.

## Security exit gate

The current release verdict is BLOCKED pending final ASE signoff, the CI
rebuild-and-diff run, and remaining desktop timeout/unavailable-service checks.
The owner-reported NAS M3 smoke is recorded as a functional PASS; its missing
independent capture remains an evidence caveat. Code controls (G1), publication
surface (G2), and provenance/rescan (G3) are separate gates. G2 is irreversible
and must be resolved before the repository becomes public. No evidence may
reproduce a secret value.

### G1: Code controls

- **H1 — `switch_agent`:** remove the free-standing tool; keep only the
  internal switch the team lifecycle needs, not callable as an escalation path.
  Also reject `activate_team` from child/member sessions before any receipt or
  other side effect. Bind `create_agent` children to the caller's agent identity;
  do not accept caller-selected child roles or session IDs, and fail closed if
  the caller identity is missing (ADR 0004). Test that no member can select a
  broader tool/permission set; log the remaining internal switch.
- **H2 — stored prompt injection:** validate member names/acronyms at every
  trust boundary; handle fields as data, not instructions; ensure panel
  activation does not send repository-controlled YAML as a user prompt. Test
  hostile inputs (newlines, markdown headings, backticks, and injected
  instructions) and legitimate values with those characters. Security must
  come from data/instruction separation and validation, not keyword heuristics.
- **M3 — host permission gate:** verify `ctx.permission.assert` runtime
  semantics first. Inventory every write-capable tool and side effect, then
  table-test that each asserts permission before mutation. A denied assertion
  must produce no session creation, prompt, or project-file change. If the host
  API cannot enforce the gate, stop and redesign.
- **L4 — token comparison:** use a constant-time comparison for bearer tokens
  and retain invalid-token rejection tests.
- Tests for every finding must fail against the pre-fix implementation. A test
  that passes on the old code does not close the finding.

#### Current implementation evidence and blockers

- SD1 reports H1 and plugin-side H2 changes with focused regression tests.
  SD1 added a child-session guard and now reports atomic receipt
  lookup/pending-write, protection against overwriting activated receipts,
  approval denial before receipt mutation, and a reachable membership check
  with targeted tests. CR1 independently verified the source ordering,
  idempotency behavior, denial effects, and regression coverage. H1 remains
  open until bundle validation passes.
- SA's read-only review reports the revised membership/root-check ordering
  has no bypass and preserves the in-lock recheck. A deliberate trade-off is
  that `approved:false` and already-active rejections occur before receipt
  creation, so those request IDs have no failed receipt; this avoids allowing
  rejected callers to grow the receipt store. The panel currently always sends
  `approved:true`. CR1 independently verified the behavior. A duplicate
  in-flight request receives `pending`, not the eventual `activated` receipt.
  A failed receipt for a root with an already-active team may remain stale;
  both are UX/state follow-ups, not security blockers.
- `Session.Info.parentID` is schema-optional, not a documented guarantee.
  ASE reports empirical evidence from this run: several child sessions
  created with explicit parents successfully called `acknowledge_task` and
  `report_task`; their `findTeamContext` path requires `session.get` to return
  the parent link. This closes the current-host evidence gate, but does not
  establish a cross-host contract or cover child sessions created by other
  means. The runtime plugin build used for these calls is not established as
  identical to the committed bundle. Record the OpenCode version and this
  observation in the plan 0004 smoke log when available; re-check when
  supporting another host/version.
  Root-only activation means a panel opened on a child session cannot activate
  a team; document this behavior or prevent the action in the panel.
- SA's read-only review found no agent-callable path to mutate persisted
  `originalAgent` or `member.role`; normal writers derive them from host session
  state or validated agent IDs. This is low-severity persisted-state hardening,
  not a demonstrated exploit. A corrupted `originalAgent` could still make
  `complete_team` fail before state removal. SD1 reports that
  `validateTeamDocument` now rejects unsafe control/separator characters in
  both fields and that each new test fails when its corresponding check is
  removed. SA independently verified the placement, semantics, and coverage;
  no false positive is expected for legitimate host IDs. Close this finding
  at source. This does not independently block release, but the rebuilt
  artifact must include the validation.
- Plugin and panel H2 changes are present in source, but not in their committed
  bundles. The panel still sends a structured activation prompt; do not claim
  the prompt-injection boundary is complete until independent review validates
  its data/instruction separation and adversarial coverage.
- Follow-up review found that repository-controlled role descriptions were
  copied into generated `TEAM.md` instructions. The generator now omits those
  descriptions; a regression fixture uses an instruction-shaped description
  and asserts that it does not enter `TEAM.md`. `bun test` passes (123 tests)
  and `git diff --check` passes after this fix. Independent security review,
  the 20-case adversarial suite, and rebuilt-bundle evidence remain open.
- Independent code review confirmed the source fix but found that the committed
  `plugin/index.js` still contains the old renderer. It also recommended
  explicitly framing generated labels as data and avoiding a misleading
  description fallback when the session title is blank. The source now adds
  that framing and uses `Current activity` for a blank title; regression tests
  cover both. `bun test` passes (124 tests) and `git diff --check` passes.
  After explicit owner authorization, `bun run build:extension` completed and
  `bun run check:extension` reports the package ready to add. The rebuilt
  plugin bundle contains the new data framing and no longer contains the old
  role-description renderer. At that point, independent post-build security
  review, a clean frozen build/reproducibility check, the 20-case adversarial
  suite, and CI remained open; the following review entry records the post-build
  security verdict.
- Post-build independent review: CR1 verified that the extension loads the
  rebuilt plugin artifact, the generated `TEAM.md` no longer receives role
  descriptions, the data/instruction preamble is bundled, and CI checks bundle
  freshness. ASE's recheck records H2 as CLOSED for the `TEAM.md` path. It noted
  two low-severity unquoted member labels in `send_message` and `report_task`;
  these carry no control characters, cross no privilege boundary, and do not
  reopen H2. At the time of that review, adversarial coverage and clean
  build/reproducibility evidence were still pending; the following entries
  record their completion.
- Adversarial handoff coverage now includes 25 table-driven hostile values
  across member names/roles, the Lead role, team IDs, request IDs, and domain
  fields, plus a hostile value round-tripped through saved YAML. The existing
  one-line instruction-shaped-label test verifies data framing. `bun test`
  passes (126 tests).
- Clean-copy verification from the current source tree: `bun install
  --frozen-lockfile`, `bun test` (126 pass), `bun run build:extension`, and
  `bun run check:extension` pass. SHA-256 hashes of `panel/main.js`,
  `plugin/index.js`, and `service/main.js` matched before and after the clean
  build. `bun audit` reports no vulnerabilities. GitHub Actions itself remains
  unrun; the user-reported desktop smoke result is recorded below.
- During desktop smoke testing, activation failed before sending its prompt
  because the embedded panel runtime lacks `crypto.randomUUID`. The panel now
  falls back to a UUID v4 generated with `crypto.getRandomValues`; no
  non-cryptographic fallback is used. Regression coverage passes, all three
  bundles were rebuilt, and `bun run check:extension` passes. Full suite:
  127 tests passing. The user subsequently confirmed activation works.
- Desktop smoke completed (user-reported, 2026-11-25) on OpenChamber 2.8.0 and
  OpenCode 2.3.2: install and panel open passed; service permission approval
  and denial passed; activation badge restored after reopening and remained
  session-scoped; child `parentID` was verified against its Lead session.
  Timeout/unavailable-service UI and the exact final shared data path were not
  reported as tested. GitHub Actions remains unrun.
- ASE verified that `ctx.permission.assert` is typed and delegates to a host
  implementation that is absent from the installed package. The default for
  unmatched action/resource pairs is unknown; custom `orchestra.*` actions
  therefore cannot yet be treated as an effective permission gate.
- The M3 probe on OpenCode v2.2.6 established that the isolated host exposes
  `ctx.permission.assert` at runtime. A matched allow resolved and permitted a
  temporary write. An unmatched custom `orchestra.*` action/resource also
  resolved immediately and permitted the write, with no prompt or error. This
  is not an effective deny-by-default gate for custom actions. The matched-deny
  result is inconclusive because the probe's permission rules were not loaded
  into the isolated host config; do not claim deny-before-write is proven.
  The plugin setup ran after a session was materialized. The model itself was
  unavailable, but the host executed the probe setup; no model tokens were
  consumed.
- The probe used isolated temporary XDG paths, did not contact the live server
  or change real permissions/config/repository files, and removed its temp
  tree. A temporary copy of the required provider auth entry was made for the
  run and then deleted; no secret was printed. M3 remains open. Do not use
  `ctx.permission.assert` with custom `orchestra.*` actions as a claimed
  security gate unless a host-recognized action and loaded rule are empirically
  shown to deny before side effects. Redesign or keep release blocked.
- M3 decision update (2026-11-24), recorded in ADR 0003 and superseding ADR
  0002's mandatory ticket decision: use native OpenCode permission prompts for
  `activate_team`, `complete_team`, and `delete_agent`; keep `create_agent`
  within its existing caller-session scope. The panel is read-only for these
  actions: it shows operation details and audit history but is not a second
  required approval gate. Same-user shell/API access is accepted as trusted.
- The prompt hook's ability to force `ask` for custom Orchestra actions is not
  yet runtime-proven. SA is running an isolated probe; do not implement or rely
  on the hook until its behavior and reject-before-side-effect behavior are
  established. Explicit host `deny` must never be overridden.
- The prior ticket implementation and its tests are transitional and will be
  removed if the native gate probe passes. Reviews found ticket-specific
  defects in stale `requestId` receipt handling, child-session follow-up, and
  per-setup ticket storage. The general requirements remain: bind the prompt to
  readable operation details, report panel/service failures truthfully, and
  store audit records in shared plugin storage rather than a per-setup map.
- ASE's post-build review confirmed the three rebuilt bundles include the
  ticket flow and remain deterministic, but identified the above ticket
  defects. It also confirmed service route tests cover most negative paths;
  missing coverage includes denied/unavailable panel audit UI and relevant
  session-target behavior. These ticket findings are historical pending the
  new implementation, not evidence that the current UI is ready.
- Automated local verification on 2026-11-24:
  - `bun --version` matched `packageManager` (`1.2.15`).
  - `bun install --frozen-lockfile` passed with no changes.
  - `bun test`: 127 passed, 0 failed, across 8 files.
  - `bun run build:extension` passed twice; SHA-256 hashes of all three
    generated bundles were identical across builds.
  - `bun run check:extension`: package ready to add in Settings → Extensions.
  - `bun audit --json` plus `bun run audit:report`: no blocking advisories.
  - Gitleaks 8.30.1, checksum-verified: no leaks in 38 local Git commits or
    the current working tree.
  - `git diff --check` passed; the CI ignore assertions passed for `.team.yml`,
    `TEAM.md`, `AGENTS.md`, `.env`, and `.env.local`.
  These local checks do not equal a GitHub Actions run or live desktop smoke.
  The generated bundles now reflect the current sources but differ from the
  checked-in baseline and must remain part of the reviewed change set.
- Source inspection finds no `ctx.permission.assert` call; the ticket registry
  remains a per-setup in-memory `Map`. Therefore the automated checks do not
  close M3 or the ticket-review findings. The native permission behavior and
  panel → service → plugin path remain unverified in the supported live host.
- Public-surface inspection still finds release-gate gaps: `package.json` lacks
  `author`, `homepage`, and `bugs`; `SECURITY.md` and `CODE_OF_CONDUCT.md` are
  absent because their contact details are still unresolved. The extension
  package check passing does not satisfy these public-release requirements.
- SA's package review confirms `ctx.permission.assert` is a native OpenCode
  prompt gate when the permission evaluation is `ask`, with `once`, `always`,
  and `reject` responses. It can protect against model-supplied tool arguments,
  but not same-user shell/API access. Forcing `ask` for custom Orchestra
  actions through a permission evaluation hook is plausible from the installed
  types but unverified; the earlier custom-action runtime probe resolved
  without a prompt. The `always` choice can persist an allow rule. Do not
  declare this control effective until a functional host probe proves the
  expected prompt and denial behavior.
- Do not declare `contributes.sessionControl.answers`: the installed SDK says
  it lets the service answer permission requests/forms on the user's behalf,
  which would make the service an auto-approver rather than a gate.
- The panel bridge can still provide content binding, expiry, replay
  resistance, attribution, and a visible human confirmation on the ordinary
  path. It cannot be described as preventing a shell-capable model from
  self-approving. The owner has accepted this narrower claim. M3 remains open
  until the native permission prompt is functionally verified and the ticket
  flow findings above are resolved and independently reviewed.
- ASE and SD1 identified writes outside tool calls: activation discovery-file
  creation/removal and session-event storage updates. The M3 inventory must
  cover these paths too; "assert before each tool write" is not sufficient to
  claim every write is gated.
- Source edits have made the committed `plugin/index.js`, `panel/main.js`, and
  `service/main.js` stale. This is expected during parallel implementation;
  do not install or release these artifacts. Rebuild once after source
  integration, then rerun tests and review all three generated diffs.
- CI is now reported to include package checking, Gitleaks history scanning,
  and `bun audit`; CodeQL, GitHub dependency review, GitHub secret scanning,
  Dependabot alerts, and required checks are unavailable/disabled for this
  private repository under current settings. The previously reported moderate
  advisories were addressed by the approved overrides; local `bun audit` now
  reports no blocking advisories. GitHub Actions itself remains unrun.
- The bundle-status step now uses `set -euo pipefail`; audit parsing rejects
  empty, invalid, and malformed output. CR2 verified both fail-closed paths.
  The workflow itself has not yet run in CI.
- SEC-8: GWM reports bundle/check executables now resolve from the locked
  `@openchamber/sdk@2.7.2` installation (no `bunx` fetch), and
  `packageManager` declares Bun 1.2.15 with matching contributor guidance.
  CR2 verified SDK resolution. GWM now reports the audit parser is extracted
  to `scripts/audit-report.ts`, runs under Bun, normalizes severity case, and
   has 10 committed Bun tests covering malformed input and blocking/warning
   classification. CI compares `bun --version` with `packageManager` in both
   jobs. GWM reports targeted tests and a vulnerable lodash fixture pass.
    CR2 independently reviewed the moderate-blocking change and found no
    defect. GWM reports the audit now passes after the approved overrides;
    actual CI remains unexecuted.
- The audit had two moderate advisories in development/tooling dependencies:
  `glob@13.0.5` (GHSA-3g3m-2fjr-6pw4) and `minimatch@10.2.5`
  (GHSA-g3hv-75wg-m249), arriving through `@opencode/plugin` / `@opencode/util`.
  Bun's `moderate` maps to the medium CVSS band and is blocking under the
  approved policy. The owner authorized flat overrides to `glob@14.0.6` and
  `minimatch@11.0.9`; GWM reports the lockfile regenerated and the audit is now
  clean. `bun install --frozen-lockfile` also passed in the repository and a
  clean temporary copy, with no lockfile rewrite. This changes dependencies,
  not the security policy.
- CR2's independent graph review found no lockfile defect, but identified eight
  transitive consumer edges outside their declared ranges. GWM reports a
  frozen install in a temporary copy, 104 tests passing, package check passing,
  and selected consumer smokes successful. Additional baseline-comparison
  probes reported identical results for map-workspaces, cacache, ignore-walk,
  `@tufjs/models` model validation, Arborist query/reify, and pacote
  manifest/extract. These results are reported, not independently rerun.
- Remaining untested paths include npm plugin install with third-party
  lifecycle scripts, git dependency cloning, full TUF metadata flows,
  complex workspace patterns, and package integrity/tarball error cases.
  `minimatch@11` also raises the Node engine floor to 20 for Node-based
  consumers; confirm no supported Node 18 path depends on these packages.
  Remove the overrides once upstream pins patched versions, after rechecking
  the lockfile and audit.
- The actual CI workflow remains unexecuted. Required checks are unavailable,
  so any red security job remains a release-gate failure even if GitHub permits
  a merge. Local bundle build, package check, and reproducibility verification
  have now passed; the rebuilt artifacts are uncommitted.
- SEC-7 ignore coverage is met for root-level local artifacts and `.env`
  patterns. The `.env.example` inverse assertion is active and guards against
  broad `.env.*` patterns even though the template file is absent. Root
  anchoring intentionally prevents this repository's own team files from
  publishing without disabling the feature in users' project roots.
- Gitleaks scans Git history but does not detect the committed SMOKE-001
  session identifiers or absolute home paths. This does not close SEC-6:
  history rewrite or explicit declassification remains a release decision.

### G2: Public surface and history

- Approved: remove the SMOKE-001 session/cost data, absolute local paths, the
  internal session URL, and screenshot metadata; rewrite the commit author email
  to a noreply address.
- Verify absence from every public ref, not just the current tree. Evidence
  includes a fresh clone and a history scan for each sensitive path/ref. A later
  deletion commit is insufficient.
- Verify `.gitignore` coverage for `.env`, `.env.*`, certificate/private-key
  extensions, `.npmrc`, `.netrc`, logs, and local team artifacts with
  `git check-ignore` tests.
- `AGENTS.md`, `TEAM.md`, and `.team.yml` stay ignored; no local roster may be
  staged.
- Declassifying any additional item requires the owner's written record of the
  data and the reason. Silence is not declassification.

### G3: Provenance and independent rescan

- From a clean checkout with `bun install --frozen-lockfile`, run tests, the
  extension package checker, and the extension build; verify the three
  committed bundles with `git diff --exit-code`.
- `bun.lock` currently pins `@openchamber/sdk` 2.7.2 and its bundler binary.
  Do not claim the bundler is unpinned unless a clean build disproves this.
- ACSA independently rescans after the fixes; CR1/CR2 review the integrated
  diffs; ASE records the final security decision. Fix authors cannot close
  their own security gate.

### Stop conditions

- If the repository becomes public before G2 is resolved, treat the disclosure
  as permanent and stop the release.
- Any credential found on rescan blocks publication and requires rotation
  outside this repository before restarting the gate.
- If `ctx.permission.assert` does not enforce at runtime, redesign rather than
  shipping a control that only appears to gate actions.
- If any excluded file remains reachable, the all-ref rewrite cannot be
  verified, or bundle provenance is unexplained, keep the repository private.

## Dependencies, stop conditions, and recovery

- TL records an owner and due gate for collecting security/conduct contacts.
  Missing contacts block their public files but not remediation.
- Verify the runtime effect of `ctx.permission.assert` before relying on it. If
  it does not enforce at runtime, stop and redesign.
- Security remediation blocks integration review; independent security review
  blocks tagging and visibility change.
- Host access is required to close plan 0004's real desktop smoke test.
- History rewrite requires a verified private backup, a complete ref inventory,
  and explicit approval. It must run as a single-operator exclusive window.
- CI and branch protection depend on repository permissions and the owner's
  selected required checks.
- If a rewrite fails or leaves a dirty ref, do not make the repository public;
  restore only from the verified private backup and re-audit all refs.
- If a build changes bundles unexpectedly, inspect source and generated diffs,
  regenerate only from reviewed source, rerun tests, and obtain independent
  review. No unexplained artifact may be tagged.
- If desktop permissions or smoke tests fail, keep the supported install claim
  narrow and block the release until the documented target works.
- If visibility is enabled prematurely, return the repository to private as
  containment, record the exposure, and assume the data may already have been
  copied.

## Remaining items before the matching gate

- Historical list, superseded by the status update above and the recorded
  decisions in this plan. Remaining release gates are current code/bundle
  review, ACSA rescan and ASE verdict, desktop path/error-state evidence, a
  GitHub Actions run, verified backup, and separately approved integration,
  rewrite, tag, and visibility operations.
