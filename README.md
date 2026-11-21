# OpenCode Orchestra

Orchestra adds team onboarding, background assignments to fixed roster members
with an acknowledgment/report lifecycle, and child-session management tools.

## OpenChamber extension

The extension embeds the OpenCode plugin and provides a panel for managing
multiple team configurations.
Build it with `npm run build:extension`, then install this repository folder
from Settings → Extensions → Add. The panel opts into OpenChamber's mobile
workspace; mobile service access and activation still depend on the connected
OpenChamber server and its permissions. Web compatibility is not yet validated;
VS Code and direct OpenCode hosts are out of scope.

The panel creates, edits, selects, activates, and deletes teams in the
repository's `.team.yml` file. The versioned YAML document can hold multiple
team definitions and contains no session state. Activating a team sends the
selected configuration to the current chat; the plugin validates it and
creates the sessions. The panel shows the correlated activation result while
open. Team runtime state remains in OpenCode plugin storage,
keyed by the Team Lead session ID. Orchestra creates or updates `TEAM.md` and
`AGENTS.md` when a team is activated.

Team Lead and member roles are selected from built-in roles and local Markdown
agent definitions under `.opencode/agents/` (including nested folders). Roles
defined only in the user's global OpenCode configuration are not currently
listed by the panel.

The `.team.yml` schema is versioned:

```yaml
version: 1
teams:
  - id: product-platform
    name: Product Platform
    solo: false
    lead:
      name: Team Lead
      agent: build
    roster:
      - name: API
        agent: general
    domains:
      - name: Backend
        lead: API
        members:
          - API
```

## Development

The plugin entry point is `src/index.ts`; shared helpers are in `src/core.ts`.
The extension UI lives in `panel/`; its bundled plugin is generated in
`plugin/`.

Run the helper tests with:

```sh
bun test
```

The package targets `@opencode/plugin` 2.2.6 and later compatible 2.x releases.

See the [runbook](_docs/runbooks/manage-child-sessions.md) for tool usage and
the OpenCode API workflow. The proposed persistent board model is documented in
the [team data model](_docs/team-data-model.md). The decision not to integrate
OpenChamber Workflows is recorded in
[ADR 0001](_docs/adr/0001-do-not-integrate-openchamber-workflows.md). The
approved extension plan is
[_docs/planning/0003-approved-orchestra-openchamber-extension.md](_docs/planning/0003-approved-orchestra-openchamber-extension.md).
