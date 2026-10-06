#!/usr/bin/env node

const ignoreEpipe = (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
};
process.stdout.on("error", ignoreEpipe);
process.stderr.on("error", ignoreEpipe);
import { Command, CommanderError, Option } from "commander";
import { CancelledError, EXIT_INTERRUPTED, isCefenseError } from "./core/errors.js";
import type { GlobalOptions } from "./core/session.js";
import { c, glyph, setColorEnabled } from "./ui/theme.js";
import { isAgentMode, setAgentMode } from "./ui/mode.js";
import { setOrganizationFlag } from "./core/organizations.js";
import * as out from "./ui/output.js";
import { setPagerEnabled } from "./ui/pager.js";
import { setColumnFilter } from "./ui/list.js";
import {
  CfCommand,
  anyOf,
  commandPathFromArgv,
  oneOf,
  printVersion,
  stderrHasColors,
  stdoutHasColors,
} from "./ui/help.js";
import { GLOBAL_FLAGS } from "./ui/helpContent.js";
import { PROVIDERS } from "./core/providers.js";
import { authLogin, authLogout, authStatus } from "./commands/auth.js";
import { repoConnect, repoDisconnect, repoList, repoSetDefault } from "./commands/repo.js";
import { repoView } from "./commands/repoview.js";
import { orgList, orgShow, orgUse } from "./commands/org.js";
import { PAID_BILLING_PLANS, planPortal, planShow, planUpgrade } from "./commands/plan.js";
import {
  notificationsRepository,
  notificationsSet,
  notificationsShow,
} from "./commands/notifications.js";
import { statusCommand } from "./commands/status.js";
import { scanCommand } from "./commands/scan.js";
import { branchesCommand } from "./commands/branches.js";
import { commitsCommand } from "./commands/commits.js";
import {
  CHECKS,
  CHECK_PRESETS,
  SCAN_DEPTHS,
  SCAN_INTERVALS,
  SCAN_MODES,
  settingsChecks,
  settingsDepth,
  settingsInterval,
  settingsMode,
  settingsShow,
} from "./commands/settings.js";
import { providerConnect, providerDisconnect, providerList } from "./commands/provider.js";
import { AUDIT_CATEGORIES, auditCommand } from "./commands/audit.js";
import { triageCommand } from "./commands/triage.js";
import { sbomCommand } from "./commands/sbom.js";
import {
  FINDING_CATEGORIES,
  reproducedCommand,
  reproducedShow,
  requireLimit,
} from "./commands/reproduced.js";
import { fixCommand } from "./commands/fix.js";
import { fixGenerate, fixMerge, fixPublish, fixShow } from "./commands/fixcmds.js";
import { proofAttest, proofCommand, proofRun, proofShow } from "./commands/proof.js";
import { proofEnvList, proofEnvSet, proofEnvUnset } from "./commands/proofenv.js";
import { skillInstall, skillList, skillShow, skillUninstall } from "./commands/skill.js";
import { agentCheck, agentSchema } from "./commands/agent.js";
import { browseCommand } from "./commands/browse.js";
import { completionScript, SHELLS } from "./commands/completion.js";

const program = new CfCommand();

function withGlobals(command: Command): Command {
  for (const flag of GLOBAL_FLAGS) command.option(flag.flags, flag.description);
  return command;
}

function globalsFrom(command: Command): GlobalOptions {
  const own = command.opts<Record<string, unknown>>();
  const root = program.opts<Record<string, unknown>>();
  const pick = <T>(key: string): T | undefined =>
    (own[key] as T | undefined) ?? (root[key] as T | undefined);

  const agent = Boolean(pick<boolean>("agent")) || envAgentMode();

  const globals: GlobalOptions = {
    repo: pick<string>("repo"),
    org: pick<string>("org"),
    columns: pick<string>("columns"),
    fields: pick<string>("fields"),
    web: Boolean(pick<boolean>("web")),
    pager: agent ? false : own.pager !== false && root.pager !== false,
    json: agent || Boolean(pick<boolean>("json")),
    agent,
    color: agent || own.color === false || root.color === false ? false : true,
    verbose: Boolean(pick<boolean>("verbose")),
    yes: Boolean(pick<boolean>("yes")),
    noLink: agent || own.link === false || root.link === false,
  };

  const noColorEnv = Boolean(process.env.NO_COLOR);
  setAgentMode(agent);
  setOrganizationFlag(globals.org);
  setColorEnabled(globals.color !== false && !noColorEnv && Boolean(process.stdout.isTTY || process.env.FORCE_COLOR));
  out.setJsonMode(Boolean(globals.json));
  out.setCommandName(commandPath(command));
  setPagerEnabled(globals.pager !== false);
  setColumnFilter(globals.columns);
  out.setFieldFilter(agent ? globals.fields : undefined);
  return globals;
}

/**
 * Agent mode from the environment, so a harness sets it once rather than
 * hoping every composed command carries the flag.
 *
 * A forgotten --agent is not a small mistake: it hands back a rendered view
 * with colour and a pager where JSON was expected, which an agent then tries
 * to parse.
 */
function envAgentMode(): boolean {
  const raw = process.env.CEFENSE_AGENT?.trim().toLowerCase();
  if (!raw) return false;
  return raw !== "0" && raw !== "false" && raw !== "no" && raw !== "off";
}

function commandPath(command: Command): string {
  const parts: string[] = [];
  let node: Command | null = command;
  while (node && node.name() !== "cefense") {
    parts.unshift(node.name());
    node = node.parent;
  }
  return parts.join(" ") || "cefense";
}

function run(handler: (globals: GlobalOptions, command: Command) => Promise<number>) {
  return async function (this: Command, ...args: unknown[]) {
    const command = args[args.length - 1] as Command;
    const globals = globalsFrom(command);
    try {
      process.exitCode = await handler(globals, command);
    } catch (error) {
      if (globals.agent) {
        out.agentError(error);
        process.exitCode = isCefenseError(error) ? error.exitCode : 4;
        return;
      }
      if (error instanceof CancelledError) {
        process.exitCode = EXIT_INTERRUPTED;
        out.line(`${c.dim(glyph.cross)} Cancelled.`);
        return;
      }
      out.renderError(error);
      if (globals.verbose && error instanceof Error && error.stack) {
        process.stderr.write(`${error.stack}\n`);
      }
      process.exitCode = isCefenseError(error) ? error.exitCode : 4;
    }
  };
}

setAgentMode(process.argv.includes("--agent") || envAgentMode());

program
  .name("cefense")
  .description("Scan repositories, read what was found, and fix it with a pull request")
  .option("-v, --version", "Show cf version")
  .helpOption("-h, --help", "Show help for command")
  .showSuggestionAfterError(true)
  .exitOverride()
  .configureOutput({
    getOutHasColors: stdoutHasColors,
    getErrHasColors: stderrHasColors,
  })
  .on("option:version", () => {
    printVersion();
    throw new CommanderError(0, "commander.version", "(version)");
  });

withGlobals(program);

const auth = program.command("auth").description("Sign in to Cefense and out again");

withGlobals(auth.command("login"))
  .description("Sign in to Cefense in your browser")
  .option("--force", "Sign in again even if a token is already stored")
  .action(run((globals, command) => authLogin(globals, { force: Boolean(command.opts().force) })));

withGlobals(auth.command("logout"))
  .description("Revoke the stored token and forget it")
  .option("--all", "Sign out of every stored instance")
  .action(run((globals, command) => authLogout(globals, { all: Boolean(command.opts().all) })));

withGlobals(auth.command("status"))
  .description("Show who you are signed in as")
  .action(run((globals) => authStatus(globals)));

const org = program.command("org").description("Choose the organization commands act on");

withGlobals(org.command("list", { isDefault: true }))
  .description("List the organizations this account belongs to")
  .action(run((globals) => orgList(globals)));

withGlobals(org.command("use"))
  .argument("<slug>", "The organization every command should act on")
  .description("Remember an organization for this Cefense instance")
  .action(run((globals, command) => orgUse(globals, command.args[0])));

withGlobals(org.command("show"))
  .description("Show the organization commands act on, and where that choice came from")
  .action(run(() => orgShow()));

const plan = withGlobals(program.command("plan"))
  .description("Show the organization's plan and what is left of its allowance")
  .action(run((globals) => planShow(globals)));

withGlobals(plan.command("upgrade"))
  .argument("<plan>", oneOf(PAID_BILLING_PLANS))
  .description("Start a checkout for a plan and print the URL that completes it")
  .option("--yearly", "Bill yearly instead of monthly")
  .option("--seats <n>", "Seats beyond the ones the plan includes")
  .action(
    run((globals, command) =>
      planUpgrade(globals, command.args[0], {
        yearly: Boolean(command.opts().yearly),
        seats: command.opts().seats,
      }),
    ),
  );

withGlobals(plan.command("portal"))
  .description("Print the billing portal URL for invoices, payment method, seats, and cancellation")
  .action(run((globals) => planPortal(globals)));

const notifications = withGlobals(program.command("notifications"))
  .alias("notify")
  .description("Choose what Cefense emails you about")
  .action(run((globals) => notificationsShow(globals)));

withGlobals(notifications.command("set"))
  .argument("<kind>", "One of scan_report, scan_failed, advisory, fix_pr_opened, or immunity")
  .description("Turn a notification on or off, or change its severity floor")
  .option("--on", "Send this one")
  .option("--off", "Stop sending this one")
  .option("--severity <level>", "Only send at this severity or above")
  .option("--cadence <rate>", "One of every, or daily for at most one a day")
  .action(
    run((globals, command) =>
      notificationsSet(globals, command.args[0], {
        on: Boolean(command.opts().on),
        off: Boolean(command.opts().off),
        severity: command.opts().severity,
        cadence: command.opts().cadence,
      }),
    ),
  );

withGlobals(notifications.command("mute"))
  .argument("<repository>", "The owner/name to silence")
  .description("Stop emailing about one repository without changing anything else")
  .action(run((globals, command) => notificationsRepository(globals, command.args[0], { mute: true })));

withGlobals(notifications.command("repo"))
  .argument("<repository>", "The owner/name to make an exception for")
  .description("Give one repository its own severity floor")
  .option("--severity <level>", "Only send at this severity or above")
  .option("--mute", "Send nothing at all for this repository")
  .option("--reset", "Go back to the default settings")
  .action(
    run((globals, command) =>
      notificationsRepository(globals, command.args[0], {
        severity: command.opts().severity,
        mute: Boolean(command.opts().mute),
        reset: Boolean(command.opts().reset),
      }),
    ),
  );

const repo = program.command("repo").description("Connect, list, and view repositories");

withGlobals(repo.command("connect"))
  .argument("[repository]", "The owner/name to connect without prompting")
  .description("Connect a repository and start its first scan")
  .option("--provider <host>", oneOf(PROVIDERS))
  .option("--no-watch", "Queue the scan without following its progress")
  .action(
    run((globals, command) =>
      repoConnect(globals, command.args[0], {
        watch: command.opts().watch !== false,
        provider: command.opts().provider,
      }),
    ),
  );

withGlobals(repo.command("list"))
  .description("List connected repositories")
  .action(run((globals) => repoList(globals)));

withGlobals(repo.command("view"))
  .argument("[repository]", "The owner/name to show, otherwise the one this directory acts on")
  .description("Show one repository, its last scan, and how it is scanned")
  .action(run((globals, command) => repoView(globals, command.args[0])));

withGlobals(repo.command("set-default"))
  .argument("[repository]", "The owner/name to use in this directory")
  .description("Choose the repository this directory acts on")
  .option("--unset", "Clear the default for this directory")
  .action(
    run((globals, command) =>
      repoSetDefault(globals, command.args[0], { unset: Boolean(command.opts().unset) }),
    ),
  );

withGlobals(repo.command("disconnect"))
  .argument("[repository]", "The owner/name to disconnect")
  .description("Disconnect a repository, or a whole code host account")
  .option("--account", "Disconnect the code host account instead of one repository")
  .option("--provider <host>", `With --account, ${oneOf(PROVIDERS).toLowerCase()}`)
  .action(
    run((globals, command) =>
      repoDisconnect(globals, command.args[0], {
        account: Boolean(command.opts().account),
        provider: command.opts().provider,
      }),
    ),
  );

const provider = program
  .command("provider")
  .description("Connect the code hosts your repositories live on");

withGlobals(provider.command("list", { isDefault: true }))
  .description("Show GitHub, GitLab, and Bitbucket, and which are connected")
  .action(run((globals) => providerList(globals)));

withGlobals(provider.command("connect"))
  .argument("[host]", oneOf(PROVIDERS))
  .description("Connect a code host account")
  .action(run((globals, command) => providerConnect(globals, command.args[0])));

withGlobals(provider.command("disconnect"))
  .argument("[host]", oneOf(PROVIDERS))
  .description("Disconnect a code host account")
  .action(run((globals, command) => providerDisconnect(globals, command.args[0])));

withGlobals(program.command("status"))
  .description("Show repositories, scans, and findings at a glance")
  .option("--watch", "Keep polling even when nothing is scanning")
  .action(run((globals, command) => statusCommand(globals, { watch: Boolean(command.opts().watch) })));

withGlobals(program.command("scan"))
  .description("Rescan a repository")
  .option("--branch <name>", "Scan a branch other than the default")
  .option("--url <repository-url>", "Connect a GitHub repository by URL and scan it")
  .option("--no-watch", "Queue the scan without following its progress")
  .option("--wait", "Block until the scan finishes")
  .option("--progress", "With --wait, write one JSON progress line per poll to stderr")
  .action(
    run((globals, command) =>
      scanCommand(globals, {
        branch: command.opts().branch,
        url: command.opts().url,
        watch: command.opts().watch !== false,
        wait: Boolean(command.opts().wait),
        progress: Boolean(command.opts().progress),
      }),
    ),
  );

withGlobals(program.command("branches"))
  .description("Show every branch and the last scan of each")
  .action(run((globals) => branchesCommand(globals)));

withGlobals(program.command("commits"))
  .description("Show commits and what each scanned commit introduced")
  .option("--branch <name>", "Read the history of a branch other than the default")
  .option("--limit <n>", "Show at most this many commits", requireLimit)
  .action(
    run((globals, command) =>
      commitsCommand(globals, {
        limit: command.opts().limit,
        branch: command.opts().branch,
      }),
    ),
  );

withGlobals(program.command("triage"))
  .argument("<finding-id>", "The finding to record a decision about")
  .argument("<decision>", "One of open, false-positive, or accepted-risk")
  .description("Record whether a finding is real, and whether you accept it")
  .option("--note <text>", "Why, kept with the decision")
  .action(
    run((globals, command) =>
      triageCommand(globals, command.args[0] as string, command.args[1] as string, {
        note: command.opts().note,
      }),
    ),
  );

withGlobals(program.command("audit"))
  .description("Show what has happened on this account, newest first")
  .option("--limit <n>", "Maximum events to fetch", requireLimit)
  .option("--before <timestamp>", "Only events older than this ISO timestamp")
  .option("--category <list>", `${anyOf(AUDIT_CATEGORIES)}, comma separated`)
  .action(
    run((globals, command) =>
      auditCommand(globals, {
        limit: command.opts().limit,
        before: command.opts().before,
        category: command.opts().category,
      }),
    ),
  );

function findingsOptions(command: Command): Command {
  return withGlobals(command)
    .addOption(
      new Option(
        "--severity <list>",
        "Any of critical, high, watch, or info, comma separated (medium and low work too)",
      ),
    )
    .addOption(new Option("--category <list>", `${anyOf(FINDING_CATEGORIES)}, comma separated`))
    .option("--branch <name>", "Read the findings of a branch's last scan")
    .option("--scan <id>", "Read the findings of one scan")
    .option("--limit <n>", "Maximum findings to fetch", requireLimit)
    .option("--exit-code", "Exit 1 when a critical or high finding is present");
}

function listFindings(onlyMatched: boolean) {
  return run((globals, command) =>
    reproducedCommand(globals, {
      severity: command.opts().severity,
      category: command.opts().category,
      limit: command.opts().limit,
      matched: onlyMatched ? undefined : command.opts().matched,
      branch: command.opts().branch,
      scanId: command.opts().scan,
      exitCode: Boolean(command.opts().exitCode),
      ...(onlyMatched ? { onlyMatched: true } : {}),
    }),
  );
}

function viewFinding(command: Command): Command {
  return withGlobals(command)
    .argument("<finding-id>", "A finding id, or its first few characters")
    .option("--branch <name>", "Read the finding from a branch's last scan")
    .option("--scan <id>", "Read the finding from one scan")
    .action(
      run((globals, command) =>
        reproducedShow(globals, command.args[0] as string, {
          branch: command.opts().branch,
          scanId: command.opts().scan,
        }),
      ),
    );
}

const finding = program.command("finding").description("List and read the findings in your code");

findingsOptions(finding.command("list"))
  .description("List the findings in a repository, worst first")
  .option("--matched", "Only findings joined to security research")
  .action(listFindings(false));

viewFinding(finding.command("view"))
  .alias("show")
  .description("Show one finding with its research, data flow, and fix");

findingsOptions(finding.command("matched"))
  .description("List only the findings joined to the research that explains them")
  .action(listFindings(true));

const reproduced = findingsOptions(program.command("reproduced", { hidden: true }))
  .description("Browse the findings in your code, the same as cf finding list")
  .option("--matched", "Only findings joined to security research")
  .action(listFindings(false));

viewFinding(reproduced.command("show")).description(
  "Show one finding with its research, data flow, and fix, the same as cf finding view",
);

findingsOptions(program.command("matched", { hidden: true }))
  .description("Findings joined to the research that explains them, the same as cf finding matched")
  .action(listFindings(true));

const fix = withGlobals(program.command("fix"))
  .description("Generate patches for findings and open pull requests")
  .action(run((globals) => fixCommand(globals)));

withGlobals(fix.command("show"))
  .argument("<finding-id>", "The finding whose patch you want")
  .description("Show the patch generated for one finding")
  .action(run((globals, command) => fixShow(globals, command.args[0] as string)));

withGlobals(fix.command("generate"))
  .argument("<finding-id>", "The finding to patch")
  .description("Generate a patch for one finding")
  .option("--wait", "Poll until the patch is ready or fails")
  .action(
    run((globals, command) =>
      fixGenerate(globals, command.args[0] as string, { wait: Boolean(command.opts().wait) }),
    ),
  );

withGlobals(fix.command("publish"))
  .argument("<finding-id>", "The finding whose patch to open a pull request for")
  .description("Open a pull request with a generated patch")
  .action(run((globals, command) => fixPublish(globals, command.args[0] as string)));

withGlobals(fix.command("merge"))
  .argument("[finding-id]", "The finding whose pull request to merge")
  .description("Merge the pull request and delete its branch")
  .addOption(new Option("--method <method>", "One of merge, squash, or rebase").default("squash"))
  .option("--no-delete-branch", "Keep the branch after merging")
  .action(
    run((globals, command) =>
      fixMerge(globals, command.args[0], {
        method: command.opts().method,
        deleteBranch: command.opts().deleteBranch !== false,
      }),
    ),
  );

const proof = withGlobals(program.command("proof"))
  .description("Replay the evidence against a patch and record the verdict")
  .action(run((globals) => proofCommand(globals)));

withGlobals(proof.command("show"))
  .argument("<finding-id>", "The finding whose proof you want")
  .description("Show one proof with its checks and witness")
  .action(run((globals, command) => proofShow(globals, command.args[0] as string)));

withGlobals(proof.command("run"))
  .argument("<finding-id>", "The finding whose patch to prove")
  .description("Replay the recorded evidence against the generated patch")
  .option("--wait", "Poll until the proof settles or fails")
  .action(
    run((globals, command) =>
      proofRun(globals, command.args[0] as string, { wait: Boolean(command.opts().wait) }),
    ),
  );

withGlobals(proof.command("attest"))
  .argument("<finding-id>", "The finding whose credential rotation to attest")
  .description("Record by hand that a leaked credential was rotated")
  .option("--note <text>", "Why you are attesting, kept in the audit log")
  .action(
    run((globals, command) =>
      proofAttest(globals, command.args[0] as string, { note: command.opts().note }),
    ),
  );

const proofEnv = withGlobals(proof.command("env"))
  .description("List the environment a proof run needs to boot the app, by name only")
  .action(run((globals) => proofEnvList(globals)));

withGlobals(proofEnv.command("set"))
  .argument("<name>", "The variable name, for example DATABASE_URL")
  .description("Store a value for a proof run to use, write-only")
  .option("--stdin", "Read the value from stdin")
  .option("--from-env", "Read the value from the variable of the same name in this shell")
  .action(
    run((globals, command) =>
      proofEnvSet(globals, command.args[0] as string, {
        stdin: Boolean(command.opts().stdin),
        fromEnv: Boolean(command.opts().fromEnv),
      }),
    ),
  );

withGlobals(proofEnv.command("unset"))
  .argument("<name>", "The variable to delete")
  .description("Delete a stored value")
  .action(run((globals, command) => proofEnvUnset(globals, command.args[0] as string)));

const settings = withGlobals(program.command("settings"))
  .description("Choose when this repository is scanned and which checks run")
  .action(run((globals) => settingsShow(globals)));

const scanModes = SCAN_MODES.filter((entry) => entry.ready).map((entry) => entry.id);
const scanIntervals = SCAN_INTERVALS.map((entry) => entry.id);

withGlobals(settings.command("mode"))
  .argument("[mode]", oneOf(scanModes))
  .description("Choose what triggers a scan")
  .option("--every <interval>", `With scheduled, ${oneOf(scanIntervals).toLowerCase()}`)
  .action(
    run((globals, command) =>
      settingsMode(globals, command.args[0], { every: command.opts().every }),
    ),
  );

withGlobals(settings.command("every"))
  .argument("[interval]", oneOf(scanIntervals))
  .description("Scan on a schedule, this often")
  .action(run((globals, command) => settingsInterval(globals, command.args[0])));

withGlobals(settings.command("depth"))
  .argument("[depth]", oneOf(SCAN_DEPTHS.map((entry) => entry.id)))
  .description("Choose how hard each scan looks")
  .action(run((globals, command) => settingsDepth(globals, command.args[0])));

withGlobals(settings.command("checks"))
  .argument(
    "[checks...]",
    `${anyOf(CHECKS.filter((check) => check.available).map((check) => check.id))}, or a preset: ${Object.keys(CHECK_PRESETS).join(", ")}`,
  )
  .description("Choose which checks run on each scan")
  .option("--add", "Turn these on and leave the rest alone")
  .option("--remove", "Turn these off and leave the rest alone")
  .action(
    run((globals, command) =>
      settingsChecks(globals, command.args, {
        add: Boolean(command.opts().add),
        remove: Boolean(command.opts().remove),
      }),
    ),
  );

withGlobals(program.command("sbom"))
  .description("Export the component inventory of the last scan")
  .addOption(new Option("--format <format>", "One of cyclonedx or spdx").default("cyclonedx"))
  .option("--output <file>", "Write to a file instead of stdout")
  .option("--scan <id>", "Export one scan rather than the newest with components")
  .action(
    run((globals, command) =>
      sbomCommand(globals, {
        format: command.opts().format,
        output: command.opts().output,
        scan: command.opts().scan,
      }),
    ),
  );

const skill = program
  .command("skill")
  .description("Teach your coding agent to use Cefense");

withGlobals(skill.command("install", { isDefault: true }))
  .argument("[agents...]", "Any of claude, cursor, copilot, antigravity, windsurf, devin, cline, gemini, or agents")
  .description("Write the Cefense skill into your coding agents")
  .option("--all", "Write it for every supported agent, detected or not")
  .option("--global", "Write it once for your user instead of this repository")
  .action(
    run((globals, command) =>
      skillInstall(globals, command.args, {
        all: Boolean(command.opts().all),
        global: Boolean(command.opts().global),
      }),
    ),
  );

withGlobals(skill.command("list"))
  .description("Show every supported agent, and what is installed here")
  .action(run((globals) => skillList(globals)));

withGlobals(skill.command("show"))
  .argument("[agent]", "Render it the way one agent expects")
  .description("Print the skill without writing it anywhere")
  .action(run((globals, command) => skillShow(globals, command.args[0])));

withGlobals(skill.command("uninstall"))
  .argument("[agents...]", "Leave empty to remove it everywhere")
  .description("Remove the Cefense skill")
  .option("--all", "Remove it for every supported agent")
  .option("--global", "Remove the user-wide copy instead")
  .action(
    run((globals, command) =>
      skillUninstall(globals, command.args, {
        all: Boolean(command.opts().all),
        global: Boolean(command.opts().global),
      }),
    ),
  );

const agent = program
  .command("agent")
  .description("Describe this CLI to a coding agent");

withGlobals(agent.command("schema", { isDefault: true }))
  .description("Print the whole command surface, envelope, error codes, and gates as JSON")
  .action(run((globals) => agentSchema(globals, program)));

withGlobals(agent.command("check"))
  .description("Say whether an agent can proceed here, and if not, what has to happen first")
  .action(run((globals) => agentCheck(globals)));

withGlobals(program.command("browse"))
  .argument("[finding-id]", "A finding id to open, or its first few characters")
  .description("Open the workspace, or one finding, in your browser")
  .option("-n, --no-browser", "Print the address instead of opening it")
  .option("--code", "Open the repository, or the finding's lines, on its code host instead")
  .action(
    run((globals, command) =>
      browseCommand(globals, command.args[0], {
        browser: command.opts().browser !== false,
        code: Boolean(command.opts().code),
      }),
    ),
  );

withGlobals(program.command("completion"))
  .argument("<shell>", oneOf(SHELLS))
  .description("Print a shell completion script")
  .action(
    run(async (_globals, command) => {
      process.stdout.write(completionScript(program, String(command.args[0]), ["cf", "cefense"]));
      return 0;
    }),
  );

program
  .command("help", { hidden: true })
  .argument("[command...]", "The command to explain, for example finding list")
  .description("Show help for a command")
  .action((names: string[]) => {
    let node: Command = program;
    for (const name of names) {
      const next = node.commands.find((child) => child.name() === name || child.aliases().includes(name));
      if (!next) {
        node.args = [name];
        node.error(`error: unknown command '${name}'`, { code: "commander.unknownCommand" });
      }
      node = next;
    }
    node.help();
  });

function crash(error: unknown): void {
  if (isAgentMode()) out.agentError(error);
  else out.renderError(error);
  // The error envelope is queued on stdout, which is asynchronous on a pipe;
  // exiting immediately truncated it and callers saw exit 4 with no output.
  // An empty write's callback runs only after everything queued has flushed.
  const exitCode = isCefenseError(error) ? error.exitCode : 4;
  process.exitCode = exitCode;
  process.stdout.write("", () => process.exit(exitCode));
}

process.on("uncaughtException", crash);
process.on("unhandledRejection", crash);

out.setCommandName(commandPathFromArgv(program, process.argv.slice(2)) || "cefense");

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError) process.exitCode = error.exitCode;
  else crash(error);
}
