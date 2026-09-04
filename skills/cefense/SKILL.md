---
name: cefense
description: Find, understand, and fix security vulnerabilities in this repository using the Cefense CLI. Use when asked to run a security scan, check this repository for vulnerabilities or CVEs, triage or explain security findings, generate a patch for a vulnerability, or open a pull request that fixes one.
license: MIT
metadata:
  version: 1
  homepage: https://cefense.com
---

# Cefense

Cefense scans this repository, reports the vulnerabilities in its code, joins each one to the public security research that explains it, writes a patch, and opens a pull request. You drive all of it with the `cf` command.

## When to reach for it

Use Cefense when the question is about the security of this repository as it actually stands:

- "is this repo vulnerable", "run a security scan", "are there any CVEs here"
- "triage these findings", "what should I fix first"
- "why is this a vulnerability", "show me how it is reached"
- "fix that finding", "open a pull request for it"
- before a release, or when reviewing a dependency bump

Do not use it to grade code you are writing right now, and do not use it as a linter. It reports on what was committed and scanned, not on the working tree.

If `cf` is not installed or this repository is not connected, follow https://cefense.com/skill.md first.

## The contract

Pass `--agent` to every command. It prints exactly one line of JSON to stdout, never opens the interactive view, and never asks a question.

```json
{"schemaVersion":1,"ok":true,"command":"observed","data":{"...":"..."},"next":["cf fix generate <id> --wait --agent"]}
{"schemaVersion":1,"ok":false,"command":"fix publish","error":{"code":"confirmation_required","message":"...","remedy":"...","exitCode":2}}
```

- Branch on `error.code`. Never match on `error.message`, which is written for people and will change.
- `next` names real commands that act on what was just returned. Prefer them over commands you compose.
- Pass `--repo owner/name` every time. `--agent` deliberately remembers no default for the working directory.
- Exit codes: `0` fine, `1` findings present under `--exit-code`, `2` usage, `3` not signed in, `4` API failure, `130` interrupted.

## Vocabulary

**Observed** is something real in this repository's code. **Matched** is an Observed finding joined to the research that explains it. **Fix** is a patch for one finding, and the pull request that carries it.

Severities read as Critical, High, Watch, Info. On the wire they are `critical`, `high`, `medium`, `low`, and filters take either spelling. Findings carry both `severity` (the wire value) and `severityLabel` (what to tell a person).

## The loop

### List

```sh
cf observed --repo acme/api --agent
cf observed --repo acme/api --severity critical,high --agent
cf matched --repo acme/api --agent
```

`data.findings` arrives worst first. `data.counts` breaks the total down by wire severity. Each entry carries `id`, `severity`, `severityLabel`, `title`, `file`, `line`, `category`, `cve`, `cwe`, `description`, `guidance`, `matchedSources`, and the state of any `fix`.

Filters: `--severity critical,high,watch,info`, `--category code,dependency,secret,misconfig,os-package`, `--limit <n>` (1 to 1000), `--exit-code` to exit `1` when any Critical or High is present.

`cf matched` is the sharper list. Those findings have research behind them, so they are the ones you can explain rather than merely report.

### Read one in full

```sh
cf observed show <finding-id> --repo acme/api --agent
```

Adds the vulnerable code, the data flow from source to sink, the research that matched with its rationale, the references, and the patch if one exists.

Read this before forming an opinion. The listing is a summary, not evidence. In particular, read `dataflow`: `source` and `sink` say how untrusted input reaches the dangerous call, `steps` walks the path, and `ineffectiveSanitizers` names guards that look protective but are not. That is what tells you whether a finding is reachable in practice.

### Patch

```sh
cf fix generate <finding-id> --wait --agent
cf fix show <finding-id> --agent
```

`--wait` polls until settled, up to about three minutes. Without it you get `generating` back and poll `cf fix show` yourself. Statuses: `generating`, `ready`, `failed`, `skipped`, `publishing`, `opened`.

When `ready`, `data.fix.diff` holds the unified diff, `data.fix.explanation` says why, and `data.fix.file` names the one file it touches. Read the diff. A generated patch is a proposal. Saying it is wrong, incomplete, or fixes the symptom rather than the cause is a useful answer, and better than passing it along.

### Publish, only when asked

```sh
cf fix publish <finding-id> --yes --agent
```

**This opens a real pull request on the user's GitHub repository.** Without `--yes` it refuses with `confirmation_required`, and that gate exists so an agent cannot open pull requests on its own initiative.

Ask the user in this conversation first, and show them the diff and the file. `--yes` is not a flag to add because a command failed. If a pull request is already open you get `{"alreadyOpen":true,...}` with the existing `prUrl`, not a duplicate.

### Rescan

```sh
cf scan --repo acme/api --agent
cf status --agent
```

`cf scan` queues a scan and returns its `scanId` at once. Poll `cf status --agent` and read `scan.status` on the repository: `queued`, `running`, `completed`, `failed`. Rescan after merging a fix, not before, and remember finding ids belong to a scan: after a rescan, list again rather than reusing old ids.

## Working efficiently

- **Start narrow.** `--severity critical,high` on a large repository, then widen. Whole-repository listings are the biggest payload the CLI produces.
- **Do not re-list to refresh one row.** `cf observed show <id>` and `cf fix show <id>` are cheap and current.
- **Follow `next`.** It is computed from the state you just fetched, so it already knows whether a fix exists.
- **Batch the reading, serialise the writing.** Read as many findings as you need, then generate patches one at a time so the user can judge each.
- **Use `--exit-code` in CI**, never string matching on output.
- **Report `severityLabel`, filter on `severity`.** Telling a user something is "medium" when the product says Watch is wrong.

## Error codes

| `error.code` | Exit | What to do |
| --- | --- | --- |
| `auth_required` | 3 | not signed in, see https://cefense.com/skill.md |
| `usage_error` | 2 | read `remedy`, it names the fix |
| `invalid_severity` | 2 | use critical, high, watch, or info |
| `invalid_category` | 2 | use code, dependency, secret, misconfig, or os-package |
| `finding_not_found` | 2 | the id is not in the latest scan, list again |
| `fix_not_found` | 2 | generate the patch first |
| `fix_not_ready` | 2 | the patch is not `ready`, check its status |
| `fix_in_progress` | 2 | one is already generating, poll instead of starting another |
| `confirmation_required` | 2 | ask the user, then pass `--yes` |
| `feature_required` | 4 | the account does not include this, tell the user |
| `api_error` | 4 | the API failed, retry once, then report it |
| `internal_error` | 4 | report it, with the message |

## Rules

- Never run `cf fix publish` without the user agreeing to it in this conversation.
- Never invent a finding id, a severity, a CVE, or an exploit path. All of it comes from the JSON.
- Never edit a file to silence a finding instead of fixing it, and never suppress or filter a finding away to make a report look better.
- Never ask for a token or write credentials to a file. The CLI keeps its token in the operating system keychain.
- If something is not in the JSON, say so instead of filling the gap.

Full documentation: https://cefense.com/docs
