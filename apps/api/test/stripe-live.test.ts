/**
 * REAL-STRIPE billing suite — the only tests in this repo that leave the machine.
 *
 * Everything else that touches Stripe (`api.test.ts`, `stripe-lanes.test.ts`,
 * `trial-lifecycle.test.ts`, `plan-catalog.test.ts`) feeds our handlers SYNTHETIC
 * payloads that we wrote ourselves. That proves the handlers are internally
 * consistent and proves NOTHING about whether the payload shapes we invented are
 * the ones Stripe sends. Two production bugs came out of exactly that gap:
 *
 *   1. a trial granted the plan and its whole monthly credit grant before any
 *      card existed, because `customer.subscription.created` arrives `trialing`
 *      immediately (and a $0 `invoice.paid` arrives with it);
 *   2. `confirmSetup` was called with both `elements` and `clientSecret`, which
 *      Stripe.js rejects — the trial signup died with "check your connection".
 *
 * So this suite drives real Stripe test mode, captures what it really returns and
 * really emits, and asserts our code's expectations against that. Where a real
 * payload can be replayed through our own `/api/stripe/webhook`, it is — an
 * UNMODIFIED Stripe event body, signed with the documented scheme, against the
 * real handler and real D1. That is the part the synthetic suite structurally
 * cannot do.
 *
 * ── Running it ─────────────────────────────────────────────────────────────
 *   export STRIPE_TEST_SECRET_KEY=sk_test_…        # never commit this
 *   pnpm --filter @kova/app build                 # Miniflare needs apps/app/dist
 *   pnpm --filter @kova/api exec vitest run test/stripe-live.test.ts
 *
 * With the variable unset — CI, an offline checkout, a normal `pnpm test` — every
 * describe below SKIPS. `vitest.config.ts` threads the binding from the shell and
 * defaults it to "", so a key sitting in `.dev.vars` is NOT enough to switch the
 * suite on; you have to export it for that run.
 *
 * A key that is not `sk_test_` FAILS the suite instead of skipping it (see the
 * first describe). No key value is logged, asserted on, or written to a file.
 *
 * ── What is deliberately NOT proven here ───────────────────────────────────
 *   • Stripe.js / Payment Element (`confirmSetup`, `confirmPayment`) — browser
 *     only. Bug 2 lives there and is E2E/manual territory; what this suite
 *     covers is the SERVER half: which client secret each mode must hand out.
 *   • A webhook signature Stripe itself produced — needs an inbound public URL
 *     or the Stripe CLI, neither of which exists here. Signatures below are
 *     CONSTRUCTED per Stripe's documented scheme over real event bodies; see
 *     `signWebhook`.
 *   • Full Connect onboarding — see the Connect describe for exactly where it
 *     stops and why (this sandbox's platform country blocks it).
 *
 * ⚠️ `@cloudflare/vitest-pool-workers` runs with `isolatedStorage` ON, so every
 * D1 / DO write is ROLLED BACK after each `it`. Any webhook-replay test that
 * needs a prior event's effect must replay that event itself. Suite-level
 * fixtures belong in `beforeAll`, which survives for the describe.
 */

import { env, SELF } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveEntitlements, trialPeriodDays } from "@kova/domain";
import { ensureSchema } from "../src/db.js";
import { seedBilling, setConfig } from "../src/billing-store.js";
import { STRIPE_API_VERSION, stripeCall, syncCatalog, verifyWebhook } from "../src/stripe.js";
import {
  HAS_KEY,
  IS_TEST_KEY,
  LIVE_KEY,
  PINNED_VERSION,
  WRONG_LANE_KEY,
  advanceClock,
  chronological,
  cleanupJunk,
  listEvents,
  must,
  pollFor,
  rawStripe,
  signWebhook,
  sleep,
  testCardPm,
  trackJunk,
  waitForEvent,
  type StripeEvent,
} from "./stripe-live-helpers.js";

const ORIGIN = "http://setup.localhost:8787";
/** Signing secret for the CONSTRUCTED webhook signatures. Not a Stripe value. */
const WEBHOOK_SECRET = "whsec_stripe_live_suite_local_only";

if (!HAS_KEY) {
  console.log("[stripe-live] SKIPPED — STRIPE_TEST_SECRET_KEY is not set in the environment; no Stripe calls were made.");
}

// ── Lane guard: always runs, key or not ─────────────────────────────────────
describe("stripe live suite — credential lane guard", () => {
  it("never runs against anything but a test-mode secret key", () => {
    // Present-but-live is a hard failure, not a skip: a test suite creating
    // subscriptions, charges, refunds and disputes must never touch live money.
    expect(WRONG_LANE_KEY, "STRIPE_TEST_SECRET_KEY is set but is not an sk_test_ key — refusing to run").toBe(false);
    if (IS_TEST_KEY) expect(LIVE_KEY.startsWith("sk_test_")).toBe(true);
  });
});

// Shared across the live describes (filled by the first beforeAll).
let accountDefaultVersion: string | null = null;
/** Stripe price ids created by our own `syncCatalog` for these plan/pack rows. */
interface CatalogEntry {
  product: string;
  price: string;
  minorUnits: number;
}
const catalog: Record<string, CatalogEntry | undefined> = {};
/** Throwing accessor — a missing row here means `syncCatalog` failed, which is a
 *  finding, not something the rest of a test should paper over with `?.`. */
const cat = (id: string): CatalogEntry => {
  const e = catalog[id];
  if (!e) throw new Error(`catalog row ${id} has no synced Stripe ids`);
  return e;
};

/** What `syncCatalog` reported. -1 = the fixture never ran. */
let syncResult: { plans: number; packs: number } = { plans: -1, packs: -1 };

describe.skipIf(!IS_TEST_KEY)("real Stripe", () => {
  // The catalog sync lives in the TOP-LEVEL fixture, not in the describe that
  // asserts on it: every later describe needs a real `price_…` to subscribe to,
  // and a per-describe hook would not run under `vitest -t <filter>` — which
  // silently left `catalog` empty and made filtered runs fail on a missing id.
  beforeAll(async () => {
    await ensureSchema(env.DB);
    await seedBilling(env.DB);
    const probe = await rawStripe("account", { version: null });
    accountDefaultVersion = probe.servedVersion;
    expect(probe.status).toBe(200);

    // Our own function, against real Stripe, writing the ids back into real D1.
    syncResult = await syncCatalog(env.DB, LIVE_KEY);
    const rows = [
      ...((await env.DB.prepare("SELECT id, price_usd_month AS usd, stripe_product_id, stripe_price_id FROM plans WHERE active = 1 AND price_usd_month > 0").all<{
        id: string;
        usd: number;
        stripe_product_id: string | null;
        stripe_price_id: string | null;
      }>()).results ?? []),
      ...((await env.DB.prepare("SELECT id, price_usd AS usd, stripe_product_id, stripe_price_id FROM credit_packs WHERE active = 1").all<{
        id: string;
        usd: number;
        stripe_product_id: string | null;
        stripe_price_id: string | null;
      }>()).results ?? []),
    ];
    for (const r of rows) {
      if (!r.stripe_product_id || !r.stripe_price_id) continue;
      catalog[r.id] = { product: r.stripe_product_id, price: r.stripe_price_id, minorUnits: Math.round(r.usd * 100) };
      trackJunk({ kind: "price", id: r.stripe_price_id });
      trackJunk({ kind: "product", id: r.stripe_product_id });
    }
  }, 300_000);

  afterAll(async () => {
    const failures = await cleanupJunk();
    if (failures.length) console.log("[stripe-live] cleanup left behind:", failures.join(" | "));
  }, 180_000);

  // ══ 1. API version: the pin vs the account default ════════════════════════
  describe("API version", () => {
    it("reports the pin, the account default, and the drift between them", async () => {
      const pinned = await rawStripe("account", { version: PINNED_VERSION });
      expect(pinned.status, "the pinned version must still be accepted by Stripe").toBe(200);
      expect(pinned.servedVersion).toBe(PINNED_VERSION);

      // `stripe.ts` pins this; the account defaults to something else entirely.
      expect(STRIPE_API_VERSION).toBe("2025-02-24.acacia");
      expect(accountDefaultVersion).toBeTruthy();
      console.log(`[stripe-live] API version — pin=${PINNED_VERSION} accountDefault=${accountDefaultVersion}`);
      // Recorded as an observation, not enforced: the pin is intentional. What
      // matters is that the two differ, because webhook payloads follow the
      // ACCOUNT (or endpoint) version, not the pin — see the drift describe.
      expect(accountDefaultVersion).not.toBe(PINNED_VERSION);
    }, 60_000);
  });

  // ══ 2. Catalog sync ═══════════════════════════════════════════════════════
  describe("syncCatalog", () => {
    it("creates a product + monthly price per active priced plan", async () => {
      expect(syncResult.plans).toBe(4); // solo, light, pro, max — the retired tiers are active = 0
      for (const id of ["solo", "light", "pro", "max"]) {
        expect(catalog[id], `plan ${id} was not synced`).toBeTruthy();
        expect(cat(id).price).toMatch(/^price_/);
        expect(cat(id).product).toMatch(/^prod_/);
      }
    }, 30_000);

    it("prices the plans in Stripe at exactly what the plan rows claim, in minor units", async () => {
      // The published prices. If a plan row and Stripe ever disagree, the tenant
      // is charged the Stripe number and shown the D1 one.
      const expected: Record<string, number> = { solo: 499, light: 2499, pro: 4999, max: 11999 };
      for (const [planId, minor] of Object.entries(expected)) {
        const row = cat(planId);
        expect(row.minorUnits, `plans.price_usd_month for ${planId}`).toBe(minor);
        const price = await must<{ unit_amount: number; currency: string; recurring?: { interval?: string }; active: boolean; product: string }>(`prices/${row.price}`);
        expect(price.unit_amount, `Stripe unit_amount for ${planId}`).toBe(minor);
        expect(price.currency).toBe("usd");
        expect(price.recurring?.interval).toBe("month");
        expect(price.active).toBe(true);
        expect(price.product).toBe(row.product);
        const product = await must<{ name: string; metadata?: Record<string, string> }>(`products/${row.product}`);
        expect(product.metadata?.kova_plan).toBe(planId);
      }
    }, 120_000);

    it("creates one-time (non-recurring) prices for the credit packs at the pack price", async () => {
      expect(syncResult.packs).toBe(4);
      const expected: Record<string, number> = { pack_1k: 100, pack_5k: 500, pack_25k: 2500, pack_100k: 10_000 };
      for (const [packId, minor] of Object.entries(expected)) {
        expect(catalog[packId], `pack ${packId} was not synced`).toBeTruthy();
        const row = cat(packId);
        expect(row.minorUnits).toBe(minor);
        const price = await must<{ unit_amount: number; currency: string; recurring: unknown; type: string }>(`prices/${row.price}`);
        expect(price.unit_amount).toBe(minor);
        expect(price.currency).toBe("usd");
        expect(price.recurring, "a credit pack must not be a recurring price").toBeNull();
        expect(price.type).toBe("one_time");
        const product = await must<{ metadata?: Record<string, string> }>(`products/${row.product}`);
        expect(product.metadata?.kova_pack).toBe(packId);
      }
    }, 120_000);

    it("is idempotent — a second sync creates nothing (rows carry ids now)", async () => {
      const again = await syncCatalog(env.DB, LIVE_KEY);
      expect(again).toEqual({ plans: 0, packs: 0 });
    }, 60_000);
  });

  // ══ 3. Plan subscription, no trial (the `mode: "payment"` half) ════════════
  describe("plan subscription without a trial (Pro)", () => {
    let subId = "";
    let customerId = "";
    let created: Record<string, unknown>;

    beforeAll(async () => {
      // Trial days come from the plan's entitlements exactly as the route reads them.
      const row = await env.DB.prepare("SELECT entitlements_json FROM plans WHERE id = 'pro'").first<{ entitlements_json: string | null }>();
      expect(trialPeriodDays(resolveEntitlements(row?.entitlements_json)), "Pro must not carry a trial").toBeNull();

      const cust = await must<{ id: string }>("customers", { body: { email: `kova-live-pro-${Date.now()}@example.com`, "metadata[kova_tenant]": "t_live_pro" } });
      customerId = cust.id;
      trackJunk({ kind: "customer", id: customerId });
      // Byte-for-byte the request `/billing/plan-intent` makes for a no-trial plan.
      created = await stripeCall<Record<string, unknown>>(LIVE_KEY, "subscriptions", {
        customer: customerId,
        "items[0][price]": cat("pro").price,
        payment_behavior: "default_incomplete",
        "payment_settings[save_default_payment_method]": "on_subscription",
        "expand[0]": "latest_invoice.payment_intent",
        "expand[1]": "pending_setup_intent",
        "metadata[kova_tenant]": "t_live_pro",
        "metadata[kova_plan]": "pro",
      });
      subId = created.id as string;
      trackJunk({ kind: "subscription", id: subId });
    }, 180_000);

    it("is born `incomplete` with a confirmable latest_invoice.payment_intent and no setup intent", async () => {
      expect(created.status).toBe("incomplete");
      const inv = created.latest_invoice as { payment_intent?: { client_secret?: string; status?: string }; amount_due?: number };
      // This expand is the whole reason `stripe.ts` pins the API version — see
      // the drift describe for what happens to it at the account default.
      expect(inv?.payment_intent, "latest_invoice.payment_intent must exist on a no-trial default_incomplete sub").toBeTruthy();
      expect(inv?.payment_intent?.client_secret).toMatch(/^pi_.*_secret_/);
      expect(inv?.payment_intent?.status).toBe("requires_payment_method");
      expect(inv?.amount_due).toBe(4999);
      // No trial ⇒ nothing to set up ⇒ the route must hand out mode "payment".
      expect(created.pending_setup_intent).toBeNull();
      expect(created.default_payment_method).toBeNull();
    });

    it("goes `active` with a default_payment_method once the PaymentIntent is confirmed", async () => {
      const piId = ((created.latest_invoice as { payment_intent?: { id?: string } }).payment_intent?.id ?? "") as string;
      const confirmed = await must<{ status: string; latest_charge?: string }>(`payment_intents/${piId}/confirm`, {
        body: { payment_method: await testCardPm(), return_url: `${ORIGIN}/billing` },
      });
      expect(confirmed.status).toBe("succeeded");

      const active = await pollFor("subscription to go active", async () => {
        const s = await must<{ status: string; default_payment_method: unknown }>(`subscriptions/${subId}`);
        return s.status === "active" ? s : null;
      });
      // `hasPaymentMethod` in stripe-routes.ts reads exactly this field (or
      // `default_source`); `status === "active"` alone already activates.
      expect(active.default_payment_method).toMatch(/^pm_/);

      const ev = await waitForEvent((e) => e.data.object.id === subId && e.data.object.status === "active", { types: ["customer.subscription.updated"] });
      expect(ev.data.object.default_payment_method).toMatch(/^pm_/);
      expect(ev.data.object.status).toBe("active");
    }, 240_000);
  });

  // ══ 4. Trial subscription — the bug-1 regression guard ════════════════════
  describe("trial subscription (Light) — what the trial fix depends on", () => {
    let subId = "";
    let setupIntentId = "";
    let created: Record<string, unknown>;

    beforeAll(async () => {
      const row = await env.DB.prepare("SELECT entitlements_json FROM plans WHERE id = 'light'").first<{ entitlements_json: string | null }>();
      expect(trialPeriodDays(resolveEntitlements(row?.entitlements_json)), "Light must carry a 30-day trial").toBe(30);

      const cust = await must<{ id: string }>("customers", { body: { email: `kova-live-trial-${Date.now()}@example.com` } });
      trackJunk({ kind: "customer", id: cust.id });
      created = await stripeCall<Record<string, unknown>>(LIVE_KEY, "subscriptions", {
        customer: cust.id,
        "items[0][price]": cat("light").price,
        payment_behavior: "default_incomplete",
        "payment_settings[save_default_payment_method]": "on_subscription",
        "expand[0]": "latest_invoice.payment_intent",
        "expand[1]": "pending_setup_intent",
        "metadata[kova_tenant]": "t_live_trial",
        "metadata[kova_plan]": "light",
        trial_period_days: 30,
        "trial_settings[end_behavior][missing_payment_method]": "cancel",
      });
      subId = created.id as string;
      setupIntentId = ((created.pending_setup_intent as { id?: string } | null)?.id ?? "") as string;
      trackJunk({ kind: "subscription", id: subId });
    }, 180_000);

    it("EXISTS AND IS `trialing` the instant the call returns — with no card", () => {
      // Bug 1 in one assertion. Nothing downstream may read this as "paid for".
      expect(created.status).toBe("trialing");
      expect(created.default_payment_method, "a fresh trial has NO default_payment_method").toBeNull();
      expect(created.default_source).toBeNull();
      expect(created.trial_end).toBeTypeOf("number");
      expect((created.trial_settings as { end_behavior?: { missing_payment_method?: string } })?.end_behavior?.missing_payment_method).toBe("cancel");
    });

    it("carries a pending_setup_intent (the positive signal `hasPaymentMethod` fails closed on)", () => {
      const psi = created.pending_setup_intent as { id?: string; status?: string; client_secret?: string } | null;
      expect(psi, "a card-less trial must expose a SetupIntent to confirm").toBeTruthy();
      expect(psi?.id).toMatch(/^seti_/);
      expect(psi?.status).toBe("requires_payment_method");
      expect(psi?.client_secret).toMatch(/^seti_.*_secret_/);
      // The trap the route documents: a $0 first invoice means there is NO
      // PaymentIntent to confirm, so `mode` must be "setup", not "payment".
      expect((created.latest_invoice as { payment_intent?: unknown }).payment_intent).toBeNull();
    });

    it("auto-pays a $0 `subscription_create` invoice — the second door bug 1 came through", () => {
      const inv = created.latest_invoice as { status?: string; amount_paid?: number; amount_due?: number; billing_reason?: string };
      expect(inv.status).toBe("paid");
      expect(inv.amount_paid).toBe(0);
      expect(inv.amount_due).toBe(0);
      expect(inv.billing_reason).toBe("subscription_create");
      // ⇒ handlePlatformEvent's `zeroTrialStart` guard (amount_paid <= 0 &&
      //   billing_reason === "subscription_create") is exactly the right shape.
    });

    it("emits `customer.subscription.created` (trialing, card-less) and the $0 `invoice.paid` together", async () => {
      const subCreated = await waitForEvent((e) => e.data.object.id === subId, { types: ["customer.subscription.created"] });
      expect(subCreated.data.object.status).toBe("trialing");
      expect(subCreated.data.object).toHaveProperty("default_payment_method");
      expect(subCreated.data.object.default_payment_method, "the card-less trial event carries a NULL payment method").toBeNull();
      // In the webhook payload the pending SetupIntent is a BARE STRING, not the
      // expanded object the create call returned. `stripeId()` handles both.
      expect(subCreated.data.object.pending_setup_intent).toMatch(/^seti_/);

      const invPaid = await waitForEvent((e) => (e.data.object.id as string) === (created.latest_invoice as { id: string }).id, { types: ["invoice.paid"] });
      expect(invPaid.data.object.amount_paid).toBe(0);
      expect(invPaid.data.object.billing_reason).toBe("subscription_create");
      // Ordering, as Stripe timestamps it: the $0 invoice is not emitted after
      // the subscription — a handler cannot rely on seeing the subscription first.
      expect(invPaid.created).toBeLessThanOrEqual(subCreated.created);
    }, 180_000);

    it("reports a default_payment_method once the SetupIntent is confirmed — and re-fires subscription.updated", async () => {
      // Server-side equivalent of Stripe.js `confirmSetup` (bug 2's call site).
      const si = await must<{ status: string; payment_method: string }>(`setup_intents/${setupIntentId}/confirm`, {
        body: { payment_method: await testCardPm(), return_url: `${ORIGIN}/billing` },
      });
      expect(si.status).toBe("succeeded");
      expect(si.payment_method).toMatch(/^pm_/);

      const carded = await pollFor("subscription to report a default_payment_method", async () => {
        const s = await must<{ status: string; default_payment_method: unknown; pending_setup_intent: unknown }>(`subscriptions/${subId}`);
        return s.default_payment_method ? s : null;
      });
      // The whole transition the fix depends on: still `trialing`, but now
      // payable — and `pending_setup_intent` has cleared to null.
      expect(carded.status).toBe("trialing");
      expect(carded.default_payment_method).toBe(si.payment_method);
      expect(carded.pending_setup_intent).toBeNull();

      // And Stripe re-drives activation on an event type we already handle — no
      // new webhook subscription is needed for the trial to convert.
      const updated = await waitForEvent((e) => e.data.object.id === subId && !!e.data.object.default_payment_method, { types: ["customer.subscription.updated"] });
      expect(updated.data.object.status).toBe("trialing");
      expect(updated.data.object.default_payment_method).toBe(si.payment_method);
      expect(updated.data.object.pending_setup_intent).toBeNull();
    }, 300_000);

    it("still mints a pending SetupIntent when the customer ALREADY has a card on file", async () => {
      // The returning-owner case `hasPaymentMethod`'s doc block claims. If this
      // ever stopped holding, a returning owner's trial would activate with no
      // card attached to the subscription.
      const cust = await must<{ id: string }>("customers", { body: { email: `kova-live-returning-${Date.now()}@example.com` } });
      trackJunk({ kind: "customer", id: cust.id });
      const pm = await testCardPm();
      await must(`payment_methods/${pm}/attach`, { body: { customer: cust.id } });
      await must(`customers/${cust.id}`, { body: { "invoice_settings[default_payment_method]": pm } });

      const sub = await stripeCall<Record<string, unknown>>(LIVE_KEY, "subscriptions", {
        customer: cust.id,
        "items[0][price]": cat("light").price,
        payment_behavior: "default_incomplete",
        "payment_settings[save_default_payment_method]": "on_subscription",
        "expand[0]": "pending_setup_intent",
        trial_period_days: 30,
        "trial_settings[end_behavior][missing_payment_method]": "cancel",
      });
      trackJunk({ kind: "subscription", id: sub.id as string });
      expect(sub.status).toBe("trialing");
      expect(sub.default_payment_method, "the SUBSCRIPTION's own payment method is still unset").toBeNull();
      const psi = sub.pending_setup_intent as { status?: string } | null;
      expect(psi, "Stripe still asks for a setup step").toBeTruthy();
      // Not `requires_payment_method` — the card is known, it just isn't confirmed.
      expect(psi?.status).toBe("requires_confirmation");
    }, 180_000);
  });

  // ══ 5 + 10. Trial end via test clock, and real payloads through our webhook ══
  //
  // One describe because the two need the same expensive fixtures: a pair of
  // clock-driven trials (one carded, one not) whose metadata already names a D1
  // tenant, so the events they emit can be replayed through the REAL webhook
  // route UNMODIFIED.
  describe("trial end behaviour (test clock) + real payloads through /api/stripe/webhook", () => {
    const NOW = Math.floor(Date.now() / 1000);
    const TRIAL_DAYS = 3;
    interface Scenario {
      tenantId: string;
      clockId: string;
      customerId: string;
      subId: string;
      events: StripeEvent[];
      final: Record<string, unknown>;
      invoices: Record<string, unknown>[];
    }
    const scenarios: Record<"nocard" | "carded", Scenario> = {} as Record<"nocard" | "carded", Scenario>;

    async function buildScenario(kind: "nocard" | "carded"): Promise<Scenario> {
      const tenantId = `t_live_${kind}_${NOW}`;
      // A tenant row the webhook handlers can resolve, keyed to the real customer.
      const clock = await must<{ id: string }>("test_helpers/test_clocks", { body: { frozen_time: NOW, name: `kova-live-${kind}` } });
      trackJunk({ kind: "test_clock", id: clock.id });
      const cust = await must<{ id: string }>("customers", { body: { email: `kova-live-${kind}-${NOW}@example.com`, test_clock: clock.id } });
      await env.DB.prepare(
        "INSERT INTO subscriptions (tenant_id, plan_id, status, comp, stripe_customer_id, updated_at) VALUES (?, 'free', 'none', 0, ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET stripe_customer_id = ?",
      )
        .bind(tenantId, cust.id, new Date().toISOString(), cust.id)
        .run();

      const sub = await stripeCall<Record<string, unknown>>(LIVE_KEY, "subscriptions", {
        customer: cust.id,
        "items[0][price]": cat("light").price,
        payment_behavior: "default_incomplete",
        "payment_settings[save_default_payment_method]": "on_subscription",
        "expand[0]": "pending_setup_intent",
        trial_period_days: TRIAL_DAYS,
        "trial_settings[end_behavior][missing_payment_method]": "cancel",
        "metadata[kova_tenant]": tenantId,
        "metadata[kova_plan]": "light",
      });
      const subId = sub.id as string;

      if (kind === "carded") {
        const psi = (sub.pending_setup_intent as { id: string }).id;
        await must(`setup_intents/${psi}/confirm`, { body: { payment_method: await testCardPm(), return_url: `${ORIGIN}/billing` } });
        await pollFor("card to attach to the trialing subscription", async () => {
          const s = await must<{ default_payment_method: unknown }>(`subscriptions/${subId}`);
          return s.default_payment_method ? s : null;
        });
      }

      // Two hops: past `trial_will_end` (Stripe fires it 3 days out), then past
      // trial end itself. The clock does the time travel — nothing sleeps 3 days.
      await advanceClock(clock.id, NOW + 2 * 86_400);
      await advanceClock(clock.id, NOW + (TRIAL_DAYS + 1) * 86_400);
      await sleep(4_000); // let Stripe's event queue drain

      const final = await must<Record<string, unknown>>(`subscriptions/${subId}`);
      const invoices = (await must<{ data?: Record<string, unknown>[] }>(`invoices?subscription=${subId}&limit=10`)).data ?? [];
      const all = await listEvents({ limit: 100 });
      const events = chronological(all.filter((e) => JSON.stringify(e.data.object).includes(subId)));
      return { tenantId, clockId: clock.id, customerId: cust.id, subId, events, final, invoices };
    }

    beforeAll(async () => {
      scenarios.nocard = await buildScenario("nocard");
      scenarios.carded = await buildScenario("carded");
    }, 900_000);

    it("with NO payment method: `missing_payment_method: cancel` cancels — no invoice, no charge", () => {
      const s = scenarios.nocard;
      expect(s.final.status).toBe("canceled");
      expect(s.final.default_payment_method).toBeNull();
      // The ONLY invoice is the $0 trial-start one. Nothing was ever charged.
      expect(s.invoices).toHaveLength(1);
      const only = s.invoices[0]!;
      expect(only.billing_reason).toBe("subscription_create");
      expect(only.amount_paid).toBe(0);
      const types = s.events.map((e) => e.type);
      expect(types).toContain("customer.subscription.trial_will_end");
      // This is what lands in our handler: `customer.subscription.deleted` → free.
      expect(types).toContain("customer.subscription.deleted");
      expect(types.filter((t) => t === "invoice.paid")).toHaveLength(1);
      const willEnd = s.events.find((e) => e.type === "customer.subscription.trial_will_end")!;
      // The branch that must say "we have no card, it will just be cancelled".
      expect(willEnd.data.object.default_payment_method).toBeNull();
      const deleted = s.events.find((e) => e.type === "customer.subscription.deleted")!;
      expect(deleted.data.object.status).toBe("canceled");
    });

    it("WITH a payment method: the trial converts to `active` on a paid `subscription_cycle` invoice", () => {
      const s = scenarios.carded;
      expect(s.final.status).toBe("active");
      expect(s.final.default_payment_method).toMatch(/^pm_/);
      const cycle = s.invoices.find((i) => i.billing_reason === "subscription_cycle");
      expect(cycle, "a converted trial must produce a subscription_cycle invoice").toBeTruthy();
      expect(cycle!.amount_paid).toBe(2499); // Light, in minor units, actually charged
      expect(cycle!.status).toBe("paid");
      const activeEvent = s.events.find((e) => e.type === "customer.subscription.updated" && e.data.object.status === "active");
      expect(activeEvent, "activation rides on customer.subscription.updated").toBeTruthy();
      expect(activeEvent!.data.object.default_payment_method).toMatch(/^pm_/);
      const willEnd = s.events.find((e) => e.type === "customer.subscription.trial_will_end")!;
      // The branch that must say "your card will be charged".
      expect(willEnd.data.object.default_payment_method).toMatch(/^pm_/);
      const paidCycle = s.events.find((e) => e.type === "invoice.paid" && e.data.object.billing_reason === "subscription_cycle")!;
      expect(paidCycle.data.object.amount_paid).toBe(2499);
    });

    describe("our own webhook route, fed the unmodified real payloads", () => {
      beforeAll(async () => {
        // Point the worker's Stripe config at the test lane so the signature check
        // and any outbound call in a handler use the same key this suite does.
        await setConfig(env.DB, "stripe.mode", "test");
        await setConfig(env.DB, "stripe.test.secret_key", LIVE_KEY);
        await setConfig(env.DB, "stripe.test.webhook_secret", WEBHOOK_SECRET);
      }, 60_000);

      /** POST a real Stripe event body to the real route with a signed header. */
      async function deliver(ev: StripeEvent, opts: { secret?: string; timestamp?: number; header?: string } = {}): Promise<Response> {
        const payload = JSON.stringify(ev);
        const sig = opts.header ?? (await signWebhook(payload, opts.secret ?? WEBHOOK_SECRET, { timestamp: opts.timestamp }));
        return SELF.fetch(`${ORIGIN}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": sig, origin: ORIGIN }, body: payload });
      }

      const sub = async (tenantId: string) =>
        (await env.DB.prepare("SELECT plan_id, status, pending_plan_id, stripe_sub_id, current_period_end FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<{
          plan_id: string | null;
          status: string | null;
          pending_plan_id: string | null;
          stripe_sub_id: string | null;
          current_period_end: string | null;
        }>())!;

      /** The credit authority. `test/env.d.ts` types BILLING as a bare
       *  DurableObjectNamespace, so the RPC surface is narrowed here rather than
       *  by editing a file this task does not own. */
      const balance = async (tenantId: string): Promise<{ balance: number; granted: number; purchased: number }> => {
        const stub = env.BILLING.get(env.BILLING.idFromName(tenantId)) as unknown as {
          bind(tenantId: string): Promise<void>;
          view(): Promise<{ balance: number; granted: number; purchased: number }>;
        };
        await stub.bind(tenantId);
        return stub.view();
      };

      it("verifies a documented-scheme signature over a real event body, and rejects the negatives", async () => {
        // A real, byte-exact Stripe event body — not one we composed.
        const real = scenarios.nocard.events[0]!;
        const payload = JSON.stringify(real);

        expect(await verifyWebhook(payload, await signWebhook(payload, WEBHOOK_SECRET), WEBHOOK_SECRET)).toBe(true);
        // Wrong secret.
        expect(await verifyWebhook(payload, await signWebhook(payload, "whsec_not_the_one"), WEBHOOK_SECRET)).toBe(false);
        // Outside Stripe's 300s tolerance ⇒ a captured payload is not replayable.
        expect(await verifyWebhook(payload, await signWebhook(payload, WEBHOOK_SECRET, { timestamp: Math.floor(Date.now() / 1000) - 400 }), WEBHOOK_SECRET)).toBe(false);
        // Mid-rotation Stripe signs with BOTH secrets and sends two `v1=` values.
        expect(await verifyWebhook(payload, await signWebhook(payload, "whsec_old_secret", { extraSecrets: [WEBHOOK_SECRET] }), WEBHOOK_SECRET)).toBe(true);
        // No v1 at all.
        expect(await verifyWebhook(payload, `t=${Math.floor(Date.now() / 1000)}`, WEBHOOK_SECRET)).toBe(false);
        // Tampered body under a valid signature.
        expect(await verifyWebhook(`${payload} `, await signWebhook(payload, WEBHOOK_SECRET), WEBHOOK_SECRET)).toBe(false);

        // And end to end through the route: a good signature is accepted, a bad
        // one is a 400 (money captured / nothing granted is the failure mode).
        const bad = await deliver(real, { secret: "whsec_wrong" });
        expect(bad.status).toBe(400);
      }, 120_000);

      it("does NOT grant a plan for the real card-less `customer.subscription.created` (trialing)", async () => {
        const s = scenarios.nocard;
        const created = s.events.find((e) => e.type === "customer.subscription.created")!;
        const res = await deliver(created);
        expect(res.status).toBe(200);

        const row = await sub(s.tenantId);
        // BUG 1, asserted against the real payload: the plan is NOT granted…
        expect(row.plan_id).toBe("free");
        // …only the tenant's CHOICE is recorded…
        expect(row.pending_plan_id).toBe("light");
        // …the status is left where it was (the daily sweep grants credits to
        // `trialing`/`active` tenants)…
        expect(row.status).not.toBe("trialing");
        expect(row.status).not.toBe("active");
        // …and no credits moved.
        expect((await balance(s.tenantId)).balance).toBe(0);
        // The sub id IS adopted, so later events for it resolve.
        expect(row.stripe_sub_id).toBe(s.subId);
        // ⚠️ OBSERVED DRIFT, not asserted as correct: the real payload has no
        // root `current_period_end` (Basil moved it onto the items), so
        // syncStripeSubscription cannot stamp it. See the report.
        expect(created.data.object).not.toHaveProperty("current_period_end");
        expect(row.current_period_end).toBeNull();
      }, 120_000);

      it("keeps the card-less tenant on free when the real `customer.subscription.deleted` lands", async () => {
        const s = scenarios.nocard;
        // Self-contained on purpose: `isolatedStorage` rolls D1 back after every
        // test, so the `created` event has to be replayed here too for the
        // deleted branch's "is this the tenant's CURRENT sub?" guard to match.
        await deliver(s.events.find((e) => e.type === "customer.subscription.created")!);
        const deleted = s.events.find((e) => e.type === "customer.subscription.deleted")!;
        expect((await deliver(deleted)).status).toBe(200);
        const row = await sub(s.tenantId);
        expect(row.plan_id).toBe("free");
        expect(row.status).toBe("canceled");
        expect(row.stripe_sub_id).toBeNull();
      }, 180_000);

      it("grants the plan + monthly credits on the real card-bearing `customer.subscription.updated`", async () => {
        const s = scenarios.carded;
        // First the card-less created event — same as above, nothing granted.
        const created = s.events.find((e) => e.type === "customer.subscription.created")!;
        expect((await deliver(created)).status).toBe(200);
        expect((await sub(s.tenantId)).plan_id).toBe("free");

        // Then the one Stripe re-fires ~1s after the SetupIntent is confirmed.
        const carded = s.events.find((e) => e.type === "customer.subscription.updated" && !!e.data.object.default_payment_method)!;
        expect(carded.data.object.status).toBe("trialing");
        expect((await deliver(carded)).status).toBe(200);

        const row = await sub(s.tenantId);
        expect(row.plan_id).toBe("light");
        expect(row.pending_plan_id).toBeNull();
        // `activatePlan` stamps 'active', then `syncStripeSubscription` — which
        // runs after it in the same handler — restamps the true Stripe state.
        // A carded trial therefore lands on 'trialing', not 'active'.
        expect(row.status).toBe("trialing");
        // Light's monthly grant, from the plan's entitlements.
        expect((await balance(s.tenantId)).granted).toBe(3_000);
      }, 180_000);

      it("resolves the subscription id off a REAL renewal invoice whose payload has no `subscription` field", async () => {
        const s = scenarios.carded;
        const cycle = s.events.find((e) => e.type === "invoice.paid" && e.data.object.billing_reason === "subscription_cycle")!;
        // The shape that made `invoiceSubscriptionId`'s fallback load-bearing
        // rather than defensive: on this account's payload version the field is
        // simply absent, and the id lives under `parent`.
        expect(cycle.data.object).not.toHaveProperty("subscription");
        expect((cycle.data.object.parent as { subscription_details?: { subscription?: string } })?.subscription_details?.subscription).toBe(s.subId);
        expect(cycle.data.object.amount_paid).toBe(2499);

        // Deliver the invoice FIRST, while the tenant row carries NO sub id, so
        // the invoice is the only possible source of it. Ordering matters: if the
        // subscription events ran first they would have stamped `stripe_sub_id`
        // already, and `COALESCE` would keep it even when `invoiceSubscriptionId`
        // resolves nothing — masking the bug this test exists to catch. (Verified
        // by reverting the fallback: with the legacy-only read, `stripe_sub_id`
        // stays NULL here.)
        expect((await sub(s.tenantId)).stripe_sub_id).toBeNull();
        expect((await deliver(cycle)).status).toBe(200);
        const afterInvoice = await sub(s.tenantId);
        expect(afterInvoice.stripe_sub_id, "resolved purely from parent.subscription_details").toBe(s.subId);
        // Stamped from the invoice's own `period_end`, which IS still on the
        // payload at this API version (unlike the subscription's period fields).
        expect(afterInvoice.current_period_end).toBeTruthy();

        // Then the rest of the lifecycle, so the renewal lands on a tenant that
        // is genuinely on Light (isolatedStorage discards the previous test).
        await deliver(s.events.find((e) => e.type === "customer.subscription.created")!);
        await deliver(s.events.find((e) => e.type === "customer.subscription.updated" && !!e.data.object.default_payment_method)!);
        const row = await sub(s.tenantId);
        expect(row.plan_id).toBe("light");
        expect(row.stripe_sub_id).toBe(s.subId);
      }, 240_000);

      it("ignores the real $0 trial-start invoice (zeroTrialStart) — it must not activate a plan", async () => {
        const s = scenarios.nocard;
        const zero = s.events.find((e) => e.type === "invoice.paid" && e.data.object.billing_reason === "subscription_create")!;
        expect(zero.data.object.amount_paid).toBe(0);
        // Park a plan choice so an activation would be visible if it happened.
        await env.DB.prepare("UPDATE subscriptions SET plan_id = 'free', pending_plan_id = 'light' WHERE tenant_id = ?").bind(s.tenantId).run();
        expect((await deliver(zero)).status).toBe(200);
        const row = await sub(s.tenantId);
        expect(row.plan_id).toBe("free");
        expect(row.pending_plan_id).toBe("light");
      }, 120_000);

      it("drops a redelivery of a real event id it already handled", async () => {
        // Stripe redelivers on any non-2xx and sometimes on a 2xx it never saw.
        // Both deliveries must happen inside one test — isolatedStorage discards
        // the `stripe_events` claim between tests.
        const carded = scenarios.carded.events.find((e) => e.type === "customer.subscription.updated" && !!e.data.object.default_payment_method)!;
        const first = await deliver(carded);
        expect(first.status).toBe(200);
        expect(await first.json()).toEqual({ received: true });
        const again = await deliver(carded);
        expect(again.status).toBe(200);
        expect(await again.json()).toEqual({ received: true, duplicate: true });
      }, 180_000);
    });
  });

  // ══ 6. Credit packs ══════════════════════════════════════════════════════
  describe("credit packs", () => {
    let piId = "";
    let chargeId = "";
    const PACK = { id: "pack_25k", credits: 30_000, minor: 2500 };

    beforeAll(async () => {
      const cust = await must<{ id: string }>("customers", { body: { email: `kova-live-pack-${Date.now()}@example.com`, "metadata[kova_tenant]": "t_live_pack" } });
      trackJunk({ kind: "customer", id: cust.id });
      // The exact shape `/billing/pack-intent` creates.
      const pi = await stripeCall<{ id: string; client_secret: string; amount: number; status: string; metadata: Record<string, string> }>(LIVE_KEY, "payment_intents", {
        amount: PACK.minor,
        currency: "usd",
        customer: cust.id,
        "automatic_payment_methods[enabled]": "true",
        "metadata[kova_tenant]": "t_live_pack",
        "metadata[kova_pack]": PACK.id,
        "metadata[kova_credits]": PACK.credits,
      });
      piId = pi.id;
      expect(pi.client_secret).toMatch(/^pi_.*_secret_/);
      expect(pi.amount).toBe(PACK.minor);
      expect(pi.status).toBe("requires_payment_method");
      // Metadata comes back as STRINGS — `Number(meta.kova_credits)` is required.
      expect(pi.metadata.kova_credits).toBe("30000");
      expect(pi.metadata.kova_pack).toBe(PACK.id);

      const confirmed = await must<{ status: string; latest_charge: string }>(`payment_intents/${piId}/confirm`, {
        body: { payment_method: await testCardPm(), return_url: `${ORIGIN}/billing` },
      });
      expect(confirmed.status).toBe("succeeded");
      chargeId = confirmed.latest_charge;
    }, 240_000);

    it("prices the pack in Stripe at the pack row's price", () => {
      expect(cat(PACK.id).minorUnits).toBe(PACK.minor);
    });

    it("carries the pack metadata onto the Charge, which is what the reversal path reads", async () => {
      const ch = await must<{ amount: number; amount_refunded: number; metadata: Record<string, string>; customer: string }>(`charges/${chargeId}`);
      expect(ch.amount).toBe(PACK.minor);
      expect(ch.amount_refunded).toBe(0);
      // NOT obvious, and load-bearing: PaymentIntent metadata IS inherited by the
      // Charge, so `charge.refunded` can compute the proportional reversal at all.
      expect(ch.metadata.kova_credits).toBe("30000");
      expect(ch.metadata.kova_tenant).toBe("t_live_pack");
      expect(ch.customer).toMatch(/^cus_/);
    }, 60_000);

    it("emits `payment_intent.succeeded` with the credits on the event's own metadata", async () => {
      const ev = await waitForEvent((e) => e.data.object.id === piId, { types: ["payment_intent.succeeded"] });
      expect((ev.data.object.metadata as Record<string, string>).kova_credits).toBe("30000");
      expect((ev.data.object.metadata as Record<string, string>).kova_pack).toBe(PACK.id);
      expect((ev.data.object.metadata as Record<string, string>).kova_tenant).toBe("t_live_pack");
    }, 180_000);

    describe("refunds", () => {
      it("reports `amount` and a CUMULATIVE `amount_refunded` on every charge.refunded", async () => {
        // $5 of a $25 pack — the "goodwill refund revoked the whole pack" bug.
        await must("refunds", { body: { charge: chargeId, amount: 500 } });
        const first = await waitForEvent((e) => e.data.object.id === chargeId && e.data.object.amount_refunded === 500, { types: ["charge.refunded"] });
        expect(first.data.object.object, "charge.refunded delivers a Charge").toBe("charge");
        expect(first.data.object.amount).toBe(2500);
        expect(first.data.object.amount_refunded).toBe(500);
        // What reverseChargedCredits computes off those two numbers.
        expect(Math.round(30_000 * (500 / 2500))).toBe(6_000);

        // A SECOND partial refund: the event's amount_refunded is cumulative, so
        // the handler must subtract what it already reversed (6,000) or it takes
        // the proportional total twice.
        await must("refunds", { body: { charge: chargeId, amount: 1000 } });
        const second = await waitForEvent((e) => e.data.object.id === chargeId && e.data.object.amount_refunded === 1500, { types: ["charge.refunded"] });
        expect(second.data.object.amount_refunded).toBe(1500);
        expect(second.data.object.refunded, "a partially refunded charge is not `refunded`").toBe(false);
        const owed = Math.round(30_000 * (1500 / 2500));
        expect(owed).toBe(18_000);
        expect(owed - 6_000, "the incremental take on the second event").toBe(12_000);
      }, 300_000);
    });

    describe("disputes", () => {
      it("delivers a DISPUTE with no `customer` and empty metadata — the shape that made the branch dead code", async () => {
        const cust = await must<{ id: string }>("customers", { body: { email: `kova-live-dispute-${Date.now()}@example.com`, "metadata[kova_tenant]": "t_live_pack" } });
        trackJunk({ kind: "customer", id: cust.id });
        const pi = await must<{ id: string; status: string; latest_charge: string }>("payment_intents", {
          body: {
            amount: 2500,
            currency: "usd",
            customer: cust.id,
            payment_method: "pm_card_createDispute",
            confirm: "true",
            "automatic_payment_methods[enabled]": "true",
            "automatic_payment_methods[allow_redirects]": "never",
            "metadata[kova_tenant]": "t_live_pack",
            "metadata[kova_pack]": "pack_25k",
            "metadata[kova_credits]": 30_000,
          },
        });
        expect(pi.status).toBe("succeeded");

        const ev = await waitForEvent((e) => e.data.object.charge === pi.latest_charge, { types: ["charge.dispute.created"], timeoutMs: 180_000 });
        const d = ev.data.object;
        expect(d.object, "charge.dispute.created delivers a Dispute, not a Charge").toBe("dispute");
        // The two reads the old handler did, both structurally impossible here.
        expect(d, "a Dispute has no `customer` at all").not.toHaveProperty("customer");
        expect(d.metadata, "a Dispute inherits NO metadata from the charge").toEqual({});
        // What resolveReversal has to work from instead.
        expect(d.charge).toBe(pi.latest_charge);
        expect(d.payment_intent).toBe(pi.id);
        expect(d.amount).toBe(2500);
        expect(d.status).toBe("needs_response");

        // …and resolving the underlying Charge does recover tenant + credits.
        const ch = await must<{ amount: number; amount_refunded: number; metadata: Record<string, string>; customer: string }>(`charges/${d.charge as string}`);
        expect(ch.metadata.kova_credits).toBe("30000");
        expect(ch.customer).toBe(cust.id);
        expect(Math.min(ch.amount, (d.amount as number) + ch.amount_refunded)).toBe(2500);
      }, 300_000);
    });
  });

  // ══ 7. Connect rail ══════════════════════════════════════════════════════
  describe("Connect rail", () => {
    let acctId = "";
    /** A connected account can only be charged in a currency it supports, and
     *  that follows the PLATFORM's country — so read it rather than hard-coding
     *  usd, or this suite only passes on a US sandbox. */
    let acctCurrency = "usd";

    beforeAll(async () => {
      // Exactly what `/connect/onboard` creates.
      const acct = await stripeCall<{ id: string; default_currency?: string }>(LIVE_KEY, "accounts", { type: "standard", "metadata[kova_tenant]": "t_live_connect" });
      acctId = acct.id;
      acctCurrency = acct.default_currency ?? "usd";
      trackJunk({ kind: "account", id: acctId });
    }, 120_000);

    it("creates a `standard` account that cannot sell yet — the three flags /connect/checkout gates on", async () => {
      const a = await must<{ type: string; charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean; metadata: Record<string, string> }>(`accounts/${acctId}`);
      expect(a.type).toBe("standard");
      expect(a.metadata.kova_tenant).toBe("t_live_connect");
      // `syncConnectAccount` mirrors these three; all false until onboarding.
      expect(a.charges_enabled).toBe(false);
      expect(a.payouts_enabled).toBe(false);
      expect(a.details_submitted).toBe(false);
    }, 60_000);

    it("mints an account-onboarding link", async () => {
      const link = await stripeCall<{ url: string }>(LIVE_KEY, "account_links", {
        account: acctId,
        refresh_url: `${ORIGIN}/settings`,
        return_url: `${ORIGIN}/settings`,
        type: "account_onboarding",
      });
      expect(link.url).toMatch(/^https:\/\/connect\.stripe\.com\//);
    }, 60_000);

    it("scopes every object to the account named by the `Stripe-Account` header", async () => {
      const onAcct = await must<{ id: string }>("customers", { body: { email: `kova-live-scoped-${Date.now()}@example.com` }, account: acctId });
      // Without the header the platform cannot even see it. This is why every
      // Connect-rail call in stripe-routes.ts passes `connectedAccount`.
      expect((await rawStripe(`customers/${onAcct.id}`)).status).toBe(404);
      expect((await rawStripe(`customers/${onAcct.id}`, { account: acctId })).status).toBe(200);
    }, 90_000);

    it("delivers `account.updated` carrying the id + the three capability flags + our metadata", async () => {
      // Nudge the account so Stripe emits the event. `metadata` is the one field
      // a platform can always write on a `standard` account it created — a
      // `business_profile` write is the account owner's and can 403 ("this
      // application does not have the required permissions for the parameter
      // 'business_profile'"), which is itself worth knowing: nothing in
      // stripe-routes.ts writes a connected account's profile, and it must not.
      const nudge = await rawStripe(`accounts/${acctId}`, { body: { "metadata[kova_probe]": String(Date.now()) } });
      expect(nudge.status, nudge.json.error?.message).toBe(200);
      // Connect events are NOT in the platform's own /v1/events list — they are
      // account-scoped over the API, and carry `event.account` on delivery.
      const ev = await waitForEvent((e) => e.data.object.id === acctId, { types: ["account.updated"], account: acctId, timeoutMs: 120_000 });
      expect(ev.account, "the connected account the event fired for").toBe(acctId);
      const a = ev.data.object;
      expect(a.object).toBe("account");
      expect(a.id).toBe(acctId);
      // Every field `syncConnectAccount` binds, present and boolean.
      for (const k of ["charges_enabled", "payouts_enabled", "details_submitted"]) {
        expect(a, `account.updated must carry ${k}`).toHaveProperty(k);
        expect(typeof a[k]).toBe("boolean");
      }
      expect((a.metadata as Record<string, string>).kova_tenant).toBe("t_live_connect");
    }, 240_000);

    it("takes a direct charge with an application_fee_amount, routed by Stripe-Account", async () => {
      const pm = await testCardPm("tok_visa", acctId);
      // The `/connect/pay-intent` shape: direct charge on the connected account,
      // application fee to the platform, kova ids on the metadata.
      const pi = await stripeCall<{ id: string; status: string; application_fee_amount: number; latest_charge: string; metadata: Record<string, string> }>(
        LIVE_KEY,
        "payment_intents",
        {
          amount: 20_000,
          currency: acctCurrency,
          payment_method: pm,
          confirm: "true",
          "automatic_payment_methods[enabled]": "true",
          "automatic_payment_methods[allow_redirects]": "never",
          application_fee_amount: 1_000,
          "metadata[kova_tenant]": "t_live_connect",
          "metadata[kova_client]": "cl_live_1",
          "metadata[kova_package]": "pkg_live_1",
        },
        { connectedAccount: acctId },
      );
      expect(pi.status).toBe("succeeded");
      expect(pi.application_fee_amount).toBe(1_000);
      expect(pi.metadata.kova_client).toBe("cl_live_1");

      const ch = await must<{ amount: number; application_fee_amount: number; metadata: Record<string, string>; captured: boolean }>(`charges/${pi.latest_charge}`, { account: acctId });
      expect(ch.amount).toBe(20_000);
      expect(ch.application_fee_amount).toBe(1_000);
      expect(ch.captured).toBe(true);
      // The Connect webhook's `payment_intent.succeeded` branch reads these.
      expect(ch.metadata.kova_tenant).toBe("t_live_connect");
      expect(ch.metadata.kova_package).toBe("pkg_live_1");
      // Invisible to the platform without the header, on the charge too.
      expect((await rawStripe(`charges/${pi.latest_charge}`)).status).toBe(404);

      // A partial refund on the connected account reports the same cumulative
      // shape as the platform rail (the Connect handler only notifies, but the
      // payload it notifies from is this one).
      await must("refunds", { body: { charge: pi.latest_charge, amount: 5_000 }, account: acctId });
      const refunded = await waitForEvent((e) => e.data.object.id === pi.latest_charge && e.data.object.amount_refunded === 5_000, { types: ["charge.refunded"], account: acctId, timeoutMs: 180_000 });
      expect(refunded.data.object.object).toBe("charge");
      expect(refunded.data.object.amount).toBe(20_000);
      expect(refunded.data.object.amount_refunded).toBe(5_000);
    }, 300_000);

    it("does NOT reject an application_fee_amount >= the charge amount (the clamp's stated reason does not hold)", async () => {
      // `/connect/pay-intent` clamps the fee to `amount - 1` "because Stripe
      // rejects a fee >= amount on a direct charge". Stripe test mode does not:
      // both of these are accepted AND succeed, i.e. the platform can take the
      // entire charge (or more). The clamp is still worth keeping — it is the
      // only thing protecting the tenant — but it is OUR rule, not Stripe's.
      const eq = await rawStripe<{ status?: string }>("payment_intents", {
        body: { amount: 1_000, currency: acctCurrency, payment_method: await testCardPm("tok_visa", acctId), confirm: "true", "automatic_payment_methods[enabled]": "true", "automatic_payment_methods[allow_redirects]": "never", application_fee_amount: 1_000 },
        account: acctId,
      });
      expect(eq.status).toBe(200);
      expect(eq.json.status).toBe("succeeded");

      const over = await rawStripe<{ status?: string }>("payment_intents", {
        body: { amount: 1_000, currency: acctCurrency, payment_method: await testCardPm("tok_visa", acctId), confirm: "true", "automatic_payment_methods[enabled]": "true", "automatic_payment_methods[allow_redirects]": "never", application_fee_amount: 1_500 },
        account: acctId,
      });
      expect(over.status).toBe(200);
      expect(over.json.status).toBe("succeeded");
    }, 240_000);

    it("documents where headless Connect onboarding stops on this sandbox", async () => {
      // `charges_enabled` never flips without the interactive onboarding form,
      // and every account type that could be enabled from the API is refused
      // outright for this platform's country. So `/connect/status` reaching
      // chargesEnabled: true is NOT reachable from a test.
      const custom = await rawStripe("accounts", { body: { type: "custom", country: "US", "capabilities[card_payments][requested]": "true" } });
      expect(custom.status).toBe(400);
      const express = await rawStripe("accounts", { body: { type: "express", "capabilities[card_payments][requested]": "true", "capabilities[transfers][requested]": "true" } });
      expect(express.status).toBe(400);
      console.log(`[stripe-live] Connect onboarding stops here — custom: ${custom.json.error?.message} | express: ${express.json.error?.message}`);
      // Charges still succeed above despite charges_enabled === false, so the
      // `charges_enabled` gate in /connect/checkout is OUR product rule; test
      // mode does not enforce it.
      const a = await must<{ charges_enabled: boolean }>(`accounts/${acctId}`);
      expect(a.charges_enabled).toBe(false);
    }, 180_000);
  });

  // ══ 8. Version drift: what the pin buys and what it cannot ═══════════════
  describe("API-version drift, observed on real objects", () => {
    let invoiceId = "";
    let subId = "";

    beforeAll(async () => {
      const cust = await must<{ id: string }>("customers", { body: { email: `kova-live-drift-${Date.now()}@example.com` } });
      trackJunk({ kind: "customer", id: cust.id });
      const sub = await must<{ id: string; latest_invoice: { id: string } }>("subscriptions", {
        body: {
          customer: cust.id,
          "items[0][price]": cat("pro").price,
          payment_behavior: "default_incomplete",
          "payment_settings[save_default_payment_method]": "on_subscription",
          "expand[0]": "latest_invoice",
          "metadata[kova_tenant]": "t_live_drift",
          "metadata[kova_plan]": "pro",
        },
      });
      subId = sub.id;
      invoiceId = sub.latest_invoice.id;
      trackJunk({ kind: "subscription", id: subId });
    }, 180_000);

    it("`invoice.subscription` exists at the pin and is GONE at the account default", async () => {
      const pinned = await rawStripe<Record<string, unknown>>(`invoices/${invoiceId}`, { version: PINNED_VERSION });
      expect(pinned.json.subscription).toBe(subId);

      const current = await rawStripe<Record<string, unknown>>(`invoices/${invoiceId}`, { version: null });
      expect(current.status).toBe(200);
      expect(current.json, `the account default (${accountDefaultVersion}) has no invoice.subscription`).not.toHaveProperty("subscription");
      expect((current.json.parent as { subscription_details?: { subscription?: string } })?.subscription_details?.subscription).toBe(subId);
      // Third fallback: the per-line shape.
      const line = (current.json.lines as { data?: Record<string, unknown>[] })?.data?.[0];
      expect((line?.parent as { subscription_item_details?: { subscription?: string } })?.subscription_item_details?.subscription).toBe(subId);
    }, 120_000);

    it("`latest_invoice.payment_intent` expands at the pin and SILENTLY vanishes at the account default", async () => {
      const body = {
        "items[0][price]": cat("pro").price,
        payment_behavior: "default_incomplete" as const,
        "payment_settings[save_default_payment_method]": "on_subscription",
        "expand[0]": "latest_invoice.payment_intent",
      };
      const cust = await must<{ id: string }>("customers", { body: { email: `kova-live-expand-${Date.now()}@example.com` } });
      trackJunk({ kind: "customer", id: cust.id });

      const pinned = await rawStripe<{ id: string; latest_invoice?: { payment_intent?: { client_secret?: string } } }>("subscriptions", { body: { customer: cust.id, ...body }, version: PINNED_VERSION });
      trackJunk({ kind: "subscription", id: pinned.json.id });
      expect(pinned.json.latest_invoice?.payment_intent?.client_secret).toMatch(/^pi_.*_secret_/);

      const current = await rawStripe<{ id: string; latest_invoice?: Record<string, unknown> }>("subscriptions", { body: { customer: cust.id, ...body }, version: null });
      trackJunk({ kind: "subscription", id: current.json.id });
      // The dangerous part: Stripe does NOT error on an expand path that no
      // longer exists. Losing the pin would make /billing/plan-intent answer
      // 502 "could not start subscription" with nothing in any log to say why.
      expect(current.status).toBe(200);
      expect(current.json.latest_invoice).toBeTruthy();
      expect(current.json.latest_invoice).not.toHaveProperty("payment_intent");
    }, 180_000);

    it("event payloads render at the ACCOUNT version, never at the pin the request used", async () => {
      const ev = await waitForEvent((e) => e.data.object.id === subId, { types: ["customer.subscription.created"] });
      // Read with a pinned request; still rendered at the account default.
      expect(ev.api_version).toBe(accountDefaultVersion);
      expect(ev.api_version).not.toBe(PINNED_VERSION);
      // …which is why `invoiceSubscriptionId` needs its fallbacks and why
      // DEPLOY.md tells you to pin the webhook ENDPOINT too.
    }, 180_000);

    it("a subscription event payload has NO root `current_period_end` — it is on the items", async () => {
      const ev = await waitForEvent((e) => e.data.object.id === subId, { types: ["customer.subscription.created"] });
      // syncStripeSubscription reads `obj.current_period_end`. Absent here.
      expect(ev.data.object).not.toHaveProperty("current_period_end");
      const item = (ev.data.object.items as { data?: Record<string, unknown>[] })?.data?.[0];
      expect(item?.current_period_end, "the value moved onto the subscription ITEM").toBeTypeOf("number");
      // Requests we make are pinned, so there the root field is still present —
      // which is exactly why reading the code could not reveal this.
      const viaApi = await rawStripe<Record<string, unknown>>(`subscriptions/${subId}`, { version: PINNED_VERSION });
      expect(viaApi.json.current_period_end).toBeTypeOf("number");
    }, 180_000);
  });
});
