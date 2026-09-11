#!/usr/bin/env node

const ignoreEpipe = (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
};
process.stdout.on("error", ignoreEpipe);
process.stderr.on("error", ignoreEpipe);
import { Command, Option } from "commander";
import { CancelledError, EXIT_INTERRUPTED, isCefenseError } from "./core/errors.js";
import type { GlobalOptions } from "./core/session.js";
import { setColorEnabled } from "./ui/theme.js";
import { isAgentMode, setAgentMode } from "./ui/mode.js";
import { setOrganizationFlag } from "./core/organizations.js";
import * as out from "./ui/output.js";
import { setPagerEnabled } from "./ui/pager.js";
import { setColumnFilter } from "./ui/list.js";
import { VERSION } from "./version.js";
import { authLogin, authLogout, authStatus } from "./commands/auth.js";
import { repoConnect, repoDisconnect, repoList, repoSetDefault } from "./commands/repo.js";
import { orgList, orgShow, orgUse } from "./commands/org.js";
import { statusCommand } from "./commands/status.js";
import { scanCommand } from "./commands/scan.js";
import { branchesCommand } from "./commands/branches.js";
import { commitsCommand } from "./commands/commits.js";
import {
  settingsChecks,
  settingsDepth,
  settingsInterval,
  settingsMode,
  settingsShow,
} from "./commands/settings.js";
import { providerConnect, providerDisconnect, providerList } from "./commands/provider.js";
import { auditCommand } from "./commands/audit.js";
import { triageCommand } from "./commands/triage.js";
import { sbomCommand } from "./commands/sbom.js";
import { observedCommand, observedShow, requireLimit } from "./commands/observed.js";
import { fixCommand } from "./commands/fix.js";
import { fixGenerate, fixMerge, fixPublish, fixShow } from "./commands/fixcmds.js";
import { skillInstall, skillList, skillShow, skillUninstall } from "./commands/skill.js";
import { agentCheck, agentSchema } from "./commands/agent.js";
import { completionScript, SHELLS } from "./commands/completion.js";

const program = new Command();

function withGlobals(command: Command): Command {
  return command
    .option("--repo <owner/name>", "repository to act on")
    .option("--org <slug>", "organization to act on")
    .option("--json", "emit JSON instead of a rendered view")
    .option("--agent", "machine mode: compact JSON envelope, structured errors, never interactive")
    .option("--no-color", "disable colour")
    .option("--verbose", "show more detail on failure")
    .option("-y, --yes", "skip confirmation prompts")
    .option("--columns <list>", "only show these columns, comma separated")
    .option("--fields <list>", "with --agent: narrow every list to these keys, comma separated")
    .option("--web", "open the result in a browser instead of printing it")
    .option("--no-pager", "never page long output")
    .option("--no-link", "do not remember this directory's repository");
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
        out.line();
        out.line("  Cancelled.");
        out.line();
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

program
  .name("cefense")
  .description("Connect repositories, run scans, and triage security findings from your terminal.")
  .version(VERSION, "-v, --version")
  .configureHelp({ sortSubcommands: false })
  .showHelpAfterError();

withGlobals(program);

const auth = program.command("auth").description("manage authentication");

withGlobals(auth.command("login"))
  .description("sign in to Cefense in your browser")
  .option("--force", "sign in again even if a token is already stored")
  .action(run((globals, command) => authLogin(globals, { force: Boolean(command.opts().force) })));

withGlobals(auth.command("logout"))
  .description("revoke the stored token and forget it")
  .option("--all", "sign out of every stored instance")
  .action(run((globals, command) => authLogout(globals, { all: Boolean(command.opts().all) })));

withGlobals(auth.command("status"))
  .description("show who you are signed in as")
  .action(run((globals) => authStatus(globals)));

const org = program.command("org").description("choose which organization commands act on");

withGlobals(org.command("list", { isDefault: true }))
  .description("organizations this account belongs to")
  .action(run((globals) => orgList(globals)));

withGlobals(org.command("use"))
  .argument("<slug>", "the organization every command should act on")
  .description("remember an organization for this Cefense instance")
  .action(run((globals, command) => orgUse(globals, command.args[0])));

withGlobals(org.command("show"))
  .description("show the organization commands are acting on, and where it came from")
  .action(run(() => orgShow()));

const repo = program.command("repo").description("manage connected repositories");

withGlobals(repo.command("connect"))
  .argument("[repository]", "owner/name to connect without prompting")
  .description("connect a repository and start its first scan")
  .option("--provider <host>", "github, gitlab, or bitbucket")
  .option("--no-watch", "queue the scan without following its progress")
  .action(
    run((globals, command) =>
      repoConnect(globals, command.args[0], {
        watch: command.opts().watch !== false,
        provider: command.opts().provider,
      }),
    ),
  );

withGlobals(repo.command("list"))
  .description("list connected repositories")
  .action(run((globals) => repoList(globals)));

withGlobals(repo.command("set-default"))
  .argument("[repository]", "owner/name to use in this directory")
  .description("choose the repository this directory acts on")
  .option("--unset", "clear the default for this directory")
  .action(
    run((globals, command) =>
      repoSetDefault(globals, command.args[0], { unset: Boolean(command.opts().unset) }),
    ),
  );

withGlobals(repo.command("disconnect"))
  .argument("[repository]", "owner/name to disconnect")
  .description("disconnect a repository, or a whole code host account")
  .option("--account", "disconnect the code host account instead of one repository")
  .option("--provider <host>", "with --account: github, gitlab, or bitbucket")
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
  .description("connect the code hosts your repositories live on");

withGlobals(provider.command("list", { isDefault: true }))
  .description("show GitHub, GitLab, and Bitbucket, and which are connected")
  .action(run((globals) => providerList(globals)));

withGlobals(provider.command("connect"))
  .argument("[host]", "github, gitlab, or bitbucket")
  .description("connect a code host account")
  .action(run((globals, command) => providerConnect(globals, command.args[0])));

withGlobals(provider.command("disconnect"))
  .argument("[host]", "github, gitlab, or bitbucket")
  .description("disconnect a code host account")
  .action(run((globals, command) => providerDisconnect(globals, command.args[0])));

withGlobals(program.command("status"))
  .description("the workspace dashboard: repositories, scans, findings")
  .option("--watch", "keep polling even when nothing is scanning")
  .action(run((globals, command) => statusCommand(globals, { watch: Boolean(command.opts().watch) })));

withGlobals(program.command("scan"))
  .description("rescan a repository")
  .option("--branch <name>", "scan a branch other than the default")
  .option("--url <repository-url>", "connect a GitHub repository by URL and scan it")
  .option("--no-watch", "queue the scan without following its progress")
  .option("--wait", "block until the scan finishes")
  .option("--progress", "with --wait: write one JSON progress line per poll to stderr")
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
  .description("every branch, and the last scan of each")
  .action(run((globals) => branchesCommand(globals)));

withGlobals(program.command("commits"))
  .description("the commit history, and what each scanned commit introduced")
  .option("--branch <name>", "read the history of a branch other than the default")
  .option("--limit <n>", "show at most this many commits", requireLimit)
  .action(
    run((globals, command) =>
      commitsCommand(globals, {
        limit: command.opts().limit,
        branch: command.opts().branch,
      }),
    ),
  );

withGlobals(program.command("triage"))
  .argument("<finding-id>", "the finding to record a decision about")
  .argument("<decision>", "open, false-positive, or accepted-risk")
  .description("record whether a finding is real, and whether you accept it")
  .option("--note <text>", "why, kept with the decision")
  .action(
    run((globals, command) =>
      triageCommand(globals, command.args[0] as string, command.args[1] as string, {
        note: command.opts().note,
      }),
    ),
  );

withGlobals(program.command("audit"))
  .description("everything that has happened on this account, newest first")
  .option("--limit <n>", "maximum events to fetch", requireLimit)
  .option("--before <timestamp>", "only events older than this ISO timestamp")
  .option("--category <list>", "scan,finding,fix,repository,settings,export,account,integration")
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
    .addOption(new Option("--severity <list>", "critical,high,watch,info (medium and low also accepted)"))
    .addOption(new Option("--category <list>", "code,dependency,secret,misconfig,os-package"))
    .option("--branch <name>", "read the findings of a branch's last scan")
    .option("--scan <id>", "read the findings of one scan")
    .option("--limit <n>", "maximum findings to fetch", requireLimit)
    .option("--exit-code", "exit 1 when a critical or high finding is present");
}

const observed = findingsOptions(program.command("observed"))
  .description("browse the findings in your code")
  .option("--matched", "only findings joined to security research")
  .action(
    run((globals, command) =>
      observedCommand(globals, {
        severity: command.opts().severity,
        category: command.opts().category,
        limit: command.opts().limit,
        matched: command.opts().matched,
        branch: command.opts().branch,
        scanId: command.opts().scan,
        exitCode: Boolean(command.opts().exitCode),
      }),
    ),
  );

withGlobals(observed.command("show"))
  .argument("<finding-id>", "the finding to show in full")
  .description("show one finding with its research, data flow and fix")
  .option("--branch <name>", "read the finding from a branch's last scan")
  .option("--scan <id>", "read the finding from one scan")
  .action(
    run((globals, command) =>
      observedShow(globals, command.args[0] as string, {
        branch: command.opts().branch,
        scanId: command.opts().scan,
      }),
    ),
  );

findingsOptions(program.command("matched"))
  .description("findings joined to the research that explains them")
  .action(
    run((globals, command) =>
      observedCommand(globals, {
        severity: command.opts().severity,
        category: command.opts().category,
        limit: command.opts().limit,
        branch: command.opts().branch,
        scanId: command.opts().scan,
        exitCode: Boolean(command.opts().exitCode),
        onlyMatched: true,
      }),
    ),
  );

const fix = withGlobals(program.command("fix"))
  .description("generate patches for findings and open pull requests")
  .action(run((globals) => fixCommand(globals)));

withGlobals(fix.command("show"))
  .argument("<finding-id>", "the finding whose patch you want")
  .description("show the patch generated for one finding")
  .action(run((globals, command) => fixShow(globals, command.args[0] as string)));

withGlobals(fix.command("generate"))
  .argument("<finding-id>", "the finding to patch")
  .description("generate a patch for one finding")
  .option("--wait", "poll until the patch is ready or fails")
  .action(
    run((globals, command) =>
      fixGenerate(globals, command.args[0] as string, { wait: Boolean(command.opts().wait) }),
    ),
  );

withGlobals(fix.command("publish"))
  .argument("<finding-id>", "the finding whose patch to open a pull request for")
  .description("open a pull request with a generated patch")
  .action(run((globals, command) => fixPublish(globals, command.args[0] as string)));

withGlobals(fix.command("merge"))
  .argument("[finding-id]", "the finding whose pull request to merge")
  .description("merge the pull request and delete its branch")
  .addOption(new Option("--method <method>", "merge, squash, or rebase").default("squash"))
  .option("--no-delete-branch", "keep the branch after merging")
  .action(
    run((globals, command) =>
      fixMerge(globals, command.args[0], {
        method: command.opts().method,
        deleteBranch: command.opts().deleteBranch !== false,
      }),
    ),
  );

const settings = withGlobals(program.command("settings"))
  .description("when this repository is scanned, and which checks run")
  .action(run((globals) => settingsShow(globals)));

withGlobals(settings.command("mode"))
  .argument("[mode]", "manual, push, or scheduled")
  .description("choose what triggers a scan")
  .option("--every <interval>", "with scheduled: 1h, 6h, 12h, 24h, or 168h")
  .action(
    run((globals, command) =>
      settingsMode(globals, command.args[0], { every: command.opts().every }),
    ),
  );

withGlobals(settings.command("every"))
  .argument("[interval]", "1h, 6h, 12h, 24h, or 168h")
  .description("scan on a schedule, this often")
  .action(run((globals, command) => settingsInterval(globals, command.args[0])));

withGlobals(settings.command("depth"))
  .argument("[depth]", "default or max")
  .description("how hard each scan looks")
  .action(run((globals, command) => settingsDepth(globals, command.args[0])));

withGlobals(settings.command("checks"))
  .argument("[checks...]", "sast, sca, secrets, iac, quality, sbom, or a preset")
  .description("choose which checks run on each scan")
  .option("--add", "turn these on and leave the rest alone")
  .option("--remove", "turn these off and leave the rest alone")
  .action(
    run((globals, command) =>
      settingsChecks(globals, command.args, {
        add: Boolean(command.opts().add),
        remove: Boolean(command.opts().remove),
      }),
    ),
  );

withGlobals(program.command("sbom"))
  .description("export the component inventory of the last scan")
  .addOption(new Option("--format <format>", "cyclonedx or spdx").default("cyclonedx"))
  .option("--output <file>", "write to a file instead of stdout")
  .option("--scan <id>", "export one scan rather than the newest with components")
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
  .description("teach your coding agent to use Cefense");

withGlobals(skill.command("install", { isDefault: true }))
  .argument("[agents...]", "claude, cursor, copilot, antigravity, windsurf, devin, cline, gemini, agents")
  .description("write the Cefense skill into your coding agents")
  .option("--all", "write it for every supported agent, detected or not")
  .option("--global", "write it once for your user instead of this repository")
  .action(
    run((globals, command) =>
      skillInstall(globals, command.args, {
        all: Boolean(command.opts().all),
        global: Boolean(command.opts().global),
      }),
    ),
  );

withGlobals(skill.command("list"))
  .description("show every supported agent, and what is installed here")
  .action(run((globals) => skillList(globals)));

withGlobals(skill.command("show"))
  .argument("[agent]", "render it the way one agent expects")
  .description("print the skill without writing it anywhere")
  .action(run((globals, command) => skillShow(globals, command.args[0])));

withGlobals(skill.command("uninstall"))
  .argument("[agents...]", "leave empty to remove it everywhere")
  .description("remove the Cefense skill")
  .option("--all", "remove it for every supported agent")
  .option("--global", "remove the user-wide copy instead")
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
  .description("what an agent needs to drive this CLI without being taught it");

withGlobals(agent.command("schema", { isDefault: true }))
  .description("the whole command surface, envelope, error codes, and gates, as JSON")
  .action(run((globals) => agentSchema(globals, program)));

withGlobals(agent.command("check"))
  .description("can an agent proceed here, and if not, what has to happen first")
  .action(run((globals) => agentCheck(globals)));

withGlobals(program.command("completion"))
  .argument("<shell>", `one of ${SHELLS.join(", ")}`)
  .description("print a shell completion script")
  .addHelpText(
    "after",
    `\nExamples:\n  cf completion zsh > "\${fpath[1]}/_cf"\n  cf completion bash > /etc/bash_completion.d/cf\n  cf completion fish > ~/.config/fish/completions/cf.fish`,
  )
  .action(
    run(async (_globals, command) => {
      process.stdout.write(completionScript(program, String(command.args[0]), ["cf", "cefense"]));
      return 0;
    }),
  );

function crash(error: unknown): void {
  if (isAgentMode()) out.agentError(error);
  else out.renderError(error);
  // The error envelope is queued on stdout, which is asynchronous on a pipe;
  // exiting immediately truncated it and callers saw exit 4 with no output.
  // An empty write's callback runs only after everything queued has flushed.
  process.exitCode = 4;
  process.stdout.write("", () => process.exit(4));
}

process.on("uncaughtException", crash);
process.on("unhandledRejection", crash);

await program.parseAsync(process.argv);
