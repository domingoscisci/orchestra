# OpenCode Orchestra

Orchestra adds team onboarding, background assignments to fixed roster members
with an acknowledgment/report lifecycle, and child-session management tools.

## Install in an OpenCode project

Add Orchestra's Git repository to the project's `opencode.json` or
`opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "git+https://github.com/domingoscisci/orchestra.git#main"
    }
  ]
}
```

OpenCode fetches the plugin from Git; no checkout path or npm publication is
needed. For reproducible installs, replace `main` with a full commit hash.
Private repositories require Git credentials available to OpenCode.

The `/team` slash command is a separate file and must also be copied into the
project:

```sh
mkdir -p .opencode/commands
curl -fsSL \
  https://raw.githubusercontent.com/domingoscisci/orchestra/main/src/commands/team.md \
  -o .opencode/commands/team.md
```

Commit the project config and `.opencode/commands/team.md` to share the setup
with collaborators. After installation, use `/team setup` to configure a team,
`/team save` to save an active roster, `/team load` to review a saved roster,
or `/team done` to close the active team.

## Install globally

To install Orchestra from Git for all projects, run:

```sh
opencode plugin add git+https://github.com/domingoscisci/orchestra.git#main
```

For reproducible installs, use a full commit hash instead of `main`. Install
the `/team` slash command in the global OpenCode config directory as well:

```sh
mkdir -p ~/.config/opencode/commands
curl -fsSL \
  https://raw.githubusercontent.com/domingoscisci/orchestra/main/src/commands/team.md \
  -o ~/.config/opencode/commands/team.md
```

The plugin and `/team` command are then available across projects.

Saved configuration lives in `.team.yml` at the project root and includes the
lead role, participants, and domains, but no session state. Setup offers to
reload this file before collecting a new roster. On setup, Orchestra creates
`TEAM.md` and creates or updates `AGENTS.md` in the target project. If
`TEAM.md` already exists, setup asks whether to overwrite it or append the
Orchestra rules. After approval, the latest configuration is saved to
`.team.yml`; OpenChamber Render is used when available, with interactive
questions as a fallback. Team runtime state is stored in OpenCode's Orchestra
plugin storage, keyed by the Team Lead session ID. Existing local JSON team
state is not migrated.

## Development

The package entry point is `src/index.ts`; shared helpers are in `src/core.ts`.
The shared team command lives in `src/commands/team.md` and is included with
the source files. Runtime files under `.opencode/` are not part of the package.

Run the helper tests with:

```sh
bun test
```

The package targets `@opencode/plugin` 2.2.6 and later compatible 2.x releases.

See the [runbook](_docs/runbooks/manage-child-sessions.md) for tool usage and
the OpenCode API workflow. The proposed persistent board model is documented in
the [team data model](_docs/team-data-model.md). The decision not to integrate
OpenChamber Workflows is recorded in
[ADR 0001](_docs/adr/0001-do-not-integrate-openchamber-workflows.md). The draft
for converting Orchestra into an OpenChamber extension is in
[plan 0003](_docs/planning/0003-draft-orchestra-openchamber-extension.md).
