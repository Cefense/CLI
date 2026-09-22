import type { ScanCoverageGap, ScanSummary } from "./types.js";

/**
 * A finished scan that did not reach the whole repository.
 *
 * The distinction matters because every consumer of a finding list reads
 * absence as good news. "No critical findings" from a scan that stopped
 * halfway through is not the same statement as "no critical findings", and
 * only the scan knows which one it made.
 *
 * A scan with no `outcome` predates coverage reporting; it is unknown, not
 * partial, so it is not flagged.
 */
export function isPartialScan(scan: ScanSummary | null | undefined): boolean {
  return scan?.outcome === "partial";
}

export function coverageGaps(scan: ScanSummary | null | undefined): ScanCoverageGap[] {
  return isPartialScan(scan) ? (scan?.coverageGaps ?? []) : [];
}

/** One line per gap, in the order the scan hit them. */
export function coverageLines(scan: ScanSummary | null | undefined): string[] {
  return coverageGaps(scan).map((gap) => gap.detail);
}

/**
 * The summary only if it describes the scan actually being read.
 *
 * A project carries its newest scan, but `cf reproduced` can be pointed at a
 * branch or an explicit scan id. Labelling those findings with the newest
 * scan's coverage would attach a truthful fact to the wrong scan, which is the
 * same failure this whole field exists to prevent.
 */
export function scanIfSame(
  scan: ScanSummary | null | undefined,
  scanId: string | null,
): ScanSummary | null {
  return scan && scanId && scan.id === scanId ? scan : null;
}
