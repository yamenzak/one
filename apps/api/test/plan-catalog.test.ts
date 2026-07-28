/**
 * Plan catalog v2 (SPEC §5) — the seeded tiers, retirement + grandfathering,
 * trials, and the money-shaped invariants around them.
 *
 * Why an integration suite and not a domain one: almost everything here is a
 * *store* property (which rows seed, which rows `listPlans` is willing to offer,
 * what `withinQuota` does with a lowered ceiling, what a webhook does to a
 * trialing subscription). The pure half — `resolveEntitlements`/`trialPeriodDays`
 * coercion, override rules — is covered in
 * packages/domain/test/entitlements-overrides.test.ts.
 *
 * Harness conventions copied from api.test.ts. Note (AGENTS.md §4) that
 * vitest.config.ts makes EVERY signed-in test user a platform admin, so
 * `/api/admin/*` is reachable here but action-gate 403s are not observable —
 * nothing below asserts one.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";
import {
  DEFAULT_PLANS,
  GRANDFATHERED_PLANS,
  PLAN_CATALOG_VERSION,
  listPlans,
  getPlan,
  seedBilling,
  tenantEntitlements,
  withinQuota,
} from "../src/billing-store.js";
import { resolveEntitlements, trialPeriodDays } from "@kova/domain";

const ORIGIN = "http://setup.localhost:8787";
const db = () => env.DB as D1Database;

function grabCookies(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() ?? []).map((c: string) => c.split(";")[0]).join("; ");
}

/** Full passwordless sign-in + studio create (same ceremony as api.test.ts). */
async function signInFlow(email: string, studioName: string): Promise<string> {
  await SELF.fetch(`${ORIGIN}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const row = await db()
    .prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1")
    .bind(`%otp%${email}%`)
    .first<{ value: string }>();
  const fallback = await db().prepare("SELECT value FROM verification ORDER BY createdAt DESC LIMIT 1").first<{ value: string }>();
  const otp = ((row?.value ?? fallback?.value ?? "").match(/\d{6}/) ?? [])[0];
  if (!otp) throw new Error("could not read OTP from verification table");
  const verify = await SELF.fetch(`${ORIGIN}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, otp }),
  });
  let cookies = grabCookies(verify);
  const org = await SELF.fetch(`${ORIGIN}/api/auth/organization/create`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, Cookie: cookies },
    body: JSON.stringify({ name: studioName, slug: `${studioName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2, 7)}` }),
  });
  const refreshed = grabCookies(org);
  if (refreshed) cookies = refreshed;
  return cookies;
}

const auth = (cookies: string) => ({ Cookie: cookies, origin: ORIGIN });
const H = (cookies: string) => ({ "content-type": "application/json", ...auth(cookies) });

let ownerCookie = "";
let tenantId = "";

/** Put a tenant on a plan through the platform-admin comp lane. */
async function setPlan(tid: string, planId: string): Promise<Response> {
  return SELF.fetch(`${ORIGIN}/api/admin/tenants/${tid}/plan`, {
    method: "POST",
    headers: H(ownerCookie),
    body: JSON.stringify({ planId }),
  });
}

beforeAll(async () => {
  await ensureSchema(db());
  ownerCookie = await signInFlow("catalog-owner@test.dev", "Catalog Studio");
  const ctx = (await (await SELF.fetch(`${ORIGIN}/api/context`, { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
  tenantId = ctx.active.tenantId;
  await seedBilling(db());
});

// ── The four live tiers ───────────────────────────────────────────────────────

describe("catalog v2 — the four active plans seed exactly as specified", () => {
  it("seeds solo/light/pro/max with the right price, quotas, grant and trial", async () => {
    const expected = [
      { id: "solo", name: "Solo", price: 4.99, seats: 1, clients: 1, storageMb: 250, grant: 500, trial: 30 },
      { id: "light", name: "Light", price: 24.99, seats: 1, clients: 30, storageMb: 1_000, grant: 3_000, trial: 30 },
      { id: "pro", name: "Pro", price: 49.99, seats: 5, clients: 100, storageMb: 10_000, grant: 6_000, trial: 0 },
      { id: "max", name: "Max", price: 119.99, seats: -1, clients: -1, storageMb: 100_000, grant: 15_000, trial: 0 },
    ];
    for (const e of expected) {
      const row = (await getPlan(db(), e.id))!;
      expect(row, e.id).toBeTruthy();
      expect(row.name, e.id).toBe(e.name);
      expect(row.price_usd_month, e.id).toBe(e.price);
      expect(row.active, e.id).toBe(1);
      const ent = resolveEntitlements(row.entitlements_json);
      expect(ent.quotas.staffSeats, e.id).toBe(e.seats);
      expect(ent.quotas.activeClients, e.id).toBe(e.clients);
      expect(ent.quotas.storageMb, e.id).toBe(e.storageMb);
      expect(ent.aiCredits.monthlyGrant, e.id).toBe(e.grant);
      expect(ent.trialDays, e.id).toBe(e.trial);
    }
  });

  it("features ladder upward: Solo minimal → Light commerce → Pro/Max everything real", async () => {
    const f = async (id: string) => resolveEntitlements((await getPlan(db(), id))!.entitlements_json).features;
    const solo = await f("solo");
    expect(solo.externalSearch).toBe(true);
    expect(solo.aiSuite).toBe(true);
    for (const k of ["commerce", "bfCamera", "supplementsLabs", "frontDesk", "branding"] as const) expect(solo[k], k).toBe(false);

    const light = await f("light");
    expect(light.commerce).toBe(true);
    expect(light.bfCamera).toBe(true);
    for (const k of ["supplementsLabs", "frontDesk", "branding"] as const) expect(light[k], k).toBe(false);

    for (const id of ["pro", "max"]) {
      const ent = await f(id);
      for (const k of ["externalSearch", "aiSuite", "commerce", "bfCamera", "supplementsLabs", "frontDesk", "branding"] as const) {
        expect(ent[k], `${id}.${k}`).toBe(true);
      }
    }
  });

  it("the marketing prices are minority-AI: each grant is 10–20% of the plan price", () => {
    // 1 credit = $0.001 (DEFAULT_PACKS). AI is a feature of the subscription,
    // not its substance — if this drifts, the grant derivation drifted with it.
    for (const p of DEFAULT_PLANS) {
      const grantUsd = resolveEntitlements(p.entitlements_json).aiCredits.monthlyGrant / 1000;
      const share = grantUsd / p.price_usd_month;
      expect(share, p.id).toBeGreaterThanOrEqual(0.1);
      expect(share, p.id).toBeLessThanOrEqual(0.2);
    }
  });

  it("no plan enables a reserved (non-existent) feature — not even a grandfathered seed", () => {
    // `chat` and `integrations` are `reserved: true`: declared, gated nowhere.
    // Selling either is selling vapor.
    for (const p of [...DEFAULT_PLANS, ...GRANDFATHERED_PLANS]) {
      const ent = resolveEntitlements(p.entitlements_json);
      expect(ent.features.chat, p.id).toBe(false);
      expect(ent.features.integrations, p.id).toBe(false);
    }
  });

  it("trial days are present on exactly solo + light", () => {
    const withTrial = DEFAULT_PLANS.filter((p) => trialPeriodDays(resolveEntitlements(p.entitlements_json)) !== null).map((p) => p.id);
    expect(withTrial.sort()).toEqual(["light", "solo"]);
    // 0 must resolve to `null`, never 0 — Stripe rejects trial_period_days=0.
    for (const id of ["pro", "max"]) {
      const p = DEFAULT_PLANS.find((x) => x.id === id)!;
      expect(trialPeriodDays(resolveEntitlements(p.entitlements_json)), id).toBeNull();
    }
  });

  it("stamps the catalog version so the migration runs once, not on every request", async () => {
    const stamp = await db().prepare("SELECT value FROM app_config WHERE key = 'plans.catalog_version'").first<{ value: string }>();
    expect(stamp?.value).toBe(PLAN_CATALOG_VERSION);
  });
});

// ── Retirement + grandfathering ───────────────────────────────────────────────

describe("retired tiers — inactive, still resolvable, never offered", () => {
  it("free/studio/team exist with active = 0", async () => {
    for (const id of ["free", "studio", "team"]) {
      const row = (await getPlan(db(), id))!;
      expect(row, id).toBeTruthy();
      expect(row.active, id).toBe(0);
    }
  });

  it("listPlans — the ONLY choice surface — offers the four live tiers and nothing else", async () => {
    const ids = (await listPlans(db())).map((p) => p.id);
    expect(ids).toEqual(["solo", "light", "pro", "max"]); // ordered by `ord`
    for (const gone of ["free", "studio", "team"]) expect(ids, gone).not.toContain(gone);
  });

  it("GET /billing offers only active plans, and shows a retired plan's real name to the tenant on it", async () => {
    expect((await setPlan(tenantId, "studio")).status).toBe(200);
    const billing = (await (await SELF.fetch(`${ORIGIN}/api/billing`, { headers: auth(ownerCookie) })).json()) as {
      subscription: { planId: string; planName: string };
      plans: { id: string; trialDays: number }[];
    };
    // The picker never offers what nobody may buy…
    expect(billing.plans.map((p) => p.id)).toEqual(["solo", "light", "pro", "max"]);
    // …but the grandfathered tenant still sees their own tier by name, not as a
    // raw id (the regression when a plan is resolved out of the active-only list).
    expect(billing.subscription.planId).toBe("studio");
    expect(billing.subscription.planName).toBe("Studio (retired)");
    // Trial length rides along so the picker can advertise it before the card.
    expect(billing.plans.find((p) => p.id === "solo")!.trialDays).toBe(30);
    expect(billing.plans.find((p) => p.id === "pro")!.trialDays).toBe(0);
  });

  it("a tenant already on a retired plan still resolves its full entitlements", async () => {
    await setPlan(tenantId, "studio");
    const ent = await tenantEntitlements(db(), tenantId);
    // Studio's historical value, untouched: 4 seats, 100 clients, 25 GB, 2,500 credits.
    expect(ent.quotas.staffSeats).toBe(4);
    expect(ent.quotas.activeClients).toBe(100);
    expect(ent.quotas.storageMb).toBe(25_000);
    expect(ent.aiCredits.monthlyGrant).toBe(2500);
    // …including the paid features it was sold.
    expect(ent.features.supplementsLabs).toBe(true);
    expect(ent.features.frontDesk).toBe(true);
    expect(ent.features.branding).toBe(true);
    // Which the entitlement gates then honour on a real route.
    const res = await SELF.fetch(`${ORIGIN}/api/settings/ai`, { headers: auth(ownerCookie) });
    expect(res.status).toBe(200);
  });

  it("a retired plan cannot be reached as a downgrade target or a checkout", async () => {
    await setPlan(tenantId, "pro");
    for (const gone of ["free", "studio", "team"]) {
      const dg = await SELF.fetch(`${ORIGIN}/api/billing/check-downgrade`, { method: "POST", headers: H(ownerCookie), body: JSON.stringify({ planId: gone }) });
      expect(dg.status, gone).toBe(404);
    }
    // A live tier is a legitimate target (200 with a checklist, eligible or not).
    const ok = await SELF.fetch(`${ORIGIN}/api/billing/check-downgrade`, { method: "POST", headers: H(ownerCookie), body: JSON.stringify({ planId: "solo" }) });
    expect([200, 403]).toContain(ok.status);
  });

  it("the admin comp lane CAN still resolve a retired plan (support must reach grandfathered tenants)", async () => {
    expect((await setPlan(tenantId, "team")).status).toBe(200);
    expect((await setPlan(tenantId, "free")).status).toBe(200);
    expect((await setPlan(tenantId, "nope-not-a-plan")).status).toBe(404);
  });

  it("free stays the implicit unsubscribed baseline for a brand-new tenant", async () => {
    const fresh = await signInFlow("catalog-fresh@test.dev", "Fresh Studio");
    const ctx = (await (await SELF.fetch(`${ORIGIN}/api/context`, { headers: auth(fresh) })).json()) as { active: { tenantId: string } };
    const row = await db().prepare("SELECT plan_id FROM subscriptions WHERE tenant_id = ?").bind(ctx.active.tenantId).first<{ plan_id: string }>();
    expect(row?.plan_id).toBe("free");
    // Retired ≠ unresolvable: the free ceilings still bite (3 clients, no AI).
    const ent = await tenantEntitlements(db(), ctx.active.tenantId);
    expect(ent.quotas.activeClients).toBe(3);
    expect(ent.features.aiSuite).toBe(false);
  });
});

// ── Quota enforcement on the new (lower) ceilings ─────────────────────────────

describe("quota enforcement uses the new ceilings, and never retroactively", () => {
  it("solo's activeClients = 1 blocks the SECOND client, with the new limit in the error", async () => {
    const cookie = await signInFlow("catalog-solo@test.dev", "Solo Studio");
    const ctx = (await (await SELF.fetch(`${ORIGIN}/api/context`, { headers: auth(cookie) })).json()) as { active: { tenantId: string } };
    await setPlan(ctx.active.tenantId, "solo");

    const mk = (name: string) =>
      SELF.fetch(`${ORIGIN}/api/clients`, { method: "POST", headers: H(cookie), body: JSON.stringify({ displayName: name }) });
    expect((await mk("Only Client")).status).toBe(201);
    const blocked = await mk("One Too Many");
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ error: "active client limit reached", limit: 1 });

    // Light's 30 is the same gate with a bigger number — the ceiling is read from
    // the plan, not hard-coded anywhere.
    await setPlan(ctx.active.tenantId, "light");
    expect((await mk("Now Allowed")).status).toBe(201);
  });

  it("an EXISTING tenant left over a lowered ceiling keeps every client — only new writes are blocked", async () => {
    // The one real reduction in v2: solo.activeClients 25 → 1. A tenant who was
    // already holding several clients must not be bricked, hidden or archived.
    const cookie = await signInFlow("catalog-overquota@test.dev", "Over Quota Studio");
    const ctx = (await (await SELF.fetch(`${ORIGIN}/api/context`, { headers: auth(cookie) })).json()) as { active: { tenantId: string } };
    const tid = ctx.active.tenantId;
    await setPlan(tid, "pro"); // roomy, so they can build up a roster
    const ids: string[] = [];
    for (const n of ["A", "B", "C"]) {
      const r = (await (await SELF.fetch(`${ORIGIN}/api/clients`, { method: "POST", headers: H(cookie), body: JSON.stringify({ displayName: `OverQuota ${n}` }) })).json()) as { client: { id: string } };
      ids.push(r.client.id);
    }
    // …now they're on solo, 3 clients against a ceiling of 1.
    await setPlan(tid, "solo");
    const ent = await tenantEntitlements(db(), tid);
    expect(ent.quotas.activeClients).toBe(1);

    // The roster is intact and every client is still readable AND writable.
    const roster = (await (await SELF.fetch(`${ORIGIN}/api/clients`, { headers: auth(cookie) })).json()) as { clients: { id: string }[] };
    expect(roster.clients.length).toBeGreaterThanOrEqual(3);
    for (const id of ids) {
      expect((await SELF.fetch(`${ORIGIN}/api/clients/${id}`, { headers: auth(cookie) })).status, id).toBe(200);
      const patch = await SELF.fetch(`${ORIGIN}/api/clients/${id}`, { method: "PATCH", headers: H(cookie), body: JSON.stringify({ heightCm: 175 }) });
      expect(patch.status, id).toBe(200);
    }
    // Only ADDING is refused. `withinQuota` never re-examines existing rows.
    const blocked = await SELF.fetch(`${ORIGIN}/api/clients`, { method: "POST", headers: H(cookie), body: JSON.stringify({ displayName: "Nope" }) });
    expect(blocked.status).toBe(403);
    expect(await withinQuota(db(), tid, "activeClients", 3)).toMatchObject({ ok: false, max: 1 });
    expect(await withinQuota(db(), tid, "activeClients", 0)).toMatchObject({ ok: true, max: 1 });
  });

  it("max's -1 ceilings are unlimited, not zero", async () => {
    await setPlan(tenantId, "max");
    expect(await withinQuota(db(), tenantId, "activeClients", 100_000)).toMatchObject({ ok: true, max: -1 });
    expect(await withinQuota(db(), tenantId, "staffSeats", 500)).toMatchObject({ ok: true, max: -1 });
  });
});

// ── Stripe: a repriced plan must not keep charging the old price ──────────────

describe("Stripe price ids are invalidated by a price change", () => {
  it("the catalog migration drops stale plan price ids when the seeded price moves", async () => {
    // Simulate a deployment sitting on catalog v1: `solo` at $29 with live Stripe
    // ids, and no `light`/`pro`/`max` rows at all.
    await db().prepare("DELETE FROM plans WHERE id IN ('light','pro','max')").run();
    await db()
      .prepare("UPDATE plans SET price_usd_month = 29, stripe_product_id = 'prod_old_solo', stripe_price_id = 'price_old_solo' WHERE id = 'solo'")
      .run();
    // …and an untouched pack id, to prove the migration doesn't nuke unrelated ids.
    await db().prepare("UPDATE credit_packs SET stripe_price_id = 'price_pack_keep' WHERE id = 'pack_1k'").run();
    await db().prepare("DELETE FROM app_config WHERE key = 'plans.catalog_version'").run();

    await seedBilling(db());

    const solo = (await getPlan(db(), "solo"))!;
    expect(solo.price_usd_month).toBe(4.99);
    // The critical assertion: a stale price id would make every checkout charge
    // $29 forever, silently, because syncCatalog skips rows that already have one.
    expect(solo.stripe_price_id).toBeNull();
    expect(solo.stripe_product_id).toBeNull();
    // The new tiers arrived with the same migration.
    for (const id of ["light", "pro", "max"]) expect((await getPlan(db(), id))?.active, id).toBe(1);
    const pack = await db().prepare("SELECT stripe_price_id FROM credit_packs WHERE id = 'pack_1k'").first<{ stripe_price_id: string | null }>();
    expect(pack?.stripe_price_id).toBe("price_pack_keep");
  });

  it("re-running the seed is a no-op: it never re-clears a synced id or stomps admin edits", async () => {
    await seedBilling(db());
    await db().prepare("UPDATE plans SET stripe_product_id = 'prod_new', stripe_price_id = 'price_new' WHERE id = 'solo'").run();
    // An admin tunes the plan at runtime; a redeploy must not undo it.
    await SELF.fetch(`${ORIGIN}/api/admin/plans/solo`, {
      method: "PATCH",
      headers: H(ownerCookie),
      body: JSON.stringify({ entitlements: { quotas: { activeClients: 2 }, features: { aiSuite: true }, aiCredits: { monthlyGrant: 500 } } }),
    });
    await seedBilling(db());
    const solo = (await getPlan(db(), "solo"))!;
    expect(solo.stripe_price_id).toBe("price_new");
    expect(resolveEntitlements(solo.entitlements_json).quotas.activeClients).toBe(2);
    // …and the trial survived an edit that didn't mention it.
    expect(resolveEntitlements(solo.entitlements_json).trialDays).toBe(30);
  });

  it("editing a plan's PRICE clears its Stripe ids and says a re-sync is required", async () => {
    await db().prepare("UPDATE plans SET stripe_product_id = 'prod_x', stripe_price_id = 'price_x' WHERE id = 'max'").run();
    // A no-price edit leaves the ids alone…
    const same = (await (await SELF.fetch(`${ORIGIN}/api/admin/plans/max`, { method: "PATCH", headers: H(ownerCookie), body: JSON.stringify({ name: "Max" }) })).json()) as { stripeResyncRequired: boolean };
    expect(same.stripeResyncRequired).toBe(false);
    expect((await getPlan(db(), "max"))!.stripe_price_id).toBe("price_x");
    // …a reprice does not.
    const moved = (await (await SELF.fetch(`${ORIGIN}/api/admin/plans/max`, { method: "PATCH", headers: H(ownerCookie), body: JSON.stringify({ priceUsdMonth: 129.99 }) })).json()) as { stripeResyncRequired: boolean };
    expect(moved.stripeResyncRequired).toBe(true);
    const max = (await getPlan(db(), "max"))!;
    expect(max.price_usd_month).toBe(129.99);
    expect(max.stripe_price_id).toBeNull();
    expect(max.stripe_product_id).toBeNull();
    // Restore so later files/tests see the shipped price.
    await db().prepare("UPDATE plans SET price_usd_month = 119.99 WHERE id = 'max'").run();
  });
});

// ── The trial actually reaches Stripe ─────────────────────────────────────────

describe("plan-intent sends trial_period_days — and confirms the right intent type", () => {
  /** Capture what the worker POSTs to api.stripe.com; everything else passes through. */
  const calls: { path: string; body: string }[] = [];
  const realFetch = globalThis.fetch;
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("https://api.stripe.com/v1/")) return realFetch(input as RequestInfo, init);
    const path = url.slice("https://api.stripe.com/v1/".length);
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({ path, body });
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
    if (path === "customers") return json({ id: "cus_trial_probe" });
    if (path === "subscriptions") {
      // Stripe's real shape: a TRIALING subscription's first invoice is $0 and
      // auto-paid, so there is no payment_intent — only a pending_setup_intent.
      return body.includes("trial_period_days")
        ? json({ id: "sub_probe_trial", status: "trialing", latest_invoice: { payment_intent: null }, pending_setup_intent: { client_secret: "seti_probe_secret" } })
        : json({ id: "sub_probe_paid", status: "incomplete", latest_invoice: { payment_intent: { client_secret: "pi_probe_secret" } }, pending_setup_intent: null });
    }
    return json({});
  }) as typeof fetch;

  let probeCookie = "";
  beforeAll(async () => {
    for (const [k, v] of [["stripe.mode", "test"], ["stripe.secret_key", "sk_test_probe"], ["stripe.publishable_key", "pk_test_probe"]] as const) {
      await db().prepare("INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v).run();
    }
    await db().prepare("UPDATE plans SET stripe_price_id = 'price_probe' WHERE id IN ('solo','pro')").run();
    probeCookie = await signInFlow("catalog-probe@test.dev", "Probe Studio");
  });

  const planIntent = async (planId: string) => {
    calls.length = 0;
    globalThis.fetch = stub;
    try {
      const res = await SELF.fetch(`${ORIGIN}/api/billing/plan-intent`, { method: "POST", headers: H(probeCookie), body: JSON.stringify({ planId }) });
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    } finally {
      globalThis.fetch = realFetch;
    }
  };

  it("a trial plan sends trial_period_days + the cancel end-behavior, and returns the SETUP intent", async () => {
    const { status, body } = await planIntent("solo");
    expect(status).toBe(200);
    const sub = calls.find((c) => c.path === "subscriptions");
    expect(sub, "no subscription create reached Stripe").toBeTruthy();
    const form = new URLSearchParams(sub!.body);
    expect(form.get("trial_period_days")).toBe("30");
    // Without this, a trial with no payment method dangles as an unpayable
    // subscription instead of lapsing cleanly to `customer.subscription.deleted`.
    expect(form.get("trial_settings[end_behavior][missing_payment_method]")).toBe("cancel");
    expect(form.get("payment_behavior")).toBe("default_incomplete");
    // The plan must ride on the SUBSCRIPTION metadata — session metadata is not
    // copied down, and the webhook resolves the plan from it.
    expect(form.get("metadata[kova_plan]")).toBe("solo");
    // A trial has no PaymentIntent to confirm: the client must confirm the
    // SetupIntent instead, which is what `mode` tells it to do.
    expect(body.mode).toBe("setup");
    expect(body.clientSecret).toBe("seti_probe_secret");
    expect(body.trialDays).toBe(30);
  });

  it("a no-trial plan omits the parameter entirely and returns the PAYMENT intent", async () => {
    const { status, body } = await planIntent("pro");
    expect(status).toBe(200);
    const form = new URLSearchParams(calls.find((c) => c.path === "subscriptions")!.body);
    // Stripe 400s on trial_period_days=0, so it must be ABSENT, not zero.
    expect(form.has("trial_period_days")).toBe(false);
    expect(form.has("trial_settings[end_behavior][missing_payment_method]")).toBe(false);
    expect(body.mode).toBe("payment");
    expect(body.clientSecret).toBe("pi_probe_secret");
    expect(body.trialDays).toBe(0);
  });

  it("hosted checkout carries the trial too, on subscription_data", async () => {
    calls.length = 0;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith("https://api.stripe.com/v1/")) return realFetch(input as RequestInfo, init);
      const path = url.slice("https://api.stripe.com/v1/".length);
      calls.push({ path, body: typeof init?.body === "string" ? init.body : "" });
      return Promise.resolve(new Response(JSON.stringify({ id: "cs_probe", url: "https://checkout.stripe.com/x" }), { status: 200, headers: { "content-type": "application/json" } }));
    }) as typeof fetch;
    try {
      const res = await SELF.fetch(`${ORIGIN}/api/billing/checkout-plan`, { method: "POST", headers: H(probeCookie), body: JSON.stringify({ planId: "solo", returnUrl: "https://app.test/business" }) });
      expect(res.status).toBe(200);
      expect((await res.json()) as { trialDays: number }).toMatchObject({ trialDays: 30 });
    } finally {
      globalThis.fetch = realFetch;
    }
    const form = new URLSearchParams(calls.find((c) => c.path === "checkout/sessions")!.body);
    expect(form.get("subscription_data[trial_period_days]")).toBe("30");
    expect(form.get("subscription_data[metadata][kova_plan]")).toBe("solo");
  });
});

// ── Trial lifecycle, end to end through the real webhooks ─────────────────────

describe("trial lifecycle — the webhook events that drive it", () => {
  const secret = "whsec_platform_trial";
  async function sig(payload: string): Promise<string> {
    const t = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
    return `t=${t},v1=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  }
  const post = async (payload: string) =>
    SELF.fetch(`${ORIGIN}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": await sig(payload) }, body: payload });

  beforeAll(async () => {
    await db()
      .prepare("INSERT INTO app_config (key, value) VALUES ('stripe.webhook_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(secret)
      .run();
  });

  /** A synthetic tenant with a Stripe customer, so we don't perturb a real one. */
  async function trialTenant(tag: string): Promise<string> {
    const tid = `tenant_trial_${tag}`;
    await db()
      .prepare("INSERT INTO subscriptions (tenant_id, plan_id, status, comp, stripe_customer_id, updated_at) VALUES (?, 'free', 'active', 0, ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id")
      .bind(tid, `cus_trial_${tag}`, new Date().toISOString())
      .run();
    return tid;
  }
  const subRow = (tid: string) =>
    db().prepare("SELECT plan_id, status, stripe_sub_id, past_due_at FROM subscriptions WHERE tenant_id = ?").bind(tid).first<{ plan_id: string; status: string; stripe_sub_id: string | null; past_due_at: string | null }>();

  it("`customer.subscription.created` status=trialing WITH a card attached activates immediately and grants credits", async () => {
    const tid = await trialTenant("a");
    const payload = JSON.stringify({
      id: `evt_trial_a_${Date.now()}`,
      type: "customer.subscription.created",
      data: { object: { id: "sub_trial_a", status: "trialing", customer: "cus_trial_a", default_payment_method: "pm_trial_a", pending_setup_intent: null, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400, metadata: { kova_tenant: tid, kova_plan: "light" } } },
    });
    expect((await post(payload)).status).toBe(200);

    const row = (await subRow(tid))!;
    expect(row.plan_id).toBe("light");
    // `trialing` survives, and it is NOT in SUSPENDED_STATUSES, so entitlements
    // are live from minute one — that is what makes a trial a real trial.
    expect(row.status).toBe("trialing");
    const ent = await tenantEntitlements(db(), tid);
    expect(ent.features.aiSuite).toBe(true);
    expect(ent.features.commerce).toBe(true);
    expect(ent.quotas.activeClients).toBe(30);
    // The month's grant landed in the DO on day one, not at trial end.
    const BILLING = (env as unknown as { BILLING: DurableObjectNamespace }).BILLING;
    const stub = BILLING.get(BILLING.idFromName(tid)) as unknown as { view: () => Promise<{ granted: number }> };
    expect((await stub.view()).granted).toBeGreaterThanOrEqual(3_000);
  });

  it("trial → active: the same event with status=active keeps the plan and clears the trial flag", async () => {
    const tid = await trialTenant("b");
    const mk = (status: string, id: string) =>
      JSON.stringify({ id, type: "customer.subscription.updated", data: { object: { id: "sub_trial_b", status, customer: "cus_trial_b", default_payment_method: "pm_trial_b", pending_setup_intent: null, metadata: { kova_tenant: tid, kova_plan: "solo" } } } });
    expect((await post(mk("trialing", `evt_trial_b1_${Date.now()}`))).status).toBe(200);
    expect((await subRow(tid))!.status).toBe("trialing");
    // Trial end, card charged → Stripe flips the same subscription to `active`.
    expect((await post(mk("active", `evt_trial_b2_${Date.now()}`))).status).toBe(200);
    const row = (await subRow(tid))!;
    expect(row.status).toBe("active");
    expect(row.plan_id).toBe("solo");
  });

  it("trial → past_due → canceled: a card that fails at trial end lapses, and the plan falls back to free", async () => {
    const tid = await trialTenant("c");
    await post(JSON.stringify({ id: `evt_trial_c1_${Date.now()}`, type: "customer.subscription.updated", data: { object: { id: "sub_trial_c", status: "trialing", customer: "cus_trial_c", default_payment_method: "pm_trial_c", pending_setup_intent: null, metadata: { kova_tenant: tid, kova_plan: "light" } } } }));
    expect((await subRow(tid))!.status).toBe("trialing");

    // The first real invoice fails → grace window opens (dunning cron escalates).
    expect((await post(JSON.stringify({ id: `evt_trial_c2_${Date.now()}`, type: "invoice.payment_failed", data: { object: { id: "in_trial_c", customer: "cus_trial_c" } } }))).status).toBe(200);
    const pastDue = (await subRow(tid))!;
    expect(pastDue.status).toBe("past_due");
    expect(pastDue.past_due_at).toBeTruthy();
    // past_due is the GRACE window: entitlements deliberately still resolve.
    expect((await tenantEntitlements(db(), tid)).features.aiSuite).toBe(true);

    // No payment method at trial end (trial_settings → cancel) or dunning
    // exhausted → the subscription is deleted. Only the CURRENT sub may do this.
    expect((await post(JSON.stringify({ id: `evt_trial_c3_${Date.now()}`, type: "customer.subscription.deleted", data: { object: { id: "sub_trial_c", status: "canceled", customer: "cus_trial_c" } } }))).status).toBe(200);
    const dead = (await subRow(tid))!;
    expect(dead.status).toBe("canceled");
    expect(dead.plan_id).toBe("free");
    // canceled ∈ SUSPENDED_STATUSES → clamped to free capabilities.
    const ent = await tenantEntitlements(db(), tid);
    expect(ent.features.aiSuite).toBe(false);
    expect(ent.features.commerce).toBe(false);
    expect(ent.aiCredits.monthlyGrant).toBe(0);
  });

  it("a trialing tenant is included in the monthly grant sweep (status IN ('active','trialing'))", async () => {
    const tid = await trialTenant("d");
    await db().prepare("UPDATE subscriptions SET plan_id = 'pro', status = 'trialing' WHERE tenant_id = ?").bind(tid).run();
    const swept = await db()
      .prepare("SELECT tenant_id FROM subscriptions WHERE status IN ('active','trialing') AND tenant_id = ?")
      .bind(tid)
      .first<{ tenant_id: string }>();
    expect(swept?.tenant_id).toBe(tid);
  });
});
