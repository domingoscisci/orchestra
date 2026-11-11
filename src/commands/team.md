---
description: Set up or complete an Orchestra team
---

Follow the `/team` action `$ARGUMENTS`.

For `setup`:

1. Ask which visible OpenCode agent definition should be the Team Lead. Use
   `orchestra.list_lead` to show each valid choice with its short description.
2. Ask whether the Team Lead will work alone. Otherwise, collect each
   participant's unique name and functional role, using
   `orchestra.list_agent` to show available roles with short descriptions.
   Roles may repeat.
3. Ask whether any participants should be Domain Leads. The Team Lead cannot
   lead a domain. For each domain, collect its name, one Domain Lead, and the
   participating roster members.
4. Show the complete roster, roles, and domain membership. Ask for explicit
   approval before making session changes. Correct invalid or duplicate names
   and show the revised summary for approval.
5. On approval, call `orchestra.activate_team` with the complete roster,
   domains, Team Lead role, and `approved: true`. Do not create child sessions
   or switch agents before approval.

If a team is already active, explain that replacing it requires confirmation.
Cancel without changes if the user declines. Report setup errors and any
session IDs that could not be rolled back.

For `done`, summarize that the current activity is complete and ask the user to
confirm closing the active team. Only after confirmation, call
`orchestra.complete_team` with `confirmed: true`.

For any other argument, explain that the supported actions are `setup` and
`done`.
