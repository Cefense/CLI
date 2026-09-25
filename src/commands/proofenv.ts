import { prune } from "../core/compact.js";
import { CefenseError, EXIT_API, UsageError } from "../core/errors.js";
import { openSession, type GlobalOptions } from "../core/session.js";
import type { Project, ProofEnvResponse } from "../core/types.js";
import type { Session } from "../core/session.js";
import { isAgentMode } from "../ui/mode.js";
import * as out from "../ui/output.js";
import { confirm, secret, spinner } from "../ui/prompts.js";
import { isInteractive } from "../ui/screen.js";
import { c, glyph } from "../ui/theme.js";
import { relativeTime } from "../ui/format.js";
import { resolveLinkedProject } from "./link.js";

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_NAME = 128;
const MAX_VALUE = 8_192;

export function parseEnvName(value: string): string {
  const name = value.trim();
  if (!NAME.test(name) || name.length > MAX_NAME) {
    throw new UsageError(
      `${value} is not an environment variable name.`,
      "Use letters, digits and underscores, not starting with a digit, for example DATABASE_URL.",
      "invalid_env_name",
    );
  }
  return name;
}

export function trimValue(raw: string): string {
  return raw.replace(/\r?\n$/, "");
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString("utf8");
}

function valueRequired(name: string): UsageError {
  return new UsageError(
    `No value was given for ${name}.`,
    `Pipe it on stdin: printf %s "$${name}" | cf proof env set ${name} --stdin. Or pass --from-env.`,
    "env_value_required",
  );
}

async function valueFor(name: string, options: { stdin?: boolean; fromEnv?: boolean }): Promise<string> {
  let value: string | undefined;
  if (options.fromEnv) {
    value = process.env[name];
  } else if (options.stdin) {
    value = trimValue(await readStdin());
  } else if (!isAgentMode() && isInteractive()) {
    value = await secret({ message: `Value for ${name}` });
  }
  if (!value) throw valueRequired(name);
  if (value.length > MAX_VALUE) {
    throw new UsageError(`The value for ${name} is longer than ${MAX_VALUE} characters.`, undefined, "usage_error");
  }
  return value;
}

function unavailable(): CefenseError {
  return new CefenseError("Encryption is not configured on this deployment, so a value cannot be stored safely.", {
    remedy: "An operator has to configure encryption on the server.",
    exitCode: EXIT_API,
    code: "proof_env_unavailable",
  });
}

async function load(session: Session, project: Project): Promise<ProofEnvResponse> {
  return session.client.proofEnv(project.id);
}

export async function proofEnvList(globals: GlobalOptions): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);
  const { variables, encryptionConfigured } = await load(session, project);

  if (isAgentMode()) {
    out.agentEmit(
      prune({
        repository: project.fullName,
        encryptionConfigured,
        variables: variables.map((variable) => ({ name: variable.name, updatedAt: variable.updatedAt })),
      }),
      [],
    );
    return 0;
  }

  if (out.isJsonMode()) {
    out.json({ repository: project.fullName, encryptionConfigured, variables });
    return 0;
  }

  out.line();
  out.line(`  ${c.bold("Proof environment")}   ${c.dim(project.fullName)}`);
  out.line(c.dim("  Values a proof run needs to boot the app. Values are write-only and never shown."));
  out.line();
  if (!encryptionConfigured) {
    out.warn("Encryption is not configured on this deployment, so no value can be stored.");
    out.line();
  }
  if (variables.length === 0) {
    out.info("No variables are stored for this repository.");
  } else {
    const width = Math.max(...variables.map((variable) => variable.name.length));
    for (const variable of variables) {
      out.line(`  ${variable.name.padEnd(width)}   ${c.dim(`set ${relativeTime(variable.updatedAt)}`)}`);
    }
  }
  out.line();
  if (encryptionConfigured) out.hint("cf proof env set <NAME>");
  out.line();
  return 0;
}

export async function proofEnvSet(
  globals: GlobalOptions,
  rawName: string,
  options: { stdin?: boolean; fromEnv?: boolean } = {},
): Promise<number> {
  const name = parseEnvName(rawName);
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);
  const current = await load(session, project);
  if (!current.encryptionConfigured) throw unavailable();

  const replacing = current.variables.some((variable) => variable.name === name);
  if (replacing && !globals.yes) {
    if (isAgentMode() || !isInteractive()) {
      throw new UsageError(
        `${name} is already set for ${project.fullName}, and the stored value cannot be read back once replaced.`,
        `Pass --yes to replace it: cf proof env set ${name} --stdin --yes`,
        "confirmation_required",
      );
    }
    const confirmed = await confirm({ message: `Replace the stored value of ${name}?` });
    if (!confirmed) {
      out.line();
      out.info("Nothing was changed.");
      out.line();
      return 0;
    }
  }

  const value = await valueFor(name, options);

  const progress = spinner();
  progress.start(`Storing ${name}`);
  let saved;
  try {
    saved = (await session.client.setProofEnv(project.id, name, value)).variable;
  } catch (error) {
    progress.stop(`Could not store ${name}`, "fail");
    throw error;
  }
  progress.stop(replacing ? `Replaced ${name}` : `Stored ${name}`);

  if (isAgentMode()) {
    out.agentEmit(
      prune({ repository: project.fullName, variable: saved, replaced: replacing || null }),
      [`cf proof env --repo ${project.fullName} --agent`],
    );
    return 0;
  }
  if (out.isJsonMode()) {
    out.json({ repository: project.fullName, variable: saved, replaced: replacing });
    return 0;
  }
  out.line();
  out.success(`${glyph.check} ${name} ${replacing ? "replaced" : "stored"} for ${project.fullName}`);
  out.line();
  return 0;
}

export async function proofEnvUnset(globals: GlobalOptions, rawName: string): Promise<number> {
  const name = parseEnvName(rawName);
  const session = await openSession(globals, { auth: true });
  const { project } = await resolveLinkedProject(session, globals);

  if (!globals.yes) {
    if (isAgentMode() || !isInteractive()) {
      throw new UsageError(
        `Removing ${name} deletes the stored value, and it cannot be recovered.`,
        `Pass --yes to confirm: cf proof env unset ${name} --yes`,
        "confirmation_required",
      );
    }
    const confirmed = await confirm({ message: `Delete ${name} from ${project.fullName}?` });
    if (!confirmed) {
      out.line();
      out.info("Nothing was removed.");
      out.line();
      return 0;
    }
  }

  const { removed } = await session.client.deleteProofEnv(project.id, name);
  if (!removed) {
    throw new UsageError(
      `${name} is not stored for ${project.fullName}.`,
      `Run cf proof env --repo ${project.fullName} to list the names that are.`,
      "env_var_not_found",
    );
  }

  if (isAgentMode()) {
    out.agentEmit({ repository: project.fullName, name, removed: true }, [
      `cf proof env --repo ${project.fullName} --agent`,
    ]);
    return 0;
  }
  if (out.isJsonMode()) {
    out.json({ repository: project.fullName, name, removed: true });
    return 0;
  }
  out.line();
  out.success(`${glyph.check} ${name} removed from ${project.fullName}`);
  out.line();
  return 0;
}
