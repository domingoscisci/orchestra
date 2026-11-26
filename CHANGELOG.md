# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
semantic versioning. Orchestra is distributed as an OpenChamber extension
through Git and ZIP archives; versions are Git tags, not npm releases.

## [Unreleased]

## [0.0.1] - 2026-11-26

First release of the Orchestra OpenChamber extension.

### Added

- OpenChamber extension package that bundles the panel, the OpenCode plugin,
  and the host service, installed from a repository folder or ZIP.
- Team setup panel that creates, edits, activates, and deletes teams in a
  versioned `.team.yml` file, with multiple teams per project, optional solo
  teams, and optional domains with one Domain Lead each.
- Team activation that sends the selected configuration to the current chat,
  validates it in the plugin, creates the team's sessions, and writes `TEAM.md`
  plus an Orchestra block in `AGENTS.md`, with a correlated activation result
  shown in the panel while it is open.
- Assignment lifecycle tools: `assign_task`, `acknowledge_task`, and
  `report_task`, with authorization limited to the Team Lead and the
  responsible Domain Lead.
- Team and session tools: `list_lead`, `list_agent`, `preview_team`,
  `activate_team`, `complete_team`, `create_agent`, `inspect_agent`,
  `send_message`, and `delete_agent`.
- Panel badge for the active team, restored for the active session when the
  panel is reopened.
- Documentation: README with install, first-run, permissions, data, update and
  uninstall, and support scope; role-file guide; release runbook; contributing
  guide; MIT license.

### Known limitations

- Supported only on the OpenChamber desktop app, version 2.8.0 or later. Web,
  mobile, VS Code, and direct OpenCode plugin installations are not validated
  in this release.
- Roles are listed from project-local `.opencode/agents` files only. No example
  roles are shipped; see `_docs/guides/create-agent-roles.md`.
- If the extension's service permission is denied, activation still works in
  the chat but the panel cannot display the correlated result.

### Earlier development

Design notes for the pre-extension installation path, the work-board proposal,
and the decisions that shaped this release remain in `_docs` and are kept as
accepted history. Where an older document describes a different installation
path or a design that was not implemented, this release follows the behavior
described in the README.

[Unreleased]: https://github.com/domingoscisci/orchestra/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/domingoscisci/orchestra/releases/tag/v0.0.1
