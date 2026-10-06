import { AGENT_SCHEMA_VERSION, prune, shapeRow, type RowShape } from "../core/compact.js";
import { errorCode } from "../core/codes.js";
import { CefenseError, EXIT_API } from "../core/errors.js";
import { sanitizeForTerminal, terminalWidth } from "./format.js";
import { isAgentMode } from "./mode.js";
import { c, glyph } from "./theme.js";

let jsonMode = false;
let commandName = "";
let fields: string[] | null = null;

export function setJsonMode(value: boolean): void {
  jsonMode = value;
}

/**
 * Narrows every list in an agent envelope to the named keys.
 *
 * A whole-repository listing is the largest thing the CLI produces, and an
 * agent ranking findings needs four keys of it rather than twenty. The
 * projection is deliberately shallow and only touches arrays of objects
 * directly under `data`, so what `--fields id,severity,title` returns is
 * predictable from the unfiltered shape rather than something to discover.
 */
export function setFieldFilter(value: string | undefined): void {
  const wanted = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  fields = wanted.length > 0 ? [...new Set(["id", ...wanted])] : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function project(data: unknown): unknown {
  if (!fields || !isPlainObject(data)) return data;
  const keys = fields;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.some(isPlainObject)) {
      result[key] = value.map((entry) => {
        if (!isPlainObject(entry)) return entry;
        const narrowed: Record<string, unknown> = {};
        for (const wanted of keys) {
          if (wanted in entry) narrowed[wanted] = entry[wanted];
        }
        return narrowed;
      });
      continue;
    }
    result[key] = value;
  }
  return result;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

export function setCommandName(value: string): void {
  commandName = value;
}

function lean(data: unknown, rows: Record<string, RowShape>): unknown {
  if (!isPlainObject(data)) return data;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const shape = rows[key];
    result[key] =
      shape && Array.isArray(value)
        ? value.map((entry) => (isPlainObject(entry) ? shapeRow(entry, shape) : entry))
        : value;
  }
  return result;
}

export function agentEmit(
  data: unknown,
  next: string[] = [],
  rows: Record<string, RowShape> = {},
): void {
  const payload: Record<string, unknown> = {
    schemaVersion: AGENT_SCHEMA_VERSION,
    ok: true,
    command: commandName,
    data: fields ? project(data) : lean(data, rows),
  };
  const commands = [...new Set(next)].filter(Boolean);
  if (commands.length > 0) payload.next = commands;
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

const NEEDS_CONSENT = [
  /^cf auth (login|logout)\b/,
  /^cf provider (connect|disconnect)\b/,
  /^cf fix (publish|merge)\b/,
  /^cf proof (attest|env set|env unset)\b/,
  /^cf triage\b/,
  /^cf settings [a-z]/,
  /^cf skill (install|uninstall)\b/,
  /^cf plan (upgrade|portal)\b/,
  /^cf repo (connect|disconnect|set-default)\b/,
  /^cf org use\b/,
  /^cf notifications (set|mute)\b/,
  /\s--yes\b/,
  /\s--url\b/,
];

const COMMAND_ENDS = new Set([
  "to",
  "first",
  "once",
  "then",
  "for",
  "and",
  "or",
  "until",
  "if",
  "when",
  "before",
  "after",
  "again",
  "so",
  "instead",
  "here",
]);

const VALUE_FLAGS = new Set([
  "--repo",
  "--org",
  "--branch",
  "--scan",
  "--severity",
  "--category",
  "--limit",
  "--before",
  "--provider",
  "--format",
  "--method",
  "--every",
]);

function commandAt(text: string): string | null {
  const words: string[] = [];
  for (const raw of text.split(/\s+/)) {
    const word = raw.replace(/`/g, "");
    const previous = words[words.length - 1] ?? "";
    if (words.length > 1 && !VALUE_FLAGS.has(previous) && COMMAND_ENDS.has(word.toLowerCase())) break;
    const trimmed = word.replace(/[.,;:]+$/, "");
    if (trimmed) words.push(trimmed);
    if (trimmed !== word) break;
  }
  return words.length > 1 ? words.join(" ") : null;
}

function runnable(command: string): boolean {
  return !command.includes("<") && !NEEDS_CONSENT.some((pattern) => pattern.test(command));
}

function remedyCommand(remedy: string): string | null {
  const first = remedy.split(/(?<=\.)\s+(?=[A-Z])/)[0] ?? "";
  if (!/^(?:(?:Run|Poll)\s+)?`?cf\s/.test(first)) return null;
  for (const match of first.matchAll(/(?:^|[\s`])(cf\s)/g)) {
    const command = commandAt(first.slice((match.index ?? 0) + match[0].length - 3));
    if (command && runnable(command)) return command;
  }
  return null;
}

export function agentRemedy(remedy: string | null, code: string): string | null {
  const fallback = code === "usage_error" ? null : (errorCode(code)?.remedy ?? null);
  const text = (remedy ?? fallback)?.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const command = remedyCommand(text);
  if (!command) return text;
  return /\s--agent\b/.test(command) ? command : `${command} --agent`;
}

export function agentError(error: unknown): void {
  const known = error instanceof CefenseError;
  const code = known ? error.code : "internal_error";
  const message = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim();
  const detail = {
    code,
    message,
    remedy: agentRemedy(known ? error.remedy : null, code),
    exitCode: known ? error.exitCode : EXIT_API,
  };
  process.stdout.write(
    `${JSON.stringify({
      schemaVersion: AGENT_SCHEMA_VERSION,
      ok: false,
      command: commandName,
      error: prune(detail),
    })}\n`,
  );
}

export function line(value = ""): void {
  if (isAgentMode()) return;
  process.stdout.write(`${sanitizeForTerminal(value)}\n`);
}

export function lines(values: string[]): void {
  for (const value of values) line(value);
}

export function json(value: unknown): void {
  if (isAgentMode()) return;
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function heading(title: string, subtitle?: string): void {
  line();
  line(`${c.bold(title)}${subtitle ? `   ${c.dim(subtitle)}` : ""}`);
  line();
}

export function section(title: string): void {
  line();
  line(c.bold(title));
}

export function rule(width = terminalWidth()): void {
  line(c.dim(glyph.rule.repeat(Math.max(4, width))));
}

export function success(message: string): void {
  line(`${c.green(glyph.check)} ${message}`);
}

export function warn(message: string): void {
  line(`${c.yellow(glyph.warn)} ${message}`);
}

export function info(message: string): void {
  line(message);
}

export function bullet(message: string): void {
  line(`${c.dim(glyph.arrow)} ${message}`);
}

export function hint(message: string): void {
  line(c.dim(message));
}

export function renderError(error: unknown): void {
  if (isAgentMode()) return;
  const stream = process.stderr;
  const emit = (value: string) => stream.write(`${sanitizeForTerminal(value)}\n`);
  if (error instanceof CefenseError) {
    emit(`${c.red(glyph.cross)} ${error.message}`);
    if (error.remedy) emit(c.dim(`Hint: ${error.remedy}`));
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  emit(`${c.red(glyph.cross)} ${message}`);
}

export function isPiped(): boolean {
  return !process.stdout.isTTY;
}
