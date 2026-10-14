import { openSession, type GlobalOptions } from "../core/session.js";
import { UsageError } from "../core/errors.js";
import { prune } from "../core/compact.js";
import { activeOrganization } from "../core/organizations.js";
import { formatDollarRange, formatDollars } from "../core/chain.js";
import type { BusinessContext, BusinessContextInput, BusinessContextResponse } from "../core/types.js";
import * as out from "../ui/output.js";
import { details } from "../ui/table.js";
import { hintLines } from "../ui/list.js";
import { datedLabel } from "../ui/format.js";
import { c } from "../ui/theme.js";
import { isAgentMode } from "../ui/mode.js";

export const BUSINESS_CONTEXT_LIMITS = {
  recordsHeld: 1_000_000_000_000,
  revenuePerHourCents: 10_000_000_000_000,
  costPerRecordCents: 10_000_000,
} as const;

export const BUSINESS_CONTEXT_EXAMPLE = "cf org context set --records 180000 --revenue-per-hour 6000 --cost-per-record 4-14";

export interface ContextFlags {
  records?: string;
  revenuePerHour?: string;
  costPerRecord?: string;
}

function invalid(message: string, remedy: string): UsageError {
  return new UsageError(message, remedy, "invalid_business_context");
}

function plainNumber(raw: string): string {
  return raw.trim().replace(/^\$/, "").replace(/[,_]/g, "");
}

export function parseRecords(raw: string): number {
  const text = plainNumber(raw);
  if (!/^\d+$/.test(text)) {
    throw invalid(`${raw} is not a number of records.`, "Pass a whole number, for example --records 180000.");
  }
  const value = Number(text);
  if (value > BUSINESS_CONTEXT_LIMITS.recordsHeld) {
    throw invalid(
      `${raw} records is more than Cefense accepts.`,
      `Pass at most ${BUSINESS_CONTEXT_LIMITS.recordsHeld.toLocaleString("en-US")} records.`,
    );
  }
  return value;
}

export function parseCents(raw: string, flag: string, limitCents: number): number {
  const text = plainNumber(raw);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw invalid(
      `${raw} is not an amount in dollars.`,
      `Pass dollars with at most two decimals, for example ${flag} 6000 or ${flag} 4.50.`,
    );
  }
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents > limitCents) {
    throw invalid(`${raw} is more than Cefense accepts for ${flag}.`, `Pass at most ${formatDollars(limitCents)}.`);
  }
  return cents;
}

export function parseCostRange(raw: string): { low: number; high: number } {
  const parts = raw.trim().split(/\s*-\s*/);
  if (parts.length > 2 || parts.some((part) => part === "")) {
    throw invalid(`${raw} is not a cost range.`, "Pass the low and high cost per record in dollars, for example --cost-per-record 4-14.");
  }
  const low = parseCents(parts[0]!, "--cost-per-record", BUSINESS_CONTEXT_LIMITS.costPerRecordCents);
  const high = parts[1] === undefined ? low : parseCents(parts[1], "--cost-per-record", BUSINESS_CONTEXT_LIMITS.costPerRecordCents);
  if (low > high) {
    throw invalid(
      `The low cost per record, ${formatDollars(low)}, is higher than the high one, ${formatDollars(high)}.`,
      `Put the lower amount first, for example --cost-per-record ${plainNumber(parts[1]!)}-${plainNumber(parts[0]!)}.`,
    );
  }
  return { low, high };
}

export function mergeContext(
  current: BusinessContextInput | null,
  flags: ContextFlags,
): BusinessContextInput {
  const records = flags.records !== undefined ? parseRecords(flags.records) : current?.recordsHeld;
  const revenue =
    flags.revenuePerHour !== undefined
      ? parseCents(flags.revenuePerHour, "--revenue-per-hour", BUSINESS_CONTEXT_LIMITS.revenuePerHourCents)
      : current?.revenuePerHourCents;
  const range = flags.costPerRecord !== undefined ? parseCostRange(flags.costPerRecord) : null;
  const low = range ? range.low : current?.costPerRecordLowCents;
  const high = range ? range.high : current?.costPerRecordHighCents;

  if (flags.records === undefined && flags.revenuePerHour === undefined && flags.costPerRecord === undefined) {
    throw new UsageError(
      "Nothing to change.",
      "Pass --records <n>, --revenue-per-hour <usd>, or --cost-per-record <low>-<high>.",
      "usage_error",
    );
  }

  const missing = [
    records === undefined ? "--records" : null,
    revenue === undefined ? "--revenue-per-hour" : null,
    low === undefined || high === undefined ? "--cost-per-record" : null,
  ].filter((flag): flag is string => flag !== null);
  if (missing.length > 0) {
    throw invalid(
      `This organization has no business context yet, so ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} needed too.`,
      `Pass all three the first time, for example ${BUSINESS_CONTEXT_EXAMPLE}.`,
    );
  }

  return {
    recordsHeld: records!,
    revenuePerHourCents: revenue!,
    costPerRecordLowCents: low!,
    costPerRecordHighCents: high!,
  };
}

function inputOf(context: BusinessContext | null): BusinessContextInput | null {
  if (!context) return null;
  return {
    recordsHeld: context.recordsHeld,
    revenuePerHourCents: context.revenuePerHourCents,
    costPerRecordLowCents: context.costPerRecordLowCents,
    costPerRecordHighCents: context.costPerRecordHighCents,
  };
}

function payload(response: BusinessContextResponse, organization: string | null): Record<string, unknown> {
  const context = response.context;
  return prune({
    organization,
    set: Boolean(context),
    canEdit: response.canEdit,
    recordsHeld: context?.recordsHeld,
    revenuePerHourCents: context?.revenuePerHourCents,
    costPerRecordLowCents: context?.costPerRecordLowCents,
    costPerRecordHighCents: context?.costPerRecordHighCents,
    updatedAt: context?.updatedAt,
    updatedBy: context?.updatedBy?.name ?? null,
  });
}

function render(response: BusinessContextResponse, organization: string | null): string[] {
  const context = response.context;
  const lines = ["", `${c.bold("Business context")}${organization ? ` ${c.dim(organization)}` : ""}`];
  if (!context) {
    lines.push(
      `  ${c.dim("Not set, so findings show their chain without a cost estimate.")}`,
      ...hintLines(
        response.canEdit
          ? [{ command: BUSINESS_CONTEXT_EXAMPLE, purpose: "give every finding a cost range" }]
          : [],
      ),
    );
    if (!response.canEdit) lines.push(`  ${c.dim("Only an owner or admin can set it.")}`);
    lines.push("");
    return lines;
  }
  lines.push(
    "",
    ...details([
      ["Records held", context.recordsHeld.toLocaleString("en-US")],
      ["Revenue per hour", formatDollars(context.revenuePerHourCents)],
      ["Cost per record", formatDollarRange(context.costPerRecordLowCents, context.costPerRecordHighCents)],
      [
        "Updated",
        `${datedLabel(context.updatedAt)}${context.updatedBy?.name ? c.dim(` by ${context.updatedBy.name}`) : ""}`,
      ],
    ]).map((row) => `  ${row}`),
  );
  lines.push(`  ${c.dim("Every finding's cost range is computed from these answers.")}`);
  if (!response.canEdit) lines.push(`  ${c.dim("Only an owner or admin can change them.")}`);
  lines.push("");
  return lines;
}

export async function orgContextShow(globals: GlobalOptions): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const response = await session.client.businessContext();
  const organization = activeOrganization(session.apiUrl);

  if (isAgentMode()) {
    out.agentEmit(payload(response, organization));
    return 0;
  }
  if (out.isJsonMode()) {
    out.json(response);
    return 0;
  }
  out.lines(render(response, organization));
  return 0;
}

export async function orgContextSet(globals: GlobalOptions, flags: ContextFlags): Promise<number> {
  if (flags.records === undefined && flags.revenuePerHour === undefined && flags.costPerRecord === undefined) {
    mergeContext(null, flags);
  }
  if (flags.records !== undefined) parseRecords(flags.records);
  if (flags.revenuePerHour !== undefined) {
    parseCents(flags.revenuePerHour, "--revenue-per-hour", BUSINESS_CONTEXT_LIMITS.revenuePerHourCents);
  }
  if (flags.costPerRecord !== undefined) parseCostRange(flags.costPerRecord);

  const session = await openSession(globals, { auth: true });
  const current = await session.client.businessContext();
  const next = mergeContext(inputOf(current.context), flags);
  const response = await session.client.setBusinessContext(next);
  const organization = activeOrganization(session.apiUrl);

  if (isAgentMode()) {
    out.agentEmit(payload(response, organization), ["cf org context --agent"]);
    return 0;
  }
  if (out.isJsonMode()) {
    out.json(response);
    return 0;
  }
  out.success("Business context saved. Every finding's cost range now reads from it.");
  out.lines(render(response, organization));
  return 0;
}
