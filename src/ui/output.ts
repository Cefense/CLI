import { AGENT_SCHEMA_VERSION, prune } from "../core/compact.js";
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

export function agentEmit(data: unknown, next: string[] = []): void {
  const payload: Record<string, unknown> = {
    schemaVersion: AGENT_SCHEMA_VERSION,
    ok: true,
    command: commandName,
    data: project(data),
  };
  if (next.length > 0) payload.next = next;
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function agentError(error: unknown): void {
  const detail =
    error instanceof CefenseError
      ? { code: error.code, message: error.message, remedy: error.remedy, exitCode: error.exitCode }
      : {
          code: "internal_error",
          message: error instanceof Error ? error.message : String(error),
          remedy: null,
          exitCode: EXIT_API,
        };
  process.stdout.write(
    `${JSON.stringify({
      schemaVersion: AGENT_SCHEMA_VERSION,
      ok: false,
      command: commandName,
      error: prune(detail as unknown as Record<string, unknown>),
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
    if (error.remedy) emit(c.dim(error.remedy));
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  emit(`${c.red(glyph.cross)} ${message}`);
}

export function isPiped(): boolean {
  return !process.stdout.isTTY;
}
