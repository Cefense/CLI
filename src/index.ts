#!/usr/bin/env node
import { Command, Option } from "commander";
import { CancelledError, EXIT_INTERRUPTED, isCefenseError } from "./core/errors.js";
import type { GlobalOptions } from "./core/session.js";
import { setColorEnabled } from "./ui/theme.js";
import { exitFullScreen } from "./ui/screen.js";
import { isAgentMode, setAgentMode } from "./ui/mode.js";
import * as out from "./ui/output.js";
import { VERSION } from "./version.js";
import { authLogin, authLogout, authStatus } from "./commands/auth.js";
import { repoConnect, repoDisconnect, repoList, repoSetDefault } from "./commands/repo.js";
import { statusCommand } from "./commands/status.js";
import { scanCommand } from "./commands/scan.js";
import { observedCommand, observedShow } from "./commands/observed.js";
import { fixCommand } from "./commands/fix.js";
import { fixGenerate, fixPublish, fixShow } from "./commands/fixcmds.js";

const program = new Command();

function withGlobals(command: Command): Command {
  return command
    .option("--api-url <url>", "Cefense instance to talk to")
    .option("--repo <owner/name>", "repository to act on")
    .option("--json", "emit JSON instead of a rendered view")
    .option("--agent", "machine mode: compact JSON envelope, structured errors, never interactive")
    .option("--no-color", "disable colour")
    .option("--verbose", "show more detail on failure")
    .option("-y, --yes", "skip confirmation prompts")
    .option("--no-link", "do not remember this directory's repository");
}

function globalsFrom(command: Command): GlobalOptions {
  const own = command.opts<Record<string, unknown>>();
  const root = program.opts<Record<string, unknown>>();
  const pick = <T>(key: string): T | undefined =>
    (own[key] as T | undefined) ?? (root[key] as T | undefined);

  const agent = Boolean(pick<boolean>("agent"));

  const globals: GlobalOptions = {
    apiUrl: pick<string>("apiUrl"),
    repo: pick<string>("repo"),
    json: agent || Boolean(pick<boolean>("json")),
    agent,
    color: agent || own.color === false || root.color === false ? false : true,
    verbose: Boolean(pick<boolean>("verbose")),
    yes: Boolean(pick<boolean>("yes")),
    noLink: agent || own.link === false || root.link === false,
  };

  const noColorEnv = Boolean(process.env.NO_COLOR);
  setAgentMode(agent);
  setColorEnabled(globals.color !== false && !noColorEnv && Boolean(process.stdout.isTTY || process.env.FORCE_COLOR));
  out.setJsonMode(Boolean(globals.json));
  out.setCommandName(commandPath(command));
  return globals;
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
      exitFullScreen();
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

const repo = program.command("repo").description("manage connected repositories");

withGlobals(repo.command("connect"))
  .argument("[repository]", "owner/name to connect without prompting")
  .description("connect a GitHub repository and start its first scan")
  .option("--no-watch", "queue the scan without following its progress")
  .action(
    run((globals, command) =>
      repoConnect(globals, command.args[0], { watch: command.opts().watch !== false }),
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
  .description("disconnect a repository, or the whole GitHub account")
  .option("--account", "disconnect the GitHub account instead of one repository")
  .action(
    run((globals, command) =>
      repoDisconnect(globals, command.args[0], { account: Boolean(command.opts().account) }),
    ),
  );

withGlobals(program.command("status"))
  .description("the workspace dashboard: repositories, scans, findings")
  .option("--watch", "keep polling even when nothing is scanning")
  .action(run((globals, command) => statusCommand(globals, { watch: Boolean(command.opts().watch) })));

withGlobals(program.command("scan"))
  .description("rescan a repository")
  .option("--no-watch", "queue the scan without following its progress")
  .action(run((globals, command) => scanCommand(globals, { watch: command.opts().watch !== false })));

function findingsOptions(command: Command): Command {
  return withGlobals(command)
    .addOption(new Option("--severity <list>", "critical,high,watch,info (medium and low also accepted)"))
    .addOption(new Option("--category <list>", "code,dependency,secret,misconfig,os-package"))
    .option("--limit <n>", "maximum findings to fetch", (value) => Number.parseInt(value, 10))
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
        exitCode: Boolean(command.opts().exitCode),
      }),
    ),
  );

withGlobals(observed.command("show"))
  .argument("<finding-id>", "the finding to show in full")
  .description("show one finding with its research, data flow and fix")
  .action(run((globals, command) => observedShow(globals, command.args[0] as string)));

findingsOptions(program.command("matched"))
  .description("findings joined to the research that explains them")
  .action(
    run((globals, command) =>
      observedCommand(globals, {
        severity: command.opts().severity,
        category: command.opts().category,
        limit: command.opts().limit,
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

process.on("uncaughtException", (error) => {
  exitFullScreen();
  if (isAgentMode()) out.agentError(error);
  else out.renderError(error);
  process.exit(4);
});

await program.parseAsync(process.argv);
