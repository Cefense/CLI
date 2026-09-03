import { glyph } from "./theme.js";

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");

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
  return stripAnsi(value).length;
}

export function truncate(value: string, width: number): string {
  const plain = stripAnsi(value);
  if (plain.length <= width) return value;
  if (width <= 1) return plain.slice(0, Math.max(0, width));
  return plain.slice(0, width - 1) + glyph.ellipsis;
}

export function padEnd(value: string, width: number): string {
  const length = visibleLength(value);
  return length >= width ? value : value + " ".repeat(width - length);
}

export function padStart(value: string, width: number): string {
  const length = visibleLength(value);
  return length >= width ? value : " ".repeat(width - length) + value;
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return "never";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "never";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function absoluteDate(value: string | null | undefined): string {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "never";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
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

export function pluralise(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
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
