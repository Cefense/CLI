import { openSession, type GlobalOptions } from "../core/session.js";
import { UsageError } from "../core/errors.js";
import type { AuditEvent } from "../core/types.js";
import { browse } from "../ui/browser.js";
import * as out from "../ui/output.js";
import { keyValue, renderTable } from "../ui/table.js";
import { absoluteDate, padEnd, relativeTime, terminalWidth, truncate, wrapText } from "../ui/format.js";
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

function eventDetail(event: AuditEvent, width: number): string[] {
  const lines: string[] = [];
  const push = (value = "") => lines.push(value ? `  ${value}` : "");
  const body = Math.min(96, width - 4);

  push();
  push(`${c.bold(event.action)}   ${outcomeMark(event)} ${c.dim(event.outcome)}`);
  push();
  if (event.summary) {
    for (const wrapped of wrapText(event.summary, body)) push(wrapped);
    push();
  }

  const facts: Array<[string, string]> = [
    ["When", `${absoluteDate(event.at)}   ${c.dim(relativeTime(event.at))}`],
    ["Category", event.category],
    ["Actor", actor(event)],
    ["Target", `${event.target.label || event.target.id}   ${c.dim(event.target.type)}`],
  ];
  for (const row of keyValue(facts, 10)) push(row);

  if (event.changes?.length) {
    push();
    push(c.dim("CHANGES"));
    push();
    for (const change of event.changes) {
      push(`${c.dim(padEnd(change.field, 14))}${c.red(change.from || "empty")} ${c.dim(glyph.arrow)} ${c.green(change.to || "empty")}`);
    }
  }

  const metadata = Object.entries(event.metadata ?? {});
  if (metadata.length > 0) {
    push();
    push(c.dim("DETAIL"));
    push();
    for (const row of keyValue(metadata, 14)) push(row);
  }

  const source = Object.entries(event.source ?? {});
  if (source.length > 0) {
    push();
    push(c.dim("SOURCE"));
    push();
    for (const row of keyValue(source, 14)) push(row);
  }

  push();
  return lines;
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

  if (events.length === 0) {
    out.line();
    out.info(
      categories.length > 0
        ? `No ${categories.join(", ")} activity is recorded.`
        : "No activity is recorded on this account yet.",
    );
    out.line();
    return 0;
  }

  if (out.isPiped()) {
    out.lines(
      renderTable(
        events,
        [
          { header: "when", value: (event) => relativeTime(event.at), min: 9 },
          { header: "category", value: (event) => event.category, min: 10 },
          { header: "action", value: (event) => event.action, min: 16 },
          { header: "actor", value: actor, min: 10 },
          { header: "target", value: (event) => event.target.label || event.target.id, min: 12 },
        ],
        { width: terminalWidth() - 4 },
      ).map((row) => `  ${row}`),
    );
    out.line();
    return 0;
  }

  await browse(events, {
    header: (visible) => [
      "",
      `  ${c.bold("Activity")}   ${c.dim(`${visible.length} ${visible.length === 1 ? "event" : "events"}`)}`,
      `  ${c.dim(categories.length > 0 ? categories.join(", ") : "everything on this account")}`,
      "",
    ],
    renderRow: (event, selected, width) => {
      const marker = selected ? c.cyan(glyph.arrow) : " ";
      const summary = event.summary || event.action;
      const room = Math.max(20, width - 52);
      const title = truncate(summary, room);
      return [
        `${marker} ${outcomeMark(event)} ${padEnd(selected ? c.bold(title) : title, room)}  ${padEnd(c.dim(event.category), 14)}${c.dim(relativeTime(event.at))}`,
      ];
    },
    renderDetail: eventDetail,
    filterText: (event) =>
      `${event.action} ${event.category} ${event.summary} ${event.target.label} ${event.actor.name}`,
    emptyMessage: "No event matches that filter.",
    refresh: async () => {
      events = select((await session.client.auditEvents(query)).events);
      return events;
    },
  });

  return 0;
}
