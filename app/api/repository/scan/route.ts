import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { saveCyberusScan, type CyberusFinding } from "../../../../db/cyberus";

export const dynamic = "force-dynamic";

type GitHubRepository = { full_name: string; html_url: string; default_branch: string; private: boolean };
type GitTree = { tree?: Array<{ path: string; type: string; size?: number }> };

const sourceExtensions = new Set(["js", "jsx", "ts", "tsx", "py", "go", "java", "rb", "php", "rs", "swift", "kt"]);
const ignoredPath = /(^|\/)(node_modules|vendor|dist|build|coverage|\.next|fixtures?|snapshots?)(\/|$)/i;

const patterns: Array<{ regex: RegExp; severity: CyberusFinding["severity"]; category: string; title: string; summary: string }> = [
  { regex: /(?:query|execute)\s*\(\s*`[^`]*(?:\$\{|\+\s*\w)/i, severity: "Critical", category: "Injection", title: "Dynamic SQL construction", summary: "A database call appears to construct SQL from a dynamic value. Verify parameterization at this sink." },
  { regex: /\b(?:eval|exec)\s*\(/i, severity: "Critical", category: "Execution", title: "Dynamic code execution", summary: "Dynamic execution is reachable in this sampled source file. Confirm all inputs are trusted and constrained." },
  { regex: /(?:dangerouslySetInnerHTML|\.innerHTML\s*=)/i, severity: "High", category: "XSS", title: "Direct HTML injection surface", summary: "HTML is written directly. Confirm untrusted values are escaped or sanitized before this point." },
  { regex: /(?:rejectUnauthorized\s*:\s*false|verify\s*=\s*False|NODE_TLS_REJECT_UNAUTHORIZED)/i, severity: "High", category: "Transport", title: "TLS verification disabled", summary: "Certificate verification appears to be disabled in sampled source." },
  { regex: /(?:AKIA[0-9A-Z]{16}|BEGIN (?:RSA |EC )?PRIVATE KEY|(?:api[_-]?key|secret|password)\s*[:=]\s*["'][^"']{12,})/i, severity: "Critical", category: "Secrets", title: "Potential committed credential", summary: "A credential-like value appears in public source. Cefense does not retain the value; rotate and move it to secret storage if confirmed." },
  { regex: /(?:RSA-SHA|generateKeyPairSync\s*\(\s*["']rsa|ECDSA|ECDH)/i, severity: "Watch", category: "Post-quantum", title: "Classical public-key cryptography", summary: "A classical public-key primitive appears in the sampled code. Inventory its protocol and data-lifetime dependencies before migration." },
  { regex: /(?:child_process|os\.system|subprocess\.(?:run|Popen|call))/i, severity: "High", category: "Command execution", title: "Operating-system command surface", summary: "This file invokes an operating-system command. Trace whether user-controlled data can reach its arguments." },
];

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await request.json().catch(() => null) as { repositoryUrl?: unknown } | null;
  const parsed = parseRepository(body?.repositoryUrl);
  if (!parsed) return NextResponse.json({ error: "Use a GitHub repository URL such as github.com/owner/repository." }, { status: 400 });

  const headers = { Accept: "application/vnd.github+json", "User-Agent": "Cefense-Repository-Inventory" };
  const metadataResponse = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, { headers, signal: AbortSignal.timeout(12_000) });
  if (metadataResponse.status === 404) return NextResponse.json({ error: "Repository not found. This beta scanner currently supports public GitHub repositories." }, { status: 404 });
  if (!metadataResponse.ok) return NextResponse.json({ error: "GitHub could not be reached. Try again in a moment." }, { status: 502 });

  const repository = await metadataResponse.json() as GitHubRepository;
  if (repository.private) return NextResponse.json({ error: "Private repositories require the Cefense GitHub App credentials." }, { status: 400 });

  const treeResponse = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(repository.default_branch)}?recursive=1`, { headers, signal: AbortSignal.timeout(12_000) });
  if (!treeResponse.ok) return NextResponse.json({ error: "Cefense could not inventory this repository tree." }, { status: 502 });
  const tree = await treeResponse.json() as GitTree;
  const files = (tree.tree ?? []).filter((entry) => entry.type === "blob" && !ignoredPath.test(entry.path));
  const languages = summarizeLanguages(files.map((entry) => entry.path));
  const candidates = files.filter((entry) => sourceExtensions.has(extension(entry.path)) && (entry.size ?? 0) < 140_000).sort((a, b) => relevance(b.path) - relevance(a.path)).slice(0, 12);

  const sampled = await Promise.all(candidates.map(async (entry) => {
    const rawPath = entry.path.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${encodeURIComponent(repository.default_branch)}/${rawPath}`, { signal: AbortSignal.timeout(8_000) });
    return response.ok ? { path: entry.path, source: await response.text() } : null;
  }));

  const findings = analyzeFiles(sampled.filter((item): item is { path: string; source: string } => Boolean(item)));
  const scan = await saveCyberusScan({ ownerEmail: user.email, repositoryUrl: repository.html_url, repositoryName: repository.full_name, defaultBranch: repository.default_branch, fileCount: files.length, sourceFilesChecked: sampled.filter(Boolean).length, languages, findings });
  return NextResponse.json({ scan });
}

function parseRepository(value: unknown): { owner: string; repo: string } | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\.git$/i, "");
  const match = normalized.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/i) ?? normalized.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  return match ? { owner: match[1], repo: match[2] } : null;
}

function extension(path: string) { return path.split(".").pop()?.toLowerCase() ?? ""; }

function relevance(path: string) {
  let score = 0;
  if (/(auth|login|session|permission|security|crypto|database|query|api|server)/i.test(path)) score += 10;
  if (/(src|app|lib|server)/i.test(path)) score += 3;
  if (/(test|spec|example|demo)/i.test(path)) score -= 5;
  return score;
}

function summarizeLanguages(paths: string[]) {
  const names: Record<string, string> = { js: "JavaScript", jsx: "JavaScript", ts: "TypeScript", tsx: "TypeScript", py: "Python", go: "Go", java: "Java", rb: "Ruby", php: "PHP", rs: "Rust", swift: "Swift", kt: "Kotlin" };
  const counts = new Map<string, number>();
  for (const path of paths) { const name = names[extension(path)]; if (name) counts.set(name, (counts.get(name) ?? 0) + 1); }
  return [...counts.entries()].map(([name, files]) => ({ name, files })).sort((a, b) => b.files - a.files).slice(0, 6);
}

function analyzeFiles(files: Array<{ path: string; source: string }>): CyberusFinding[] {
  const findings: CyberusFinding[] = [];
  for (const file of files) {
    const lines = file.source.split("\n");
    for (const pattern of patterns) {
      const index = lines.findIndex((line) => pattern.regex.test(line));
      if (index >= 0) findings.push({ id: `${file.path}-${pattern.category}-${index}`, severity: pattern.severity, category: pattern.category, title: pattern.title, summary: pattern.summary, file: file.path, line: index + 1 });
      if (findings.length >= 12) return findings;
    }
  }
  if (!findings.length) findings.push({ id: "sample-clear", severity: "Info", category: "Sample", title: "No high-signal pattern in sampled files", summary: "The public beta checked representative source files. This is not yet a complete reachability or taint-analysis result.", file: "Repository sample", line: null });
  return findings;
}
