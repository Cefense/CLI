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

export function severityBadge(severity: WireSeverity | string): string {
  const label = displaySeverity(severity);
  return severityColor(severity)(`${glyph.dot} ${label.toLowerCase().padEnd(8)}`);
}

export function scanStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "queued":
      return c.cyan(`${glyph.ring} queued`);
    case "running":
      return c.cyan(`${glyph.pulse} scanning`);
    case "completed":
      return c.green(`${glyph.check} ready`);
    case "failed":
      return c.red(`${glyph.cross} failed`);
    default:
      return c.dim(`${glyph.track} never`);
  }
}
