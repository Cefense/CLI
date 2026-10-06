import { terminalWidth, truncate, wrapText } from "./format.js";
import { c, glyph } from "./theme.js";

export const BODY_INDENT = "  ";

export function readingWidth(width = terminalWidth()): number {
  return Math.max(20, Math.min(100, width) - BODY_INDENT.length);
}

export function titleLine(title: string, id?: string | null): string {
  return id ? `${c.bold(title)} ${c.dim(id)}` : c.bold(title);
}

export function joinDots(parts: Array<string | null | undefined | false>): string {
  return parts.filter((part): part is string => Boolean(part)).join(c.dim(` ${glyph.sep} `));
}

export function heading(label: string): string {
  return c.bold(label);
}

export function paragraph(text: string | null | undefined, width = readingWidth(), style?: (value: string) => string): string[] {
  if (!text?.trim()) return [];
  return wrapText(text, width).map((wrapped) => `${BODY_INDENT}${style ? style(wrapped) : wrapped}`);
}

export function indent(values: string[], prefix = BODY_INDENT): string[] {
  return values.map((value) => (value ? `${prefix}${value}` : ""));
}

export function codeBlock(code: string, startLine: number | null, width = readingWidth(), limit = 20): string[] {
  const source = code.replace(/\t/g, "  ").replace(/\s+$/, "").split("\n");
  const first = startLine ?? 1;
  const gutter = String(first + Math.min(source.length, limit) - 1).length;
  const shown = source.slice(0, limit).map((text, index) => {
    const number = c.dim(`${String(first + index).padStart(gutter)} │`);
    return `${BODY_INDENT}${number} ${truncate(text, Math.max(10, width - gutter - 3))}`;
  });
  if (source.length > limit) {
    shown.push(`${BODY_INDENT}${c.dim(`${" ".repeat(gutter)} │ ${source.length - limit} more lines`)}`);
  }
  return shown;
}

export function viewOn(noun: string, host: string, url: string | null | undefined): string | null {
  return url ? c.dim(`View this ${noun} on ${host}: ${url}`) : null;
}
