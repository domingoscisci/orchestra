# Create agent roles for the Orchestra panel

The Orchestra panel lists the agents a team can use from your model's role
files. This guide explains where those files live, which fields the panel reads,
and how a file becomes eligible as a Team Lead or as a team member.

Version 0.0.1 ships no example roles: write the roles your project needs.

## Where role files live

Role files are Markdown files under `.opencode/agents/` in the project that
opens the panel.

- Files are found recursively, so subfolders are allowed.
- Only files ending in `.md` (case-insensitive) are read.
- The role id is the path below `.opencode/agents/` without the extension:
  `.opencode/agents/reviewer.md` has the id `reviewer`, and
  `.opencode/agents/api/reviewer.md` has the id `api/reviewer`.
- A file that has no frontmatter block is still listed, with the default values
  described below.

The panel reads project-local files only. Roles defined only in your global
OpenCode configuration do not appear in the list. In this repository
`.opencode/` is ignored by Git, so role files stay local to each working copy.

## Frontmatter fields

A file may start with a YAML frontmatter block between two `---` lines. The
panel reads these keys:

| Key | Type | Default | Effect |
|---|---|---|---|
| `name` | string | the role id | label shown in the panel for top-level roles |
| `description` | string | none | short explanation of the role |
| `mode` | `primary`, `subagent`, or `all` | `primary` | decides where the role can be used |
| `hidden` | boolean | `false` | hides the role from the panel when `true` |
| `disabled` | boolean | `false` | same as `hidden` |

`hidden` and `disabled` are alternatives; either one removes the role from the
list without deleting the file.

## Eligibility

| Panel position | Accepted `mode` values |
|---|---|
| Team Lead | `primary` or `all` |
| Team member | `subagent` or `all` |
| Domain Lead | any selected team member for that domain |

Because `mode` defaults to `primary`, a role file without frontmatter can be a
Team Lead but never a member. Set `mode: subagent` or `mode: all` for roles that
join a roster.

A nested role is shown by its id (`api/reviewer`), not by its `name`, so the two
ids must stay unique.

## Built-in roles

The panel always offers the built-in OpenCode agents, so a project can form a
team without writing any role file:

| Id | Mode |
|---|---|
| `build` | primary |
| `plan` | primary |
| `general` | subagent |
| `explore` | subagent |

A project role file with the same id replaces the built-in entry.

## Verify the result

1. Open the Orchestra panel in the project.
2. Open the team editor. The Team Lead list shows every role with `primary` or
   `all`; the member list shows every role with `subagent` or `all`.
3. If a list is empty, the panel reports that no eligible roles were found.
   Refresh after adding a file.

## Naming

Role labels and ids are stored in `.team.yml`, written into `TEAM.md`, and
included in team prompts. Keep them plain names: member names must be non-empty
and unique, and labels that contain line breaks or control characters are
rejected.
