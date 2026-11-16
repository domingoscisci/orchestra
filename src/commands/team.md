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
   A decline cancels setup.
2. Call `orchestra.list_lead` and `orchestra.list_agent` for current OpenCode
   definitions. Use `question` for two choices: the Team Lead from the live
   lead list, and whether that lead works alone. If resuming a saved config,
   show its current lead as context but still collect the user's explicit
   choice. On solo, normalize roster and domains to empty and skip steps 3–4.
3. For a non-solo team, call `orchestra.team_setup_ui` with `stage: "agents"`,
   the live lead/roster lists, the chosen lead, `solo: false`, and the saved
   roster if resuming. Pass the complete returned HTML string unchanged to
   `openchamber_render` with `awaitAnswer: true`. This is a new request/page
   using the project mockup for role selection and member names. Its
   `Continua ai domini` button submits only the selected roster and lead;
   `answered: false` cancels. If Render is unavailable, collect role choices
   and each unique member name with `question`. Do not call Render with
   explanatory text instead of the returned HTML.
4. Use a second, new `team_setup_ui` request with `stage: "domains"` and the
   roster returned in step 3. Pass its returned HTML unchanged to a new
   `openchamber_render` call with `awaitAnswer: true`. Collect the domain names,
   members, and Domain Leads; no domains is valid. If Render fails, collect the
   same fields with `question`. A canceled page cancels setup.
5. If `TEAM.md` already exists, use `question` to ask whether to append the
   Orchestra rules or overwrite the file. Do not include this choice in either
   roster/domain page. If it does not exist, omit `teamGuideMode`.
6. Normalize solo mode to empty `roster` and `domains`, then call
   `orchestra.preview_team` with `lead`, `roster`, and `domains`. It validates
   current roles and returns the exact member names, roles, acronyms, parent
   hierarchy, and domains. Call `orchestra.team_setup_ui` a third time with
   `stage: "approval"`, the final config, `teamGuideExists`, the chosen
   `teamGuideMode` when applicable, and that exact preview. Pass the returned
   HTML unchanged to a new `openchamber_render` call with `awaitAnswer: true`.
   Its final page shows the hierarchy and domains and has the only approval
   button; approval submits `approved: true` and the displayed preview. If
   Render fails, show the same preview and use `question` for explicit final
   approval. A decline/cancel changes nothing. If preview validation fails,
   explain the error and correct the config before asking again.
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
