import { strict as assert } from "node:assert";
import { test } from "node:test";
import { allowanceMessage, allowanceNotice, assertScanAllowance } from "../src/core/allowance.js";
import type { CefenseClient } from "../src/core/client.js";
import { CefenseError } from "../src/core/errors.js";
import type { BillingResponse } from "../src/core/types.js";

function billing(plan: string, usage: Partial<BillingResponse["usage"]>): BillingResponse {
  return {
    subscription: { plan },
    usage: {
      unlimited: false,
      percentUsed: 10,
      exhausted: false,
      scans: 3,
      periodStart: "2026-10-01T00:00:00.000Z",
      periodEnd: "2026-11-01T00:00:00.000Z",
      ...usage,
    },
  } as unknown as BillingResponse;
}

function clientWith(response: BillingResponse | Error): CefenseClient {
  return {
    billing: () => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)),
  } as unknown as CefenseClient;
}

test("a meter under the warning line says nothing", () => {
  assert.equal(allowanceNotice(billing("pro", { percentUsed: 79 })), null);
});

test("an unlimited organization never warns", () => {
  assert.equal(allowanceNotice(billing("pro", { unlimited: true, percentUsed: null, exhausted: true })), null);
});

test("eighty percent warns with the reset date", () => {
  const notice = allowanceNotice(billing("pro", { percentUsed: 85 }));
  assert.equal(notice?.state, "low");
  assert.match(allowanceMessage(notice!), /85% of this period's scan allowance is used/);
  assert.match(allowanceMessage(notice!), /It resets on 2026-11-01 \(UTC\)/);
});

test("an exhausted paid plan says when scanning resumes", () => {
  const notice = allowanceNotice(billing("pro", { percentUsed: 100, exhausted: true }));
  assert.equal(notice?.state, "exhausted");
  assert.match(allowanceMessage(notice!), /Scanning resumes on 2026-11-01 \(UTC\)/);
});

test("an exhausted free grant says it does not renew", () => {
  const notice = allowanceNotice(billing("free", { percentUsed: 100, exhausted: true, periodEnd: null }));
  assert.equal(notice?.resetsAt, null);
  assert.match(allowanceMessage(notice!), /does not renew/);
});

test("an exhausted allowance refuses before a scan is requested", async () => {
  await assert.rejects(
    assertScanAllowance(clientWith(billing("pro", { percentUsed: 100, exhausted: true }))),
    (error: unknown) => error instanceof CefenseError && error.code === "allowance_exhausted",
  );
});

test("a billing read that fails does not block the scan", async () => {
  assert.equal(await assertScanAllowance(clientWith(new Error("down"))), null);
});
