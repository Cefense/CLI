import { padEnd, padStart, shortenPath, stripAnsi, truncate, truncateStart, visibleLength } from "./format.js";
import { c } from "./theme.js";

export type Overflow = "end" | "start" | "path" | "never";

export interface Column<T> {
  header: string;
  value: (row: T) => string;
  align?: "left" | "right";
  min?: number;
  max?: number;
  flex?: boolean;
  overflow?: Overflow;
}

export interface Fit {
  natural: number;
  min: number;
  flex: boolean;
  overflow: Overflow;
}

export function fitWidths(columns: Fit[], available: number): number[] {
  const widths = columns.map((column) => column.natural);
  let over = widths.reduce((sum, value) => sum + value, 0) - available;
  if (over <= 0) return widths;

  const shrink = (indices: number[], floor: (index: number) => number): void => {
    while (over > 0) {
      let widest = -1;
      for (const index of indices) {
        if (widths[index]! <= floor(index)) continue;
        if (widest === -1 || widths[index]! > widths[widest]!) widest = index;
      }
      if (widest === -1) return;
      widths[widest] = widths[widest]! - 1;
      over -= 1;
    }
  };

  const all = columns.map((_, index) => index);
  const floorOf = (index: number) => Math.min(columns[index]!.min, columns[index]!.natural);
  const of = (test: (column: Fit) => boolean) => all.filter((index) => test(columns[index]!));

  shrink(of((column) => column.overflow === "path" || column.overflow === "start"), floorOf);
  shrink(of((column) => column.flex), floorOf);
  shrink(of((column) => column.overflow !== "never"), floorOf);
  shrink(all, floorOf);
  shrink(all, () => 1);
  return widths;
}

function clip(value: string, width: number, overflow: Overflow): string {
  if (visibleLength(value) <= width) return value;
  if (overflow === "path") return value === stripAnsi(value) ? shortenPath(value, width) : truncateStart(value, width);
  if (overflow === "start") return truncateStart(value, width);
  return truncate(value, width);
}

export function renderTable<T>(
  rows: T[],
  all: Column<T>[],
  options: { width: number; gap?: number; header?: boolean },
): string[] {
  if (rows.length === 0) return [];
  const gap = options.gap ?? 2;
  const showHeader = options.header !== false;
  const raw = rows.map((row) => all.map((column) => column.value(row)));
  const keep = all.map(
    (column, index) => (showHeader && column.header.length > 0) || raw.some((row) => visibleLength(row[index] ?? "") > 0),
  );
  const columns = all.filter((_, index) => keep[index]);
  const cells = raw.map((row) => row.filter((_, index) => keep[index]));

  const fits: Fit[] = columns.map((column, index) => {
    const longest = Math.max(
      showHeader ? column.header.length : 0,
      ...cells.map((row) => visibleLength(row[index] ?? "")),
    );
    return {
      natural: Math.min(column.max ?? Number.MAX_SAFE_INTEGER, longest),
      min: column.min ?? Math.min(8, longest),
      flex: Boolean(column.flex),
      overflow: column.overflow ?? "end",
    };
  });

  const widths = fitWidths(fits, options.width - gap * (columns.length - 1));

  const cell = (value: string, index: number) => {
    const width = widths[index]!;
    const column = columns[index]!;
    const clipped = clip(value, width, fits[index]!.overflow);
    return column.align === "right" ? padStart(clipped, width) : padEnd(clipped, width);
  };

  const line = (values: string[]) =>
    values
      .map((value, index) => cell(value, index))
      .join(" ".repeat(gap))
      .trimEnd();

  const output: string[] = [];
  if (showHeader) {
    const plain = columns
      .map((column, index) => {
        const width = widths[index]!;
        const label = truncate(column.header.toUpperCase(), width);
        return column.align === "right" ? padStart(label, width) : padEnd(label, width);
      })
      .join(" ".repeat(gap))
      .trimEnd();
    output.push(c.dim(plain));
  }
  for (const row of cells) output.push(line(row));
  return output;
}

export function keyValue(pairs: Array<[string, string]>, labelWidth?: number): string[] {
  if (pairs.length === 0) return [];
  const width = labelWidth ?? Math.max(...pairs.map(([label]) => label.length));
  return pairs.map(([label, value]) => `${c.dim(padEnd(label, width))}  ${value}`);
}

export function details(
  pairs: Array<[string, string | null | undefined | false]>,
  labelWidth?: number,
): string[] {
  const kept = pairs.filter((pair): pair is [string, string] => typeof pair[1] === "string" && pair[1] !== "");
  return keyValue(kept, labelWidth);
}
