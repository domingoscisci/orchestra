---
description: Set up or complete an Orchestra team
---

Follow the `/team` action `$ARGUMENTS`.

For `setup`:

The generated TEAM.md must define the team, list each agent with its role and
description, show the hierarchy and domains, and state the operating rules in
plain language using MUST and MUST NOT. Do not expose internal invariant codes.

1. Ask which visible OpenCode agent definition should be the Team Lead. Use
   `orchestra.list_lead` to show each valid choice with its short description.
2. Ask whether the Team Lead will work alone. Otherwise, collect each
   participant's unique name and functional role, using
   `orchestra.list_agent` to show available roles with short descriptions.
   Roles may repeat.
3. Ask whether any participants should be Domain Leads. The Team Lead cannot
   lead a domain. For each domain, collect its name, one Domain Lead, and the
   participating roster members.
4. Show the complete roster, roles, generated acronyms, and domain membership.
   Generate acronyms from name initials, reserving `TL` for the Team Lead and
   adding numeric suffixes from `2` in roster order on collisions. Ask for
   explicit approval before making session changes. Correct invalid or
   duplicate names and show the revised summary for approval.
5. Call `orchestra.activate_team` with the approved roster, domains, Team Lead
   role, and `approved: true`. On first call, it checks for `TEAM.md` before
   making session changes. If it already exists, ask whether to overwrite it
   (recommended) or append the Orchestra rules, then retry with
   `teamGuideMode: "overwrite"` or `teamGuideMode: "append"`. Do not choose for
   the user. Do not create child sessions or switch agents before the user has
   approved both the roster and any required file handling.

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

For any other argument, explain that the supported actions are `setup` and
`done`.
