import { openSession, type GlobalOptions } from "../core/session.js";
import { resolveApiUrl, writeActiveOrganization } from "../core/config.js";
import { UsageError } from "../core/errors.js";
import { resolveOrganization } from "../core/organizations.js";
import { compactOrganization, prune } from "../core/compact.js";
import * as out from "../ui/output.js";
import { keyValue, renderTable } from "../ui/table.js";
import { terminalWidth } from "../ui/format.js";
import { c, glyph } from "../ui/theme.js";
import { isAgentMode } from "../ui/mode.js";

function sourceLabel(source: "flag" | "CEFENSE_ORG" | "stored"): string {
  if (source === "flag") return "--org";
  if (source === "CEFENSE_ORG") return "CEFENSE_ORG";
  return "stored selection";
}

export async function orgList(globals: GlobalOptions): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { organizations } = await session.client.organizations();
  const active = resolveOrganization(session.apiUrl)?.slug ?? null;

  if (isAgentMode()) {
    out.agentEmit(
      prune({
        organizations: organizations.map((entry) => compactOrganization(entry, active)),
        active,
      }),
      active
        ? ["cf repo list --agent"]
        : organizations.map((entry) => `cf org use ${entry.slug} --agent`),
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ organizations, active });
    return 0;
  }

  if (organizations.length === 0) {
    out.line();
    out.info("This account does not belong to any organization.");
    out.line();
    return 0;
  }

  out.line();
  out.lines(
    renderTable(
      organizations,
      [
        {
          header: "",
          value: (entry) => (entry.slug === active ? c.cyan(glyph.arrow) : " "),
          min: 1,
          max: 1,
        },
        { header: "slug", value: (entry) => entry.slug, min: 10 },
        { header: "name", value: (entry) => entry.name, min: 12 },
        { header: "role", value: (entry) => entry.role, min: 6 },
      ],
      { width: terminalWidth() - 4 },
    ).map((row) => `  ${row}`),
  );
  out.line();
  if (!active) {
    out.hint(`cf org use ${organizations[0]!.slug}`);
    out.line();
  }
  return 0;
}

/**
 * Records which organization everything else acts on.
 *
 * The slug is checked against the account's own listing before it is written,
 * so a typo fails here rather than turning the next unrelated command into an
 * organization_not_found that reads like the repository is missing.
 */
export async function orgUse(globals: GlobalOptions, slug: string | undefined): Promise<number> {
  const wanted = slug?.trim();
  if (!wanted) {
    throw new UsageError("Name the organization to use.", "Run cf org list for the slugs.");
  }

  const session = await openSession(globals, { auth: true });
  const { organizations } = await session.client.organizations();
  const match = organizations.find((entry) => entry.slug === wanted);

  if (!match) {
    throw new UsageError(
      `${wanted} is not an organization this account belongs to.`,
      organizations.length > 0
        ? `Run cf org list. The slugs are ${organizations.map((entry) => entry.slug).join(", ")}.`
        : "This account does not belong to any organization yet.",
      "unknown_organization",
    );
  }

  writeActiveOrganization(session.apiUrl, match.slug);

  if (isAgentMode()) {
    out.agentEmit(compactOrganization(match, match.slug), ["cf repo list --agent"]);
    return 0;
  }
  if (out.isJsonMode()) {
    out.json({ organization: match, apiUrl: session.apiUrl });
    return 0;
  }

  out.line();
  out.success(`Now acting as ${c.bold(match.name)}`);
  out.hint(`Stored for ${session.apiUrl}`);
  out.line();
  return 0;
}

/** What the active selection is, without asking the API, so it works offline. */
export async function orgShow(): Promise<number> {
  const apiUrl = resolveApiUrl();
  const active = resolveOrganization(apiUrl);

  if (isAgentMode()) {
    out.agentEmit(
      prune({
        apiUrl,
        selected: Boolean(active),
        organization: active?.slug ?? null,
        source: active?.source ?? null,
      }),
      active ? ["cf repo list --agent"] : ["cf org list --agent"],
    );
    return 0;
  }
  if (out.isJsonMode()) {
    out.json({ apiUrl, organization: active?.slug ?? null, source: active?.source ?? null });
    return 0;
  }

  out.line();
  if (!active) {
    out.info(`No organization is selected for ${c.bold(apiUrl)}.`);
    out.hint("Cefense uses the only one your account belongs to, if there is exactly one.");
    out.hint("cf org list");
    out.line();
    return 0;
  }

  out.lines(
    keyValue([
      ["organization", c.bold(active.slug)],
      ["from", sourceLabel(active.source)],
      ["instance", apiUrl],
    ]).map((row) => `  ${row}`),
  );
  out.line();
  return 0;
}
