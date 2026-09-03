import { CefenseError } from "../core/errors.js";
import { terminalWidth } from "./format.js";
import { c, glyph } from "./theme.js";

let jsonMode = false;

export function setJsonMode(value: boolean): void {
  jsonMode = value;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

export function line(value = ""): void {
  process.stdout.write(`${value}\n`);
}

export function lines(values: string[]): void {
  for (const value of values) line(value);
}

export function json(value: unknown): void {
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
