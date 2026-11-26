# Release runbook: public v0.0.1

Ordered procedure for publishing the first public release of Orchestra. It
implements plan 0005. Every destructive or visible step needs its own explicit
owner approval; the runbook lists them as gates.

Ownership: the Git Workflow Master runs the Git, tag, and visibility steps; the
Technical Writer owns the public documentation; the Application Security
Engineer owns the security verdict; the Test Results Analyzer owns test and
smoke evidence; the Team Lead consolidates the go/no-go decision.

## Rules

- The repository stays private until gate 6 is approved.
- Silence is not approval. Record each approval with date and scope.
- If any check fails, stop at the current gate. Do not continue and fix later.
- Evidence uses the plan 0005 format:
  `AC ID | command/test | result | producer | date`.

## Gate 0: preconditions

- [x] Plan 0005 is approved and the owner decisions are recorded.
- [ ] An access-controlled backup of the current repository exists outside the
      working tree.
- [x] The full ref inventory is recorded, including what will not be published
      (`experiment/plugin-storage` is excluded).
- [x] Security and Code-of-Conduct contacts are supplied, so `SECURITY.md` and
      `CODE_OF_CONDUCT.md` can be completed.
- [x] The OpenChamber version actually smoke-tested is recorded, so the README
      support scope and `engines.openchamber` can state it.

## Gate 1: public surface

- [x] `LICENSE` (MIT, Domingo Scisci), `README.md`, `CHANGELOG.md`,
      `CONTRIBUTING.md`, and the role-file guide are present.
- [x] `SECURITY.md` and `CODE_OF_CONDUCT.md` are present with real contacts.
- [x] `package.json` carries `license`, `repository`, `homepage`, `bugs`,
      `author`, `description`, and version `0.0.1`.
- [x] Every relative link resolves. List every target and check it against the
      tree:

  ```sh
  git ls-files -co --exclude-standard '*.md' |
    xargs grep -on '](\([^)]*\))'
  ```

- [x] No README claim names a host that was not smoke-tested, and the mobile
      claim matches the recorded result.
- [x] `.gitignore` covers `.env`, `.env.*`, private keys, certificates,
      `.npmrc`, `.netrc`, logs, and the local team artifacts. Verify:

  ```sh
  git check-ignore -v .env .team.yml AGENTS.md TEAM.md
  ```

- [x] No local roster, session id, token or cost record, absolute path, or
      internal session URL remains in a file intended for publication.

## Gate 2: code and security

- [ ] The high and medium findings are fixed by code controls, with tests that
      fail on the pre-fix implementation.
- [ ] Treat Bun `moderate` advisories as medium-band findings for this gate;
      no open moderate advisory may be silently downgraded to a warning.
- [x] The adversarial prompt-injection set passes (25 hostile handoff values
      plus a saved-YAML round trip).
- [ ] The Application Security Engineer records PASS; the independent rescan is
      clean. Record the owner-reported M3 host evidence in plan 0005, but do not
      substitute it for the post-rebuild ASE verdict or ACSA rescan.
- [ ] No unresolved high or medium finding remains.

## Gate 3: build and regression

Run from a clean checkout after source changes stop. The generated bundles must
be included in the reviewed candidate commit before comparing them:

```sh
bun install --frozen-lockfile
bun test
bun run build:extension
git diff --exit-code panel/main.js plugin/index.js service/main.js
```

- [ ] Tests pass and the three generated bundles match a clean frozen build
      byte for byte. Earlier local results do not validate the current source;
      plugin and service bundles currently lag their sources.
- [x] Desktop smoke: install, activation, badge restoration, permission
      approval/denial, and child-parent association passed on OpenChamber 2.8.0
      / OpenCode 2.3.2 (user-reported, 2026-11-25).
- [ ] Record the exact final shared data-directory path; timeout and
      unavailable-service UI states remain unverified.
- [ ] After the first workflow run exposes the check names, configure the agreed
      required checks on `main`. Do not require checks before the PR merge if
      that would block the merge.

### SMOKE-001 pre-PR history cleanup

The owner selected cleanup before opening the PR because commit `b808350`
is an ancestor of both `main` and `feature/openchamber-extension`. The three
SMOKE-001/test-prompt paths have been removed from an isolated local rewrite
of those refs and verified absent from their reachable objects. The
owner-provided noreply address was also applied to all author and committer
identities on both target refs and verified. After explicit owner approval,
both rewritten refs were atomically force-pushed to the still-private GitHub
repository. PR #1 is open; no merge or visibility change has occurred.

## Gate 4: release candidate on main

- [ ] The extension work is integrated through a pull request that preserves
      the commits, without squashing.
- [ ] The owner approves the merge and the push.
- [ ] Required checks are green on the merged `main`.

## Gate 5: history rewrite while private

- [ ] The owner approves the rewrite and force-push in writing.
- [ ] The merged state has a fresh verified backup.
- [ ] Pushes are frozen; a single operator runs the rewrite window.
- [ ] Operational data and the commit author email are replaced on every ref
      intended for publication.
- [ ] Only `main` is exposed; `experiment/plugin-storage` is excluded.

Verify from a fresh clone of the rewritten state:

```sh
git clone --mirror git@github.com:domingoscisci/orchestra.git audit.git
git -C audit.git log --all --format='%an <%ae>' | sort -u
git -C audit.git rev-list --all | xargs git -C audit.git grep -I -n -E \
  'ses_[A-Za-z0-9]+|/Users/|total_tokens'
```

- [ ] Author lines use the approved noreply address.
- [ ] The history scan returns no excluded data.
- [ ] Branch protection requires the agreed checks and blocks force-push and
      deletion.

## Gate 6: tag and release, still private

- [ ] `package.json` reads `0.0.1` on the exact `main` commit to be tagged.
- [ ] The owner approves the tag and release.
- [ ] An annotated tag is created on that commit:

  ```sh
  git tag -a v0.0.1 -m "Orchestra v0.0.1"
  git push origin v0.0.1
  ```

- [ ] Release notes state the supported hosts, the declared minimum
      OpenChamber version, and the known limitations from the changelog.
- [ ] The tag SHA equals the checked `main` SHA, and the tag is scanned again
      before the visibility gate.

## Gate 7: public visibility

- [ ] The owner approves the visibility change in writing.
- [ ] The Team Lead presents the consolidated go/no-go with evidence per
      acceptance criterion.
- [ ] The repository is made public last. No other step happens in the same
      window.

## Gate 8: post-publication verification

```sh
git clone https://github.com/domingoscisci/orchestra.git /tmp/orchestra-check
cd /tmp/orchestra-check && git checkout v0.0.1 && bun test
```

- [ ] An anonymous clone and the ZIP for `v0.0.1` install as an OpenChamber
      extension without an npm step.
- [ ] The documented first-run flow works on the supported host.
- [ ] Links in the published README resolve on GitHub.

## Abort and recovery

- Any failed check: stop the run, keep the repository private, and record the
  failure with its evidence.
- Failed or partial rewrite: do not continue. Restore only from the verified
  backup and re-audit every ref.
- Unexplained bundle diff: inspect source and generated diffs, regenerate only
  from reviewed source, rerun the gates, and obtain review.
- Desktop permission or smoke failure: narrow the supported claim in the README
  and block the release.
- Accidental public visibility: treat the exposure as permanent, contain the
  issue, record what was exposed, and assume copies exist. Rotate a credential
  only if one is found.
