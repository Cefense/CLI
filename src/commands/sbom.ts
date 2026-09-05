import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openSession, type GlobalOptions } from "../core/session.js";
import { CefenseError, UsageError } from "../core/errors.js";
import type { SbomFormat } from "../core/types.js";
import { resolveLinkedProject } from "./link.js";
import * as out from "../ui/output.js";
import { c } from "../ui/theme.js";
import { isAgentMode } from "../ui/mode.js";

const FORMATS: SbomFormat[] = ["cyclonedx", "spdx"];

function parseFormat(value: string | undefined): SbomFormat {
  if (!value) return "cyclonedx";
  const wanted = value.trim().toLowerCase();
  if (!FORMATS.includes(wanted as SbomFormat)) {
    throw new UsageError(`${value} is not an SBOM format.`, "Use cyclonedx or spdx.", "invalid_format");
  }
  return wanted as SbomFormat;
}

export async function sbomCommand(
  globals: GlobalOptions,
  options: { format?: string; output?: string; scan?: string } = {},
): Promise<number> {
  const format = parseFormat(options.format);
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);

  let document: string;
  try {
    document = options.scan
      ? await session.client.sbomForScan(options.scan, format)
      : await session.client.sbomForRepository(project.githubRepoId, format);
  } catch (error) {
    if (error instanceof CefenseError && /component inventory/i.test(error.message)) {
      throw new CefenseError(error.message, {
        remedy: `Run cf settings checks sbom --add --repo ${project.fullName}, then rescan.`,
        code: "sbom_unavailable",
      });
    }
    throw error;
  }

  const target = options.output
    ? resolve(process.cwd(), options.output)
    : null;

  if (target) {
    await writeFile(target, document, "utf8");
  }

  if (isAgentMode()) {
    out.agentEmit(
      {
        repository: project.fullName,
        format,
        scanId: options.scan ?? null,
        bytes: Buffer.byteLength(document, "utf8"),
        path: target,
        document: target ? null : document,
      },
      [`cf observed --repo ${project.fullName} --category dependency --agent`],
    );
    return 0;
  }

  if (!target) {
    process.stdout.write(document.endsWith("\n") ? document : `${document}\n`);
    return 0;
  }

  out.line();
  out.success(`Wrote the ${format} SBOM for ${c.bold(project.fullName)}`);
  out.hint(target);
  out.line();
  return 0;
}
