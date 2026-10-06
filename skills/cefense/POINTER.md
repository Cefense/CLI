## Cefense

Cefense finds, explains, and patches security vulnerabilities in this repository through the `cf` command. Use it to scan for vulnerabilities or CVEs, triage or explain findings, patch one, or open a pull request that fixes one. It reports on what was committed and scanned, not on code being written right now.

```sh
cf scan --repo <owner/name> --wait --agent
cf reproduced --repo <owner/name> --severity critical,high --agent
cf reproduced show <finding-id> --repo <owner/name> --agent
cf fix generate <finding-id> --repo <owner/name> --wait --agent
cf proof run <finding-id> --repo <owner/name> --wait --agent
cf fix publish <finding-id> --repo <owner/name> --yes --agent
cf fix merge <finding-id> --repo <owner/name> --yes --agent
```

Every command takes `--agent` and prints one line of JSON on stdout. Branch on `error.code`, and prefer the literal commands in `next`. Lists are lean; `show` commands and `--fields` give the full record.

Ask the user before `cf fix publish`, before `cf fix merge` as a separate ask, and before `cf proof attest`, `cf triage`, `cf settings` changes, `cf scan --url`, and `cf plan upgrade`. Never add `--yes` because a command failed.

Read `{{reference}}` before using any of this: it holds the workflows, the gates, and how to read errors. `cf agent check --agent` says what is blocking you, and `cf agent schema --agent` prints the whole command surface.

Full agent documentation: https://cefense.com/agent
