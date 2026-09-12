import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  BILLING_PLANS,
  PAID_BILLING_PLANS,
  formatTokens,
  parsePaidPlan,
  parseSeats,
} from "../src/commands/plan.js";
import { UsageError } from "../src/core/errors.js";

test("parsePaidPlan accepts the plans that can actually be bought", () => {
  for (const plan of PAID_BILLING_PLANS) assert.equal(parsePaidPlan(plan), plan);
  assert.equal(parsePaidPlan(" PRO "), "pro");
});

test("parsePaidPlan refuses free, which is what an organization falls back to", () => {
  assert.throws(() => parsePaidPlan("free"), UsageError);
  assert.throws(() => parsePaidPlan("enterprise"), UsageError);
});

test("the plan order is ascending, because next names the plan above the current one", () => {
  assert.deepEqual([...BILLING_PLANS], ["free", "plus", "pro", "max"]);
});

test("parseSeats counts seats beyond the plan, and zero is a real answer", () => {
  assert.equal(parseSeats("0"), 0);
  assert.equal(parseSeats("7"), 7);
  assert.equal(parseSeats("500"), 500);
});

test("parseSeats refuses a seat count the API would reject anyway", () => {
  assert.throws(() => parseSeats("-1"), UsageError);
  assert.throws(() => parseSeats("501"), UsageError);
  assert.throws(() => parseSeats("many"), UsageError);
});

test("formatTokens matches the workspace's own rounding", () => {
  assert.equal(formatTokens(5_000_000), "5M");
  assert.equal(formatTokens(8_400_000), "8.4M");
  assert.equal(formatTokens(31_000_000), "31M");
  assert.equal(formatTokens(12_000), "12k");
  assert.equal(formatTokens(940), "940");
});
