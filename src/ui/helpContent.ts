export const DOCS_URL = "https://cefense.com/docs";

export const PACKAGE_NAME = "@cefense-npm/cefense-cli";

export interface GlobalFlag {
  flags: string;
  description: string;
}

export const GLOBAL_FLAGS: readonly GlobalFlag[] = [
  { flags: "--repo <owner/name>", description: "Repository to act on" },
  { flags: "--org <slug>", description: "Organization to act on" },
  { flags: "--json", description: "Print JSON instead of a rendered view" },
  { flags: "--agent", description: "Print one JSON line for coding agents, never prompt" },
  { flags: "-y, --yes", description: "Skip confirmation prompts" },
  { flags: "--web", description: "Open the result in a browser instead of printing it" },
  { flags: "--columns <list>", description: "Only show these columns, comma separated" },
  { flags: "--fields <list>", description: "With --agent, keep only these keys in each list" },
  { flags: "--no-pager", description: "Never page long output" },
  { flags: "--no-color", description: "Disable colour" },
  { flags: "--no-link", description: "Do not remember this directory's repository" },
  { flags: "--verbose", description: "Show more detail on failure" },
];

export const INHERITED_SHOWN: readonly string[] = [
  "--repo <owner/name>",
  "--org <slug>",
  "--json",
  "--agent",
];

export interface RootSection {
  title: string;
  commands: string[];
}

export const ROOT_SECTIONS: readonly RootSection[] = [
  { title: "CORE COMMANDS", commands: ["status", "scan", "browse"] },
  { title: "FINDINGS AND FIXES", commands: ["finding", "fix", "proof", "triage"] },
  { title: "REPOSITORY COMMANDS", commands: ["repo", "settings", "branches", "commits", "sbom"] },
  { title: "ACCOUNT COMMANDS", commands: ["auth", "org", "plan", "provider", "notifications", "audit"] },
  { title: "ADDITIONAL COMMANDS", commands: ["skill", "agent", "completion"] },
];

export const LEGACY_NAMES: Readonly<Record<string, string>> = {
  reproduced: "finding list",
  "reproduced show": "finding view",
  matched: "finding matched",
};

export const COMMAND_SYNONYMS: Readonly<Record<string, string>> = {
  login: "auth login",
  logout: "auth logout",
  whoami: "auth status",
  open: "browse",
  issues: "finding list",
  vulns: "finding list",
  show: "finding view",
  view: "finding view",
  pr: "fix publish",
  version: "--version",
};

export const DOC_SLUGS: Readonly<Record<string, string>> = {
  auth: "cli-authentication",
  org: "cli-organizations",
  plan: "billing",
  notifications: "notifications",
  repo: "cli-repos",
  provider: "cli-repos",
  status: "dashboard",
  scan: "cli-scan",
  branches: "branches-and-commits",
  commits: "branches-and-commits",
  triage: "cli-triage",
  finding: "cli-findings",
  reproduced: "cli-findings",
  matched: "cli-findings",
  fix: "cli-fixes",
  proof: "cli-fixes",
  settings: "cli-settings",
  sbom: "cli-sbom",
  skill: "cli-skill",
  agent: "agent-schema",
};

export function docsUrlFor(path: string): string {
  const top = path.split(" ")[0] ?? "";
  return `${DOCS_URL}/${DOC_SLUGS[top] ?? "cli-reference"}`;
}

export const DETAILS: Readonly<Record<string, string>> = {
  "": "Scan repositories, read what was found, and fix it with a pull request, all from your terminal",
  finding:
    "Work with the findings of a repository's newest scan. Every finding id belongs to one scan, and a rescan replaces them all. Any unambiguous prefix of an id works, from four characters up",
  "finding view":
    "Show one finding in full: the vulnerable code, how data reaches it, the research that explains it, and the state of its fix",
  browse:
    "Open the Cefense workspace in your browser. Pass a finding id to open that finding. The workspace shows the repository your browser last had selected, so pass --code to open the repository itself, or the finding's lines, on its code host instead",
  "repo view": "Show one connected repository: where it lives, its last scan, and how it is scanned",
  agent:
    "Everything a coding agent needs to drive this CLI without being taught it. Every command also takes --agent, which prints exactly one line of JSON",
};

export const FINDING_ID = "3f2a9c1e";

export const EXAMPLES: Readonly<Record<string, readonly string[]>> = {
  "": [
    "cf status",
    "cf finding list --severity critical,high",
    `cf finding view ${FINDING_ID}`,
    `cf fix generate ${FINDING_ID} --wait`,
  ],

  auth: ["cf auth login", "cf auth status", "cf auth logout"],
  "auth login": ["cf auth login", "# Sign in again even though a token is stored", "cf auth login --force"],
  "auth logout": ["cf auth logout", "# Sign out of every Cefense instance at once", "cf auth logout --all"],
  "auth status": ["cf auth status", "cf auth status --json"],

  org: ["cf org list", "cf org use acme", "cf org show"],
  "org list": ["cf org list", "cf org list --json"],
  "org use": ["cf org use acme", "# Act on another organization for one command only", "cf finding list --org acme-labs"],
  "org show": ["cf org show", "CEFENSE_ORG=acme-labs cf org show"],

  plan: ["cf plan", "cf plan upgrade pro", "cf plan portal"],
  "plan upgrade": ["cf plan upgrade pro", "cf plan upgrade max --yearly", "cf plan upgrade pro --seats 3"],
  "plan portal": ["cf plan portal", "cf plan portal --web"],

  notifications: [
    "cf notifications",
    "cf notifications set scan_report --severity high",
    "cf notifications mute acme/legacy-site",
  ],
  "notifications set": [
    "cf notifications set scan_report --severity high",
    "cf notifications set advisory --off",
    "cf notifications set fix_pr_opened --on",
  ],
  "notifications mute": ["cf notifications mute acme/legacy-site", "cf notifications mute acme/sandbox"],
  "notifications repo": [
    "cf notifications repo acme/api --severity critical",
    "cf notifications repo acme/sandbox --mute",
    "cf notifications repo acme/api --reset",
  ],

  repo: ["cf repo list", "cf repo view acme/api", "cf repo connect acme/api"],
  "repo connect": [
    "cf repo connect",
    "cf repo connect acme/api",
    "cf repo connect acme/infra --provider gitlab --no-watch",
  ],
  "repo list": ["cf repo list", "cf repo list --json"],
  "repo view": ["cf repo view", "cf repo view acme/api", "cf repo view acme/api --web"],
  "repo set-default": ["cf repo set-default acme/api", "cf repo set-default --unset"],
  "repo disconnect": ["cf repo disconnect acme/api", "cf repo disconnect --account --provider gitlab"],

  provider: ["cf provider list", "cf provider connect gitlab"],
  "provider list": ["cf provider list", "cf provider list --json"],
  "provider connect": ["cf provider connect github", "cf provider connect bitbucket"],
  "provider disconnect": ["cf provider disconnect gitlab", "cf provider disconnect bitbucket"],

  status: ["cf status", "cf status --watch", "cf status --web"],
  scan: [
    "cf scan",
    "cf scan --repo acme/api --wait",
    "cf scan --branch develop",
    "cf scan --url https://github.com/acme/api",
  ],
  branches: ["cf branches", "cf branches --repo acme/api --json"],
  commits: ["cf commits", "cf commits --branch develop --limit 20"],
  triage: [
    `cf triage ${FINDING_ID} false-positive --note "test fixture, never deployed"`,
    `cf triage ${FINDING_ID} accepted-risk`,
    `cf triage ${FINDING_ID} open`,
  ],
  audit: ["cf audit", "cf audit --category fix,proof --limit 50", "cf audit --before 2026-09-01T00:00:00Z"],

  finding: ["cf finding list", `cf finding view ${FINDING_ID}`, "cf finding matched --severity critical"],
  "finding list": [
    "cf finding list",
    "cf finding list --severity critical,high --category dependency",
    "cf finding list --branch develop",
    "# Fail a pipeline when a critical or high finding is present",
    "cf finding list --severity critical,high --exit-code",
  ],
  "finding view": [
    `cf finding view ${FINDING_ID}`,
    `cf finding view ${FINDING_ID} --branch develop`,
    "# Open the vulnerable lines on the code host",
    `cf finding view ${FINDING_ID} --web`,
  ],
  "finding matched": ["cf finding matched", "cf finding matched --severity critical,high"],
  reproduced: ["cf reproduced", "cf reproduced --severity critical,high --exit-code"],
  "reproduced show": [`cf reproduced show ${FINDING_ID}`, `cf reproduced show ${FINDING_ID} --json`],
  matched: ["cf matched", "cf matched --repo acme/api --agent"],

  fix: ["cf fix", `cf fix generate ${FINDING_ID} --wait`, `cf fix publish ${FINDING_ID}`],
  "fix show": [`cf fix show ${FINDING_ID}`, "# Open the pull request in a browser", `cf fix show ${FINDING_ID} --web`],
  "fix generate": [`cf fix generate ${FINDING_ID}`, `cf fix generate ${FINDING_ID} --wait`],
  "fix publish": [`cf fix publish ${FINDING_ID}`, `cf fix publish ${FINDING_ID} --repo acme/api`],
  "fix merge": [`cf fix merge ${FINDING_ID}`, `cf fix merge ${FINDING_ID} --method rebase --no-delete-branch`],

  proof: ["cf proof", `cf proof run ${FINDING_ID} --wait`, `cf proof show ${FINDING_ID}`],
  "proof show": [`cf proof show ${FINDING_ID}`, `cf proof show ${FINDING_ID} --json`],
  "proof run": [`cf proof run ${FINDING_ID}`, `cf proof run ${FINDING_ID} --wait`],
  "proof attest": [
    `cf proof attest ${FINDING_ID}`,
    `cf proof attest ${FINDING_ID} --note "key revoked and reissued"`,
  ],
  "proof env": ["cf proof env", "cf proof env set DATABASE_URL --from-env", "cf proof env unset DATABASE_URL"],
  "proof env set": ["cf proof env set DATABASE_URL --from-env", "cf proof env set API_TOKEN --stdin < token.txt"],
  "proof env unset": ["cf proof env unset DATABASE_URL", "cf proof env unset API_TOKEN"],

  settings: ["cf settings", "cf settings mode push", "cf settings checks balanced"],
  "settings mode": ["cf settings mode push", "cf settings mode scheduled --every 24h", "cf settings mode manual"],
  "settings every": ["cf settings every 6h", "cf settings every 168h"],
  "settings depth": ["cf settings depth max", "cf settings depth default"],
  "settings checks": [
    "cf settings checks sast sca secrets",
    "cf settings checks balanced",
    "cf settings checks iac --add",
    "cf settings checks quality --remove",
  ],

  sbom: ["cf sbom > sbom.json", "cf sbom --format spdx --output sbom.spdx.json"],

  skill: ["cf skill install", "cf skill install claude cursor", "cf skill list"],
  "skill install": ["cf skill install", "cf skill install claude cursor --yes", "cf skill install --all --global"],
  "skill list": ["cf skill list", "cf skill list --json"],
  "skill show": ["cf skill show", "cf skill show cursor"],
  "skill uninstall": ["cf skill uninstall", "cf skill uninstall cursor", "cf skill uninstall --global"],

  agent: ["cf agent schema --agent", "cf agent check --repo acme/api --agent"],
  "agent schema": ["cf agent schema --agent", "cf agent schema > cefense-schema.json"],
  "agent check": ["cf agent check --repo acme/api --agent", "CEFENSE_REPO=acme/api cf agent check --agent"],

  completion: [
    'cf completion zsh > "${fpath[1]}/_cf"',
    "cf completion bash > /etc/bash_completion.d/cf",
    "cf completion fish > ~/.config/fish/completions/cf.fish",
  ],

  browse: [
    "cf browse",
    `cf browse ${FINDING_ID}`,
    "# Open the finding's lines on GitHub, GitLab, or Bitbucket",
    `cf browse ${FINDING_ID} --code`,
    "cf browse --no-browser",
  ],
};
