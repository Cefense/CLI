## Cefense

Cefense finds, explains, and patches security vulnerabilities in this repository. It is driven by the `cf` command.

Use it when asked to scan this repository for vulnerabilities or CVEs, triage or explain security findings, patch one, or open a pull request that fixes one. Do not use it as a linter on code being written right now: it reports on what was committed and scanned.

```sh
cf scan --repo <owner/name> --wait --agent
cf observed --repo <owner/name> --severity critical,high --agent
cf observed show <finding-id> --repo <owner/name> --agent
cf fix generate <finding-id> --wait --agent
cf fix publish <finding-id> --yes --agent
cf fix merge <finding-id> --yes --agent
```

It also reads branches, the scanned commit history, scan settings, and the component inventory:

```sh
cf branches --repo <owner/name> --agent
cf scan --repo <owner/name> --branch <name> --wait --agent
cf commits --repo <owner/name> --agent
cf settings --repo <owner/name> --agent
cf sbom --repo <owner/name> --format cyclonedx --agent
```

Every command takes `--agent` and prints one line of JSON on stdout. Branch on `error.code`, never on `error.message`. `cf fix publish` opens a real pull request and `cf fix merge` lands it on the default branch, so ask the user before running either, and treat merging as a separate ask from opening. `cf settings` writes the user's scanning policy, so ask before changing it too.

Read `{{reference}}` before using any of this. It is the full guide: filters, the fix lifecycle, error codes, and how to read a finding.

Not set up yet? Follow https://cefense.com/skill.md
