import { UsageError } from "./errors.js";

export type Provider = "github" | "gitlab" | "bitbucket";

export const PROVIDERS: Provider[] = ["github", "gitlab", "bitbucket"];

export const GITLAB_ID_PREFIX = "gitlab:";
export const BITBUCKET_ID_PREFIX = "bitbucket:";

const LABELS: Record<Provider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
};

const HOSTS: Record<Provider, string> = {
  github: "github.com",
  gitlab: "gitlab.com",
  bitbucket: "bitbucket.org",
};

export interface RepoLike {
  provider?: string | null;
  githubRepoId?: string;
  htmlUrl?: string | null;
}

export function providerLabel(provider: Provider): string {
  return LABELS[provider];
}

export function providerHost(provider: Provider): string {
  return HOSTS[provider];
}

export function parseProvider(value: string): Provider {
  const wanted = value.trim().toLowerCase();
  const match = PROVIDERS.find(
    (provider) => provider === wanted || LABELS[provider].toLowerCase() === wanted,
  );
  if (!match) {
    throw new UsageError(
      `${value} is not a code host Cefense connects to.`,
      `Use ${PROVIDERS.join(", ")}.`,
      "invalid_provider",
    );
  }
  return match;
}

/**
 * The host a stored repository key belongs to.
 *
 * `githubRepoId` carries a GitHub repository id, a namespaced GitLab project id
 * or a namespaced Bitbucket uuid, so the prefix is the only thing that
 * identifies the host when a row has no explicit provider.
 */
export function providerFromRepoId(repoId: string): Provider {
  if (repoId.startsWith(GITLAB_ID_PREFIX)) return "gitlab";
  if (repoId.startsWith(BITBUCKET_ID_PREFIX)) return "bitbucket";
  return "github";
}

export function providerOf(repo: RepoLike): Provider {
  const explicit = repo.provider?.toLowerCase();
  if (explicit === "gitlab" || explicit === "bitbucket" || explicit === "github") return explicit;
  return providerFromRepoId(repo.githubRepoId ?? "");
}

function base(repo: RepoLike): string | null {
  return repo.htmlUrl ? repo.htmlUrl.replace(/\/+$/, "") : null;
}

/** Link to a file, optionally anchored on the lines a finding covers. */
export function blobUrl(
  repo: RepoLike,
  path: string,
  ref: string,
  lines: { start: number | null; end: number | null } = { start: null, end: null },
): string | null {
  const root = base(repo);
  if (!root) return null;
  const provider = providerOf(repo);
  const { start, end } = lines;
  const span = end && start && end !== start ? end : null;

  if (provider === "gitlab") {
    const anchor = start ? `#L${start}${span ? `-${span}` : ""}` : "";
    return `${root}/-/blob/${ref}/${path}${anchor}`;
  }
  if (provider === "bitbucket") {
    const anchor = start ? `#lines-${start}${span ? `:${span}` : ""}` : "";
    return `${root}/src/${ref}/${path}${anchor}`;
  }
  const anchor = start ? `#L${start}${span ? `-L${span}` : ""}` : "";
  return `${root}/blob/${ref}/${path}${anchor}`;
}

export function commitUrl(repo: RepoLike, sha: string): string | null {
  const root = base(repo);
  if (!root) return null;
  const provider = providerOf(repo);
  if (provider === "gitlab") return `${root}/-/commit/${sha}`;
  if (provider === "bitbucket") return `${root}/commits/${sha}`;
  return `${root}/commit/${sha}`;
}

export function treeUrl(repo: RepoLike, branch: string): string | null {
  const root = base(repo);
  if (!root) return null;
  const provider = providerOf(repo);
  if (provider === "gitlab") return `${root}/-/tree/${branch}`;
  if (provider === "bitbucket") return `${root}/src/${branch}`;
  return `${root}/tree/${branch}`;
}
