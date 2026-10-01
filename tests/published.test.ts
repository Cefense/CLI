import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLACEHOLDER = /REPLACE_WITH|TODO_[A-Z_]+|<placeholder>/;

function withoutComments(markdown: string): string {
  return markdown.replace(/<!--[\s\S]*?-->/g, "");
}

test("the published README carries no placeholder a reader would see", () => {
  const readme = withoutComments(readFileSync(join(root, "README.md"), "utf8"));
  const hit = readme.split("\n").find((line) => PLACEHOLDER.test(line));
  assert.equal(hit, undefined);
});

test("the bundled skill carries no placeholder either", () => {
  const skill = withoutComments(readFileSync(join(root, "skills", "cefense", "SKILL.md"), "utf8"));
  const hit = skill.split("\n").find((line) => PLACEHOLDER.test(line));
  assert.equal(hit, undefined);
});
