/**
 * Trial lifecycle on the PLATFORM rail — the regression guard for a shipped
 * money bug (SPEC §5, AGENTS.md §5).
 *
 * `POST /billing/plan-intent` creates the Stripe subscription *immediately* with
 * `trial_period_days` and hands the client the `pending_setup_intent` secret to
 * confirm. Verified against live Stripe test mode: that subscription exists in
 * status **`trialing` before any card is attached**, so Stripe fires
 * `customer.subscription.created` (status `trialing`, `default_payment_method:
 * null`, `pending_setup_intent: "seti_…"`) *and* an `invoice.paid` for a $0
 * `subscription_create` invoice — both BEFORE the owner has confirmed anything.
 *
 * The handler activated on either, so an onboarding whose card confirmation
 * FAILED left a fully-entitled Light studio holding its entire 3,000-credit
 * monthly grant, with Stripe unable to charge a cent — repeatable per studio.
 *
 * These tests drive the real webhook with the real payload shapes observed from
 * Stripe. The two `expect`s that matter most are the negatives: plan_id
 * unchanged and the DO balance still zero.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";
import { seedBilling } from "../src/billing-store.js";

const ORIGIN = "http://setup.localhost:8787";
const SECRET = "whsec_trial_lifecycle";

/** Stripe's `stripe-signature` scheme (t=timestamp,v1=HMAC-SHA256 of `t.body`). */
async function sig(payload: string, secret: string): Promise<string> {
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${t},v1=${hex}`;
}

const post = async (payload: string) =>
  SELF.fetch("http://x/api/stripe/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": await sig(payload, SECRET) }, body: payload });

interface Balance { balance: number; purchased: number; granted: number }
function billingStub(tenantId: string) {
  const BILLING = (env as unknown as { BILLING: DurableObjectNamespace }).BILLING;
  return BILLING.get(BILLING.idFromName(tenantId)) as unknown as {
    bind: (t: string) => Promise<void>;
    view: () => Promise<Balance>;
    charge: (c: number) => Promise<Balance>;
  };
}

/** A synthetic tenant on the free baseline with a Stripe customer mapped, which
 *  is exactly the state `/billing/plan-intent` leaves behind. */
async function seedTenant(tenantId: string, customerId: string): Promise<void> {
  await (env.DB as D1Database)
    .prepare("INSERT INTO subscriptions (tenant_id, plan_id, status, comp, stripe_customer_id, updated_at) VALUES (?, 'free', 'active', 0, ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET plan_id = 'free', status = 'active', stripe_customer_id = excluded.stripe_customer_id, pending_plan_id = NULL, stripe_sub_id = NULL")
    .bind(tenantId, customerId, new Date().toISOString())
    .run();
}

const subRow = async (tenantId: string) =>
  (await (env.DB as D1Database)
    .prepare("SELECT plan_id, status, pending_plan_id, stripe_sub_id, current_period_end FROM subscriptions WHERE tenant_id = ?")
    .bind(tenantId)
    .first<{ plan_id: string; status: string; pending_plan_id: string | null; stripe_sub_id: string | null; current_period_end: string | null }>())!;

/** The `customer.subscription.created|updated` payload Stripe really sends for a
 *  `/billing/plan-intent` trial. `card: false` is the observed pre-confirmation
 *  shape; `card: true` is the observed post-`confirmSetup` shape. */
function subEvent(opts: { id: string; type: "created" | "updated"; tenantId: string; customerId: string; subId: string; status: string; card: boolean; plan?: string }): string {
  return JSON.stringify({
    id: opts.id,
    type: `customer.subscription.${opts.type}`,
    data: {
      object: {
        id: opts.subId,
        status: opts.status,
        customer: opts.customerId,
        trial_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        default_payment_method: opts.card ? "pm_trial_card" : null,
        default_source: null,
        pending_setup_intent: opts.card ? null : "seti_trial_pending",
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
        metadata: { kova_tenant: opts.tenantId, kova_plan: opts.plan ?? "light" },
      },
    },
  });
}

beforeAll(async () => {
  await ensureSchema(env.DB as D1Database);
  // The plan catalog has to exist before a webhook can resolve a plan's grant —
  // without it `activatePlan` reads no entitlements and grants 0, which would
  // make every positive assertion below pass for the wrong reason.
  await seedBilling(env.DB as D1Database);
  await (env.DB as D1Database)
    .prepare("INSERT INTO app_config (key, value) VALUES ('stripe.webhook_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(SECRET)
    .run();
});

describe("trial lifecycle — a trial grants nothing until a card is attached", () => {
  it("REGRESSION: `trialing` with NO payment method grants no plan and no credits", async () => {
    const tenantId = "tenant_trial_nocard";
    await seedTenant(tenantId, "cus_trial_nocard");
    const stub = billingStub(tenantId);
    await stub.bind(tenantId);
    expect((await stub.view()).granted).toBe(0);

    // The exact event Stripe fires the instant /billing/plan-intent returns.
    expect((await post(subEvent({ id: "evt_trial_nocard_created", type: "created", tenantId, customerId: "cus_trial_nocard", subId: "sub_trial_nocard", status: "trialing", card: false }))).status).toBe(200);

    const row = await subRow(tenantId);
    // The reported bug, asserted negatively: no paid plan…
    expect(row.plan_id).toBe("free");
    // …no Light monthly grant (3,000 credits)…
    expect((await stub.view()).granted).toBe(0);
    expect((await stub.view()).balance).toBe(0);
    // …and the studio is NOT reported as holding a live subscription. `trialing`
    // here would also make the daily sweep grant Light's credits every month.
    expect(row.status).toBe("active");
    // The CHOICE is remembered, so the owner can be told setup never completed.
    expect(row.pending_plan_id).toBe("light");
  });

  it("the same subscription DOES activate once the card lands, and grants exactly once", async () => {
    const tenantId = "tenant_trial_carded";
    await seedTenant(tenantId, "cus_trial_carded");
    const stub = billingStub(tenantId);
    await stub.bind(tenantId);

    // 1) Card-less create → nothing granted (as above).
    await post(subEvent({ id: "evt_carded_created", type: "created", tenantId, customerId: "cus_trial_carded", subId: "sub_trial_carded", status: "trialing", card: false }));
    expect((await subRow(tenantId)).plan_id).toBe("free");

    // 2) The owner confirms the SetupIntent. Stripe fires setup_intent.succeeded
    //    and then customer.subscription.updated carrying the attached card —
    //    verified against live Stripe. THAT event is what activates.
    const carded = subEvent({ id: "evt_carded_updated", type: "updated", tenantId, customerId: "cus_trial_carded", subId: "sub_trial_carded", status: "trialing", card: true });
    expect((await post(carded)).status).toBe(200);

    const row = await subRow(tenantId);
    expect(row.plan_id).toBe("light");
    expect(row.status).toBe("trialing");
    expect(row.stripe_sub_id).toBe("sub_trial_carded");
    // The pending marker is retired by the plan it named going live.
    expect(row.pending_plan_id).toBeNull();
    expect((await stub.view()).granted).toBe(3000);

    // 3) Not twice. Spend some of the grant, then re-deliver the SAME activation
    //    as a fresh event id (a Stripe redelivery, or the `created` and `updated`
    //    events racing): the spend must stand, not be refilled.
    await stub.charge(1000);
    expect((await stub.view()).granted).toBe(2000);
    const replay = subEvent({ id: "evt_carded_updated_again", type: "updated", tenantId, customerId: "cus_trial_carded", subId: "sub_trial_carded", status: "trialing", card: true });
    expect((await post(replay)).status).toBe(200);
    expect((await stub.view()).granted).toBe(2000);
    // And the identical event id is short-circuited outright.
    expect((await (await post(replay)).json() as { duplicate?: boolean }).duplicate).toBe(true);
  });

  it("`status: \"active\"` still activates — the paid (non-trial) path is unchanged", async () => {
    const tenantId = "tenant_trial_active";
    await seedTenant(tenantId, "cus_trial_active");
    const stub = billingStub(tenantId);
    await stub.bind(tenantId);
    // No card fields at all on the object: an `active` subscription is one Stripe
    // has already charged, so it must not be held to the trial's card test.
    const payload = JSON.stringify({
      id: "evt_trial_active",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_trial_active", status: "active", customer: "cus_trial_active", current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400, metadata: { kova_tenant: tenantId, kova_plan: "light" } } },
    });
    expect((await post(payload)).status).toBe(200);
    const row = await subRow(tenantId);
    expect([row.plan_id, row.status]).toEqual(["light", "active"]);
    expect((await stub.view()).granted).toBe(3000);
  });

  it("stamps the renewal date from a Basil-shaped payload, where it lives on the items", async () => {
    // Regression guard for a bug the live-Stripe suite caught and this suite could
    // not: `current_period_end` moved OFF the Subscription root in Basil
    // (2025-03-31+) onto `items.data[].current_period_end`, and webhook payloads
    // render at the ENDPOINT's dashboard API version — not the version this repo
    // pins for its own requests. Reading only the root left the date null forever,
    // so Business showed no "renews on" until an invoice arrived.
    //
    // Every other fixture in this file hand-feeds the pre-Basil root field, which is
    // precisely why the synthetic suite was blind to it. This one deliberately does
    // NOT set the root, exactly as a current Stripe account delivers it.
    const tenantId = "tenant_trial_basil";
    await seedTenant(tenantId, "cus_trial_basil");
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86_400;
    const payload = JSON.stringify({
      id: "evt_trial_basil",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_trial_basil",
          status: "active",
          customer: "cus_trial_basil",
          items: { data: [{ current_period_end: periodEnd }] },
          metadata: { kova_tenant: tenantId, kova_plan: "light" },
        },
      },
    });
    expect((await post(payload)).status).toBe(200);
    const row = await subRow(tenantId);
    expect(row.plan_id).toBe("light");
    expect(row.current_period_end).toBe(new Date(periodEnd * 1000).toISOString());
  });

  it("the $0 trial-start invoice.paid is not a payment — the second door stays shut", async () => {
    // Verified against live Stripe: creating a trial subscription fires
    // invoice.paid with billing_reason `subscription_create` and amount_paid 0,
    // and it arrives BEFORE customer.subscription.created. Delivered in the other
    // order (Stripe guarantees no order), plan_id would already be stamped and
    // this branch would grant the plan on its own.
    const tenantId = "tenant_trial_invoice";
    await seedTenant(tenantId, "cus_trial_invoice");
    await (env.DB as D1Database).prepare("UPDATE subscriptions SET plan_id = 'light' WHERE tenant_id = ?").bind(tenantId).run();
    const stub = billingStub(tenantId);
    await stub.bind(tenantId);

    const zeroInvoice = JSON.stringify({
      id: "evt_trial_invoice_zero",
      type: "invoice.paid",
      data: { object: { id: "in_trial_zero", customer: "cus_trial_invoice", subscription: "sub_trial_invoice", billing_reason: "subscription_create", amount_due: 0, amount_paid: 0, period_end: Math.floor(Date.now() / 1000) + 30 * 86400 } },
    });
    expect((await post(zeroInvoice)).status).toBe(200);
    expect((await stub.view()).granted).toBe(0);

    // The real conversion at trial end IS a payment (subscription_cycle,
    // amount_paid > 0 — verified via a Stripe test clock) and does grant.
    const cycle = JSON.stringify({
      id: "evt_trial_invoice_cycle",
      type: "invoice.paid",
      data: { object: { id: "in_trial_cycle", customer: "cus_trial_invoice", subscription: "sub_trial_invoice", billing_reason: "subscription_cycle", amount_due: 2499, amount_paid: 2499, period_end: Math.floor(Date.now() / 1000) + 60 * 86400 } },
    });
    expect((await post(cycle)).status).toBe(200);
    expect((await stub.view()).granted).toBe(3000);
  });

  it("the trial ending with no payment method cancels back to free", async () => {
    const tenantId = "tenant_trial_cancel";
    await seedTenant(tenantId, "cus_trial_cancel");
    // A carded trial that went live, then Stripe gave up on it.
    await post(subEvent({ id: "evt_cancel_live", type: "updated", tenantId, customerId: "cus_trial_cancel", subId: "sub_trial_cancel", status: "trialing", card: true }));
    expect((await subRow(tenantId)).plan_id).toBe("light");
    // Verified: `missing_payment_method: cancel` ends the trial as
    // customer.subscription.deleted with status `canceled` — no invoice at all.
    const deleted = JSON.stringify({ id: "evt_cancel_deleted", type: "customer.subscription.deleted", data: { object: { id: "sub_trial_cancel", status: "canceled", customer: "cus_trial_cancel" } } });
    expect((await post(deleted)).status).toBe(200);
    const row = await subRow(tenantId);
    expect([row.plan_id, row.status]).toEqual(["free", "canceled"]);
  });
});

describe("GET /billing reports the unpaid state the UI renders", () => {
  /** Full passwordless sign-in + studio create (copied from api.test.ts). */
  async function signInFlow(email: string, studioName: string): Promise<string> {
    const db = env.DB as D1Database;
    const grab = (res: Response): string => {
      const headers = res.headers as Headers & { getSetCookie?: () => string[] };
      return (headers.getSetCookie?.() ?? []).map((c: string) => c.split(";")[0]).join("; ");
    };
    await SELF.fetch(`${ORIGIN}/api/auth/email-otp/send-verification-otp`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, type: "sign-in" }),
    });
    const row = await db.prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1").bind(`%otp%${email}%`).first<{ value: string }>();
    const fallback = await db.prepare("SELECT value FROM verification ORDER BY createdAt DESC LIMIT 1").first<{ value: string }>();
    const otp = ((row?.value ?? fallback?.value ?? "").match(/\d{6}/) ?? [])[0];
    if (!otp) throw new Error("could not read OTP from verification table");
    const verify = await SELF.fetch(`${ORIGIN}/api/auth/sign-in/email-otp`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, otp }),
    });
    let cookies = grab(verify);
    const org = await SELF.fetch(`${ORIGIN}/api/auth/organization/create`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, Cookie: cookies },
      body: JSON.stringify({ name: studioName, slug: studioName.toLowerCase().replace(/[^a-z0-9]+/g, "-") }),
    });
    const refreshed = grab(org);
    if (refreshed) cookies = refreshed;
    return cookies;
  }

  interface BillingBody {
    subscription: { planId: string; status: string; billingState: string; paidPlan: boolean; pendingPlanId: string | null; pendingPlanName: string | null };
    baseline: { lockedFeatures: string[]; activeClientLimit: number; monthlyCredits: number };
  }

  it("a fresh studio reads `none`; a trial that never completed reads `pending`; a live one reads neither", async () => {
    const cookie = await signInFlow("trial-owner@test.dev", "Trial Studio");
    const H = { Cookie: cookie, origin: ORIGIN };
    const read = async () => (await (await SELF.fetch("http://x/api/billing", { headers: H })).json()) as BillingBody;
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: H })).json()) as { active: { tenantId: string } };
    const tenantId = ctx.active.tenantId;
    const db = env.DB as D1Database;

    // 1) Nothing chosen, nothing paid: the free baseline, named as such — and
    //    specific enough for the notice to say what it costs them.
    let b = await read();
    expect(b.subscription.billingState).toBe("none");
    expect(b.subscription.paidPlan).toBe(false);
    // `status: 'active'` is why the state has to be derived server-side: on its
    // own it reads as a perfectly healthy subscription.
    expect(b.subscription.status).toBe("active");
    expect(b.baseline.monthlyCredits).toBe(0);
    expect(b.baseline.lockedFeatures.length).toBeGreaterThan(0);

    // 2) A trial whose card step never completed: the plan they picked, named,
    //    and explicitly NOT held.
    await db.prepare("UPDATE subscriptions SET pending_plan_id = 'light' WHERE tenant_id = ?").bind(tenantId).run();
    b = await read();
    expect(b.subscription.billingState).toBe("pending");
    expect(b.subscription.paidPlan).toBe(false);
    expect(b.subscription.planId).toBe("free");
    expect([b.subscription.pendingPlanId, b.subscription.pendingPlanName]).toEqual(["light", "Light"]);

    // 3) A healthy paying tenant reports neither unpaid state, so the notice that
    //    keys off them cannot appear.
    await db.prepare("UPDATE subscriptions SET plan_id = 'light', status = 'trialing', pending_plan_id = NULL WHERE tenant_id = ?").bind(tenantId).run();
    b = await read();
    expect(b.subscription.billingState).toBe("trialing");
    expect(b.subscription.paidPlan).toBe(true);
    await db.prepare("UPDATE subscriptions SET status = 'active' WHERE tenant_id = ?").bind(tenantId).run();
    expect((await read()).subscription.billingState).toBe("active");
  });
});
