# Security policy

## Supported versions

Security fixes are applied to the latest released version. Orchestra ships as
an OpenChamber extension through Git and ZIP archives; versions are Git tags,
not npm releases.

| Version | Supported |
|---|---|
| 0.0.1 | yes |
| earlier | no |

## Reporting a vulnerability

Do not open a public issue, discussion, or pull request for a security problem.

Send a private report to **security.regain404@silomails.com** with:

- the affected version, or the commit you built from;
- the installed OpenChamber version and, if it matters, the host operating
  system;
- what you did, what happened, and what you expected;
- the smallest reproduction you can produce, with secrets removed.

You get a first reply within 7 days. If the report is accepted, the fix ships
in the next release and the report is credited unless you ask otherwise. If
the report is rejected, you get the reason.

## Scope

In scope:

- the plugin tools that create, activate, complete, and delete teams or agents;
- the boundary between repository-controlled files (`.team.yml`, `TEAM.md`,
  `AGENTS.md`) and agent instructions;
- the panel and service request handling;
- anything that lets one agent act outside its assigned scope.

Out of scope:

- actions the same user can already take through a local shell or the OpenCode
  API; those are trusted by design;
- vulnerabilities in OpenChamber, OpenCode, or the models themselves: report
  those upstream;
- team configurations and role prompts that produce poor output without a
  privilege or data boundary being crossed.

## What Orchestra stores

Team definitions live in `.team.yml` in the project. Runtime state, including
the audit history the panel shows, stays in the local plugin storage. Nothing
is uploaded by Orchestra; prompts are sent to whichever model provider the host
is configured with.
