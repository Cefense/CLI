import { compactProof, prune, verdictLabel } from "../core/compact.js";
import { UsageError } from "../core/errors.js";
import { openSession, type GlobalOptions, type Session } from "../core/session.js";
import type { Finding, FindingProof, Project, ProofCheck, ProofVerdict } from "../core/types.js";
import { isAgentMode } from "../ui/mode.js";
import * as out from "../ui/output.js";
import { printGrouped } from "../ui/list.js";
import { confirm, spinner } from "../ui/prompts.js";
import { isInteractive } from "../ui/screen.js";
import { c, displaySeverity, glyph, severityColor, severityRank } from "../ui/theme.js";
import { relativeTime, shortId, wrapText, terminalWidth } from "../ui/format.js";
import { resolveLinkedProject } from "./link.js";
import { resolveFindingId } from "./reproduced.js";

/** How a proof kind reads to a person. */
const KIND_LABELS: Record<string, string> = {
  "dependency-range": "dependency range",
  "secret-rotation": "secret rotation",
  "exploit-replay": "exploit replay",
  none: "nothing to replay",
};

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

function verdictColor(verdict: ProofVerdict | null): (value: string) => string {
  if (verdict === "proven" || verdict === "argued") return c.green;
  if (verdict === "refuted") return c.red;
  if (verdict === "incomplete") return c.yellow;
  return c.dim;
}

function checkGlyph(check: ProofCheck): string {
  if (check.verdict === "pass") return c.green(glyph.check);
  if (check.verdict === "fail") return c.red(glyph.cross);
  if (check.verdict === "warn") return c.yellow(glyph.warn);
  return c.dim(glyph.ring);
}

/**
 * Poll until the proof settles or fails.
 *
 * An exploit replay asks a model to re-run a recorded attack against the
 * patched file, so a minute or two is ordinary rather than a hang.
 */
async function waitForProof(
  session: Session,
  findingId: string,
  attempts = 90,
): Promise<FindingProof | null> {
  let latest: FindingProof | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const { proof } = await session.client
      .proofForFinding(findingId)
      .catch(() => ({ proof: null as FindingProof | null }));
    if (proof) latest = proof;
    if (proof && proof.status !== "running") return proof;
  }
  return latest;
}

function renderProof(proof: FindingProof, finding: Finding | null): void {
  const width = Math.min(terminalWidth(), 96) - 4;

  out.line();
  const heading = finding ? finding.title : shortId(proof.findingId);
  out.line(
    `  ${c.bold(heading)}   ${c.dim(kindLabel(proof.kind))}${
      proof.verdict ? `   ${verdictColor(proof.verdict)(verdictLabel(proof.verdict).toLowerCase())}` : ""
    }`,
  );
  out.line();

  if (proof.status === "running") {
    out.line(`  ${c.cyan("Replaying the evidence against this patch now.")}`);
    out.line();
    return;
  }
  if (proof.status === "failed") {
    out.line(`  ${c.red(proof.error ?? "The proof did not finish.")}`);
    out.line();
    return;
  }

  if (proof.summary) {
    for (const wrapped of wrapText(proof.summary, width, "  ")) out.line(wrapped);
    out.line();
  }

  for (const check of proof.checks) {
    out.line(`  ${checkGlyph(check)}  ${check.label}`);
    for (const wrapped of wrapText(check.evidence, width - 5, "     ")) out.line(c.dim(wrapped));
  }
  if (proof.checks.length > 0) out.line();

  const witness = proof.witness;
  if (witness && (witness.entry || witness.attackInput || witness.expectedFailure || witness.target || witness.httpRequest)) {
    out.line(`  ${c.dim("witness")}`);
    const field = (label: string, value: string): void => {
      out.line(`    ${c.dim(label)}`);
      for (const wrapped of wrapText(value, width - 6, "      ")) out.line(wrapped);
    };
    if (witness.entry) field("entry", witness.entry);
    if (witness.target) field("target", `${witness.target.module} ${glyph.arrow} ${witness.target.callable}`);
    if (witness.httpRequest) field("request", `${witness.httpRequest.method} ${witness.httpRequest.path}`);
    if (witness.attackInput) field("attack input", witness.attackInput);
    if (witness.expectedFailure) field("expected failure", witness.expectedFailure);
    for (const assertion of witness.assertions ?? []) {
      const [first, ...rest] = wrapText(assertion, width - 6, "      ");
      out.line(`    ${c.dim(glyph.sep)} ${(first ?? "").trimStart()}`);
      for (const wrapped of rest) out.line(c.dim(wrapped));
    }
    out.line();
  }

  if (proof.attestedBy) {
    out.line(
      `  ${c.green(glyph.check)} attested by ${proof.attestedBy} ${c.dim(relativeTime(proof.attestedAt))}`,
    );
    if (proof.attestationNote) out.line(`    ${c.dim(proof.attestationNote)}`);
    out.line();
  }

  const provenance = [
    `base ${proof.baseSha.slice(0, 7)}`,
    `patch ${proof.patchHash.slice(0, 7)}`,
    proof.model,
  ].filter(Boolean);
  out.line(`  ${c.dim(provenance.join(`  ${glyph.sep}  `))}`);
  out.line();
}

/** The commands worth running next, given how this proof came out. */
function proofNext(findingId: string, proof: FindingProof | null): string[] {
  if (!proof) return [`cf proof run ${findingId} --wait --agent`];
  if (proof.status === "running") return [`cf proof show ${findingId} --agent`];
  if (proof.status === "failed") return [`cf proof run ${findingId} --wait --agent`];
  if (proof.verdict === "refuted") return [`cf fix generate ${findingId} --wait --agent`];
  if (proof.verdict === "incomplete" && proof.kind === "secret-rotation" && !proof.attestedBy) {
    return [`cf proof attest ${findingId} --yes --agent`];
  }
  return [`cf fix publish ${findingId} --yes --agent`];
}

interface Row {
  finding: Finding;
  proof: FindingProof | null;
}

async function loadRows(
  session: Session,
  project: Project,
): Promise<{ rows: Row[]; scanId: string | null }> {
  const response = await session.client.findings(project.githubRepoId);
  if (!response.scanId) return { rows: [], scanId: null };

  const { proofs } = await session.client
    .proofsForScan(response.scanId)
    .catch(() => ({ proofs: [] as FindingProof[] }));
  const byFinding = new Map(proofs.map((proof) => [proof.findingId, proof]));

  const rows = response.findings
    .map((finding) => ({ finding, proof: byFinding.get(finding.id) ?? null }))
    .sort(
      (left, right) =>
        severityRank(left.finding.severity) - severityRank(right.finding.severity) ||
        left.finding.filePath.localeCompare(right.finding.filePath),
    );
  return { rows, scanId: response.scanId };
}

export async function proofCommand(globals: GlobalOptions): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);
  const { rows, scanId } = await loadRows(session, project);

  if (isAgentMode()) {
    out.agentEmit(
      prune({
        repository: project.fullName,
        scanId,
        proofs: rows
          .filter((row) => row.proof)
          .map((row) => compactProof(row.proof as FindingProof, { checks: false })),
      }),
      [],
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({
      repository: project.fullName,
      scanId,
      proofs: rows.map((row) => row.proof).filter(Boolean),
    });
    return 0;
  }

  const groups: Array<{ key: string; label: string; tint: (value: string) => string }> = [
    { key: "proven", label: "Proven", tint: c.green },
    { key: "argued", label: "Argued", tint: c.green },
    { key: "incomplete", label: "Incomplete", tint: c.yellow },
    { key: "refuted", label: "Refuted", tint: c.red },
    { key: "unprovable", label: "Nothing to prove", tint: c.dim },
    { key: "running", label: "Running", tint: c.cyan },
    { key: "failed", label: "Did not finish", tint: c.red },
    { key: "none", label: "Not proved yet", tint: c.dim },
  ];

  const keyOf = (row: Row): string => {
    if (!row.proof) return "none";
    if (row.proof.status === "running") return "running";
    if (row.proof.status === "failed") return "failed";
    return row.proof.verdict ?? "none";
  };

  const unproved = rows.find((row) => !row.proof);
  const settled = rows.find((row) => row.proof?.status === "settled");
  const next: Array<{ command: string; purpose: string }> = [];
  if (unproved) {
    next.push({
      command: `cf proof run ${shortId(unproved.finding.id)}`,
      purpose: "replay the evidence against its patch",
    });
  }
  if (settled) {
    next.push({
      command: `cf proof show ${shortId(settled.finding.id)}`,
      purpose: "read the checks and the witness",
    });
  }

  printGrouped<Row>({
    noun: "finding",
    scope: project.fullName,
    footnote: `${rows.filter((row) => row.proof).length} of ${rows.length} have a proof.`,
    groups: groups.map((group) => ({
      label: group.label,
      tint: group.tint,
      rows: rows.filter((row) => keyOf(row) === group.key),
    })),
    columns: [
      { header: "id", value: (row) => c.dim(shortId(row.finding.id)), min: 8, max: 8 },
      {
        header: "severity",
        value: (row) =>
          severityColor(row.finding.severity)(displaySeverity(row.finding.severity).toLowerCase()),
        min: 8,
        max: 8,
      },
      { header: "file", value: (row) => row.finding.filePath, min: 16, max: 34 },
      { header: "title", value: (row) => row.finding.title, min: 28 },
      {
        header: "kind",
        value: (row) => (row.proof ? c.dim(kindLabel(row.proof.kind)) : ""),
        min: 1,
      },
    ],
    pipeColumns: [
      { header: "severity", value: (row) => displaySeverity(row.finding.severity).toLowerCase() },
      { header: "file", value: (row) => row.finding.filePath },
      { header: "verdict", value: (row) => keyOf(row) },
      { header: "kind", value: (row) => row.proof?.kind ?? "" },
      { header: "title", value: (row) => row.finding.title },
    ],
    empty: scanId
      ? `No findings in ${project.fullName} to prove.`
      : `${project.fullName} has not been scanned yet.`,
    emptyHint: scanId ? null : `Run cf scan --repo ${project.fullName}.`,
    next,
  });

  return 0;
}

export async function proofShow(globals: GlobalOptions, findingId: string): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);
  findingId = await resolveFindingId(session, project, findingId);
  const { proof } = await session.client.proofForFinding(findingId);

  if (isAgentMode()) {
    out.agentEmit(
      prune({ findingId, proof: proof ? compactProof(proof) : null }),
      proofNext(findingId, proof),
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ findingId, proof });
    return 0;
  }

  if (!proof) {
    out.line();
    out.info("No proof has been run for that finding.");
    out.hint(`cf proof run ${shortId(findingId)}`);
    out.line();
    return 0;
  }

  const finding = await session.client
    .findings(project.githubRepoId)
    .then((response) => response.findings.find((entry) => entry.id === findingId) ?? null)
    .catch(() => null);
  renderProof(proof, finding);
  return 0;
}

export async function proofRun(
  globals: GlobalOptions,
  findingId: string,
  options: { wait?: boolean } = {},
): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);
  findingId = await resolveFindingId(session, project, findingId);

  const progress = spinner();
  progress.start("Replaying the evidence against the patch");
  let proof: FindingProof | null;
  try {
    const result = await session.client.runProof(findingId);
    proof = result.proof;
  } catch (error) {
    progress.stop("Could not start the proof", "fail");
    throw error;
  }

  if (!proof) {
    progress.stop("Could not start the proof", "fail");
    throw new UsageError(
      `${findingId} is not a finding in ${project.fullName}.`,
      `Run cf reproduced --repo ${project.fullName} to list finding ids.`,
      "finding_not_found",
    );
  }

  if (options.wait) {
    progress.message("Replaying the evidence, this can take a minute");
    proof = (await waitForProof(session, findingId)) ?? proof;
  }
  progress.stop(
    proof.status === "failed"
      ? "The proof did not finish"
      : proof.status === "running"
        ? "Proof running"
        : `Verdict: ${verdictLabel(proof.verdict ?? "").toLowerCase() || "settled"}`,
    proof.status === "failed" || proof.verdict === "refuted" ? "fail" : "ok",
  );

  if (isAgentMode()) {
    out.agentEmit(prune({ findingId, proof: compactProof(proof) }), proofNext(findingId, proof));
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ findingId, proof });
    return 0;
  }

  const finding = await session.client
    .findings(project.githubRepoId)
    .then((response) => response.findings.find((entry) => entry.id === findingId) ?? null)
    .catch(() => null);
  renderProof(proof, finding);
  if (proof.status === "running") {
    out.info("Next: poll until it settles");
    out.line(`    ${c.dim(`cf proof show ${shortId(findingId)}`)}`);
    out.line();
  }
  return 0;
}

/**
 * Record by hand that a leaked credential was rotated.
 *
 * A secret rotation proof settles as `incomplete` because nothing Cefense can
 * run tells it whether the credential was revoked at the provider. Only a
 * person knows that, so attesting is a claim about the world written into the
 * audit log under their name, and it is gated for that reason rather than
 * because it touches a repository.
 */
export async function proofAttest(
  globals: GlobalOptions,
  findingId: string,
  options: { note?: string } = {},
): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);
  findingId = await resolveFindingId(session, project, findingId);

  const { proof: existing } = await session.client.proofForFinding(findingId);
  if (!existing) {
    throw new UsageError(
      `No proof has been run for ${findingId}.`,
      `Run cf proof run ${findingId} --wait first.`,
      "proof_not_found",
    );
  }
  if (existing.status !== "settled") {
    throw new UsageError(
      `The proof for ${findingId} is ${existing.status}, so it has no verdict to attest.`,
      `Run cf proof show ${findingId} once it has settled.`,
      "proof_not_settled",
    );
  }
  if (existing.kind !== "secret-rotation" || existing.verdict !== "incomplete") {
    throw new UsageError(
      `The ${kindLabel(existing.kind)} proof for ${findingId} came back ${verdictLabel(existing.verdict ?? "").toLowerCase()}.`,
      "Only a settled secret rotation proof that came back incomplete can be attested.",
      "proof_not_attestable",
    );
  }

  if (!globals.yes) {
    if (!isInteractive()) {
      throw new UsageError(
        "Attesting records in the audit log that you rotated the credential.",
        `Pass --yes to confirm: cf proof attest ${findingId} --yes`,
        "confirmation_required",
      );
    }
    out.line();
    out.warn(`This records under your name that the credential was rotated.`);
    out.hint(`${project.fullName}, verdict incomplete until then.`);
    out.line();
    const confirmed = await confirm({ message: "Has the credential been rotated?" });
    if (!confirmed) {
      out.line();
      out.info("Nothing was attested.");
      out.line();
      return 0;
    }
  }

  const progress = spinner();
  progress.start("Recording the attestation");
  let proof: FindingProof | null;
  try {
    const result = await session.client.attestProof(findingId, options.note);
    proof = result.proof;
  } catch (error) {
    progress.stop("Could not attest the rotation", "fail");
    throw error;
  }
  if (!proof) {
    progress.stop("Could not attest the rotation", "fail");
    throw new UsageError(
      `The proof for ${findingId} cannot be attested.`,
      "Only a settled secret rotation proof that came back incomplete can be attested, and only by an organization admin.",
      "proof_not_attestable",
    );
  }
  progress.stop("Rotation attested");

  if (isAgentMode()) {
    out.agentEmit(prune({ findingId, proof: compactProof(proof) }), proofNext(findingId, proof));
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ findingId, proof });
    return 0;
  }

  out.line();
  out.success(`${glyph.check} Rotation attested for ${shortId(findingId)}`);
  out.line();
  return 0;
}
