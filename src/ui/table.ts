import { padEnd, padStart, truncate, visibleLength } from "./format.js";
import { c } from "./theme.js";

export interface Column<T> {
  header: string;
  value: (row: T) => string;
  align?: "left" | "right";
  min?: number;
  max?: number;
}

export function renderTable<T>(
  rows: T[],
  columns: Column<T>[],
  options: { width: number; gap?: number; header?: boolean },
): string[] {
  if (rows.length === 0) return [];
  const gap = options.gap ?? 2;
  const cells = rows.map((row) => columns.map((column) => column.value(row)));

  const widths = columns.map((column, index) => {
    const longest = Math.max(
      options.header === false ? 0 : visibleLength(column.header),
      ...cells.map((row) => visibleLength(row[index] ?? "")),
    );
    return Math.min(column.max ?? Number.MAX_SAFE_INTEGER, Math.max(column.min ?? 0, longest));
  });

  const totalGap = gap * (columns.length - 1);
  let overflow = widths.reduce((sum, value) => sum + value, 0) + totalGap - options.width;
  if (overflow > 0) {
    const order = columns
      .map((column, index) => ({ index, width: widths[index]! }))
      .sort((left, right) => right.width - left.width);
    for (const entry of order) {
      if (overflow <= 0) break;
      const floor = columns[entry.index]!.min ?? 8;
      const reduce = Math.min(overflow, Math.max(0, widths[entry.index]! - floor));
      widths[entry.index] = widths[entry.index]! - reduce;
      overflow -= reduce;
    }
  }

  const line = (values: string[]) =>
    values
      .map((value, index) => {
        const width = widths[index]!;
        const clipped = truncate(value, width);
        return columns[index]!.align === "right" ? padStart(clipped, width) : padEnd(clipped, width);
      })
      .join(" ".repeat(gap))
      .trimEnd();

  const output: string[] = [];
  if (options.header !== false) {
    output.push(c.dim(line(columns.map((column) => column.header.toUpperCase()))));
  }
  for (const row of cells) output.push(line(row));
  return output;
}

export function keyValue(pairs: Array<[string, string]>, labelWidth?: number): string[] {
  const width = labelWidth ?? Math.max(...pairs.map(([label]) => label.length));
  return pairs.map(([label, value]) => `${c.dim(padEnd(label, width))}  ${value}`);
}
