# OpenCode Orchestra

Orchestra adds tools for team onboarding and for creating, messaging,
inspecting, and deleting child OpenCode sessions.

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
close it. Commit `.opencode/commands/team.md` to share the command with project
collaborators. Team runtime state stays local in
`.opencode/orchestra/teams/`.

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
globally loaded Orchestra plugin; runtime team state is still stored in each
project's `.opencode/orchestra/teams/` directory.

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
