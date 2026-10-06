import { formatCount, plural, sanitizeForTerminal, stripAnsi, terminalWidth } from "./format.js";
import { isPiped, line } from "./output.js";
import { page } from "./pager.js";
import { renderTable, type Column } from "./table.js";
import { c } from "./theme.js";
import { UsageError } from "../core/errors.js";

const INDENT = "  ";

let wanted: string[] | null = null;

export function setColumnFilter(value: string | undefined): void {
  wanted = value
    ? value
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    : null;
}

function select<T>(columns: Column<T>[]): Column<T>[] {
  if (!wanted || wanted.length === 0) return columns;
  const known = columns.map((column) => column.header.toLowerCase());
  const missing = wanted.filter((entry) => !known.includes(entry));
  if (missing.length > 0) {
    throw new UsageError(
      `${missing.join(", ")} is not a column here.`,
      `Columns are ${known.filter(Boolean).join(", ")}.`,
      "unknown_column",
    );
  }
  return wanted.map((entry) => columns.find((column) => column.header.toLowerCase() === entry)!);
}

export interface NextStep {
  command: string;
  purpose: string;
}

export interface ListView<T> {
  noun: string;
  scope: string;
  total?: number;
  columns: Column<T>[];
  pipeColumns?: Column<T>[];
  rows: T[];
  empty: string;
  emptyHint?: string | null;
  footnote?: string | null;
  banner?: string[];
  next?: NextStep[];
}

export interface Group<T> {
  label: string;
  rows: T[];
  total?: number;
  tint?: (value: string) => string;
  collapsed?: string;
}

export interface GroupedView<T> {
  noun: string;
  scope: string;
  total?: number;
  groups: Group<T>[];
  columns: Column<T>[];
  pipeColumns?: Column<T>[];
  empty: string;
  emptyHint?: string | null;
  footnote?: string | null;
  banner?: string[];
  next?: NextStep[];
}

function pipe<T>(rows: T[], columns: Column<T>[], banner: string[] = []): void {
  for (const value of banner) process.stderr.write(`${sanitizeForTerminal(stripAnsi(value))}\n`);
  for (const row of rows) {
    process.stdout.write(`${columns.map((column) => stripAnsi(column.value(row))).join("\t")}\n`);
  }
}

export function summaryLine(shown: number, total: number, noun: string, scope: string): string {
  return `Showing ${formatCount(shown)} of ${formatCount(total)} ${plural(total, noun)} in ${scope}`;
}

export function summary(shown: number, total: number, noun: string, scope: string): void {
  line(summaryLine(shown, total, noun, scope));
}

export function sectionLine(label: string, count?: number | string | null, tint?: (value: string) => string): string {
  const title = (tint ?? ((value: string) => value))(c.bold(label));
  if (count === undefined || count === null) return title;
  return `${title}  ${c.dim(typeof count === "number" ? formatCount(count) : count)}`;
}

export function section(label: string, tint?: (value: string) => string): void {
  line(sectionLine(label, null, tint));
}

export function hintLine(step: NextStep | null | undefined): string | null {
  if (!step) return null;
  return c.dim(`To ${step.purpose}, run ${step.command}`);
}

export function hintLines(steps: NextStep[] | undefined): string[] {
  const hint = hintLine(steps?.[0]);
  return hint ? ["", hint] : [];
}

export function nextSteps(steps: NextStep[]): void {
  for (const value of hintLines(steps)) line(value);
}

function nothing<T>(view: ListView<T> | GroupedView<T>): void {
  const body = [
    ...(view.banner ?? []),
    "",
    view.empty,
    ...(view.emptyHint ? [c.dim(view.emptyHint)] : []),
    ...hintLines(view.next),
    "",
  ];
  for (const value of body) line(value);
}

function tail(view: { footnote?: string | null; next?: NextStep[] }): string[] {
  return [...(view.footnote ? ["", c.dim(view.footnote)] : []), ...hintLines(view.next), ""];
}

export function printList<T>(view: ListView<T>): void {
  if (isPiped()) {
    pipe(view.rows, view.pipeColumns ?? view.columns, view.banner);
    return;
  }
  const columns = select(view.columns);

  if (view.rows.length === 0) {
    nothing(view);
    return;
  }

  page([
    ...(view.banner ?? []),
    "",
    summaryLine(view.rows.length, view.total ?? view.rows.length, view.noun, view.scope),
    "",
    ...renderTable(view.rows, columns, { width: terminalWidth() }),
    ...tail(view),
  ]);
}

export function printGrouped<T>(view: GroupedView<T>): void {
  const groups = view.groups.filter((group) => group.rows.length > 0);
  const flat = groups.flatMap((group) => group.rows);

  if (isPiped()) {
    pipe(flat, view.pipeColumns ?? view.columns, view.banner);
    return;
  }
  const columns = select(view.columns);

  if (flat.length === 0) {
    nothing(view);
    return;
  }

  const open = groups.filter((group) => !group.collapsed);
  const body = renderTable(
    open.flatMap((group) => group.rows),
    columns,
    { width: terminalWidth() - INDENT.length, header: false },
  );
  const content: string[] = [
    ...(view.banner ?? []),
    "",
    summaryLine(flat.length, view.total ?? flat.length, view.noun, view.scope),
  ];

  let cursor = 0;
  for (const group of groups) {
    content.push("");
    content.push(sectionLine(group.label, group.total ?? group.rows.length, group.tint));
    if (group.collapsed) {
      content.push(`${INDENT}${c.dim(group.collapsed)}`);
      continue;
    }
    for (const row of body.slice(cursor, cursor + group.rows.length)) content.push(`${INDENT}${row}`);
    cursor += group.rows.length;
  }

  page([...content, ...tail(view)]);
}
