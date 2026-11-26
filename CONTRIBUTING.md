# Contributing

Thanks for taking the time to improve Orchestra. This guide covers the local
workflow. Local team files such as `AGENTS.md`, `TEAM.md`, and `.team.yml` are
generated per working copy and are not part of the repository.

## Before you start

- Check open issues and pull requests for the same problem.
- Keep changes small and reviewable, with a single intent per commit.
- Do not report security problems here or in a public issue; see
  [Security](#security).

## Requirements

- Bun 1.2.15. The `packageManager` field in `package.json` names this exact
  version, and it is the toolchain that produced the committed bundles. Another
  Bun release may generate different output and fail the bundle gate.
- OpenChamber 2.7.2 or later to exercise the panel manually.
- No npm or Node.js installation is required.

## Setup

```sh
bun install --frozen-lockfile
```

The lockfile pins `@openchamber/sdk` 2.7.2 and `openchamber-guest-bundle` /
`openchamber-guest-check` come from that installed package, not from a fetched
latest release. Run them only through the package scripts.

## Test

```sh
bun test
```

Add a test for every behavior change. A fix is not complete when the new test
passes only with the change: confirm that the test fails against the previous
behavior when that is practical.

## Build

```sh
bun run build:extension
```

The build regenerates three committed artifacts: `panel/main.js`,
`plugin/index.js`, and `service/main.js`. Installation uses these files, so a
change to `panel/*.ts`, `src/*.ts`, or `service/*.ts` must ship with the
regenerated artifacts in the same commit. Do not hand-edit the generated files.
The release checks reject a committed artifact set that differs from a fresh
build.

Do not run two builds at once: one build script writes all three artifacts.

Regenerate the bundles with Bun 1.2.15, the version recorded in
`packageManager`: the release checks rebuild them and fail when the result
differs from the committed files, so another Bun release may fail the gate.

## Check the package

```sh
bun run check:extension
```

This validates the extension manifest against the built panel and service using
the `@openchamber/sdk` version pinned in the lockfile.

## Layout

| Path | Contents |
|---|---|
| `src/index.ts` | the OpenCode plugin: tools, activation service, session handling |
| `src/core.ts` | pure helpers for the team model, validation, and assignment rules |
| `panel/` | the extension panel and its helper modules |
| `service/` | the host service that forwards panel requests |
| `tests/` | Bun tests for the helper and packaging contracts |
| `_docs/` | product docs, ADRs, plans, runbooks, and the data model |

## Where documentation belongs

| Kind of knowledge | Location |
|---|---|
| Decision that constrains the design | `_docs/adr/NNNN-<slug>.md` |
| Plan with steps, scope, and acceptance criteria | `_docs/planning/NNNN-approved-<slug>.md` |
| Repeatable procedure | `_docs/runbooks/<slug>.md` |
| Task-oriented guidance | `_docs/guides/<slug>.md` |
| Domain model and its invariants | `_docs/model/team-data-model.md` |
| Terminology | `GLOSSARY.md` |
| User-facing install and usage | `README.md` |

Keep documentation in English and lines within 80 characters where that does
not break a link or a command.

## Commits

Use conventional prefixes as the history already does: `feat`, `fix`, `docs`,
`chore`, `style`. State what changed and why. Do not include local paths,
session identifiers, token or cost records, or generated local artifacts such
as `AGENTS.md`, `TEAM.md`, or `.team.yml`; those are ignored on purpose.

## Pull requests

- Explain the behavior before and after the change.
- List the commands you ran and their results.
- Note any change to the extension package contract, the `.team.yml` schema, or
  the documented installation path.
- Keep generated bundles in the same pull request as their sources.

## Security

Vulnerability reports go through the private channel described in
[SECURITY.md](SECURITY.md). Do not open a public issue for a vulnerability.

## License

By contributing, you agree that your contribution is licensed under the MIT
license in [LICENSE](LICENSE).
