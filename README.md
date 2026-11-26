# Orchestra

> An OpenChamber extension that turns an OpenCode session into a coordinated
> team of agents with a fixed roster, background assignments, and an
> acknowledgment/report lifecycle.

## What this is

Orchestra is installed as a local OpenChamber extension and adds three parts:

- a panel that creates, edits, activates, and deletes team definitions kept in
  `.team.yml`;
- an OpenCode plugin whose tools create the team's sessions, assign work,
  track acknowledgments and reports, inspect child sessions, and message
  teammates;
- two project files, `TEAM.md` and `AGENTS.md`, that tell the team how to work
  in that project.

What it is not: not an npm package, not a standalone OpenCode plugin, and not a
hosted service. A team's structure is fixed for the duration of a run.

## Requirements

| Requirement | Notes |
|---|---|
| OpenChamber | 2.8.0 or later, the minimum declared in the extension manifest |
| OpenCode | provided by OpenChamber; the plugin targets `@opencode/plugin` 2.2.6 and later 2.x |
| Bun | only to build or test from source; the built bundles are committed |

## Install

A clone or ZIP of this repository installs as-is: `panel/main.js`,
`plugin/index.js`, and `service/main.js` are committed, so no build step is
required for installation.

1. Clone the repository or download the ZIP for the release you want.
2. In OpenChamber, open Settings → Extensions → Add, then select the repository
   folder (or the unpacked ZIP).
3. Approve the capabilities the extension requests. They are listed under
   [Permissions](#permissions).
4. Open the Orchestra panel from the extensions list.

If you change the sources, rebuild before installing:
`bun install --frozen-lockfile && bun run build:extension`. The build uses the
`@openchamber/sdk` version pinned in `bun.lock`.

## First team

Role files come before teams: the panel lists agents from project-local
`.opencode/agents` files. See
[create agent roles](_docs/guides/create-agent-roles.md). The built-in `build`,
`plan`, `general`, and `explore` agents are always selectable.

1. Open the Orchestra panel in the project where the team should work.
2. Choose the Team Lead role. Select **Solo team** if the Lead works alone; a
   solo team skips the roster and domain steps.
3. For a team, add members, choose a role for each, then group members into
   optional domains with one Domain Lead per domain.
4. Name the team. It is saved to `.team.yml` in the project root.
5. Press **Activate**. The panel sends an activation message to the current
   chat; the agent calls `orchestra.activate_team`, the plugin validates the
   request, creates the team's sessions, and writes `TEAM.md` plus an Orchestra
   block in `AGENTS.md`. If `TEAM.md` already exists, activation stops and asks
   whether to overwrite it or append the Orchestra rules.
6. Work through the team: the Lead assigns with `orchestra.assign_task`, the
   member acknowledges with `orchestra.acknowledge_task`, and reports the
   outcome with `orchestra.report_task`. The panel badge marks the active team
   and is restored for that session when the panel is reopened.

## Permissions

| Request | Used for |
|---|---|
| `files` | list and read `.opencode/agents`, read and write `.team.yml` |
| `prompt` | send the activation message to the current chat |
| service | forward the panel's activation request to the plugin and return the result |
| OpenCode plugin | create and delete sessions, write `TEAM.md` and `AGENTS.md`, store team state |

The plugin starts a loopback activation server on `127.0.0.1` at a random port,
guarded by a per-process bearer token. If the service permission is denied,
activation still works through the chat, but the panel cannot show the
correlated confirmation.

Orchestra does not call remote services itself. It uses the local OpenChamber
and OpenCode host APIs, and the plugin talks to the local host only.

## Files and data

| Path | Written by | Contents |
|---|---|---|
| `.team.yml` | panel | team definitions, `version: 1`, no session state |
| `TEAM.md` | plugin, at activation | the operating rules of the active team |
| `AGENTS.md` | plugin, at activation | the Orchestra guidance block, appended if the file exists |
| OpenCode plugin storage, key `team:<lead session id>` | plugin | sessions, assignments, and activation receipts for one run |
| data directory, file `activation-service.json` | plugin | loopback URL and per-process token, mode `0600` inside a `0700` directory |

The data directory is `~/Library/Application Support/Orchestra` on macOS,
`%APPDATA%\Orchestra` on Windows, and `$XDG_DATA_HOME/orchestra` (or
`~/.local/share/orchestra`) on Linux. Set `ORCHESTRA_DATA_DIRECTORY` to place it
elsewhere; the plugin and the service read the same variable. The discovery
file is removed when the activation service stops.

Team names, member names, and assignment text are stored locally and become
part of the model context during the run. Nothing is uploaded by Orchestra.

## Update and uninstall

- **Update:** install the new repository folder or ZIP over the extension. Keep
  `.team.yml` to preserve team definitions; runtime state stays in the plugin
  storage.
- **Uninstall:** remove the extension from OpenChamber, delete `TEAM.md`, and
  remove the Orchestra block from `AGENTS.md` if you no longer want the team
  instructions. Delete `.team.yml` to discard team definitions, and delete the
  data directory only if no activation service is running. Deleting the Lead
  session discards that run's stored state.

## Supported scope

- Supported: the OpenChamber desktop app, version 2.8.0 or later.
- The panel manifest does not declare the mobile workspace, and mobile use is
  not supported in 0.0.1.
- Web, VS Code, and direct OpenCode plugin installs are unsupported in 0.0.1.
- Role lists come from project-local `.opencode/agents` files only. Roles
  defined only in a global OpenCode configuration are not listed.

## Troubleshooting

| Message | Cause and fix |
|---|---|
| No eligible Team Lead agents found | no role file with `mode` `primary` or `all`; add one and refresh |
| No eligible member agents found | no role file with `mode` `subagent` or `all`; a solo team needs none |
| `Invalid .team.yml format: expected version: 1 and teams.` | the file was edited by hand; restore `version: 1` and a `teams:` list |
| activation shows no result in the panel | the service permission was denied; check the chat for the activation message |

## Security

Do not report vulnerabilities in public issues. Use the private channel
described in [SECURITY.md](SECURITY.md).

## Documentation

Documentation lives in `_docs` and is kept as history: earlier documents
describe decisions and designs as they were approved at the time. The
implemented behavior is the one described in this README.

| Document | Purpose |
|---|---|
| [GLOSSARY.md](GLOSSARY.md) | canonical team and work-planning terms |
| [_docs/guides/create-agent-roles.md](_docs/guides/create-agent-roles.md) | how to add role files the panel can list |
| [_docs/model/team-data-model.md](_docs/model/team-data-model.md) | the implemented team and assignment model |
| [_docs/team-data-model.md](_docs/team-data-model.md) | the earlier proposal for the work board, superseded by the model above |
| [_docs/adr/0001-do-not-integrate-openchamber-workflows.md](_docs/adr/0001-do-not-integrate-openchamber-workflows.md) | why Orchestra does not use OpenChamber Workflows |
| [_docs/runbooks/manage-child-sessions.md](_docs/runbooks/manage-child-sessions.md) | record of the OpenCode plugin API checks the implementation relies on |
| [_docs/runbooks/release-public-v0.0.1.md](_docs/runbooks/release-public-v0.0.1.md) | release procedure and gates for the public release |
| [_docs/planning/](_docs/planning/) | approved plans, including the extension plan and the public release plan |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Changes to this repository are accepted
under the MIT license.

## License

MIT © Domingo Scisci. See [LICENSE](LICENSE).
