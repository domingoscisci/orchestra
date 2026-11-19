# 0003-draft-orchestra-openchamber-extension

- Status: Draft
- Owner: TBD
- Created: 2026-11-19
- Related issues: none

## Steps

- [ ] Verify the OpenChamber Extension SDK contract, version compatibility,
      installation/update model, and permission requirements for Orchestra.
- [ ] Design the extension package so it can ship the existing Orchestra
      OpenCode plugin through `contributes.opencodePlugin`.
- [ ] Map `/team` and other Orchestra commands to extension contributions where
      semantics match; retain or document a compatibility path where they do
      not.
- [ ] Replace the onboarding HTML-render tool with custom OpenChamber chat
      blocks and tool presentation using `contributes.blocks` and
      `contributes.tools`.
- [ ] Implement the extension UI and host/plugin bridge while preserving team
      state, validation, authorization, session persistence, and existing
      lifecycle rules.
- [ ] Test install, approval/permissions, onboarding, team operations,
      upgrades/removal, and fallback behavior across supported OpenChamber
      surfaces.

## Objective

Transform Orchestra from a standalone OpenCode plugin plus separately copied
slash command into an OpenChamber Extension package, where feasible:

- Ship the Orchestra OpenCode plugin with the extension using
  `contributes.opencodePlugin`.
- Move Orchestra commands into extension contributions when the extension
  command contract preserves their behavior; explicitly retain a compatibility
  route for command behavior that cannot be represented.
- Replace the current onboarding HTML page generated through
  `openchamber_render` with native OpenChamber extension chat blocks and custom
  tool presentation using `contributes.blocks` and `contributes.tools`.

This is a draft for review, not an authorization to begin implementation.

## Current state

- Orchestra is an OpenCode plugin (`src/index.ts`) packaged from `src/` by
  `package.json`.
- The `/team` command is a separate Markdown command at
  `src/commands/team.md`; README installation instructions ask users to copy it
  separately into `.opencode/commands`.
- Team setup currently generates staged HTML through the plugin's
  `team_setup_ui` tool and `openchamber_render`, then activates the team after
  explicit approval.
- Team state is validated and stored by the OpenCode plugin under
  `team:<main-session-id>`. Assignments, ACK/report transitions, session event
  updates, and fixed-roster rules must remain authoritative.

## OpenChamber extension capabilities relevant to this plan

References:

- [Build an extension](https://docs.openchamber.dev/sdk/)
- [Host API](https://docs.openchamber.dev/sdk/host/)
- [UI kit](https://docs.openchamber.dev/sdk/ui/)
- [OpenChamber extensions overview](https://openchamber.dev/extensions/build/)

Documented capabilities to verify against the supported minimum OpenChamber
release during implementation:

- An extension is a package with a manifest, HTML entry point, and a bundled
  browser script. It uses `@openchamber/sdk`; OpenChamber loads the built assets
  and does not build TypeScript or install extension dependencies on behalf of
  the user.
- `contributes.opencodePlugin` lets the extension package ship an OpenCode
  plugin folder. The plugin entry must follow the OpenChamber loader contract;
  it is added to the OpenCode configuration managed by OpenChamber only after
  user approval. Plugin code runs with OpenCode's access and must be called out
  in the extension permission prompt.
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
  OpenCode Markdown commands such as `/team setup`.
- `contributes.panel` and `contributes.page` are alternatives if a persistent,
  multi-step onboarding surface cannot be expressed cleanly as chat blocks.
  They are not the selected first-choice surface in this draft.
- `host.storage` is extension-owned server persistence (with its own limits and
  uninstall lifecycle); it must not silently replace or shadow the existing
  Orchestra team document in `ctx.storage`.

## Proposed architecture

### Package and ownership

Make the installable unit an OpenChamber Extension package that contains:

1. The extension manifest and bundled UI assets.
2. The existing OpenCode plugin, exported under the manifest's
   `contributes.opencodePlugin` entry.
3. Extension-side UI code for custom blocks and tool-call rendering.
4. Documentation for installation, approval, supported OpenChamber versions,
   and compatibility with direct OpenCode installations.

The extension owns presentation and host integration. The OpenCode plugin
continues to own Orchestra's domain logic and `ctx.storage` team persistence.
Avoid two competing stores for team truth.

### Onboarding blocks and tool rendering

- Model the existing setup stages (lead, roster, domains, review/approval) as
  typed block payloads or block interactions. Verify the SDK's block lifecycle,
  answer semantics, re-render behavior, and the four-component cap before
  choosing the exact block decomposition.
- Keep validation and final activation in the OpenCode plugin. UI-submitted
  values are untrusted; re-run `validateTeamRoster` and structural validation
  server-side before writing state or creating sessions.
- Preserve explicit final approval before `activate_team`, including
  overwrite/append consent for existing `TEAM.md`, and preservation of existing
  `AGENTS.md` content.
- Use `contributes.tools` for readable Orchestra tool cards/tables/status output
  where its declarative template contract suffices. It is presentation only;
  all access checks remain in plugin tool handlers.
- Keep `openchamber_render` as a temporary fallback only if older supported
  hosts lack the required block features. Remove it only after compatibility
  requirements are decided and tested.

### Commands

- Inventory `/team setup`, `/team save`, `/team load`, `/team done`, and any
  other commands before moving them.
- Determine whether the extension `commands` contract can preserve each
  command's argument parsing and behavior. The documented extension command
  resolver attaches an item; it is not a direct command handler, so do not
  claim a migration is complete based on matching slash-command names alone.
- If semantics differ, use a supported OpenCode command distribution mechanism
  or retain a documented standalone command-install option. Avoid requiring
  users to copy files manually where the extension can safely distribute them.

### Rules and persistence invariants

- Keep team membership fixed for the lifetime of the run. The extension UI
  must not treat non-roster users, workflow agents, or UI sessions as members.
- Preserve all existing assignment authorization, one-active-assignment
  constraint, ACK/report lifecycle, messaging guidance, and session event
  semantics.
- Do not migrate team state from OpenCode plugin storage to extension storage
  unless a separate, explicit migration is designed and tested.
- Do not duplicate full conversation history in extension storage. OpenCode
  sessions remain the source of conversation history.
- Consider extension uninstall/disable separately from team-state retention:
  OpenChamber removes extension-owned storage on uninstall, but Orchestra team
  state belongs to the OpenCode plugin storage and must not be lost or altered
  as a side effect.

## Scope

### In scope

- Deliver Orchestra as an installable OpenChamber extension.
- Package the OpenCode plugin inside the extension using the supported
  `contributes.opencodePlugin` mechanism, subject to compatibility validation.
- Replace manual command copying where SDK contributions can preserve behavior;
  document any command that must remain separately installed.
- Use custom chat blocks for the onboarding interaction and `contributes.tools`
  for improved presentation of Orchestra outputs.
- Preserve backend validation, team persistence, session identity, authorization
  and operational rules.
- Provide a compatibility and fallback story for hosts that cannot load
  OpenChamber extensions.

### Out of scope

- Replacing Orchestra's OpenCode plugin domain logic with extension-side
  JavaScript.
- Moving canonical team state from `ctx.storage` to `host.storage`.
- Replacing the existing fixed roster, team hierarchy, domains, or
  assignment/ACK/report model.
- Treating tool display templates as enforcement or authorization.
- Requiring a full-screen panel or Work Status section for onboarding unless
  the block API proves insufficient and the design is revisited.
- Reimplementing native OpenChamber Workflow runs or importing internal
  OpenChamber React components.

## Risks and questions to resolve

- **Command mismatch:** Extension slash commands attach items through a resolver;
  OpenCode commands execute Markdown command prompts. Verify whether a supported
  mechanism can package `/team` with equivalent semantics.
- **Plugin loader constraints:** The extension-bundled plugin entry must satisfy
  OpenChamber's documented import/export and package layout constraints. Current
  Orchestra source imports `@opencode/plugin` and Node modules; verify the
  managed runtime supports these dependencies and determine how to bundle or
  declare them.
- **Independent install modes:** Users currently install Orchestra in OpenCode
  directly. Decide whether the extension becomes primary, whether standalone
  installation remains supported, and how duplicate plugin loading is avoided.
- **Version/API gates:** `contributes.blocks`, `contributes.tools`, and
  `contributes.opencodePlugin` may have minimum release requirements. Set
  `engines.openchamber` and graceful fallbacks based on verified versions.
- **Block constraints:** At most four block components are documented; chat
  blocks are model-invoked and their arguments are untrusted. Onboarding may
  need multiple successive assistant turns, which must be checked against
  block answer and conversation lifecycle behavior.
- **Permission clarity:** Installing the extension can request adding a plugin
  to OpenCode, which runs with the user's full access. Explain this clearly and
  request only capabilities actually needed.
- **Storage lifecycle:** Extension storage is deleted on extension uninstall.
  It must not become the sole copy of Orchestra team state.
- **UI availability:** Extensions work in OpenChamber web, desktop, and mobile,
  but not VS Code. Direct OpenCode users need an explicit supported path.

## Acceptance criteria

- One documented OpenChamber extension install provides the Orchestra UI and,
  where the host supports it, the Orchestra OpenCode plugin.
- The permission prompt clearly explains the OpenCode plugin's access and any
  other requested capabilities.
- The onboarding stages use custom OpenChamber chat blocks instead of generated
  standalone HTML on supported hosts; each submitted state is validated by
  plugin code before side effects.
- Final team creation remains explicitly approved. Existing-file overwrite or
  append choices and rollback/preservation guarantees remain intact.
- `contributes.tools` improves the presentation of selected Orchestra tools
  without changing tool inputs, outputs, authorization, or error semantics.
- `/team` commands either work through a verified equivalent extension
  mechanism or have a documented, tested compatibility installation path.
- Team state remains in OpenCode plugin storage and survives extension UI
  reloads, disable/enable, and supported upgrades.
- Existing team assignment and session lifecycle tests continue to pass.
- Tests cover extension manifest/package layout, plugin activation/deactivation,
  block payload validation, tool presentation mappings, onboarding transitions,
  and standalone OpenCode compatibility.
- Installation is tested in supported OpenChamber web/desktop versions and the
  documented mobile behavior is checked; unsupported hosts fail clearly rather
  than partially initializing Orchestra.

## References in this repository

- [`README.md`](../../README.md)
- [`package.json`](../../package.json)
- [`src/index.ts`](../../src/index.ts)
- [`src/commands/team.md`](../../src/commands/team.md)
- [`src/core.ts`](../../src/core.ts)
- [`_docs/model/rules.yaml`](../model/rules.yaml)
- [`_docs/runbooks/manage-child-sessions.md`](../runbooks/manage-child-sessions.md)
- [`_docs/planning/0001-approved-team-onboarding.md`](0001-approved-team-onboarding.md)
- [`_docs/planning/0002-approved-team-management.md`](0002-approved-team-management.md)
