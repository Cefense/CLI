import { glyph } from "./theme.js";

const ESC = String.fromCharCode(27);

const ANSI = new RegExp(
  [
    `${ESC}\\][\\s\\S]*?(?:\\u0007|${ESC}\\\\|$)`,
    `${ESC}[P^_X][\\s\\S]*?(?:${ESC}\\\\|$)`,
    `${ESC}\\[[0-?]*[ -/]*[@-~]`,
    `${ESC}[@-Z\\\\-_]`,
  ].join("|"),
  "g",
);

const SGR = new RegExp(`${ESC}\\[[0-9;]*m`, "g");

const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

const MARK = "\uE000";
const MARKER = /\uE000/g;

export function sanitizeForTerminal(value: string): string {
  const kept: string[] = [];
  const marked = value
    .replace(MARKER, "")
    .replace(SGR, (match) => {
      kept.push(match);
      return MARK;
    })
    .replace(ANSI, "")
    .replace(CONTROL, "")
    .replace(/\t/g, "  ");
  let index = 0;
  return marked.replace(MARKER, () => kept[index++] ?? "");
}

export function terminalWidth(fallback = 80): number {
  const width = process.stdout.columns;
  return typeof width === "number" && width > 20 ? width : fallback;
}

export function terminalHeight(fallback = 24): number {
  const height = process.stdout.rows;
  return typeof height === "number" && height > 6 ? height : fallback;
}

export function stripAnsi(value: string): string {
  return value.replace(ANSI, "");
}

export function visibleLength(value: string): number {
  return [...stripAnsi(value)].length;
}

export const ELLIPSIS = glyph.ellipsis;

const RESET = `${ESC}[0m`;

function tokens(value: string): Array<{ text: string; escape: boolean }> {
  const parts: Array<{ text: string; escape: boolean }> = [];
  let cursor = 0;
  for (const match of value.matchAll(ANSI)) {
    const at = match.index ?? 0;
    if (at > cursor) parts.push({ text: value.slice(cursor, at), escape: false });
    parts.push({ text: match[0], escape: true });
    cursor = at + match[0].length;
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor), escape: false });
  return parts;
}

function sliceVisible(value: string, start: number, end: number): { text: string; styled: boolean } {
  let position = 0;
  let text = "";
  let styled = false;
  for (const part of tokens(value)) {
    if (part.escape) {
      text += part.text;
      styled = true;
      continue;
    }
    for (const char of part.text) {
      if (position >= start && position < end) text += char;
      position += 1;
    }
  }
  return { text, styled };
}

export function truncate(value: string, width: number): string {
  const length = visibleLength(value);
  if (length <= width) return value;
  if (width <= 0) return "";
  if (width === 1) return ELLIPSIS;
  const { text, styled } = sliceVisible(value, 0, width - 1);
  const kept = text.replace(/\s+((?:\u001b\[[0-9;]*m)*)$/, "$1");
  return `${kept}${ELLIPSIS}${styled ? RESET : ""}`;
}

export function truncateStart(value: string, width: number): string {
  const length = visibleLength(value);
  if (length <= width) return value;
  if (width <= 0) return "";
  if (width === 1) return ELLIPSIS;
  const { text, styled } = sliceVisible(value, length - (width - 1), length);
  return `${ELLIPSIS}${text}${styled ? RESET : ""}`;
}

export function shortenPath(path: string, width: number): string {
  if (path.length <= width) return path;
  const segments = path.split("/");
  for (let drop = 1; drop < segments.length; drop += 1) {
    const candidate = `${ELLIPSIS}/${segments.slice(drop).join("/")}`;
    if (candidate.length <= width) return candidate;
  }
  return truncateStart(path, width);
}

export function pathFloor(paths: string[], cap: number, least = 12): number {
  const names = paths.map((path) => [...(path.split("/").pop() ?? "")].length + 2);
  return Math.min(Math.max(least, cap), Math.max(least, ...names));
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  if (count === 1) return singular;
  if (pluralForm) return pluralForm;
  if (/[^aeiou]y$/.test(singular)) return `${singular.slice(0, -1)}ies`;
  if (/(s|x|ch|sh)$/.test(singular)) return `${singular}es`;
  return `${singular}s`;
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function countOf(count: number, singular: string, pluralForm?: string): string {
  return `${formatCount(count)} ${plural(count, singular, pluralForm)}`;
}

export function duration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return seconds % 60 === 0 ? `${minutes}m` : `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 === 0 ? `${hours}h` : `${hours}h ${minutes % 60}m`;
}

export function durationBetween(fromIso: string | null | undefined, toIso?: string | null): string {
  if (!fromIso) return "";
  const from = new Date(fromIso).getTime();
  const to = toIso ? new Date(toIso).getTime() : Date.now();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return "";
  return duration(to - from);
}

export function firstLine(value: string | null | undefined): string {
  return (value ?? "").split("\n").map((entry) => entry.trim()).find(Boolean) ?? "";
}

export function padEnd(value: string, width: number): string {
  const length = visibleLength(value);
  return length >= width ? value : value + " ".repeat(width - length);
}

export function padStart(value: string, width: number): string {
  const length = visibleLength(value);
  return length >= width ? value : " ".repeat(width - length) + value;
}

function span(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

export function relativeTime(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "never";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "never";
  const seconds = Math.round((now - then) / 1000);
  if (seconds < -30) return `in ${span(-seconds)}`;
  if (seconds < 10) return "just now";
  return `${span(seconds)} ago`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function absoluteDate(value: string | null | undefined): string {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "never";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function datedLabel(value: string | null | undefined): string {
  if (!value) return "never";
  const date = absoluteDate(value);
  return date === "never" ? date : `${date} (${relativeTime(value)})`;
}

export function elapsed(fromIso: string | null | undefined, toIso?: string | null): string {
  if (!fromIso) return "";
  const from = new Date(fromIso).getTime();
  const to = toIso ? new Date(toIso).getTime() : Date.now();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return "";
  const seconds = Math.floor((to - from) / 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}

const EIGHTHS = ["", "\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589"];

export function progressBar(done: number, total: number, width = 24): string {
  if (total <= 0) return "";
  const ratio = Math.max(0, Math.min(1, done / total));
  const exact = ratio * width;
  const whole = Math.floor(exact);
  const remainder = EIGHTHS[Math.floor((exact - whole) * 8)] ?? "";
  const filled = glyph.block.repeat(whole) + remainder;
  const track = glyph.track.repeat(Math.max(0, width - whole - (remainder ? 1 : 0)));
  return filled + track;
}


export function money(amount: number | null, currency: string | null): string {
  if (amount === null || !currency) return "";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: amount % 100 === 0 ? 0 : 2,
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export function wrapText(value: string, width: number, indent = ""): string[] {
  const paragraphs = value.split(/\n\s*\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    if (lines.length > 0) lines.push("");
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > Math.max(8, width - indent.length) && current) {
        lines.push(indent + current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(indent + current);
  }
  return lines;
}

export function shortId(id: string, length = 8): string {
  return id.replace(/-/g, "").slice(0, length);
}
