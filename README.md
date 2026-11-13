# OpenCode Orchestra

Orchestra adds team onboarding, background assignments to fixed roster members
with an acknowledgment/report lifecycle, and child-session management tools.

## Use from a checkout

Orchestra is not published yet. First install its dependencies from the
checkout:

```sh
cd "/path/to/orchestra"
bun install
```

Replace `/path/to/orchestra` below with that checkout's absolute path.

### Install in one project

From the OpenCode project root, create a plugin shim and copy the command:

```sh
mkdir -p .opencode/plugins .opencode/commands
cat > .opencode/plugins/orchestra.ts <<'EOF'
export { default } from "/path/to/orchestra/src/index.ts"
EOF
cp "/path/to/orchestra/src/commands/team.md" .opencode/commands/team.md
```

Restart OpenCode, then run `/team setup` to configure a team or `/team done` to
close it. On setup, Orchestra creates `TEAM.md` and creates or updates
`AGENTS.md` in the target project. If `TEAM.md` already exists, setup asks
whether to overwrite it or append the Orchestra rules. Commit
`.opencode/commands/team.md` to share the command with project collaborators.
Team runtime state is stored in OpenCode's Orchestra plugin storage, keyed by
the Team Lead session ID. Existing local JSON team state is not migrated.

### Install globally

To make the plugin and command available across projects, install both under
the global OpenCode config directory:

```sh
mkdir -p ~/.config/opencode/plugins ~/.config/opencode/commands
cat > ~/.config/opencode/plugins/orchestra.ts <<'EOF'
export { default } from "/path/to/orchestra/src/index.ts"
EOF
cp "/path/to/orchestra/src/commands/team.md" \
  ~/.config/opencode/commands/team.md
```

Restart OpenCode. The global `/team setup` and `/team done` commands use the
globally loaded Orchestra plugin; team state uses the same plugin storage and
Team Lead session keying as project installs. Setup writes the team guidance to
the target project, not to the Orchestra plugin repository.

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
the [team data model](_docs/team-data-model.md).
