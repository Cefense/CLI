---
name: cefense
description: Find, understand, and fix security vulnerabilities in this repository using the Cefense CLI. Use when asked to run a security scan, check this repository for vulnerabilities or CVEs, triage or explain security findings, generate a patch for a vulnerability, or open a pull request that fixes one.
license: MIT
metadata:
  version: 2
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

### Merge, only when asked

```sh
cf fix merge <finding-id> --yes --agent
```

Merges the pull request and deletes its branch. `--method merge|squash|rebase` picks the strategy, squash by default, and `--no-delete-branch` keeps the branch. Always pass the finding id under `--agent`: with none, and no terminal to prompt in, it fails with `usage_error`.

**This lands code on the default branch.** It carries the same `--yes` gate as publishing, for the same reason, and it is a larger step than opening a pull request. Ask separately: agreeing to open a pull request is not agreeing to merge it.

It refuses rather than forcing its way past anything: `pull_request_blocked` when a required review or status check is pending, `pull_request_conflicted` on conflicts, `pull_request_draft` on a draft, `pull_request_closed` if it was closed unmerged. Branch protection is respected, not bypassed. Report the code and stop.

### Rescan

```sh
cf scan --repo acme/api --wait --agent
```

`--wait` blocks until the scan settles, up to about ten minutes, and returns `status`, `findings`, and `error`. Without it you get the `scanId` immediately and have to poll `cf status --agent` yourself.

Rescan after merging a fix, not before. Finding ids belong to a scan, so after a rescan list again rather than reusing old ids.

### Scan a branch other than the default

```sh
cf branches --repo acme/api --agent
cf scan --repo acme/api --branch release/2.4 --wait --agent
cf observed --repo acme/api --branch release/2.4 --agent
```

`cf branches` lists every branch GitHub shows, each with the last scan of that branch: `scanId`, `scanStatus`, `findings`, `scannedAt`. A branch with no `scanId` has never been scanned.

Findings always belong to one scan, so a branch is read by naming it. Without `--branch` you get the newest scan of the repository, whichever branch it ran on. `--scan <id>` reads one scan directly, which is what to use when you already have an id from `cf branches` or `cf commits`.

A branch that has never been scanned answers `branch_not_scanned` rather than quietly falling back to the default branch. Scan it first.

### Read the scanned history

```sh
cf commits --repo acme/api --agent
cf observed --repo acme/api --scan <scan-id> --agent
```

One row per scanned commit, newest first, each with `sha`, `message`, `author`, `committedAt`, its `scanId`, and the deltas that scan produced: `introduced`, `resolved`, `suppressed`. That is the honest answer to "when did this get introduced" and "did my fix actually close anything", because it is what reconciliation recorded rather than a diff you inferred.

Commits scanned before Cefense recorded commit SHAs are not listed. An empty list means nothing has been scanned with a SHA attached, not that nothing has been committed.

### Scan settings

```sh
cf settings --repo acme/api --agent
cf settings mode push --repo acme/api --agent
cf settings mode scheduled --every 6h --repo acme/api --agent
cf settings checks sast,sca,secrets --repo acme/api --agent
```

Run bare, `cf settings` opens an interactive screen for a person, so an agent should always pass a subcommand or `--agent`.

`scanMode` is what triggers a scan: `manual` on request only, `push` on every commit to the default branch, `scheduled` on a fixed interval. `pull-request` is stored but not yet triggered, and the CLI refuses to set it. `scanInterval` is one of `1h`, `6h`, `12h`, `24h`, `168h`, and only means anything under `scheduled`.

`checks` is which analyses run: `sast`, `sca`, `secrets`, `iac`, `quality`, `sbom`. Presets `essentials`, `balanced`, and `everything` expand to sets of those. `runtime` and `pentest` are shown in the product but cannot run on a repository scan, and are refused with `invalid_check`. `--add` and `--remove` change one check without restating the rest.

Changing checks applies from the next scan, not retroactively. Say that rather than implying old findings will change.

**Ask before changing these.** Turning on `push` or `scheduled` scanning spends the user's scans on a schedule they did not set, and turning a check off narrows what gets reported. Settings are the user's policy, not an implementation detail to tune on their behalf.

### Export the component inventory

```sh
cf sbom --repo acme/api --format cyclonedx --agent
cf sbom --repo acme/api --format spdx --output sbom.json --agent
```

Formats are `cyclonedx` (default) and `spdx`. Without `--output` the document comes back in `data.document`; with it, only the `path` is returned and the file is written. `--scan <id>` exports one scan rather than the newest one that has components.

`sbom_unavailable` means the scan has no component inventory. The `sbom` check has to be on, and the repository rescanned, before there is anything to export.

## Closing the loop unattended

When the user has asked for the whole cycle rather than one finding, this is the shape. By default Cefense scans the repository's **default branch** as GitHub has it, so your own code has to land first. Pass `--branch` to scan somewhere else.

```sh
cf scan --repo acme/api --wait --agent
cf observed --repo acme/api --severity critical,high --agent
cf observed show <finding-id> --repo acme/api --agent
cf fix generate <finding-id> --wait --agent
cf fix publish <finding-id> --yes --agent
cf fix merge <finding-id> --yes --agent
cf scan --repo acme/api --wait --agent
```

The last scan is the point of the exercise: it is what proves the path no longer resolves. Compare its `counts` against the first one and say what actually closed.

Rules for running this unattended:

- **Get consent once, for the loop, and say what it includes.** "Fix and merge the critical findings in acme/api" is consent to merge. "Have a look at the findings" is not.
- **Still read every diff.** Speed is not permission to stop judging. A patch that narrows the input instead of fixing the sink should be reported, not merged.
- **One finding at a time.** Generate, publish, merge, and confirm before starting the next. Batching means a bad patch is discovered after five have landed.
- **Stop on the first refusal.** `pull_request_blocked` and `pull_request_conflicted` mean a human set a rule. Report and wait.

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
| `finding_not_found` | 2 | the id is not in the scan being read, list again |
| `branch_not_found` | 2 | no such branch, run `cf branches` |
| `branch_not_scanned` | 2 | scan the branch before reading its findings |
| `invalid_scan_mode` | 2 | use manual, push, or scheduled |
| `invalid_scan_interval` | 2 | use 1h, 6h, 12h, 24h, or 168h |
| `invalid_check` | 2 | use sast, sca, secrets, iac, quality, or sbom |
| `invalid_format` | 2 | use cyclonedx or spdx |
| `sbom_unavailable` | 4 | enable the sbom check and rescan |
| `fix_not_found` | 2 | generate the patch first |
| `fix_not_ready` | 2 | the patch is not `ready`, check its status |
| `fix_not_published` | 2 | open the pull request before merging it |
| `invalid_merge_method` | 2 | use merge, squash, or rebase |
| `pull_request_blocked` | 4 | a required review or check is pending, stop |
| `pull_request_conflicted` | 4 | the branch conflicts with its base, stop |
| `pull_request_draft` | 4 | the pull request is still a draft |
| `pull_request_closed` | 4 | it was closed without merging |
| `fix_in_progress` | 2 | one is already generating, poll instead of starting another |
| `confirmation_required` | 2 | ask the user, then pass `--yes` |
| `feature_required` | 4 | the account does not include this, tell the user |
| `api_error` | 4 | the API failed, retry once, then report it |
| `internal_error` | 4 | report it, with the message |

## Rules

- Never run `cf fix publish` or `cf fix merge` without the user agreeing to it in this conversation, and treat merging as a separate ask from opening.
- Never change scan settings without asking. `cf settings mode`, `cf settings every`, and `cf settings checks` write the user's policy.
- Never invent a finding id, a severity, a CVE, or an exploit path. All of it comes from the JSON.
- Never edit a file to silence a finding instead of fixing it, and never suppress or filter a finding away to make a report look better.
- Never ask for a token or write credentials to a file. The CLI keeps its token in the operating system keychain.
- If something is not in the JSON, say so instead of filling the gap.

Full documentation: https://cefense.com/docs
