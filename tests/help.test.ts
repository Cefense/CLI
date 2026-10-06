import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { DETAILS, EXAMPLES, GLOBAL_FLAGS, LEGACY_NAMES, ROOT_SECTIONS } from "../src/ui/helpContent.js";
import { suggest } from "../src/ui/help.js";
import { workspaceUrl } from "../src/commands/browse.js";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "index.js");

interface Result {
  stdout: string;
  stderr: string;
  status: number | null;
}

function cf(args: string[], env: Record<string, string> = {}): Result {
  const base: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1", CEFENSE_AGENT: "0", ...env };
  delete base.FORCE_COLOR;
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: base });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

interface SchemaNode {
  path: string;
  arguments: Array<{ name: string; required: boolean; variadic: boolean }>;
  options: Array<{ flags: string }>;
  subcommands?: SchemaNode[];
}

let cachedSchema: Map<string, SchemaNode> | null = null;

function schema(): Map<string, SchemaNode> {
  if (cachedSchema) return cachedSchema;
  const result = cf(["agent", "schema", "--agent"]);
  assert.equal(result.status, 0, result.stderr);
  const envelope = JSON.parse(result.stdout) as { data: { commands: SchemaNode[] } };
  const nodes = new Map<string, SchemaNode>();
  const visit = (node: SchemaNode) => {
    nodes.set(node.path, node);
    for (const child of node.subcommands ?? []) visit(child);
  };
  for (const node of envelope.data.commands) visit(node);
  cachedSchema = nodes;
  return nodes;
}

function section(help: string, title: string): string[] {
  const lines = help.split("\n");
  const start = lines.indexOf(title);
  if (start === -1) return [];
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[A-Z][A-Z ]+$/.test(line)) break;
    body.push(line);
  }
  return body;
}

function words(command: string): string[] {
  const found: string[] = [];
  let current = "";
  let quote: string | null = null;
  let started = false;
  for (const char of command) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started) found.push(current);
      current = "";
      started = false;
      continue;
    }
    current += char;
    started = true;
  }
  if (started) found.push(current);
  return found;
}

const GLOBAL_LONGS = GLOBAL_FLAGS.map((flag) => flag.flags);

function flagTable(node: SchemaNode): Map<string, boolean> {
  const table = new Map<string, boolean>([["--help", false], ["-h", false]]);
  for (const flags of [...node.options.map((option) => option.flags), ...GLOBAL_LONGS]) {
    const takesValue = /[<[]/.test(flags);
    for (const part of flags.split(/[ ,]+/)) {
      if (part.startsWith("-")) table.set(part, takesValue);
    }
  }
  return table;
}

function invoke(example: string): { path: string; problems: string[] } {
  const tokens = words(example);
  while (tokens[0] && /^[A-Z_]+=/.test(tokens[0])) tokens.shift();
  const problems: string[] = [];
  if (tokens.shift() !== "cf") return { path: "", problems: [`${example} does not start with cf`] };
  const cut = tokens.findIndex((token) => token === ">" || token === "<" || token === "|");
  const argv = cut === -1 ? tokens : tokens.slice(0, cut);

  const nodes = schema();
  let path = "";
  while (argv.length > 0) {
    const candidate = path ? `${path} ${argv[0]}` : argv[0]!;
    if (!nodes.has(candidate)) break;
    path = candidate;
    argv.shift();
  }
  const node = nodes.get(path);
  if (!node) return { path, problems: [`${example} names no command`] };

  const flags = flagTable(node);
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token.startsWith("-")) {
      const name = token.split("=")[0]!;
      if (!flags.has(name)) problems.push(`${example}: ${path} has no flag ${name}`);
      else if (flags.get(name) && !token.includes("=")) index += 1;
      continue;
    }
    positionals.push(token);
  }
  const variadic = node.arguments.some((argument) => argument.variadic);
  const required = node.arguments.filter((argument) => argument.required).length;
  if (positionals.length < required) problems.push(`${example}: ${path} needs ${required} arguments`);
  if (!variadic && positionals.length > node.arguments.length) {
    problems.push(`${example}: ${path} takes at most ${node.arguments.length} arguments`);
  }
  return { path, problems };
}

test("the top-level help is grouped into sections the way gh does it", () => {
  const result = cf(["--help"]);
  assert.equal(result.status, 0);
  const titles = result.stdout.split("\n").filter((line) => /^[A-Z][A-Z ]+$/.test(line));
  assert.deepEqual(titles, [
    "USAGE",
    ...ROOT_SECTIONS.map((entry) => entry.title),
    "ALIAS COMMANDS",
    "FLAGS",
    "EXAMPLES",
    "LEARN MORE",
  ]);
  assert.deepEqual(section(result.stdout, "USAGE"), ["  cf <command> <subcommand> [flags]", ""]);
  assert.match(result.stdout, /https:\/\/cefense\.com\/docs/);
});

test("a bare cf prints the same help and exits 0", () => {
  const bare = cf([]);
  assert.equal(bare.status, 0);
  assert.equal(bare.stdout, cf(["--help"]).stdout);
});

test("every visible top-level command is listed exactly once in the root help", () => {
  const help = cf(["--help"]).stdout;
  const listed = ROOT_SECTIONS.flatMap((entry) =>
    section(help, entry.title)
      .map((line) => line.match(/^ {2}([a-z-]+):/)?.[1])
      .filter((name): name is string => Boolean(name)),
  );
  const topLevel = [...schema().keys()].filter((path) => !path.includes(" ") && !(path in LEGACY_NAMES));
  assert.deepEqual([...listed].sort(), [...topLevel].sort());
  assert.equal(new Set(listed).size, listed.length);
});

test("the root help lists every global flag once, and a subcommand only its own", () => {
  const root = section(cf(["--help"]).stdout, "FLAGS").join("\n");
  for (const flag of GLOBAL_FLAGS) assert.ok(root.includes(flag.flags), `${flag.flags} missing from cf --help`);

  const help = cf(["finding", "list", "--help"]).stdout;
  const own = section(help, "FLAGS").join("\n");
  assert.match(own, /--severity <list>/);
  for (const flag of GLOBAL_FLAGS) assert.ok(!own.includes(flag.flags), `${flag.flags} repeated under FLAGS`);

  const inherited = section(help, "INHERITED FLAGS");
  const rows = inherited.filter((line) => /^ {2}(-|\s{4}-)/.test(line));
  assert.ok(rows.length <= 5, "the inherited section should stay compact");
  assert.ok(inherited.join(" ").includes("--repo <owner/name>"));
  assert.ok(inherited.join(" ").includes("--no-pager"), "the rest are still named");
});

test("subcommand help has usage, flags, examples, and somewhere to learn more", () => {
  const result = cf(["triage", "--help"]);
  assert.equal(result.status, 0);
  for (const title of ["USAGE", "ARGUMENTS", "FLAGS", "INHERITED FLAGS", "EXAMPLES", "LEARN MORE"]) {
    assert.ok(result.stdout.split("\n").includes(title), `${title} missing`);
  }
  assert.deepEqual(section(result.stdout, "USAGE"), ["  cf triage <finding-id> <decision> [flags]", ""]);
  assert.match(result.stdout, /https:\/\/cefense\.com\/docs\/cli-triage/);
});

test("a bare command group prints its help on stdout and exits 0", () => {
  const result = cf(["finding"]);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.ok(result.stdout.includes("AVAILABLE COMMANDS"));
  assert.match(result.stdout, /^ {2}view: /m);
});

test("every command has between two and four examples", () => {
  for (const path of ["", ...schema().keys()]) {
    const runnable = (EXAMPLES[path] ?? []).filter((example) => !example.startsWith("#"));
    assert.ok(runnable.length >= 2 && runnable.length <= 4, `${path || "cf"} has ${runnable.length} examples`);
  }
});

test("every example runs a real command with flags it accepts", () => {
  const problems: string[] = [];
  for (const [key, examples] of Object.entries(EXAMPLES)) {
    assert.ok(key === "" || schema().has(key), `examples for ${key}, which is not a command`);
    let coversKey = key === "";
    for (const example of examples) {
      if (example.startsWith("#")) continue;
      const result = invoke(example);
      problems.push(...result.problems);
      if (result.path === key || result.path.startsWith(`${key} `)) coversKey = true;
    }
    assert.ok(coversKey, `no example for ${key} actually runs it`);
  }
  assert.deepEqual(problems, []);
});

test("every command's help renders, and none of it uses an en or em dash", () => {
  const dashes = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);
  const texts = [...Object.values(EXAMPLES).flat(), ...Object.values(DETAILS), cf(["--help"]).stdout];
  for (const path of schema().keys()) {
    const result = cf([...path.split(" "), "--help"]);
    assert.equal(result.status, 0, `cf ${path} --help failed: ${result.stderr}`);
    assert.ok(result.stdout.includes("\nUSAGE\n"), `cf ${path} --help has no usage`);
    texts.push(result.stdout);
  }
  for (const text of texts) assert.doesNotMatch(text, dashes);
});

test("the gh-style commands are the old ones under new names", () => {
  const nodes = schema();
  const shape = (path: string) => {
    const node = nodes.get(path);
    assert.ok(node, `${path} is missing`);
    return {
      arguments: node.arguments.map((argument) => [argument.name, argument.required, argument.variadic]),
      options: node.options.map((option) => option.flags),
    };
  };
  for (const [legacy, current] of Object.entries(LEGACY_NAMES)) {
    assert.deepEqual(shape(current), shape(legacy), `${current} drifted from ${legacy}`);
  }
  assert.ok(nodes.has("repo view"));
  assert.ok(nodes.has("browse"));
});

test("the old names stay out of the command lists but keep working", () => {
  const help = cf(["--help"]).stdout;
  const lists = ROOT_SECTIONS.flatMap((entry) => section(help, entry.title)).join("\n");
  for (const legacy of Object.keys(LEGACY_NAMES).filter((name) => !name.includes(" "))) {
    assert.doesNotMatch(lists, new RegExp(`^ {2}${legacy}:`, "m"));
    assert.match(section(help, "ALIAS COMMANDS").join("\n"), new RegExp(`^ {2}${legacy}:`, "m"));
  }
  const old = cf(["reproduced", "show", "--help"]);
  assert.equal(old.status, 0);
  assert.ok(section(old.stdout, "ALIASES").join("\n").includes("cf finding view"));
  const current = cf(["finding", "view", "--help"]);
  assert.ok(section(current.stdout, "ALIASES").join("\n").includes("cf reproduced show"));
  assert.ok(section(current.stdout, "ALIASES").join("\n").includes("cf finding show"));
});

test("an unknown command suggests the one that was meant", () => {
  const cases: Array<[string[], string]> = [
    [["reproducd"], "cf reproduced"],
    [["fnding"], "cf finding"],
    [["repo", "lst"], "cf repo list"],
    [["finding", "lst"], "cf finding list"],
    [["fix", "shw"], "cf fix show"],
    [["login"], "cf auth login"],
  ];
  for (const [args, expected] of cases) {
    const result = cf(args);
    assert.equal(result.status, 2, args.join(" "));
    assert.equal(result.stdout, "");
    assert.ok(result.stderr.includes(`Did you mean ${expected}`), `${args.join(" ")}: ${result.stderr}`);
  }
});

test("an unknown flag suggests the one that was meant", () => {
  const result = cf(["finding", "list", "--severty", "high"]);
  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes("Did you mean --severity?"), result.stderr);
});

test("a missing argument shows the usage line and one example", () => {
  const result = cf(["triage"]);
  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes("cf triage needs <finding-id> and <decision>."), result.stderr);
  assert.match(result.stderr, /Usage: +cf triage <finding-id> <decision> \[flags\]/);
  assert.match(result.stderr, /Example: +cf triage \S+ \S+/);
});

test("a usage failure under agent mode is one envelope on stdout", () => {
  const runs: Array<[string[], Record<string, string>]> = [
    [["reproducd", "--agent"], {}],
    [["reproducd"], { CEFENSE_AGENT: "1" }],
  ];
  for (const [args, env] of runs) {
    const result = cf(args, env);
    assert.equal(result.status, 2);
    assert.equal(result.stderr, "");
    const lines = result.stdout.trimEnd().split("\n");
    assert.equal(lines.length, 1);
    const envelope = JSON.parse(lines[0]!) as { ok: boolean; error: { code: string; exitCode: number; remedy: string } };
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, "usage_error");
    assert.equal(envelope.error.exitCode, 2);
    assert.match(envelope.error.remedy, /cf reproduced/);
  }
});

test("a failing argument parser exits 2 with an envelope, not 4", () => {
  const result = cf(["commits", "--limit", "0", "--agent"]);
  assert.equal(result.status, 2);
  const envelope = JSON.parse(result.stdout) as { command: string; error: { code: string } };
  assert.equal(envelope.command, "commits");
  assert.equal(envelope.error.code, "usage_error");
});

test("--version names the release and where it was published", () => {
  const result = cf(["--version"]);
  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /^cf version (\d+\.\d+\.\d+)\nhttps:\/\/www\.npmjs\.com\/package\/@cefense-npm\/cefense-cli\/v\/\1\n$/,
  );
  const agent = JSON.parse(cf(["--version", "--agent"]).stdout) as { ok: boolean; data: { version: string } };
  assert.equal(agent.ok, true);
  assert.match(agent.data.version, /^\d+\.\d+\.\d+$/);
});

test("help under agent mode is one envelope describing the command", () => {
  const result = cf(["finding", "view", "--help", "--agent"]);
  assert.equal(result.status, 0);
  const envelope = JSON.parse(result.stdout) as {
    command: string;
    data: { path: string; usage: string[]; examples: string[] };
  };
  assert.equal(envelope.command, "help");
  assert.equal(envelope.data.path, "finding view");
  assert.deepEqual(envelope.data.usage, ["cf finding view <finding-id> [flags]"]);
  assert.ok(envelope.data.examples.length > 0);
});

test("the agent schema carries the new commands and still leaves global flags out", () => {
  const nodes = schema();
  for (const path of ["finding", "finding list", "finding view", "finding matched", "repo view", "browse"]) {
    assert.ok(nodes.has(path), `${path} missing from cf agent schema`);
  }
  for (const path of ["reproduced", "reproduced show", "matched"]) assert.ok(nodes.has(path), `${path} was dropped`);
  for (const node of nodes.values()) {
    for (const option of node.options) {
      assert.ok(!GLOBAL_LONGS.includes(option.flags), `${node.path} lists the global ${option.flags}`);
    }
  }
});

test("completion offers the new commands and keeps the old ones reachable", () => {
  const result = cf(["completion", "bash"]);
  assert.equal(result.status, 0);
  const root = result.stdout.match(/^ {4}""\) __cf_words="([^"]*)"/m)?.[1]?.split(" ") ?? [];
  assert.ok(root.includes("finding") && root.includes("browse"));
  assert.ok(!root.includes("reproduced"), "hidden names are not offered");
  for (const arm of ["finding view", "repo view", "reproduced show"]) {
    assert.ok(result.stdout.includes(`"${arm}")`), `no completion arm for ${arm}`);
  }
});

test("suggestions prefer close spellings and prefixes", () => {
  assert.deepEqual(suggest("reproducd", ["repo", "reproduced", "status"]), ["reproduced"]);
  assert.deepEqual(suggest("rep", ["repo", "reproduced", "status"]), ["repo", "reproduced"]);
  assert.deepEqual(suggest("--severty", ["--severity", "--scan"]), ["--severity"]);
  assert.deepEqual(suggest("zzz", ["repo", "status"]), []);
});

test("browse addresses findings the way the workspace reads them", () => {
  assert.equal(workspaceUrl("https://cefense.com/"), "https://cefense.com/app/feed");
  assert.equal(
    workspaceUrl("https://cefense.com", { org: "acme", finding: "1885c309-f992-4483-a2b2-48f35221449c" }),
    "https://cefense.com/app/acme/feed/reproduced/1885c309",
  );
});
