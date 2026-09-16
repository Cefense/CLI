import { openSession, type GlobalOptions } from "../core/session.js";
import { UsageError } from "../core/errors.js";
import { prune } from "../core/compact.js";
import { SEVERITY_ALIASES } from "./reproduced.js";
import type {
  NotificationCadence,
  NotificationKind,
  NotificationRepositoryRow,
  NotificationSeverity,
  NotificationsResponse,
} from "../core/types.js";
import * as out from "../ui/output.js";
import { keyValue } from "../ui/table.js";
import { nextSteps } from "../ui/list.js";
import { padEnd } from "../ui/format.js";
import { c, glyph } from "../ui/theme.js";
import { isAgentMode } from "../ui/mode.js";

/**
 * The notification vocabulary, hand-copied from
 * packages/schemas/src/notifications.ts.
 *
 * The CLI is published standalone and cannot import @cefense/schemas, so these
 * are copies and copies drift. tests/contract.test.ts reads the real lists off
 * disk and fails when they diverge, which is the only thing keeping them true.
 */
export const NOTIFICATION_KINDS: readonly NotificationKind[] = [
  "connection",
  "scan_report",
  "scan_failed",
  "advisory",
  "fix_pr_opened",
];

export const NOTIFICATION_CADENCES: readonly NotificationCadence[] = ["every", "daily"];

export const NOTIFICATION_SEVERITIES: readonly NotificationSeverity[] = [
  "critical",
  "high",
  "medium",
  "low",
];

export function parseKind(value: string): NotificationKind {
  const wanted = value.trim().toLowerCase().replace(/-/g, "_");
  const match = NOTIFICATION_KINDS.find((kind) => kind === wanted);
  if (!match) {
    throw new UsageError(
      `${value} is not a notification.`,
      `Use one of ${NOTIFICATION_KINDS.join(", ")}. Run cf notifications to see what each one sends.`,
      "unknown_notification_kind",
    );
  }
  return match;
}

/**
 * Accepts the same spellings `cf reproduced --severity` does.
 *
 * The CLI shows people `watch` and `info` where the wire says `medium` and
 * `low`, and a second parser here that rejected `watch` would mean one flag
 * spelled severity one way and another flag the other way, in the same tool.
 */
export function parseSeverity(value: string): NotificationSeverity {
  const mapped = SEVERITY_ALIASES[value.trim().toLowerCase()];
  const match = NOTIFICATION_SEVERITIES.find((severity) => severity === mapped);
  if (!match) {
    throw new UsageError(
      `${value} is not a severity.`,
      "Use critical, high, watch (medium), or info (low). It is a floor, so high means high and critical.",
      "invalid_severity",
    );
  }
  return match;
}

function parseCadence(value: string): NotificationCadence {
  const wanted = value.trim().toLowerCase();
  const match = NOTIFICATION_CADENCES.find((cadence) => cadence === wanted);
  if (!match) {
    throw new UsageError(
      `${value} is not a cadence.`,
      "Use every for one email per event, or daily for at most one a day.",
      "invalid_cadence",
    );
  }
  return match;
}

/** How many of a repository's last findings were below a floor. */
function noisyNote(repository: NotificationRepositoryRow): string | null {
  const counts = repository.lastScanCounts;
  if (!counts) return null;
  const total = counts.critical + counts.high + counts.medium + counts.low;
  if (total === 0) return null;
  if (counts.low / total < 0.6) return `${total} findings on the last scan`;
  return `${counts.low} of ${total} findings were low on the last scan`;
}

function overrideLabel(repository: NotificationRepositoryRow): string {
  const override = repository.override;
  if (!override) return c.dim("default");
  if (override.muted) return c.yellow("nothing");
  return override.minSeverity ? `${override.minSeverity} and above` : c.dim("default");
}

function settingLabel(kind: NotificationsResponse["kinds"][number]): string {
  if (kind.mandatory) return c.dim("always");
  if (!kind.enabled) return c.dim("off");
  const parts: string[] = [];
  if (kind.supportsSeverity && kind.minSeverity) parts.push(`${kind.minSeverity} and above`);
  if (kind.supportsCadence && kind.cadence === "daily") parts.push("at most once a day");
  return parts.length > 0 ? `on, ${parts.join(", ")}` : "on";
}

function print(response: NotificationsResponse): void {
  out.line();
  out.line(`  ${c.bold("Notifications")}   ${c.dim(response.email)}`);
  out.line();

  if (!response.configured) {
    out.warn("Email is not configured on this deployment, so nothing is being delivered yet.");
    out.line();
  }

  const width = Math.max(...response.kinds.map((kind) => kind.kind.length));
  for (const kind of response.kinds) {
    const sent = response.sentLast30Days[kind.kind] ?? 0;
    const marker = kind.mandatory
      ? c.dim(glyph.dot)
      : kind.enabled
        ? c.green(glyph.dot)
        : c.dim(glyph.dot);
    out.line(
      `  ${marker} ${padEnd(kind.kind, width)}   ${settingLabel(kind)}${
        sent > 0 ? c.dim(`   ${sent} sent in 30 days`) : ""
      }`,
    );
    out.line(`    ${c.dim(kind.description)}`);
  }

  const exceptions = response.repositories.filter((repository) => repository.override);
  out.line();
  out.line(`  ${c.bold("Repositories")}   ${c.dim(`${response.repositories.length} connected`)}`);
  if (exceptions.length === 0) {
    out.line(`  ${c.dim("all on the settings above")}`);
  } else {
    const repoWidth = Math.max(...exceptions.map((repository) => repository.fullName.length));
    for (const repository of exceptions) {
      const note = noisyNote(repository);
      out.line(
        `  ${padEnd(repository.fullName, repoWidth)}   ${overrideLabel(repository)}${
          note ? c.dim(`   ${note}`) : ""
        }`,
      );
    }
  }

  nextSteps([
    { command: "cf notifications set scan_report --severity critical", purpose: "raise the floor" },
    { command: "cf notifications mute <repo>", purpose: "silence one repository" },
  ]);
  out.line();
}

function payload(response: NotificationsResponse) {
  return prune({
    configured: response.configured,
    email: response.email,
    kinds: response.kinds.map((kind) =>
      prune({
        kind: kind.kind,
        enabled: kind.mandatory ? true : kind.enabled,
        mandatory: kind.mandatory || undefined,
        minSeverity: kind.supportsSeverity ? kind.minSeverity : undefined,
        cadence: kind.supportsCadence ? kind.cadence : undefined,
        sentLast30Days: response.sentLast30Days[kind.kind] || undefined,
      }),
    ),
    exceptions: response.repositories
      .filter((repository) => repository.override)
      .map((repository) =>
        prune({
          repository: repository.fullName,
          muted: repository.override?.muted || undefined,
          minSeverity: repository.override?.minSeverity ?? undefined,
        }),
      ),
  });
}

export async function notificationsShow(globals: GlobalOptions): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const response = await session.client.notifications();

  if (isAgentMode()) {
    out.agentEmit(payload(response), ["cf notifications set <kind> --off --agent"]);
    return 0;
  }
  if (out.isJsonMode()) {
    out.json(response);
    return 0;
  }
  print(response);
  return 0;
}

export async function notificationsSet(
  globals: GlobalOptions,
  kindName: string | undefined,
  options: { on?: boolean; off?: boolean; severity?: string; cadence?: string } = {},
): Promise<number> {
  if (!kindName) {
    throw new UsageError(
      "Name the notification to change.",
      `Use one of ${NOTIFICATION_KINDS.join(", ")}. Run cf notifications to see them all.`,
      "unknown_notification_kind",
    );
  }
  const kind = parseKind(kindName);

  if (options.on && options.off) {
    throw new UsageError(
      "--on and --off cannot both be given.",
      "Pick one. Without either, the switch is left as it is and only the flags you pass change.",
      "usage_error",
    );
  }

  const patch: { enabled?: boolean; minSeverity?: string | null; cadence?: string } = {};
  if (options.on) patch.enabled = true;
  if (options.off) patch.enabled = false;
  if (options.severity !== undefined) patch.minSeverity = parseSeverity(options.severity);
  if (options.cadence !== undefined) patch.cadence = parseCadence(options.cadence);

  if (Object.keys(patch).length === 0) {
    throw new UsageError(
      "Nothing to change.",
      "Pass --on, --off, --severity <level>, or --cadence <every|daily>.",
      "usage_error",
    );
  }

  const session = await openSession(globals, { auth: true });
  await session.client.setNotificationKind(kind, patch);
  const response = await session.client.notifications();
  const updated = response.kinds.find((entry) => entry.kind === kind);

  if (isAgentMode()) {
    out.agentEmit(
      prune({
        kind,
        enabled: updated?.enabled,
        minSeverity: updated?.supportsSeverity ? updated.minSeverity : undefined,
        cadence: updated?.supportsCadence ? updated.cadence : undefined,
      }),
      ["cf notifications --agent"],
    );
    return 0;
  }

  out.success(`${kind} is now ${updated ? settingLabel(updated) : "updated"}.`);
  return 0;
}

/** Finds the repository a name or id refers to, within this organization. */
function resolveRepository(
  response: NotificationsResponse,
  name: string,
): NotificationRepositoryRow {
  const wanted = name.trim().toLowerCase();
  const exact = response.repositories.find(
    (repository) => repository.fullName.toLowerCase() === wanted || repository.id === name,
  );
  if (exact) return exact;

  const partial = response.repositories.filter((repository) =>
    repository.fullName.toLowerCase().includes(wanted),
  );
  if (partial.length === 1) return partial[0]!;
  if (partial.length > 1) {
    throw new UsageError(
      `${name} matches ${partial.length} repositories.`,
      `Name one exactly: ${partial.map((repository) => repository.fullName).join(", ")}.`,
      "ambiguous_repository",
    );
  }
  throw new UsageError(
    `${name} is not a connected repository.`,
    "Run cf repo list to see what this organization has connected.",
    "repository_not_found",
  );
}

export async function notificationsRepository(
  globals: GlobalOptions,
  name: string | undefined,
  options: { severity?: string; mute?: boolean; reset?: boolean } = {},
): Promise<number> {
  if (!name) {
    throw new UsageError(
      "Name the repository.",
      "For example cf notifications mute acme/payments-api.",
      "repository_not_found",
    );
  }

  const session = await openSession(globals, { auth: true });
  const response = await session.client.notifications();
  const repository = resolveRepository(response, name);

  if (options.reset) {
    await session.client.clearNotificationRepository(repository.id);
    if (isAgentMode()) {
      out.agentEmit({ repository: repository.fullName, override: null }, ["cf notifications --agent"]);
      return 0;
    }
    out.success(`${repository.fullName} is back on the default settings.`);
    return 0;
  }

  const muted = options.mute === true;
  const minSeverity = options.severity !== undefined ? parseSeverity(options.severity) : null;
  if (!muted && minSeverity === null) {
    throw new UsageError(
      "Nothing to set.",
      "Pass --mute to silence this repository, --severity <level> to raise its floor, or --reset to go back to the default.",
      "usage_error",
    );
  }

  await session.client.setNotificationRepository(repository.id, { muted, minSeverity });

  if (isAgentMode()) {
    out.agentEmit(
      prune({ repository: repository.fullName, muted: muted || undefined, minSeverity: minSeverity ?? undefined }),
      ["cf notifications --agent"],
    );
    return 0;
  }
  out.success(
    muted
      ? `${repository.fullName} will not send anything.`
      : `${repository.fullName} will only send ${minSeverity} and above.`,
  );
  const note = noisyNote(repository);
  if (note) out.hint(note);
  return 0;
}

/** Exported for the settings panel and for tests. */
export { settingLabel, noisyNote };

/** Every key/value the show command renders, for reuse elsewhere. */
export function notificationRows(response: NotificationsResponse): string[] {
  return keyValue(
    response.kinds.map((kind) => [kind.kind, settingLabel(kind)] as [string, string]),
  );
}
