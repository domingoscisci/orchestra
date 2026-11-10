# OpenCode Orchestra

Orchestra adds tools for creating, messaging, inspecting, and deleting child
OpenCode sessions.

## Development

The package entry point is `src/index.ts`; shared helpers are in `src/core.ts`.
The project-local `.opencode/` directory is ignored and is not included in the
repository.

Run the helper tests with:

```sh
bun test
```

## Install

The package is not published yet. After publishing it to npm, install it in an
OpenCode project with:

```sh
opencode plugin add opencode-orchestra
```

The package targets `@opencode/plugin` 2.2.6 and later compatible 2.x
releases.

See the [runbook](_docs/runbooks/manage-child-sessions.md) for tool usage and
the OpenCode API workflow.
