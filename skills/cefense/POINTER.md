## Cefense

Cefense finds, explains, and patches security vulnerabilities in this repository. It is driven by the `cf` command.

Use it when asked to scan this repository for vulnerabilities or CVEs, triage or explain security findings, patch one, or open a pull request that fixes one. Do not use it as a linter on code being written right now: it reports on what was committed and scanned.

```sh
cf observed --repo <owner/name> --severity critical,high --agent
cf observed show <finding-id> --repo <owner/name> --agent
cf fix generate <finding-id> --wait --agent
cf fix publish <finding-id> --yes --agent
```

Every command takes `--agent` and prints one line of JSON on stdout. Branch on `error.code`, never on `error.message`. `cf fix publish` opens a real pull request on GitHub, so ask the user before running it.

Read `{{reference}}` before using any of this. It is the full guide: filters, the fix lifecycle, error codes, and how to read a finding.

Not set up yet? Follow https://cefense.com/skill.md
