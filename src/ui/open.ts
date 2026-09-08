import open from "open";
import { PROVIDERS, providerHost } from "../core/providers.js";
import { UsageError } from "../core/errors.js";

export const CODE_HOSTS: readonly string[] = PROVIDERS.map(providerHost);

const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[.*\])$/i;

function hostMatches(host: string, allowed: readonly string[]): boolean {
  return allowed.some((entry) => {
    const wanted = entry.toLowerCase();
    return host === wanted || host.endsWith(`.${wanted}`);
  });
}

export function safeExternalUrl(
  value: string | null | undefined,
  options: { hosts?: readonly string[] } = {},
): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!host || PRIVATE_HOST.test(host)) return null;
  if (options.hosts && !hostMatches(host, options.hosts)) return null;
  return url.toString();
}

export async function openExternal(
  value: string | null | undefined,
  options: { hosts?: readonly string[] } = {},
): Promise<boolean> {
  const safe = safeExternalUrl(value, options);
  if (!safe) return false;
  try {
    await open(safe);
    return true;
  } catch {
    return false;
  }
}

export async function openIfRequested(
  wanted: boolean | undefined,
  url: string | null | undefined,
  options: { hosts?: readonly string[]; what?: string } = {},
): Promise<boolean> {
  if (!wanted) return false;
  const safe = safeExternalUrl(url, options);
  if (!safe) {
    throw new UsageError(
      `There is no web page for ${options.what ?? "that"}.`,
      "Drop --web to print it here instead.",
      "no_web_url",
    );
  }
  await openExternal(safe, options);
  process.stdout.write(`Opening ${safe}\n`);
  return true;
}
