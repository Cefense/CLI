import open from "open";
import { openSession, type GlobalOptions, type Session } from "../core/session.js";
import { CefenseError, UsageError } from "../core/errors.js";
import {
  PROVIDERS,
  parseProvider,
  providerHost,
  providerLabel,
  type Provider,
} from "../core/providers.js";
import type { ProviderStatus } from "../core/types.js";
import * as out from "../ui/output.js";
import { confirm, confirmByTyping, spinner } from "../ui/prompts.js";
import { renderTable } from "../ui/table.js";
import { padEnd, terminalWidth } from "../ui/format.js";
import { c, glyph } from "../ui/theme.js";
import { isAgentMode } from "../ui/mode.js";
import { prune } from "../core/compact.js";

export interface Connection {
  provider: Provider;
  status: ProviderStatus;
  unreachable?: boolean;
}

/**
 * The page a code host is connected on.
 *
 * Authorization cannot run from the CLI: the backend binds the round trip to a
 * cookie it sets on the browser that started it, so the CLI opens the workspace
 * and waits for the connection to appear rather than driving OAuth itself.
 */
function connectUrl(session: Session): string {
  const webUrl = session.config?.webUrl ?? session.apiUrl;
  return `${webUrl.replace(/\/+$/, "")}/app/repositories`;
}

export async function loadConnections(session: Session): Promise<Connection[]> {
  const statuses = await Promise.all(
    PROVIDERS.map(async (provider): Promise<Connection> => {
      try {
        return { provider, status: await session.client.providerStatus(provider) };
      } catch {
        return {
          provider,
          status: { configured: false, connected: false, login: null } as ProviderStatus,
          unreachable: true,
        };
      }
    }),
  );
  return statuses;
}

export type ConnectionState =
  | "unavailable"
  | "reconnect"
  | "connected"
  | "unconfigured"
  | "not_connected";

export function connectionState(entry: Connection): ConnectionState {
  if (entry.unreachable) return "unavailable";
  if (entry.status.connected && entry.status.needsReconnect) return "reconnect";
  if (entry.status.connected) return "connected";
  if (!entry.status.configured) return "unconfigured";
  return "not_connected";
}

function statusCell(entry: Connection): string {
  switch (connectionState(entry)) {
    case "unavailable":
      return c.yellow(`${glyph.warn} status unavailable`);
    case "reconnect":
      return c.yellow(`${glyph.warn} reconnect needed`);
    case "connected":
      return c.green(`${glyph.check} connected`);
    case "unconfigured":
      return c.dim(`${glyph.track} not available here`);
    case "not_connected":
      return c.yellow(`${glyph.ring} not connected`);
  }
}

function compactConnection(entry: Connection): Record<string, unknown> {
  return prune({
    provider: entry.provider,
    configured: entry.status.configured,
    connected: entry.status.connected,
    needsReconnect: entry.status.needsReconnect || undefined,
    login: entry.status.login ?? null,
    host: entry.status.host ?? providerHost(entry.provider),
    statusUnavailable: entry.unreachable || undefined,
  });
}

export async function providerList(globals: GlobalOptions): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const connections = await loadConnections(session);

  if (isAgentMode()) {
    const connected = connections.find((entry) => entry.status.connected);
    out.agentEmit(
      { providers: connections.map(compactConnection) },
      connected ? ["cf repo list --agent"] : [],
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ providers: connections.map(compactConnection) });
    return 0;
  }

  out.line();
  out.lines(
    renderTable(
      connections,
      [
        { header: "host", value: (entry) => providerLabel(entry.provider), min: 10 },
        { header: "state", value: (entry) => statusCell(entry), min: 16 },
        { header: "account", value: (entry) => entry.status.login ?? "-", min: 10 },
        {
          header: "server",
          value: (entry) => entry.status.host ?? providerHost(entry.provider),
          min: 12,
        },
      ],
      { width: terminalWidth() - 4 },
    ).map((row) => `  ${row}`),
  );
  out.line();
  const missing = connections.filter((entry) =>
    ["not_connected", "reconnect"].includes(connectionState(entry)),
  );
  if (missing.length > 0) {
    out.hint(`cf provider connect ${missing[0]!.provider}`);
    out.line();
  }
  return 0;
}

/**
 * Makes sure one host is connected, opening the workspace and waiting if not.
 *
 * Shared with `cf repo connect`, which cannot list a host's repositories until
 * the account behind them exists.
 */
export async function ensureProviderConnected(
  session: Session,
  provider: Provider,
  options: { assumeYes?: boolean; wait?: boolean } = {},
): Promise<ProviderStatus> {
  const label = providerLabel(provider);
  const status = await session.client.providerStatus(provider);
  const expired = status.connected && Boolean(status.needsReconnect);
  if (status.connected && !expired) return status;

  if (!status.configured && !status.connected) {
    throw new CefenseError(`${label} is not configured on this Cefense instance.`, {
      remedy: "Run cf status for the full picture.",
      code: "provider_unavailable",
    });
  }

  const target = connectUrl(session);

  if (isAgentMode() || out.isJsonMode()) {
    throw new CefenseError(
      expired
        ? `The ${label} connection has expired.`
        : `No ${label} account is connected to Cefense.`,
      {
        remedy: expired ? `Reconnect it at ${target}.` : `Connect one at ${target}.`,
        code: expired ? "provider_reconnect_required" : "provider_not_connected",
      },
    );
  }

  out.line();
  if (expired) {
    out.warn(`Your ${label} connection has expired and needs to be reconnected.`);
  } else {
    out.warn(`Your ${label} account is not connected to Cefense.`);
  }
  out.line();
  out.line(`    ${c.cyan(target)}`);
  out.line();

  if (!options.assumeYes) {
    const proceed = await confirm({
      message: "Open that page in your browser now?",
      initialValue: true,
      assumeYes: options.assumeYes,
    });
    if (!proceed) {
      throw new UsageError(`${label} must be connected first.`);
    }
  }

  void open(target).catch(() => undefined);

  if (options.wait === false) return status;

  const progress = spinner();
  progress.start(`Waiting for the ${label} connection`);
  const deadline = Date.now() + 5 * 60_000;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const next = await session.client.providerStatus(provider).catch(() => null);
    if (next?.connected && !next.needsReconnect) {
      progress.stop(`${label} connected as ${next.login}`);
      return next;
    }
    if (Date.now() > deadline) {
      progress.stop(`Gave up waiting for the ${label} connection.`, "fail");
      throw new CefenseError(`${label} was not connected in time.`, {
        remedy: `Finish the connection at ${target}, then try again.`,
        code: "provider_not_connected",
      });
    }
  }
}

export async function providerConnect(
  globals: GlobalOptions,
  name: string | undefined,
): Promise<number> {
  if (!name) {
    throw new UsageError("Name the host to connect.", `Use ${PROVIDERS.join(", ")}.`);
  }
  const provider = parseProvider(name);
  const session = await openSession(globals, { auth: true });
  const status = await ensureProviderConnected(session, provider, { assumeYes: globals.yes });

  if (isAgentMode()) {
    out.agentEmit({ provider, connected: true, login: status.login ?? null }, [
      `cf repo connect --provider ${provider}`,
    ]);
    return 0;
  }
  if (out.isJsonMode()) {
    out.json({ provider, connected: status.connected, login: status.login ?? null });
    return 0;
  }

  out.line();
  out.success(`${providerLabel(provider)} is connected${status.login ? ` as ${c.bold(status.login)}` : ""}`);
  out.hint(`cf repo connect --provider ${provider}`);
  out.line();
  return 0;
}

export async function providerDisconnect(
  globals: GlobalOptions,
  name: string | undefined,
): Promise<number> {
  if (!name) {
    throw new UsageError("Name the host to disconnect.", `Use ${PROVIDERS.join(", ")}.`);
  }
  const provider = parseProvider(name);
  const label = providerLabel(provider);
  const session = await openSession(globals, { auth: true });
  const status = await session.client.providerStatus(provider);

  if (!status.connected) {
    if (isAgentMode()) {
      out.agentEmit({ provider, connected: false });
      return 0;
    }
    out.line();
    out.info(`No ${label} account is connected.`);
    out.line();
    return 0;
  }

  out.line();
  out.warn(`This disconnects the ${label} account ${c.bold(status.login ?? "")} from Cefense entirely.`);
  out.hint("Repositories connected through it stop scanning until you reconnect.");
  out.hint("Their findings and history are kept.");
  out.line();

  const ok = await confirmByTyping({
    message: `Type ${status.login} to confirm`,
    expected: status.login ?? "",
    assumeYes: globals.yes,
  });
  if (!ok) {
    out.info("Left connected.");
    out.line();
    return 0;
  }

  await session.client.disconnectProviderAccount(provider);

  if (isAgentMode()) {
    out.agentEmit({ provider, disconnected: status.login ?? true });
    return 0;
  }

  out.success(`${label} account disconnected`);
  out.line();
  return 0;
}

/** One line per host, for the status header. */
export function connectionSummary(connections: Connection[]): string[] {
  const cell = (entry: Connection): string => {
    switch (connectionState(entry)) {
      case "unavailable":
        return c.yellow("status unavailable");
      case "reconnect":
        return c.yellow(`reconnect needed${entry.status.login ? ` (${entry.status.login})` : ""}`);
      case "connected":
        return `connected as ${entry.status.login}`;
      default:
        return c.yellow("not connected");
    }
  };
  return connections
    .filter((entry) => connectionState(entry) !== "unconfigured")
    .map((entry) => `  ${c.dim(padEnd(providerLabel(entry.provider), 10))}${cell(entry)}`);
}
