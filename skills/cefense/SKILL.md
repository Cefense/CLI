---
name: cefense
description: Find, understand, and fix security vulnerabilities in this repository using the Cefense CLI. Use when asked to run a security scan, check this repository for vulnerabilities or CVEs, triage or explain security findings, generate a patch for a vulnerability, or open a pull request that fixes one.
license: MIT
metadata:
  version: 5
  homepage: https://cefense.com
  documentation: https://cefense.com/agent
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

If `cf` is not installed or this repository is not connected, run `cf agent check --agent` and follow its `blockers`, or read https://cefense.com/agent/setup.md.

## The contract

Pass `--agent` to every command. It prints exactly one line of JSON to stdout, never opens the interactive view, and never asks a question.

```json
{"schemaVersion":1,"ok":true,"command":"observed","data":{"...":"..."},"next":["cf fix generate <id> --wait --agent"]}
{"schemaVersion":1,"ok":false,"command":"fix publish","error":{"code":"confirmation_required","message":"...","remedy":"...","exitCode":2}}
```

- Branch on `error.code`. Never match on `error.message`, which is written for people and will change.
- Absent keys are omitted rather than sent as null, and empty arrays are dropped. Test for presence.
- `next` names real commands that act on what was just returned. Prefer them over commands you compose.
- Pass `--repo owner/name` every time. `--agent` deliberately remembers no default for the working directory.
- Exit codes: `0` fine, `1` findings present under `--exit-code`, `2` usage, `3` not signed in, `4` API failure, `130` interrupted.

Set these once instead of repeating flags:

```sh
export CEFENSE_AGENT=1      # every invocation is in agent mode, no --agent needed
export CEFENSE_REPO=acme/api # every command acts on this repository
export CEFENSE_ORG=acme      # every command acts on this organization
```

`--fields <list>` narrows every list in the envelope to the keys you name, which on a real repository takes a findings listing from about 32 KB to about 9 KB. Use it when ranking or triaging. Do not use it when reading one finding to judge it, because that needs the whole record.

### Ask the CLI instead of guessing

```sh
cf agent check --agent
cf agent schema --agent
```

`cf agent check` answers "can I proceed here, and if not, what has to happen first" in one call: it reports `ready`, and `blockers` each carrying `resolvedBy` (`agent` or `user`) so you know whether to act or to stop and ask. Run it first in a repository you have not touched before.

`cf agent schema` returns the whole command surface, the envelope, every error code with its remedy, the enums, and the gates. It is generated from the argument parser, so it cannot be out of date. Reach for it whenever this document and the CLI seem to disagree: the CLI is right.

## Vocabulary

**Observed** is something real in this repository's code. **Matched** is an Observed finding joined to the research that explains it. **Fix** is a patch for one finding, and the pull request that carries it. **Triage** is the user's recorded decision about a finding, kept per repository so it survives every rescan.

Repositories live on GitHub, GitLab, or Bitbucket. Everything below works the same on all three: once a repository is connected it is addressed by `--repo owner/name` and nothing else changes. Only account connection and `cf scan --url` are GitHub-specific.

Severities read as Critical, High, Watch, Info. On the wire they are `critical`, `high`, `medium`, `low`, and filters take either spelling. Findings carry both `severity` (the wire value) and `severityLabel` (what to tell a person).

## Organizations

Every repository, scan, finding, and fix belongs to one organization, and every command acts on exactly one. Which one is decided in this order:

1. `--org <slug>` passed to the command
2. `CEFENSE_ORG` in the environment
3. the selection `cf org use` stored for this Cefense instance
4. nothing, in which case the API uses the account's own organization, but only when it belongs to exactly one

```sh
cf org list --agent
cf org use acme --agent
cf org show --agent
```

`cf org list` returns every organization the account belongs to in `data.organizations`, each with `slug`, `name`, `role`, and `active` on the one currently selected. Address an organization by its `slug`, never by `id`.

`cf org use <slug>` checks the slug against that list before storing it, so a typo fails there rather than turning the next unrelated command into a puzzle. The selection is global to the instance rather than per directory: unlike the repository, an organization does not change with where you are standing. `cf org show` reports what is selected and which of the four answers above decided it, and it needs no network.

Roles are `owner`, `admin`, and `member`. `owner` is Cefense's own role, the seat a peer administrator cannot remove.

`organization_required` means nothing named an organization and the account belongs to none or to several: list them and pass `--org`. `organization_not_found` means the slug is not one this account is a member of, and the API answers the same way for a slug that does not exist at all, so do not read it as evidence either way. `organization_forbidden` means the role held there does not allow the action, which only the user can change.

## Plan and usage

Every scan and every generated patch spends tokens from the organization's monthly allowance. When that allowance runs out, scanning stops: this is the thing most likely to make a command that worked yesterday fail today.

```sh
cf plan --agent
```

`data.usage` is the meter: `tokens` spent, `allowance` for the period, `remaining`, `percentUsed`, and `exhausted`. `data.plan` is `free`, `plus`, `pro`, or `max`, `data.entitled` says whether it is actually being paid for, and `renewsAt` is when the period rolls over. On an organization with no allowance applied at all, `allowance`, `remaining` and `percentUsed` are absent and `usage.unlimited` is true. `data.catalogue` lists every plan with its price, tokens, seats, repository limit, and max-depth allotment, so you can say what moving up would actually buy rather than guessing.

Read it before starting a long run, and read it when a scan refuses. Any member can, whatever their role.

```sh
cf plan upgrade pro --agent
cf plan upgrade pro --yearly --seats 3 --agent
cf plan portal --agent
```

**Neither of these buys anything, and neither can be finished by an agent.** `cf plan upgrade` opens a checkout and returns `data.checkoutUrl`; `cf plan portal` returns `data.portalUrl` for invoices, the payment method, seat changes, and cancellation. Both carry `requiresHuman: true`. Give the URL to the user and stop. Never open a browser, never fill a payment form, and never treat a returned URL as a completed purchase: the plan changes only once the payment clears, so confirm with `cf plan --agent` afterwards rather than assuming.

`--seats <n>` counts seats **beyond** the ones the plan already includes, so `--seats 0` is the plan on its own. `--yearly` bills annually, which `data.annualDiscountPercent` prices.

Ask the user before running `cf plan upgrade`, exactly as you would before opening a pull request. It is a step towards spending their money, and only an owner or admin may take it: any other role answers `billing_forbidden`, and `data.canAdministerBilling` says in advance whether this account is one.

`allowance_exhausted` means the tokens for this period are gone and no scan will start until the period resets or the plan changes. `repository_limit` means the plan covers fewer repositories than the account is trying to connect. `depth_unavailable` means max depth is not included on this plan, so re-run at default depth. `no_subscription` means nothing has ever been bought, so there is no portal to open. `billing_unavailable` means this deployment has no billing configured at all. None of them are retryable, and none of them are yours to solve: report and stop.

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

### Record a decision

```sh
cf triage <finding-id> false-positive --note "the input is a constant" --agent
cf triage <finding-id> accepted-risk --note "internal tool, behind SSO" --agent
cf triage <finding-id> open --agent
```

Decisions are `false-positive` (it is not real), `accepted-risk` (it is real and the user is living with it), and `open` (undo a previous decision). They are stored against the finding's fingerprint, so they survive the rescan that replaces this scan's finding ids.

**Ask the user first, every time.** Dismissing a finding is the user's judgement about their own risk, not a tidying step, and it is recorded against their account with whatever `--note` says. Never triage to make a report look cleaner, and never triage in bulk.

A finding with no fingerprint answers `finding_not_triageable`: there is nothing durable to attach the decision to. Report that rather than retrying.

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

`--wait` polls until settled, up to about three minutes. Without it you get `generating` back and poll `cf fix show` yourself. Statuses: `generating`, `ready`, `failed`, `skipped`, `publishing`, `opened`, `merged`, `closed`. The last two are reached after the pull request is resolved, and `closed` means it was closed without merging.

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

`--wait` blocks until the scan settles, up to about ten minutes, and returns `status`, `findings`, and `error`. A scan settles as `completed`, `failed`, or `cancelled`. Add `--progress` to get one JSON progress line per poll on stderr, which keeps a supervisor from treating a long scan as a hang. Without `--wait` you get the `scanId` immediately and have to poll `cf status --agent` yourself.

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

### Read the history

```sh
cf commits --repo acme/api --agent
cf commits --repo acme/api --branch release/2.4 --agent
cf observed --repo acme/api --scan <scan-id> --agent
```

One row per commit on the branch, newest first, as the host has it. `scanned` says whether Cefense has scanned that exact commit. Only a scanned commit carries `scanId`, `findings`, and the deltas reconciliation produced: `introduced`, `resolved`, `suppressed`. Everything else is absent, so read `scanned` before reporting a commit as clean: an unscanned commit is unknown, not safe.

The deltas are the honest answer to "when did this get introduced" and "did my fix actually close anything", because they are what reconciliation recorded rather than a diff you inferred. `data.historyAvailable` is false when the host connection cannot read the history at all; that is a reconnect, not an empty repository.

### Scan settings

```sh
cf settings --repo acme/api --agent
cf settings mode push --repo acme/api --agent
cf settings mode scheduled --every 6h --repo acme/api --agent
cf settings depth max --repo acme/api --agent
cf settings checks sast,sca,secrets --repo acme/api --agent
```

Run bare, `cf settings` opens an interactive screen for a person, so an agent should always pass a subcommand or `--agent`.

`scanMode` is what triggers a scan: `manual` on request only, `push` on every commit to the default branch, `scheduled` on a fixed interval. `pull-request` is stored but not yet triggered, and the CLI refuses to set it. `scanInterval` is one of `1h`, `6h`, `12h`, `24h`, `168h`, and only means anything under `scheduled`.

`scanDepth` is how hard each scan looks. `default` runs the full pipeline once, balancing depth against time. `max` keeps sending fresh passes until nothing new turns up: exhaustive, and much slower, so it is for an audit or a release rather than routine scanning. Say that before turning it on, because the user pays for the time.

`checks` is which analyses run: `sast`, `sca`, `secrets`, `iac`, `quality`, `sbom`. Presets `essentials`, `balanced`, and `everything` expand to sets of those. `runtime` is named in the product but needs an agent inside a running workload, so a repository scan cannot run it and it is refused with `invalid_check`. `--add` and `--remove` change one check without restating the rest.

Changing checks applies from the next scan, not retroactively. Say that rather than implying old findings will change.

**Ask before changing these.** Turning on `push` or `scheduled` scanning spends the user's scans on a schedule they did not set, turning `max` depth on makes every scan much slower, and turning a check off narrows what gets reported. Settings are the user's policy, not an implementation detail to tune on their behalf.

### Read what has happened

```sh
cf audit --agent
cf audit --category fix,repository --limit 50 --agent
cf audit --before 2026-09-01T00:00:00Z --agent
```

Every recorded action on the account, newest first: who did it, what it targeted, what changed, and whether it succeeded. Categories are `scan`, `finding`, `fix`, `proof`, `repository`, `settings`, `export`, `account`, `integration`.

This is the record, so use it to answer "who dismissed this", "when did scanning turn on", and "did that pull request actually merge" instead of guessing from the current state. It is append-only and nothing you run can edit it.

### Connect a repository

```sh
cf provider list --agent
cf repo list --agent
cf repo connect acme/api --provider gitlab --agent
```

`cf provider list` shows GitHub, GitLab, and Bitbucket, which are available on this deployment, and which the user has connected. Connecting an account itself needs a browser, so `cf provider connect` fails under `--agent` with `provider_not_connected` and the URL to send the user to. Report that; do not try to work around it.

Repositories on a connected account are connected without a browser. `--provider` is only needed when more than one account is connected and the host is not obvious from the argument.

```sh
cf scan --url https://github.com/acme/api --wait --agent
```

Connects a GitHub repository by URL and scans it in one step. GitHub only. **This adds a repository to the user's account**, so ask first, exactly as you would before opening a pull request.

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
| `invalid_scan_depth` | 2 | use default or max |
| `invalid_triage_status` | 2 | use open, false-positive, or accepted-risk |
| `invalid_audit_category` | 2 | use one of the nine audit categories |
| `invalid_date` | 2 | pass an ISO timestamp to `--before` |
| `invalid_provider` | 2 | use github, gitlab, or bitbucket |
| `unknown_organization` | 2 | the slug is not one this account belongs to, run `cf org list` |
| `organization_required` | 2 | name one with `--org`, `CEFENSE_ORG`, or `cf org use` |
| `organization_not_found` | 2 | the slug is not one this account can see, run `cf org list` |
| `organization_forbidden` | 4 | the role held in that organization is too low, tell the user |
| `allowance_exhausted` | 4 | the period's tokens are spent, run `cf plan`, only the user can fix it |
| `repository_limit` | 4 | the plan covers fewer repositories, disconnect one or move up |
| `depth_unavailable` | 4 | max depth is not on this plan, re-run at default depth |
| `invalid_plan` | 2 | use plus, pro, or max |
| `invalid_seats` | 2 | `--seats` takes a whole number from 0 to 500 |
| `billing_forbidden` | 4 | only an owner or admin may change what the organization pays |
| `billing_unavailable` | 4 | this deployment has no billing configured |
| `no_subscription` | 4 | nothing has been bought, so there is no portal to open |
| `plan_unavailable` | 4 | that plan is not on sale here yet, report it |
| `finding_not_triageable` | 4 | the finding has no fingerprint, report and stop |
| `provider_not_connected` | 4 | the account needs a browser, send the user the URL |
| `provider_reconnect_required` | 4 | the host token expired, the user must reconnect |
| `provider_unavailable` | 4 | that host is not configured on this deployment |
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
- Never change scan settings without asking. `cf settings mode`, `cf settings every`, `cf settings depth`, and `cf settings checks` write the user's policy.
- Never run `cf triage` without the user agreeing to that specific decision. Dismissing a finding is their call about their own risk, and it is recorded under their name.
- Never run `cf scan --url` without asking. It connects a repository to the user's account.
- Never run `cf plan upgrade` without asking. It is a step towards spending the user's money, and the checkout URL it returns is for them to open, not for you to act on.
- Never invent a finding id, a severity, a CVE, or an exploit path. All of it comes from the JSON.
- Never edit a file to silence a finding instead of fixing it, and never suppress or filter a finding away to make a report look better.
- Never ask for a token or write credentials to a file. The CLI keeps its token in the operating system keychain.
- If something is not in the JSON, say so instead of filling the gap.

Full agent documentation: https://cefense.com/agent

Every page there is plain markdown at a stable URL. https://cefense.com/llms-full.txt is the whole corpus in one fetch. The pages worth knowing by name:

- https://cefense.com/agent/contract.md the envelope, exit codes, environment variables
- https://cefense.com/agent/errors.md every error code, generated from the CLI's own catalogue
- https://cefense.com/agent/recipes.md worked loops with the JSON at each step
- https://cefense.com/agent/judgement.md consent, the gates, and what never to do
