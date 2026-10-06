import { Command, CommanderError, Help, type Argument, type HelpContext, type Option } from "commander";
import pc from "picocolors";
import { describeCommand } from "../commands/agent.js";
import { EXIT_USAGE, UsageError } from "../core/errors.js";
import { VERSION } from "../version.js";
import { isAgentMode } from "./mode.js";
import * as out from "./output.js";
import { glyph } from "./theme.js";
import {
  COMMAND_SYNONYMS,
  DETAILS,
  EXAMPLES,
  GLOBAL_FLAGS,
  INHERITED_SHOWN,
  LEGACY_NAMES,
  PACKAGE_NAME,
  ROOT_SECTIONS,
  docsUrlFor,
} from "./helpContent.js";

type Colors = ReturnType<typeof pc.createColors>;

interface Internals {
  _hidden?: boolean;
  _defaultCommandName?: string | null;
  _actionHandler?: unknown;
}

const GLOBAL_FLAG_SET = new Set(GLOBAL_FLAGS.map((flag) => flag.flags));

function internals(command: Command): Internals {
  return command as unknown as Internals;
}

export function isHidden(command: Command): boolean {
  return Boolean(internals(command)._hidden);
}

function defaultSubcommand(command: Command): string | null {
  return internals(command)._defaultCommandName ?? null;
}

function hasAction(command: Command): boolean {
  return Boolean(internals(command)._actionHandler);
}

function pathOf(command: Command): string {
  const parts: string[] = [];
  for (let node: Command | null = command; node?.parent; node = node.parent) parts.unshift(node.name());
  return parts.join(" ");
}

function displayName(command: Command): string {
  const path = pathOf(command);
  return path ? `cf ${path}` : "cf";
}

function children(command: Command, options: { hidden?: boolean } = {}): Command[] {
  return command.commands.filter(
    (child) => child.name() !== "help" && (options.hidden || !isHidden(child)),
  );
}

function argumentTerm(argument: Argument): string {
  const name = `${argument.name()}${argument.variadic ? "..." : ""}`;
  return argument.required ? `<${name}>` : `[${name}]`;
}

function ownOptions(command: Command): Option[] {
  return command.options.filter(
    (option) => !GLOBAL_FLAG_SET.has(option.flags) && !option.hidden && option.long !== "--version",
  );
}

function takesGlobals(command: Command): boolean {
  return command.options.some((option) => GLOBAL_FLAG_SET.has(option.flags));
}

function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return /[.?!]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function usageLines(command: Command): string[] {
  const name = displayName(command);
  if (!command.parent) return [`${name} <command> <subcommand> [flags]`];
  const args = command.registeredArguments.map(argumentTerm).join(" ");
  const own = `${name}${args ? ` ${args}` : ""} [flags]`;
  if (children(command, { hidden: true }).length === 0) return [own];
  const nested = `${name} <command> [flags]`;
  return hasAction(command) ? [own, nested] : [nested];
}

function aliasesOf(command: Command): string[] {
  const path = pathOf(command);
  const parent = command.parent ? pathOf(command.parent) : "";
  const found: string[] = [];
  for (const alias of command.aliases()) found.push(`cf ${parent ? `${parent} ` : ""}${alias}`);
  const legacy = LEGACY_NAMES[path];
  if (legacy) found.push(`cf ${legacy}`);
  for (const [old, current] of Object.entries(LEGACY_NAMES)) {
    if (current === path) found.push(`cf ${old}`);
  }
  return [...new Set(found)];
}

function examplesFor(command: Command): string[] {
  return [...(EXAMPLES[pathOf(command)] ?? [])];
}

function summaryOf(command: Command): string {
  const text = command.description().trim();
  return text.replace(/\.$/, "");
}

function wrapWords(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (width < 20) return [words.join(" ")];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface Row {
  term: string;
  description: string;
}

function renderRows(rows: Row[], termWidth: number, width: number): string[] {
  const indent = "  ";
  const gap = "  ";
  const room = width - indent.length - termWidth - gap.length;
  const lines: string[] = [];
  for (const row of rows) {
    const term = row.term.padEnd(termWidth);
    if (!row.description) {
      lines.push(`${indent}${row.term}`);
      continue;
    }
    const wrapped = room >= 30 ? wrapWords(row.description, room) : [row.description];
    lines.push(`${indent}${term}${gap}${wrapped[0] ?? ""}`);
    for (const rest of wrapped.slice(1)) lines.push(`${indent}${" ".repeat(termWidth)}${gap}${rest}`);
  }
  return lines;
}

function flagRows(options: Array<{ flags: string; short?: string | undefined; description: string }>, padShort: boolean): Row[] {
  return options.map((option) => ({
    term: padShort && !option.short ? `    ${option.flags}` : option.flags,
    description: option.description,
  }));
}

function helpFlag(): { flags: string; short: string; description: string } {
  return { flags: "-h, --help", short: "-h", description: "Show help for command" };
}

function shortOf(flags: string): string | undefined {
  return /^-[a-zA-Z],/.test(flags) ? flags.slice(0, 2) : undefined;
}

interface Section {
  title: string;
  lines: string[];
}

function commandSections(command: Command): Array<{ title: string; commands: Command[] }> {
  const visible = children(command);
  if (command.parent) return visible.length > 0 ? [{ title: "AVAILABLE COMMANDS", commands: visible }] : [];

  const placed = new Set<string>();
  const sections = ROOT_SECTIONS.map((section) => ({
    title: section.title,
    commands: section.commands
      .map((name) => visible.find((child) => child.name() === name))
      .filter((child): child is Command => {
        if (!child) return false;
        placed.add(child.name());
        return true;
      }),
  }));
  const leftover = visible.filter((child) => !placed.has(child.name()));
  if (leftover.length > 0) {
    const additional = sections.find((section) => section.title === "ADDITIONAL COMMANDS");
    if (additional) additional.commands.push(...leftover);
    else sections.push({ title: "ADDITIONAL COMMANDS", commands: leftover });
  }
  return sections.filter((section) => section.commands.length > 0);
}

function rootAliasRows(command: Command): Row[] {
  const rows: Row[] = [];
  for (const [old, current] of Object.entries(LEGACY_NAMES)) {
    if (!old.includes(" ")) rows.push({ term: `${old}:`, description: `Alias for "${current}"` });
  }
  for (const child of children(command)) {
    for (const alias of child.aliases()) rows.push({ term: `${alias}:`, description: `Alias for "${child.name()}"` });
  }
  return rows;
}

function renderHelp(command: Command, width: number, colors: Colors): string {
  const heading = (title: string) => colors.bold(title);
  const sections: Section[] = [];
  const isRoot = !command.parent;
  const path = pathOf(command);

  const intro = DETAILS[path] ?? command.description();
  const introLines = wrapWords(sentence(intro), Math.max(40, width - 1));

  sections.push({ title: "USAGE", lines: usageLines(command).map((line) => `  ${line}`) });

  const aliases = isRoot ? [] : aliasesOf(command);
  if (aliases.length > 0) sections.push({ title: "ALIASES", lines: aliases.map((alias) => `  ${alias}`) });

  const groups = commandSections(command);
  const fallback = defaultSubcommand(command);
  const rootAliases = isRoot ? rootAliasRows(command) : [];
  const commandTermWidth = Math.max(
    0,
    ...groups.flatMap((group) => group.commands.map((child) => child.name().length + 1)),
    ...rootAliases.map((row) => row.term.length),
  );
  for (const group of groups) {
    const rows = group.commands.map((child) => ({
      term: `${child.name()}:`,
      description: `${summaryOf(child)}${child.name() === fallback ? " (default)" : ""}`,
    }));
    sections.push({ title: group.title, lines: renderRows(rows, commandTermWidth, width) });
  }
  if (rootAliases.length > 0) {
    sections.push({ title: "ALIAS COMMANDS", lines: renderRows(rootAliases, commandTermWidth, width) });
  }

  const argumentRows: Row[] = command.registeredArguments.map((argument) => ({
    term: argumentTerm(argument),
    description: sentence(argument.description ?? "").replace(/\.$/, ""),
  }));

  const own = ownOptions(command).map((option) => ({
    flags: option.flags,
    short: option.short,
    description: optionDescription(option),
  }));

  let ownRows: Array<{ flags: string; short?: string | undefined; description: string }> = own;
  let inheritedRows: Array<{ flags: string; short?: string | undefined; description: string }> = [];
  let inheritedNote: string | null = null;

  if (isRoot) {
    ownRows = [
      ...GLOBAL_FLAGS.map((flag) => ({ ...flag, short: shortOf(flag.flags) })),
      helpFlag(),
      { flags: "-v, --version", short: "-v", description: "Show cf version" },
    ];
  } else if (takesGlobals(command)) {
    inheritedRows = [
      ...GLOBAL_FLAGS.filter((flag) => INHERITED_SHOWN.includes(flag.flags)).map((flag) => ({
        ...flag,
        short: shortOf(flag.flags),
      })),
      helpFlag(),
    ];
    const rest = GLOBAL_FLAGS.filter((flag) => !INHERITED_SHOWN.includes(flag.flags)).map((flag) =>
      flag.flags.replace(/^-[a-zA-Z], /, "").replace(/ <.*$/, ""),
    );
    inheritedNote = `Also ${listed(rest, "and")}. Run cf --help to see what each does.`;
  } else {
    inheritedRows = [helpFlag()];
  }

  const padShort = [...ownRows, ...inheritedRows].some((row) => row.short);
  const ownFlagRows = flagRows(ownRows, padShort);
  const inheritedFlagRows = flagRows(inheritedRows, padShort);
  const flagTermWidth = Math.max(
    0,
    ...argumentRows.map((row) => row.term.length),
    ...ownFlagRows.map((row) => row.term.length),
    ...inheritedFlagRows.map((row) => row.term.length),
  );

  if (argumentRows.length > 0) {
    sections.push({ title: "ARGUMENTS", lines: renderRows(argumentRows, flagTermWidth, width) });
  }
  if (ownFlagRows.length > 0) {
    sections.push({ title: "FLAGS", lines: renderRows(ownFlagRows, flagTermWidth, width) });
  }
  if (inheritedFlagRows.length > 0) {
    const lines = renderRows(inheritedFlagRows, flagTermWidth, width);
    if (inheritedNote) {
      lines.push("");
      for (const line of wrapWords(inheritedNote, Math.max(40, width - 3))) lines.push(`  ${colors.dim(line)}`);
    }
    sections.push({ title: "INHERITED FLAGS", lines });
  }

  const examples = examplesFor(command);
  if (examples.length > 0) {
    sections.push({
      title: "EXAMPLES",
      lines: examples.map((example) =>
        example.startsWith("#") ? `  ${colors.dim(example)}` : `  $ ${example}`,
      ),
    });
  }

  const learn = [
    "Use `cf <command> <subcommand> --help` for more information about a command.",
    `Read the manual at ${docsUrlFor(path)}`,
  ];
  if (isRoot) learn.push("Coding agents can run `cf agent schema --agent` for every command as JSON.");
  sections.push({ title: "LEARN MORE", lines: learn.map((line) => `  ${line}`) });

  const body = sections.flatMap((section) => ["", heading(section.title), ...section.lines]);
  return `${[...introLines, ...body].join("\n")}\n\n`;
}

function optionDescription(option: Option): string {
  const base = (option.description ?? "").trim().replace(/\.$/, "");
  const fallback = option.defaultValue;
  if (fallback === undefined || typeof fallback === "boolean") return base;
  return `${base} (default ${String(fallback)})`;
}

function listed(values: readonly string[], joiner: "and" | "or"): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0]!;
  if (values.length === 2) return `${values[0]} ${joiner} ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, ${joiner} ${values[values.length - 1]}`;
}

export function oneOf(values: readonly string[]): string {
  return `One of ${listed(values, "or")}`;
}

export function anyOf(values: readonly string[]): string {
  return `Any of ${listed(values, "or")}`;
}

function distance(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const table: number[][] = Array.from({ length: rows }, (_, index) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = index;
    return row;
  });
  for (let col = 0; col < cols; col += 1) table[0]![col] = col;
  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      let best = Math.min(
        table[row - 1]![col]! + 1,
        table[row]![col - 1]! + 1,
        table[row - 1]![col - 1]! + cost,
      );
      if (row > 1 && col > 1 && left[row - 1] === right[col - 2] && left[row - 2] === right[col - 1]) {
        best = Math.min(best, table[row - 2]![col - 2]! + 1);
      }
      table[row]![col] = best;
    }
  }
  return table[left.length]![right.length]!;
}

export function suggest(word: string, candidates: readonly string[]): string[] {
  const wanted = word.toLowerCase().replace(/^-+/, "");
  if (!wanted) return [];
  const scored = [...new Set(candidates)]
    .map((candidate) => {
      const bare = candidate.toLowerCase().replace(/^-+/, "");
      if (bare.length < 2) return null;
      const edits = distance(wanted, bare);
      const longest = Math.max(wanted.length, bare.length);
      const close = edits <= 2 && (longest - edits) / longest > 0.4;
      const prefix = wanted.length >= 2 && bare.startsWith(wanted);
      if (!close && !prefix) return null;
      return { candidate, score: prefix ? Math.min(edits, 1) : edits };
    })
    .filter((entry): entry is { candidate: string; score: number } => entry !== null);
  if (scored.length === 0) return [];
  const best = Math.min(...scored.map((entry) => entry.score));
  return scored
    .filter((entry) => entry.score === best)
    .map((entry) => entry.candidate)
    .sort()
    .slice(0, 3);
}

function suggestCommands(command: Command, word: string): string[] {
  const prefix = displayName(command);
  const names = children(command, { hidden: true }).flatMap((child) => [child.name(), ...child.aliases()]);
  const found = suggest(word, names).map((name) => `${prefix} ${name}`);
  if (!command.parent) {
    const synonym = COMMAND_SYNONYMS[word.toLowerCase()];
    if (synonym) found.unshift(`cf ${synonym}`);
  }
  return [...new Set(found)];
}

function suggestFlags(command: Command, flag: string): string[] {
  const longs = command.options.map((option) => option.long).filter((long): long is string => Boolean(long));
  const extra = command.parent ? ["--help"] : ["--help", "--version"];
  return suggest(flag, [...longs, ...extra]);
}

interface Failure {
  message: string;
  suggestions: string[];
  usage: boolean;
  hint: string;
  flag?: string;
  at?: Command;
}

function quoted(message: string): string | null {
  return message.match(/'([^']+)'/)?.[1] ?? null;
}

function cleanMessage(message: string): string {
  const first = message.split("\n")[0] ?? message;
  const bare = first.replace(/^error:\s*/i, "").trim();
  return sentence(bare.charAt(0).toUpperCase() + bare.slice(1));
}

function unknownCommand(command: Command, name: string): Failure {
  const where = displayName(command);
  return {
    message: `${where} has no command called ${name}.`,
    suggestions: suggestCommands(command, name),
    usage: false,
    hint: command.parent ? `Run ${where} --help to see its commands.` : "Run cf --help to see every command.",
    at: command,
  };
}

function describeFailure(command: Command, message: string, code: string): Failure {
  const where = displayName(command);
  const more = `Run ${where} --help for more.`;
  switch (code) {
    case "commander.unknownCommand":
      return unknownCommand(command, command.args[0] ?? "");
    case "commander.excessArguments": {
      if (command.registeredArguments.length === 0 && children(command, { hidden: true }).length > 0) {
        return unknownCommand(command, command.args[0] ?? "");
      }
      const parent = command.parent;
      if (command.registeredArguments.length === 0 && parent && defaultSubcommand(parent) === command.name()) {
        return unknownCommand(parent, command.args[0] ?? "");
      }
      const expected = command.registeredArguments.length;
      const given = command.args;
      return {
        message: `${where} takes ${expected} ${expected === 1 ? "argument" : "arguments"} but was given ${given.length}: ${given.join(", ")}.`,
        suggestions: [],
        usage: true,
        hint: more,
      };
    }
    case "commander.unknownOption": {
      const flag = quoted(message) ?? "that flag";
      return {
        message: `${where} has no flag called ${flag}.`,
        suggestions: suggestFlags(command, flag),
        usage: false,
        hint: `Run ${where} --help to see its flags.`,
      };
    }
    case "commander.missingArgument": {
      const missing = command.registeredArguments
        .filter((argument, index) => argument.required && command.args[index] === undefined)
        .map(argumentTerm);
      const named = missing.length > 0 ? listed(missing, "and") : `<${quoted(message) ?? "argument"}>`;
      return { message: `${where} needs ${named}.`, suggestions: [], usage: true, hint: more };
    }
    case "commander.optionMissingArgument": {
      const flags = quoted(message) ?? "That flag";
      const long = flags.match(/--[a-z0-9-]+/)?.[0];
      return {
        message: `${flags} needs a value.`,
        suggestions: [],
        usage: true,
        hint: more,
        ...(long ? { flag: long } : {}),
      };
    }
    default:
      return { message: cleanMessage(message), suggestions: [], usage: true, hint: more };
  }
}

function exampleFor(command: Command, flag?: string): string | null {
  const examples = examplesFor(command).filter((example) => !example.startsWith("#"));
  if (flag) {
    const withFlag = examples.find((example) => example.split(/\s+/).includes(flag));
    if (withFlag) return withFlag;
  }
  const required = command.registeredArguments.filter((argument) => argument.required).length;
  const depth = pathOf(command).split(" ").length + 1;
  const withArguments = examples.find(
    (example) => example.split(/\s+/).slice(depth).filter((word) => !word.startsWith("-")).length >= required,
  );
  return withArguments ?? examples[0] ?? null;
}

function didYouMean(suggestions: string[]): string | null {
  if (suggestions.length === 0) return null;
  return `Did you mean ${listed(suggestions, "or")}?`;
}

export function stderrHasColors(): boolean {
  if (process.env.NO_COLOR || process.argv.includes("--no-color")) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stderr.isTTY);
}

export function stdoutHasColors(): boolean {
  if (process.env.NO_COLOR || process.argv.includes("--no-color")) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY && process.stdout.hasColors?.());
}

function formatFailure(command: Command, failure: Failure, colors: Colors): string {
  const lines = [`${colors.red(glyph.cross)} ${failure.message}`];
  const guess = didYouMean(failure.suggestions);
  if (guess) lines.push(`  ${guess}`);
  if (failure.usage) {
    const example = exampleFor(command, failure.flag);
    lines.push("");
    lines.push(`  ${colors.bold("Usage:")}    ${usageLines(command)[0]}`);
    if (example) lines.push(`  ${colors.bold("Example:")}  ${example}`);
  }
  lines.push("");
  lines.push(`  ${colors.dim(failure.hint)}`);
  return `${lines.join("\n")}\n`;
}

function agentRemedy(command: Command, failure: Failure): string {
  const parts: string[] = [];
  const guess = didYouMean(failure.suggestions);
  if (guess) parts.push(guess);
  if (failure.usage) {
    parts.push(`Usage: ${usageLines(command)[0]}.`);
    const example = exampleFor(command, failure.flag);
    if (example) parts.push(`Example: ${example}.`);
  }
  parts.push("Run cf agent schema --agent for every command and flag.");
  return parts.join(" ");
}

function reportFailure(command: Command, message: string, code: string): void {
  const failure = describeFailure(command, message, code);
  if (isAgentMode()) {
    out.setCommandName(pathOf(failure.at ?? command) || "cefense");
    out.agentError(new UsageError(failure.message, agentRemedy(command, failure)));
    return;
  }
  process.stderr.write(formatFailure(command, failure, pc.createColors(stderrHasColors())));
}

function releaseUrl(): string {
  return `https://www.npmjs.com/package/${PACKAGE_NAME}/v/${VERSION}`;
}

function versionText(): string {
  return `cf version ${VERSION}\n${releaseUrl()}\n`;
}

export function printVersion(): void {
  if (isAgentMode()) {
    out.setCommandName("version");
    out.agentEmit({ version: VERSION, package: PACKAGE_NAME, url: releaseUrl() });
    return;
  }
  process.stdout.write(versionText());
}

function helpPayload(command: Command): Record<string, unknown> {
  const node = describeCommand(command);
  const aliases = command.parent ? aliasesOf(command) : [];
  const examples = examplesFor(command).filter((example) => !example.startsWith("#"));
  return {
    ...node,
    usage: usageLines(command),
    ...(aliases.length > 0 ? { aliases } : {}),
    ...(examples.length > 0 ? { examples } : {}),
    documentation: docsUrlFor(pathOf(command)),
  };
}

class CfHelp extends Help {
  private colors: Colors = pc.createColors(false);

  override prepareContext(context: { error?: boolean; helpWidth?: number; outputHasColors?: boolean }): void {
    super.prepareContext(context);
    this.colors = pc.createColors(Boolean(context.outputHasColors));
  }

  override formatHelp(command: Command): string {
    return renderHelp(command, Math.min(this.helpWidth || 80, 120), this.colors);
  }
}

export class CfCommand extends Command {
  override createCommand(name?: string): CfCommand {
    return new CfCommand(name);
  }

  override createHelp(): Help {
    return Object.assign(new CfHelp(), this.configureHelp());
  }

  override outputHelp(context?: HelpContext | ((text: string) => string)): void {
    if (isAgentMode()) {
      out.setCommandName("help");
      out.agentEmit(helpPayload(this), ["cf agent schema --agent"]);
      return;
    }
    if (typeof context === "function") super.outputHelp(context);
    else super.outputHelp({ error: false });
  }

  override help(): never {
    this.outputHelp();
    throw new CommanderError(0, "commander.helpDisplayed", "(outputHelp)");
  }

  override error(message: string, options: { code?: string; exitCode?: number } = {}): never {
    const code = options.code ?? "commander.error";
    reportFailure(this, message, code);
    throw new CommanderError(EXIT_USAGE, code, message);
  }
}

export function commandPathFromArgv(root: Command, argv: readonly string[]): string {
  const parts: string[] = [];
  let node: Command = root;
  for (const word of argv) {
    if (word.startsWith("-")) continue;
    const next = node.commands.find((child) => child.name() === word || child.aliases().includes(word));
    if (!next) break;
    parts.push(next.name());
    node = next;
  }
  return parts.join(" ");
}
