import { padEnd, stripAnsi, terminalWidth } from "./format.js";
import { isPiped, line, lines } from "./output.js";
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
      `Columns are ${known.join(", ")}.`,
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
  next?: NextStep[];
}

export interface Group<T> {
  label: string;
  rows: T[];
  total?: number;
  tint?: (value: string) => string;
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
  next?: NextStep[];
}

function pipe<T>(rows: T[], columns: Column<T>[]): void {
  for (const row of rows) {
    process.stdout.write(`${columns.map((column) => stripAnsi(column.value(row))).join("\t")}\n`);
  }
}

function plural(count: number, noun: string): string {
  if (count === 1) return noun;
  return noun.endsWith("y") ? `${noun.slice(0, -1)}ies` : `${noun}s`;
}

export function summary(shown: number, total: number, noun: string, scope: string): void {
  line(`Showing ${shown} of ${total} ${plural(total, noun)} in ${scope}`);
}

export function section(label: string, tint?: (value: string) => string): void {
  line((tint ?? ((value: string) => value))(c.bold(label)));
}

export function nextSteps(steps: NextStep[]): void {
  if (steps.length === 0) return;
  const width = Math.max(...steps.map((step) => step.command.length));
  line();
  for (const step of steps) line(c.dim(`${padEnd(step.command, width)}   ${step.purpose}`));
}

function nothing<T>(view: ListView<T> | GroupedView<T>): void {
  line();
  line(c.dim(view.empty));
  if (view.emptyHint) line(c.dim(view.emptyHint));
  nextSteps(view.next ?? []);
  line();
}

export function printList<T>(view: ListView<T>): void {
  if (isPiped()) {
    pipe(view.rows, view.pipeColumns ?? view.columns);
    return;
  }
  const columns = select(view.columns);

  if (view.rows.length === 0) {
    nothing(view);
    return;
  }

  line();
  summary(view.rows.length, view.total ?? view.rows.length, view.noun, view.scope);
  line();
  lines(renderTable(view.rows, columns, { width: terminalWidth() }));

  if (view.footnote) {
    line();
    line(c.dim(view.footnote));
  }
  nextSteps(view.next ?? []);
  line();
}

export function printGrouped<T>(view: GroupedView<T>): void {
  const groups = view.groups.filter((group) => group.rows.length > 0);
  const flat = groups.flatMap((group) => group.rows);

  if (isPiped()) {
    pipe(flat, view.pipeColumns ?? view.columns);
    return;
  }
  const columns = select(view.columns);

  if (flat.length === 0) {
    nothing(view);
    return;
  }

  line();
  summary(flat.length, view.total ?? flat.length, view.noun, view.scope);

  const body = renderTable(flat, columns, {
    width: terminalWidth() - INDENT.length,
    header: false,
  });

  let cursor = 0;
  for (const group of groups) {
    line();
    section(group.label, group.tint);
    for (const row of body.slice(cursor, cursor + group.rows.length)) line(`${INDENT}${row}`);
    cursor += group.rows.length;
  }

  if (view.footnote) {
    line();
    line(c.dim(view.footnote));
  }
  nextSteps(view.next ?? []);
  line();
}
