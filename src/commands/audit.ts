import { openSession, type GlobalOptions } from "../core/session.js";
import { UsageError } from "../core/errors.js";
import type { AuditEvent } from "../core/types.js";
import { printList } from "../ui/list.js";
import * as out from "../ui/output.js";
import { relativeTime } from "../ui/format.js";
import { c, glyph } from "../ui/theme.js";
import { isAgentMode } from "../ui/mode.js";
import { compactAuditEvent } from "../core/compact.js";

export const AUDIT_CATEGORIES = [
  "scan",
  "finding",
  "fix",
  "repository",
  "settings",
  "export",
  "account",
  "integration",
] as const;

export interface AuditOptions {
  limit?: number;
  before?: string;
  category?: string;
}

export function parseAuditCategories(value: string | undefined): string[] {
  if (!value) return [];
  const parts = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  for (const part of parts) {
    if (!AUDIT_CATEGORIES.includes(part as (typeof AUDIT_CATEGORIES)[number])) {
      throw new UsageError(
        `${part} is not an audit category.`,
        `Use ${AUDIT_CATEGORIES.join(", ")}.`,
        "invalid_audit_category",
      );
    }
  }
  return [...new Set(parts)];
}

export function parseBefore(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new UsageError(
      `${value} is not a date.`,
      "Pass an ISO timestamp, for example 2026-09-01T00:00:00Z.",
      "invalid_date",
    );
  }
  return parsed.toISOString();
}

function outcomeMark(event: AuditEvent): string {
  if (event.outcome === "failure") return c.red(glyph.cross);
  if (event.outcome === "warning") return c.yellow(glyph.warn);
  return c.green(glyph.check);
}

function actor(event: AuditEvent): string {
  return event.actor.kind === "user" ? event.actor.name : `${event.actor.name} (${event.actor.kind})`;
}

export async function auditCommand(
  globals: GlobalOptions,
  options: AuditOptions = {},
): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const categories = parseAuditCategories(options.category);
  const before = parseBefore(options.before);
  const query = { limit: options.limit, before };

  // The route pages by time, not by category, so a category is a cut of the
  // page rather than a filter the server applies.
  const select = (events: AuditEvent[]): AuditEvent[] =>
    categories.length === 0 ? events : events.filter((event) => categories.includes(event.category));

  let events = select((await session.client.auditEvents(query)).events);

  if (isAgentMode()) {
    out.agentEmit(
      { total: events.length, events: events.map(compactAuditEvent) },
      ["cf status --agent"],
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ events });
    return 0;
  }

  printList({
    noun: "event",
    scope: categories.length > 0 ? categories.join(", ") : "this account",
    rows: events,
    columns: [
      { header: "when", value: (event) => c.dim(relativeTime(event.at)), min: 8, max: 12 },
      { header: "", value: (event) => outcomeMark(event), min: 1, max: 1 },
      { header: "category", value: (event) => c.dim(event.category), min: 8, max: 12 },
      { header: "event", value: (event) => event.summary || event.action, min: 24 },
      { header: "actor", value: (event) => c.dim(actor(event)), min: 8, max: 22 },
    ],
    pipeColumns: [
      { header: "when", value: (event) => event.at },
      { header: "category", value: (event) => event.category },
      { header: "action", value: (event) => event.action },
      { header: "actor", value: actor },
      { header: "target", value: (event) => event.target.label || event.target.id },
    ],
    empty:
      categories.length > 0
        ? `No ${categories.join(", ")} activity is recorded.`
        : "No activity is recorded on this account yet.",
    next: [
      { command: "cf audit --category fix", purpose: "narrow to one category" },
      { command: "cf audit --limit 100", purpose: "fetch more events" },
    ],
  });

  return 0;
}
