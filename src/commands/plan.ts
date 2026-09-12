import { openSession, type GlobalOptions } from "../core/session.js";
import { UsageError } from "../core/errors.js";
import { resolveOrganization } from "../core/organizations.js";
import { prune } from "../core/compact.js";
import type {
  BillingInterval,
  BillingPlan,
  BillingResponse,
  BillingStatus,
  PaidBillingPlan,
  PlanDefinition,
} from "../core/types.js";
import * as out from "../ui/output.js";
import { keyValue } from "../ui/table.js";
import { nextSteps } from "../ui/list.js";
import { absoluteDate, progressBar, relativeTime } from "../ui/format.js";
import { c, glyph } from "../ui/theme.js";
import { isAgentMode } from "../ui/mode.js";
import { openIfRequested } from "../ui/open.js";

/**
 * The billing vocabulary, hand-copied from packages/schemas/src/billing.ts.
 *
 * The CLI is published standalone and cannot import @cefense/schemas, so these
 * are copies and copies drift. tests/contract.test.ts reads the real lists off
 * disk and fails when they diverge, which is the only thing keeping them true.
 */
export const BILLING_PLANS: readonly BillingPlan[] = ["free", "plus", "pro", "max"];

export const PAID_BILLING_PLANS: readonly PaidBillingPlan[] = ["plus", "pro", "max"];

export const BILLING_INTERVALS: readonly BillingInterval[] = ["month", "year"];

export const BILLING_STATUSES: readonly BillingStatus[] = [
  "none",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
];

const MAX_EXTRA_SEATS = 500;

export function parsePaidPlan(value: string): PaidBillingPlan {
  const wanted = value.trim().toLowerCase();
  const match = PAID_BILLING_PLANS.find((entry) => entry === wanted);
  if (!match) {
    throw new UsageError(
      `${value} is not a plan you can buy.`,
      `Use ${PAID_BILLING_PLANS.join(", ")}. free is what an organization falls back to, not something to buy.`,
      "invalid_plan",
    );
  }
  return match;
}

/**
 * Validated in the handler rather than as a commander option parser, because a
 * parser throws before the action runs, which is before agent mode has been
 * set. That path writes a rendered line to stderr and no envelope at all.
 */
export function parseSeats(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_EXTRA_SEATS) {
    throw new UsageError(
      `--seats must be a whole number between 0 and ${MAX_EXTRA_SEATS}.`,
      "It counts seats beyond the ones the plan already includes, so 0 is the plan on its own.",
      "invalid_seats",
    );
  }
  return parsed;
}

/** Mirrors formatTokens in packages/schemas/src/billing.ts. */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    const rounded = millions >= 10 ? Math.round(millions) : Math.round(millions * 10) / 10;
    return `${rounded}M`;
  }
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

function statusLabel(status: BillingStatus): string {
  if (status === "none") return "no subscription";
  return status.replace(/_/g, " ");
}

function intervalLabel(interval: BillingInterval): string {
  return interval === "year" ? "yearly" : "monthly";
}

function statusTint(billing: BillingResponse): (value: string) => string {
  const { status } = billing.subscription;
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return c.yellow;
  if (billing.usage.exhausted) return c.red;
  if (billing.subscription.entitled) return c.green;
  return c.dim;
}

function definitionOf(billing: BillingResponse, plan: BillingPlan): PlanDefinition | null {
  return billing.catalogue.plans.find((entry) => entry.id === plan) ?? null;
}

/** The next plan up, so `next` names a plan that exists rather than a template. */
function planAbove(plan: BillingPlan): PaidBillingPlan | null {
  const at = BILLING_PLANS.indexOf(plan);
  const above = at >= 0 ? BILLING_PLANS[at + 1] : null;
  if (!above || above === "free") return null;
  return above as PaidBillingPlan;
}

function percentUsed(tokens: number, allowance: number): number {
  if (allowance <= 0) return tokens > 0 ? 100 : 0;
  return Math.min(100, Math.round((tokens / allowance) * 100));
}

/**
 * An organization with an internal unlimited grant has no allowance at all.
 * The API holds it as Infinity, which JSON renders as null, so null here means
 * unlimited rather than unknown.
 */
function isUnlimited(billing: BillingResponse): boolean {
  return billing.usage.allowance === null;
}

function compactPlan(entry: PlanDefinition, current: BillingPlan): Record<string, unknown> {
  return prune({
    id: entry.id,
    name: entry.name,
    tagline: entry.tagline,
    monthlyPriceCents: entry.price.month,
    yearlyPriceCents: entry.price.year,
    monthlyTokens: entry.monthlyTokens,
    grantIsOneTime: entry.grantIsOneTime || null,
    seatsIncluded: entry.seatsIncluded,
    repositories: entry.repositories,
    repositoriesUnlimited: entry.repositories === null ? true : null,
    maxDepthRuns: entry.maxDepthRuns,
    maxDepthUnlimited: entry.maxDepthRuns === null ? true : null,
    current: entry.id === current ? true : null,
  });
}

function planPayload(billing: BillingResponse, organization: string | null): Record<string, unknown> {
  const { subscription, usage } = billing;
  const definition = definitionOf(billing, subscription.plan);
  const unlimited = isUnlimited(billing);

  return prune({
    organization,
    plan: subscription.plan,
    planName: definition?.name ?? subscription.plan,
    status: subscription.status,
    entitled: subscription.entitled,
    interval: subscription.interval,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd || null,
    seats: subscription.seats,
    seatsIncluded: definition?.seatsIncluded ?? subscription.seats,
    extraSeats: subscription.extraSeats,
    repositories: definition?.repositories ?? null,
    repositoriesUnlimited: definition && definition.repositories === null ? true : null,
    maxDepthRuns: definition?.maxDepthRuns ?? null,
    maxDepthUnlimited: definition && definition.maxDepthRuns === null ? true : null,
    renewsAt: subscription.cancelAtPeriodEnd ? null : subscription.currentPeriodEnd,
    endsAt: subscription.cancelAtPeriodEnd ? subscription.currentPeriodEnd : null,
    usage: prune({
      tokens: usage.tokens,
      allowance: usage.allowance,
      remaining: usage.remaining,
      unlimited: unlimited || null,
      percentUsed: unlimited ? null : percentUsed(usage.tokens, usage.allowance ?? 0),
      exhausted: usage.exhausted,
      overTokens: usage.overTokens,
      scans: usage.scans,
      periodStart: usage.periodStart,
      periodEnd: usage.periodEnd,
    }),
    billingConfigured: billing.configured,
    canAdministerBilling: billing.canAdminister,
    hasBillingAccount: subscription.hasCustomer || null,
    catalogue: billing.catalogue.plans.map((entry) => compactPlan(entry, subscription.plan)),
    annualDiscountPercent: billing.catalogue.annualDiscountPercent,
    seatPriceCents: billing.catalogue.seatPriceCents,
    tokensPerExtraSeat: billing.catalogue.tokensPerExtraSeat,
  });
}

function planNext(billing: BillingResponse): string[] {
  const steps: string[] = [];
  const above = planAbove(billing.subscription.plan);
  if (above && billing.canAdminister && billing.configured) {
    steps.push(`cf plan upgrade ${above} --agent`);
  }
  if (billing.subscription.hasCustomer && billing.canAdminister && billing.configured) {
    steps.push("cf plan portal --agent");
  }
  if (steps.length === 0) steps.push("cf status --agent");
  return steps;
}

function usageLine(billing: BillingResponse): string {
  const { usage } = billing;
  if (isUnlimited(billing)) return `${formatTokens(usage.tokens)} used, no allowance applied`;
  const allowance = usage.allowance ?? 0;
  const percent = percentUsed(usage.tokens, allowance);
  const tint = usage.exhausted ? c.red : percent >= 80 ? c.yellow : (value: string) => value;
  return tint(`${formatTokens(usage.tokens)} of ${formatTokens(allowance)}   ${percent}%`);
}

function seatsLine(billing: BillingResponse): string {
  const { subscription } = billing;
  const included = definitionOf(billing, subscription.plan)?.seatsIncluded ?? subscription.seats;
  const extra = subscription.extraSeats;
  return `${subscription.seats}   ${c.dim(
    extra > 0 ? `${included} included, ${extra} extra` : `${included} included`,
  )}`;
}

/** relativeTime only looks backwards, and a renewal is always ahead. */
function untilLabel(value: string): string {
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (!Number.isFinite(days)) return "";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 45) return `in ${days} days`;
  const months = Math.round(days / 30);
  return months < 12 ? `in ${months} months` : `in ${Math.round(months / 12)} years`;
}

function renewalRow(billing: BillingResponse): [string, string] {
  const { subscription } = billing;
  const definition = definitionOf(billing, subscription.plan);

  if (subscription.currentPeriodEnd) {
    const when = `${absoluteDate(subscription.currentPeriodEnd)}   ${c.dim(
      untilLabel(subscription.currentPeriodEnd),
    )}`;
    return [subscription.cancelAtPeriodEnd ? "ends" : "renews", when];
  }
  if (definition?.grantIsOneTime) {
    return [
      "grant",
      c.dim(`one-time, ${definition.grantExpiryDays} days from when it was issued, it does not renew`),
    ];
  }
  return ["renews", c.dim("nothing is being billed, so there is no renewal")];
}

function periodRow(billing: BillingResponse): [string, string] {
  const { usage } = billing;
  return [
    "period",
    usage.periodEnd
      ? `${absoluteDate(usage.periodStart)} to ${absoluteDate(usage.periodEnd)}`
      : `since ${absoluteDate(usage.periodStart)}   ${c.dim(relativeTime(usage.periodStart))}`,
  ];
}

function printPlan(billing: BillingResponse, organization: string | null): void {
  const { subscription, usage } = billing;
  const definition = definitionOf(billing, subscription.plan);
  const tint = statusTint(billing);

  out.line();
  out.line(
    `  ${c.bold(definition?.name ?? subscription.plan)}   ${tint(
      `${glyph.dot} ${statusLabel(subscription.status)}`,
    )}${subscription.entitled ? c.dim(`, billed ${intervalLabel(subscription.interval)}`) : ""}${
      organization ? c.dim(`   ${organization}`) : ""
    }`,
  );
  if (definition?.tagline) out.line(`  ${c.dim(definition.tagline)}`);
  out.line();

  const rows: Array<[string, string]> = [
    ["seats", seatsLine(billing)],
    ["tokens", usageLine(billing)],
    ["scans", String(usage.scans)],
    periodRow(billing),
    renewalRow(billing),
  ];
  if (definition) {
    rows.splice(1, 0, [
      "repositories",
      definition.repositories === null ? "unlimited" : String(definition.repositories),
    ]);
    rows.push([
      "max depth",
      definition.maxDepthRuns === null
        ? "unlimited"
        : definition.maxDepthRuns === 0
          ? c.dim("not included")
          : `${definition.maxDepthRuns} scans a month`,
    ]);
  }
  out.lines(keyValue(rows).map((row) => `  ${row}`));

  if (!isUnlimited(billing)) {
    const allowance = usage.allowance ?? 0;
    const percent = percentUsed(usage.tokens, allowance);
    const bar = progressBar(Math.min(usage.tokens, allowance), Math.max(allowance, 1), 32);
    const tone = usage.exhausted ? c.red : percent >= 80 ? c.yellow : c.cyan;
    out.line();
    out.line(
      `  ${tone(bar)}   ${c.dim(
        `${formatTokens(Math.max(0, usage.remaining ?? 0))} left`,
      )}`,
    );
  }

  if (usage.exhausted) {
    out.line();
    out.warn(
      subscription.plan === "free"
        ? "The free grant is spent. Scans are paused until you choose a plan."
        : "The allowance for this period is spent. Scans are paused until it resets or the plan changes.",
    );
  }
  if (subscription.cancelAtPeriodEnd) {
    out.line();
    out.warn("This subscription is set to end and will not renew.");
  }
  if (!billing.configured) {
    out.line();
    out.warn("Billing is not configured on this deployment, so nothing can be bought here.");
  }

  const steps: Array<{ command: string; purpose: string }> = [];
  const above = planAbove(subscription.plan);
  if (above && billing.configured) {
    steps.push({ command: `cf plan upgrade ${above}`, purpose: "move up a plan" });
  }
  if (subscription.hasCustomer && billing.configured) {
    steps.push({ command: "cf plan portal", purpose: "invoices, payment method, cancel" });
  }
  if (!billing.canAdminister && steps.length > 0) {
    out.line();
    out.hint("Only an owner or admin of this organization can change what it pays.");
  }
  nextSteps(steps);
  out.line();
}

export async function planShow(globals: GlobalOptions): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const billing = await session.client.billing();
  const organization = resolveOrganization(session.apiUrl)?.slug ?? null;

  if (isAgentMode()) {
    out.agentEmit(planPayload(billing, organization), planNext(billing));
    return 0;
  }
  if (out.isJsonMode()) {
    out.json(billing);
    return 0;
  }

  // The plan panel lives inside the workspace rather than at an address of its
  // own, so --web opens the workspace, which is the nearest true thing.
  const workspace = `${(session.config?.webUrl ?? session.apiUrl).replace(/\/+$/, "")}/app`;
  if (await openIfRequested(globals.web, workspace, { what: "the plan" })) return 0;

  printPlan(billing, organization);
  return 0;
}

/**
 * Starts a checkout and hands back the URL that completes it.
 *
 * Nothing is bought here, which is why there is no --yes gate: the API creates
 * a session and only the webhook that fires on the payment grants the plan. A
 * browser is never opened under --agent, because the person who has to type a
 * card number is not the one running the command.
 */
export async function planUpgrade(
  globals: GlobalOptions,
  name: string | undefined,
  options: { yearly?: boolean; seats?: string } = {},
): Promise<number> {
  if (!name) {
    throw new UsageError(
      "Name the plan to move to.",
      `Use ${PAID_BILLING_PLANS.join(", ")}. Run cf plan to see what you are on now.`,
      "invalid_plan",
    );
  }
  const plan = parsePaidPlan(name);
  const interval: BillingInterval = options.yearly ? "year" : "month";
  const extraSeats = options.seats === undefined ? 0 : parseSeats(options.seats);

  const session = await openSession(globals, { auth: true });
  const billing = await session.client.billing();

  // Checkout opens a subscription. Running it for the plan already being paid
  // for would open a second one alongside the first and bill for both, which
  // is why the workspace disables the button on the current plan rather than
  // sending a subscriber back through checkout.
  if (billing.subscription.entitled && billing.subscription.plan === plan) {
    throw new UsageError(
      `This organization is already on ${definitionOf(billing, plan)?.name ?? plan}.`,
      billing.subscription.hasCustomer
        ? "Run cf plan portal to change seats, the payment method, or to cancel. Checking out again would open a second subscription."
        : "Run cf plan to see the current state.",
    );
  }

  const definition = definitionOf(billing, plan);
  const { url } = await session.client.startBillingCheckout({ plan, interval, extraSeats });

  const seatsIncluded = definition?.seatsIncluded ?? 0;
  const note =
    "Nothing has been bought. A person has to open this URL in a browser and complete the payment, and the plan changes only once that payment clears.";

  if (isAgentMode()) {
    out.agentEmit(
      prune({
        plan,
        planName: definition?.name ?? plan,
        interval,
        extraSeats,
        seatsIncluded,
        seats: seatsIncluded + extraSeats,
        planPriceCents: definition?.price[interval] ?? null,
        seatPriceCents: extraSeats > 0 ? billing.catalogue.seatPriceCents[interval] : null,
        tokensPerExtraSeat: extraSeats > 0 ? billing.catalogue.tokensPerExtraSeat : null,
        checkoutUrl: url,
        requiresHuman: true,
        note,
      }),
      ["cf plan --agent"],
    );
    return 0;
  }
  if (out.isJsonMode()) {
    out.json({ plan, interval, extraSeats, checkoutUrl: url });
    return 0;
  }

  out.line();
  out.info(
    `Checkout for ${c.bold(definition?.name ?? plan)}, billed ${intervalLabel(interval)}${
      extraSeats > 0 ? `, with ${extraSeats} extra ${extraSeats === 1 ? "seat" : "seats"}` : ""
    }.`,
  );
  out.line();
  out.line(`    ${c.cyan(url)}`);
  out.line();
  out.hint(note);
  await openIfRequested(globals.web, url, { what: "checkout" });
  nextSteps([{ command: "cf plan", purpose: "check the plan once the payment clears" }]);
  out.line();
  return 0;
}

/**
 * The Stripe billing portal, where invoices, the payment method, seat changes
 * and cancellation live. Rebuilding any of that here would mean rebuilding
 * proration, tax and dunning, so the CLI hands over the URL and stops.
 */
export async function planPortal(globals: GlobalOptions): Promise<number> {
  const session = await openSession(globals, { auth: true });
  const { url } = await session.client.billingPortal();

  const note =
    "The portal is a signed link to this organization's billing account. Give it to the user; it expires and only they can act on it.";

  if (isAgentMode()) {
    out.agentEmit({ portalUrl: url, requiresHuman: true, note }, ["cf plan --agent"]);
    return 0;
  }
  if (out.isJsonMode()) {
    out.json({ portalUrl: url });
    return 0;
  }

  out.line();
  out.info("Invoices, payment method, seats, and cancellation:");
  out.line();
  out.line(`    ${c.cyan(url)}`);
  await openIfRequested(globals.web, url, { what: "the billing portal" });
  nextSteps([{ command: "cf plan", purpose: "read the plan and the meter" }]);
  out.line();
  return 0;
}
