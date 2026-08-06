/**
 * Shared response contracts for the Cyberus data API.
 *
 * These types are the single source of truth for what the frontend expects and
 * what the backend must return. Every stub route in `app/api/*` returns mock
 * data shaped exactly like these types. When the CTO wires a real data source,
 * keep the shapes — swap only the body of each handler.
 *
 * See API_CONTRACT.md at the repo root for endpoints, methods, and examples.
 */

export type Severity = "Critical" | "High" | "Watch" | "Medium" | "Info";
export type CaseStage = "observed" | "matched" | "fix" | "proof";

/** A single attack path as it moves through the loop. GET /api/feed */
export interface ObservedPath {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  /** Plain-language behavior summary, shown before code match. */
  summary: string;
  /** Populated once matched. */
  file?: string;
  line?: number;
  source: string;
  observedAt: string; // ISO 8601
  variants: number;
  stage: CaseStage;
}

/** The focused fix package for one path. GET /api/fix/:id */
export interface FixPackage {
  pathId: string;
  controlPoint: { file: string; line: number };
  summary: string; // plain-language "what this change does"
  diff: DiffLine[];
  decisionTrace: string[];
  checklist: { label: string; done: boolean }[];
  filesChanged: number;
  added: number;
  removed: number;
}
export interface DiffLine {
  line: string;
  kind: "context" | "added" | "removed";
  code: string;
  file: string;
}

/** The signed immunity record. GET /api/evidence/:id */
export interface ImmunityRecord {
  pathId: string;
  title: string;
  status: "draft" | "signed";
  hash: string;
  chain: {
    stage: CaseStage;
    label: string;
    detail: string;
    at: string;
  }[];
}

/** Inventory rows. GET /api/assets?kind=containers|clouds|domains */
export type AssetKind = "containers" | "clouds" | "domains";
export interface AssetRow {
  name: string;
  context: string;
  status: string; // e.g. "Protected", "2 findings", "Clean"
  meta: string; // e.g. "Scanned 6m ago"
}

/** Merge-time review rows. GET /api/audit */
export interface AuditRow {
  ref: string; // "PR #184"
  title: string;
  file: string;
  impact: { added: number; removed: number };
  severity: Severity;
}

/** Pentest jobs. GET /api/pentests · POST /api/pentests { target, profile } */
export interface PentestJob {
  target: string;
  type: string;
  status: string;
  progress: number; // 0-100
}

/** Library topics. GET /api/library?q= */
export interface LibraryTopic {
  category: string;
  title: string;
  source: string;
}

/** Connectors. GET /api/integrations · POST /api/integrations/:id/connect */
export interface Connector {
  id: string;
  name: string;
  description: string;
  connected: boolean;
}
