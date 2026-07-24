/**
 * API integration tests (SPEC §12) on the Miniflare workers pool. These drive
 * the real worker with real D1/DO/KV bindings — auth lanes, tenant isolation,
 * credit reserve/settle, and the access economy.
 *
 * Auth ceremonies (OTP/passkey) go through Better Auth and need email
 * round-trips, so instead of signing in we seed a tenant + session directly in
 * D1 and hit the routes with the session cookie — exercising the guard, the
 * stores, and the DO exactly as production does.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { MUSCLE_GROUPS, EQUIPMENT_TYPES } from "@mossa/protocol";
import { ensureSchema } from "../src/db.js";
import { clientDigestHtml, coachDigestHtml } from "../src/digest.js";
import { emailBar, emailBars, emailSparkline, emailRing, emailStatRow, emailListRow, MOSSA_BRAND } from "../src/mailer.js";
import { purgeClient, purgeTenant } from "../src/purge.js";
import { verifyActionOtp } from "../src/action-otp.js";

const ORIGIN = "http://localhost:8787"; // treated as local by createAuth (non-secure cookies)
let ownerCookie = "";
let otherCookie = "";

/** Extract the Better Auth session cookie(s) from a Set-Cookie header list. */
function grabCookies(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw = headers.getSetCookie?.() ?? [];
  return raw.map((c: string) => c.split(";")[0]).join("; ");
}

/** Full passwordless sign-in: request OTP, read it from D1, verify, create org. */
async function signInFlow(email: string, studioName: string): Promise<string> {
  const db = env.DB as D1Database;
  await SELF.fetch(`${ORIGIN}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  // Better Auth stores the OTP in the verification table; value may be "otp:attempts".
  const row = await db
    .prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1")
    .bind(`%otp%${email}%`)
    .first<{ value: string }>();
  const fallback = await db
    .prepare("SELECT value FROM verification ORDER BY createdAt DESC LIMIT 1")
    .first<{ value: string }>();
  const otp = ((row?.value ?? fallback?.value ?? "").match(/\d{6}/) ?? [])[0];
  if (!otp) throw new Error("could not read OTP from verification table");

  const verify = await SELF.fetch(`${ORIGIN}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, otp }),
  });
  let cookies = grabCookies(verify);

  // Create the tenant (owner) — carry + refresh cookies.
  const org = await SELF.fetch(`${ORIGIN}/api/auth/organization/create`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, Cookie: cookies },
    body: JSON.stringify({ name: studioName, slug: studioName.toLowerCase().replace(/[^a-z0-9]+/g, "-") }),
  });
  const refreshed = grabCookies(org);
  if (refreshed) cookies = refreshed;
  return cookies;
}

const auth = (cookies: string) => ({ Cookie: cookies, origin: ORIGIN });

beforeAll(async () => {
  await ensureSchema(env.DB as D1Database);
  // Force the AI mock lane. The wrangler.jsonc AI binding is present (for
  // prod), so env.AI is truthy in Miniflare — but its .run() needs real
  // Cloudflare auth. `ai.mock = on` makes generate() always use the mock so
  // the metering path is exercised without a live model.
  await (env.DB as D1Database)
    .prepare("INSERT INTO app_config (key, value) VALUES ('ai.mock', 'on') ON CONFLICT(key) DO UPDATE SET value = 'on'")
    .run();
  ownerCookie = await signInFlow("owner1@test.dev", "Studio One");
  otherCookie = await signInFlow("owner2@test.dev", "Studio Two");
  // Put Studio One on the top plan so feature/quota gates (commerce, frontDesk,
  // supplementsLabs, branding, active-client capacity) are open for the suites
  // that exercise those surfaces. Studio Two stays on free to prove the gates.
  const owner1Ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
  await SELF.fetch(`http://x/api/admin/tenants/${owner1Ctx.active.tenantId}/plan`, {
    method: "POST",
    headers: { "content-type": "application/json", ...auth(ownerCookie) },
    body: JSON.stringify({ planId: "team" }),
  });
});

describe("health + public lanes", () => {
  it("serves /health", async () => {
    const res = await SELF.fetch("http://x/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("/api/me is public and returns null when unauthenticated", async () => {
    const res = await SELF.fetch("http://x/api/me");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ user: null });
  });

  it("blocks mutation routes without a session (401)", async () => {
    const res = await SELF.fetch("http://x/api/clients", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });
});

// isolatedStorage (pool default) rolls back D1 writes between `it` blocks, so
// each test that depends on a write keeps that write in-scope.
describe("clients + tenant isolation", () => {
  it("create → owner reads it, other tenant 404s, roster scopes per tenant", async () => {
    const res = await SELF.fetch("http://x/api/clients", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ displayName: "Sara" }),
    });
    expect(res.status).toBe(201);
    const { client } = (await res.json()) as { client: { id: string } };
    expect(client.id).toMatch(/^cli_/);

    // Owner reads its own client.
    expect((await SELF.fetch(`http://x/api/clients/${client.id}`, { headers: auth(ownerCookie) })).status).toBe(200);

    // A different tenant cannot (404, not a 403 that leaks existence).
    expect((await SELF.fetch(`http://x/api/clients/${client.id}`, { headers: auth(otherCookie) })).status).toBe(404);

    // Roster is tenant-scoped.
    const mine = (await (await SELF.fetch("http://x/api/clients", { headers: auth(ownerCookie) })).json()) as { clients: unknown[] };
    const theirs = (await (await SELF.fetch("http://x/api/clients", { headers: auth(otherCookie) })).json()) as { clients: unknown[] };
    expect(mine.clients.length).toBeGreaterThan(0);
    expect(theirs.clients.length).toBe(0);
  });
});

describe("credits + AI metering", () => {
  it("free plan blocks the AI suite (403)", async () => {
    // Studio Two stays on the free plan, which excludes the AI suite.
    const clientRes = await SELF.fetch("http://x/api/clients", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(otherCookie) },
      body: JSON.stringify({ displayName: "AITest" }),
    });
    const { client } = (await clientRes.json()) as { client: { id: string } };
    const res = await SELF.fetch("http://x/api/ai/parse-food", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(otherCookie) },
      body: JSON.stringify({ clientId: client.id, text: "eggs and toast" }),
    });
    expect(res.status).toBe(403);
  });

  it("comp → studio grants credits → AI runs (mock) and debits the ledger", async () => {
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    const comp = await SELF.fetch(`http://x/api/admin/tenants/${ctx.active.tenantId}/plan`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ planId: "studio" }),
    });
    expect(comp.status).toBe(200);
    const billing = (await (await SELF.fetch("http://x/api/billing", { headers: auth(ownerCookie) })).json()) as {
      balance: { balance: number };
      subscription: { planId: string };
    };
    expect(billing.subscription.planId).toBe("studio");
    expect(billing.balance.balance).toBeGreaterThanOrEqual(2500);

    // Now the AI suite is entitled — run parse-food (mock) and check the debit.
    const { client } = (await (
      await SELF.fetch("http://x/api/clients", {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(ownerCookie) },
        body: JSON.stringify({ displayName: "AITest2" }),
      })
    ).json()) as { client: { id: string } };
    const res = await SELF.fetch("http://x/api/ai/parse-food", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ clientId: client.id, text: "eggs and toast" }),
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { mocked: boolean; credits: number };
    expect(out.mocked).toBe(true);
    expect(out.credits).toBeGreaterThan(0);
    const after = (await (await SELF.fetch("http://x/api/billing", { headers: auth(ownerCookie) })).json()) as { balance: { balance: number } };
    expect(after.balance.balance).toBeLessThan(billing.balance.balance);

    // Snap-a-Meal (vision) — upload a photo to R2, then the endpoint reads it
    // and returns entries via the mock vision lane. Reuses the studio comp above.
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }), "meal.jpg");
    fd.append("purpose", "meal-snap");
    const up = await SELF.fetch("http://x/api/media/upload", { method: "POST", headers: auth(ownerCookie), body: fd });
    const { key } = (await up.json()) as { key: string };
    expect(key).toContain(`t/${ctx.active.tenantId}/`);
    const snap = await SELF.fetch("http://x/api/ai/snap-meal", {
      method: "POST", headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ clientId: client.id, imageKey: key, hint: "lunch" }),
    });
    expect(snap.status).toBe(200);
    const snapOut = (await snap.json()) as { entries: unknown[]; note: string | null; mocked: boolean };
    expect(snapOut.mocked).toBe(true);
    expect(snapOut.entries.length).toBeGreaterThan(0);
    expect(typeof snapOut.note).toBe("string"); // AI's one-line meal assessment
    // A key outside the caller's tenant prefix is rejected (no cross-tenant reads).
    const bad = await SELF.fetch("http://x/api/ai/snap-meal", {
      method: "POST", headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ clientId: client.id, imageKey: "t/other-tenant/meal-snap/x.jpg" }),
    });
    expect(bad.status).toBe(400);

    // Label Reader — same vision lane, returns a single per-serving Food shape.
    const label = await SELF.fetch("http://x/api/ai/label-reader", {
      method: "POST", headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ imageKey: key }),
    });
    expect(label.status).toBe(200);
    const labelOut = (await label.json()) as { food: { name: string; calories: number }; mocked: boolean };
    expect(labelOut.food.name.length).toBeGreaterThan(0);
    expect(labelOut.food.calories).toBeGreaterThan(0);
  });

  it("delinquency clamp: a suspended tenant loses paid entitlements (AI 403), recovers on reactivation", async () => {
    const db = env.DB as D1Database;
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    // Studio One is on `team` (from beforeAll) → AI entitled.
    const { client } = (await (
      await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "ClampTest" }) })
    ).json()) as { client: { id: string } };
    const ok = await SELF.fetch("http://x/api/ai/parse-food", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, text: "eggs" }) });
    expect(ok.status).toBe(200);

    // Suspend the tenant (what the dunning cron does after grace). Status alone
    // must clamp entitlements to free — no plan_id change needed.
    await db.prepare("UPDATE subscriptions SET status = 'suspended' WHERE tenant_id = ?").bind(ctx.active.tenantId).run();
    const blocked = await SELF.fetch("http://x/api/ai/parse-food", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, text: "eggs" }) });
    expect(blocked.status).toBe(403); // clamp bites
    const billing = (await (await SELF.fetch("http://x/api/billing", { headers: auth(ownerCookie) })).json()) as { subscription: { status: string } };
    expect(billing.subscription.status).toBe("suspended");

    // Passthrough: the tenant's client loses the tenant-derived AI capability.
    const cflags = (await (await SELF.fetch(`http://x/api/context?clientId=${client.id}`, { headers: auth(ownerCookie) })).json()) as { clientFlags: { canUseAi: boolean } | null };
    if (cflags.clientFlags) expect(cflags.clientFlags.canUseAi).toBe(false);

    // Reactivate → capability returns immediately.
    await db.prepare("UPDATE subscriptions SET status = 'active' WHERE tenant_id = ?").bind(ctx.active.tenantId).run();
    const recovered = await SELF.fetch("http://x/api/ai/parse-food", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, text: "eggs" }) });
    expect(recovered.status).toBe(200);
  });
});

describe("connect rail — webhook idempotency + grant", () => {
  async function stripeSig(payload: string, secret: string): Promise<string> {
    const t = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `t=${t},v1=${hex}`;
  }

  it("grants a client package once; a redelivered event is a no-op", async () => {
    const db = env.DB as D1Database;
    const secret = "whsec_connect_test";
    for (const [k, v] of [["stripe.mode", "test"], ["stripe.secret_key", "sk_test_x"], ["stripe.connect_webhook_secret", secret]] as const) {
      await db.prepare("INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v).run();
    }
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "WebhookBuyer" }) })).json()) as { client: { id: string } };
    const pkgId = "pkg_wh_test";
    await db.prepare("INSERT INTO packages (id, tenant_id, name, one_time_price_cents, budgets_json, currency, active, created_at) VALUES (?, ?, ?, ?, ?, 'usd', 1, ?)")
      .bind(pkgId, ctx.active.tenantId, "Webhook Pack", 5000, JSON.stringify([{ feature: "all", days: 30 }]), new Date().toISOString()).run();
    await db.prepare("INSERT INTO tenant_settings (tenant_id, stripe_account_id, updated_at) VALUES (?, 'acct_wh_1', ?) ON CONFLICT(tenant_id) DO UPDATE SET stripe_account_id = 'acct_wh_1'").bind(ctx.active.tenantId, new Date().toISOString()).run();

    const payload = JSON.stringify({ id: "evt_conn_dedup_1", account: "acct_wh_1", type: "checkout.session.completed", data: { object: { id: "cs_test_1", metadata: { mossa_tenant: ctx.active.tenantId, mossa_client: client.id, mossa_package: pkgId } } } });
    const post = async () => SELF.fetch("http://x/api/connect/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": await stripeSig(payload, secret) }, body: payload });

    const r1 = await post();
    expect(r1.status).toBe(200);
    const n1 = (await db.prepare("SELECT COUNT(*) AS n FROM client_subscriptions WHERE client_id = ? AND status = 'active'").bind(client.id).first<{ n: number }>())!.n;
    expect(n1).toBe(1); // granted

    const r2 = await post();
    expect((await r2.json() as { duplicate?: boolean }).duplicate).toBe(true); // dedup fired
    const n2 = (await db.prepare("SELECT COUNT(*) AS n FROM client_subscriptions WHERE client_id = ? AND status = 'active'").bind(client.id).first<{ n: number }>())!.n;
    expect(n2).toBe(1); // no double grant

    // A bad signature is rejected outright.
    const bad = await SELF.fetch("http://x/api/connect/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=deadbeef" }, body: payload });
    expect(bad.status).toBe(400);
  });

  it("a refund on a connected account notifies the tenant owner", async () => {
    const db = env.DB as D1Database;
    const secret = "whsec_connect_test";
    await db.prepare("INSERT INTO app_config (key, value) VALUES ('stripe.connect_webhook_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(secret).run();
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    // Pin a connected account to this tenant so event.account maps back.
    await db.prepare("INSERT INTO tenant_settings (tenant_id, stripe_account_id, updated_at) VALUES (?, 'acct_ref_1', ?) ON CONFLICT(tenant_id) DO UPDATE SET stripe_account_id = 'acct_ref_1'").bind(ctx.active.tenantId, new Date().toISOString()).run();
    const payload = JSON.stringify({ id: "evt_refund_1", account: "acct_ref_1", type: "charge.refunded", data: { object: { id: "ch_test_1" } } });
    const r = await SELF.fetch("http://x/api/connect/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": await stripeSig(payload, secret) }, body: payload });
    expect(r.status).toBe(200);
    const notif = (await db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE tenant_id = ? AND type = 'payment_refunded'").bind(ctx.active.tenantId).first<{ n: number }>())!;
    expect(notif.n).toBeGreaterThanOrEqual(1);
  });

  it("recurring: subscription checkout grants period one + a renewal cycle tops up", async () => {
    const db = env.DB as D1Database;
    const secret = "whsec_connect_test";
    await db.prepare("INSERT INTO app_config (key, value) VALUES ('stripe.connect_webhook_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(secret).run();
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    // Connect grants now require event.account to map back to the tenant — pin one.
    await db.prepare("INSERT INTO tenant_settings (tenant_id, stripe_account_id, updated_at) VALUES (?, 'acct_recur_1', ?) ON CONFLICT(tenant_id) DO UPDATE SET stripe_account_id = 'acct_recur_1'").bind(ctx.active.tenantId, new Date().toISOString()).run();
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "RecurBuyer" }) })).json()) as { client: { id: string } };
    const pkgId = "pkg_recur_1";
    await db.prepare("INSERT INTO packages (id, tenant_id, name, monthly_price_cents, budgets_json, currency, active, created_at) VALUES (?, ?, ?, ?, ?, 'usd', 1, ?)")
      .bind(pkgId, ctx.active.tenantId, "Monthly Coaching", 4900, JSON.stringify([{ feature: "all", days: 30 }]), new Date().toISOString()).run();

    const post = async (payload: string) => SELF.fetch("http://x/api/connect/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": await stripeSig(payload, secret) }, body: payload });

    // Period one via subscription-mode checkout.
    const created = JSON.stringify({ id: "evt_sub_create", account: "acct_recur_1", type: "checkout.session.completed", data: { object: { id: "cs_sub_1", mode: "subscription", subscription: "sub_recur_1", metadata: { mossa_tenant: ctx.active.tenantId, mossa_client: client.id, mossa_package: pkgId } } } });
    expect((await post(created)).status).toBe(200);
    const days1 = (await (await SELF.fetch(`http://x/api/subscriptions?clientId=${client.id}`, { headers: auth(ownerCookie) })).json()) as { subscriptions: { daysRemaining: number; autoRenew?: boolean; budgets: unknown[] }[] };
    const sub1 = days1.subscriptions.find((s) => (s.budgets?.length ?? 0) > 0)!;
    expect(sub1.autoRenew).toBe(true);
    expect(sub1.daysRemaining).toBeGreaterThan(20);
    const budgetsAfterCreate = sub1.budgets.length;

    // A renewal cycle tops the budget up (queued behind the current period).
    const renew = JSON.stringify({ id: "evt_sub_cycle", account: "acct_recur_1", type: "invoice.paid", data: { object: { subscription: "sub_recur_1", billing_reason: "subscription_cycle" } } });
    expect((await post(renew)).status).toBe(200);
    const days2 = (await (await SELF.fetch(`http://x/api/subscriptions?clientId=${client.id}`, { headers: auth(ownerCookie) })).json()) as { subscriptions: { daysRemaining: number; budgets: unknown[] }[] };
    const sub2 = days2.subscriptions.find((s) => (s.budgets?.length ?? 0) > 0)!;
    expect(sub2.budgets.length).toBeGreaterThan(budgetsAfterCreate); // another period queued
    expect(sub2.daysRemaining).toBeGreaterThan(sub1.daysRemaining);
  });

  it("inline one-time: payment_intent.succeeded grants the client package", async () => {
    const db = env.DB as D1Database;
    const secret = "whsec_connect_test";
    await db.prepare("INSERT INTO app_config (key, value) VALUES ('stripe.connect_webhook_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(secret).run();
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    await db.prepare("INSERT INTO tenant_settings (tenant_id, stripe_account_id, updated_at) VALUES (?, 'acct_inline_1', ?) ON CONFLICT(tenant_id) DO UPDATE SET stripe_account_id = 'acct_inline_1'").bind(ctx.active.tenantId, new Date().toISOString()).run();
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "InlineBuyer" }) })).json()) as { client: { id: string } };
    const pkgId = "pkg_inline_ot";
    await db.prepare("INSERT INTO packages (id, tenant_id, name, one_time_price_cents, budgets_json, currency, active, created_at) VALUES (?, ?, ?, ?, ?, 'usd', 1, ?)")
      .bind(pkgId, ctx.active.tenantId, "Inline Pack", 3000, JSON.stringify([{ feature: "all", days: 20 }]), new Date().toISOString()).run();
    const payload = JSON.stringify({ id: "evt_pi_ot_1", account: "acct_inline_1", type: "payment_intent.succeeded", data: { object: { id: "pi_ot_1", metadata: { mossa_tenant: ctx.active.tenantId, mossa_client: client.id, mossa_package: pkgId } } } });
    const r = await SELF.fetch("http://x/api/connect/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": await stripeSig(payload, secret) }, body: payload });
    expect(r.status).toBe(200);
    const subs = (await (await SELF.fetch(`http://x/api/subscriptions?clientId=${client.id}`, { headers: auth(ownerCookie) })).json()) as { subscriptions: { daysRemaining: number; budgets: unknown[] }[] };
    const granted = subs.subscriptions.find((s) => (s.budgets?.length ?? 0) > 0)!;
    expect(granted.daysRemaining).toBeGreaterThan(15);
  });
});

describe("auth — sign-out revokes the session", () => {
  it("POST /api/auth/sign-out clears the cookie; the same cookie is then 401", async () => {
    const cookie = await signInFlow("logout-tester@test.dev", "Logout Studio");
    // Same-origin requests (URL host must match the Origin header, exactly as a
    // real browser sends — Better Auth rejects a missing/untrusted origin).
    expect((await SELF.fetch(`${ORIGIN}/api/context`, { headers: auth(cookie) })).status).toBe(200);
    // Sign out exactly as the client does — a well-formed POST with a body.
    const out = await SELF.fetch(`${ORIGIN}/api/auth/sign-out`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(cookie) },
      body: "{}",
    });
    expect(out.status).toBe(200);
    // The session is revoked server-side — the same cookie no longer authenticates.
    expect((await SELF.fetch(`${ORIGIN}/api/context`, { headers: auth(cookie) })).status).toBe(401);
  });
});

describe("notifications — email provider + per-user preferences", () => {
  it("owner sets Brevo (key masked) and tunes notification channels", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    // Configure Brevo as the tenant email provider.
    const patch = await SELF.fetch("http://x/api/settings", { method: "PATCH", headers: H, body: JSON.stringify({ email: { provider: "brevo", brevoApiKey: "xkeysib-secret", senderEmail: "coach@studio.com", senderName: "Studio" } }) });
    expect(patch.status).toBe(200);
    const settings = (await (await SELF.fetch("http://x/api/settings", { headers: auth(ownerCookie) })).json()) as { email: { provider: string; brevoKeySet: boolean; ready: boolean; senderEmail: string }; emailPlatformFrom: string };
    expect(settings.email.provider).toBe("brevo");
    expect(settings.email.brevoKeySet).toBe(true); // masked — the key itself never returns
    expect(settings.email.ready).toBe(true);
    expect(settings.email.senderEmail).toBe("coach@studio.com");
    expect(settings.emailPlatformFrom).toContain("fourdegreelabs.com");

    // Notification preferences: categories scoped to the owner role + defaults.
    const prefs0 = (await (await SELF.fetch("http://x/api/notification-prefs", { headers: auth(ownerCookie) })).json()) as { categories: { key: string }[]; prefs: Record<string, { inbox: boolean; email: boolean }> };
    expect(prefs0.categories.some((c) => c.key === "billing")).toBe(true);
    expect(prefs0.categories.some((c) => c.key === "commerce")).toBe(false); // client-only
    expect(prefs0.prefs["check-ins"]!.email).toBe(false); // coach default: digest-only

    // Turn coach check-in emails on; the change round-trips.
    await SELF.fetch("http://x/api/notification-prefs", { method: "PATCH", headers: H, body: JSON.stringify({ "check-ins": { email: true } }) });
    const prefs1 = (await (await SELF.fetch("http://x/api/notification-prefs", { headers: auth(ownerCookie) })).json()) as { prefs: Record<string, { email: boolean }> };
    expect(prefs1.prefs["check-ins"]!.email).toBe(true);
  });

  it("a body-fat reading notifies the primary trainer (never the logger), deduped per day", async () => {
    const db = env.DB as D1Database;
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    const tenantId = ctx.active.tenantId;
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "BodyFatBella", heightCm: 170 }) })).json()) as { client: { id: string } };

    // The owner created the client → they are its primary trainer AND the logger,
    // so logging a reading themself must NOT self-notify.
    await SELF.fetch("http://x/api/measurements", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-03-01", weightKg: 68, bodyFatPercent: 24 } }) });
    const selfN = (await db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE tenant_id = ? AND type = 'body_fat_logged'").bind(tenantId).first<{ n: number }>())!;
    expect(selfN.n).toBe(0);

    // Re-point the primary trainer to a different (real) staff member → the next
    // reading, logged by the owner, notifies that trainer under body-composition.
    await db.prepare("INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt) VALUES ('mem_ghostcoach', ?, 'usr_ghostcoach', 'trainer', '2026-01-01')").bind(tenantId).run();
    await db.prepare("UPDATE client_trainers SET trainer_user_id = 'usr_ghostcoach' WHERE client_id = ?").bind(client.id).run();
    await SELF.fetch("http://x/api/measurements", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-03-02", bodyFatPercent: 23 } }) });
    const ghost = (await db.prepare("SELECT category, title, message FROM notifications WHERE recipient_user_id = 'usr_ghostcoach' AND type = 'body_fat_logged'").first<{ category: string; title: string; message: string }>())!;
    expect(ghost.category).toBe("body-composition");
    expect(ghost.title).toContain("BodyFatBella");
    expect(ghost.message).toContain("23% body fat");

    // Dedupe: re-logging the same day upserts the reading but doesn't re-notify.
    await SELF.fetch("http://x/api/measurements", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-03-02", bodyFatPercent: 22 } }) });
    const dup = (await db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = 'usr_ghostcoach' AND type = 'body_fat_logged'").first<{ n: number }>())!;
    expect(dup.n).toBe(1);
  });

  it("check-ins carry the body-fat reading as of each check-in's date", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "AsOfAva", heightCm: 165 }) })).json()) as { client: { id: string } };

    // A check-in BEFORE any body-fat reading has no body-fat context.
    await SELF.fetch("http://x/api/check-ins", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-04-01", mood: 4 } }) });
    // A body-fat reading lands mid-window, then a later check-in.
    await SELF.fetch("http://x/api/measurements", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-04-05", bodyFatPercent: 21 } }) });
    await SELF.fetch("http://x/api/check-ins", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-04-10", mood: 5 } }) });

    const { checkIns } = (await (await SELF.fetch(`http://x/api/check-ins?clientId=${client.id}`, { headers: auth(ownerCookie) })).json()) as { checkIns: { date_local: string; body_fat_percent: number | null }[] };
    const byDate = Object.fromEntries(checkIns.map((ci) => [ci.date_local, ci.body_fat_percent]));
    expect(byDate["2026-04-10"]).toBe(21); // as-of the 04-05 reading
    expect(byDate["2026-04-01"]).toBe(null); // predates any reading → no context
  });

  it("owner governs the studio-wide email allow-list, per audience (clients vs staff)", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    type Pol = { notifCategories: { key: string }[]; notifPolicy: { client: Record<string, boolean>; staff: Record<string, boolean> } };
    const s0 = (await (await SELF.fetch("http://x/api/settings", { headers: auth(ownerCookie) })).json()) as Pol;
    expect(s0.notifCategories.some((c) => c.key === "body-composition")).toBe(true);
    expect(s0.notifPolicy.staff["body-composition"]).toBe(true); // default: allowed

    // Disable STAFF email for a couple of categories; junk keys are dropped.
    await SELF.fetch("http://x/api/settings", { method: "PATCH", headers: H, body: JSON.stringify({ notifPolicy: { staff: { "body-composition": false, labs: false, "nonsense-cat": true } } }) });
    const s1 = (await (await SELF.fetch("http://x/api/settings", { headers: auth(ownerCookie) })).json()) as Pol;
    expect(s1.notifPolicy.staff["body-composition"]).toBe(false);
    expect(s1.notifPolicy.staff["labs"]).toBe(false);
    expect("nonsense-cat" in s1.notifPolicy.staff).toBe(false);
    // The CLIENT audience is independent — labs email to clients stays allowed.
    expect(s1.notifPolicy.client["labs"]).toBe(true);

    // Re-enable so the flags don't leak into other suites.
    await SELF.fetch("http://x/api/settings", { method: "PATCH", headers: H, body: JSON.stringify({ notifPolicy: { staff: { "body-composition": true, labs: true } } }) });
  });
});

describe("notification coverage — new signals", () => {
  const H = () => ({ "content-type": "application/json", ...auth(ownerCookie) });
  // A real, non-logger staff member to receive the staff-facing notifications.
  async function ghostTrainer(tenantId: string) {
    const db = env.DB as D1Database;
    await db.prepare("INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt) VALUES ('mem_ntcoach', ?, 'usr_ntcoach', 'trainer', '2026-01-01')").bind(tenantId).run();
    return "usr_ntcoach";
  }
  // A client with a linked user + client member row, so client-facing notifs
  // resolve a real role (not "member", which zeroes every channel).
  async function clientWithUser(name: string, tenantId: string, userId: string, clientId: string) {
    const db = env.DB as D1Database;
    await db.prepare("INSERT OR IGNORE INTO \"user\" (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, '2026-01-01', '2026-01-01')").bind(userId, name, `${userId}@ex.com`).run();
    await db.prepare("INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, 'client', '2026-01-01')").bind(`mem_${userId}`, tenantId, userId).run();
    await db.prepare("UPDATE clients SET user_id = ? WHERE id = ?").bind(userId, clientId).run();
  }

  it("a completed body scan notifies the primary trainer (deduped, distinct from manual)", async () => {
    const db = env.DB as D1Database;
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    const tenantId = ctx.active.tenantId;
    const coach = await ghostTrainer(tenantId);
    const clientId = ((await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H(), body: JSON.stringify({ displayName: "ScanBella" }) })).json()) as { client: { id: string } }).client.id;
    await db.prepare("UPDATE clients SET gender='female', date_of_birth='1992-01-01', height_cm=168 WHERE id=?").bind(clientId).run();
    await db.prepare("UPDATE client_trainers SET trainer_user_id = ? WHERE client_id = ?").bind(coach, clientId).run();

    const res = await SELF.fetch("http://x/api/body-scans", { method: "POST", headers: H(), body: JSON.stringify({ clientId, date: "2026-05-01", weightKg: 64, circumferences: { neckCm: 33, waistCm: 74 }, storeSilhouette: false }) });
    expect(res.status).toBe(200);
    const notif = (await db.prepare("SELECT category, title, message FROM notifications WHERE recipient_user_id = ? AND type = 'body_fat_logged' AND title LIKE '%body scan%'").bind(coach).first<{ category: string; title: string; message: string }>())!;
    expect(notif.category).toBe("body-composition");
    expect(notif.title).toContain("ScanBella");
    expect(notif.message).toContain("% body fat");

    // Re-scanning the same day upserts but doesn't re-notify (bfscan_ dedupe key).
    await SELF.fetch("http://x/api/body-scans", { method: "POST", headers: H(), body: JSON.stringify({ clientId, date: "2026-05-01", weightKg: 63, circumferences: { neckCm: 33, waistCm: 73 }, storeSilhouette: false }) });
    const dup = (await db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = ? AND type = 'body_fat_logged' AND title LIKE '%body scan%'").bind(coach).first<{ n: number }>())!;
    expect(dup.n).toBe(1);
  });

  it("beating an all-time e1RM notifies the trainer once per exercise/day; the first-ever lift is silent", async () => {
    const db = env.DB as D1Database;
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    const tenantId = ctx.active.tenantId;
    const coach = await ghostTrainer(tenantId);
    const clientId = ((await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H(), body: JSON.stringify({ displayName: "PRPete" }) })).json()) as { client: { id: string } }).client.id;
    await db.prepare("UPDATE client_trainers SET trainer_user_id = ? WHERE client_id = ?").bind(coach, clientId).run();
    await db.prepare("INSERT OR IGNORE INTO exercises (id, tenant_id, name, active) VALUES ('ex_bench', ?, 'Bench Press', 1)").bind(tenantId).run();

    const logSet = (date: string, weightKg: number, reps: number) => SELF.fetch("http://x/api/logs/workout-sets", { method: "POST", headers: H(), body: JSON.stringify({ clientId, data: { date, workoutPlanId: "wp-pr", planDayIndex: 0, blockIndex: 0, slotIndex: 0, exerciseId: "ex_bench", sets: [{ setIndex: 0, reps, weightKg, completed: true }] } }) });
    const prCount = async () => (await db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = ? AND type = 'pr_achieved'").bind(coach).first<{ n: number }>())!.n;

    // First-ever lift establishes the baseline — no PR notification.
    await logSet("2026-05-02", 60, 5);
    expect(await prCount()).toBe(0);
    // A heavier lift beats the baseline → one PR notification.
    await logSet("2026-05-03", 80, 5);
    expect(await prCount()).toBe(1);
    const pr = (await db.prepare("SELECT category, title, message, link FROM notifications WHERE recipient_user_id = ? AND type = 'pr_achieved'").bind(coach).first<{ category: string; title: string; message: string; link: string }>())!;
    expect(pr.category).toBe("activity");
    expect(pr.title).toContain("PRPete");
    expect(pr.title).toContain("Bench Press");
    expect(pr.link).toContain(clientId);
    // Another beat the SAME day is deduped to one per exercise/day.
    await logSet("2026-05-03", 90, 5);
    expect(await prCount()).toBe(1);
    // The ledger tracked the best (90×5 e1RM), so a 3rd, higher day beats it again.
    await logSet("2026-05-04", 100, 5);
    expect(await prCount()).toBe(2);
  });

  it("a supplement status/dose change notifies the client; a notes-only edit is silent", async () => {
    const db = env.DB as D1Database;
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    const tenantId = ctx.active.tenantId;
    const clientId = ((await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H(), body: JSON.stringify({ displayName: "SuppSam" }) })).json()) as { client: { id: string } }).client.id;
    await clientWithUser("SuppSam", tenantId, "usr_suppclient", clientId);
    const sup = (await (await SELF.fetch("http://x/api/supplements", { method: "POST", headers: H(), body: JSON.stringify({ clientId, name: "Creatine", schedule: [{ slot: "daily" }] }) })).json()) as { id: string };

    // Pausing it is an actionable change → the client is told.
    await SELF.fetch(`http://x/api/supplements/${sup.id}`, { method: "PATCH", headers: H(), body: JSON.stringify({ status: "paused" }) });
    const notif = (await db.prepare("SELECT category, title, message FROM notifications WHERE recipient_user_id = 'usr_suppclient' AND type = 'supplement_updated'").first<{ category: string; title: string; message: string }>())!;
    expect(notif.category).toBe("labs");
    expect(notif.message).toContain("Creatine");
    expect(notif.message).toContain("paused");

    // A notes-only edit doesn't notify (no status/dose change).
    await SELF.fetch(`http://x/api/supplements/${sup.id}`, { method: "PATCH", headers: H(), body: JSON.stringify({ notes: "take with water" }) });
    const after = (await db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = 'usr_suppclient' AND type = 'supplement_updated'").first<{ n: number }>())!;
    expect(after.n).toBe(1);
  });

  it("granting and extending access notifies the client", async () => {
    const db = env.DB as D1Database;
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    const tenantId = ctx.active.tenantId;
    const clientId = ((await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H(), body: JSON.stringify({ displayName: "AccessAmy" }) })).json()) as { client: { id: string } }).client.id;
    await clientWithUser("AccessAmy", tenantId, "usr_accessclient", clientId);
    await SELF.fetch("http://x/api/packages", { method: "POST", headers: H(), body: JSON.stringify({ name: "AccessPack", budgets: [{ feature: "all", days: 30 }] }) });
    const pkgs = (await (await SELF.fetch("http://x/api/packages", { headers: auth(ownerCookie) })).json()) as { packages: { id: string; name: string }[] };
    const pkg = pkgs.packages.find((p) => p.name === "AccessPack")!;

    // First grant opens a subscription → "new access".
    await SELF.fetch("http://x/api/subscriptions/grant", { method: "POST", headers: H(), body: JSON.stringify({ clientId, packageId: pkg.id }) });
    const granted = (await db.prepare("SELECT category, title, message FROM notifications WHERE recipient_user_id = 'usr_accessclient' AND type = 'access_granted'").first<{ category: string; title: string; message: string }>())!;
    expect(granted.category).toBe("commerce");
    expect(granted.message).toContain("AccessPack");

    // Second grant extends the live subscription → an "extended" notification.
    await SELF.fetch("http://x/api/subscriptions/grant", { method: "POST", headers: H(), body: JSON.stringify({ clientId, packageId: pkg.id }) });
    const all = await db.prepare("SELECT title FROM notifications WHERE recipient_user_id = 'usr_accessclient' AND type = 'access_granted'").all<{ title: string }>();
    expect(all.results.length).toBe(2);
    expect(all.results.some((r) => r.title.includes("extended"))).toBe(true);
  });

  it("notification links carry the specific item (deep-link params)", async () => {
    const db = env.DB as D1Database;
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    const tenantId = ctx.active.tenantId;
    const coach = await ghostTrainer(tenantId);
    const clientId = ((await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H(), body: JSON.stringify({ displayName: "DeepLinkDan" }) })).json()) as { client: { id: string } }).client.id;
    await clientWithUser("DeepLinkDan", tenantId, "usr_dlclient", clientId);
    await db.prepare("UPDATE client_trainers SET trainer_user_id = ? WHERE client_id = ?").bind(coach, clientId).run();

    // A client check-in → the trainer's notification deep-links to that check-in.
    const chk = (await (await SELF.fetch("http://x/api/check-ins", { method: "POST", headers: H(), body: JSON.stringify({ clientId, data: { date: "2026-06-01", mood: 4, notes: "good week" } }) })).json()) as { id: string };
    const ciLink = (await db.prepare("SELECT link FROM notifications WHERE recipient_user_id = ? AND type = 'check_in'").bind(coach).first<{ link: string }>())!.link;
    expect(ciLink).toBe(`/clients/${clientId}/manage?checkin=${chk.id}`);

    // Coach feedback → the client's notification deep-links to the check-in by date.
    await SELF.fetch(`http://x/api/check-ins/${chk.id}/feedback`, { method: "POST", headers: H(), body: JSON.stringify({ clientId, feedback: "great job" }) });
    const fbLink = (await db.prepare("SELECT link FROM notifications WHERE recipient_user_id = 'usr_dlclient' AND type = 'feedback'").first<{ link: string }>())!.link;
    expect(fbLink).toBe("/wellness?checkin=2026-06-01");

    // A lab request → the client's notification deep-links to that lab on Wellness.
    const lab = (await (await SELF.fetch("http://x/api/labs", { method: "POST", headers: H(), body: JSON.stringify({ clientId, type: "bloodwork", displayName: "Full panel" }) })).json()) as { id: string };
    const labLink = (await db.prepare("SELECT link FROM notifications WHERE recipient_user_id = 'usr_dlclient' AND type = 'lab_requested'").first<{ link: string }>())!.link;
    expect(labLink).toBe(`/wellness?lab=${lab.id}`);
  });
});

describe("platform rail — dunning notifies the owner", () => {
  async function stripeSig(payload: string, secret: string): Promise<string> {
    const t = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
    return `t=${t},v1=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  }

  it("invoice.payment_failed → past_due + an owner notification", async () => {
    const db = env.DB as D1Database;
    const secret = "whsec_platform_test";
    await db.prepare("INSERT INTO app_config (key, value) VALUES ('stripe.webhook_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(secret).run();
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    const payload = JSON.stringify({ id: "evt_pf_1", type: "invoice.payment_failed", data: { object: { id: "in_test_1", metadata: { mossa_tenant: ctx.active.tenantId } } } });
    const r = await SELF.fetch("http://x/api/stripe/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": await stripeSig(payload, secret) }, body: payload });
    expect(r.status).toBe(200);

    const billing = (await (await SELF.fetch("http://x/api/billing", { headers: auth(ownerCookie) })).json()) as { subscription: { status: string } };
    expect(billing.subscription.status).toBe("past_due");

    const notif = (await db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE tenant_id = ? AND type = 'billing_past_due'").bind(ctx.active.tenantId).first<{ n: number }>())!;
    expect(notif.n).toBeGreaterThanOrEqual(1);
  });
});

describe("AI config (per-tenant model / prompt / tone / enable)", () => {
  it("exposes the registry + catalog and drives generation via per-feature overrides", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    // Entitle the AI suite.
    await SELF.fetch(`http://x/api/admin/tenants/${ctx.active.tenantId}/plan`, { method: "POST", headers: H, body: JSON.stringify({ planId: "studio" }) });

    // GET /settings/ai — registry + expanded model catalog + tones.
    const reg = (await (await SELF.fetch("http://x/api/settings/ai", { headers: auth(ownerCookie) })).json()) as {
      features: { key: string; audience: string }[]; models: { id: string; task: string }[]; tones: string[]; config: Record<string, unknown>;
    };
    expect(reg.features.some((f) => f.key === "coach-note" && f.audience === "client")).toBe(true);
    expect(reg.features.some((f) => f.key === "draft-plan" && f.audience === "trainer")).toBe(true);
    expect(reg.models.some((m) => m.id === "@cf/meta/llama-3.1-8b-instruct-fast")).toBe(true);
    expect(reg.tones).toContain("motivating");

    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "AICfg" }) })).json()) as { client: { id: string } };

    // Disable parse-food + set a house tone; the endpoint must now refuse.
    await SELF.fetch("http://x/api/settings/ai", { method: "PATCH", headers: H, body: JSON.stringify({ tone: "motivating", features: { "parse-food": { enabled: false } } }) });
    const cfg2 = (await (await SELF.fetch("http://x/api/settings/ai", { headers: auth(ownerCookie) })).json()) as { config: { tone: string; features: Record<string, { enabled: boolean }> } };
    expect(cfg2.config.tone).toBe("motivating");
    expect(cfg2.config.features["parse-food"]!.enabled).toBe(false);
    const off = await SELF.fetch("http://x/api/ai/parse-food", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, text: "eggs" }) });
    expect(off.status).toBe(503);
    // The failure is diagnosable — the real reason is surfaced, not hidden.
    const offBody = (await off.json()) as { error: string; detail?: string };
    expect(offBody.detail ?? offBody.error).toContain("turned off");

    // Re-enable with a model override — generation runs again (mock lane).
    await SELF.fetch("http://x/api/settings/ai", { method: "PATCH", headers: H, body: JSON.stringify({ features: { "parse-food": { enabled: true, model: "@cf/meta/llama-3.1-8b-instruct-fast" } } }) });
    const on = await SELF.fetch("http://x/api/ai/parse-food", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, text: "eggs" }) });
    expect(on.status).toBe(200);
    // The earlier tone edit is preserved across the second PATCH (deep merge).
    const cfg3 = (await (await SELF.fetch("http://x/api/settings/ai", { headers: auth(ownerCookie) })).json()) as { config: { tone: string; features: Record<string, { enabled: boolean; model: string }> } };
    expect(cfg3.config.tone).toBe("motivating");
    expect(cfg3.config.features["parse-food"]).toMatchObject({ enabled: true, model: "@cf/meta/llama-3.1-8b-instruct-fast" });
  });
});

describe("client self-profile", () => {
  it("persists blood type, phone, dob and gender (male/female only)", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "Profile Tester" }) })).json()) as { client: { id: string } };
    const upd = await SELF.fetch(`http://x/api/clients/${client.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ bloodType: "O+", phone: "+1 555 111 2222", dateOfBirth: "1990-05-01", gender: "female" }) });
    expect(upd.status).toBe(200);
    const got = (await (await SELF.fetch(`http://x/api/clients/${client.id}`, { headers: auth(ownerCookie) })).json()) as { client: { bloodType: string; phone: string; dateOfBirth: string; gender: string } };
    expect(got.client).toMatchObject({ bloodType: "O+", phone: "+1 555 111 2222", dateOfBirth: "1990-05-01", gender: "female" });
    // Gender is restricted to male/female (BMR); anything else is rejected.
    expect((await SELF.fetch(`http://x/api/clients/${client.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ gender: "other" }) })).status).toBe(400);
  });
});

describe("entitlement plan builder + grandfathering", () => {
  it("lowering a plan grandfathers existing tenants; new tenants get the lower plan; gifts only raise", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const t1 = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json() as { active: { tenantId: string } }).active.tenantId;
    // Put tenant 1 on studio (activeClients 100, branding on).
    await SELF.fetch(`http://x/api/admin/tenants/${t1}/plan`, { method: "POST", headers: H, body: JSON.stringify({ planId: "studio" }) });

    const plans = (await (await SELF.fetch("http://x/api/admin/plans", { headers: auth(ownerCookie) })).json()) as { plans: { id: string; entitlements: { quotas: Record<string, number>; features: Record<string, boolean>; aiCredits: { monthlyGrant: number } } }[]; featureKeys: string[] };
    const studio = plans.plans.find((p) => p.id === "studio")!;
    expect(studio.entitlements.quotas.activeClients).toBe(100);
    expect(plans.featureKeys).toContain("aiSuite");

    // Lower the plan: activeClients 100→25, disable branding.
    const lowered = { quotas: { ...studio.entitlements.quotas, activeClients: 25 }, features: { ...studio.entitlements.features, branding: false }, aiCredits: studio.entitlements.aiCredits };
    const patch = (await (await SELF.fetch("http://x/api/admin/plans/studio", { method: "PATCH", headers: H, body: JSON.stringify({ entitlements: lowered }) })).json()) as { grandfathered: number };
    expect(patch.grandfathered).toBeGreaterThanOrEqual(1);

    // Tenant 1 (existing) keeps the old ceiling + feature.
    const e1 = (await (await SELF.fetch(`http://x/api/admin/tenants/${t1}/entitlements`, { headers: auth(ownerCookie) })).json()) as { effective: { quotas: Record<string, number>; features: Record<string, boolean> } };
    expect(e1.effective.quotas.activeClients).toBe(100);
    expect(e1.effective.features.branding).toBe(true);

    // A tenant joining studio AFTER the change gets the lower plan.
    const t2 = (await (await SELF.fetch("http://x/api/context", { headers: auth(otherCookie) })).json() as { active: { tenantId: string } }).active.tenantId;
    await SELF.fetch(`http://x/api/admin/tenants/${t2}/plan`, { method: "POST", headers: H, body: JSON.stringify({ planId: "studio" }) });
    const e2 = (await (await SELF.fetch(`http://x/api/admin/tenants/${t2}/entitlements`, { headers: auth(ownerCookie) })).json()) as { effective: { quotas: Record<string, number>; features: Record<string, boolean> } };
    expect(e2.effective.quotas.activeClients).toBe(25);
    expect(e2.effective.features.branding).toBe(false);

    // Gift tenant 2 more (grant-only): raise clients, unlock branding.
    await SELF.fetch(`http://x/api/admin/tenants/${t2}/overrides`, { method: "PATCH", headers: H, body: JSON.stringify({ grants: { quotas: { activeClients: 500 }, features: { branding: true } } }) });
    const g1 = (await (await SELF.fetch(`http://x/api/admin/tenants/${t2}/entitlements`, { headers: auth(ownerCookie) })).json()) as { effective: { quotas: Record<string, number>; features: Record<string, boolean> } };
    expect(g1.effective.quotas.activeClients).toBe(500);
    expect(g1.effective.features.branding).toBe(true);

    // A gift can never lower: trying to set 10 keeps 500.
    await SELF.fetch(`http://x/api/admin/tenants/${t2}/overrides`, { method: "PATCH", headers: H, body: JSON.stringify({ grants: { quotas: { activeClients: 10 } } }) });
    const g2 = (await (await SELF.fetch(`http://x/api/admin/tenants/${t2}/entitlements`, { headers: auth(ownerCookie) })).json()) as { effective: { quotas: Record<string, number> } };
    expect(g2.effective.quotas.activeClients).toBe(500);
  });
});

describe("capability gates enforce plan features + quotas", () => {
  // Studio Two = free plan. Build headers inside each test — `otherCookie` is
  // only assigned in beforeAll, after the describe body has been collected.
  const H = () => ({ "content-type": "application/json", ...auth(otherCookie) });

  it("free plan blocks commerce + supplements/labs at write time", async () => {
    // Commerce package creation is gated behind features.commerce.
    const pkg = await SELF.fetch("http://x/api/packages", {
      method: "POST", headers: H(),
      body: JSON.stringify({ name: "30-day", budgets: [{ feature: "all", days: 30 }] }),
    });
    expect(pkg.status).toBe(403);

    // Labs are gated behind features.supplementsLabs.
    const { client } = (await (await SELF.fetch("http://x/api/clients", {
      method: "POST", headers: H(), body: JSON.stringify({ displayName: "GateTest" }),
    })).json()) as { client: { id: string } };
    const lab = await SELF.fetch("http://x/api/labs", {
      method: "POST", headers: H(), body: JSON.stringify({ clientId: client.id, type: "blood_panel" }),
    });
    expect(lab.status).toBe(403);
  });

  it("free plan blocks adding clients past the activeClients ceiling (3)", async () => {
    const mk = (n: string) => SELF.fetch("http://x/api/clients", { method: "POST", headers: H(), body: JSON.stringify({ displayName: n }) });
    expect((await mk("C1")).status).toBe(201);
    expect((await mk("C2")).status).toBe(201);
    expect((await mk("C3")).status).toBe(201);
    const over = await mk("C4"); // free cap is 3
    expect(over.status).toBe(403);
    expect((await over.json() as { limit: number }).limit).toBe(3);
  });

  it("a gifted feature opens the gate for that tenant", async () => {
    const t = (await (await SELF.fetch("http://x/api/context", { headers: auth(otherCookie) })).json() as { active: { tenantId: string } }).active.tenantId;
    // Gift commerce (grant-only override) — admin lane (ownerCookie is admin in test env).
    await SELF.fetch(`http://x/api/admin/tenants/${t}/overrides`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ grants: { features: { commerce: true } } }),
    });
    const pkg = await SELF.fetch("http://x/api/packages", {
      method: "POST", headers: H(),
      body: JSON.stringify({ name: "Gifted", budgets: [{ feature: "all", days: 30 }] }),
    });
    expect(pkg.status).toBe(201);
  });
});

describe("AI model catalog + markup (platform admin)", () => {
  it("sets a global markup applied to every model, and toggles models", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const cfg1 = (await (await SELF.fetch("http://x/api/admin/ai/config", { headers: auth(ownerCookie) })).json()) as { markup: number; modelCount: number };
    expect(cfg1.markup).toBe(3);
    expect(cfg1.modelCount).toBeGreaterThanOrEqual(3);

    // Raise markup — must apply to every catalog model (profit stays markup×).
    await SELF.fetch("http://x/api/admin/ai/config", { method: "POST", headers: H, body: JSON.stringify({ markup: 5 }) });
    const cfg2 = (await (await SELF.fetch("http://x/api/admin/ai/config", { headers: auth(ownerCookie) })).json()) as { markup: number };
    expect(cfg2.markup).toBe(5);
    const list = (await (await SELF.fetch("http://x/api/admin/ai/models", { headers: auth(ownerCookie) })).json()) as { models: { id: string; markup: number; enabled: number }[] };
    expect(list.models.length).toBeGreaterThan(0);
    expect(list.models.every((m) => m.markup === 5)).toBe(true);

    // Disable a model, then it reads back disabled in the full catalog.
    const id = list.models[0]!.id;
    await SELF.fetch(`http://x/api/admin/ai/models/${encodeURIComponent(id)}`, { method: "PATCH", headers: H, body: JSON.stringify({ enabled: false }) });
    const list2 = (await (await SELF.fetch("http://x/api/admin/ai/models", { headers: auth(ownerCookie) })).json()) as { models: { id: string; enabled: number }[] };
    expect(list2.models.find((m) => m.id === id)!.enabled).toBe(0);
  });
});

describe("AI meal draft — library-grounded (never fabricated)", () => {
  it("builds meals ONLY from real library food ids, dropping nothing off-library", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    await SELF.fetch(`http://x/api/admin/tenants/${ctx.active.tenantId}/plan`, { method: "POST", headers: H, body: JSON.stringify({ planId: "studio" }) });
    // Seed a food; the library-grounded mock draft references it by id.
    const { id: foodId } = (await (await SELF.fetch("http://x/api/foods", { method: "POST", headers: H, body: JSON.stringify({ name: "Rolled Oats", calories: 380, proteinG: 13, carbsG: 67, fatG: 7 }) })).json()) as { id: string };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "MealAI" }) })).json()) as { client: { id: string } };

    const r = (await (await SELF.fetch("http://x/api/ai/draft-meal", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id }) })).json()) as { draft: { mealOptions: { mealType: string; foods: { foodId: string; quantity: number; unit: string }[] }[] }; dropped: string[] };
    const breakfast = r.draft.mealOptions.find((o) => o.mealType === "breakfast")!;
    expect(breakfast.foods.length).toBeGreaterThan(0);
    // Every drafted food is a REAL library row — here, the seeded food id.
    const all = r.draft.mealOptions.flatMap((o) => o.foods);
    expect(all.every((f) => f.foodId === foodId)).toBe(true);
    expect(breakfast.foods[0]!.quantity).toBeGreaterThan(0);
    // Nothing was fabricated, so nothing was dropped either.
    expect(r.dropped).toEqual([]);
  });

  it("refuses to draft meals when the food library is empty", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    await SELF.fetch(`http://x/api/admin/tenants/${ctx.active.tenantId}/plan`, { method: "POST", headers: H, body: JSON.stringify({ planId: "studio" }) });
    // A fresh client in a tenant whose food library is empty — deactivate any
    // seeded foods first so the library truly has nothing to build from.
    const foods = (await (await SELF.fetch("http://x/api/foods", { headers: auth(ownerCookie) })).json()) as { foods: { id: string }[] };
    for (const f of foods.foods) await SELF.fetch(`http://x/api/foods/${f.id}`, { method: "DELETE", headers: auth(ownerCookie) });
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "EmptyLib" }) })).json()) as { client: { id: string } };
    const res = await SELF.fetch("http://x/api/ai/draft-meal", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id }) });
    expect(res.status).toBe(409);
  });
});

describe("AI workout draft — named exercises resolve to real ids", () => {
  it("drafts a plan and resolves each named exercise to a library/custom id", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    await SELF.fetch(`http://x/api/admin/tenants/${ctx.active.tenantId}/plan`, { method: "POST", headers: H, body: JSON.stringify({ planId: "studio" }) });
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "PlanAI" }) })).json()) as { client: { id: string } };
    const r = (await (await SELF.fetch("http://x/api/ai/draft-plan", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id }) })).json()) as { draft: { days: { blocks: { slots: { exerciseId: string }[] }[] }[] } };
    const slots = r.draft.days.flatMap((d) => d.blocks.flatMap((b) => b.slots));
    expect(slots.length).toBeGreaterThan(0);
    // Every slot carries a real exercise id (resolved, never a raw name).
    expect(slots.every((s) => typeof s.exerciseId === "string" && s.exerciseId.length > 0)).toBe(true);
    // The resolved id points at an actual library row.
    const ex = await SELF.fetch(`http://x/api/exercises?q=`, { headers: auth(ownerCookie) });
    const { exercises } = (await ex.json()) as { exercises: { id: string }[] };
    expect(exercises.some((e) => e.id === slots[0]!.exerciseId)).toBe(true);
  });
});

describe("AI exercise auto-fill (enum-constrained meta)", () => {
  it("returns muscles/equipment/force/mechanic folded onto the allowed vocab", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    await SELF.fetch(`http://x/api/admin/tenants/${ctx.active.tenantId}/plan`, { method: "POST", headers: H, body: JSON.stringify({ planId: "studio" }) });
    const r = await SELF.fetch("http://x/api/ai/exercise-meta", { method: "POST", headers: H, body: JSON.stringify({ name: "Back Squat" }) });
    expect(r.status).toBe(200);
    const { meta } = (await r.json()) as { meta: { primaryMuscles: string[]; equipment: string[]; force: string | null; mechanic: string | null } };
    // Fields are populated (not silently emptied by a too-strict filter).
    expect(meta.primaryMuscles.length).toBeGreaterThan(0);
    expect(meta.equipment.length).toBeGreaterThan(0);
    // Every value is a canonical slug from the allowed vocab.
    expect(meta.primaryMuscles.every((m) => (MUSCLE_GROUPS as readonly string[]).includes(m))).toBe(true);
    expect(meta.equipment.every((e) => (EQUIPMENT_TYPES as readonly string[]).includes(e))).toBe(true);
    expect(["compound", "isolation", null]).toContain(meta.mechanic);
  });
});

describe("AI image generation + recipe", () => {
  it("generates an original library image and recommends a recipe", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    await SELF.fetch(`http://x/api/admin/tenants/${ctx.active.tenantId}/plan`, { method: "POST", headers: H, body: JSON.stringify({ planId: "studio" }) });

    // Food image generation (mock lane) returns a tenant-scoped media url.
    const img = await SELF.fetch("http://x/api/ai/generate-image", { method: "POST", headers: H, body: JSON.stringify({ feature: "food-image", subject: "grilled salmon" }) });
    expect(img.status).toBe(200);
    const imgOut = (await img.json()) as { url: string; key: string };
    expect(imgOut.url).toContain(`/api/media/t/${ctx.active.tenantId}/`);

    // Image-to-image: generating the End from a Start reference (same-tenant key).
    const ref = await SELF.fetch("http://x/api/ai/generate-image", { method: "POST", headers: H, body: JSON.stringify({ feature: "exercise-image", subject: "barbell squat", hint: "the end position", referenceKey: imgOut.key }) });
    expect(ref.status).toBe(200);

    // Diptych (pair) mode: one wide start|end render the client splits in two.
    const pair = await SELF.fetch("http://x/api/ai/generate-image", { method: "POST", headers: H, body: JSON.stringify({ feature: "exercise-image", subject: "barbell curl", pair: true }) });
    expect(pair.status).toBe(200);
    const pairOut = (await pair.json()) as { url: string; pair: boolean };
    expect(pairOut.pair).toBe(true);
    expect(pairOut.url).toContain(`/api/media/t/${ctx.active.tenantId}/`);

    // Recipe from a meal's foods.
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "RecipeAI" }) })).json()) as { client: { id: string } };
    const rec = await SELF.fetch("http://x/api/ai/recipe", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, mealName: "Lunch", foods: [{ name: "chicken breast", quantity: 180, unit: "g" }, { name: "white rice", quantity: 150, unit: "g" }] }) });
    expect(rec.status).toBe(200);
    const recOut = (await rec.json()) as { recipe: string };
    expect(recOut.recipe.length).toBeGreaterThan(10);
    expect(recOut.recipe).toContain("Ingredients");

    // Exercise how-to guide.
    const guide = await SELF.fetch("http://x/api/ai/exercise-guide", { method: "POST", headers: H, body: JSON.stringify({ name: "Barbell Curl", muscleGroups: ["biceps"], equipment: ["barbell"] }) });
    expect(guide.status).toBe(200);
    const guideOut = (await guide.json()) as { guide: string };
    expect(guideOut.guide).toContain("Execution");

    // Auto-fill exercise metadata — only allowed-vocab values survive.
    const meta = await SELF.fetch("http://x/api/ai/exercise-meta", { method: "POST", headers: H, body: JSON.stringify({ name: "Barbell Back Squat" }) });
    expect(meta.status).toBe(200);
    const metaOut = (await meta.json()) as { meta: { primaryMuscles: string[]; equipment: string[]; difficulty: string | null; mechanic: string | null } };
    expect(metaOut.meta.primaryMuscles).toContain("quads");
    expect(metaOut.meta.equipment).toContain("barbell");
    expect(metaOut.meta.mechanic).toBe("compound");

    // Food nutrition estimate from a name.
    const fm = await SELF.fetch("http://x/api/ai/food-meta", { method: "POST", headers: H, body: JSON.stringify({ name: "grilled chicken breast" }) });
    expect(fm.status).toBe(200);
    const fmOut = (await fm.json()) as { food: { name: string; calories: number; proteinG: number; servingUnit: string } };
    expect(fmOut.food.calories).toBeGreaterThan(0);
    expect(fmOut.food.proteinG).toBeGreaterThan(0);
    expect(["g", "ml"]).toContain(fmOut.food.servingUnit);

    // Workout day cover — branded (accent colour accepted), mock lane returns a url.
    const dayImg = await SELF.fetch("http://x/api/ai/generate-image", { method: "POST", headers: H, body: JSON.stringify({ feature: "workout-day-image", subject: "Chest Day", hint: "Dynamic style", brandColor: "#10b981" }) });
    expect(dayImg.status).toBe(200);
    expect(((await dayImg.json()) as { url: string }).url).toContain(`/api/media/t/${ctx.active.tenantId}/`);
    // A malformed brand colour is rejected.
    expect((await SELF.fetch("http://x/api/ai/generate-image", { method: "POST", headers: H, body: JSON.stringify({ feature: "workout-day-image", subject: "Pull", brandColor: "green" }) })).status).toBe(400);

    // A day's cover persists in the plan body (schema round-trip).
    const wp = (await (await SELF.fetch("http://x/api/workout-plans", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, name: "Cover Plan" }) })).json()) as { plan: { id: string } };
    await SELF.fetch(`http://x/api/workout-plans/${wp.plan.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ body: { days: [{ name: "Chest Day", imageUrl: "/api/media/t/x/day/chest.png", blocks: [] }] } }) });
    const back = (await (await SELF.fetch(`http://x/api/workout-plans/${wp.plan.id}`, { headers: auth(ownerCookie) })).json()) as { plan: { body: { days: { imageUrl?: string | null }[] } } };
    expect(back.plan.body.days[0]!.imageUrl).toBe("/api/media/t/x/day/chest.png");

    // Plated meal image (subtle-brand variant) + a meal option's imageUrl round-trip.
    const mealImg = await SELF.fetch("http://x/api/ai/generate-image", { method: "POST", headers: H, body: JSON.stringify({ feature: "meal-image", subject: "Chicken & Rice", hint: "made of chicken breast, rice", brandColor: "#10b981" }) });
    expect(mealImg.status).toBe(200);
    expect(((await mealImg.json()) as { url: string }).url).toContain(`/api/media/t/${ctx.active.tenantId}/`);
    const mp = (await (await SELF.fetch("http://x/api/meal-plans", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, name: "Photo Meals" }) })).json()) as { plan: { id: string } };
    await SELF.fetch(`http://x/api/meal-plans/${mp.plan.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ body: { mealOptions: [{ mealType: "lunch", mealName: "Chicken & Rice", imageUrl: "/api/media/t/x/meal/cr.png", foods: [] }] } }) });
    const mback = (await (await SELF.fetch(`http://x/api/meal-plans/${mp.plan.id}`, { headers: auth(ownerCookie) })).json()) as { plan: { body: { mealOptions: { imageUrl?: string | null }[] } } };
    expect(mback.plan.body.mealOptions[0]!.imageUrl).toBe("/api/media/t/x/meal/cr.png");
  });

  it("exercise create accepts start/end images + video", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { id } = (await (await SELF.fetch("http://x/api/exercises", { method: "POST", headers: H, body: JSON.stringify({ name: "Test Lunge", muscleGroups: ["quads"], thumbUrl: "/api/media/t/x/exercise/a.png", thumb2Url: "/api/media/t/x/exercise/b.png", videoUrl: "/api/media/t/x/exercise/c.mp4" }) })).json()) as { id: string };
    const list = (await (await SELF.fetch("http://x/api/exercises?q=test lunge", { headers: auth(ownerCookie) })).json()) as { exercises: { id: string; thumb_url: string | null; thumb2_url: string | null; video_url: string | null }[] };
    const row = list.exercises.find((e) => e.id === id)!;
    expect(row.thumb_url).toContain("a.png");
    expect(row.thumb2_url).toContain("b.png");
    expect(row.video_url).toContain("c.mp4");
  });
});

describe("trainer AI features (registry)", () => {
  it("runs supplement reco, article writer, client summary, and lab extract (mock)", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    await SELF.fetch(`http://x/api/admin/tenants/${ctx.active.tenantId}/plan`, { method: "POST", headers: H, body: JSON.stringify({ planId: "studio" }) });
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "TrainerAI" }) })).json()) as { client: { id: string } };

    const rec = (await (await SELF.fetch("http://x/api/ai/supplement-reco", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id }) })).json()) as { recommendations: { name: string }[]; mocked: boolean };
    expect(rec.recommendations.length).toBeGreaterThan(0);
    expect(rec.mocked).toBe(true);

    const art = (await (await SELF.fetch("http://x/api/ai/article", { method: "POST", headers: H, body: JSON.stringify({ topic: "Sleep and recovery" }) })).json()) as { article: { title: string; body: string } };
    expect(art.article.body.length).toBeGreaterThan(0);

    const sum = (await (await SELF.fetch("http://x/api/ai/client-summary", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id }) })).json()) as { summary: string };
    expect(sum.summary).toContain("TrainerAI");

    // Lab extract needs an uploaded file: request → upload a media key → extract.
    const { id: labId } = (await (await SELF.fetch("http://x/api/labs", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, type: "blood_panel" }) })).json()) as { id: string };
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }), "lab.jpg");
    fd.append("purpose", "lab");
    const { key } = (await (await SELF.fetch("http://x/api/media/upload", { method: "POST", headers: auth(ownerCookie), body: fd })).json()) as { key: string };
    await SELF.fetch(`http://x/api/labs/${labId}/upload`, { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, fileKey: key }) });
    const ex = (await (await SELF.fetch("http://x/api/ai/lab-extract", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, labId }) })).json()) as { values: { marker: string }[] };
    expect(ex.values.length).toBeGreaterThan(0);
    expect(ex.values[0]!.marker.length).toBeGreaterThan(0);

    // Nano Banana cover image (mock) → an R2 media key, billed from credits.
    const before = (await (await SELF.fetch("http://x/api/billing", { headers: auth(ownerCookie) })).json()) as { balance: { balance: number } };
    const img = (await (await SELF.fetch("http://x/api/ai/cover-image", { method: "POST", headers: H, body: JSON.stringify({ prompt: "protein and muscle growth" }) })).json()) as { key: string; url: string; mocked: boolean };
    expect(img.key).toContain(`t/${ctx.active.tenantId}/ai/`);
    expect(img.url).toBe(`/api/media/${img.key}`);
    expect(img.mocked).toBe(true);
    const after = (await (await SELF.fetch("http://x/api/billing", { headers: auth(ownerCookie) })).json()) as { balance: { balance: number } };
    expect(after.balance.balance).toBeLessThan(before.balance.balance); // billed with markup
  });
});

describe("coach note (personalized, context-cached)", () => {
  it("builds a personal note, caches it, and refreshes on a material change", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    await SELF.fetch(`http://x/api/admin/tenants/${ctx.active.tenantId}/plan`, { method: "POST", headers: H, body: JSON.stringify({ planId: "studio" }) });
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "NoteCli" }) })).json()) as { client: { id: string } };
    const day = "2026-07-10";
    await SELF.fetch("http://x/api/logs/workout-sets", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: day, workoutPlanId: "wp", planDayIndex: 0, blockIndex: 0, slotIndex: 0, exerciseId: "e", sets: [{ setIndex: 0, reps: 5, weightKg: 80, completed: true }] } }) });

    const q = `clientId=${client.id}&surface=home&today=${day}&hour=9`;
    const r1 = (await (await SELF.fetch(`http://x/api/ai/coach-note?${q}`, { headers: auth(ownerCookie) })).json()) as { message: string | null; cached: boolean; mocked: boolean };
    expect(r1.message).toBeTruthy();
    expect(r1.message).toContain("NoteCli");
    expect(r1.cached).toBe(false);
    expect(r1.mocked).toBe(true);

    // Same context within the hour → served from cache.
    const r2 = (await (await SELF.fetch(`http://x/api/ai/coach-note?${q}`, { headers: auth(ownerCookie) })).json()) as { message: string; cached: boolean };
    expect(r2.cached).toBe(true);
    expect(r2.message).toBe(r1.message);

    // A different surface gets a different note (own focus).
    const rt = (await (await SELF.fetch(`http://x/api/ai/coach-note?clientId=${client.id}&surface=train&today=${day}&hour=9`, { headers: auth(ownerCookie) })).json()) as { message: string };
    expect(rt.message).not.toBe(r1.message);

    // A material change (a check-in) shifts the context hash → fresh, not cached.
    await SELF.fetch("http://x/api/check-ins", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: day, mood: 5, sleepHours: 8 } }) });
    const r3 = (await (await SELF.fetch(`http://x/api/ai/coach-note?${q}`, { headers: auth(ownerCookie) })).json()) as { cached: boolean };
    expect(r3.cached).toBe(false);
  });
});

describe("commerce + redemption", () => {
  it("redeeming an unknown code 404s without leaking (no oracle)", async () => {
    const { client } = (await (
      await SELF.fetch("http://x/api/clients", {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(ownerCookie) },
        body: JSON.stringify({ displayName: "RedeemTest" }),
      })
    ).json()) as { client: { id: string } };
    const res = await SELF.fetch("http://x/api/redeem", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ clientId: client.id, code: "NOPE1234" }),
    });
    expect(res.status).toBe(404);
  });

  it("a redemption code adds queued days to a client", async () => {
    const { client } = (await (
      await SELF.fetch("http://x/api/clients", {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(ownerCookie) },
        body: JSON.stringify({ displayName: "RedeemTest2" }),
      })
    ).json()) as { client: { id: string } };
    await SELF.fetch("http://x/api/redemption-codes", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ code: "WELCOME10", daysToAdd: 10, targetFeature: "all", maxUses: 5 }),
    });
    const res = await SELF.fetch("http://x/api/redeem", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ clientId: client.id, code: "welcome10" }),
    });
    expect(res.status).toBe(200);
    const subs = (await (await SELF.fetch(`http://x/api/subscriptions?clientId=${client.id}`, { headers: auth(ownerCookie) })).json()) as { subscriptions: { daysRemaining: number }[] };
    expect(subs.subscriptions[0]!.daysRemaining).toBe(10);
  });
});

describe("content hub", () => {
  it("a published public article shows on the tenant marketplace (public lane)", async () => {
    const created = await SELF.fetch("http://x/api/resources", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ type: "article", title: "Warm up right", audience: "public", bodyMd: "# Hi" }),
    });
    const { id } = (await created.json()) as { id: string };
    await SELF.fetch(`http://x/api/resources/${id}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ status: "published" }),
    });
    // The marketplace is a PUBLIC route (no auth) — the owner's slug is studio-one.
    const mkt = await SELF.fetch("http://x/api/marketplace/studio-one");
    expect(mkt.status).toBe(200);
    const body = (await mkt.json()) as { posts: { title: string }[] };
    expect(body.posts.some((p) => p.title === "Warm up right")).toBe(true);
  });

  it("persists a category + tags and returns them in the staff list", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { id } = (await (await SELF.fetch("http://x/api/resources", { method: "POST", headers: H, body: JSON.stringify({ type: "article", title: "Sleep & Recovery", category: "Recovery", topics: ["sleep", "hormones"], bodyMd: "## Hi\n\n| a | b |\n| --- | --- |\n| 1 | 2 |" }) })).json()) as { id: string; slug: string };
    const list = (await (await SELF.fetch("http://x/api/resources", { headers: auth(ownerCookie) })).json()) as { resources: { id: string; category: string | null; topics: string[] }[] };
    const found = list.resources.find((r) => r.id === id)!;
    expect(found.category).toBe("Recovery");
    expect(found.topics).toEqual(["sleep", "hormones"]);
  });

  it("an assigned article is visible only to the assigned client", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const mkClient = async (n: string) => ((await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: n }) })).json()) as { client: { id: string } }).client.id;
    const a = await mkClient("Aud A");
    const b = await mkClient("Aud B");
    const { id } = (await (await SELF.fetch("http://x/api/resources", { method: "POST", headers: H, body: JSON.stringify({ type: "article", title: "Just for A", audience: "assigned", assignedClientIds: [a] }) })).json()) as { id: string };
    await SELF.fetch(`http://x/api/resources/${id}/publish`, { method: "POST", headers: H, body: JSON.stringify({ status: "published" }) });

    const feedA = (await (await SELF.fetch(`http://x/api/resources/feed?clientId=${a}`, { headers: auth(ownerCookie) })).json()) as { resources: { id: string }[] };
    const feedB = (await (await SELF.fetch(`http://x/api/resources/feed?clientId=${b}`, { headers: auth(ownerCookie) })).json()) as { resources: { id: string }[] };
    expect(feedA.resources.map((r) => r.id)).toContain(id);
    expect(feedB.resources.map((r) => r.id)).not.toContain(id);
  });

  it("serves published public articles headlessly (no auth); body only on the single-post route", async () => {
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    await (env.DB as D1Database).prepare(
      "INSERT INTO resources (id, tenant_id, type, title, summary, body_md, category, slug, topics, audience, status, published_at, created_at, updated_at) VALUES ('res_pub1', ?, 'article', 'Public Post', 'teaser', '# Body text here', 'News', 'public-post-abc123', 'a,b', 'public', 'published', '2026-01-01', '2026-01-01', '2026-01-01')",
    ).bind(ctx.active.tenantId).run();

    // Unauthenticated index — metadata, no body.
    const idx = await SELF.fetch("http://x/api/marketplace/studio-one/posts");
    expect(idx.status).toBe(200);
    const idxBody = (await idx.json()) as { posts: { id: string; slug: string; category: string; tags: string[]; bodyMd?: string }[] };
    const post = idxBody.posts.find((p) => p.id === "res_pub1")!;
    expect(post).toBeTruthy();
    expect(post.category).toBe("News");
    expect(post.tags).toEqual(["a", "b"]);
    expect(post.bodyMd).toBeUndefined();

    // Single post by slug — includes the full body.
    const one = await SELF.fetch("http://x/api/marketplace/studio-one/posts/public-post-abc123");
    expect(one.status).toBe(200);
    const oneBody = (await one.json()) as { post: { bodyMd: string } };
    expect(oneBody.post.bodyMd).toContain("Body text here");
  });

  it("does not expose draft/archived articles on the headless API", async () => {
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    await (env.DB as D1Database).prepare(
      "INSERT INTO resources (id, tenant_id, type, title, slug, audience, status, created_at, updated_at) VALUES ('res_draft1', ?, 'article', 'Draft', 'draft-xyz', 'public', 'draft', '2026-01-01', '2026-01-01')",
    ).bind(ctx.active.tenantId).run();
    expect((await SELF.fetch("http://x/api/marketplace/studio-one/posts/draft-xyz")).status).toBe(404);
  });
});

describe("reports", () => {
  it("retention radar flags a client with no activity", async () => {
    await SELF.fetch("http://x/api/clients", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ displayName: "GhostClient" }),
    });
    const res = await SELF.fetch("http://x/api/reports/retention", { headers: auth(ownerCookie) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { atRisk: { name: string }[] };
    expect(body.atRisk.some((r) => r.name === "GhostClient")).toBe(true);
  });

  it("coach attention rolls up per-client signals across the roster", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    // A: bare + no logs → gone quiet + profile incomplete.
    const { client: a } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "QuietQuinn" }) })).json()) as { client: { id: string } };
    // B: a check-in today with no coach feedback → check-in to answer (and NOT quiet — a check-in is activity).
    const { client: b } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "NeedsReplyRey" }) })).json()) as { client: { id: string } };
    const today = new Date().toISOString().slice(0, 10);
    await SELF.fetch("http://x/api/check-ins", { method: "POST", headers: H, body: JSON.stringify({ clientId: b.id, data: { date: today, mood: 4 } }) });

    const res = await SELF.fetch("http://x/api/coach/attention", { headers: auth(ownerCookie) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { clients: { clientId: string; items: { type: string; label: string; link: string }[] }[]; totals: Record<string, number>; total: number };
    const rowA = body.clients.find((r) => r.clientId === a.id)!;
    const rowB = body.clients.find((r) => r.clientId === b.id)!;
    expect(rowA.items.map((i) => i.type)).toContain("client_quiet");
    expect(rowA.items.map((i) => i.type)).toContain("profile_incomplete");
    expect(rowA.items.map((i) => i.type)).toContain("no_active_plan"); // no published plan
    expect(rowB.items.map((i) => i.type)).toContain("checkin_unanswered");
    expect(rowB.items.map((i) => i.type)).not.toContain("client_quiet"); // logged today
    // Items carry a deep link to the client's relevant tab + the registry label.
    expect(rowB.items.find((i) => i.type === "checkin_unanswered")!.link).toBe(`/clients/${b.id}/manage`);
    expect(rowA.items.find((i) => i.type === "client_quiet")!.label).toBe("Gone quiet");
    expect(body.totals.client_quiet).toBeGreaterThanOrEqual(1);
  });
});

describe("client-scoped home widgets (coach configures on the client's behalf)", () => {
  it("a coach sets a client's dashboard widget layout; it surfaces in the client's today bundle", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "WidgetWill" }) })).json()) as { client: { id: string } };
    const layout = [{ id: "calories", size: "big" }, { id: "protein", size: "small" }];
    const patched = await SELF.fetch(`http://x/api/clients/${client.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ dashboardPrefs: { widgets: layout } }) });
    expect(patched.status).toBe(200);
    const today = new Date().toISOString().slice(0, 10);
    const bundle = (await (await SELF.fetch(`http://x/api/today?clientId=${client.id}&date=${today}`, { headers: auth(ownerCookie) })).json()) as { widgets: { id: string; size: string }[] | null };
    expect(bundle.widgets).toEqual(layout);
  });
});

describe("progress analytics aggregation", () => {
  it("returns per-day body + wellness series, deltas, radar and a consistency heatmap", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "ProgressPat" }) })).json()) as { client: { id: string } };
    const today = new Date().toISOString().slice(0, 10);
    const dayBack = (n: number) => { const d = new Date(`${today}T00:00:00`); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

    // Two weigh-ins (a downward trend) + body fat, and two check-ins.
    await SELF.fetch("http://x/api/measurements", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: dayBack(6), weightKg: 82, bodyFatPercent: 20, waistCm: 90 } }) });
    await SELF.fetch("http://x/api/measurements", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: today, weightKg: 80.5, bodyFatPercent: 19, waistCm: 88 } }) });
    await SELF.fetch("http://x/api/check-ins", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: dayBack(1), mood: 4, energy: 3, stress: 2, sleepHours: 7.5 } }) });
    await SELF.fetch("http://x/api/check-ins", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: today, mood: 5, energy: 4, stress: 1, sleepHours: 8 } }) });

    const res = await SELF.fetch(`http://x/api/progress/${client.id}?range=30d&today=${today}`, { headers: auth(ownerCookie) });
    expect(res.status).toBe(200);
    const p = (await res.json()) as {
      body: { weight: { date: string; v: number }[]; deltas: { weight: { delta: number } | null }; latest: { weightKg: number | null } };
      wellness: { averages: { mood: number | null }; radar: { mood: number; calm: number }; index: number | null };
      consistency: { heatmap: Record<string, number>; checkInDays: number; streak: number };
      training: { prs: unknown[]; totalSets: number };
    };
    expect(p.body.weight.length).toBe(2);
    expect(p.body.latest.weightKg).toBe(80.5);
    expect(p.body.deltas.weight?.delta).toBeCloseTo(-1.5, 1); // trending down
    expect(p.wellness.averages.mood).toBeCloseTo(4.5, 1);
    expect(p.wellness.radar.calm).toBeGreaterThan(0.5); // low stress → high calm
    expect(p.consistency.checkInDays).toBe(2);
    expect(p.consistency.streak).toBeGreaterThanOrEqual(1);
    expect(p.consistency.heatmap[today]).toBeGreaterThanOrEqual(2); // check-in + weigh-in
  });

  it("scopes every series to an explicit custom start/end window", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "CustomRangePat" }) })).json()) as { client: { id: string } };
    // Three weigh-ins spread across April; a custom window should include only
    // the middle one and echo the exact window it was asked for.
    await SELF.fetch("http://x/api/measurements", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-04-01", weightKg: 85 } }) });
    await SELF.fetch("http://x/api/measurements", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-04-15", weightKg: 83 } }) });
    await SELF.fetch("http://x/api/measurements", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-04-30", weightKg: 81 } }) });

    const p = (await (await SELF.fetch(`http://x/api/progress/${client.id}?start=2026-04-10&end=2026-04-20&today=2026-05-20`, { headers: auth(ownerCookie) })).json()) as {
      range: { start: string; end: string; days: string[] };
      body: { weight: { date: string; v: number }[]; latest: { weightKg: number | null } };
    };
    expect(p.range.start).toBe("2026-04-10");
    expect(p.range.end).toBe("2026-04-20");
    expect(p.range.days.length).toBe(11); // inclusive 10th→20th
    expect(p.body.weight.map((w) => w.date)).toEqual(["2026-04-15"]);
    expect(p.body.latest.weightKg).toBe(83);
  });

  it("grades calorie adherence against the goal in force on each day, not the current one", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "TimeGoal" }) })).json()) as { client: { id: string } };
    // Goal A (2000 kcal) effective early, then Goal B (3000 kcal) effective later —
    // manual targets, no calculator (the API accepts explicit targets).
    await SELF.fetch("http://x/api/goals", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, label: "Cut", startDate: "2026-05-01", targets: { targetCalories: 2000, targetProteinG: 150 } }) });
    await SELF.fetch("http://x/api/goals", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, label: "Bulk", startDate: "2026-05-10", targets: { targetCalories: 3000, targetProteinG: 200 } }) });

    // Logged via the API — each row freezes the target in force on ITS date.
    await SELF.fetch("http://x/api/logs/food", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-05-05", mealType: "lunch", label: "Meal A", calories: 2000, proteinG: 150, carbsG: 200, fatG: 60 } }) });
    await SELF.fetch("http://x/api/logs/food", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-05-15", mealType: "lunch", label: "Meal B", calories: 3000, proteinG: 200, carbsG: 300, fatG: 90 } }) });
    // A pre-existing (historical) row with NO snapshot — resolved via the goal timeline.
    await (env.DB as D1Database).prepare("INSERT INTO food_entries (id, tenant_id, client_id, date_local, meal_type, label, calories, protein_g, carbs_g, fat_g, source, created_at) VALUES ('fen_hist_a', 'x', ?, '2026-05-03', 'breakfast', 'Legacy', 2000, 150, 200, 60, 'self_logged', '2026-05-03T08:00:00.000Z')").bind(client.id).run();

    const p = (await (await SELF.fetch(`http://x/api/progress/${client.id}?range=30d&today=2026-05-20`, { headers: auth(ownerCookie) })).json()) as {
      nutrition: { adherencePct: number | null; targets: { targetCalories?: number }; perDay: { date: string; target: number | null }[] };
    };
    // All three days are within ±10% of THEIR day's target → 100% (would be ~33%
    // if every day were graded against the current 3000-kcal goal).
    expect(p.nutrition.adherencePct).toBe(100);
    // Headline target = the goal active today (Goal B).
    expect(p.nutrition.targets.targetCalories).toBe(3000);
    // Per-day target line reflects the goal in force each day (snapshot + timeline).
    const byDate = new Map(p.nutrition.perDay.map((d) => [d.date, d.target]));
    expect(byDate.get("2026-05-03")).toBe(2000); // timeline fallback (no snapshot)
    expect(byDate.get("2026-05-05")).toBe(2000); // frozen snapshot under Goal A
    expect(byDate.get("2026-05-15")).toBe(3000); // frozen snapshot under Goal B
  });

  it("flags weight In range / off track against the goal's healthy band", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "RangePat", gender: "male", dateOfBirth: "1994-01-01", heightCm: 180 }) })).json()) as { client: { id: string } };
    const today = new Date().toISOString().slice(0, 10);
    // Goal with a healthy weight band: 75–78 kg.
    await SELF.fetch("http://x/api/goals", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, label: "Lean", targets: { targetCalories: 2200 }, ranges: { weightKg: { min: 75, max: 78 } } }) });
    // A weigh-in above the band.
    await SELF.fetch("http://x/api/measurements", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: today, weightKg: 82 } }) });

    // Client-facing Progress carries the band + status on the latest weight.
    const prog = (await (await SELF.fetch(`http://x/api/progress/${client.id}?range=30d&today=${today}`, { headers: H })).json()) as { body: { ranges: { weightKg?: { max: number } }; latest: { weightStatus: string | null } } };
    expect(prog.body.latest.weightStatus).toBe("above");
    expect(prog.body.ranges.weightKg?.max).toBe(78);

    // Coach-facing metrics carry the same status.
    const cv = (await (await SELF.fetch(`http://x/api/clients/${client.id}`, { headers: H })).json()) as { metrics: { weightStatus: string | null } };
    expect(cv.metrics.weightStatus).toBe("above");

    // A later, in-band weigh-in flips weight to In range (metrics take the latest).
    const tomorrow = new Date(Date.parse(today) + 86_400_000).toISOString().slice(0, 10);
    await SELF.fetch("http://x/api/measurements", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: tomorrow, weightKg: 76 } }) });
    const cv2 = (await (await SELF.fetch(`http://x/api/clients/${client.id}`, { headers: H })).json()) as { metrics: { weightStatus: string | null } };
    expect(cv2.metrics.weightStatus).toBe("in_range");
  });
});

describe("access economy", () => {
  it("granting a package twice queues budgets, never sums", async () => {
    const { client } = (await (
      await SELF.fetch("http://x/api/clients", {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(ownerCookie) },
        body: JSON.stringify({ displayName: "BudgetTest" }),
      })
    ).json()) as { client: { id: string } };

    await SELF.fetch("http://x/api/packages", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ name: "30-day", budgets: [{ feature: "all", days: 30 }] }),
    });
    const pkgs = (await (await SELF.fetch("http://x/api/packages", { headers: auth(ownerCookie) })).json()) as { packages: { id: string }[] };
    const pkgId = pkgs.packages[0]!.id;

    await SELF.fetch("http://x/api/subscriptions/grant", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ clientId: client.id, packageId: pkgId }),
    });
    await SELF.fetch("http://x/api/subscriptions/grant", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ clientId: client.id, packageId: pkgId }),
    });
    const subs = (await (await SELF.fetch(`http://x/api/subscriptions?clientId=${client.id}`, { headers: auth(ownerCookie) })).json()) as {
      subscriptions: { daysRemaining: number; budgets: unknown[] }[];
    };
    // Queue-not-sum: two 30-day grants → 60 days of runway, not 30 (pooled) and
    // not 30-only. An `all` package splits per feature (workout + meal) so no
    // feature is left with a coverage gap, so two grants yield 4 queued budgets
    // (workout×2, meal×2) — the daysRemaining (60) is the queue-not-sum proof.
    expect(subs.subscriptions[0]!.daysRemaining).toBe(60);
    expect(subs.subscriptions[0]!.budgets.length).toBe(4);
  });
});

describe("integrations settings", () => {
  it("keyless providers default on; keys save masked (never returned)", async () => {
    const before = (await (await SELF.fetch("http://x/api/settings", { headers: auth(ownerCookie) })).json()) as {
      integrations: Record<string, { enabled: boolean; ready: boolean; apiKeySet?: boolean }>;
    };
    // Open Food Facts + wger are keyless → default enabled + ready.
    expect(before.integrations.openfoodfacts!.enabled).toBe(true);
    expect(before.integrations.wger!.ready).toBe(true);
    // USDA is keyed → not ready until a key is set.
    expect(before.integrations.usda!.ready).toBe(false);

    await SELF.fetch("http://x/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ integrations: { usda: { enabled: true, apiKey: "secret-usda-key" } } }),
    });

    const res = await SELF.fetch("http://x/api/settings", { headers: auth(ownerCookie) });
    const raw = await res.text();
    expect(raw).not.toContain("secret-usda-key"); // key never leaves the server
    const after = JSON.parse(raw) as { integrations: Record<string, { enabled: boolean; ready: boolean; apiKeySet?: boolean }> };
    expect(after.integrations.usda!.enabled).toBe(true);
    expect(after.integrations.usda!.ready).toBe(true);
    expect(after.integrations.usda!.apiKeySet).toBe(true);
  });
});

describe("activities feed (Train tab)", () => {
  it("logs an activity and lists it back within a date range", async () => {
    const { client } = (await (await SELF.fetch("http://x/api/clients", {
      method: "POST", headers: { "content-type": "application/json", ...auth(ownerCookie) }, body: JSON.stringify({ displayName: "ActivityTest" }),
    })).json()) as { client: { id: string } };
    const log = await SELF.fetch("http://x/api/logs/activity", {
      method: "POST", headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ clientId: client.id, data: { date: "2026-07-01", activityKey: "running", durationMin: 30 } }),
    });
    expect([200, 201]).toContain(log.status);
    const list = (await (await SELF.fetch(`http://x/api/logs/activities?clientId=${client.id}&from=2026-06-01&to=2026-07-31`, { headers: auth(ownerCookie) })).json()) as { activities: { activity_key: string; duration_min: number }[] };
    expect(list.activities.length).toBeGreaterThan(0);
    expect(list.activities[0]!.activity_key).toBe("running");
    // Another tenant can't read this client's activities.
    expect((await SELF.fetch(`http://x/api/logs/activities?clientId=${client.id}&from=2026-06-01&to=2026-07-31`, { headers: auth(otherCookie) })).status).toBe(404);
  });

  it("carries distance + notes, estimates calories from weight, and re-estimates on edit; a typed number locks", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "ActEdit" }) })).json()) as { client: { id: string } };
    await SELF.fetch("http://x/api/measurements", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-07-01", weightKg: 80 } }) });
    // No caloriesBurned → server MET-estimates from the 80kg weight.
    const created = (await (await SELF.fetch("http://x/api/logs/activity", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-07-02", activityKey: "swimming", durationMin: 60, distanceM: 1500, notes: "pool laps" } }) })).json()) as { id: string; calories: number };
    expect(created.calories).toBe(480); // swimming MET 6 × 80kg × 1h
    let list = (await (await SELF.fetch(`http://x/api/logs/activities?clientId=${client.id}&from=2026-07-01&to=2026-07-31`, { headers: auth(ownerCookie) })).json()) as { activities: { id: string; distance_m: number; notes: string; calories: number; calories_locked: number }[] };
    expect(list.activities[0]!.distance_m).toBe(1500);
    expect(list.activities[0]!.notes).toBe("pool laps");
    expect(list.activities[0]!.calories_locked).toBe(0);
    // Editing the duration re-estimates (still unlocked).
    await SELF.fetch(`http://x/api/logs/activity/${created.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ clientId: client.id, durationMin: 30 }) });
    list = (await (await SELF.fetch(`http://x/api/logs/activities?clientId=${client.id}&from=2026-07-01&to=2026-07-31`, { headers: auth(ownerCookie) })).json()) as typeof list;
    expect(list.activities[0]!.calories).toBe(240);
    // A typed calorie number locks the row against further re-estimation.
    await SELF.fetch(`http://x/api/logs/activity/${created.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ clientId: client.id, caloriesBurned: 999 }) });
    await SELF.fetch(`http://x/api/logs/activity/${created.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ clientId: client.id, durationMin: 10 }) });
    list = (await (await SELF.fetch(`http://x/api/logs/activities?clientId=${client.id}&from=2026-07-01&to=2026-07-31`, { headers: auth(ownerCookie) })).json()) as typeof list;
    expect(list.activities[0]!.calories).toBe(999);
    expect(list.activities[0]!.calories_locked).toBe(1);
    // Delete removes it.
    await SELF.fetch(`http://x/api/logs/activity/${created.id}?clientId=${client.id}`, { method: "DELETE", headers: auth(ownerCookie) });
    list = (await (await SELF.fetch(`http://x/api/logs/activities?clientId=${client.id}&from=2026-07-01&to=2026-07-31`, { headers: auth(ownerCookie) })).json()) as typeof list;
    expect(list.activities.length).toBe(0);
  });

  it("logs a rep-based move (push-ups) with a count and no duration", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "Reps" }) })).json()) as { client: { id: string } };
    const r = await SELF.fetch("http://x/api/logs/activity", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-07-05", activityKey: "push_ups", reps: 50 } }) });
    expect([200, 201]).toContain(r.status);
    const list = (await (await SELF.fetch(`http://x/api/logs/activities?clientId=${client.id}&from=2026-07-01&to=2026-07-31`, { headers: auth(ownerCookie) })).json()) as { activities: { activity_key: string; reps: number; duration_min: number | null }[] };
    expect(list.activities[0]!.activity_key).toBe("push_ups");
    expect(list.activities[0]!.reps).toBe(50);
    expect(list.activities[0]!.duration_min).toBeNull();
  });

  it("estimates activity calories with AI, grounded on the client's body (mock)", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    await SELF.fetch(`http://x/api/admin/tenants/${ctx.active.tenantId}/plan`, { method: "POST", headers: H, body: JSON.stringify({ planId: "studio" }) });
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "ActAI" }) })).json()) as { client: { id: string } };
    await SELF.fetch("http://x/api/measurements", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-07-01", weightKg: 90 } }) });
    const est = (await (await SELF.fetch("http://x/api/ai/activity-estimate", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, activityKey: "running", durationMin: 40 }) })).json()) as { calories: number; rationale: string };
    // Mock grounds on the 90kg weight: running MET 9.8 × 90 × (40/60) ≈ 588.
    expect(est.calories).toBe(Math.round(9.8 * 90 * (40 / 60)));
  });
});

describe("log detail (Today-item detail page)", () => {
  interface Detail {
    kind: string; date: string; title: string; tone: string;
    hero: { value: number; unit: string; label: string } | null;
    stats: { label: string; value: number | null; unit: string }[];
    items: { title: string; sub?: string | null }[];
    rows: { label: string; value: string }[];
    series?: { title: string; unit: string; chart: string; points: { value: number }[] } | null;
  }

  it("returns normalized detail + analytics for a logged activity", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "DetailAct" }) })).json()) as { client: { id: string } };
    // Weight first so the activity gets a MET-estimated calorie burn.
    await SELF.fetch("http://x/api/measurements", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-07-01", weightKg: 80 } }) });
    const created = (await (await SELF.fetch("http://x/api/logs/activity", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-07-02", activityKey: "swimming", durationMin: 60, distanceM: 1500, notes: "pool laps" } }) })).json()) as { id: string; calories: number };
    expect(created.calories).toBe(480);

    const d = (await (await SELF.fetch(`http://x/api/logs/detail?clientId=${client.id}&kind=activity&ref=${created.id}`, { headers: auth(ownerCookie) })).json()) as Detail;
    expect(d.kind).toBe("activity");
    expect(d.tone).toBe("cardio");
    expect(d.title).toBe("Swimming");
    expect(d.date).toBe("2026-07-02");
    expect(d.hero).toMatchObject({ value: 480, unit: "energy", label: "Calories" });
    // duration + distance + "Times logged" are present; nulls (reps/HR) omitted.
    expect(d.stats.find((s) => s.label === "Duration")).toMatchObject({ value: 60, unit: "minutes" });
    expect(d.stats.find((s) => s.label === "Distance")).toMatchObject({ value: 1500, unit: "distance" });
    expect(d.stats.find((s) => s.label === "Times logged")).toMatchObject({ value: 1, unit: "count" });
    expect(d.stats.some((s) => s.label === "Reps")).toBe(false);
    expect(d.series?.chart).toBe("bar");
    expect(d.series?.unit).toBe("energy");
    expect(d.series?.points.at(-1)?.value).toBe(480);

    // Unknown ref → 404; another tenant → 404.
    expect((await SELF.fetch(`http://x/api/logs/detail?clientId=${client.id}&kind=activity&ref=nope`, { headers: auth(ownerCookie) })).status).toBe(404);
    expect((await SELF.fetch(`http://x/api/logs/detail?clientId=${client.id}&kind=activity&ref=${created.id}`, { headers: auth(otherCookie) })).status).toBe(404);
  });

  it("aggregates a food meal by date with a 7-day calorie series", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "DetailFood" }) })).json()) as { client: { id: string } };
    await SELF.fetch("http://x/api/logs/food", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-07-10", mealType: "lunch", label: "Rice", calories: 300, proteinG: 8, carbsG: 60, fatG: 2, quantity: 100, unit: "g" } }) });
    await SELF.fetch("http://x/api/logs/food", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-07-10", mealType: "lunch", label: "Chicken", calories: 250, proteinG: 40, carbsG: 0, fatG: 8, quantity: 150, unit: "g" } }) });

    // Food kinds arrive with the `:` dot-encoded (food.lunch), ref = the date.
    const d = (await (await SELF.fetch(`http://x/api/logs/detail?clientId=${client.id}&kind=food.lunch&ref=2026-07-10`, { headers: auth(ownerCookie) })).json()) as Detail;
    expect(d.kind).toBe("food.lunch");
    expect(d.tone).toBe("nutrition");
    expect(d.title).toBe("Lunch");
    expect(d.hero).toMatchObject({ value: 550, unit: "energy", label: "Calories" });
    expect(d.stats.find((s) => s.label === "Protein g")).toMatchObject({ value: 48, unit: "raw" });
    expect(d.items.length).toBe(2);
    expect(d.items[0]).toMatchObject({ title: "Rice", sub: "100g · 300 kcal" });
    expect(d.series?.chart).toBe("bar");
    expect(d.series?.points.length).toBe(7);
    expect(d.series?.points.at(-1)?.value).toBe(550);

    // A meal with no entries that day → 404.
    expect((await SELF.fetch(`http://x/api/logs/detail?clientId=${client.id}&kind=food.dinner&ref=2026-07-10`, { headers: auth(ownerCookie) })).status).toBe(404);
  });
});

describe("weekly nutrition strip (Eat tab)", () => {
  it("buckets 7-day calories/protein/water per day and stays tenant-scoped", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", {
      method: "POST", headers: H, body: JSON.stringify({ displayName: "WeekTest" }),
    })).json()) as { client: { id: string } };
    // Log food + water on the window end date.
    await SELF.fetch("http://x/api/logs/food", {
      method: "POST", headers: H,
      body: JSON.stringify({ clientId: client.id, data: { date: "2026-07-11", mealType: "lunch", label: "Chicken", calories: 500, proteinG: 40, carbsG: 30, fatG: 12 } }),
    });
    await SELF.fetch("http://x/api/logs/water", {
      method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-07-11", amountMl: 750 } }),
    });
    // Log food on an earlier day inside the window.
    await SELF.fetch("http://x/api/logs/food", {
      method: "POST", headers: H,
      body: JSON.stringify({ clientId: client.id, data: { date: "2026-07-08", mealType: "dinner", label: "Salmon", calories: 620, proteinG: 45, carbsG: 10, fatG: 30 } }),
    });

    const week = (await (await SELF.fetch(`http://x/api/logs/nutrition/week?clientId=${client.id}&date=2026-07-11`, { headers: auth(ownerCookie) })).json()) as {
      days: { date: string; calories: number; proteinG: number; waterMl: number; logged: boolean }[];
    };
    expect(week.days.length).toBe(7);
    expect(week.days[0]!.date).toBe("2026-07-05");
    expect(week.days[6]!.date).toBe("2026-07-11");
    const last = week.days[6]!;
    expect(last.calories).toBe(500);
    expect(last.proteinG).toBe(40);
    expect(last.waterMl).toBe(750);
    expect(last.logged).toBe(true);
    expect(week.days.filter((d) => d.logged).length).toBe(2);
    // Another tenant is denied.
    expect((await SELF.fetch(`http://x/api/logs/nutrition/week?clientId=${client.id}&date=2026-07-11`, { headers: auth(otherCookie) })).status).toBe(404);
  });
});

describe("recent foods (one-tap re-log rail)", () => {
  it("groups a client's logs per food, keeping the latest quantity + a count", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "RecentTest" }) })).json()) as { client: { id: string } };
    // Log "Chicken" twice (different portions) and "Rice" once, Chicken most recent.
    await SELF.fetch("http://x/api/logs/food", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-07-01", mealType: "lunch", label: "Rice", calories: 300, proteinG: 8, carbsG: 60, fatG: 2, quantity: 100, unit: "g" } }) });
    await SELF.fetch("http://x/api/logs/food", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-07-02", mealType: "lunch", label: "Chicken", calories: 250, proteinG: 40, carbsG: 0, fatG: 8, quantity: 150, unit: "g" } }) });
    await SELF.fetch("http://x/api/logs/food", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-07-03", mealType: "dinner", label: "Chicken", calories: 330, proteinG: 53, carbsG: 0, fatG: 11, quantity: 200, unit: "g" } }) });

    const r = (await (await SELF.fetch(`http://x/api/foods/recent?clientId=${client.id}`, { headers: auth(ownerCookie) })).json()) as {
      recents: { label: string; quantity: number; calories: number; log_count: number }[];
    };
    expect(r.recents.length).toBe(2); // Chicken grouped, Rice
    expect(r.recents[0]!.label).toBe("Chicken"); // most-recently logged first
    expect(r.recents[0]!.log_count).toBe(2);
    expect(r.recents[0]!.quantity).toBe(200); // latest entry's portion
    expect(r.recents[0]!.calories).toBe(330);
    expect(r.recents[1]!.label).toBe("Rice");
    expect(r.recents[1]!.log_count).toBe(1);
    // Another tenant can't read this client's recents.
    expect((await SELF.fetch(`http://x/api/foods/recent?clientId=${client.id}`, { headers: auth(otherCookie) })).status).toBe(404);
  });
});

describe("home widget prefs", () => {
  it("persists per-surface widget layout and surfaces it on /context", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const coach = [{ id: "clients", size: "big" }, { id: "swaps", size: "small" }];
    const r = await SELF.fetch("http://x/api/me/widgets", { method: "PATCH", headers: H, body: JSON.stringify({ surface: "coachHome", items: coach }) });
    expect(r.status).toBe(200);
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { user: { widgets: { coachHome?: unknown; home?: unknown } } };
    expect(ctx.user.widgets.coachHome).toEqual(coach);
    // A second surface merges without clobbering the first.
    const home = [{ id: "calories", size: "big" }, { id: "water", size: "small" }];
    await SELF.fetch("http://x/api/me/widgets", { method: "PATCH", headers: H, body: JSON.stringify({ surface: "home", items: home }) });
    const ctx2 = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { user: { widgets: { coachHome?: unknown; home?: unknown } } };
    expect(ctx2.user.widgets.home).toEqual(home);
    expect(ctx2.user.widgets.coachHome).toEqual(coach);
    // Bad size is rejected.
    expect((await SELF.fetch("http://x/api/me/widgets", { method: "PATCH", headers: H, body: JSON.stringify({ surface: "home", items: [{ id: "x", size: "huge" }] }) })).status).toBe(400);
  });
});

describe("activity history feed", () => {
  it("aggregates logs across surfaces into a dated timeline, tenant-scoped", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", {
      method: "POST", headers: H, body: JSON.stringify({ displayName: "HistoryTest" }),
    })).json()) as { client: { id: string } };
    const d = "2026-07-10";
    await SELF.fetch("http://x/api/logs/food", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: d, mealType: "lunch", label: "Chicken", calories: 500, proteinG: 40, carbsG: 30, fatG: 12 } }) });
    await SELF.fetch("http://x/api/logs/water", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: d, amountMl: 750 } }) });
    await SELF.fetch("http://x/api/logs/activity", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: d, activityKey: "running", durationMin: 30 } }) });
    await SELF.fetch("http://x/api/logs/workout-sets", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: d, workoutPlanId: "wp-hist", planDayIndex: 0, blockIndex: 0, slotIndex: 0, exerciseId: "ex1", sets: [{ setIndex: 0, reps: 8, weightKg: 50, completed: true }] } }) });
    await SELF.fetch("http://x/api/check-ins", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: d, mood: 4, notes: "felt strong" } }) });
    const { id: labId } = (await (await SELF.fetch("http://x/api/labs", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, type: "blood_panel" }) })).json()) as { id: string };
    // A body scan on the same day (inserted directly — capture needs image data).
    await (env.DB as D1Database).prepare("INSERT INTO body_scans (id, tenant_id, client_id, date_local, body_fat_percent, weight_kg, created_at) VALUES ('scan_hist_1', 'x', ?, ?, 18.4, 80, ?)").bind(client.id, d, `${d}T09:00:00.000Z`).run();
    // A goal set by the owner (records an audit entry → drives actor attribution).
    // Give the acting user a display name so the audit join can attribute it.
    const hctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    const hOwner = (await (env.DB as D1Database).prepare("SELECT userId FROM member WHERE organizationId = ? AND role = 'owner' LIMIT 1").bind(hctx.active.tenantId).first<{ userId: string }>())!;
    await (env.DB as D1Database).prepare("UPDATE \"user\" SET name = 'Coach One' WHERE id = ?").bind(hOwner.userId).run();
    await SELF.fetch("http://x/api/goals", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, label: "Recomp", calculator: { gender: "male", ageYears: 30, heightCm: 178, weightKg: 80, activityLevel: "moderate", primaryGoal: "maintain", dietaryApproach: "balanced" } }) });

    const feed = (await (await SELF.fetch(`http://x/api/activity-history?clientId=${client.id}&from=2026-07-08&to=2026-07-10`, { headers: auth(ownerCookie) })).json()) as { events: { kind: string; date: string; title: string; ref?: string; actor?: string; metric?: { unit: string; value: number } }[] };
    const kinds = feed.events.map((e) => e.kind);
    expect(kinds).toContain("food:lunch");
    expect(kinds).toContain("water");
    expect(kinds).toContain("activity");
    expect(kinds).toContain("workout");
    expect(kinds).toContain("checkin");
    expect(kinds).toContain("bodyscan"); // enriched: body scans now in the feed
    expect(feed.events.every((e) => e.date >= "2026-07-08" && e.date <= "2026-07-10")).toBe(true);
    const food = feed.events.find((e) => e.kind === "food:lunch")!;
    expect(food.metric).toMatchObject({ unit: "energy", value: 500 });
    // Deep-link ref: a check-in carries its date so the feed can open its detail.
    expect(feed.events.find((e) => e.kind === "checkin")!.ref).toBe(d);
    // A lab is dated by its creation time; a wide window catches it, ref = lab id.
    const wide = (await (await SELF.fetch(`http://x/api/activity-history?clientId=${client.id}&from=2026-07-08&to=2030-01-01`, { headers: auth(ownerCookie) })).json()) as { events: { kind: string; ref?: string; actor?: string; subtitle?: string | null }[] };
    expect(wide.events.find((e) => e.kind === "lab")!.ref).toBe(labId);
    // The goal is in the feed and carries the acting coach's name (actor attribution).
    const goalEv = wide.events.find((e) => e.kind === "goal")!;
    expect(goalEv.subtitle).toBe("Recomp");
    expect(typeof goalEv.actor).toBe("string");
    expect(goalEv.actor!.length).toBeGreaterThan(0);
    // Out-of-range window returns nothing.
    const empty = (await (await SELF.fetch(`http://x/api/activity-history?clientId=${client.id}&from=2026-06-01&to=2026-06-02`, { headers: auth(ownerCookie) })).json()) as { events: unknown[] };
    expect(empty.events.length).toBe(0);
    // Tenant isolation.
    expect((await SELF.fetch(`http://x/api/activity-history?clientId=${client.id}&from=2026-07-08&to=2026-07-10`, { headers: auth(otherCookie) })).status).toBe(404);
  });
});

describe("wellness score", () => {
  it("composes a 0-100 score from real signals, per-pillar availability", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "ScoreTest" }) })).json()) as { client: { id: string } };
    const d = "2026-07-10";
    await SELF.fetch("http://x/api/logs/workout-sets", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: d, workoutPlanId: "wp", planDayIndex: 0, blockIndex: 0, slotIndex: 0, exerciseId: "ex1", sets: [{ setIndex: 0, reps: 8, weightKg: 60, completed: true }] } }) });
    await SELF.fetch("http://x/api/logs/activity", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: d, activityKey: "running", durationMin: 30 } }) });
    await SELF.fetch("http://x/api/check-ins", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: d, mood: 5, energy: 4, stress: 1, sleepHours: 8 } }) });

    const res = (await (await SELF.fetch(`http://x/api/wellness/score?clientId=${client.id}&today=${d}`, { headers: auth(ownerCookie) })).json()) as { score: number; band: string; pillars: { key: string; available: boolean; weight: number }[] };
    expect(typeof res.score).toBe("number");
    expect(res.score).toBeGreaterThan(0);
    expect(res.score).toBeLessThanOrEqual(100);
    expect(typeof res.band).toBe("string");
    expect(res.pillars).toHaveLength(8);
    // Logged pillars are available; untouched ones (supplements) are not.
    expect(res.pillars.find((p) => p.key === "training")!.available).toBe(true);
    expect(res.pillars.find((p) => p.key === "sleep")!.available).toBe(true);
    expect(res.pillars.find((p) => p.key === "mood")!.available).toBe(true);
    expect(res.pillars.find((p) => p.key === "supplements")!.available).toBe(false);
    expect(res.pillars.find((p) => p.key === "supplements")!.weight).toBe(0);
    // Available weights redistribute to sum ~1 (display-rounded per pillar).
    expect(res.pillars.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(1, 1);
    // Tenant isolation.
    expect((await SELF.fetch(`http://x/api/wellness/score?clientId=${client.id}&today=${d}`, { headers: auth(otherCookie) })).status).toBe(404);
  });
});

describe("roster activity pulse (coach Today)", () => {
  it("aggregates recent client events across the roster, tagged + tenant-scoped", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const mk = async (name: string) => ((await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: name }) })).json()) as { client: { id: string } }).client;
    const a = await mk("RosterA");
    const b = await mk("RosterB");
    const day = "2026-07-10";
    await SELF.fetch("http://x/api/logs/workout-sets", { method: "POST", headers: H, body: JSON.stringify({ clientId: a.id, data: { date: day, workoutPlanId: "wp", planDayIndex: 0, blockIndex: 0, slotIndex: 0, exerciseId: "e", sets: [{ setIndex: 0, reps: 8, weightKg: 40, completed: true }] } }) });
    await SELF.fetch("http://x/api/check-ins", { method: "POST", headers: H, body: JSON.stringify({ clientId: b.id, data: { date: day, mood: 4 } }) });

    const roster = (await (await SELF.fetch("http://x/api/reports/roster-activity?from=2026-07-08&to=2026-07-10", { headers: auth(ownerCookie) })).json()) as { events: { clientId: string; clientName: string; kind: string }[] };
    expect(roster.events.some((e) => e.clientId === a.id && e.kind === "workout" && e.clientName === "RosterA")).toBe(true);
    expect(roster.events.some((e) => e.clientId === b.id && e.kind === "checkin")).toBe(true);
    // Another tenant's coach sees their own roster only — not these clients.
    const other = (await (await SELF.fetch("http://x/api/reports/roster-activity?from=2026-07-08&to=2026-07-10", { headers: auth(otherCookie) })).json()) as { events: { clientId: string }[] };
    expect(other.events.some((e) => e.clientId === a.id || e.clientId === b.id)).toBe(false);
  });

  it("roster-analytics aggregates a daily active-clients trend + engagement rates", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "AnalyticsAna" }) })).json()) as { client: { id: string } };
    const today = new Date().toISOString().slice(0, 10);
    await SELF.fetch("http://x/api/check-ins", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: today, mood: 5 } }) });
    await SELF.fetch("http://x/api/logs/food", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: today, mealType: "lunch", label: "Rice", calories: 300, proteinG: 8, carbsG: 60, fatG: 2 } }) });

    const a = (await (await SELF.fetch(`http://x/api/reports/roster-analytics?days=14&today=${today}`, { headers: auth(ownerCookie) })).json()) as {
      roster: { total: number; active7: number; atRisk: number };
      daily: { date: string; active: number }[];
      engagement: { checkInRate: number; workoutRate: number; avgActivePerDay: number };
      topClients: { clientId: string; name: string; logs: number }[];
    };
    expect(a.daily.length).toBe(14);
    expect(a.daily[13]!.date).toBe(today);
    expect(a.daily[13]!.active).toBeGreaterThanOrEqual(1); // Ana logged today
    expect(a.roster.total).toBeGreaterThanOrEqual(1);
    expect(a.engagement.checkInRate).toBeGreaterThanOrEqual(0);
    expect(a.topClients.some((t) => t.clientId === client.id && t.logs >= 2)).toBe(true); // check-in + food
    // Tenant isolation — another tenant's coach doesn't see Ana.
    const other = (await (await SELF.fetch(`http://x/api/reports/roster-analytics?days=14&today=${today}`, { headers: auth(otherCookie) })).json()) as { topClients: { clientId: string }[] };
    expect(other.topClients.some((t) => t.clientId === client.id)).toBe(false);
  });
});

describe("exercise last performance (progressive-overload hint)", () => {
  it("returns the most recent prior session's sets for an exercise", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "LastPerf" }) })).json()) as { client: { id: string } };
    const set = (date: string, weightKg: number) => SELF.fetch("http://x/api/logs/workout-sets", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date, workoutPlanId: "wp-lp", planDayIndex: 0, blockIndex: 0, slotIndex: 0, exerciseId: "ex_squat", sets: [{ setIndex: 0, reps: 5, weightKg, completed: true }] } }) });
    await set("2026-06-01", 60);
    await set("2026-06-08", 65); // the most recent prior session
    await set("2026-06-15", 70); // "today" (excluded by `before`)

    const r = (await (await SELF.fetch(`http://x/api/logs/exercise-last?clientId=${client.id}&exerciseId=ex_squat&before=2026-06-15`, { headers: auth(ownerCookie) })).json()) as {
      last: { date: string; sets: { reps: number | null; weightKg: number | null }[] } | null;
    };
    expect(r.last?.date).toBe("2026-06-08");
    expect(r.last?.sets[0]?.weightKg).toBe(65);
    expect(r.last?.sets[0]?.reps).toBe(5);
    // An exercise never logged → null.
    const none = (await (await SELF.fetch(`http://x/api/logs/exercise-last?clientId=${client.id}&exerciseId=ex_never`, { headers: auth(ownerCookie) })).json()) as { last: unknown };
    expect(none.last).toBeNull();
    // Another tenant is denied.
    expect((await SELF.fetch(`http://x/api/logs/exercise-last?clientId=${client.id}&exerciseId=ex_squat`, { headers: auth(otherCookie) })).status).toBe(404);
  });
});

describe("workout logging — measurement modes (SPEC §8.3)", () => {
  it("persists reps, time, and distance sets and reads them back per slot", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const { client } = (await (await SELF.fetch("http://x/api/clients", {
      method: "POST", headers: H, body: JSON.stringify({ displayName: "WorkoutMeasure" }),
    })).json()) as { client: { id: string } };
    const base = { date: "2026-07-11", workoutPlanId: "wp-measure", planDayIndex: 0 };
    const log = (data: Record<string, unknown>) => SELF.fetch("http://x/api/logs/workout-sets", {
      method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { ...base, ...data } }),
    });
    // Slot 0 — reps + weight; slot 1 — time hold; slot 2 — distance.
    expect((await log({ blockIndex: 0, slotIndex: 0, exerciseId: "ex-squat", sets: [{ setIndex: 0, reps: 8, weightKg: 60, completed: true }] })).status).toBe(200);
    expect((await log({ blockIndex: 0, slotIndex: 1, exerciseId: "ex-plank", sets: [{ setIndex: 0, durationSeconds: 45, completed: true }] })).status).toBe(200);
    expect((await log({ blockIndex: 0, slotIndex: 2, exerciseId: "ex-row", sets: [{ setIndex: 0, distanceM: 500, completed: true }] })).status).toBe(200);

    const back = (await (await SELF.fetch(`http://x/api/logs/workout-sessions?clientId=${client.id}&from=2026-07-11&to=2026-07-11`, { headers: auth(ownerCookie) })).json()) as {
      sessions: { entries: { slotIndex: number; exerciseId: string; sets: { reps?: number; weightKg?: number; durationSeconds?: number; distanceM?: number }[] }[] }[];
    };
    expect(back.sessions.length).toBe(1);
    const entries = back.sessions[0]!.entries;
    const bySlot = new Map(entries.map((e) => [e.slotIndex, e]));
    expect(bySlot.get(0)!.sets[0]).toMatchObject({ reps: 8, weightKg: 60 });
    expect(bySlot.get(1)!.sets[0]!.durationSeconds).toBe(45);
    expect(bySlot.get(1)!.sets[0]!.reps ?? null).toBeNull();
    expect(bySlot.get(2)!.sets[0]!.distanceM).toBe(500);
    // Tenant isolation on the read.
    expect((await SELF.fetch(`http://x/api/logs/workout-sessions?clientId=${client.id}&from=2026-07-11&to=2026-07-11`, { headers: auth(otherCookie) })).status).toBe(404);
  });
});

describe("exercise swaps + alternatives (SPEC §8.3)", () => {
  it("bound alternatives auto-apply; open requests wait for the coach's pick", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const mkEx = async (name: string) => ((await (await SELF.fetch("http://x/api/exercises", { method: "POST", headers: H, body: JSON.stringify({ name, visibility: "tenant" }) })).json()) as { id: string }).id;
    const a = await mkEx("Barbell Bench Press");
    const b = await mkEx("Dumbbell Bench Press");

    // Bind A↔B and read it back (two-way).
    expect((await SELF.fetch(`http://x/api/exercises/${a}/alternatives`, { method: "POST", headers: H, body: JSON.stringify({ exerciseId: b }) })).status).toBe(201);
    const altsOfB = (await (await SELF.fetch(`http://x/api/exercises/${b}/alternatives`, { headers: auth(ownerCookie) })).json()) as { alternatives: { id: string }[] };
    expect(altsOfB.alternatives.map((x) => x.id)).toContain(a);

    const client = ((await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "SwapClient" }) })).json()) as { client: { id: string } }).client;
    // The swap now validates that the plan belongs to the client (cross-client IDOR
    // fix) — give the client a real plan with two slots so both the auto-apply and
    // the open-request paths resolve against an owned plan.
    const swapCtx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    await (env.DB as D1Database).prepare("INSERT INTO workout_plans (id, tenant_id, client_id, name, status, body_json, created_at) VALUES ('wp1', ?, ?, 'P', 'published', ?, '2026-01-01')")
      .bind(swapCtx.active.tenantId, client.id, JSON.stringify({ days: [{ blocks: [{ slots: [{ exerciseId: a }, { exerciseId: a }] }] }] })).run();
    const swap = (body: Record<string, unknown>) => SELF.fetch("http://x/api/swaps", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, workoutPlanId: "wp1", dayIndex: 0, blockIndex: 0, slotIndex: 0, currentExerciseId: a, ...body }) });

    // Picking a bound alternative auto-approves.
    const auto = (await (await swap({ suggestedExerciseId: b })).json()) as { autoApproved: boolean };
    expect(auto.autoApproved).toBe(true);

    // An open request (no target) stays pending for the coach.
    const open = (await (await swap({ slotIndex: 1, reason: "shoulder pain" })).json()) as { id: string; autoApproved: boolean };
    expect(open.autoApproved).toBe(false);

    // Approving an open request with no replacement is rejected; with one, it applies.
    expect((await SELF.fetch(`http://x/api/swaps/${open.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "approved" }) })).status).toBe(400);
    expect((await SELF.fetch(`http://x/api/swaps/${open.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "approved", replacementExerciseId: b }) })).status).toBe(200);
  });
});

describe("inbox — real-time notification WS", () => {
  it("requires a signed-in user, then expects a websocket upgrade", async () => {
    // Unauthenticated → 401 from the guard's user-only lane.
    expect((await SELF.fetch("http://x/api/inbox/ws")).status).toBe(401);
    // Authenticated but not a WS handshake → 426 Upgrade Required.
    const res = await SELF.fetch("http://x/api/inbox/ws", { headers: auth(ownerCookie) });
    expect(res.status).toBe(426);
  });

  it("InboxDO.push is a no-op with no open sockets (never throws)", async () => {
    const stub = (env as unknown as { INBOX: DurableObjectNamespace }).INBOX;
    const id = stub.idFromName("user-with-no-sockets");
    await (stub.get(id) as unknown as { push: (p: unknown) => Promise<void> }).push({ type: "refresh" });
  });
});

describe("custom domains (SPEC §14.1) — Host pins the tenant", () => {
  const HOST = "studio-one.example.com";
  let tenantId = "";

  it("Host resolves the tenant, pins members to it, and locks out strangers", async () => {
    // Studio One's tenant id, then map a custom hostname to it (as provisioning would).
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    tenantId = ctx.active.tenantId;
    await (env.DB as D1Database)
      .prepare("INSERT INTO tenant_domains (hostname, tenant_id, cf_hostname_id, status, created_at, updated_at) VALUES (?, ?, 'ch_test', 'active', '2026-01-01', '2026-01-01')")
      .bind(HOST, tenantId)
      .run();

    // Public /api/host brands the login for whoever owns the domain — no auth.
    const host = (await (await SELF.fetch(`http://${HOST}/api/host`)).json()) as { platform: boolean; tenant: { tenantId: string; name: string } | null };
    expect(host.platform).toBe(false);
    expect(host.tenant?.tenantId).toBe(tenantId);
    expect(host.tenant?.name).toBe("Studio One");

    // A member on this domain is scoped to it (active === host tenant, switching hidden).
    const member = (await (await SELF.fetch(`http://${HOST}/api/context`, { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } | null; hostTenantId: string | null };
    expect(member.active?.tenantId).toBe(tenantId);
    expect(member.hostTenantId).toBe(tenantId);

    // A signed-in NON-member gets no tenant scope on this domain (can't reach data).
    const stranger = (await (await SELF.fetch(`http://${HOST}/api/context`, { headers: auth(otherCookie) })).json()) as { active: unknown; hostTenantId: string | null };
    expect(stranger.active).toBe(null);
    expect(stranger.hostTenantId).toBe(tenantId);
    // ...and a tenant-scoped write is rejected outright.
    const write = await SELF.fetch(`http://${HOST}/api/clients`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(otherCookie) },
      body: JSON.stringify({ displayName: "Nope" }),
    });
    expect(write.status).toBe(401);

    // Switching away from the domain's tenant is blocked (the domain IS the tenant).
    const sw = await SELF.fetch(`http://${HOST}/api/context/switch`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ tenantId: "some-other-tenant" }),
    });
    expect(sw.status).toBe(409);
  });

  it("platform host resolves no tenant", async () => {
    const host = (await (await SELF.fetch("http://localhost:8787/api/host")).json()) as { platform: boolean; tenant: unknown };
    expect(host.platform).toBe(true);
    expect(host.tenant).toBe(null);
  });

  it("branded login: /t/<slug> resolves a tenant on the platform host without pinning it", async () => {
    // Owner customizes their sign-in screen; saved under branding.login.
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const saved = await SELF.fetch("http://localhost:8787/api/settings", {
      method: "PATCH", headers: H,
      body: JSON.stringify({ branding: { login: { tagline: "Train with us", headline: "Your journey starts here", showPasskey: false } } }),
    });
    expect(saved.status).toBe(200);

    // The platform host + ?slug brands the login (Studio One → slug "studio-one")
    // but stays platform:true so cross-tenant switching still works after sign-in.
    const branded = (await (await SELF.fetch("http://localhost:8787/api/host?slug=studio-one")).json()) as {
      platform: boolean; tenant: { name: string; slug: string; branding: { login?: { tagline?: string; showPasskey?: boolean } } } | null;
    };
    expect(branded.platform).toBe(true);
    expect(branded.tenant?.slug).toBe("studio-one");
    expect(branded.tenant?.branding?.login?.tagline).toBe("Train with us");
    expect(branded.tenant?.branding?.login?.showPasskey).toBe(false);

    // An unknown slug just falls back to the neutral platform entry.
    const unknown = (await (await SELF.fetch("http://localhost:8787/api/host?slug=nope-not-real")).json()) as { platform: boolean; tenant: unknown };
    expect(unknown.platform).toBe(true);
    expect(unknown.tenant).toBe(null);
  });
});

describe("OTP-send gate — sign-up eligibility + cooldown", () => {
  const SEND = "http://localhost:8787/api/auth/email-otp/send-verification-otp";
  const send = (body: Record<string, unknown>) =>
    SELF.fetch(SEND, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:8787" }, body: JSON.stringify(body) });
  const setSelfRegister = (on: boolean) =>
    SELF.fetch("http://localhost:8787/api/settings", { method: "PATCH", headers: { "content-type": "application/json", ...auth(ownerCookie) }, body: JSON.stringify({ marketplace: { selfRegister: on } }) });

  it("invite-only studio turns a brand-new email away", async () => {
    await setSelfRegister(false);
    const res = await send({ email: "stranger-1@test.dev", type: "sign-in", slug: "studio-one" });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("invite_only");
  });

  it("an invited (existing client-row) email is let through even when invite-only", async () => {
    await setSelfRegister(false);
    const tenantId = ((await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } }).active.tenantId;
    await SELF.fetch("http://x/api/clients", { method: "POST", headers: { "content-type": "application/json", ...auth(ownerCookie) }, body: JSON.stringify({ email: "invited-1@test.dev", displayName: "Invited One" }) });
    const res = await send({ email: "invited-1@test.dev", type: "sign-in", slug: "studio-one" });
    expect(res.status).toBe(200);
    expect(tenantId).toBeTruthy();
  });

  it("self sign-up on: a new email is accepted and a pending client is reserved", async () => {
    await setSelfRegister(true);
    const tenantId = ((await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } }).active.tenantId;
    const res = await send({ email: "joiner-1@test.dev", type: "sign-in", slug: "studio-one", intent: "signup" });
    expect(res.status).toBe(200);
    const row = await (env.DB as D1Database)
      .prepare("SELECT display_name FROM clients WHERE tenant_id = ? AND LOWER(email) = 'joiner-1@test.dev'")
      .bind(tenantId)
      .first<{ display_name: string }>();
    expect(row?.display_name).toBe("joiner-1"); // seeded from the address, not asked
    await setSelfRegister(false);
  });

  it("enforces a per-email cooldown between codes", async () => {
    const first = await send({ email: "cooldown-1@test.dev", type: "sign-in" });
    expect(first.status).toBe(200); // platform host, no tenant → always allowed
    const second = await send({ email: "cooldown-1@test.dev", type: "sign-in" });
    expect(second.status).toBe(429);
    expect(((await second.json()) as { retryAfterSec: number }).retryAfterSec).toBeGreaterThan(0);
  });

  it("Turnstile: once a secret is configured, a code needs a valid token", async () => {
    const db = env.DB as D1Database;
    await db.prepare("INSERT INTO app_config (key, value) VALUES ('turnstile.secret', 'test-secret') ON CONFLICT(key) DO UPDATE SET value = 'test-secret'").run();
    try {
      // No token → rejected before any network call (verify returns not-ok on a
      // missing token), so this stays hermetic.
      const res = await send({ email: "ts-guard@test.dev", type: "sign-in" });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("human_check_failed");
    } finally {
      await db.prepare("DELETE FROM app_config WHERE key = 'turnstile.secret'").run();
    }
  });
});

describe("passkey — Better Auth endpoint methods (regression)", () => {
  // The option endpoints are GETs; the client used to POST them and silently
  // 404'd, so passkey enroll + sign-in never worked. Lock the methods in.
  const B = "http://localhost:8787";
  it("register-options is GET (POST 404s); authenticate-options is GET and pre-auth", async () => {
    const getReg = await SELF.fetch(`${B}/api/auth/passkey/generate-register-options`, { headers: auth(ownerCookie) });
    expect(getReg.status).toBe(200);
    expect(((await getReg.json()) as { challenge?: string }).challenge).toBeTruthy();

    const postReg = await SELF.fetch(`${B}/api/auth/passkey/generate-register-options`, { method: "POST", headers: { "content-type": "application/json", ...auth(ownerCookie) }, body: "{}" });
    expect(postReg.status).toBe(404);

    // Sign-in options are a GET too, and must work with no session (the login
    // screen's passkey button + autofill call it before authenticating).
    const anon = await SELF.fetch(`${B}/api/auth/passkey/generate-authenticate-options`, { headers: { origin: B } });
    expect(anon.status).toBe(200);
    expect(((await anon.json()) as { challenge?: string }).challenge).toBeTruthy();

    // Removing a device: delete-passkey is a mounted POST that needs a session
    // (a missing route would 404; unauthenticated is rejected before the body).
    const delNoAuth = await SELF.fetch(`${B}/api/auth/passkey/delete-passkey`, { method: "POST", headers: { "content-type": "application/json", origin: B }, body: JSON.stringify({ id: "nope" }) });
    expect(delNoAuth.status).toBe(401);
  });

  it("enroll works for a day-old session (freshAge:0 — no SESSION_NOT_FRESH lockout)", async () => {
    const db = env.DB as D1Database;
    // Age every session well past Better Auth's 1-day `freshAge` default. The
    // passkey enroll's FIRST call (generate-register-options) runs behind
    // freshSessionMiddleware; without `session: { freshAge: 0 }` an old session
    // would 403 SESSION_NOT_FRESH here — so a user signed in >1 day couldn't add
    // a passkey at all. With the fix it still mints options.
    await db.prepare("UPDATE session SET createdAt = ?").bind(new Date(Date.now() - 3 * 86_400_000).toISOString()).run();
    const res = await SELF.fetch(`${B}/api/auth/passkey/generate-register-options`, { headers: auth(ownerCookie) });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { challenge?: string }).challenge).toBeTruthy();
  });
});

describe("white-label — public brand assets + per-tenant PWA manifest", () => {
  const B = "http://localhost:8787";
  it("brand assets read without auth; other media stays private", async () => {
    // Upload a brand asset through the API (as the owner), then read it back
    // with NO session — the login/favicon/PWA path.
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), "logo.png");
    form.set("purpose", "brand");
    const up = await SELF.fetch(`${B}/api/media/upload`, { method: "POST", headers: auth(ownerCookie), body: form });
    expect(up.status).toBe(201);
    const { key } = (await up.json()) as { key: string };
    expect(key).toMatch(/\/brand\//);

    const brand = await SELF.fetch(`${B}/api/media/${key}`); // NO cookie
    expect(brand.status).toBe(200);
    expect(brand.headers.get("cache-control")).toContain("public");
    await brand.arrayBuffer(); // drain the R2 stream (isolated-storage hygiene)

    // A non-brand media path with no session is still rejected at the guard.
    const priv = await SELF.fetch(`${B}/api/media/${key.replace("/brand/", "/misc/")}`);
    expect(priv.status).toBe(401);
    await priv.text();
  });

  it("manifest is Mossa on the platform host and the tenant's on a custom domain", async () => {
    const platform = (await (await SELF.fetch(`${B}/manifest.webmanifest`)).json()) as { name: string; icons: { src: string }[] };
    expect(platform.name).toBe("Mossa");

    // Point a custom domain at Studio One with a branded icon + primary.
    const db = env.DB as D1Database;
    const tenantId = ((await (await SELF.fetch(`${B}/api/context`, { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } }).active.tenantId;
    await SELF.fetch(`${B}/api/settings`, { method: "PATCH", headers: { "content-type": "application/json", ...auth(ownerCookie) }, body: JSON.stringify({ branding: { iconUrl: `/api/media/t/${tenantId}/brand/icon.png`, tokens: { dark: { "--primary": "oklch(0.62 0.19 12)", "--background": "oklch(0.165 0.006 285)" } } } }) });
    await db.prepare("INSERT INTO tenant_domains (hostname, tenant_id, status, created_at, updated_at) VALUES ('app.studio1.test', ?, 'active', ?, ?) ON CONFLICT(hostname) DO UPDATE SET status='active', tenant_id=excluded.tenant_id").bind(tenantId, new Date().toISOString(), new Date().toISOString()).run();

    const m = (await (await SELF.fetch("http://app.studio1.test/manifest.webmanifest")).json()) as { name: string; theme_color: string; icons: { src: string; sizes: string }[] };
    expect(m.name).toBe("Studio One");
    expect(m.theme_color).toBe("#e04667"); // oklch(0.62 0.19 12) → hex
    expect(m.icons[0]!.src).toContain("/brand/icon.png");
    expect(m.icons.some((i) => i.sizes === "512x512")).toBe(true);
  });
});

describe("access gate — clientAccess in context", () => {
  const B = "http://localhost:8787";
  const H = () => ({ "content-type": "application/json", ...auth(ownerCookie) });
  // OTP sign-in only (no org creation) — the invited-client path.
  const clientSignIn = async (email: string): Promise<string> => {
    const db = env.DB as D1Database;
    await SELF.fetch(`${B}/api/auth/email-otp/send-verification-otp`, { method: "POST", headers: { "content-type": "application/json", origin: B }, body: JSON.stringify({ email, type: "sign-in" }) });
    const row = await db.prepare("SELECT value FROM verification ORDER BY createdAt DESC LIMIT 1").first<{ value: string }>();
    const otp = ((row?.value ?? "").match(/\d{6}/) ?? [])[0];
    const v = await SELF.fetch(`${B}/api/auth/sign-in/email-otp`, { method: "POST", headers: { "content-type": "application/json", origin: B }, body: JSON.stringify({ email, otp }) });
    return grabCookies(v);
  };

  it("required + no package → blocked; granting a package unblocks", async () => {
    const tenantId = ((await (await SELF.fetch(`${B}/api/context`, { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } }).active.tenantId;
    // An invited client + a package with a 30-day workout budget.
    const client = (await (await SELF.fetch(`${B}/api/clients`, { method: "POST", headers: H(), body: JSON.stringify({ email: "gateclient@test.dev", displayName: "Gate Client" }) })).json() as { client: { id: string } }).client;
    const pkg = (await (await SELF.fetch(`${B}/api/packages`, { method: "POST", headers: H(), body: JSON.stringify({ name: "Starter", budgets: [{ feature: "workout", days: 30 }] }) })).json()) as { id: string };
    // Turn on gated access for the studio.
    await SELF.fetch(`${B}/api/settings`, { method: "PATCH", headers: H(), body: JSON.stringify({ marketplace: { requireActiveAccess: true } }) });

    // Client signs in, links to the tenant, and selects that persona.
    const cookie = await clientSignIn("gateclient@test.dev");
    await SELF.fetch(`${B}/api/context`, { headers: { origin: B, Cookie: cookie } }); // mints membership
    await SELF.fetch(`${B}/api/context/switch`, { method: "POST", headers: { "content-type": "application/json", origin: B, Cookie: cookie }, body: JSON.stringify({ tenantId }) });

    const before = (await (await SELF.fetch(`${B}/api/context`, { headers: { origin: B, Cookie: cookie } })).json()) as { active: { role: string; clientId: string | null }; clientAccess: { active: boolean; required: boolean; daysRemaining: number | null } | null };
    expect(before.active.role).toBe("client");
    expect(before.clientAccess).toEqual({ active: false, required: true, daysRemaining: null });

    // Owner grants the package → the client is now covered.
    const grant = await SELF.fetch(`${B}/api/subscriptions/grant`, { method: "POST", headers: H(), body: JSON.stringify({ clientId: client.id, packageId: pkg.id }) });
    expect(grant.status).toBeLessThan(300);

    const after = (await (await SELF.fetch(`${B}/api/context`, { headers: { origin: B, Cookie: cookie } })).json()) as { clientAccess: { active: boolean; required: boolean; daysRemaining: number | null } };
    expect(after.clientAccess.active).toBe(true);
    expect(after.clientAccess.required).toBe(true);
    expect(after.clientAccess.daysRemaining ?? 0).toBeGreaterThan(0);

    await SELF.fetch(`${B}/api/settings`, { method: "PATCH", headers: H(), body: JSON.stringify({ marketplace: { requireActiveAccess: false } }) });
  });
});

describe("supplements — pausing hides from the client + blocks logging", () => {
  const B = "http://localhost:8787";
  const H = () => ({ "content-type": "application/json", ...auth(ownerCookie) });
  const clientSignIn = async (email: string): Promise<string> => {
    const db = env.DB as D1Database;
    await SELF.fetch(`${B}/api/auth/email-otp/send-verification-otp`, { method: "POST", headers: { "content-type": "application/json", origin: B }, body: JSON.stringify({ email, type: "sign-in" }) });
    const row = await db.prepare("SELECT value FROM verification ORDER BY createdAt DESC LIMIT 1").first<{ value: string }>();
    const otp = ((row?.value ?? "").match(/\d{6}/) ?? [])[0];
    return grabCookies(await SELF.fetch(`${B}/api/auth/sign-in/email-otp`, { method: "POST", headers: { "content-type": "application/json", origin: B }, body: JSON.stringify({ email, otp }) }));
  };

  it("a paused supplement drops off the client's list + can't be logged; staff still see it", async () => {
    const tenantId = ((await (await SELF.fetch(`${B}/api/context`, { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } }).active.tenantId;
    const client = (await (await SELF.fetch(`${B}/api/clients`, { method: "POST", headers: H(), body: JSON.stringify({ email: "suppclient@test.dev", displayName: "Supp Client" }) })).json() as { client: { id: string } }).client;
    const sup = (await (await SELF.fetch(`${B}/api/supplements`, { method: "POST", headers: H(), body: JSON.stringify({ clientId: client.id, name: "Creatine", schedule: [{ slot: "daily" }] }) })).json()) as { id: string };

    // Client signs in and selects the tenant.
    const cookie = await clientSignIn("suppclient@test.dev");
    const CH = { origin: B, Cookie: cookie };
    await SELF.fetch(`${B}/api/context`, { headers: CH });
    await SELF.fetch(`${B}/api/context/switch`, { method: "POST", headers: { "content-type": "application/json", ...CH }, body: JSON.stringify({ tenantId }) });

    // Active: the client sees it and can log it.
    const list1 = (await (await SELF.fetch(`${B}/api/supplements?clientId=${client.id}`, { headers: CH })).json()) as { supplements: { id: string }[] };
    expect(list1.supplements.some((s) => s.id === sup.id)).toBe(true);
    const log1 = await SELF.fetch(`${B}/api/supplements/${sup.id}/log`, { method: "POST", headers: { "content-type": "application/json", ...CH }, body: JSON.stringify({ clientId: client.id, date: "2026-07-20", slot: "daily" }) });
    expect(log1.status).toBe(200);

    // Coach pauses it.
    await SELF.fetch(`${B}/api/supplements/${sup.id}`, { method: "PATCH", headers: H(), body: JSON.stringify({ status: "paused" }) });

    // Client no longer sees it and can't log it.
    const list2 = (await (await SELF.fetch(`${B}/api/supplements?clientId=${client.id}`, { headers: CH })).json()) as { supplements: { id: string }[] };
    expect(list2.supplements.some((s) => s.id === sup.id)).toBe(false);
    const log2 = await SELF.fetch(`${B}/api/supplements/${sup.id}/log`, { method: "POST", headers: { "content-type": "application/json", ...CH }, body: JSON.stringify({ clientId: client.id, date: "2026-07-20", slot: "daily" }) });
    expect(log2.status).toBe(409);

    // Loggable surfaces are active-only for staff too (coach viewing the client's
    // Today/Wellness); only the Manage view opts into paused via includePaused.
    const staffDefault = (await (await SELF.fetch(`${B}/api/supplements?clientId=${client.id}`, { headers: auth(ownerCookie) })).json()) as { supplements: { id: string }[] };
    expect(staffDefault.supplements.some((s) => s.id === sup.id)).toBe(false);
    const staffManage = (await (await SELF.fetch(`${B}/api/supplements?clientId=${client.id}&includePaused=1`, { headers: auth(ownerCookie) })).json()) as { supplements: { id: string; status: string }[] };
    expect(staffManage.supplements.find((s) => s.id === sup.id)?.status).toBe("paused");
  });

  it("client supplement-guide returns tips for the active stack; empty with none", async () => {
    const client = (await (await SELF.fetch(`${B}/api/clients`, { method: "POST", headers: H(), body: JSON.stringify({ email: "supp2@test.dev", displayName: "Supp Two" }) })).json() as { client: { id: string } }).client;
    // No supplements yet → empty guide.
    const empty = (await (await SELF.fetch(`${B}/api/ai/supplement-guide`, { method: "POST", headers: H(), body: JSON.stringify({ clientId: client.id }) })).json()) as { guide: string };
    expect(empty.guide).toBe("");
    // Add one, then the guide has content (mock lane).
    await SELF.fetch(`${B}/api/supplements`, { method: "POST", headers: H(), body: JSON.stringify({ clientId: client.id, name: "Omega-3", dose: "2g", schedule: [{ slot: "daily" }] }) });
    const g = await SELF.fetch(`${B}/api/ai/supplement-guide`, { method: "POST", headers: H(), body: JSON.stringify({ clientId: client.id }) });
    expect(g.status).toBe(200);
    const guide = ((await g.json()) as { guide: string }).guide;
    expect(guide.length).toBeGreaterThan(0);
    expect(guide).toContain("Omega-3");
  });
});

describe("foods — tenant isolation + copy-on-write", () => {
  const mkFood = (over: Record<string, unknown>) => ({
    name: "Test Bar", calories: 200, proteinG: 10, source: "usda", sourceId: "SHARED-123", ...over,
  });

  it("re-importing the same (source, sourceId) from another tenant does not clobber the first", async () => {
    // Studio One imports a food.
    const a = (await (await SELF.fetch("http://x/api/foods", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify(mkFood({ name: "Owner1 Bar", calories: 200 })),
    })).json()) as { id: string };

    // Studio Two imports the SAME source/sourceId with different values.
    const b = (await (await SELF.fetch("http://x/api/foods", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(otherCookie) },
      body: JSON.stringify(mkFood({ name: "Owner2 Bar", calories: 999 })),
    })).json()) as { id: string };

    // Distinct rows — each tenant owns its own copy.
    expect(b.id).not.toBe(a.id);

    // Studio One's food is unchanged and Studio Two can't see it.
    const one = (await (await SELF.fetch("http://x/api/foods?q=owner1", { headers: auth(ownerCookie) })).json()) as { foods: { id: string; name: string; calories: number }[] };
    const mine = one.foods.find((f) => f.id === a.id)!;
    expect(mine.name).toBe("Owner1 Bar");
    expect(mine.calories).toBe(200);
    const twoSees = (await (await SELF.fetch(`http://x/api/foods/${a.id}`, { headers: auth(otherCookie) })).status);
    expect(twoSees).toBe(404);
  });

  it("a manually-added food (custom, no sourceId) lands in the library list", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const created = (await (await SELF.fetch("http://x/api/foods", { method: "POST", headers: H, body: JSON.stringify({ name: "Homemade Granola", calories: 420, proteinG: 11, carbsG: 60, fatG: 15, source: "custom" }) })).json()) as { id: string; imported: boolean };
    expect(created.id).toBeTruthy();
    // Appears in the unfiltered library list…
    const all = (await (await SELF.fetch("http://x/api/foods", { headers: auth(ownerCookie) })).json()) as { foods: { id: string }[] };
    expect(all.foods.map((f) => f.id)).toContain(created.id);
    // …and under a matching search.
    const q = (await (await SELF.fetch("http://x/api/foods?q=granola", { headers: auth(ownerCookie) })).json()) as { foods: { id: string }[] };
    expect(q.foods.map((f) => f.id)).toContain(created.id);
  });

  it("the /foods/:id editor route does not shadow /foods/search-external (regression)", async () => {
    // Before the id was constrained to `food_…`, this GET matched /foods/:id
    // with id="search-external" and 404'd — silently killing web food search.
    const res = await SELF.fetch("http://x/api/foods/search-external?q=banana", { headers: auth(ownerCookie) });
    expect(res.status).not.toBe(404);
    const body = (await res.json()) as { foods?: unknown[]; error?: string };
    expect(body.error).not.toBe("not found");
  }, 15000);

  it("editing a platform-seed food forks a tenant copy (copy-on-write), leaving the seed intact", async () => {
    // Seed a global food (tenant_id NULL) directly, as the build-time seed would.
    await (env.DB as D1Database)
      .prepare("INSERT INTO foods (id, tenant_id, name, calories, protein_g, visibility, source, verified, active, created_at) VALUES ('food_seed1', NULL, 'Seed Apple', 95, 0, 'tenant', 'seed', 1, 1, '2026-01-01')")
      .run();

    // Studio One edits it → server forks an owned copy.
    const res = await SELF.fetch("http://x/api/foods/food_seed1", {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ calories: 120 }),
    });
    const out = (await res.json()) as { id: string; forked?: boolean };
    expect(out.forked).toBe(true);
    expect(out.id).not.toBe("food_seed1");

    // The global seed row is untouched.
    const seed = await (env.DB as D1Database).prepare("SELECT calories, tenant_id FROM foods WHERE id = 'food_seed1'").first<{ calories: number; tenant_id: string | null }>();
    expect(seed!.calories).toBe(95);
    expect(seed!.tenant_id).toBe(null);

    // The fork carries the edit and belongs to Studio One.
    const fork = await (env.DB as D1Database).prepare("SELECT calories FROM foods WHERE id = ?").bind(out.id).first<{ calories: number }>();
    expect(fork!.calories).toBe(120);
  });
});

describe("library archive (soft-delete) + resolve lane", () => {
  // ownerCookie is only assigned in beforeAll (after collection), so build the
  // auth header lazily at call time rather than at describe-body evaluation.
  const H = () => ({ "content-type": "application/json", ...auth(ownerCookie) });
  const mkEx = async (name: string) => ((await (await SELF.fetch("http://x/api/exercises", { method: "POST", headers: H(), body: JSON.stringify({ name, visibility: "tenant" }) })).json()) as { id: string }).id;

  it("archiving hides an exercise from browse but keeps it resolvable via scope=all", async () => {
    const id = await mkEx("Archive Me Curl");
    const before = (await (await SELF.fetch("http://x/api/exercises?q=archive me curl", { headers: auth(ownerCookie) })).json()) as { exercises: { id: string }[] };
    expect(before.exercises.map((e) => e.id)).toContain(id);

    expect((await SELF.fetch(`http://x/api/exercises/${id}`, { method: "DELETE", headers: H() })).status).toBe(200);

    // Gone from the browse lane…
    const browse = (await (await SELF.fetch("http://x/api/exercises?q=archive me curl", { headers: auth(ownerCookie) })).json()) as { exercises: { id: string }[] };
    expect(browse.exercises.map((e) => e.id)).not.toContain(id);
    // …but still resolves on the scope=all lane (plans/logs that reference it).
    const resolve = (await (await SELF.fetch("http://x/api/exercises?scope=all", { headers: auth(ownerCookie) })).json()) as { exercises: { id: string; active: number }[] };
    const row = resolve.exercises.find((e) => e.id === id);
    expect(row).toBeTruthy();
    expect(row!.active).toBe(0);
  });

  it("a tenant cannot archive the platform seed or another tenant's row", async () => {
    // Platform seed (tenant NULL) — the tenant-scoped UPDATE can never match it.
    await (env.DB as D1Database).prepare("INSERT INTO exercises (id, tenant_id, visibility, name, active, created_at) VALUES ('exr_seedA', NULL, 'tenant', 'Seed Squat', 1, '2026-01-01')").run();
    await SELF.fetch("http://x/api/exercises/exr_seedA", { method: "DELETE", headers: H() });
    const seed = await (env.DB as D1Database).prepare("SELECT active FROM exercises WHERE id = 'exr_seedA'").first<{ active: number }>();
    expect(seed!.active).toBe(1);

    // Another tenant's row — owner1's delete must not touch owner2's exercise.
    const other = ((await (await SELF.fetch("http://x/api/exercises", { method: "POST", headers: { "content-type": "application/json", ...auth(otherCookie) }, body: JSON.stringify({ name: "Owner2 Row", visibility: "tenant" }) })).json()) as { id: string }).id;
    await SELF.fetch(`http://x/api/exercises/${other}`, { method: "DELETE", headers: H() });
    const stillThere = (await (await SELF.fetch("http://x/api/exercises?q=owner2 row", { headers: auth(otherCookie) })).json()) as { exercises: { id: string }[] };
    expect(stillThere.exercises.map((e) => e.id)).toContain(other);
  });

  it("usage counts the plans that reference an exercise", async () => {
    const id = await mkEx("Used In Plan Row");
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    const body = JSON.stringify({ days: [{ blocks: [{ slots: [{ exerciseId: id, sets: [] }] }] }] });
    await (env.DB as D1Database).prepare("INSERT INTO workout_plans (id, tenant_id, client_id, name, status, body_json, created_at) VALUES ('wp_use1', ?, 'c1', 'P', 'draft', ?, '2026-01-01')").bind(ctx.active.tenantId, body).run();

    const usage = (await (await SELF.fetch(`http://x/api/exercises/${id}/usage`, { headers: auth(ownerCookie) })).json()) as { plans: number; templates: number };
    expect(usage.plans).toBe(1);
    expect(usage.templates).toBe(0);
  });

  it("archiving a food hides it from browse but the resolve routes still return it", async () => {
    const food = ((await (await SELF.fetch("http://x/api/foods", { method: "POST", headers: H(), body: JSON.stringify({ name: "Archive Yogurt", calories: 100 }) })).json()) as { id: string }).id;
    expect((await SELF.fetch(`http://x/api/foods/${food}`, { method: "DELETE", headers: H() })).status).toBe(200);

    const browse = (await (await SELF.fetch("http://x/api/foods?q=archive yogurt", { headers: auth(ownerCookie) })).json()) as { foods: { id: string }[] };
    expect(browse.foods.map((f) => f.id)).not.toContain(food);
    // Resolvable both by id and on the scope=all lane.
    expect((await SELF.fetch(`http://x/api/foods/${food}`, { headers: auth(ownerCookie) })).status).toBe(200);
    const resolve = (await (await SELF.fetch("http://x/api/foods?scope=all", { headers: auth(ownerCookie) })).json()) as { foods: { id: string }[] };
    expect(resolve.foods.map((f) => f.id)).toContain(food);
  });
});

describe("plan lifecycle — publish supersedes, restore, draft-only delete", () => {
  const H = () => ({ "content-type": "application/json", ...auth(ownerCookie) });
  const mkClient = async () => ((await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H(), body: JSON.stringify({ displayName: "PlanLifecycle" }) })).json()) as { client: { id: string } }).client.id;
  const mkPlan = async (clientId: string, name: string) => ((await (await SELF.fetch("http://x/api/workout-plans", { method: "POST", headers: H(), body: JSON.stringify({ clientId, name }) })).json()) as { plan: { id: string } }).plan.id;
  const publish = (id: string) => SELF.fetch(`http://x/api/workout-plans/${id}/publish`, { method: "POST", headers: H() });
  const statusMap = async (clientId: string) => {
    const r = (await (await SELF.fetch(`http://x/api/workout-plans?clientId=${clientId}`, { headers: auth(ownerCookie) })).json()) as { plans: { id: string; status: string }[] };
    return new Map(r.plans.map((p) => [p.id, p.status]));
  };

  it("publishing supersedes the prior plan; re-publishing an older one supersedes the newer", async () => {
    const client = await mkClient();
    const a = await mkPlan(client, "Plan A");
    const b = await mkPlan(client, "Plan B");
    await publish(a);
    let s = await statusMap(client);
    expect(s.get(a)).toBe("published");
    expect(s.get(b)).toBe("draft");
    await publish(b);
    s = await statusMap(client);
    expect(s.get(b)).toBe("published");
    expect(s.get(a)).toBe("superseded");
    // Re-publish the OLDER plan A → it goes active again and B is superseded.
    expect((await publish(a)).status).toBe(200);
    s = await statusMap(client);
    expect(s.get(a)).toBe("published");
    expect(s.get(b)).toBe("superseded");
  });

  it("plan lanes: publishing supersedes only within a lane; switching the lane changes the active plan", async () => {
    const client = await mkClient();
    // A second lane (e.g. "Off week"). Default lane = null.
    const laneId = ((await (await SELF.fetch(`http://x/api/clients/${client}/variants`, { method: "POST", headers: H(), body: JSON.stringify({ label: "Off week" }) })).json()) as { id: string }).id;

    // Default-lane plan (variantId omitted → null) + an off-week-lane plan.
    const defA = await mkPlan(client, "Work A");
    await publish(defA);
    const offA = ((await (await SELF.fetch("http://x/api/workout-plans", { method: "POST", headers: H(), body: JSON.stringify({ clientId: client, name: "Off A", variantId: laneId }) })).json()) as { plan: { id: string } }).plan.id;
    await publish(offA);

    // Both are published concurrently — different lanes, no cross-supersede.
    let s = await statusMap(client);
    expect(s.get(defA)).toBe("published");
    expect(s.get(offA)).toBe("published");

    // A second default-lane plan supersedes ONLY the default-lane one.
    const defB = await mkPlan(client, "Work B");
    await publish(defB);
    s = await statusMap(client);
    expect(s.get(defA)).toBe("superseded"); // same lane → superseded
    expect(s.get(defB)).toBe("published");
    expect(s.get(offA)).toBe("published"); // other lane untouched

    // The plan list carries lane context.
    const list = (await (await SELF.fetch(`http://x/api/workout-plans?clientId=${client}`, { headers: H() })).json()) as { variants: { id: string; label: string }[]; currentVariantId: string | null; defaultLabel: string; plans: { id: string; variantId: string | null }[] };
    expect(list.variants.map((v) => v.label)).toContain("Off week");
    expect(list.currentVariantId).toBeNull(); // default lane
    expect(list.defaultLabel).toBe("Main"); // default lane's default name
    expect(list.plans.find((p) => p.id === offA)!.variantId).toBe(laneId);

    // The default (Main) lane can be renamed; "Main" resets it.
    await SELF.fetch(`http://x/api/clients/${client}/default-lane`, { method: "PATCH", headers: H(), body: JSON.stringify({ label: "Regular week" }) });
    const renamed = (await (await SELF.fetch(`http://x/api/workout-plans?clientId=${client}`, { headers: H() })).json()) as { defaultLabel: string };
    expect(renamed.defaultLabel).toBe("Regular week");
    await SELF.fetch(`http://x/api/clients/${client}/default-lane`, { method: "PATCH", headers: H(), body: JSON.stringify({ label: "Main" }) });
    const reset = (await (await SELF.fetch(`http://x/api/clients/${client}/variants`, { headers: H() })).json()) as { defaultLabel: string };
    expect(reset.defaultLabel).toBe("Main");

    // Today resolves the DEFAULT lane's published plan…
    const today = new Date().toISOString().slice(0, 10);
    const bundle1 = (await (await SELF.fetch(`http://x/api/today?clientId=${client}&date=${today}`, { headers: H() })).json()) as { publishedWorkoutPlan: { id: string } | null };
    expect(bundle1.publishedWorkoutPlan?.id).toBe(defB);

    // …switch to the off-week lane → Today now serves the off-week plan.
    expect((await SELF.fetch(`http://x/api/clients/${client}/current-variant`, { method: "PATCH", headers: H(), body: JSON.stringify({ variantId: laneId }) })).status).toBe(200);
    const bundle2 = (await (await SELF.fetch(`http://x/api/today?clientId=${client}&date=${today}`, { headers: H() })).json()) as { publishedWorkoutPlan: { id: string } | null };
    expect(bundle2.publishedWorkoutPlan?.id).toBe(offA);

    // An unknown lane id is rejected.
    expect((await SELF.fetch(`http://x/api/clients/${client}/current-variant`, { method: "PATCH", headers: H(), body: JSON.stringify({ variantId: "lane_bogus" }) })).status).toBe(400);

    // Archiving the current lane drops the client back to the default lane.
    await SELF.fetch(`http://x/api/clients/${client}/variants/${laneId}`, { method: "PATCH", headers: H(), body: JSON.stringify({ archived: true }) });
    const after = (await (await SELF.fetch(`http://x/api/clients/${client}/variants`, { headers: H() })).json()) as { currentVariantId: string | null };
    expect(after.currentVariantId).toBeNull();
  });

  it("creates a client plan from a template, copying the template body", async () => {
    const client = await mkClient();
    const tpl = (await (await SELF.fetch("http://x/api/workout-templates", { method: "POST", headers: H(), body: JSON.stringify({ name: "PPL Template", visibility: "tenant", body: { days: [{ name: "Push", blocks: [] }, { name: "Pull", blocks: [] }] } }) })).json()) as { template: { id: string } };
    const res = await SELF.fetch("http://x/api/workout-plans/from-template", { method: "POST", headers: H(), body: JSON.stringify({ clientId: client, templateId: tpl.template.id }) });
    expect(res.status).toBe(201);
    const { plan } = (await res.json()) as { plan: { id: string; name: string } };
    expect(plan.name).toBe("PPL Template");
    // The instantiated plan is a fresh draft carrying the template's body.
    const back = (await (await SELF.fetch(`http://x/api/workout-plans/${plan.id}`, { headers: auth(ownerCookie) })).json()) as { plan: { status: string; body: { days: { name: string }[] } } };
    expect(back.plan.status).toBe("draft");
    expect(back.plan.body.days.map((d) => d.name)).toEqual(["Push", "Pull"]);
    // Unknown template id → 404.
    expect((await SELF.fetch("http://x/api/workout-plans/from-template", { method: "POST", headers: H(), body: JSON.stringify({ clientId: client, templateId: "wtp_missing" }) })).status).toBe(404);
  });

  it("only drafts can be deleted; published plans must be archived instead", async () => {
    const client = await mkClient();
    const draft = await mkPlan(client, "Deletable");
    expect((await SELF.fetch(`http://x/api/workout-plans/${draft}`, { method: "DELETE", headers: H() })).status).toBe(200);

    const pub = await mkPlan(client, "Publishable");
    await publish(pub);
    expect((await SELF.fetch(`http://x/api/workout-plans/${pub}`, { method: "DELETE", headers: H() })).status).toBe(409);
    expect((await SELF.fetch(`http://x/api/workout-plans/${pub}/status`, { method: "POST", headers: H(), body: JSON.stringify({ status: "archived" }) })).status).toBe(200);
    expect((await statusMap(client)).get(pub)).toBe("archived");
  });

  it("a superseded plan is read-only until rolled back to a draft", async () => {
    const client = await mkClient();
    const a = await mkPlan(client, "RollA");
    const b = await mkPlan(client, "RollB");
    await publish(a); await publish(b); // a is now superseded
    expect((await SELF.fetch(`http://x/api/workout-plans/${a}`, { method: "PATCH", headers: H(), body: JSON.stringify({ name: "nope" }) })).status).toBe(409);
    expect((await SELF.fetch(`http://x/api/workout-plans/${a}/status`, { method: "POST", headers: H(), body: JSON.stringify({ status: "draft" }) })).status).toBe(200);
    expect((await SELF.fetch(`http://x/api/workout-plans/${a}`, { method: "PATCH", headers: H(), body: JSON.stringify({ name: "RollA v2" }) })).status).toBe(200);
  });
});

describe("client preferences + body metrics + goal staleness", () => {
  const H = () => ({ "content-type": "application/json", ...auth(ownerCookie) });
  const mkClient = async (): Promise<string> => {
    const r = await SELF.fetch("http://x/api/clients", { method: "POST", headers: H(), body: JSON.stringify({ displayName: "Metrics Client", gender: "male", dateOfBirth: "1994-01-01", heightCm: 180 }) });
    return ((await r.json()) as { client: { id: string } }).client.id;
  };
  const measure = (clientId: string, date: string, weightKg: number, bodyFatPercent?: number) =>
    SELF.fetch("http://x/api/measurements", { method: "POST", headers: H(), body: JSON.stringify({ clientId, data: { date, weightKg, ...(bodyFatPercent != null ? { bodyFatPercent } : {}) } }) });

  it("preferences round-trip + profile completeness", async () => {
    const id = await mkClient();
    await SELF.fetch(`http://x/api/clients/${id}`, { method: "PATCH", headers: H(), body: JSON.stringify({ preferences: { targetWeightKg: 78, primaryGoal: "lose_weight", activityLevel: "moderate", workoutsPerWeek: 4, mealsPerDay: 3, workoutLocation: "gym" } }) });
    const view = (await (await SELF.fetch(`http://x/api/clients/${id}`, { headers: H() })).json()) as { client: { preferences: Record<string, unknown>; profileComplete: boolean } };
    expect(view.client.preferences.primaryGoal).toBe("lose_weight");
    expect(view.client.preferences.workoutLocation).toBe("gym");
    expect(view.client.profileComplete).toBe(true);

    // Partial patch must not wipe other prefs.
    await SELF.fetch(`http://x/api/clients/${id}`, { method: "PATCH", headers: H(), body: JSON.stringify({ preferences: { mealsPerDay: 5 } }) });
    const v2 = (await (await SELF.fetch(`http://x/api/clients/${id}`, { headers: H() })).json()) as { client: { preferences: Record<string, unknown> } };
    expect(v2.client.preferences.mealsPerDay).toBe(5);
    expect(v2.client.preferences.primaryGoal).toBe("lose_weight");
  });

  it("recomputes BMI + BMR on every weight entry", async () => {
    const id = await mkClient();
    await measure(id, "2026-01-10", 80);
    const m = (await (await SELF.fetch(`http://x/api/clients/${id}`, { headers: H() })).json()) as { metrics: { bmi: number | null; bmr: number | null; weightKg: number | null } };
    expect(m.metrics.weightKg).toBe(80);
    expect(m.metrics.bmi).toBe(24.7); // 80 / 1.8^2
    expect(m.metrics.bmr).toBe(10 * 80 + 6.25 * 180 - 5 * 32 + 5); // Mifflin, age 32 in 2026
  });

  it("detects a stale goal after the body drifts", async () => {
    const id = await mkClient();
    await measure(id, "2026-01-10", 90);
    // Goal built for a 90kg body.
    await SELF.fetch("http://x/api/goals", { method: "POST", headers: H(), body: JSON.stringify({ clientId: id, label: "Cut", calculator: { gender: "male", ageYears: 32, heightCm: 180, weightKg: 90, activityLevel: "moderate", primaryGoal: "lose_weight", dietaryApproach: "balanced" } }) });
    let m = (await (await SELF.fetch(`http://x/api/clients/${id}`, { headers: H() })).json()) as { metrics: { staleness: { stale: boolean; weightDeltaKg: number | null } | null } };
    expect(m.metrics.staleness?.stale).toBe(false);
    // Drop 8kg → stale.
    await measure(id, "2026-02-20", 82);
    m = (await (await SELF.fetch(`http://x/api/clients/${id}`, { headers: H() })).json()) as { metrics: { staleness: { stale: boolean; weightDeltaKg: number | null } | null } };
    expect(m.metrics.staleness?.stale).toBe(true);
    expect(m.metrics.staleness?.weightDeltaKg).toBe(-8);
  });

  it("keeps a goal history log: manual targets round-trip, supersede is retained, attributed to who set it", async () => {
    const id = await mkClient();
    // Name the acting owner so the created_by join can attribute goals.
    const gctx = (await (await SELF.fetch("http://x/api/context", { headers: H() })).json()) as { active: { tenantId: string } };
    const gOwner = (await (env.DB as D1Database).prepare("SELECT userId FROM member WHERE organizationId = ? AND role = 'owner' LIMIT 1").bind(gctx.active.tenantId).first<{ userId: string }>())!;
    await (env.DB as D1Database).prepare("UPDATE \"user\" SET name = 'Coach Nova' WHERE id = ?").bind(gOwner.userId).run();
    // First goal, MANUAL targets (no calculator) — the coach hand-sets macros.
    await SELF.fetch("http://x/api/goals", { method: "POST", headers: H(), body: JSON.stringify({ clientId: id, label: "Phase 1", startDate: "2026-01-01", targets: { targetCalories: 2100, targetProteinG: 160 } }) });
    // Second goal supersedes it.
    await SELF.fetch("http://x/api/goals", { method: "POST", headers: H(), body: JSON.stringify({ clientId: id, label: "Phase 2", startDate: "2026-02-01", targets: { targetCalories: 2600, targetProteinG: 190 } }) });

    const { goals } = (await (await SELF.fetch(`http://x/api/goals?clientId=${id}`, { headers: H() })).json()) as { goals: { label: string; status: string; targets: Record<string, number> | null; start_date: string | null; created_by_name: string | null }[] };
    expect(goals.length).toBe(2);
    const active = goals.find((g) => g.status === "active")!;
    const past = goals.find((g) => g.status === "superseded")!;
    expect(active.label).toBe("Phase 2");
    expect(active.targets?.targetCalories).toBe(2600); // manual macros persisted verbatim
    expect(past.label).toBe("Phase 1"); // old goal retained, not deleted
    expect(past.targets?.targetCalories).toBe(2100);
    expect(active.start_date).toBe("2026-02-01"); // explicit effective date honored
    expect(active.created_by_name).toBe("Coach Nova"); // attribution
  });

  it("records a coach action in the audit log and lists it newest-first", async () => {
    const id = await mkClient();
    // A coach action (setting a goal) writes an audit row.
    await SELF.fetch("http://x/api/goals", { method: "POST", headers: H(), body: JSON.stringify({ clientId: id, label: "Recomp", calculator: { gender: "male", ageYears: 30, heightCm: 178, weightKg: 82, activityLevel: "moderate", primaryGoal: "maintain", dietaryApproach: "balanced" } }) });
    const res = await SELF.fetch(`http://x/api/clients/${id}/audit`, { headers: H() });
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as { items: { action: string; label: string; summary: string | null; actor: string | null }[] };
    const goalEntry = items.find((i) => i.action === "goal.set");
    expect(goalEntry).toBeDefined();
    expect(goalEntry!.label).toBe("set a goal"); // rendered from the AUDIT_ACTIONS registry
    expect(goalEntry!.summary).toBe("Recomp");
  });

  it("Today bundle reports profile completeness", async () => {
    const id = await mkClient();
    const before = (await (await SELF.fetch(`http://x/api/today?clientId=${id}&date=2026-01-10`, { headers: H() })).json()) as { profile: { complete: boolean; gaps: string[] } };
    expect(before.profile.complete).toBe(false);
    expect(before.profile.gaps).toContain("goal");
    await SELF.fetch(`http://x/api/clients/${id}`, { method: "PATCH", headers: H(), body: JSON.stringify({ preferences: { targetWeightKg: 78, primaryGoal: "maintain", activityLevel: "light", workoutsPerWeek: 3, mealsPerDay: 3, workoutLocation: "home" } }) });
    const after = (await (await SELF.fetch(`http://x/api/today?clientId=${id}&date=2026-01-10`, { headers: H() })).json()) as { profile: { complete: boolean } };
    expect(after.profile.complete).toBe(true);
  });
});

// The row-level security invariant (clients.ts requireClientAccess). The rest of
// the suite authenticates as owners (the easy tenant-match lane); this exercises
// the trainer lane — the one that must gate on a client_trainers assignment.
describe("requireClientAccess — trainer assignment lane", () => {
  it("a trainer reaches only ASSIGNED clients; an unassigned same-tenant client is 403", async () => {
    const db = env.DB as D1Database;
    // Studio One's tenant + a trainer user (created via their own org, then added
    // to Studio One as a trainer member and switched into it).
    const studioOne = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    const tenantId = studioOne.active.tenantId;
    const trainerCookie = await signInFlow("trainer-lane@test.dev", "Trainer Lane Org");
    const trainerUser = await db.prepare('SELECT id FROM "user" WHERE email = ?').bind("trainer-lane@test.dev").first<{ id: string }>();
    await db.prepare('INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)')
      .bind("mbr_trainer_lane", tenantId, trainerUser!.id, "trainer", "2026-01-01")
      .run();

    // Owner creates two clients; assigns the trainer to A only.
    const mk = async (name: string) =>
      ((await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: { "content-type": "application/json", ...auth(ownerCookie) }, body: JSON.stringify({ displayName: name }) })).json()) as { client: { id: string } }).client.id;
    const clientA = await mk("Assigned");
    const clientB = await mk("Unassigned");
    await SELF.fetch(`http://x/api/clients/${clientA}/trainers`, { method: "POST", headers: { "content-type": "application/json", ...auth(ownerCookie) }, body: JSON.stringify({ trainerUserId: trainerUser!.id }) });

    // Trainer switches their active workspace to Studio One (membership required).
    const sw = await SELF.fetch("http://x/api/context/switch", { method: "POST", headers: { "content-type": "application/json", ...auth(trainerCookie) }, body: JSON.stringify({ tenantId }) });
    expect(sw.status).toBe(200);

    // Assigned → 200; unassigned same-tenant → 403 (NOT 404 — the guard, not tenant scope).
    expect((await SELF.fetch(`http://x/api/clients/${clientA}`, { headers: auth(trainerCookie) })).status).toBe(200);
    expect((await SELF.fetch(`http://x/api/clients/${clientB}`, { headers: auth(trainerCookie) })).status).toBe(403);

    // Roster scope: the trainer sees only the assigned client, not the whole tenant.
    const roster = (await (await SELF.fetch("http://x/api/clients", { headers: auth(trainerCookie) })).json()) as { clients: { id: string }[] };
    const ids = roster.clients.map((r) => r.id);
    expect(ids).toContain(clientA);
    expect(ids).not.toContain(clientB);
  });
});

describe("billing DO — reserve/settle invariants", () => {
  it("caps the charge at the hold, is idempotent on replay, and rejects when short", async () => {
    const BILLING = (env as unknown as { BILLING: DurableObjectNamespace }).BILLING;
    const stub = BILLING.get(BILLING.idFromName("do-invariant-tenant")) as unknown as {
      bind: (t: string) => Promise<void>;
      topUp: (c: number) => Promise<{ balance: number }>;
      reserve: (e: number) => Promise<{ ok: boolean; hold?: string; available: number; needed?: number }>;
      settle: (h: string, a: number) => Promise<{ balance: number }>;
    };
    await stub.bind("do-invariant-tenant");
    await stub.topUp(100);
    const h = await stub.reserve(60);
    expect(h.ok).toBe(true);
    // Actual overruns the estimate (100 > 60) — the charge is CAPPED at the hold,
    // so the tenant is never driven past what was reserved (overspend invariant).
    const settled = await stub.settle(h.hold!, 100);
    expect(settled.balance).toBe(40);
    // Replaying the same settle must not debit again (idempotent).
    const replay = await stub.settle(h.hold!, 100);
    expect(replay.balance).toBe(40);
    // Reserve rejects when the estimate exceeds the available balance.
    const broke = await stub.reserve(1000);
    expect(broke.ok).toBe(false);
    expect(broke.needed).toBe(1000);
  });
});

describe("billing DO — two-bucket credits (purchased forever, granted no-rollover)", () => {
  it("grant resets each period, purchased persist, and spending drains the grant first", async () => {
    const BILLING = (env as unknown as { BILLING: DurableObjectNamespace }).BILLING;
    type V = { ok?: boolean; balance: number; purchased: number; granted: number };
    const stub = BILLING.get(BILLING.idFromName("do-buckets-tenant")) as unknown as {
      bind: (t: string) => Promise<void>;
      topUp: (c: number) => Promise<V>;
      grantMonthly: (c: number, k: string) => Promise<V>;
      charge: (c: number) => Promise<V>;
    };
    await stub.bind("do-buckets-tenant");
    // A credit pack (purchased) plus this period's plan grant.
    await stub.topUp(1000);
    let v = await stub.grantMonthly(500, "2026-07");
    expect([v.purchased, v.granted, v.balance]).toEqual([1000, 500, 1500]);
    // Spend 300 — the grant drains first, purchased is untouched.
    v = await stub.charge(300);
    expect([v.granted, v.purchased]).toEqual([200, 1000]);
    // A second grant in the SAME period is a no-op (idempotent).
    v = await stub.grantMonthly(500, "2026-07");
    expect(v.granted).toBe(200);
    // A NEW period RESETS the grant: the unused 200 lapses (not 200+500=700).
    v = await stub.grantMonthly(500, "2026-08");
    expect([v.granted, v.purchased, v.balance]).toEqual([500, 1000, 1500]);
    // Spending past the grant dips into the durable purchased bucket.
    v = await stub.charge(700); // 500 from grant, 200 from purchased
    expect([v.granted, v.purchased]).toEqual([0, 800]);
  });
});

describe("platform rail — inline Stripe webhooks", () => {
  async function sig(payload: string, secret: string): Promise<string> {
    const t = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `t=${t},v1=${hex}`;
  }
  const secret = "whsec_platform_inline";
  const post = async (payload: string) =>
    SELF.fetch("http://x/api/stripe/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": await sig(payload, secret) }, body: payload });

  it("payment_intent.succeeded tops up the durable purchased bucket (inline pack)", async () => {
    const db = env.DB as D1Database;
    await db.prepare("INSERT INTO app_config (key, value) VALUES ('stripe.webhook_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(secret).run();
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    const before = (await (await SELF.fetch("http://x/api/billing", { headers: auth(ownerCookie) })).json()) as { balance: { purchased: number } };
    const payload = JSON.stringify({ id: "evt_pi_pack_1", type: "payment_intent.succeeded", data: { object: { id: "pi_pack_1", metadata: { mossa_tenant: ctx.active.tenantId, mossa_pack: "pack_1k", mossa_credits: "1000" } } } });
    expect((await post(payload)).status).toBe(200);
    const after = (await (await SELF.fetch("http://x/api/billing", { headers: auth(ownerCookie) })).json()) as { balance: { purchased: number } };
    expect(after.balance.purchased - before.balance.purchased).toBe(1000);
    // A redelivery of the same event id is a no-op (no double top-up).
    await post(payload);
    const again = (await (await SELF.fetch("http://x/api/billing", { headers: auth(ownerCookie) })).json()) as { balance: { purchased: number } };
    expect(again.balance.purchased).toBe(after.balance.purchased);
  });

  it("an inline subscription going active (metadata-carried plan) activates the plan + grants credits", async () => {
    // Isolated synthetic tenant so we don't perturb any cookie-backed tenant's plan.
    const db = env.DB as D1Database;
    await db.prepare("INSERT INTO app_config (key, value) VALUES ('stripe.webhook_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(secret).run();
    const tenantId = "tenant_inline_sub_1";
    await db.prepare("INSERT INTO subscriptions (tenant_id, plan_id, status, comp, stripe_customer_id, updated_at) VALUES (?, 'free', 'active', 0, 'cus_inline_1', ?) ON CONFLICT(tenant_id) DO UPDATE SET stripe_customer_id = 'cus_inline_1'").bind(tenantId, new Date().toISOString()).run();
    const cpe = Math.floor(Date.now() / 1000) + 30 * 86400;
    const payload = JSON.stringify({ id: "evt_sub_inline_active", type: "customer.subscription.updated", data: { object: { id: "sub_inline_1", status: "active", customer: "cus_inline_1", current_period_end: cpe, metadata: { mossa_tenant: tenantId, mossa_plan: "solo" } } } });
    expect((await post(payload)).status).toBe(200);
    const row = (await db.prepare("SELECT plan_id, status FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<{ plan_id: string; status: string }>())!;
    expect(row.plan_id).toBe("solo");
    expect(row.status).toBe("active");
    // The solo monthly grant (500) landed in the DO's `granted` bucket.
    const BILLING = (env as unknown as { BILLING: DurableObjectNamespace }).BILLING;
    const stub = BILLING.get(BILLING.idFromName(tenantId)) as unknown as { view: () => Promise<{ granted: number }> };
    expect((await stub.view()).granted).toBeGreaterThanOrEqual(500);
  });
});

describe("promo codes — website-native discounts (tenant rail)", () => {
  it("a 100%-off code grants free, enforces max_redemptions, and honors client/package scope", async () => {
    const db = env.DB as D1Database;
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    for (const [k, v] of [["stripe.mode", "test"], ["stripe.secret_key", "sk_test_x"]] as const) {
      await db.prepare("INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v).run();
    }
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    await db.prepare("INSERT INTO tenant_settings (tenant_id, stripe_account_id, charges_enabled, updated_at) VALUES (?, 'acct_promo', 1, ?) ON CONFLICT(tenant_id) DO UPDATE SET stripe_account_id = 'acct_promo', charges_enabled = 1").bind(ctx.active.tenantId, new Date().toISOString()).run();
    const mk = async (name: string) => ((await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: name }) })).json()) as { client: { id: string } }).client.id;
    const buyer = await mk("PromoBuyer");
    const other = await mk("PromoOther");
    const pkgId = "pkg_promo_ot";
    await db.prepare("INSERT INTO packages (id, tenant_id, name, one_time_price_cents, budgets_json, currency, visibility, active, created_at) VALUES (?, ?, ?, ?, ?, 'usd', 'marketplace', 1, ?)")
      .bind(pkgId, ctx.active.tenantId, "Promo Pack", 5000, JSON.stringify([{ feature: "all", days: 30 }]), new Date().toISOString()).run();

    // A 100%-off code exclusive to `buyer` + this package, single use.
    expect((await SELF.fetch("http://x/api/promo-codes", { method: "POST", headers: H, body: JSON.stringify({ code: "FREE100", discountType: "percent", percentOff: 100, restrictedClientId: buyer, restrictedPackageId: pkgId, maxRedemptions: 1 }) })).status).toBe(201);

    // Fully discounted → granted directly, no Stripe charge.
    const r1 = await SELF.fetch("http://x/api/connect/pay-intent", { method: "POST", headers: H, body: JSON.stringify({ clientId: buyer, packageId: pkgId, promoCode: "FREE100" }) });
    expect(r1.status).toBe(200);
    expect((await r1.json() as { granted?: boolean }).granted).toBe(true);
    const subs = (await (await SELF.fetch(`http://x/api/subscriptions?clientId=${buyer}`, { headers: auth(ownerCookie) })).json()) as { subscriptions: { budgets: unknown[] }[] };
    expect(subs.subscriptions.some((s) => (s.budgets?.length ?? 0) > 0)).toBe(true);

    // The single use is now spent.
    const r2 = await SELF.fetch("http://x/api/connect/pay-intent", { method: "POST", headers: H, body: JSON.stringify({ clientId: buyer, packageId: pkgId, promoCode: "FREE100" }) });
    expect(r2.status).toBe(400);
    expect((await r2.json() as { error: string }).error).toBe("promo_exhausted");

    // A code locked to `buyer` is rejected for another client.
    await SELF.fetch("http://x/api/promo-codes", { method: "POST", headers: H, body: JSON.stringify({ code: "ONLYME", discountType: "percent", percentOff: 100, restrictedClientId: buyer }) });
    const r3 = await SELF.fetch("http://x/api/connect/pay-intent", { method: "POST", headers: H, body: JSON.stringify({ clientId: other, packageId: pkgId, promoCode: "ONLYME" }) });
    expect(r3.status).toBe(400);
    expect((await r3.json() as { error: string }).error).toBe("promo_wrong_client");

    // A discount that lands the charge below Stripe's minimum → clean 400, not a 500.
    await SELF.fetch("http://x/api/promo-codes", { method: "POST", headers: H, body: JSON.stringify({ code: "ALMOSTALL", discountType: "amount", amountOffCents: 4980 }) }); // 5000 → 20¢
    const r4 = await SELF.fetch("http://x/api/connect/pay-intent", { method: "POST", headers: H, body: JSON.stringify({ clientId: buyer, packageId: pkgId, promoCode: "ALMOSTALL" }) });
    expect(r4.status).toBe(400);
    expect((await r4.json() as { error: string }).error).toBe("promo_min_amount");
  });
});

describe("installments — limited-term subscription (per-cycle unlock)", () => {
  async function sig(payload: string, secret: string): Promise<string> {
    const t = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
    return `t=${t},v1=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  }
  it("each cycle unlocks 1/N of the term; the final payment completes and stops billing", async () => {
    const db = env.DB as D1Database;
    const secret = "whsec_connect_test";
    await db.prepare("INSERT INTO app_config (key, value) VALUES ('stripe.connect_webhook_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(secret).run();
    // Isolated synthetic tenant (no connected account) so completion doesn't call Stripe.
    const tenantId = "tenant_install_1";
    const pkgId = "pkg_install_1";
    await db.prepare("INSERT INTO packages (id, tenant_id, name, one_time_price_cents, installment_months, budgets_json, currency, visibility, active, created_at) VALUES (?, ?, ?, 9000, 3, ?, 'usd', 'marketplace', 1, ?)")
      .bind(pkgId, tenantId, "3-Month Plan", JSON.stringify([{ feature: "all", days: 90 }]), new Date().toISOString()).run();
    // Connect grants require event.account → tenant. Pin the mapping; the renewal/
    // completion path is pure DB (no Stripe call) so this stays offline.
    await db.prepare("INSERT INTO tenant_settings (tenant_id, stripe_account_id, updated_at) VALUES (?, 'acct_install_1', ?) ON CONFLICT(tenant_id) DO UPDATE SET stripe_account_id = 'acct_install_1'").bind(tenantId, new Date().toISOString()).run();
    const post = async (payload: string) => SELF.fetch("http://x/api/connect/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": await sig(payload, secret) }, body: payload });
    const subId = "sub_install_1";

    // Period one via installment-mode checkout (N=3).
    await post(JSON.stringify({ id: "evt_inst_create", account: "acct_install_1", type: "checkout.session.completed", data: { object: { id: "cs_inst_1", mode: "subscription", subscription: subId, metadata: { mossa_tenant: tenantId, mossa_client: "cl_install_1", mossa_package: pkgId, mossa_installments: "3" } } } }));
    let row = (await db.prepare("SELECT installments_total, installments_paid, payment_status, stripe_sub_id, budgets_json FROM client_subscriptions WHERE stripe_sub_id = ?").bind(subId).first<{ installments_total: number; installments_paid: number; payment_status: string; stripe_sub_id: string | null; budgets_json: string }>())!;
    expect([row.installments_total, row.installments_paid]).toEqual([3, 1]);
    const cycleBudgets = JSON.parse(row.budgets_json).length; // 'all' → workout+meal = 2 per cycle

    // Cycle two (still billing, so keyed by the Stripe sub id).
    await post(JSON.stringify({ id: "evt_inst_c2", account: "acct_install_1", type: "invoice.paid", data: { object: { subscription: subId, billing_reason: "subscription_cycle" } } }));
    row = (await db.prepare("SELECT installments_total, installments_paid, payment_status, stripe_sub_id, budgets_json FROM client_subscriptions WHERE stripe_sub_id = ?").bind(subId).first())!;
    expect(row.installments_paid).toBe(2);
    expect(JSON.parse(row.budgets_json).length).toBe(cycleBudgets * 2); // another period queued

    // Final cycle → completed, billing stopped (stripe_sub_id cleared).
    await post(JSON.stringify({ id: "evt_inst_c3", account: "acct_install_1", type: "invoice.paid", data: { object: { subscription: subId, billing_reason: "subscription_cycle" } } }));
    row = (await db.prepare("SELECT installments_paid, payment_status, stripe_sub_id, budgets_json FROM client_subscriptions WHERE package_id = ? LIMIT 1").bind(pkgId).first())!;
    expect(row.installments_paid).toBe(3);
    expect(row.payment_status).toBe("completed");
    expect(row.stripe_sub_id).toBeNull();
    expect(JSON.parse(row.budgets_json).length).toBe(cycleBudgets * 3); // full term unlocked across 3 cycles
  });
});

describe("notifications — surface-scoped mark-all-read", () => {
  it("coach mode clears staff/owner notifications but leaves client ones unread", async () => {
    const db = env.DB as D1Database;
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    const owner = (await db.prepare("SELECT userId FROM member WHERE organizationId = ? AND role = 'owner' LIMIT 1").bind(ctx.active.tenantId).first<{ userId: string }>())!;
    const mk = (id: string, type: string) => db.prepare("INSERT INTO notifications (id, tenant_id, recipient_user_id, type, title, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)").bind(id, ctx.active.tenantId, owner.userId, type, type, new Date().toISOString()).run();
    await mk("ntf_s1", "check_in"); // staff audience
    await mk("ntf_o1", "billing_past_due"); // owner audience
    await mk("ntf_c1", "feedback"); // client audience

    const r = await SELF.fetch("http://x/api/notifications/read-all", { method: "POST", headers: { "content-type": "application/json", ...auth(ownerCookie) }, body: JSON.stringify({ surface: "staff" }) });
    expect(r.status).toBe(200);
    const read = async (id: string) => (await db.prepare("SELECT read FROM notifications WHERE id = ?").bind(id).first<{ read: number }>())!.read;
    expect(await read("ntf_s1")).toBe(1); // staff → cleared
    expect(await read("ntf_o1")).toBe(1); // owner → cleared in coach mode
    expect(await read("ntf_c1")).toBe(0); // client → left unread (wrong surface)
  });
});

describe("email templates — tenant white-label store", () => {
  it("owner overrides a type's subject/body, GET merges it, reset restores the default", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    // A templatable type can be overridden.
    const put = await SELF.fetch("http://x/api/email-templates/feedback", { method: "PUT", headers: H, body: JSON.stringify({ subject: "{{coachName}} says hi", body: "<p>Custom body for {{studioName}}.</p>", enabled: true }) });
    expect(put.status).toBe(200);
    const list1 = (await (await SELF.fetch("http://x/api/email-templates", { headers: auth(ownerCookie) })).json()) as { templates: { type: string; subject: string; customized: boolean; defaultSubject: string }[] };
    const fb1 = list1.templates.find((t) => t.type === "feedback")!;
    expect(fb1.customized).toBe(true);
    expect(fb1.subject).toBe("{{coachName}} says hi");

    // A non-templatable type is rejected.
    expect((await SELF.fetch("http://x/api/email-templates/check_in", { method: "PUT", headers: H, body: JSON.stringify({ subject: "x", body: "y" }) })).status).toBe(400);

    // Reset drops the override → back to the registry default.
    expect((await SELF.fetch("http://x/api/email-templates/feedback", { method: "DELETE", headers: auth(ownerCookie) })).status).toBe(200);
    const list2 = (await (await SELF.fetch("http://x/api/email-templates", { headers: auth(ownerCookie) })).json()) as { templates: { type: string; subject: string; customized: boolean; defaultSubject: string }[] };
    const fb2 = list2.templates.find((t) => t.type === "feedback")!;
    expect(fb2.customized).toBe(false);
    expect(fb2.subject).toBe(fb2.defaultSubject);
  });
});

describe("platform promo codes (Mossa → tenant)", () => {
  it("admin creates a 100%-off pack promo; it grants free once, then is exhausted", async () => {
    const db = env.DB as D1Database;
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    for (const [k, v] of [["stripe.mode", "test"], ["stripe.secret_key", "sk_test_x"]] as const) {
      await db.prepare("INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v).run();
    }
    // Admin creates a single-use platform promo (ownerCookie is admin in tests).
    expect((await SELF.fetch("http://x/api/admin/promo-codes", { method: "POST", headers: H, body: JSON.stringify({ code: "PLAT100", discountType: "percent", percentOff: 100, maxRedemptions: 1 }) })).status).toBe(201);
    const listed = (await (await SELF.fetch("http://x/api/admin/promo-codes", { headers: auth(ownerCookie) })).json()) as { codes: { code: string }[] };
    expect(listed.codes.some((c) => c.code === "PLAT100")).toBe(true);

    const before = (await (await SELF.fetch("http://x/api/billing", { headers: auth(ownerCookie) })).json()) as { balance: { purchased: number } };
    // 100% off → free grant (no Stripe charge); purchased credits jump by the pack size.
    const r1 = await SELF.fetch("http://x/api/billing/pack-intent", { method: "POST", headers: H, body: JSON.stringify({ packId: "pack_1k", promoCode: "PLAT100" }) });
    expect(r1.status).toBe(200);
    expect((await r1.json() as { granted?: boolean }).granted).toBe(true);
    const after = (await (await SELF.fetch("http://x/api/billing", { headers: auth(ownerCookie) })).json()) as { balance: { purchased: number } };
    expect(after.balance.purchased - before.balance.purchased).toBe(1000);

    // The single slot is consumed — a repeat is rejected (no second free grant).
    const r2 = await SELF.fetch("http://x/api/billing/pack-intent", { method: "POST", headers: H, body: JSON.stringify({ packId: "pack_1k", promoCode: "PLAT100" }) });
    expect(r2.status).toBe(400);
    expect((await r2.json() as { error: string }).error).toBe("promo_exhausted");
  });
});

describe("package lifecycle + redemption scoping", () => {
  it("blocks self-checkout of private / other-client packages and scopes redemption codes", async () => {
    const db = env.DB as D1Database;
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    for (const [k, v] of [["stripe.mode", "test"], ["stripe.secret_key", "sk_test_x"]] as const) {
      await db.prepare("INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v).run();
    }
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    await db.prepare("INSERT INTO tenant_settings (tenant_id, stripe_account_id, charges_enabled, updated_at) VALUES (?, 'acct_life', 1, ?) ON CONFLICT(tenant_id) DO UPDATE SET stripe_account_id = 'acct_life', charges_enabled = 1").bind(ctx.active.tenantId, new Date().toISOString()).run();
    const mk = async (n: string) => ((await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: n }) })).json()) as { client: { id: string } }).client.id;
    const a = await mk("LifeA");
    const b = await mk("LifeB");
    const mkPkg = async (id: string, visibility: string, restricted: string | null) =>
      db.prepare("INSERT INTO packages (id, tenant_id, name, one_time_price_cents, budgets_json, currency, visibility, restricted_client_id, active, created_at) VALUES (?, ?, ?, 4000, ?, 'usd', ?, ?, 1, ?)")
        .bind(id, ctx.active.tenantId, id, JSON.stringify([{ feature: "all", days: 30 }]), visibility, restricted, new Date().toISOString()).run();

    // A `private` package is grant-only — not client-purchasable.
    await mkPkg("pkg_priv", "private", null);
    expect((await SELF.fetch("http://x/api/connect/pay-intent", { method: "POST", headers: H, body: JSON.stringify({ clientId: a, packageId: "pkg_priv" }) })).status).toBe(404);
    // A `client_specific` package is purchasable only by its own client.
    await mkPkg("pkg_cs", "client_specific", a);
    expect((await SELF.fetch("http://x/api/connect/pay-intent", { method: "POST", headers: H, body: JSON.stringify({ clientId: b, packageId: "pkg_cs" }) })).status).toBe(404);

    // Redemption code locked to client A: B is rejected, A succeeds.
    await SELF.fetch("http://x/api/redemption-codes", { method: "POST", headers: H, body: JSON.stringify({ code: "LOCKEDA", daysToAdd: 10, restrictedClientId: a }) });
    expect((await SELF.fetch("http://x/api/redeem", { method: "POST", headers: H, body: JSON.stringify({ clientId: b, code: "LOCKEDA" }) })).status).toBe(404);
    expect((await SELF.fetch("http://x/api/redeem", { method: "POST", headers: H, body: JSON.stringify({ clientId: a, code: "LOCKEDA" }) })).status).toBe(200);

    // Redemption code locked to a package the client doesn't hold → rejected.
    await SELF.fetch("http://x/api/redemption-codes", { method: "POST", headers: H, body: JSON.stringify({ code: "NEEDPKG", daysToAdd: 10, restrictedPackageId: "pkg_cs" }) });
    expect((await SELF.fetch("http://x/api/redeem", { method: "POST", headers: H, body: JSON.stringify({ clientId: b, code: "NEEDPKG" }) })).status).toBe(404);
  });
});

describe("redemption codes — atomic over-redemption guard", () => {
  it("a max_uses=1 code is spent once: a second client and a re-redeem both 409", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const mk = async (name: string) =>
      ((await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: name }) })).json()) as { client: { id: string } }).client.id;
    const a = await mk("RedeemA");
    const b = await mk("RedeemB");
    await SELF.fetch("http://x/api/redemption-codes", { method: "POST", headers: H, body: JSON.stringify({ code: "ONESHOT1", daysToAdd: 10, maxUses: 1 }) });
    // First client redeems it.
    expect((await SELF.fetch("http://x/api/redeem", { method: "POST", headers: H, body: JSON.stringify({ clientId: a, code: "ONESHOT1" }) })).status).toBe(200);
    // Second client can't — the single slot is spent.
    expect((await SELF.fetch("http://x/api/redeem", { method: "POST", headers: H, body: JSON.stringify({ clientId: b, code: "ONESHOT1" }) })).status).toBe(409);
    // The first client can't redeem twice either.
    expect((await SELF.fetch("http://x/api/redeem", { method: "POST", headers: H, body: JSON.stringify({ clientId: a, code: "ONESHOT1" }) })).status).toBe(409);
  });
});

describe("body scan (camera body-fat)", () => {
  it("recomputes an ensemble estimate server-side, stores it, mirrors to measurements, and lists it", async () => {
    const db = env.DB as D1Database;
    const clientId = ((await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: { "content-type": "application/json", ...auth(ownerCookie) }, body: JSON.stringify({ displayName: "ScanTest" }) })).json()) as { client: { id: string } }).client.id;
    // Body scan needs sex + birth date + height to run the formulas.
    await db.prepare("UPDATE clients SET gender='male', date_of_birth='1990-01-01', height_cm=180 WHERE id=?").bind(clientId).run();
    const res = await SELF.fetch("http://x/api/body-scans", { method: "POST", headers: { "content-type": "application/json", ...auth(ownerCookie) }, body: JSON.stringify({ clientId, date: "2026-02-01", weightKg: 80, circumferences: { neckCm: 38, waistCm: 85 }, storeSilhouette: false, posture: { cvaDeg: 46, trunkTiltDeg: 4, severity: "moderate" } }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { bodyFatPercent: number; low: number; high: number; confidence: string; methods: unknown[] };
    expect(body.bodyFatPercent).toBeGreaterThan(5);
    expect(body.bodyFatPercent).toBeLessThan(40);
    expect(body.low).toBeLessThan(body.bodyFatPercent);
    expect(body.high).toBeGreaterThan(body.bodyFatPercent);
    expect(body.methods.length).toBeGreaterThanOrEqual(2); // navy + rfm + deurenberg
    // Listed for the progress morph.
    const list = (await (await SELF.fetch(`http://x/api/body-scans?clientId=${clientId}`, { headers: auth(ownerCookie) })).json()) as { scans: { date: string; bodyFatPercent: number; somatotype: string | null; posture: { cvaDeg: number; severity: string } | null }[] };
    expect(list.scans.length).toBe(1);
    expect(list.scans[0]!.date).toBe("2026-02-01");
    // Posture is stored as sent; somatotype is recomputed server-side.
    expect(list.scans[0]!.posture).toEqual({ cvaDeg: 46, trunkTiltDeg: 4, severity: "moderate" });
    expect(list.scans[0]!.somatotype).toMatch(/morph/);
    // Mirrored into measurements — body-fat AND the circumferences, so the Body
    // progress "latest measurements" aren't empty after a scan.
    const meas = await db.prepare("SELECT body_fat_percent, weight_kg, neck_cm, waist_cm FROM measurements WHERE client_id=? AND date_local='2026-02-01'").bind(clientId).first<{ body_fat_percent: number; weight_kg: number; neck_cm: number; waist_cm: number }>();
    expect(meas?.body_fat_percent).toBeCloseTo(body.bodyFatPercent, 1);
    expect(meas?.neck_cm).toBe(38);
    expect(meas?.waist_cm).toBe(85);
    // Surfaced as the Body tab's latest waist reading.
    const prog = (await (await SELF.fetch(`http://x/api/progress/${clientId}?range=90d&today=2026-02-05`, { headers: auth(ownerCookie) })).json()) as { body: { latest: { waistCm: number | null; neckCm: number | null } } };
    expect(prog.body.latest.waistCm).toBe(85);
    expect(prog.body.latest.neckCm).toBe(38);
  });

  it("owner generates the voice pack (billed); cues serve-only so a client scan never auto-bills", async () => {
    // Before generation cues are unvoiced (empty urls) — a client scan can't bill
    // the owner; the client speaks them with the browser's free speechSynthesis.
    const before = (await (await SELF.fetch("http://x/api/body-scan/cues", { headers: auth(ownerCookie) })).json()) as { cues: { url: string; text: string }[] };
    expect(before.cues.length).toBeGreaterThan(5);
    expect(before.cues.every((q) => q.url === "")).toBe(true);
    expect(before.cues[0]!.text.length).toBeGreaterThan(0);
    // The owner explicitly generates the pack — the clear, billed moment.
    const pack = (await (await SELF.fetch("http://x/api/body-scan/voice-pack", { method: "POST", headers: { "content-type": "application/json", ...auth(ownerCookie) }, body: "{}" })).json()) as { ok: boolean; generated: number; credits: number; ready: boolean };
    expect(pack.generated).toBeGreaterThan(5);
    expect(pack.credits).toBeGreaterThan(0);
    expect(pack.ready).toBe(true);
    // Now cues serve the cached urls, and the status endpoint agrees.
    const after = (await (await SELF.fetch("http://x/api/body-scan/cues", { headers: auth(ownerCookie) })).json()) as { cues: { url: string }[] };
    expect(after.cues[0]!.url).toContain("/api/media/");
    const status = (await (await SELF.fetch("http://x/api/body-scan/voice-pack", { headers: auth(ownerCookie) })).json()) as { ready: boolean; count: number; total: number };
    expect(status.ready).toBe(true);
    expect(status.count).toBe(status.total);
  });

  it("requires the bfCamera entitlement (free tenant → 403)", async () => {
    const clientId = ((await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: { "content-type": "application/json", ...auth(otherCookie) }, body: JSON.stringify({ displayName: "NoScan" }) })).json()) as { client: { id: string } }).client.id;
    const res = await SELF.fetch("http://x/api/body-scans", { method: "POST", headers: { "content-type": "application/json", ...auth(otherCookie) }, body: JSON.stringify({ clientId, date: "2026-02-01", weightKg: 80, circumferences: { neckCm: 38, waistCm: 85 }, storeSilhouette: false }) });
    expect(res.status).toBe(403);
  });
});

describe("coach voice (TTS) picker", () => {
  it("owner sets a voice, it persists + lists, drives the cue voice, and rejects unknowns", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    expect((await SELF.fetch("http://x/api/settings/ai", { method: "PATCH", headers: H, body: JSON.stringify({ ttsVoice: "Puck" }) })).status).toBe(200);
    const ai = (await (await SELF.fetch("http://x/api/settings/ai", { headers: auth(ownerCookie) })).json()) as { voices: { id: string; style: string }[]; config: { ttsVoice?: string } };
    expect(ai.voices.length).toBeGreaterThan(3);
    expect(ai.config.ttsVoice).toBe("Puck");
    // The cue set is now voiced with the tenant's choice (client sends no voice).
    const cues = (await (await SELF.fetch("http://x/api/body-scan/cues", { headers: auth(ownerCookie) })).json()) as { voice: string };
    expect(cues.voice).toBe("Puck");
    // Unknown voices are rejected by the schema.
    expect((await SELF.fetch("http://x/api/settings/ai", { method: "PATCH", headers: H, body: JSON.stringify({ ttsVoice: "NotARealVoice" }) })).status).toBe(400);
  });
});

describe("email digest — data-viz primitives + rich builders (pure render)", () => {
  const brand = MOSSA_BRAND;

  it("primitives render their chart markup and escape user input", () => {
    // Bars carry the value in text (Gmail-safe) and clamp the fill width.
    expect(emailBar("Training", "9/7", 2)).toContain("width:100%"); // pct > 1 clamps to 100%
    expect(emailBar("Training", "0/7", -1)).toContain("width:0%");
    // Weekly histogram renders one labelled column per point.
    const bars = emailBars([{ label: "Mon", value: 3 }, { label: "Tue", value: 0 }]);
    expect(bars).toContain("Mon");
    expect(bars).toContain("Tue");
    // Sparkline is an inline SVG path; needs ≥2 points.
    expect(emailSparkline([1, 2, 3])).toContain("<svg");
    expect(emailSparkline([1])).toBe("");
    // Ring centers its number.
    expect(emailRing(0.8, "82")).toContain(">82<");
    // Stat row + list row escape attacker-influenced strings.
    expect(emailStatRow([{ value: "5", label: "<script>x</script>" }])).toContain("&lt;script&gt;");
    expect(emailListRow("<b>Ann</b>", "3 logs")).toContain("&lt;b&gt;Ann&lt;/b&gt;");
    expect(emailListRow("<b>Ann</b>", "3 logs")).not.toContain("<b>Ann</b>");
  });

  it("client digest composes ring + stats + charts and escapes the name", () => {
    const html = clientDigestHtml(brand, {
      name: "Sam",
      intro: "Nice work this week, Sam.",
      stats: [{ value: "4", label: "Workout days" }, { value: "5", label: "Day streak" }],
      dayBars: [{ label: "Mon", value: 3 }, { label: "Tue", value: 1 }, { label: "Wed", value: 0 }],
      weightSeries: [80, 79.4, 78.8, 78.2],
      weightCaption: "Down 1.8 kg over 4 readings — now 78.2 kg.",
      wellness: 4.2,
      adherence: [{ label: "Training days", value: "4/7", pct: 4 / 7, tone: "good" }],
      labs: 1,
    }, "https://app.example.com");
    expect(html).toContain("<svg"); // ring + sparkline
    expect(html).toContain(">4.2<"); // wellness ring center
    expect(html).toContain("Workout days");
    expect(html).toContain("Weight trend");
    expect(html).toContain("lab test"); // labs nudge
    expect(html).toContain("Weekly recap"); // eyebrow
  });

  it("coach digest composes trend + engagement + attention breakdown", () => {
    const html = coachDigestHtml(brand, {
      heading: "Your studio this week",
      intro: "Here's how you did.",
      stats: [{ value: "12", label: "Active clients" }],
      activeTrend: [3, 5, 4, 6, 5, 7, 6, 8, 7, 6, 9, 8, 7, 10],
      avgActive: 6,
      engagement: { checkInRate: 60, workoutRate: 40 },
      topClients: [{ name: "Ann", logs: 12 }, { name: "Ben", logs: 9 }],
      attention: [{ label: "Stale goals", count: 2 }, { label: "Gone quiet", count: 3 }],
      attentionTotal: 5,
      mostImproved: { name: "Cara", delta: -2.1 },
      ctaHref: "https://app.example.com",
      ctaLabel: "Open the attention queue",
      footer: "5 clients need attention.",
    });
    expect(html).toContain("<svg"); // active-clients sparkline
    expect(html).toContain("60%"); // engagement bar value
    expect(html).toContain("Stale goals");
    expect(html).toContain("Needs attention · 5");
    expect(html).toContain("Most improved");
    expect(html).toContain("Open the attention queue");
  });
});

describe("storage accounting + quota gate", () => {
  const B = "http://localhost:8787";
  it("records uploads in the ledger, meters usage, and blocks over quota", async () => {
    const db = env.DB as D1Database;
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    const tenantId = ctx.active.tenantId;

    const usage0 = (await (await SELF.fetch(`${B}/api/storage-usage`, { headers: auth(ownerCookie) })).json()) as { usedBytes: number; limitBytes: number };
    expect(usage0.limitBytes).toBeGreaterThan(0);

    // Upload a 2 KB PNG → 201 + a ledger row with the REAL byte size.
    const mkForm = () => { const f = new FormData(); f.set("file", new Blob([new Uint8Array(2048)], { type: "image/png" }), "x.png"); f.set("purpose", "avatar"); return f; };
    const up = await SELF.fetch(`${B}/api/media/upload`, { method: "POST", headers: auth(ownerCookie), body: mkForm() });
    expect(up.status).toBe(201);
    const { key } = (await up.json()) as { key: string };
    const row = (await db.prepare("SELECT size_bytes, purpose, tenant_id, deleted_at FROM media_assets WHERE r2_key = ?").bind(key).first<{ size_bytes: number; purpose: string; tenant_id: string; deleted_at: string | null }>())!;
    expect(row.size_bytes).toBe(2048);
    expect(row.purpose).toBe("avatar");
    expect(row.tenant_id).toBe(tenantId);
    expect(row.deleted_at).toBeNull();

    const usage1 = (await (await SELF.fetch(`${B}/api/storage-usage`, { headers: auth(ownerCookie) })).json()) as { usedBytes: number };
    expect(usage1.usedBytes).toBeGreaterThanOrEqual(usage0.usedBytes + 2048);

    // Fill the ledger to the plan ceiling with a synthetic row → next upload 413s.
    await db.prepare("INSERT INTO media_assets (id, tenant_id, r2_key, purpose, content_type, size_bytes, created_at) VALUES ('mda_test_fill', ?, 't/fill/big.bin', 'misc', 'application/octet-stream', ?, ?)")
      .bind(tenantId, usage0.limitBytes, new Date().toISOString()).run();
    const over = await SELF.fetch(`${B}/api/media/upload`, { method: "POST", headers: auth(ownerCookie), body: mkForm() });
    expect(over.status).toBe(413);
    expect(((await over.json()) as { error: string }).error).toBe("storage_full");

    // Deleting the fill row (tombstone) frees room again — usage drops, upload works.
    await db.prepare("UPDATE media_assets SET deleted_at = ? WHERE id = 'mda_test_fill'").bind(new Date().toISOString()).run();
    const ok = await SELF.fetch(`${B}/api/media/upload`, { method: "POST", headers: auth(ownerCookie), body: mkForm() });
    expect(ok.status).toBe(201);
  });
});

describe("media library — role-scoped list + delete", () => {
  const B = "http://localhost:8787";
  it("owner lists media, deletes it, and the delete tombstones + scrubs the reference", async () => {
    const db = env.DB as D1Database;
    const H = { "content-type": "application/json", ...auth(ownerCookie) };

    // Upload an avatar image and point a client's avatar_url at it.
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(1500)], { type: "image/png" }), "a.png");
    form.set("purpose", "avatar");
    const up = await SELF.fetch(`${B}/api/media/upload`, { method: "POST", headers: auth(ownerCookie), body: form });
    const { key } = (await up.json()) as { key: string };
    const { client } = (await (await SELF.fetch(`${B}/api/clients`, { method: "POST", headers: H, body: JSON.stringify({ displayName: "MediaMia" }) })).json()) as { client: { id: string } };
    await db.prepare("UPDATE clients SET avatar_url = ? WHERE id = ?").bind(`/api/media/${key}`, client.id).run();

    // Owner sees it, can manage + delete.
    const lib = (await (await SELF.fetch(`${B}/api/media-library`, { headers: auth(ownerCookie) })).json()) as { items: { id: string; url: string; canDelete: boolean }[]; canManage: boolean };
    expect(lib.canManage).toBe(true);
    const found = lib.items.find((i) => i.url === `/api/media/${key}`)!;
    expect(found).toBeTruthy();
    expect(found.canDelete).toBe(true);

    // Delete → 200, ledger tombstoned, reference scrubbed, gone from the list.
    const del = await SELF.fetch(`${B}/api/media-library/${found.id}`, { method: "DELETE", headers: auth(ownerCookie) });
    expect(del.status).toBe(200);
    const row = (await db.prepare("SELECT deleted_at, deleted_by FROM media_assets WHERE id = ?").bind(found.id).first<{ deleted_at: string | null; deleted_by: string | null }>())!;
    expect(row.deleted_at).toBeTruthy();
    expect(row.deleted_by).toBeTruthy();
    const cl = (await db.prepare("SELECT avatar_url FROM clients WHERE id = ?").bind(client.id).first<{ avatar_url: string | null }>())!;
    expect(cl.avatar_url).toBeNull();
    const lib2 = (await (await SELF.fetch(`${B}/api/media-library`, { headers: auth(ownerCookie) })).json()) as { items: { id: string }[] };
    expect(lib2.items.find((i) => i.id === found.id)).toBeFalsy();
  });
});

describe("GDPR — action OTP + cascade purge", () => {
  const B = "http://localhost:8787";
  const sha256Hex = async (s: string): Promise<string> => {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  it("action OTP verifies once, then is consumed; wrong codes are rejected", async () => {
    const db = env.DB as D1Database;
    await db.prepare("INSERT OR REPLACE INTO action_otps (subject, purpose, code_hash, expires_at, attempts, created_at) VALUES ('u_otptest', 'account_delete', ?, ?, 0, ?)")
      .bind(await sha256Hex("account_delete:123456"), Date.now() + 600_000, Date.now()).run();
    expect(await verifyActionOtp(env as unknown as import("../src/env.js").Env, { subject: "u_otptest", purpose: "account_delete", code: "999999" })).toBe(false);
    expect(await verifyActionOtp(env as unknown as import("../src/env.js").Env, { subject: "u_otptest", purpose: "account_delete", code: "123456" })).toBe(true);
    // Consumed — a replay fails.
    expect(await verifyActionOtp(env as unknown as import("../src/env.js").Env, { subject: "u_otptest", purpose: "account_delete", code: "123456" })).toBe(false);
  });

  it("purgeClient removes the client's rows, R2 objects, and ledger entries", async () => {
    const db = env.DB as D1Database;
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    const tenantId = ctx.active.tenantId;
    const { client } = (await (await SELF.fetch(`${B}/api/clients`, { method: "POST", headers: H, body: JSON.stringify({ displayName: "PurgePat" }) })).json()) as { client: { id: string } };

    // A client-scoped upload (R2 object + ledger row) + some tracked data.
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(1000)], { type: "image/png" }), "p.png");
    form.set("purpose", "progress");
    form.set("clientId", client.id);
    const { key } = (await (await SELF.fetch(`${B}/api/media/upload`, { method: "POST", headers: auth(ownerCookie), body: form })).json()) as { key: string };
    await SELF.fetch(`${B}/api/check-ins`, { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-06-10", mood: 4 } }) });
    await SELF.fetch(`${B}/api/measurements`, { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id, data: { date: "2026-06-10", weightKg: 70 } }) });
    // Sanity — the object + rows exist. Drain the R2 body (isolated-storage hygiene).
    const before = await env.MEDIA.get(key);
    expect(before).not.toBeNull();
    await before!.arrayBuffer();
    expect((await db.prepare("SELECT COUNT(*) AS n FROM check_ins WHERE client_id = ?").bind(client.id).first<{ n: number }>())!.n).toBe(1);

    await purgeClient(env as unknown as import("../src/env.js").Env, tenantId, client.id);

    expect(await db.prepare("SELECT id FROM clients WHERE id = ?").bind(client.id).first()).toBeNull();
    expect((await db.prepare("SELECT COUNT(*) AS n FROM check_ins WHERE client_id = ?").bind(client.id).first<{ n: number }>())!.n).toBe(0);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM measurements WHERE client_id = ?").bind(client.id).first<{ n: number }>())!.n).toBe(0);
    // R2 object gone + ledger tombstoned.
    expect(await env.MEDIA.get(key)).toBeNull();
    expect((await db.prepare("SELECT COUNT(*) AS n FROM media_assets WHERE client_id = ? AND deleted_at IS NULL").bind(client.id).first<{ n: number }>())!.n).toBe(0);
  });
});

describe("studio close + tenant purge", () => {
  const B = "http://localhost:8787";
  const sha = async (s: string): Promise<string> => {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  it("owner schedules a close (OTP), can undo it, and purgeTenant tears the studio down", async () => {
    const db = env.DB as D1Database;
    // A throwaway studio so the shared test tenants are never touched.
    const cookie = await signInFlow("teardown@test.dev", "TeardownGym");
    const H = { "content-type": "application/json", ...auth(cookie) };
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(cookie) })).json()) as { active: { tenantId: string } };
    const tenantId = ctx.active.tenantId;
    const { client } = (await (await SELF.fetch(`${B}/api/clients`, { method: "POST", headers: H, body: JSON.stringify({ displayName: "DoomedDan" }) })).json()) as { client: { id: string } };

    // Schedule the close with a known OTP → status 'closing' + delete_at ~7d out.
    await db.prepare("INSERT OR REPLACE INTO action_otps (subject, purpose, code_hash, expires_at, attempts, created_at) VALUES (?, 'tenant_close', ?, ?, 0, ?)")
      .bind(`tenant_close:${tenantId}`, await sha("tenant_close:654321"), Date.now() + 600_000, Date.now()).run();
    const close = await SELF.fetch(`${B}/api/tenant/close`, { method: "POST", headers: H, body: JSON.stringify({ code: "654321" }) });
    expect(close.status).toBe(200);
    const st1 = (await (await SELF.fetch(`${B}/api/tenant/close/status`, { headers: auth(cookie) })).json()) as { closing: boolean; deleteAt: string | null };
    expect(st1.closing).toBe(true);
    expect(st1.deleteAt).toBeTruthy();

    // Undo within the grace window → back to active.
    await SELF.fetch(`${B}/api/tenant/close/cancel`, { method: "POST", headers: H, body: "{}" });
    const st2 = (await (await SELF.fetch(`${B}/api/tenant/close/status`, { headers: auth(cookie) })).json()) as { closing: boolean };
    expect(st2.closing).toBe(false);

    // The actual teardown (what the cron runs at delete_at).
    expect(await db.prepare("SELECT id FROM organization WHERE id = ?").bind(tenantId).first()).not.toBeNull();
    await purgeTenant(env as unknown as import("../src/env.js").Env, tenantId);
    expect(await db.prepare("SELECT id FROM organization WHERE id = ?").bind(tenantId).first()).toBeNull();
    expect((await db.prepare("SELECT COUNT(*) AS n FROM member WHERE organizationId = ?").bind(tenantId).first<{ n: number }>())!.n).toBe(0);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM clients WHERE tenant_id = ?").bind(tenantId).first<{ n: number }>())!.n).toBe(0);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<{ n: number }>())!.n).toBe(0);
    void client;
    // The owner belonged only to this studio → their identity is erased too.
    expect(await db.prepare('SELECT id FROM "user" WHERE email = ?').bind("teardown@test.dev").first()).toBeNull();
  });
});

describe("platform nuclear reset — guards", () => {
  const B = "http://localhost:8787";
  it("refuses without the exact confirm phrase, and without a valid OTP", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    // Wrong phrase → 400 BEFORE anything is touched (the confirm gate is first).
    const badPhrase = await SELF.fetch(`${B}/api/admin/nuclear-reset`, { method: "POST", headers: H, body: JSON.stringify({ code: "000000", confirm: "nope" }) });
    expect(badPhrase.status).toBe(400);
    expect(((await badPhrase.json()) as { error: string }).error).toBe("confirm_phrase");
    // Right phrase but no valid OTP → 403 (still no wipe).
    const noOtp = await SELF.fetch(`${B}/api/admin/nuclear-reset`, { method: "POST", headers: H, body: JSON.stringify({ code: "000000", confirm: "RESET EVERYTHING" }) });
    expect(noOtp.status).toBe(403);
    expect(((await noOtp.json()) as { error: string }).error).toBe("invalid_code");
    // The shared tenant is still intact (nothing was wiped).
    const ctx = await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) });
    expect(ctx.status).toBe(200);
  });
});
