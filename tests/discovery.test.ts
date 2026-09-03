import { strict as assert } from "node:assert";
import { test } from "node:test";
import { compareVersions } from "../src/core/discovery.js";

test("compareVersions orders releases correctly", () => {
  assert.equal(compareVersions("0.1.0", "0.1.0"), 0);
  assert.equal(compareVersions("0.2.0", "0.1.9"), 1);
  assert.equal(compareVersions("0.1.0", "0.2.0"), -1);
  assert.equal(compareVersions("1.0.0", "0.99.99"), 1);
  assert.equal(compareVersions("0.1.0-beta.1", "0.1.0"), 0);
  assert.equal(compareVersions("1.2", "1.2.0"), 0);
});
