import { PROOF_ROW, compactProof, prune, verdictLabel } from "../core/compact.js";
import { UsageError } from "../core/errors.js";
import { openSession, type GlobalOptions, type Session } from "../core/session.js";
import type { Finding, FindingProof, Project, ProofCheck } from "../core/types.js";
import { isAgentMode } from "../ui/mode.js";
import * as out from "../ui/output.js";
import { hintLine, hintLines, printGrouped, type NextStep } from "../ui/list.js";
import { confirm, spinner } from "../ui/prompts.js";
import { isInteractive } from "../ui/screen.js";
import { c, displaySeverity, glyph, severityColor, severityRank, stateWord, toneMark, type Tone } from "../ui/theme.js";
import { datedLabel, pathFloor, relativeTime, shortId, terminalWidth, wrapText } from "../ui/format.js";
import { details } from "../ui/table.js";
import { page } from "../ui/pager.js";
import { BODY_INDENT, heading, joinDots, paragraph, readingWidth, titleLine } from "../ui/detail.js";
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

function proofTone(proof: FindingProof): Tone {
  if (proof.status === "running") return "running";
  if (proof.status === "failed") return "failed";
  if (proof.verdict === "proven" || proof.verdict === "argued") return "done";
  if (proof.verdict === "refuted") return "failed";
  if (proof.verdict === "incomplete") return "attention";
  return "none";
}

function proofWord(proof: FindingProof): string {
  if (proof.status === "running") return "running";
  if (proof.status === "failed") return "did not finish";
  return proof.verdict ? verdictLabel(proof.verdict).toLowerCase() : "settled";
}

function checkGlyph(check: ProofCheck): string {
  if (check.verdict === "pass") return toneMark("done");
  if (check.verdict === "fail") return toneMark("failed");
  if (check.verdict === "warn") return toneMark("attention");
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

function humanNext(findingId: string, proof: FindingProof, flag: string): NextStep {
  const id = shortId(findingId);
  if (proof.status === "running") return { command: `cf proof show ${id}${flag}`, purpose: "check on it" };
  if (proof.status === "failed") return { command: `cf proof run ${id}${flag}`, purpose: "run the proof again" };
  if (proof.verdict === "refuted") return { command: `cf fix generate ${id}${flag}`, purpose: "write a different patch" };
  if (proof.verdict === "incomplete" && proof.kind === "secret-rotation" && !proof.attestedBy) {
    return { command: `cf proof attest ${id}${flag}`, purpose: "record that the credential was rotated" };
  }
  return { command: `cf fix publish ${id}${flag}`, purpose: "open a pull request with this patch" };
}

function proofDetail(proof: FindingProof, finding: Finding | null, flag: string): string[] {
  const width = readingWidth();
  const lines: string[] = [
    titleLine(finding ? `Proof for ${finding.title}` : "Proof", shortId(proof.findingId)),
    joinDots([
      stateWord(proofTone(proof), proofWord(proof)),
      kindLabel(proof.kind),
      finding ? severityColor(finding.severity)(displaySeverity(finding.severity)) : null,
      c.dim(`updated ${relativeTime(proof.updatedAt)}`),
    ]),
    "",
    ...details([
      ["Base", proof.baseSha.slice(0, 7)],
      ["Patch", proof.patchHash.slice(0, 7)],
      ["Model", proof.model],
      ["Attested", proof.attestedBy ? `${proof.attestedBy}, ${datedLabel(proof.attestedAt)}` : null],
      ["Note", proof.attestationNote],
      ["Updated", datedLabel(proof.updatedAt)],
    ]),
  ];

  if (proof.status === "running") {
    lines.push("", `${BODY_INDENT}${c.cyan("Replaying the evidence against this patch now.")}`);
  } else if (proof.status === "failed") {
    lines.push("", ...paragraph(proof.error ?? "The proof did not finish.", width, c.red));
  } else {
    if (proof.summary) lines.push("", ...paragraph(proof.summary, width));

    if (proof.checks.length > 0) {
      lines.push("", heading("Checks"));
      for (const check of proof.checks) {
        lines.push(`${BODY_INDENT}${checkGlyph(check)} ${check.label}`);
        lines.push(...paragraph(check.evidence, width - 2, c.dim).map((value) => `  ${value}`));
      }
    }

    const witness = proof.witness;
    if (witness && (witness.entry || witness.attackInput || witness.expectedFailure || witness.target || witness.httpRequest)) {
      lines.push("", heading("Witness"));
      const field = (label: string, value: string): void => {
        lines.push(`${BODY_INDENT}${c.dim(label)}`);
        lines.push(...paragraph(value, width - 2).map((entry) => `  ${entry}`));
      };
      if (witness.entry) field("Entry", witness.entry);
      if (witness.target) field("Target", `${witness.target.module} ${glyph.arrow} ${witness.target.callable}`);
      if (witness.httpRequest) field("Request", `${witness.httpRequest.method} ${witness.httpRequest.path}`);
      if (witness.attackInput) field("Attack input", witness.attackInput);
      if (witness.expectedFailure) field("Expected failure", witness.expectedFailure);
      const assertions = witness.assertions ?? [];
      if (assertions.length > 0) {
        lines.push(`${BODY_INDENT}${c.dim("Assertions")}`);
        for (const assertion of assertions) {
          const [first, ...rest] = wrapText(assertion, width - 6);
          lines.push(`${BODY_INDENT}  ${c.dim(glyph.sep)} ${first ?? ""}`);
          for (const wrapped of rest) lines.push(`${BODY_INDENT}    ${wrapped}`);
        }
      }
    }
  }

  lines.push("");
  const hint = hintLine(humanNext(proof.findingId, proof, flag));
  if (hint) lines.push(hint);
  lines.push("");
  return lines;
}

/** The commands worth running next, given how this proof came out. */
function proofNext(findingId: string, proof: FindingProof | null, repository: string): string[] {
  const repo = `--repo ${repository}`;
  if (!proof) return [`cf proof run ${findingId} ${repo} --wait --agent`];
  if (proof.status === "running") return [`cf proof show ${findingId} ${repo} --agent`];
  if (proof.status === "failed") return [`cf proof run ${findingId} ${repo} --wait --agent`];
  if (proof.verdict === "refuted") return [`cf fix generate ${findingId} ${repo} --wait --agent`];
  if (proof.verdict === "incomplete" && proof.kind === "secret-rotation" && !proof.attestedBy) {
    return [`cf proof attest ${findingId} ${repo} --yes --agent`];
  }
  return [`cf fix publish ${findingId} ${repo} --yes --agent`];
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
    const proofs = rows.filter((row) => row.proof).map((row) => row.proof as FindingProof);
    const pending = proofs.find((proof) => proof.status === "running" || proof.verdict === "refuted") ?? proofs[0];
    out.agentEmit(
      prune({
        repository: project.fullName,
        scanId,
        proofs: proofs.map((proof) => compactProof(proof, { checks: false })),
      }),
      [pending ? `cf proof show ${pending.findingId} --repo ${project.fullName} --agent` : ""],
      { proofs: PROOF_ROW },
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
    { key: "proven", label: "Confirmed", tint: c.green },
    { key: "argued", label: "Checked", tint: c.green },
    { key: "incomplete", label: "Needs you", tint: c.yellow },
    { key: "refuted", label: "Not fixed", tint: c.red },
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

  const flag = globals.repo ? ` --repo ${project.fullName}` : "";
  const proved = rows.filter((row) => row.proof).length;
  const settled = rows.find((row) => row.proof?.status === "settled");
  const next: NextStep[] = settled
    ? [{ command: `cf proof show ${shortId(settled.finding.id)}${flag}`, purpose: "read the checks and the witness" }]
    : [];

  printGrouped<Row>({
    noun: "finding",
    scope: project.fullName,
    footnote: `${proved} of ${rows.length} have a proof.`,
    groups: groups.map((group) => ({
      label: group.label,
      tint: group.tint,
      rows: rows.filter((row) => keyOf(row) === group.key),
      collapsed: group.key === "none" ? `run cf fix${flag} to see which have a patch to prove` : undefined,
    })),
    columns: [
      { header: "id", value: (row) => c.dim(shortId(row.finding.id)), overflow: "never" },
      {
        header: "severity",
        value: (row) =>
          severityColor(row.finding.severity)(displaySeverity(row.finding.severity).toLowerCase()),
        overflow: "never",
      },
      { header: "title", value: (row) => row.finding.title, flex: true, min: 16 },
      {
        header: "file",
        value: (row) => row.finding.filePath,
        max: 40,
        min: pathFloor(rows.map((row) => row.finding.filePath), Math.round(terminalWidth() / 4)),
        overflow: "path",
      },
      {
        header: "kind",
        value: (row) => (row.proof ? c.dim(kindLabel(row.proof.kind)) : ""),
        overflow: "never",
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
      proofNext(findingId, proof, project.fullName),
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ findingId, proof });
    return 0;
  }

  const flag = globals.repo ? ` --repo ${project.fullName}` : "";
  if (!proof) {
    out.line();
    out.info("No proof has been run for that finding.");
    out.lines(hintLines([{ command: `cf proof run ${shortId(findingId)}${flag}`, purpose: "replay the evidence against its patch" }]));
    out.line();
    return 0;
  }

  const finding = await session.client
    .findings(project.githubRepoId)
    .then((response) => response.findings.find((entry) => entry.id === findingId) ?? null)
    .catch(() => null);
  page(proofDetail(proof, finding, flag));
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
    out.agentEmit(prune({ findingId, proof: compactProof(proof) }), proofNext(findingId, proof, project.fullName));
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
  out.line();
  page(proofDetail(proof, finding, globals.repo ? ` --repo ${project.fullName}` : ""));
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
      `Run cf proof run ${findingId} --repo ${project.fullName} --wait first.`,
      "proof_not_found",
    );
  }
  if (existing.status !== "settled") {
    throw new UsageError(
      `The proof for ${findingId} is ${existing.status}, so it has no verdict to attest.`,
      `Run cf proof show ${findingId} --repo ${project.fullName} once it has settled.`,
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
    out.agentEmit(prune({ findingId, proof: compactProof(proof) }), proofNext(findingId, proof, project.fullName));
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ findingId, proof });
    return 0;
  }

  out.line();
  out.success(`Rotation attested for ${shortId(findingId)}`);
  out.line();
  return 0;
}
