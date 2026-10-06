---
name: cefense
description: Find, understand, and fix security vulnerabilities in this repository using the Cefense CLI. Use when asked to run a security scan, check this repository for vulnerabilities or CVEs, triage or explain security findings, generate a patch for a vulnerability, or open a pull request that fixes one.
license: MIT
metadata:
  version: 6
  homepage: https://cefense.com
  documentation: https://cefense.com/agent
---

# Cefense

Cefense scans a repository, reports its vulnerabilities, joins each to the research that explains it, writes a patch, proves it, and opens a pull request. You drive it with `cf`.

Use it for "is this repo vulnerable", "what should I fix first", "fix that finding". It reports on what was committed and scanned, not your working tree.

Not set up? Run `cf agent check --repo acme/api --agent` and follow its `blockers`; `resolvedBy` says whether you (`agent`) or the user (`user`) clears each.

## The contract

- Pass `--agent` to every command, or `export CEFENSE_AGENT=1`. Output is one line of JSON on stdout, success or failure. Nothing prompts.
- Pass `--repo owner/name` to every repository or finding command, or `export CEFENSE_REPO=acme/api`. `--org <slug>` or `CEFENSE_ORG` picks the organization.
- Success is `{"ok":true,"data":{...},"next":["cf ..."]}`. `next` holds literal commands computed from what was just fetched; prefer them.
- Null values and empty arrays are omitted, so test for presence.
- Finding ids belong to one scan. After a rescan, list again.

Lists are lean: ids, names, status, severity, location. The matching `show` command has the full record. `--fields a,b,c` returns exactly those keys of every row, including ones the lean row leaves out, such as `--fields title,description`.

## 1. See what is going on

```sh
cf status --agent
cf repo list --agent
```

`cf status` returns `counts` and `attention`: repositories whose scan is running, failed, cancelled, or missing. A running scan stays there until it settles. `cf repo list` returns every repository with its last `scan`.

## 2. Find what is wrong

```sh
cf scan --repo acme/api --wait --agent
cf reproduced --repo acme/api --severity critical,high --agent
cf matched --repo acme/api --agent
```

`cf scan --wait` blocks until the scan settles (up to about ten minutes) and returns `status` (`completed`, `failed`, `cancelled`) and `findings`. `--progress` adds one JSON line per poll on stderr; `--branch <name>` scans another branch.

`cf reproduced` lists findings worst first, with `counts` by severity; `cf matched` only those joined to research. Filters: `--severity critical,high,watch,info`, `--category code,dependency,secret,misconfig,os-package`, `--limit <n>`, `--branch <name>`, `--scan <id>`, and `--exit-code` (exit 1 on any Critical or High).

Filter on `severity` (`critical`, `high`, `medium`, `low`), tell people `severityLabel` (Critical, High, Watch, Info). `reachability` is `reachable`, `imported`, `dev-only`, `unimported`, or `unknown`: work `reachable` first. `status` is `none`, `working`, `ready`, `proven`, `pr`, `merged`, `refuted`, or `review`.

## 3. Inspect one finding

```sh
cf reproduced show <finding-id> --repo acme/api --agent
```

Read this before forming an opinion. It adds `description`, `code`, `dataflow` (source, steps, sink, `ineffectiveSanitizers`), `reachabilityEvidence`, `exploitPath`, `research`, `references`, `remediation`, `introducedIn`, `dependency` (`installed`, `fixedIn`, `direct`, `requiredBy`), and the current `fix` with its diff. If the list was read with `--branch` or `--scan`, pass the same flag here.

## 4. Fix it and open a pull request

```sh
cf fix generate <finding-id> --repo acme/api --wait --agent
cf proof run <finding-id> --repo acme/api --wait --agent
cf fix publish <finding-id> --repo acme/api --yes --agent
cf fix merge <finding-id> --repo acme/api --yes --agent
cf scan --repo acme/api --wait --agent
```

`cf fix generate --wait` polls for up to about three minutes. Fix statuses: `generating`, `ready`, `failed`, `skipped`, `publishing`, `opened`, `merged`, `closed`. When `ready`, read `data.fix.diff` and `explanation`; `behaviorChange: removed` means the patch deleted the feature, which is the user's call. A patch is a proposal, and saying it is wrong is a useful answer.

Publish only after the user agrees and has seen the diff. Merging is a separate ask. `cf fix merge` takes `--method merge|squash|rebase` (default squash) and `--no-delete-branch`. Rescan after merging and compare `counts`.

## 5. Verify with proof

```sh
cf proof run <finding-id> --repo acme/api --wait --agent
cf proof show <finding-id> --repo acme/api --agent
```

A proof replays the evidence against the patch. `data.proof.verdict`:

| verdict | meaning |
| --- | --- |
| `proven` | established by running it |
| `argued` | a reasoned case, what most code fixes settle as |
| `incomplete` | something outside the patch is outstanding, such as rotating a leaked credential |
| `refuted` | the patch does not close the finding; publishing is refused, so regenerate |
| `unprovable` | nothing to prove |

Show the user `checks` and `witness`: a proof is evidence, not a badge. `cf proof attest <finding-id> --repo acme/api --yes --agent` records under the user's name that a leaked secret was revoked, so ask them first.

## 6. Triage

```sh
cf triage <finding-id> false-positive --note "input is a constant" --repo acme/api --agent
cf triage <finding-id> accepted-risk --note "internal, behind SSO" --repo acme/api --agent
cf triage <finding-id> open --repo acme/api --agent
```

Decisions survive rescans and are recorded under the user's name. Ask for each one; never triage in bulk or to make a report look cleaner.

## More reads

```sh
cf branches --repo acme/api --agent
cf commits --repo acme/api --agent
cf settings --repo acme/api --agent
cf audit --category fix,repository --agent
cf plan --agent
```

A commit with `scanned: false` is unknown, not clean. `cf audit` returns 50 events and `next` pages back. `cf plan` reads the allowance that `allowance_exhausted` refers to.

## Gates

These refuse with `confirmation_required` (exit 2) until `--yes` is passed: `cf fix publish`, `cf fix merge`, `cf proof attest`, `cf skill install`, `cf proof env unset`, and `cf proof env set` when it replaces a value. Ask the user first. Never add `--yes` because a command failed.

These need the user's agreement without a flag: `cf triage`, `cf settings mode`, `every`, `depth` and `checks`, `cf scan --url` (adds a repository), `cf plan upgrade` (returns a checkout URL, buys nothing), and `cf proof env set` (test credentials only).

## Errors

```json
{"schemaVersion":1,"ok":false,"command":"reproduced show","error":{"code":"finding_not_found","message":"deadbeef is not a finding in the scan being read of acme/api.","remedy":"cf reproduced --repo acme/api --agent","exitCode":2}}
```

Branch on `error.code`, never on `message`. `remedy` is a literal command when one you may run fixes it, otherwise a short instruction.

| exit | meaning |
| --- | --- |
| 0 | done |
| 1 | findings present under `--exit-code` |
| 2 | usage or missing consent; do not retry unchanged |
| 3 | not signed in; the user runs `cf auth login` |
| 4 | API refusal or failure; read `error.code` |
| 130 | interrupted |

Stop and report `allowance_exhausted`, `repository_limit`, `feature_required`, `provider_not_connected`, `provider_reconnect_required`, and any `pull_request_*` code: each needs a person. Retry `api_error` once.

## Rules

- Never invent a finding id, severity, CVE, or exploit path. If it is not in the JSON, say so.
- Never edit code to silence a finding, work around a plan limit, or handle tokens yourself.

## Everything else

```sh
cf agent schema --agent
```

Every command, flag, error code, enum and gate, generated by the CLI itself. When this page and the CLI disagree, the CLI is right. Full documentation: https://cefense.com/agent
