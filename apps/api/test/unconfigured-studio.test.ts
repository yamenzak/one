/**
 * A STUDIO THAT NEVER CHOSE A PLAN.
 *
 * Reached constantly and by accident: an owner abandons the wizard, is declined
 * at the first attempt, or reloads mid-checkout. Before this, `getSubscription`
 * stamped them `plan_id = 'free', status = 'active'` and the host gate served the
 * whole app — a fully-writable free product on the free row's ceilings, forever,
 * with nothing but a soft notice on the billing screen. The free row also carried
 * MORE clients than the cheapest paid tier, so not paying was the better deal.
 *
 * Now `statusOf` reports `incomplete` for any tenant with no paid plan, and
 * `resolveHostGate` turns that into read-only with `reason: "setup"`.
 *
 * ── The two halves that both have to hold ───────────────────────────────────
 *
 * The gate is only half-right if it is merely closed. It has to be closed AND
 * escapable, because the population inside it is people who were interrupted
 * once already:
 *
 *   CLOSED     no client, no plan, no log can be created.
 *   ESCAPABLE  the wizard's three writes — `/api/auth/*` (create the studio),
 *              `/api/me/*` (record the plan choice) and `/api/billing/*` (pay) —
 *              all still work. If any of them regressed, a signup could not be
 *              completed at all, and the failure would look like a payment bug
 *              rather than a gate bug.
 *
 * Reads are never gated at any rung, so those are asserted too.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";
import { seedBilling } from "../src/billing-store.js";

/**
 * TWO doors, and the split is the point.
 *
 * `setup.` has no tenancy at all — `resolveHost` returns a bare context for it,
 * so `host.gate` is null there and the standing gate cannot fire. Every gate
 * assertion therefore has to be made on the STUDIO's own subdomain, which is
 * where a real owner lands the moment the wizard creates it. Asserting from
 * `setup.` would measure nothing and pass.
 */
const ORIGIN = "http://setup.localhost:8787";
const studioOrigin = (slug: string) => `http://${slug}.localhost:8787`;
const db = () => env.DB as D1Database;

function grabCookies(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  return (h.getSetCookie?.() ?? []).map((c: string) => c.split(";")[0]).join("; ");
}
const auth = (c: string) => ({ cookie: c, origin: ORIGIN });
const H = (c: string) => ({ ...auth(c), "content-type": "application/json" });

/** Passwordless sign-in + studio create — i.e. exactly what the wizard does up to
 *  the plan step, and no further. That is the state under test. */
async function signUpOnly(email: string, studio: string): Promise<{ cookie: string; tenantId: string; origin: string }> {
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
  const cookie = grabCookies(verify);
  const slug = studio.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  await SELF.fetch(`${ORIGIN}/api/auth/organization/create`, {
    method: "POST",
    headers: H(cookie),
    body: JSON.stringify({ name: studio, slug }),
  });
  const ctx = (await (await SELF.fetch(`${ORIGIN}/api/context`, { headers: auth(cookie) })).json()) as {
    active: { tenantId: string };
  };
  return { cookie, tenantId: ctx.active.tenantId, origin: studioOrigin(slug) };
}

/** Headers for a request to a STUDIO door. The cookie is carried by hand because
 *  each `*.localhost` has its own jar locally (see CLAUDE.md). */
const sAuth = (c: string, origin: string) => ({ cookie: c, origin });
const sH = (c: string, origin: string) => ({ ...sAuth(c, origin), "content-type": "application/json" });

let owner = "";
let tenantId = "";
let studio = "";

beforeAll(async () => {
  await ensureSchema(db());
  await seedBilling(db());
  const s = await signUpOnly("unconfigured-owner@test.dev", "Unconfigured Studio");
  owner = s.cookie;
  tenantId = s.tenantId;
  studio = s.origin;
});

describe("the studio is parked, not served", () => {
  it("sits on the free row with no paid plan — the state this is all about", async () => {
    const row = await db()
      .prepare("SELECT plan_id, comp FROM subscriptions WHERE tenant_id = ?")
      .bind(tenantId)
      .first<{ plan_id: string; comp: number }>();
    expect(row?.plan_id).toBe("free");
    expect(row?.comp).toBe(0);
  });

  it("reports the setup gate on the host probe, so the app can say the right thing", async () => {
    const res = await SELF.fetch(`${studio}/api/host`, { headers: sAuth(owner, studio) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { gate: { readOnly: boolean; blocked: boolean; reason: string } | null };
    // `setup`, not `suspended`: the copy differs and the app branches on it.
    // Nothing was taken away from this person and there is no arrears to settle.
    expect(body.gate).toMatchObject({ readOnly: true, blocked: false, reason: "setup" });
    // NEVER blocked. Withholding the app from someone mid-signup loses them at
    // the last step, and they would have nowhere to pay from.
    expect(body.gate?.blocked).toBe(false);
  });

  it("refuses to create a client — the thing the old free tier happily allowed", async () => {
    const res = await SELF.fetch(`${studio}/api/clients`, {
      method: "POST",
      headers: sH(owner, studio),
      body: JSON.stringify({ displayName: "Should Not Exist" }),
    });
    // 402, not 403: this is a billing state, and the app has to tell the two
    // apart to know whether to say "no permission" or "finish setting up".
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ error: "tenant_read_only", reason: "setup" });
  });

  it("still serves reads — the gate only ever concerns writes", async () => {
    for (const path of ["/api/context", "/api/clients", "/api/billing"]) {
      expect((await SELF.fetch(`${studio}${path}`, { headers: sAuth(owner, studio) })).status, path).toBe(200);
    }
  });
});

describe("…and the way out is open, which is the half that is easy to break", () => {
  it("records the plan choice — `/api/me/*` survives the gate", async () => {
    // The wizard's second write. It is a POST on a read-only host and it MUST
    // work: without it the plan step cannot even be reached, and the resulting
    // dead end looks like a payment failure rather than a gate.
    const res = await SELF.fetch(`${studio}/api/me/onboarding/plan`, {
      method: "POST",
      headers: sH(owner, studio),
      body: JSON.stringify({ planId: "solo" }),
    });
    expect(res.status).toBe(200);
  });

  it("lets the owner reach the billing lane — the only action that resolves this", async () => {
    // `billingWritable` + `billing:manage`. Stripe is not configured in the test
    // environment, so the handler's own answer is a 4xx about configuration —
    // what matters is that the GATE did not answer 402 first.
    const res = await SELF.fetch(`${studio}/api/billing/plan-intent`, {
      method: "POST",
      headers: sH(owner, studio),
      body: JSON.stringify({ planId: "solo" }),
    });
    expect(res.status).not.toBe(402);
  });

  it("leaving is still allowed, whatever the studio owes", async () => {
    // The invariant that outranks every gate: a person may always close their
    // account. `/api/me/*` is exempt at every rung for exactly this, and it is a
    // POST, so only that exemption keeps it off the 402.
    const res = await SELF.fetch(`${studio}/api/me/delete/request-otp`, {
      method: "POST",
      headers: sH(owner, studio),
      body: "{}",
    });
    expect(res.status).not.toBe(402);
  });
});

describe("a paid plan lifts the gate", () => {
  it("serves the whole app again the moment a paid plan is on the row", async () => {
    const s = await signUpOnly("configured-owner@test.dev", "Configured Studio");
    // The operator comp lane is the only way to put a paid plan on a row without
    // Stripe, which is not configured here. `comp: false` keeps the gate honest —
    // it must lift because the PLAN is paid, not because comp exempted it.
    await SELF.fetch(`${ORIGIN}/api/admin/tenants/${s.tenantId}/plan`, {
      method: "POST",
      headers: H(s.cookie),
      body: JSON.stringify({ planId: "solo", comp: false }),
    });
    const host = (await (await SELF.fetch(`${s.origin}/api/host`, { headers: sAuth(s.cookie, s.origin) })).json()) as {
      gate: { readOnly: boolean; reason: string } | null;
    };
    expect(host.gate).toMatchObject({ readOnly: false, reason: "ok" });
    // …and the write that was refused above now lands.
    const res = await SELF.fetch(`${s.origin}/api/clients`, {
      method: "POST",
      headers: sH(s.cookie, s.origin),
      body: JSON.stringify({ displayName: "First Client" }),
    });
    expect(res.status).toBe(201);
  });

  it("a COMPED studio is never gated, even on the free row", async () => {
    // An operator granting access is the one case where the absence of a payment
    // is deliberate. Gating it would make comping useless.
    const s = await signUpOnly("comped-owner@test.dev", "Comped Studio");
    await db().prepare("UPDATE subscriptions SET comp = 1 WHERE tenant_id = ?").bind(s.tenantId).run();
    const host = (await (await SELF.fetch(`${s.origin}/api/host`, { headers: sAuth(s.cookie, s.origin) })).json()) as {
      gate: { readOnly: boolean } | null;
    };
    expect(host.gate?.readOnly).toBe(false);
  });
});
