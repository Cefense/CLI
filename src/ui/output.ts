import { AGENT_SCHEMA_VERSION, prune } from "../core/compact.js";
import { CefenseError, EXIT_API } from "../core/errors.js";
import { terminalWidth } from "./format.js";
import { isAgentMode } from "./mode.js";
import { c, glyph } from "./theme.js";

let jsonMode = false;
let commandName = "";

export function setJsonMode(value: boolean): void {
  jsonMode = value;
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
    data,
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
  process.stdout.write(`${value}\n`);
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
  line(`  ${c.bold(title)}${subtitle ? `   ${c.dim(subtitle)}` : ""}`);
  line();
}

export function section(title: string): void {
  line();
  line(`  ${c.dim(title.toUpperCase())}`);
}

export function rule(width = terminalWidth() - 4): void {
  line(`  ${c.dim(glyph.rule.repeat(Math.max(4, width)))}`);
}

export function success(message: string): void {
  line(`  ${c.green(glyph.check)} ${message}`);
}

export function warn(message: string): void {
  line(`  ${c.yellow(glyph.warn)} ${message}`);
}

export function info(message: string): void {
  line(`  ${message}`);
}

export function bullet(message: string): void {
  line(`  ${c.dim(glyph.arrow)} ${message}`);
}

export function hint(message: string): void {
  line(`    ${c.dim(message)}`);
}

export function renderError(error: unknown): void {
  if (isAgentMode()) return;
  const stream = process.stderr;
  if (error instanceof CefenseError) {
    stream.write(`\n  ${c.red(glyph.cross)} ${error.message}\n`);
    if (error.remedy) stream.write(`    ${c.dim(error.remedy)}\n`);
    stream.write("\n");
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  stream.write(`\n  ${c.red(glyph.cross)} ${message}\n\n`);
}

export function isPiped(): boolean {
  return !process.stdout.isTTY;
}
