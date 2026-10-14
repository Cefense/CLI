import type {
  AttackStep,
  Chain,
  ChainShown,
  ChainSource,
  D3fendTacticName,
  Finding,
  ImpactAssetKind,
  LikelihoodSignalKind,
  WorkspaceStage,
} from "./types.js";

export const WORKSPACE_STAGES: readonly WorkspaceStage[] = ["weakness", "attack", "impact", "fix", "proof"];

export const CHAIN_SHOWN: readonly ChainShown[] = ["full", "weakness-only"];

export const IMPACT_ASSET_KINDS: readonly ImpactAssetKind[] = [
  "database",
  "table",
  "secret",
  "cloud-credentials",
  "files",
  "process",
  "sessions",
];

export const D3FEND_TACTIC_NAMES: readonly D3fendTacticName[] = [
  "Model",
  "Harden",
  "Detect",
  "Isolate",
  "Deceive",
  "Evict",
  "Restore",
];

export const LIKELIHOOD_SIGNAL_KINDS: readonly LikelihoodSignalKind[] = ["reachability", "proof", "epss", "kev"];

export const WEAKNESS_ONLY_NOTE = "Attack and Impact appear once this finding is confirmed.";

const ASSET_KIND_LABELS: Record<ImpactAssetKind, string> = {
  database: "database",
  table: "table",
  secret: "secret",
  "cloud-credentials": "cloud credentials",
  files: "files",
  process: "process",
  sessions: "sessions",
};

export function assetKindLabel(kind: ImpactAssetKind | string): string {
  return ASSET_KIND_LABELS[kind as ImpactAssetKind] ?? kind;
}

export function sourceLabel(source: ChainSource | string): string {
  return source === "mitre" ? "MITRE" : "Cefense";
}

export function tacticLabel(shortname: string): string {
  return shortname.replace(/-/g, " ");
}

export function isSeen(step: AttackStep): boolean {
  return Boolean(step.observedAt);
}

export function hasFullChain(finding: Finding): finding is Finding & { chain: Chain } {
  return finding.chain?.shown === "full";
}

export function formatDollars(cents: number): string {
  const dollars = cents / 100;
  const whole = Number.isInteger(dollars);
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

export function formatDollarRange(low: number, high: number): string {
  return low === high ? formatDollars(low) : `${formatDollars(low)}-${formatDollars(high)}`;
}

export function compactChain(finding: Finding): Record<string, unknown> | null {
  const chain = finding.chain;
  if (!chain) return null;
  const full = chain.shown === "full";
  const seen = chain.attack.steps.filter(isSeen).map((step) => step.id);
  const result: Record<string, unknown> = { shown: chain.shown };
  if (chain.weakness.cve && chain.weakness.cve !== finding.cveId) result.cve = chain.weakness.cve;
  if (chain.weakness.cwe && chain.weakness.cwe !== finding.cwe) result.cwe = chain.weakness.cwe;
  if (chain.weakness.cweIds.length > 0) result.cweIds = chain.weakness.cweIds;
  if (full && chain.attack.capec) result.capec = chain.attack.capec.id;
  if (full && chain.attack.steps.length > 0) result.attack = chain.attack.steps.map((step) => step.id);
  if (full && seen.length > 0) result.seen = seen;
  if (full && chain.impact.assets.length > 0) {
    result.assets = chain.impact.assets.map((asset) => `${asset.kind}:${asset.name}`);
  }
  if (chain.fix.d3fend.length > 0) result.d3fend = chain.fix.d3fend.map((ref) => ref.id);
  return result;
}
