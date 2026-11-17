---
description: Set up, save, load, or complete an Orchestra team
---

Follow the `/team` action `$ARGUMENTS`.

For `save`:

Call `orchestra.save_team`. If it reports that `.team.yml` already exists, ask
whether to overwrite it; only after confirmation retry with `overwrite: true`.
Saving requires an active team. The file contains only the Team Lead role,
roster, and domains, not session IDs or runtime state.
The file uses the JSON-compatible subset of YAML emitted by the command.

For `load`:

Call `orchestra.load_team`. If it reports `exists: false`, explain that
`.team.yml` is missing and stop. Otherwise show the returned roster and domains
for approval. Do not activate a team until the user approves the summary. The
tool validates the file and current agent roles; report errors without changing
the file or creating sessions.

For `setup`:

1. Call `orchestra.load_team` with `forSetup: true`. It rejects an already
   active team; tell the user to close it with `/team done` before setting up
   another. If `.team.yml` is malformed, stop with the clear tool error. If the
   result includes `resumeError`, the saved config cannot be resumed (for
   example, it references a role no longer available). Use `question` to ask
   whether to start fresh with current roles; explain that the existing file
   stays untouched unless the new setup is approved. On no, cancel setup. If
   the config is valid and exists, use `question` to ask whether to resume it;
   on yes retain its config as the starting roster/domains, on no start fresh.
   The saved lead is an object with `name` and `agent`; pass `lead.agent` to
   tools that require the lead role ID and preserve `lead.name` for display.
   A decline cancels setup.
2. Call `orchestra.list_lead` and `orchestra.list_agent` for current OpenCode
   definitions. For every `team_setup_ui` call, detect the conversation
   language and provide its BCP 47 tag in `language`. Always put localized
   `title` and `step` (`{step}` is replaced with the current number) in `copy`;
   `description` is optional. Also provide these exact keys:
   - `lead`: `leadLabel`, `leadPlaceholder`, `soloLabel`, `continue`,
     `selectLeadError`, `leadSelected`
   - `agents`: `continue`, `addMember`, `nameLabel`, `removeMember`,
     `rosterError`, `rosterSelected`
   - `domains`: `addDomain`, `continue`, `domainPlaceholder`, `removeDomain`,
     `domainLead`, `leadPlaceholder`, `leadHint`, `domainError`,
     `domainsSelected`
   - `approval`: `domainLead`, `members`, `noDomains`, `guideAppend`,
     `guideOverwrite`, `hierarchy`, `domains`, `approve`, `approved`
   Translate agent descriptions for display; preserve IDs, configured names,
   and proper names. Localize copy values and submission summaries; do not use
   a fixed catalog.
   If `team_setup_ui` or `openchamber_render` is unavailable, use `question`
   for the complete setup. Call `orchestra.team_setup_ui` with `stage: "lead"`,
   both live agent lists, and the saved config when resuming. Pass its complete
   HTML result unchanged to `openchamber_render` by directly invoking the
   `render.page` action with `html`, a localized `title`, and
   `awaitAnswer: true`. Do not ask whether to invoke the renderer, and do not
   treat uncertainty about the tool as unavailability; attempt the call. Only
   use `question` if the direct tool call is unavailable or returns an error.
   The page collects the Team Lead and solo choice. A canceled page cancels
   setup.
3. Unless solo was selected, call `orchestra.team_setup_ui` with
   `stage: "agents"`, the live roster list, chosen lead, `solo: false`, the
   saved config when resuming, and localized `language` and `copy`. Pass the
   returned HTML unchanged in a direct `render.page` call to
   `openchamber_render`, with a localized `title` and `awaitAnswer: true`. The
   page collects roles,
   member names, and repeated members per role; its plus/minus controls do not
   submit until the user continues. If Render fails, collect the same roster
   with `question`. A canceled page cancels setup.
4. Unless solo was selected, call `orchestra.team_setup_ui` with
   `stage: "domains"`, the selected roster/config, and localized `language` and
   `copy`. Pass the returned HTML unchanged in a direct `render.page` call to
   `openchamber_render`, with a localized `title` and `awaitAnswer: true`.
   Collect
   domain names, members, and Domain Leads; no domains is valid. If Render
   fails, collect the same fields with `question`. A canceled page cancels
   setup.
5. If `TEAM.md` already exists, use `question` to ask whether to append the
   Orchestra rules or overwrite the file. Do not include this choice in either
   roster/domain page. If it does not exist, omit `teamGuideMode`.
6. Normalize solo mode to empty `roster` and `domains`, then call
   `orchestra.preview_team` with `lead`, `roster`, and `domains`. It validates
   current roles and returns the exact member names, roles, acronyms, parent
   hierarchy, and domains. Call `orchestra.team_setup_ui` with
   `stage: "approval"`, the final config, `teamGuideExists` (true or false), the chosen
   `teamGuideMode` when applicable, that exact preview, and localized
   `language` and `copy`. Pass the returned HTML unchanged in a direct
   `render.page` call to `openchamber_render`, with a localized `title` and
   `awaitAnswer: true`.
   This is the final step even for solo teams. Its page shows the hierarchy and
   domains and has the only approval button; approval submits `approved: true`
   and the displayed preview. If Render fails, show the same preview and use
   `question` for explicit final approval. A decline/cancel changes nothing. If
   preview validation fails, explain the error and correct the config before
   asking again.
7. Only after explicit final approval, call `orchestra.activate_team` with the
   exact approved `lead`, `roster`, `domains`, `teamGuideMode` when needed,
   `approved: true`, and `saveConfig: true`. If activation or saving fails,
   report the error and any incomplete rollback/session IDs; never claim
   success unless the tool confirms it.

The generated TEAM.md must define the team, list each agent with its role and
description, show the hierarchy and domains, and state the operating rules in
plain language using MUST and MUST NOT. Do not expose internal invariant codes.

On activation, create `TEAM.md` if absent, or apply the user's overwrite/append
choice if it exists. Include the activity title, every agent's configured
description, roles, domain membership, and reporting hierarchy. Put all
operating rules together in a dedicated Rules section, using MUST/MUST NOT and
no internal rule codes. Create `AGENTS.md` if absent; if it exists, preserve its
contents and append a single Orchestra team-guidance section unless that section
is already present.

An active team's structure cannot be replaced. If the user wants a different
team, close the active team with `/team done` first, then set up a new run.
Cancel without changes if the user declines. Report setup errors and any
session IDs that could not be rolled back.

For `done`, summarize that the current activity is complete and ask the user to
confirm closing the active team. Only after confirmation, call
`orchestra.complete_team` with `confirmed: true`.

For any other argument, explain that the supported actions are `setup`, `save`,
`load`, and `done`.
