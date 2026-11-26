# 0003-approved-orchestra-openchamber-extension

- Status: Done
- Owner: TBD
- Created: 2026-11-19
- Target: N/A
- Related draft: 0003 (same file, promoted)
- Related issues: none
- Related PRs: none
- Related ADRs: none

## Steps

- [x] Create `feature/openchamber-extension` from the updated `main` for the
      implementation.
- [x] Implement panel-based saved-team creation, editing, selection, and
      activation handoff to the existing plugin.
- [x] Package the OpenChamber extension with the existing OpenCode plugin.
- [x] Run the focused team-onboarding regression tests and record host
      packaging/smoke-test gaps as follow-up work.

## Closure update (2026-11-19)

The panel-based product direction recorded below superseded the original
chat-block and `/team` attachment proposal. This plan is closed for the
configuration and activation-handoff scope. The latest panel source changes
still need a fresh extension build and desktop smoke tests; these checks are
carried into approved plan 0004 rather than reported as verified here. Web
compatibility remains a later evaluation.

The proposed live status service, including activation confirmation and later
agent/task status, is a separate follow-up. The plugin remains responsible for
creating the team; its server would expose state, while an extension service
would bridge that API to the panel.

## Objective

Replace Orchestra's standalone OpenCode installation with a locally
installable OpenChamber Extension that includes the OpenCode plugin for
operations that require OpenCode APIs:

- Rebuild Orchestra as an extension; do not retain a supported standalone
  installation path.
- Keep Team rules, validation, canonical storage, and OpenCode session
  operations in the embedded plugin. The extension owns chat onboarding UI.
- Preserve `/team` command behavior using extension commands only where their
  semantics match; otherwise use a supported way to package the OpenCode
  commands with the extension.
- Use the best-fitting native extension surface for onboarding, preferring
  chat blocks when their lifecycle is reliable. Do not retain
  `openchamber_render`.

This is the approved execution plan. Implementation is on
`feature/openchamber-extension`, based on the updated `main`.

## Current state

- Orchestra is an OpenCode plugin (`src/index.ts`) packaged from `src/` by
  `package.json`.
- The `/team` command is a separate Markdown command at
  `src/commands/team.md`; README installation instructions ask users to copy it
  separately into `.opencode/commands`.
- Team setup currently generates staged HTML through the plugin's
  `team_setup_ui` tool and `openchamber_render`, then activates the team after
  explicit approval.
- The current plugin stores team state under `team:<main-session-id>` and
  handles assignments, ACK/report transitions, session events, and fixed
  roster rules. It remains the canonical Team store; existing stored data will
  not be imported or deleted.

## OpenChamber extension capabilities relevant to this plan

References:

- [Build an extension](https://docs.openchamber.dev/sdk/)
- [Host API](https://docs.openchamber.dev/sdk/host/)
- [UI kit](https://docs.openchamber.dev/sdk/ui/)
- [OpenChamber extensions overview](https://openchamber.dev/extensions/build/)

The package was checked against `@openchamber/sdk` 2.7.2. Remaining host
behavior still requires web and desktop smoke tests:

- An extension is a package with a manifest, HTML entry point, and bundled
  browser script. The package checker validates the manifest and assets.
- `contributes.opencodePlugin` packages the built plugin folder; runtime
  loading and its host approval still need smoke testing.
- `contributes.service` can run a package-owned process and expose it to the
  extension page through `serviceRequest`. The process has the user's full
  access; permission declarations are disclosure, not an OS sandbox.
- The `opencode` service role provides read-only access to selected OpenCode
  session, message, project, and event endpoints. `sessionControl` is a
  separate approved capability for starting/sending/stopping sessions and
  answering forms or permissions. `sessions.start` does not accept a parent
  session ID.
- `contributes.blocks` lets an agent invoke a declared custom component inside
  its chat reply. The extension's sandboxed page renders the block through
  `host.onBlock`; a block can answer the agent with `host.answerBlock` when
  declared for answers. The documented limit is four block components per
  extension. Block arguments are model-authored and must be treated as
  untrusted input.
- `contributes.tools` declares display metadata for matching OpenCode tool
  calls, including icon, title/subtitle, and output render mode (`text`,
  `json`, `markdown`, `code`, `table`, `card`, or `auto`). It changes
  presentation, not tool behavior or authorization.
- Extension `commands` are slash commands resolved through `host.onResolve`
  and attach an item to the composer; they are not automatically equivalent to
  OpenCode Markdown commands such as `/team setup`. Their attachment can carry
  model context, which can route `/team` actions to the existing plugin tools.
- `contributes.panel` and `contributes.page` are alternatives if a persistent,
  multi-step onboarding surface cannot be expressed reliably as chat blocks.
- `host.storage` is extension-owned persistence. It is not needed for Team
  setup and must not become a duplicate of plugin `ctx.storage`.
- `@openchamber/sdk` 2.7.2 documents answerable blocks and resolver
  attachments; `bunx openchamber-guest-check .` accepts the current package.
- Extension services are supported on web and Electron desktop; the extension
  catalog and services are unavailable on mobile and VS Code.

## Proposed architecture

### Package and ownership

Make the only supported installable unit an OpenChamber Extension package that
contains:

1. The extension manifest and bundled UI assets.
2. The existing OpenCode plugin, exported under the manifest's
   `contributes.opencodePlugin` entry.
3. Extension-side UI code for custom blocks and tool-call rendering.
4. Documentation for local installation, approval, supported OpenChamber
   versions, data retention, and the unsupported host surfaces.

The extension owns the chat onboarding UI. The embedded plugin remains the
owner of Team rules, validation, canonical storage, and session operations. No
direct extension-to-plugin API or second Team store is needed for setup: the
extension answers its chat block with structured Team data, the agent passes
that data to an existing plugin tool, and the plugin validates it before side
effects.

The new installation starts with no migrated team data. Leave legacy plugin
storage untouched. Team data remains in plugin storage; disclose the behavior
of removing the bundled plugin/extension for newly created Team data.

### Chat onboarding and plugin handoff

- Use extension chat blocks for setup stages (lead, roster, domains, and final
  review). `answerBlock` returns the structured result to the current agent;
  the agent then invokes the existing Orchestra plugin tool in that session.
- Resolve `/team setup`, `/team save`, `/team load`, and `/team done` to
  composer attachments containing action-specific instructions. The agent
  continues to call the corresponding existing plugin tools.
- Treat block arguments and answers as untrusted. The plugin revalidates role
  IDs, roster structure, domains, and approval before storage changes or
  session creation.
- Preserve explicit approval before team activation and a separate approval
  before overwrite/append changes to `TEAM.md` or changes to `AGENTS.md`.
- Use `contributes.tools` for selected tool presentation where it adds clarity.
  This is secondary and must not change tool behavior or authorization.
- Remove the `openchamber_render` onboarding path; do not maintain it as a
  fallback.

### Commands

- Inventory `/team setup`, `/team save`, `/team load`, `/team done`, and any
  other commands before moving them.
- Preserve the `/team` action names and arguments through extension command
  attachments. Their prompts must retain the confirmation and error-handling
  rules in `src/commands/team.md`.

### Rules and persistence invariants

- Keep team membership fixed for the lifetime of the run. The extension UI
  must not treat non-roster users, workflow agents, or UI sessions as members.
- Preserve current functionality: assignment authorization, one active
  assignment per member, ACK/report lifecycle, messaging guidance, and session
  event semantics.
- Start with empty team state. Do not import or delete existing plugin data.
- Keep `ctx.storage` as the single canonical Team store in the plugin.
- Do not duplicate full conversation history in extension storage. OpenCode
  sessions remain the source of conversation history.
- Do not migrate or delete legacy Team data.

## Scope

### In scope

- Rebuild Orchestra as a locally installable OpenChamber extension containing
  the OpenCode plugin for OpenCode-specific operations.
- Implement the supported chat-block-to-agent-to-plugin handoff; do not add a
  direct plugin/service bridge or duplicate canonical state.
- Preserve the current roster, domain, assignment, ACK/report, session, and
  authorization functionality.
- Use a reliable native extension surface for onboarding and preserve
  `/team` command semantics through a supported packaged route.
- Remove the standalone installation path after the extension's supported
  flows have been verified.
- Support OpenChamber web and desktop only. Declare the minimum
  compatible OpenChamber version.
- Provide local installation and update documentation; public marketplace
  distribution is out of scope.

### Out of scope

- Supporting direct OpenCode installations, external OpenCode hosts, or VS Code.
- Migrating or deleting team data from the old plugin storage.
- Publishing the extension to a public marketplace.
- Replacing the existing fixed roster, team hierarchy, domains, or
  assignment/ACK/report functionality.
- Treating tool display templates as enforcement or authorization.
- Requiring chat blocks when a page or panel is more reliable for onboarding.
- Reimplementing native OpenChamber Workflow runs or importing internal
  OpenChamber React components.

## Risks and questions to resolve

- **Command mismatch:** Extension slash commands attach items through a
  resolver; OpenCode commands execute Markdown command prompts. A supported
  packaging route must preserve `/team` semantics.
- **Plugin loader constraints:** The extension-bundled plugin entry must satisfy
  OpenChamber's documented import/export and package layout constraints. Current
  Orchestra source imports `@opencode/plugin` and Node modules; verify the
  managed runtime supports these dependencies and determine how to bundle or
  declare them.
- **Chat handoff:** The model relays block answers to plugin tools. The plugin
  remains authoritative and must validate all inputs before side effects.
- **Version/API gates:** `contributes.blocks`, `contributes.tools`, and
  `contributes.opencodePlugin` may have minimum release requirements. Set
  `engines.openchamber` and graceful fallbacks based on verified versions.
- **Block constraints:** At most four block components are documented; chat
  blocks are model-invoked and their arguments are untrusted. Onboarding may
  need multiple successive assistant turns, which must be checked against
  block answer and conversation lifecycle behavior.
- **Permission clarity:** One host confirmation covers the extension and its
  embedded plugin. Clearly disclose the plugin's OpenCode access in that
  approval flow.
- **Storage lifecycle:** Team state remains in plugin storage. Leave legacy
  plugin data untouched.
- **Host availability:** Extension services are not available on mobile or
  VS Code. Support and test web and desktop; direct OpenCode hosts are
  unsupported.

## Acceptance criteria

- The extension collects Team setup values in a chat block and returns them to
  the same agent session, which passes them to an Orchestra plugin tool.
- The plugin validates the received values, owns the canonical store, and
  creates the sessions.
- The local extension package includes the plugin for OpenCode-specific
  operations and is the only supported Orchestra installation path.
- One host approval clearly discloses the plugin's OpenCode permissions.
- Team state starts empty; old plugin data is neither imported nor deleted.
- The onboarding UI uses the native surface that best fits the verified
  lifecycle. Values are validated at the receiving side before side effects.
- Team activation and changes to `TEAM.md`/`AGENTS.md` retain separate explicit
  approvals.
- `/team` commands preserve their current semantics through an SDK-equivalent
  command or a supported packaged OpenCode command route.
- Current roster, domains, assignment, ACK/report, session, and authorization
  behavior has regression coverage.
- Installation and the main flows pass smoke tests on OpenChamber web and
  desktop. The minimum compatible version is declared; mobile, VS Code, and
  direct OpenCode hosts are unsupported.
- Local install/update documentation is complete. Public marketplace
  distribution and standalone compatibility are not required.

## Dependencies

- The supported OpenChamber Extension SDK block lifecycle and plugin loader.
- A supported way to invoke onboarding in chat while retaining `/team`
  behavior.

## Implementation phases

### Phase 1: SDK and handoff spike

Verify that a chat block can return structured setup data to the agent and
that the agent can pass it to the existing plugin tool. The plugin remains the
canonical storage owner.

### Phase 2: Extension package and core flows

Build the local extension package, embed the existing OpenCode plugin, and
move chat onboarding UI into the extension. Preserve Team functionality and
command semantics.

### Phase 3: Validation and handoff

Run regression tests and smoke tests on web and desktop. Complete
local installation, update, permission, and data-retention documentation.
Remove the standalone installation path only after supported flows pass.

## Validation plan

- Test roster and domain handling, assignment authorization, ACK/report
  transitions, session lifecycle, and persistence.
- Test extension packaging, plugin loading, chat handoff, validation at
  side-effect boundaries, and `/team` command semantics.
- Smoke-test local installation and main flows on OpenChamber web and desktop
  at the declared minimum version.
- Verify one canonical store, no legacy data import/deletion, and clear
  uninstall data disclosure.

## Rollout plan

- Install and validate the extension locally; public marketplace distribution
  is out of scope.
- Switch the supported Orchestra installation path to the extension only
  after the acceptance criteria pass.

## Rollback notes

- Keep `main` unchanged while implementation and validation happen on the
  feature branch.
- If the spike fails, do not proceed beyond the spike; return for a new
  architecture decision.
- If post-spike validation fails, do not merge the extension branch.

## Chat handoff spike

### Responsibility matrix

| Responsibility | Extension | OpenCode plugin |
|---|---|---|
| Setup UI and input | Renders chat blocks; returns answers | Consumes answers through its tools |
| Team rules and validation | No authority | Owns validation and domain behavior |
| Team state | No duplicate canonical copy | Owns `ctx.storage` |
| Session creation and lifecycle | No direct API needed for setup | Owns OpenCode operations |
| Session IDs | Can receive the tool's structured result | Returns member/session mapping |
| `/team` flow | Starts onboarding through a supported contribution | Keeps operational tools |

### Contract findings

References:

- [OpenChamber extension SDK](https://docs.openchamber.dev/sdk/)
- [OpenChamber host API](https://docs.openchamber.dev/sdk/host/)
- [OpenCode plugin API](https://opencode.ai/docs/plugins)

- The extension SDK 2.7.2 provides `host.onBlock` and `host.answerBlock`; the answer
  returns to the current agent conversation.
- OpenCode runs the embedded plugin in that same session. The agent can pass
  the block answer to an existing plugin tool; the plugin validates it before
  storage changes and session creation.
- This is a model-mediated handoff, not a direct extension-to-plugin API. The
  plugin remains authoritative; the UI answer and tool arguments are untrusted.
- The current `activate_team` result already returns the Team document,
  including member/session IDs. That can serve as the initial mapping for a
  future status UI.
- The prior service/API blocker applies only to a panel that directly calls
  plugin internals. It does not block chat onboarding.

### Platform scope

Extension services and catalog are unavailable on mobile. Support web and
desktop; mobile, VS Code, and direct OpenCode hosts remain out of scope.

## Current blockers

- Smoke-test bundled plugin loading and panel file/prompt capabilities on
  supported hosts.

## Next meaningful steps

- Finish regression cases for multi-team YAML management and activation handoff,
  then run host smoke tests; defer the optional status panel.

## Closure notes

### Delivered outcome

The extension panel manages saved team configurations in `.team.yml` and sends
an explicit activation request to the existing plugin through the current chat.
The plugin remains authoritative for validation and session creation. The
focused `tests/team-onboarding.test.ts` suite passed (33 tests).

### Deviations from plan

The approved chat-block onboarding and `/team` attachment approach was replaced
by panel-based team management. A direct plugin-to-extension status bridge and
live team dashboard were deferred to plan 0004. The latest panel source changes
have not yet been rebuilt into `panel/main.js` or smoke-tested in OpenChamber.

### Follow-up work

See [`0004-approved-orchestra-activation-confirmation.md`](0004-approved-orchestra-activation-confirmation.md)
for the plugin status API and extension service bridge that confirm activation.
A live agent/task dashboard will need a separate future plan.

## References in this repository

- [`README.md`](../../README.md)
- [`package.json`](../../package.json)
- [`src/index.ts`](../../src/index.ts)
- [`src/core.ts`](../../src/core.ts)
- [`_docs/model/rules.yaml`](../model/rules.yaml)
- [`_docs/runbooks/manage-child-sessions.md`](../runbooks/manage-child-sessions.md)
- [`_docs/planning/0001-approved-team-onboarding.md`](0001-approved-team-onboarding.md)
- [`_docs/planning/0002-approved-team-management.md`](0002-approved-team-management.md)

## Product direction update (2026-11-19)

The approved implementation direction was updated after review of the panel
mockup:

- Remove the `/team` command and its extension command attachment.
- Make the extension panel the sole owner of team configuration management:
  create, edit, select, activate, and delete multiple saved teams.
- Store the versioned multi-team document as actual YAML in `.team.yml` at the
  project root. The extension uses the SDK `files` capability and the `yaml`
  parser/stringifier; the plugin does not read or write this file.
- Keep activation in the existing plugin. The panel sends the selected team
  configuration into the current chat after an explicit “Attiva team” click;
  the agent forwards it to `orchestra.activate_team`, which remains
  authoritative for role validation and session creation.
- Keep runtime team state, TEAM.md/AGENTS.md behavior, and session operations
  in the plugin.

This direction supersedes the earlier `/team` command attachment and
single-configuration `.team.yml` assumptions above.
