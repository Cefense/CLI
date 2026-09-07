import { execFileSync } from "node:child_process";
import { readRepoDefault } from "./config.js";
import { UsageError } from "./errors.js";
import type { CefenseClient } from "./client.js";
import type { Project } from "./types.js";
import { providerHost, PROVIDERS, type Provider } from "./providers.js";

export interface RepoLocation {
  owner: string;
  name: string;
  fullName: string;
  provider?: Provider;
}

function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    }).trim();
  } catch {
    return null;
  }
}

export function gitToplevel(cwd = process.cwd()): string | null {
  return git(["rev-parse", "--show-toplevel"], cwd);
}

function escapeHost(host: string): string {
  return host.replace(/\./g, "\\.");
}

/**
 * Reads owner and name out of any remote form git writes, for one host.
 *
 * GitLab subgroups nest (`group/subgroup/project`), so everything between the
 * host and the last segment is the owner rather than only the first segment.
 */
function parseRemoteFor(provider: Provider, url: string): RepoLocation | null {
  const host = escapeHost(providerHost(provider));
  const cleaned = url.trim().replace(/\.git$/i, "");
  const patterns = [
    new RegExp(`^git@${host}:(.+)$`, "i"),
    new RegExp(`^ssh://git@${host}/(.+)$`, "i"),
    new RegExp(`^https?://(?:[^@]+@)?${host}/(.+)$`, "i"),
    new RegExp(`^${host}/(.+)$`, "i"),
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    const path = match?.[1];
    if (!path) continue;
    const segments = path.split("/").filter(Boolean);
    if (segments.length < 2) continue;
    const name = segments[segments.length - 1]!;
    const owner = segments.slice(0, -1).join("/");
    return { owner, name, fullName: `${owner}/${name}`, provider };
  }
  return null;
}

/** GitHub remotes only. Kept narrow because callers use it to mean "on GitHub". */
export function parseGithubRemote(url: string): RepoLocation | null {
  const location = parseRemoteFor("github", url);
  if (!location) return null;
  // A GitHub path is always owner/name, so a deeper one is not a repository.
  return location.owner.includes("/") ? null : location;
}

/** A remote on any host Cefense connects to. */
export function parseGitRemote(url: string): RepoLocation | null {
  for (const provider of PROVIDERS) {
    const location = parseRemoteFor(provider, url);
    if (!location) continue;
    if (provider === "github" && location.owner.includes("/")) continue;
    return location;
  }
  return null;
}

export function gitRemote(cwd = process.cwd()): RepoLocation | null {
  const url =
    git(["remote", "get-url", "origin"], cwd) ??
    git(["remote", "get-url", "upstream"], cwd) ??
    null;
  return url ? parseGitRemote(url) : null;
}

export function defaultScope(cwd = process.cwd()): string {
  return gitToplevel(cwd) ?? cwd;
}

export function parseRepoArgument(value: string): RepoLocation | null {
  const fromUrl = parseGitRemote(value);
  if (fromUrl) return fromUrl;
  const parts = value.trim().replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { owner: parts[0], name: parts[1], fullName: `${parts[0]}/${parts[1]}` };
  }
  return null;
}

export function matchProject(projects: Project[], value: string): Project | null {
  const location = parseRepoArgument(value);
  const wanted = (location?.fullName ?? value).toLowerCase();
  return (
    projects.find((project) => project.fullName.toLowerCase() === wanted) ??
    projects.find((project) => project.githubRepoId === value) ??
    projects.find((project) => project.name.toLowerCase() === wanted) ??
    null
  );
}

export interface ResolveOptions {
  repo?: string;
  cwd?: string;
  pick?: (projects: Project[]) => Promise<Project | null>;
}

export interface Resolution {
  project: Project;
  source: "flag" | "environment" | "default" | "git" | "only" | "prompt";
}

export async function resolveProject(
  client: CefenseClient,
  projects: Project[],
  options: ResolveOptions = {},
): Promise<Resolution> {
  void client;
  const cwd = options.cwd ?? process.cwd();

  if (projects.length === 0) {
    throw new UsageError("No repositories are connected yet.", "Run cf repo connect.");
  }

  const explicit = options.repo ?? process.env.CEFENSE_REPO;
  if (explicit) {
    const match = matchProject(projects, explicit);
    if (!match) {
      throw new UsageError(`${explicit} is not connected to Cefense.`, `Run cf repo connect ${explicit}.`);
    }
    return { project: match, source: options.repo ? "flag" : "environment" };
  }

  const scope = defaultScope(cwd);
  const stored = readRepoDefault(scope);
  if (stored) {
    const match = matchProject(projects, stored.fullName) ?? matchProject(projects, stored.githubRepoId);
    if (match) return { project: match, source: "default" };
  }

  const remote = gitRemote(cwd);
  if (remote) {
    const match = matchProject(projects, remote.fullName);
    if (match) return { project: match, source: "git" };
  }

  if (projects.length === 1) return { project: projects[0]!, source: "only" };

  if (options.pick) {
    const picked = await options.pick(projects);
    if (picked) return { project: picked, source: "prompt" };
  }

  throw new UsageError(
    "More than one repository is connected and none is selected here.",
    "Pass --repo owner/name, or set one with cf repo set-default.",
  );
}
