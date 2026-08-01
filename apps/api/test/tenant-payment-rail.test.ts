/**
 * THE TENANT PAYMENT RAIL, END TO END.
 *
 * Stripe Connect is gone. A studio is paid on its own merchant account by its
 * own provider, and the platform's entire remaining job is: open a purchase,
 * learn whether it was paid, grant the access. This suite drives that through
 * the real worker.
 *
 * What it pins, and why each one is worth a test rather than a comment:
 *
 *   THE DEFAULT WORKS       A studio that has configured NOTHING can still sell.
 *                           `manual` is the default provider, so a purchase
 *                           opens, waits, and the coach confirms it. If this
 *                           broke, every studio on the platform would be unable
 *                           to sell until they finished a setup they were never
 *                           told was mandatory.
 *
 *   THE WEBHOOK IS A DOOR   `/api/pay/webhook/:tenantId` is public and
 *                           unauthenticated by construction. Everything rests on
 *                           the signature check, so an unconfigured tenant and a
 *                           forged body must BOTH be refused — a studio that
 *                           half-finished setup must not be an open door.
 *
 *   SELLING RULES BIND      Grant-only and other-client packages are refused
 *                           before the customer is sent to pay, not after they
 *                           have paid on a provider we cannot refund from.
 *
 *   NO CREDENTIALS STORED   The settings route refuses a config key that names
 *                           something able to act on the studio's account. This
 *                           is the security argument for the whole design, and
 *                           it is asserted at the HTTP boundary, not just in the
 *                           package's unit tests.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";
import { seedBilling } from "../src/billing-store.js";

const ORIGIN = "http://setup.localhost:8787";
const db = () => env.DB as D1Database;

function grabCookies(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  return (h.getSetCookie?.() ?? []).map((c: string) => c.split(";")[0]).join("; ");
}

async function signIn(email: string, studio: string): Promise<string> {
  await SELF.fetch(`${ORIGIN}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const row = await db()
    .prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1")
    .bind(`%otp%${email}%`)
    .first<{ value: string }>();
  const otp = ((row?.value ?? "").match(/\d{6}/) ?? [])[0];
  if (!otp) throw new Error(`no OTP for ${email}`);
  const verify = await SELF.fetch(`${ORIGIN}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, otp }),
  });
  let cookie = grabCookies(verify);
  const org = await SELF.fetch(`${ORIGIN}/api/auth/organization/create`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, Cookie: cookie },
    body: JSON.stringify({ name: studio, slug: studio.toLowerCase().replace(/[^a-z0-9]+/g, "-") }),
  });
  const refreshed = grabCookies(org);
  if (refreshed) cookie = refreshed;
  return cookie;
}

const auth = (c: string) => ({ Cookie: c, origin: ORIGIN });
const H = (c: string) => ({ "content-type": "application/json", ...auth(c) });

const SECRET = "whsec_tenant_rail_suite";
let owner = "";
let tenantId = "";
let clientId = "";

/** Sign a body exactly as Stripe does, so the webhook is driven with real input. */
async function sign(body: string, secret = SECRET): Promise<Record<string, string>> {
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  const v1 = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { "content-type": "application/json", "stripe-signature": `t=${t},v1=${v1}` };
}

beforeAll(async () => {
  await ensureSchema(db());
  await seedBilling(db());
  owner = await signIn("payrail-owner@test.dev", "Pay Rail Studio");
  const ctx = (await (await SELF.fetch(`${ORIGIN}/api/context`, { headers: auth(owner) })).json()) as { active: { tenantId: string } };
  tenantId = ctx.active.tenantId;
  // A plan carrying `commerce`; comped so no Stripe is needed to reach it.
  await SELF.fetch(`${ORIGIN}/api/admin/tenants/${tenantId}/plan`, {
    method: "POST",
    headers: H(owner),
    body: JSON.stringify({ planId: "light", comp: true }),
  });
  const cl = await SELF.fetch(`${ORIGIN}/api/clients`, { method: "POST", headers: H(owner), body: JSON.stringify({ displayName: "Buyer" }) });
  const clBody = await cl.text();
  clientId = (JSON.parse(clBody) as { client?: { id: string } }).client?.id ?? "";
  // Assert the fixture, not just the feature: without a client id every
  // purchase below fails zod validation and the whole suite reports "invalid
  // body" rather than anything about payments.
  if (!clientId) throw new Error(`fixture: no client created — ${cl.status} ${clBody}`);
});

/** A sellable package, written straight to D1 so each test owns its own. */
async function mkPackage(id: string, extra: Partial<{ visibility: string; restricted: string | null; once: number; monthly: number }> = {}) {
  await db()
    .prepare(
      "INSERT INTO packages (id, tenant_id, name, one_time_price_cents, monthly_price_cents, budgets_json, currency, visibility, restricted_subject_id, once_per_customer, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 'usd', ?, ?, ?, 1, ?)",
    )
    .bind(
      id, tenantId, id, extra.monthly ? null : 5000, extra.monthly ?? null,
      JSON.stringify([{ feature: "all", days: 30 }]),
      extra.visibility ?? "marketplace", extra.restricted ?? null, extra.once ?? 0, new Date().toISOString(),
    )
    .run();
}

describe("a studio that configured nothing can still sell", () => {
  it("opens a purchase with no checkout URL, and the coach confirms it into access", async () => {
    await mkPackage("pkg_manual");
    const open = await SELF.fetch(`${ORIGIN}/api/purchases`, {
      method: "POST",
      headers: H(owner),
      body: JSON.stringify({ clientId, packageId: "pkg_manual" }),
    });
    expect(open.status).toBe(201);
    const intent = (await open.json()) as { id: string; checkoutUrl: string | null; provider: string };
    // `manual` is the default, and it has nowhere to send anyone. A null URL is
    // the correct answer, not a failure.
    expect(intent.provider).toBe("manual");
    expect(intent.checkoutUrl).toBeNull();

    // It is visible to the coach while it waits — the whole point of writing the
    // pending row up front.
    const list = (await (await SELF.fetch(`${ORIGIN}/api/purchases?status=pending`, { headers: auth(owner) })).json()) as { purchases: { id: string }[] };
    expect(list.purchases.map((p) => p.id)).toContain(intent.id);

    const ok = await SELF.fetch(`${ORIGIN}/api/purchases/${intent.id}/confirm`, { method: "POST", headers: H(owner), body: "{}" });
    expect(ok.status).toBe(200);

    // Access actually landed — the assertion that makes the rest mean anything.
    const subs = (await (await SELF.fetch(`${ORIGIN}/api/subscriptions?clientId=${clientId}`, { headers: auth(owner) })).json()) as { subscriptions?: { daysRemaining: number }[] };
    expect((subs.subscriptions ?? []).some((s) => s.daysRemaining > 0)).toBe(true);
  });

  it("refuses to confirm the same purchase twice", async () => {
    // Terminal-once. Without it a double-tap on a slow connection grants the
    // package twice and the client gets 60 days for one payment.
    await mkPackage("pkg_twice");
    const open = await SELF.fetch(`${ORIGIN}/api/purchases`, { method: "POST", headers: H(owner), body: JSON.stringify({ clientId, packageId: "pkg_twice" }) });
    const { id } = (await open.json()) as { id: string };
    expect((await SELF.fetch(`${ORIGIN}/api/purchases/${id}/confirm`, { method: "POST", headers: H(owner), body: "{}" })).status).toBe(200);
    expect((await SELF.fetch(`${ORIGIN}/api/purchases/${id}/confirm`, { method: "POST", headers: H(owner), body: "{}" })).status).toBe(409);
  });
});

describe("the selling rules bind before anyone is sent to pay", () => {
  it("refuses a grant-only package", async () => {
    await mkPackage("pkg_private", { visibility: "private" });
    const r = await SELF.fetch(`${ORIGIN}/api/purchases`, { method: "POST", headers: H(owner), body: JSON.stringify({ clientId, packageId: "pkg_private" }) });
    expect(r.status).toBe(404);
  });

  it("refuses a recurring package on a provider that cannot renew", async () => {
    // Selling it would take one payment and then silently never renew, which
    // reads to the client as being cut off and to the studio as a lost sale.
    await mkPackage("pkg_monthly", { monthly: 3000 });
    const r = await SELF.fetch(`${ORIGIN}/api/purchases`, { method: "POST", headers: H(owner), body: JSON.stringify({ clientId, packageId: "pkg_monthly" }) });
    expect(r.status).toBe(409);
  });
});

describe("the webhook door", () => {
  it("refuses a tenant that has configured no verifiable provider", async () => {
    // The URL is effectively public. A half-configured studio answering "fine"
    // would let anyone who learns it grant themselves packages.
    const res = await SELF.fetch(`${ORIGIN}/api/pay/webhook/${tenantId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "checkout.session.completed", data: { object: {} } }),
    });
    expect(res.status).toBe(400);
  });

  it("grants on a correctly signed payment, and ignores a redelivery", async () => {
    await db()
      .prepare("INSERT INTO tenant_payment_settings (tenant_id, provider, config_json, updated_at) VALUES (?, 'stripe_link', ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET provider = excluded.provider, config_json = excluded.config_json")
      .bind(tenantId, JSON.stringify({ webhook_secret: SECRET, payment_link: "https://buy.stripe.com/x" }), new Date().toISOString())
      .run();
    await mkPackage("pkg_hook");
    const open = await SELF.fetch(`${ORIGIN}/api/purchases`, { method: "POST", headers: H(owner), body: JSON.stringify({ clientId, packageId: "pkg_hook" }) });
    const intent = (await open.json()) as { id: string; checkoutUrl: string | null };
    // Now there IS somewhere to send them, and our reference rides along.
    expect(intent.checkoutUrl).toContain(`client_reference_id=${intent.id}`);

    const body = JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { id: "cs_rail_1", client_reference_id: intent.id, amount_total: 5000, currency: "usd" } },
    });
    expect((await SELF.fetch(`${ORIGIN}/api/pay/webhook/${tenantId}`, { method: "POST", headers: await sign(body), body })).status).toBe(200);

    const settled = await db().prepare("SELECT status, external_id FROM purchase_intents WHERE id = ?").bind(intent.id).first<{ status: string; external_id: string }>();
    expect(settled).toMatchObject({ status: "paid", external_id: "cs_rail_1" });

    // A redelivery is answered 200 and changes nothing. Erroring would make the
    // provider retry forever and eventually disable the endpoint.
    const again = JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { id: "cs_rail_1", client_reference_id: intent.id, amount_total: 5000, currency: "usd" } },
    });
    expect((await SELF.fetch(`${ORIGIN}/api/pay/webhook/${tenantId}`, { method: "POST", headers: await sign(again), body: again })).status).toBe(200);
  });

  it("refuses a forged body that keeps a valid signature header", async () => {
    await db()
      .prepare("INSERT INTO tenant_payment_settings (tenant_id, provider, config_json, updated_at) VALUES (?, 'stripe_link', ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET provider = excluded.provider, config_json = excluded.config_json")
      .bind(tenantId, JSON.stringify({ webhook_secret: SECRET }), new Date().toISOString())
      .run();
    const headers = await sign(JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_x" } } }));
    // The attacker's goal: keep the signature, change who gets the package.
    const tampered = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_evil", client_reference_id: "pi_someone_else", amount_total: 1 } } });
    const res = await SELF.fetch(`${ORIGIN}/api/pay/webhook/${tenantId}`, { method: "POST", headers, body: tampered });
    expect(res.status).toBe(400);
  });
});

describe("the platform stores credentials that verify, never credentials that act", () => {
  it("refuses a secret key at the HTTP boundary", async () => {
    // The security argument for this whole design, asserted where a real request
    // would arrive rather than only in the package's unit tests.
    const res = await SELF.fetch(`${ORIGIN}/api/payments/settings`, {
      method: "PATCH",
      headers: H(owner),
      body: JSON.stringify({ provider: "stripe_link", config: { secret_key: "sk_live_hello" } }),
    });
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toMatch(/VERIFY, never/);
  });

  it("never sends a stored secret back to the browser", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/payments/settings`, { headers: auth(owner) });
    const text = await res.text();
    // A stolen cookie must not yield the value that lets someone forge paid
    // events for this studio.
    expect(text).not.toContain(SECRET);
  });
});
