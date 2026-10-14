import { openSession, type GlobalOptions } from "../core/session.js";
import { UsageError } from "../core/errors.js";
import { prune } from "../core/compact.js";
import { matchProject } from "../core/repo.js";
import { activeOrganization } from "../core/organizations.js";
import type { GuardDecoy, GuardDecoyKind, GuardEvent, GuardResponse, Project } from "../core/types.js";
import * as out from "../ui/output.js";
import { renderTable } from "../ui/table.js";
import { countOf, relativeTime, shortId, terminalWidth } from "../ui/format.js";
import { c } from "../ui/theme.js";
import { isAgentMode } from "../ui/mode.js";

export const GUARD_DECOY_KINDS: readonly GuardDecoyKind[] = [
  "user-credential",
  "config-key",
  "file",
  "route",
  "session-token",
];

const DECOY_LABELS: Record<GuardDecoyKind, string> = {
  "user-credential": "decoy login",
  "config-key": "decoy config key",
  file: "decoy file",
  route: "decoy route",
  "session-token": "decoy session token",
};

export function decoyLabel(kind: GuardDecoyKind | string): string {
  return DECOY_LABELS[kind as GuardDecoyKind] ?? kind;
}

export function compactDecoy(decoy: GuardDecoy): Record<string, unknown> {
  return prune({
    id: decoy.id,
    kind: decoy.kind,
    location: decoy.location,
    d3fend: decoy.d3fendId,
    technique: decoy.d3fendName ?? null,
    findingId: decoy.findingId,
    plantedAt: decoy.createdAt,
    retired: decoy.retiredAt ? true : null,
    retiredAt: decoy.retiredAt,
    trips: decoy.trips,
    lastTrippedAt: decoy.lastTrippedAt,
  });
}

export function compactTrip(event: GuardEvent): Record<string, unknown> {
  return prune({
    id: event.id,
    kind: event.kind,
    at: event.occurredAt,
    from: event.sourceIp,
    decoyId: event.decoyId,
    findingId: event.findingId,
  });
}

async function scopedProject(globals: GlobalOptions, projects: () => Promise<Project[]>): Promise<Project | null> {
  const explicit = globals.repo ?? process.env.CEFENSE_REPO?.trim();
  if (!explicit) return null;
  const match = matchProject(await projects(), explicit);
  if (!match) {
    throw new UsageError(
      `${explicit} is not a connected repository.`,
      "Run cf repo list to see what this organization has connected.",
      "repository_not_found",
    );
  }
  return match;
}

function render(response: GuardResponse, scope: string): string[] {
  const width = terminalWidth() - 2;
  const tripped = response.decoys.filter((decoy) => decoy.trips > 0).length;
  const lines = ["", `${c.bold("Guard")} ${c.yellow("beta")} ${c.dim(scope)}`];

  if (response.decoys.length === 0) {
    lines.push(`  ${c.dim("No decoys are planted here yet.")}`);
  } else {
    lines.push(
      `  ${c.dim(`${countOf(response.decoys.length, "decoy")} planted, ${tripped} tripped`)}`,
      "",
      ...renderTable(
        response.decoys,
        [
          { header: "decoy", value: (decoy) => decoyLabel(decoy.kind), min: 10 },
          { header: "location", value: (decoy) => decoy.location, min: 12, flex: true, overflow: "path" },
          { header: "d3fend", value: (decoy) => decoy.d3fendId, overflow: "never" },
          { header: "trips", value: (decoy) => (decoy.trips > 0 ? c.red(String(decoy.trips)) : c.dim("0")), overflow: "never" },
          {
            header: "last trip",
            value: (decoy) => (decoy.lastTrippedAt ? relativeTime(decoy.lastTrippedAt) : c.dim("never")),
            overflow: "never",
          },
          { header: "", value: (decoy) => (decoy.retiredAt ? c.dim("retired") : ""), overflow: "never" },
        ],
        { width },
      ).map((row) => `  ${row}`),
    );
  }

  const byId = new Map(response.decoys.map((decoy) => [decoy.id, decoy]));
  lines.push("", `${c.bold("Trips")} ${c.dim(response.events.length > 0 ? `${response.events.length} recent` : "none")}`);
  if (response.events.length === 0) {
    lines.push(`  ${c.dim("Nobody has touched a decoy.")}`);
  } else {
    lines.push(
      ...renderTable(
        response.events,
        [
          { header: "when", value: (event) => relativeTime(event.occurredAt), overflow: "never" },
          { header: "from", value: (event) => event.sourceIp ?? c.dim("unknown"), overflow: "never" },
          {
            header: "decoy",
            value: (event) => {
              const decoy = event.decoyId ? byId.get(event.decoyId) : undefined;
              return decoy ? `${decoyLabel(decoy.kind)} ${c.dim(decoy.location)}` : c.dim("removed");
            },
            min: 12,
            flex: true,
          },
          { header: "finding", value: (event) => (event.findingId ? c.dim(shortId(event.findingId)) : ""), overflow: "never" },
        ],
        { width },
      ).map((row) => `  ${row}`),
    );
  }
  lines.push("", `  ${c.dim("Guard is in beta. This view is read-only.")}`, "");
  return lines;
}

export async function guardCommand(globals: GlobalOptions): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const project = await scopedProject(globals, async () => (await session.client.projects()).projects);
  const response = await session.client.guard(project?.githubRepoId);
  const organization = activeOrganization(session.apiUrl);

  if (isAgentMode()) {
    const latest = response.events.find((event) => event.findingId);
    out.agentEmit(
      prune({
        beta: true,
        repository: project?.fullName ?? null,
        organization,
        decoys: response.decoys.map(compactDecoy),
        trips: response.events.map(compactTrip),
      }),
      project && latest?.findingId ? [`cf reproduced show ${latest.findingId} --repo ${project.fullName} --agent`] : [],
    );
    return 0;
  }
  if (out.isJsonMode()) {
    out.json(response);
    return 0;
  }
  out.lines(render(response, project?.fullName ?? organization ?? "this organization"));
  return 0;
}
