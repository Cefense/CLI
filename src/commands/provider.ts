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
    PROVIDERS.map(async (provider) => ({
      provider,
      status: await session.client
        .providerStatus(provider)
        .catch(() => ({ configured: false, connected: false, login: null }) as ProviderStatus),
    })),
  );
  return statuses;
}

function statusCell(status: ProviderStatus): string {
  if (status.connected) return c.green(`${glyph.check} connected`);
  if (!status.configured) return c.dim(`${glyph.track} not available here`);
  return c.yellow(`${glyph.ring} not connected`);
}

function compactConnection(entry: Connection): Record<string, unknown> {
  return prune({
    provider: entry.provider,
    configured: entry.status.configured,
    connected: entry.status.connected,
    login: entry.status.login ?? null,
    host: entry.status.host ?? providerHost(entry.provider),
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
        { header: "state", value: (entry) => statusCell(entry.status), min: 16 },
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
  const missing = connections.filter((entry) => entry.status.configured && !entry.status.connected);
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
  if (status.connected) return status;

  if (!status.configured) {
    throw new CefenseError(`${label} is not configured on this Cefense instance.`, {
      remedy: "Run cf status for the full picture.",
      code: "provider_unavailable",
    });
  }

  const target = connectUrl(session);

  if (isAgentMode() || out.isJsonMode()) {
    throw new CefenseError(`No ${label} account is connected to Cefense.`, {
      remedy: `Connect one at ${target}.`,
      code: "provider_not_connected",
    });
  }

  out.line();
  out.warn(`Your ${label} account is not connected to Cefense.`);
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
    if (next?.connected) {
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
  return connections
    .filter((entry) => entry.status.configured || entry.status.connected)
    .map(
      (entry) =>
        `  ${c.dim(padEnd(providerLabel(entry.provider), 10))}${
          entry.status.connected
            ? `connected as ${entry.status.login}`
            : c.yellow("not connected")
        }`,
    );
}
