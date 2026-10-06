import pc from "picocolors";
import type { WireSeverity } from "../core/types.js";

let enabled = pc.isColorSupported;

export function setColorEnabled(value: boolean): void {
  enabled = value;
}

export function colorEnabled(): boolean {
  return enabled;
}

type Style = (value: string) => string;

function wrap(style: Style): Style {
  return (value: string) => (enabled ? style(value) : value);
}

export const c = {
  bold: wrap(pc.bold),
  dim: wrap(pc.dim),
  italic: wrap(pc.italic),
  underline: wrap(pc.underline),
  red: wrap(pc.red),
  green: wrap(pc.green),
  yellow: wrap(pc.yellow),
  blue: wrap(pc.blue),
  magenta: wrap(pc.magenta),
  cyan: wrap(pc.cyan),
  white: wrap(pc.white),
  gray: wrap(pc.gray),
  inverse: wrap(pc.inverse),
};

export type DisplaySeverity = "Critical" | "High" | "Watch" | "Info";

export function displaySeverity(severity: WireSeverity | string): DisplaySeverity {
  if (severity === "critical") return "Critical";
  if (severity === "high") return "High";
  if (severity === "medium") return "Watch";
  return "Info";
}

export function severityRank(severity: WireSeverity | string): number {
  const label = displaySeverity(severity);
  return label === "Critical" ? 0 : label === "High" ? 1 : label === "Watch" ? 2 : 3;
}

export function severityColor(severity: WireSeverity | string): Style {
  const label = displaySeverity(severity);
  if (label === "Critical") return c.red;
  if (label === "High") return c.yellow;
  if (label === "Watch") return c.cyan;
  return c.gray;
}

export const glyph = {
  dot: "●",
  sep: "•",
  ring: "○",
  check: "✓",
  cross: "✗",
  warn: "!",
  arrow: "›",
  star: "✦",
  up: "↑",
  down: "↓",
  ellipsis: "…",
  block: "\u2588",
  track: "\u00B7",
  rule: "\u2500",
  pulse: "\u25B0",
  pulseOff: "\u25B1",
};


export type Tone = "done" | "open" | "running" | "queued" | "attention" | "failed" | "none";

const TONES: Record<Tone, { mark: string; style: Style }> = {
  done: { mark: glyph.check, style: c.green },
  open: { mark: glyph.ring, style: c.green },
  running: { mark: glyph.pulse, style: c.cyan },
  queued: { mark: glyph.ring, style: c.cyan },
  attention: { mark: glyph.warn, style: c.yellow },
  failed: { mark: glyph.cross, style: c.red },
  none: { mark: glyph.track, style: c.dim },
};

export function toneStyle(tone: Tone): Style {
  return TONES[tone].style;
}

export function toneMark(tone: Tone): string {
  return TONES[tone].style(TONES[tone].mark);
}

export function badge(tone: Tone, label: string): string {
  return TONES[tone].style(`${TONES[tone].mark} ${label}`);
}

export function stateWord(tone: Tone, label: string): string {
  const word = label.charAt(0).toUpperCase() + label.slice(1);
  return tone === "none" ? c.dim(word) : badge(tone, word);
}

export function scanTone(status: string | null | undefined): Tone {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "completed":
      return "done";
    case "failed":
      return "failed";
    case "cancelled":
      return "attention";
    default:
      return "none";
  }
}

export function scanWord(status: string | null | undefined): string {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "scanning";
    case "completed":
      return "ready";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "never";
  }
}

export function scanStatusLabel(status: string | null | undefined): string {
  return badge(scanTone(status), scanWord(status));
}
