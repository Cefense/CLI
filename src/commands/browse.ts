import { openSession, type GlobalOptions, type Session } from "../core/session.js";
import { activeOrganization } from "../core/organizations.js";
import { blobUrl } from "../core/providers.js";
import { prune } from "../core/compact.js";
import { UsageError } from "../core/errors.js";
import type { Project } from "../core/types.js";
import { resolveLinkedProject } from "./link.js";
import { resolveFindingId } from "./reproduced.js";
import { CODE_HOSTS, openExternal } from "../ui/open.js";
import { isAgentMode } from "../ui/mode.js";
import * as out from "../ui/output.js";

export const WORKSPACE_FINDING_PREFIX = 8;

export function workspaceUrl(
  base: string,
  options: { org?: string | null; finding?: string | null } = {},
): string {
  const parts: string[] = [];
  if (options.org) parts.push(options.org);
  parts.push("feed");
  if (options.finding) parts.push("reproduced", options.finding.slice(0, WORKSPACE_FINDING_PREFIX));
  return `${base.replace(/\/+$/, "")}/app/${parts.map(encodeURIComponent).join("/")}`;
}

async function findingCodeUrl(session: Session, project: Project, findingId: string): Promise<string | null> {
  const response = await session.client.findings(project.githubRepoId, {});
  const finding = response.findings.find((entry) => entry.id === findingId);
  if (!finding) return null;
  return blobUrl(project, finding.filePath, project.defaultBranch ?? "HEAD", {
    start: finding.startLine,
    end: finding.endLine,
  });
}

export async function browseCommand(
  globals: GlobalOptions,
  target: string | undefined,
  options: { browser: boolean; code: boolean },
): Promise<number> {
  const needsProject = Boolean(target) || options.code;
  const session = await openSession(globals, { auth: needsProject });
  const base = session.config?.webUrl ?? session.apiUrl;
  const org = activeOrganization(session.apiUrl);

  let url: string | null = workspaceUrl(base, { org });
  let repository: string | null = null;
  let findingId: string | null = null;

  if (needsProject) {
    const { project } = await resolveLinkedProject(session, globals);
    repository = project.fullName;
    if (target) findingId = await resolveFindingId(session, project, target);
    if (options.code) {
      url = findingId ? await findingCodeUrl(session, project, findingId) : project.htmlUrl;
    } else {
      url = workspaceUrl(base, { org, finding: findingId });
    }
  }

  if (!url) {
    throw new UsageError(
      `There is no web page for ${findingId ? "that finding" : "this repository"} on its code host.`,
      "Drop --code to open it in the Cefense workspace instead.",
      "no_web_url",
    );
  }

  const payload = prune({ url, repository, finding: findingId });

  if (isAgentMode()) {
    out.agentEmit(
      payload,
      findingId && repository ? [`cf reproduced show ${findingId} --repo ${repository} --agent`] : [],
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json(payload);
    return 0;
  }

  if (!options.browser) {
    out.line(url);
    return 0;
  }

  if (await openExternal(url, options.code ? { hosts: CODE_HOSTS } : {})) {
    out.line(`Opening ${url} in your browser.`);
    return 0;
  }

  out.line(url);
  out.hint("A browser could not be opened, so here is the address to open yourself.");
  return 0;
}
