import { terminalHeight, terminalWidth, truncate } from "./format.js";
import { c, glyph } from "./theme.js";
import {
  enterFullScreen,
  exitFullScreen,
  isInteractive,
  paint,
  readKeys,
  type InputSession,
  type Key,
} from "./screen.js";

export interface BrowserContext<T> {
  readonly items: T[];
  readonly selected: T | null;
  refresh(): Promise<void>;
  setStatus(message: string | null): void;
  close(): void;
  openDetail(): void;
  closeDetail(): void;
  suspend<R>(run: () => Promise<R>): Promise<R>;
}

export interface BrowserAction<T> {
  key: string;
  label: string | ((item: T | null) => string | null);
  inList?: boolean;
  inDetail?: boolean;
  run: (item: T | null, context: BrowserContext<T>) => Promise<void> | void;
}

export interface BrowserSpec<T> {
  header: (items: T[]) => string[];
  renderRow: (item: T, selected: boolean, width: number) => string[];
  renderDetail?: (item: T, width: number) => string[];
  /**
   * What enter does on a screen with no detail pane.
   *
   * A settings list is edited in place rather than read, so enter has to act on
   * the selected row. It is ignored when `renderDetail` is set, because there
   * enter already means open.
   */
  onSelect?: (item: T, context: BrowserContext<T>) => Promise<void> | void;
  selectLabel?: string | ((item: T | null) => string | null);
  filterText?: (item: T) => string;
  emptyMessage: string;
  actions?: BrowserAction<T>[];
  refresh?: () => Promise<T[]>;
  refreshIntervalMs?: number;
  shouldKeepRefreshing?: (items: T[]) => boolean;
}

const RESERVED = new Set(["up", "down", "left", "right", "pageup", "pagedown", "home", "end", "enter", "escape", "ctrl-c", "backspace", "tab", "/"]);

export async function browse<T>(initial: T[], spec: BrowserSpec<T>): Promise<void> {
  let items = initial;
  let cursor = 0;
  let top = 0;
  let detailOpen = false;
  let detailScroll = 0;
  let filtering = false;
  let query = "";
  let status: string | null = null;
  let closed = false;
  let suspended = false;

  const actions = spec.actions ?? [];

  const filtered = (): T[] => {
    if (!query || !spec.filterText) return items;
    const needle = query.toLowerCase();
    return items.filter((item) => spec.filterText!(item).toLowerCase().includes(needle));
  };

  const current = (): T | null => filtered()[cursor] ?? null;

  const labelFor = (action: BrowserAction<T>, item: T | null): string | null =>
    typeof action.label === "function" ? action.label(item) : action.label;

  const availableActions = (where: "list" | "detail"): Array<{ action: BrowserAction<T>; label: string }> => {
    const item = current();
    const usable: Array<{ action: BrowserAction<T>; label: string }> = [];
    for (const action of actions) {
      if (where === "list" && action.inList === false) continue;
      if (where === "detail" && action.inDetail === false) continue;
      const label = labelFor(action, item);
      if (label) usable.push({ action, label });
    }
    return usable;
  };

  const footerLine = (): string => {
    if (filtering) {
      return c.dim("filter: ") + query + c.dim("_   enter apply   esc clear");
    }
    const hints: string[] = [];
    if (detailOpen) {
      hints.push(`${glyph.up}${glyph.down} scroll`);
      for (const entry of availableActions("detail")) hints.push(`${entry.action.key} ${entry.label}`);
      hints.push("esc back");
    } else {
      hints.push(`${glyph.up}${glyph.down} move`);
      if (spec.renderDetail) hints.push("enter open");
      else if (spec.onSelect) {
        const label =
          typeof spec.selectLabel === "function"
            ? spec.selectLabel(current())
            : (spec.selectLabel ?? "select");
        if (label) hints.push(`enter ${label}`);
      }
      if (spec.filterText) hints.push("/ filter");
      for (const entry of availableActions("list")) hints.push(`${entry.action.key} ${entry.label}`);
      hints.push("q quit");
    }
    return c.dim(hints.join("   "));
  };

  const render = (): void => {
    const width = terminalWidth();
    const height = terminalHeight();
    const visible = filtered();
    const lines: string[] = [];

    if (detailOpen && spec.renderDetail && current()) {
      const detail = spec.renderDetail(current()!, width);
      const room = Math.max(1, height - 3);
      detailScroll = Math.max(0, Math.min(detailScroll, Math.max(0, detail.length - room)));
      lines.push(...detail.slice(detailScroll, detailScroll + room).map((line) => truncate(line, width)));
      while (lines.length < room) lines.push("");
      if (detail.length > room) {
        const position = Math.min(100, Math.round(((detailScroll + room) / detail.length) * 100));
        lines.push(c.dim(`${position}%`));
      } else {
        lines.push("");
      }
      lines.push(status ? c.cyan(truncate(status, width)) : "");
      lines.push(footerLine());
      paint(lines);
      return;
    }

    const header = spec.header(visible).map((line) => truncate(line, width));
    lines.push(...header);

    const room = Math.max(1, height - header.length - 3);
    const blocks = visible.map((item, index) => spec.renderRow(item, index === cursor, width));

    if (cursor < top) top = cursor;
    let used = 0;
    let last = top;
    for (let index = top; index < blocks.length; index += 1) {
      const size = blocks[index]!.length;
      if (used + size > room) break;
      used += size;
      last = index;
    }
    while (cursor > last && top < blocks.length - 1) {
      top += 1;
      used = 0;
      last = top;
      for (let index = top; index < blocks.length; index += 1) {
        const size = blocks[index]!.length;
        if (used + size > room) break;
        used += size;
        last = index;
      }
    }

    if (visible.length === 0) {
      lines.push("");
      lines.push(c.dim(`  ${spec.emptyMessage}`));
      used = 2;
    } else {
      for (let index = top; index <= last; index += 1) {
        lines.push(...blocks[index]!.map((line) => truncate(line, width)));
      }
    }

    while (lines.length < height - 2) lines.push("");
    const counter =
      visible.length > 0 && visible.length !== items.length
        ? c.dim(`${visible.length} of ${items.length}`)
        : "";
    lines.push(status ? c.cyan(truncate(status, width)) : counter);
    lines.push(footerLine());
    paint(lines);
  };

  const context: BrowserContext<T> = {
    get items() {
      return items;
    },
    get selected() {
      return current();
    },
    async refresh() {
      if (!spec.refresh) return;
      items = await spec.refresh();
      const visible = filtered();
      if (cursor >= visible.length) cursor = Math.max(0, visible.length - 1);
      render();
    },
    setStatus(message: string | null) {
      status = message;
      if (!suspended) render();
    },
    close() {
      closed = true;
    },
    openDetail() {
      detailOpen = Boolean(spec.renderDetail);
      detailScroll = 0;
    },
    closeDetail() {
      detailOpen = false;
    },
    async suspend<R>(run: () => Promise<R>): Promise<R> {
      suspended = true;
      input?.close();
      exitFullScreen();
      try {
        return await run();
      } finally {
        enterFullScreen();
        input = readKeys(onKey);
        suspended = false;
        render();
      }
    },
  };

  let resolveDone: (() => void) | null = null;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const finish = () => {
    if (!closed) closed = true;
    resolveDone?.();
  };

  const runAction = async (action: BrowserAction<T>): Promise<void> => {
    try {
      await action.run(current(), context);
    } catch (error) {
      status = error instanceof Error ? error.message : String(error);
      suspended = false;
    }
  };

  const onKey = (key: Key): void => {
    if (suspended) return;
    void handleKey(key);
  };

  const handleKey = async (key: Key): Promise<void> => {
    const visible = filtered();

    if (filtering) {
      if (key.name === "enter") {
        filtering = false;
      } else if (key.name === "escape") {
        filtering = false;
        query = "";
        cursor = 0;
      } else if (key.name === "backspace") {
        query = query.slice(0, -1);
        cursor = 0;
      } else if (key.printable) {
        query += key.printable;
        cursor = 0;
      } else if (key.name === "ctrl-c") {
        finish();
        return;
      }
      render();
      return;
    }

    if (key.name === "ctrl-c") {
      finish();
      return;
    }

    if (detailOpen) {
      if (key.name === "escape" || key.name === "q") {
        detailOpen = false;
        render();
        return;
      }
      if (key.name === "up" || key.name === "k") detailScroll = Math.max(0, detailScroll - 1);
      else if (key.name === "down" || key.name === "j") detailScroll += 1;
      else if (key.name === "pageup") detailScroll = Math.max(0, detailScroll - 10);
      else if (key.name === "pagedown") detailScroll += 10;
      else if (key.name === "left" && cursor > 0) {
        cursor -= 1;
        detailScroll = 0;
      } else if (key.name === "right" && cursor < visible.length - 1) {
        cursor += 1;
        detailScroll = 0;
      } else {
        const action = availableActions("detail").find((entry) => entry.action.key === key.name)?.action;
        if (action) {
          status = null;
          await runAction(action);
          if (closed) {
            finish();
            return;
          }
        }
      }
      render();
      return;
    }

    if (key.name === "q" || key.name === "escape") {
      if (query) {
        query = "";
        cursor = 0;
        render();
        return;
      }
      finish();
      return;
    }

    if (key.name === "/" && spec.filterText) {
      filtering = true;
      render();
      return;
    }

    if (key.name === "up" || key.name === "k") cursor = Math.max(0, cursor - 1);
    else if (key.name === "down" || key.name === "j") cursor = Math.min(visible.length - 1, cursor + 1);
    else if (key.name === "pageup") cursor = Math.max(0, cursor - 10);
    else if (key.name === "pagedown") cursor = Math.min(visible.length - 1, cursor + 10);
    else if (key.name === "home") cursor = 0;
    else if (key.name === "end") cursor = Math.max(0, visible.length - 1);
    else if (key.name === "enter" && spec.renderDetail && visible.length > 0) {
      detailOpen = true;
      detailScroll = 0;
    } else if (key.name === "enter" && spec.onSelect && visible.length > 0) {
      status = null;
      try {
        await spec.onSelect(current()!, context);
      } catch (error) {
        status = error instanceof Error ? error.message : String(error);
        suspended = false;
      }
      if (closed) {
        finish();
        return;
      }
    } else if (!RESERVED.has(key.name)) {
      const action = availableActions("list").find((entry) => entry.action.key === key.name)?.action;
      if (action) {
        status = null;
        await runAction(action);
        if (closed) {
          finish();
          return;
        }
      }
    }
    render();
  };

  if (!isInteractive()) {
    const width = terminalWidth();
    const plain = [
      ...spec.header(items),
      ...(items.length === 0
        ? [`  ${spec.emptyMessage}`]
        : items.flatMap((item) => spec.renderRow(item, false, width))),
    ];
    process.stdout.write(`${plain.map((entry) => truncate(entry, width)).join("\n")}\n`);
    return;
  }

  enterFullScreen();
  let input: InputSession | null = readKeys(onKey);
  const onResize = () => render();
  process.stdout.on("resize", onResize);

  let timer: NodeJS.Timeout | null = null;
  if (spec.refresh && spec.refreshIntervalMs) {
    timer = setInterval(() => {
      if (suspended || closed) return;
      if (spec.shouldKeepRefreshing && !spec.shouldKeepRefreshing(items)) return;
      void context.refresh().catch(() => undefined);
    }, spec.refreshIntervalMs);
    timer.unref();
  }

  render();
  try {
    await done;
  } finally {
    if (timer) clearInterval(timer);
    process.stdout.removeListener("resize", onResize);
    input?.close();
    input = null;
    exitFullScreen();
  }
}
