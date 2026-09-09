import type { Command } from "commander";
import { AGENT_SCHEMA_VERSION } from "../core/compact.js";
import { ERROR_CODES, PRECONDITION_CODES } from "../core/codes.js";
import {
  EXIT_API,
  EXIT_AUTH,
  EXIT_FINDINGS,
  EXIT_INTERRUPTED,
  EXIT_OK,
  EXIT_USAGE,
} from "../core/errors.js";
import { matchProject } from "../core/repo.js";
import { openSession, type GlobalOptions } from "../core/session.js";
import { compactProject } from "../core/compact.js";
import { PROVIDERS } from "../core/providers.js";
import type { Project } from "../core/types.js";
import * as out from "../ui/output.js";
import { VERSION } from "../version.js";

const GLOBAL_FLAGS = new Set([
  "--repo <owner/name>",
  "--json",
  "--agent",
  "--no-color",
  "--verbose",
  "-y, --yes",
  "--columns <list>",
  "--fields <list>",
  "--web",
  "--no-pager",
  "--no-link",
]);

interface CommandNode {
  path: string;
  summary: string;
  arguments: Array<Record<string, unknown>>;
  options: Array<Record<string, unknown>>;
  subcommands?: CommandNode[];
}

function pathOf(command: Command): string {
  const parts: string[] = [];
  let node: Command | null = command;
  while (node && node.parent) {
    parts.unshift(node.name());
    node = node.parent;
  }
  return parts.join(" ");
}

function describeCommand(command: Command): CommandNode {
  const node: CommandNode = {
    path: pathOf(command),
    summary: command.description(),
    arguments: command.registeredArguments.map((argument) => ({
      name: argument.name(),
      required: argument.required,
      variadic: argument.variadic,
      description: argument.description || null,
    })),
    options: command.options
      .filter((option) => !GLOBAL_FLAGS.has(option.flags))
      .map((option) => ({
        flags: option.flags,
        description: option.description || null,
        default: option.defaultValue ?? null,
      })),
  };
  const children = command.commands.filter((child) => child.name() !== "help");
  if (children.length > 0) node.subcommands = children.map(describeCommand);
  return node;
}

/**
 * The whole command surface, generated from the parser rather than restated.
 *
 * Hand-written references drift the moment a flag is added, and an agent that
 * has been given a stale one composes commands the CLI rejects. Walking the
 * commander tree means the manifest is wrong only if the CLI is.
 */
function commandTree(program: Command): CommandNode[] {
  return program.commands
    .filter((command) => command.name() !== "help")
    .map(describeCommand);
}

const ENVELOPE = {
  stdout: "Exactly one line of JSON, terminated by a newline. Nothing else is written to stdout.",
  stderr: "Human-readable noise only, and progress lines under --progress. Never parse it.",
  success: {
    schemaVersion: "integer, currently 1. A breaking change to any shape increments it.",
    ok: "true",
    command: "the command path that produced this, for example \"observed show\"",
    data: "the payload, shaped per command",
    next: "optional array of literal commands that act on what was just returned",
  },
  failure: {
    schemaVersion: "integer, currently 1",
    ok: "false",
    command: "the command path that failed",
    error: {
      code: "stable machine identifier, safe to branch on",
      message: "written for a person, changes freely, never branch on it",
      remedy: "what to do about it, or absent",
      exitCode: "the process exit code that accompanies this failure",
    },
  },
  rules: [
    "Branch on error.code. Never match on error.message.",
    "Absent keys are omitted rather than sent as null, so test for presence.",
    "Empty arrays are omitted for the same reason.",
    "next names literal commands computed from the state just fetched. Prefer them over commands you compose.",
    "--agent implies --json and disables colour, paging, prompts, and directory linking.",
  ],
};

const INVOCATION = {
  flag: "--agent",
  environment: {
    CEFENSE_AGENT:
      "Set to 1 to put every invocation in agent mode without the flag. Set to 0 to force it off.",
    CEFENSE_REPO:
      "owner/name used when --repo is absent. This is how a harness avoids repeating --repo.",
    CEFENSE_API_URL: "The Cefense instance to talk to. Defaults to the public one.",
    CEFENSE_TOKEN: "A token to use instead of the keychain. Read-only, never written.",
  },
  notes: [
    "Agent mode does not resolve the working directory to a repository. Pass --repo or set CEFENSE_REPO.",
    "Agent mode never prompts. A command that would have asked fails with confirmation_required instead.",
    "cf auth login needs a browser and cannot be completed by an agent.",
  ],
};

const EXIT_CODES = [
  { code: EXIT_OK, meaning: "The command did what was asked." },
  {
    code: EXIT_FINDINGS,
    meaning: "Findings are present, and --exit-code was passed. Only ever from a findings listing.",
  },
  { code: EXIT_USAGE, meaning: "The command was wrong, or consent is missing. Do not retry unchanged." },
  { code: EXIT_AUTH, meaning: "Not signed in. Only the user can fix this." },
  { code: EXIT_API, meaning: "The API refused or failed. Read error.code before deciding to retry." },
  { code: EXIT_INTERRUPTED, meaning: "Interrupted." },
];

const ENUMS = {
  severity: {
    filter: ["critical", "high", "watch", "info"],
    wire: ["critical", "high", "medium", "low"],
    note: "Filters take either spelling. Findings carry severity (wire) and severityLabel (for people). Report the label, filter on the wire value.",
  },
  category: ["code", "dependency", "secret", "misconfig", "os-package"],
  checks: {
    values: ["sast", "sca", "secrets", "iac", "quality", "sbom"],
    presets: ["essentials", "balanced", "everything"],
    unavailable: ["runtime"],
    note: "runtime is named in the product but needs an agent inside a running workload, so a repository scan cannot run it.",
  },
  scanMode: ["manual", "push", "scheduled"],
  scanInterval: ["1h", "6h", "12h", "24h", "168h"],
  scanDepth: ["default", "max"],
  scanStatus: ["queued", "running", "completed", "failed", "cancelled"],
  fixStatus: [
    "generating",
    "ready",
    "failed",
    "skipped",
    "publishing",
    "opened",
    "merged",
    "closed",
  ],
  triage: ["open", "false-positive", "accepted-risk"],
  mergeMethod: ["merge", "squash", "rebase"],
  sbomFormat: ["cyclonedx", "spdx"],
  auditCategory: [
    "scan",
    "finding",
    "fix",
    "proof",
    "repository",
    "settings",
    "export",
    "account",
    "integration",
  ],
  provider: ["github", "gitlab", "bitbucket"],
};

const GATES = [
  {
    command: "cf fix publish",
    requires: "--yes",
    effect: "Opens a real pull request on the user's repository.",
    rule: "Ask in the conversation first, and show the diff and the file it touches.",
  },
  {
    command: "cf fix merge",
    requires: "--yes",
    effect: "Lands code on the repository's default branch.",
    rule: "A separate ask from publishing. Agreeing to open a pull request is not agreeing to merge it.",
  },
  {
    command: "cf skill install",
    requires: "--yes",
    effect: "Writes files into the repository, or into the user's home directory with --global.",
    rule: "Say which files before asking.",
  },
  {
    command: "cf triage",
    requires: "the user's explicit decision",
    effect: "Records a judgement about risk against the user's account.",
    rule: "Never triage to make a report look cleaner, and never in bulk.",
  },
  {
    command: "cf scan --url",
    requires: "the user's agreement",
    effect: "Connects a new repository to the user's account.",
    rule: "Ask exactly as you would before opening a pull request.",
  },
  {
    command: "cf settings",
    requires: "the user's agreement",
    effect: "Changes what is scanned, how often, and how hard. This is the user's policy.",
    rule: "Turning on push or scheduled spends their scans. Turning on max depth makes every scan much slower.",
  },
];

const WORKFLOWS = [
  {
    name: "triage",
    goal: "Report what is wrong with a repository, worst first, with evidence.",
    steps: [
      "cf observed --repo <owner/name> --severity critical,high --agent",
      "cf observed show <finding-id> --repo <owner/name> --agent",
    ],
    note: "The listing is a summary. Read the detail, and read dataflow, before forming an opinion about whether a finding is reachable.",
  },
  {
    name: "patch-one",
    goal: "Close a single finding, with the user watching.",
    steps: [
      "cf observed show <finding-id> --repo <owner/name> --agent",
      "cf fix generate <finding-id> --wait --agent",
      "cf fix publish <finding-id> --yes --agent",
      "cf fix merge <finding-id> --yes --agent",
      "cf scan --repo <owner/name> --wait --agent",
    ],
    note: "Read data.fix.diff before publishing. A generated patch is a proposal, and saying it is wrong is a useful answer.",
  },
  {
    name: "ci-gate",
    goal: "Fail a pipeline when a critical or high finding is present.",
    steps: [
      "cf scan --repo <owner/name> --wait --agent",
      "cf observed --repo <owner/name> --severity critical,high --exit-code --agent",
    ],
    note: "Branch on the exit code, never on the output. Do not put --yes in a pipeline.",
  },
  {
    name: "regression-check",
    goal: "Answer when a vulnerability arrived and whether a fix closed anything.",
    steps: [
      "cf commits --repo <owner/name> --agent",
      "cf observed --repo <owner/name> --scan <scan-id> --agent",
    ],
    note: "Read `scanned` before calling a commit clean. An unscanned commit is unknown, not safe.",
  },
];

export async function agentSchema(globals: GlobalOptions, program: Command): Promise<number> {
  const payload = {
    cli: {
      name: "cefense",
      aliases: ["cf"],
      version: VERSION,
      package: "@cefense-npm/cefense-cli",
      node: ">=22.12.0",
      documentation: "https://agent.cefense.com",
    },
    schemaVersion: AGENT_SCHEMA_VERSION,
    invocation: INVOCATION,
    envelope: ENVELOPE,
    exitCodes: EXIT_CODES,
    errors: ERROR_CODES,
    preconditions: PRECONDITION_CODES,
    enums: ENUMS,
    gates: GATES,
    workflows: WORKFLOWS,
    commands: commandTree(program),
  };

  if (globals.agent) {
    out.agentEmit(payload, ["cf agent check --agent"]);
    return 0;
  }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return 0;
}

/**
 * One call that answers "can I proceed, and if not, what has to happen first".
 *
 * The alternative is the dance every agent otherwise invents: run something,
 * read the failure, run cf auth status, run cf repo list, guess. Each of those
 * is a round trip and a chance to misread. This collapses them into one
 * envelope whose `blockers` say plainly which of them need a human.
 */
export async function agentCheck(globals: GlobalOptions): Promise<number> {
  const blockers: Array<Record<string, unknown>> = [];
  const next: string[] = [];

  const session = await openSession(globals, { auth: false, discovery: true }).catch(() => null);

  if (!session) {
    out.agentEmit(
      {
        cli: { version: VERSION, schemaVersion: AGENT_SCHEMA_VERSION },
        reachable: false,
        ready: false,
        blockers: [
          {
            code: "api_error",
            what: "The Cefense instance could not be reached.",
            resolvedBy: "agent",
            remedy: "Retry once, then report it. Check CEFENSE_API_URL if it is set.",
          },
        ],
      },
      ["cf agent check --agent"],
    );
    return EXIT_API;
  }

  const authenticated = Boolean(session.credentials);
  if (!authenticated) {
    blockers.push({
      code: "auth_required",
      what: `Not signed in to ${session.apiUrl}.`,
      resolvedBy: "user",
      remedy: "Ask the user to run cf auth login. It opens a browser, so you cannot do it for them.",
    });
    next.push("cf auth status --agent");
  }

  let identity: Record<string, unknown> | null = null;
  let projects: Project[] = [];
  if (authenticated) {
    const me = await session.client.me().catch(() => null);
    if (me) identity = { email: me.user.email, userId: me.user.id };
    projects = await session.client
      .projects()
      .then((response) => response.projects)
      .catch(() => []);
  }

  // Agent mode deliberately ignores the linked directory, so the only two
  // places a repository can come from are the flag and the environment. Saying
  // which one answered is what lets a harness that set CEFENSE_REPO once
  // confirm it took, rather than re-passing --repo defensively.
  const requestedFlag = globals.repo ?? null;
  const requestedEnv = process.env.CEFENSE_REPO?.trim() || null;
  const requested = requestedFlag ?? requestedEnv;
  const resolved = requested ? matchProject(projects, requested) : null;

  if (authenticated && projects.length === 0) {
    blockers.push({
      code: "no_repositories",
      what: "No repository is connected to this account.",
      resolvedBy: "agent",
      remedy:
        "Run cf provider list --agent, then cf repo connect <owner/name> --agent. Connecting the code host account itself needs a browser.",
    });
    next.push("cf provider list --agent");
  }

  if (requested && authenticated && projects.length > 0 && !resolved) {
    blockers.push({
      code: "repository_not_connected",
      what: `${requested} is not connected to this account.`,
      resolvedBy: "agent",
      remedy: "Run cf repo list --agent for the names that are, then connect it or use one of those.",
    });
    next.push("cf repo list --agent");
  }

  if (!requested && authenticated && projects.length > 0) {
    blockers.push({
      code: "repository_not_specified",
      what: "No repository was named, and agent mode does not infer one from the directory.",
      resolvedBy: "agent",
      remedy: "Pass --repo owner/name, or set CEFENSE_REPO once for the session.",
    });
    next.push("cf repo list --agent");
  }

  if (resolved && !resolved.scan) {
    blockers.push({
      code: "not_scanned",
      what: `${resolved.fullName} has never been scanned, so there are no findings to read.`,
      resolvedBy: "agent",
      remedy: `Run cf scan --repo ${resolved.fullName} --wait --agent.`,
    });
    next.push(`cf scan --repo ${resolved.fullName} --wait --agent`);
  }

  const ready = blockers.length === 0;
  if (ready && resolved) {
    next.push(`cf observed --repo ${resolved.fullName} --severity critical,high --agent`);
  }

  out.agentEmit(
    {
      cli: { version: VERSION, schemaVersion: AGENT_SCHEMA_VERSION },
      apiUrl: session.apiUrl,
      reachable: true,
      authenticated,
      identity,
      agentMode: true,
      repository: resolved ? compactProject(resolved) : null,
      requestedRepository: requested,
      repositorySource: requestedFlag ? "flag" : requestedEnv ? "CEFENSE_REPO" : null,
      repositoryCount: projects.length,
      providers: PROVIDERS,
      ready,
      blockers,
    },
    next,
  );

  return ready ? EXIT_OK : EXIT_USAGE;
}
