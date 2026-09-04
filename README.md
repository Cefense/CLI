<div align="center">

# Cefense CLI

**Find, understand, and fix security vulnerabilities in your code. From your terminal, or from your agent.**

[![npm version](https://img.shields.io/npm/v/@cefense-npm/cefense-cli?color=0b7285&label=npm)](https://www.npmjs.com/package/@cefense-npm/cefense-cli)
[![node](https://img.shields.io/node/v/@cefense-npm/cefense-cli?color=0b7285)](https://nodejs.org)
[![types](https://img.shields.io/npm/types/@cefense-npm/cefense-cli?color=0b7285)](https://www.typescriptlang.org)
[![license](https://img.shields.io/npm/l/@cefense-npm/cefense-cli?color=0b7285)](./LICENSE)

[Install](#install) · [Quickstart](#quickstart) · [Commands](#commands) · [Agent mode](#agent-mode) · [Coding agents](#teaching-your-coding-agent) · [CI](#continuous-integration) · [Security](#where-your-credentials-live)

</div>

---

<!--
  DEMO VIDEO
  Record the terminal, drag the file into a GitHub issue or PR comment, and GitHub
  returns a https://github.com/user-attachments/assets/<id> URL.
  Replace the block below with that URL on its own line.
-->

<div align="center">

https://github.com/user-attachments/assets/REPLACE_WITH_UPLOADED_VIDEO

_`cf observed`, a generated patch, and a pull request, in under a minute._

</div>

---

## What this is

Cefense scans your repositories for vulnerabilities, joins each finding to the security research that explains it, and generates patches you can ship as pull requests.

This CLI is a complete alternative to the web workspace. Everything the GUI does against a real API route, this does too: connect repositories, run scans, browse findings, read the research behind them, generate a patch, review the diff, and open the pull request.

It talks only to the Cefense public API. It never reaches into a database, and it ships with no client secret and no baked-in endpoints.

## Install

```sh
npm install -g @cefense-npm/cefense-cli
```

Requires **Node 22.12 or newer**. Both `cefense` and `cf` are installed and are the same binary. Every example below uses the short one.

<details>
<summary>Other package managers</summary>

```sh
pnpm add -g @cefense-npm/cefense-cli
yarn global add @cefense-npm/cefense-cli
bun add -g @cefense-npm/cefense-cli
```

Or run it without installing. The package name differs from both binaries, so `-p` is required:

```sh
npx -p @cefense-npm/cefense-cli cf status
```

</details>

## Quickstart

```sh
cf auth login                 # sign in through your browser
cf repo connect               # pick a repository and watch its first scan
cf observed                   # browse what the scan found
cf skill install              # teach your coding agent to do all of the above
```

From the findings view, press `g` to generate a patch and `p` to open a pull request. You never leave the finding you are reading.

## Commands

### Authentication

| Command | What it does |
| --- | --- |
| `cf auth login` | sign in through your browser using OAuth2 with PKCE |
| `cf auth logout` | revoke the token at the identity provider and forget it |
| `cf auth status` | who you are, where the token lives, what you are entitled to |

`cf auth logout --all` signs out of every stored instance. `cf auth login --force` signs in again over an existing session.

### Repositories

| Command | What it does |
| --- | --- |
| `cf repo connect [owner/name]` | connect a GitHub repository and follow its first scan |
| `cf repo list` | connected repositories, their scan state and finding counts |
| `cf repo set-default [owner/name]` | choose the repository this directory acts on |
| `cf repo disconnect [owner/name]` | disconnect one repository |
| `cf repo disconnect --account` | disconnect the GitHub account entirely |

`cf repo set-default --unset` clears the link for the current directory. `cf repo connect --no-watch` queues the scan without following it.

### Findings and fixes

| Command | What it does |
| --- | --- |
| `cf status` | the dashboard: repositories, live scan progress, finding counts |
| `cf scan` | rescan a repository and watch it run |
| `cf observed` | browse every finding in your code |
| `cf observed show <finding-id>` | one finding in full, with research, data flow and references |
| `cf matched` | only the findings joined to the research that explains them |
| `cf fix` | browse findings and their patches side by side |
| `cf fix show <finding-id>` | the patch generated for one finding |
| `cf fix generate <finding-id>` | generate a patch, `--wait` to block until it is ready |
| `cf fix publish <finding-id>` | open a pull request with a generated patch |

Findings and fixes are the same data from two angles. `cf observed` carries the same `g` and `p` keys as `cf fix`, so you can patch a vulnerability without switching views.

### Coding agents

| Command | What it does |
| --- | --- |
| `cf skill install [agents...]` | write the Cefense skill into every coding agent detected here |
| `cf skill list` | every supported agent, where it writes, what is installed |
| `cf skill show [agent]` | print the skill without writing it anywhere |
| `cf skill uninstall [agents...]` | remove it again, including the section it added |

`cf skill` on its own installs. See [Teaching your coding agent](#teaching-your-coding-agent).

## Interactive by default

Every browsing command opens a full-screen view.

| Key | Action |
| --- | --- |
| `up` `down`, or `k` `j` | move through the list |
| `enter` | open the detail pane |
| `left` `right` | previous and next item, from inside the detail pane |
| `/` | filter as you type |
| `pageup` `pagedown` `home` `end` | jump |
| `q` or `escape` | close the pane, then leave |

Single keys act on whatever is selected. Labels are context aware, so a finding whose pull request is already open offers `view pull request` rather than `open pull request`.

| Key | Where | Action |
| --- | --- | --- |
| `g` | `observed`, `matched`, `fix` | generate a patch, or regenerate, or retry |
| `p` | `observed`, `matched`, `fix` | open the pull request, or view it |
| `o` | `observed`, `matched` | open the file on GitHub |
| `a` | `observed`, `matched` | read the research behind the finding |
| `u` | `fix` | refresh |
| `f` `r` `o` `d` `c` | `status` | findings, rescan, open, set default, connect |

Publishing always requires typing the repository name to confirm. There is no accidental pull request.

## Agent mode

`--agent` turns the CLI into a machine interface. It is the supported way for a coding agent (Claude Code, Cursor, Codex, or your own) to drive Cefense.

```sh
cf observed --repo acme/api --agent
```

It implies `--json --no-color --no-link`, forces non-interactive so the full-screen view can never open, silences all progress output, and prints exactly **one line of JSON on stdout**. It does **not** imply `--yes`.

### Response envelope

Success:

```json
{
  "schemaVersion": 1,
  "ok": true,
  "command": "observed",
  "data": { "repository": "acme/api", "total": 32, "counts": { "critical": 5, "high": 14 }, "findings": [] },
  "next": ["cf observed show <id> --repo acme/api --agent", "cf fix generate <id> --wait --agent"]
}
```

Failure, on stdout as well, so an agent never has to parse prose from stderr:

```json
{
  "schemaVersion": 1,
  "ok": false,
  "command": "fix publish",
  "error": {
    "code": "confirmation_required",
    "message": "Publishing opens a real pull request on GitHub.",
    "remedy": "Pass --yes to confirm: cf fix publish <id> --yes",
    "exitCode": 2
  }
}
```

The `next` array names real commands that act on what was just returned, so an agent is handed its next step instead of guessing at one.

### A complete agent workflow

```sh
cf auth status --agent                            # 3 if not signed in
cf observed --repo acme/api --agent               # ids, severities, counts
cf observed show <finding-id> --agent             # one finding, in full
cf fix generate <finding-id> --wait --agent       # blocks until ready or failed
cf fix publish <finding-id> --yes --agent         # opens the pull request
```

### Error codes

Stable across releases. Match on `error.code`, never on `error.message`.

| Code | Exit | Meaning |
| --- | --- | --- |
| `auth_required` | 3 | not signed in |
| `usage_error` | 2 | a flag or argument is missing or wrong |
| `invalid_severity` | 2 | unrecognised value passed to `--severity` |
| `invalid_category` | 2 | unrecognised value passed to `--category` |
| `finding_not_found` | 2 | no such finding in the latest scan |
| `fix_not_found` | 2 | no patch has been generated yet |
| `fix_not_ready` | 2 | the patch is not in a publishable state |
| `fix_in_progress` | 2 | a patch is already generating |
| `confirmation_required` | 2 | a destructive action needs `--yes` |
| `feature_required` | 4 | the account lacks the required feature pack |
| `api_error` | 4 | the Cefense API returned an error |
| `cancelled` | 130 | interrupted |
| `unknown_target` | 2 | `cf skill install` was given an agent it does not know |
| `global_unsupported` | 2 | `--global` used with an agent that has no user-wide location |
| `skill_missing` | 4 | the bundled skill is absent, reinstall the package |
| `internal_error` | 4 | unexpected failure |

### Notes for agents

- **Signing in blocks.** `cf auth login` opens a browser and waits for the loopback callback, which is inherent to OAuth2 with PKCE. Run it in the background, read the sign-in URL from **stderr**, surface it to the user, then poll `cf auth status --agent`.
- **Publishing is gated.** `cf fix publish` refuses with `confirmation_required` unless `--yes` is passed. Treat that as a decision for the user, not a flag to add automatically.
- **Pass `--repo owner/name`** to skip the directory-linking prompt entirely.
- **Payloads are compact.** Null and internal fields are stripped, and heavy fields are summarised. The same 32 findings are 45 KB under `--json` and 18 KB under `--agent`.

## Teaching your coding agent

Cefense ships the instructions an agent needs to drive it, and `cf skill install` writes them where each tool actually looks.

```sh
cf skill install
```

With no arguments it detects the agents configured in the repository and writes to all of them. If it detects none, it writes `AGENTS.md`.

| Agent | Where it writes |
| --- | --- |
| Claude Code | `.claude/skills/cefense/SKILL.md` |
| Cursor | `.cursor/rules/cefense.mdc` |
| GitHub Copilot | `.github/instructions/cefense.instructions.md` |
| Google Antigravity | `.agents/rules/cefense.md` |
| Windsurf | `.windsurf/rules/cefense.md` |
| Devin Desktop | `.devin/rules/cefense.md` |
| Cline, Roo Code | `.clinerules/cefense.md` |
| Gemini CLI | `GEMINI.md` |
| Codex, Amp, OpenCode, Jules | `AGENTS.md` |

Each file is written in the format that tool expects: Agent Skills frontmatter for Claude Code, MDC with `alwaysApply: false` for Cursor, `applyTo` for Copilot, a `model_decision` trigger for Windsurf and Devin.

`AGENTS.md` and `GEMINI.md` are shared files, so they get a short delimited section rather than the whole document, and the full guide lands at `.cefense/SKILL.md` alongside it. Reinstalling replaces that section in place, and `cf skill uninstall` removes it and leaves the rest of the file untouched.

```sh
cf skill list                    # what is supported, what is detected, what is installed
cf skill install claude cursor   # name them instead of detecting
cf skill install --all           # every supported agent
cf skill install --global        # for your user: claude, gemini, agents
cf skill show cursor             # print it, write nothing
cf skill uninstall               # remove all of it
```

The files it writes are part of the repository and belong in a commit. They are managed, so hand edits are replaced on the next install.

For onboarding an agent that has never seen Cefense at all, point it at <https://cefense.com/skill.md>. That document installs the CLI, signs the user in, connects the repository, and finishes by running `cf skill install`.

## Scripting

Three output modes, in order of precedence:

```sh
cf observed --agent                    # one line of JSON, envelope, stable contract
cf observed --json                     # pretty-printed raw API response
cf observed | grep critical            # tab-separated lines when piped
```

`--json` gives you the unmodified API payload for exploration:

```sh
cf observed --json | jq '.findings[] | select(.severity == "critical") | .filePath'
cf repo list --json  | jq -r '.[].fullName'
```

Anything that would prompt fails with exit code 2 and names the flag that would have answered it, so nothing hangs.

## Continuous integration

Set `CEFENSE_TOKEN` instead of signing in. It is read from the environment and never written to disk.

```yaml
- name: Cefense security scan
  env:
    CEFENSE_TOKEN: ${{ secrets.CEFENSE_TOKEN }}
  run: |
    npm install -g @cefense-npm/cefense-cli
    cf scan --repo ${{ github.repository }}
    cf observed --repo ${{ github.repository }} --severity critical,high --exit-code
```

`--exit-code` returns 1 when a critical or high finding is present, which fails the job.

## Severity vocabulary

Cefense displays four severities. The wire values differ, and filters accept both.

| Displayed | Wire value | `--severity` accepts |
| --- | --- | --- |
| Critical | `critical` | `critical` |
| High | `high` | `high` |
| Watch | `medium` | `watch`, `medium` |
| Info | `low` | `info`, `low` |

Under `--agent`, every finding carries both `severity` (the wire value, so filters round-trip) and `severityLabel` (what a human should be told).

## Linking a directory to a repository

`observed`, `matched`, `fix` and `scan` act on one repository. The first time you run any of them in a directory, the CLI asks which one and remembers the answer:

```
  This directory is not linked to a Cefense repository.
  /Users/you/code/api
  git remote  acme/api

  How should this directory resolve?
  > Link this directory to acme/api        matches your git remote
    Link to a different repository
    Just this once
```

Resolution order, first match wins:

1. `--repo owner/name`
2. `CEFENSE_REPO`
3. the link stored for this directory
4. the prompt above, seeded from your git remote

"Just this once" resolves without remembering. `--no-link` does the same non-interactively, and `--repo` skips the question entirely. `cf repo set-default` sets the link ahead of time and `--unset` clears it.

`cf status` and `cf repo list` are not scoped to one repository, so they never ask.

## Configuration

| Variable | Effect |
| --- | --- |
| `CEFENSE_API_URL` | the Cefense instance to talk to, default `https://cefense.com` |
| `CEFENSE_REPO` | the repository to act on, same as `--repo` |
| `CEFENSE_TOKEN` | an access token to use instead of the keychain, never persisted |
| `NO_COLOR` | disable colour |
| `FORCE_COLOR` | keep colour when piping |

Global flags, available on every command:

| Flag | Effect |
| --- | --- |
| `--api-url <url>` | override the instance for one invocation |
| `--repo <owner/name>` | override the repository for one invocation |
| `--json` | emit the raw API response as pretty JSON |
| `--agent` | machine mode, see [Agent mode](#agent-mode) |
| `--no-color` | disable colour |
| `--verbose` | print a stack trace on failure |
| `-y, --yes` | skip confirmation prompts |
| `--no-link` | resolve the repository without remembering it |
| `-v, --version` | print the version |
| `-h, --help` | print help for any command |

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | success |
| 1 | findings present, with `--exit-code` |
| 2 | usage error, including a prompt that could not be shown |
| 3 | not signed in |
| 4 | the API returned an error |
| 130 | interrupted |

## Programmatic use

`src/core` is presentation-free and published as a subpath export, so you can build on the same client, credential store and repository resolution the CLI uses:

```ts
import { openSession, CefenseClient } from "@cefense-npm/cefense-cli/core";

const session = await openSession({}, { auth: true });
const { findings } = await session.client.findings(githubRepoId, { severity: "critical" });
```

This is the foundation the Cefense MCP server is built on.

## Development

```sh
git clone https://github.com/Cefense/CLI.git
cd CLI
npm install
npm run check-types
npm test
npm run build
npm link            # cf is now on your PATH
```

Run against a local backend:

```sh
cf status --api-url http://localhost:3001
```

| Script | What it does |
| --- | --- |
| `npm run build` | compile to `dist` |
| `npm run watch` | compile on change |
| `npm run check-types` | type-check without emitting |
| `npm test` | compile tests and run them with `node --test` |

## License

MIT. See [LICENSE](./LICENSE).
