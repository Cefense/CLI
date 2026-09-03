import { execFileSync } from "node:child_process";
import { readRepoDefault } from "./config.js";
import { UsageError } from "./errors.js";
import type { CefenseClient } from "./client.js";
import type { Project } from "./types.js";

export interface RepoLocation {
  owner: string;
  name: string;
  fullName: string;
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

export function parseGithubRemote(url: string): RepoLocation | null {
  const cleaned = url.trim().replace(/\.git$/i, "");
  const patterns = [
    /^git@github\.com:([^/]+)\/(.+)$/i,
    /^ssh:\/\/git@github\.com\/([^/]+)\/(.+)$/i,
    /^https?:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/([^/]+)/i,
    /^github\.com\/([^/]+)\/([^/]+)/i,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1] && match[2]) {
      const owner = match[1];
      const name = match[2].split("/")[0]!;
      return { owner, name, fullName: `${owner}/${name}` };
    }
  }
  return null;
}

export function gitRemote(cwd = process.cwd()): RepoLocation | null {
  const url =
    git(["remote", "get-url", "origin"], cwd) ??
    git(["remote", "get-url", "upstream"], cwd) ??
    null;
  return url ? parseGithubRemote(url) : null;
}

export function defaultScope(cwd = process.cwd()): string {
  return gitToplevel(cwd) ?? cwd;
}

export function parseRepoArgument(value: string): RepoLocation | null {
  const fromUrl = parseGithubRemote(value);
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
