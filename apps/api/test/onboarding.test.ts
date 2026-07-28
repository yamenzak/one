/**
 * Tenant-onboarding integration tests (SPEC §5, §12) — `onboarding-routes.ts`.
 *
 * The two properties that matter here and are not covered anywhere else:
 *
 *  1. **The plan picker is reachable with a session and NO tenant.** Every
 *     `/api/billing*` path runs behind `requireTenant`, so the first-run wizard
 *     could not use it; the whole reason this router exists is that
 *     `route-guard.ts` treats `/api/me/*` as authenticated-but-tenantless. If a
 *     future guard edit moves that path into the tenant lane, the wizard's plan
 *     step 401s and studio creation dies — these tests are the tripwire.
 *  2. **Choosing a plan never grants it.** `POST /me/onboarding/plan` writes
 *     `pending_plan_id` and nothing else, so the Stripe-unconfigured degrade path
 *     (which lets an owner through with billing pending, rather than deadlocking
 *     studio creation) cannot be turned into free paid entitlements.
 *
 * Conventions copied from `api.test.ts`: drive the real worker over `SELF`, sign
 * in through the real OTP ceremony, read the code out of D1. Stripe is
 * deliberately left unconfigured (the vitest env sets no keys), which is also the
 * shape a fresh deploy and the E2E stack have — so the degrade path is what runs.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";

const ORIGIN = "http://setup.localhost:8787";

function grabCookies(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() ?? []).map((c: string) => c.split(";")[0]).join("; ");
}

/** The passwordless ceremony only — deliberately WITHOUT creating an organization,
 *  because "signed in, no tenant" is the state the plan picker must serve. */
async function signInNoTenant(email: string): Promise<string> {
  const db = env.DB as D1Database;
  await SELF.fetch(`${ORIGIN}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const row = await db
    .prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1")
    .bind(`%otp%${email}%`)
    .first<{ value: string }>();
  const fallback = await db.prepare("SELECT value FROM verification ORDER BY createdAt DESC LIMIT 1").first<{ value: string }>();
  const otp = ((row?.value ?? fallback?.value ?? "").match(/\d{6}/) ?? [])[0];
  if (!otp) throw new Error("could not read OTP from verification table");
  const verify = await SELF.fetch(`${ORIGIN}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, otp }),
  });
  return grabCookies(verify);
}

/** …and the studio, as the wizard's step 1 does (Better Auth's own endpoint,
 *  which also stamps the session's activeOrganizationId). */
async function createStudio(cookies: string, name: string): Promise<string> {
  const res = await SELF.fetch(`${ORIGIN}/api/auth/organization/create`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, Cookie: cookies },
    body: JSON.stringify({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") }),
  });
  if (!res.ok) throw new Error(`organization/create → ${res.status} ${await res.text()}`);
  return grabCookies(res) || cookies;
}

const auth = (cookies: string) => ({ Cookie: cookies, origin: ORIGIN });

interface PlansPayload {
  plans: {
    id: string;
    name: string;
    priceUsdMonth: number;
    trialDays: number;
    limits: { staffSeats: number; activeClients: number; templates: number; storageMb: number; monthlyCredits: number };
    features: string[];
  }[];
  stripeEnabled: boolean;
  hasTenant: boolean;
  current: { planId: string; pendingPlanId: string | null; status: string } | null;
}

let tenantlessCookie = "";

beforeAll(async () => {
  await ensureSchema(env.DB as D1Database);
  tenantlessCookie = await signInNoTenant("onboarding-nobody@test.dev");
});

describe("onboarding plan picker", () => {
  it("401s without a session", async () => {
    const res = await SELF.fetch("http://x/api/me/onboarding/plans");
    expect(res.status).toBe(401);
  });

  it("is reachable with a session and NO tenant", async () => {
    const res = await SELF.fetch("http://x/api/me/onboarding/plans", { headers: auth(tenantlessCookie) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as PlansPayload;
    expect(body.hasTenant).toBe(false);
    expect(body.current).toBeNull();
    expect(body.plans.length).toBeGreaterThan(0);
  });

  it("returns only ACTIVE plans and never a retired one", async () => {
    const res = await SELF.fetch("http://x/api/me/onboarding/plans", { headers: auth(tenantlessCookie) });
    const { plans } = (await res.json()) as PlansPayload;
    const ids = plans.map((p) => p.id);
    expect(ids).toEqual(["solo", "light", "pro", "max"]);
    // The three grandfathered rows exist in D1 but must never be offered.
    for (const retired of ["free", "studio", "team"]) expect(ids).not.toContain(retired);
    const rows = await (env.DB as D1Database).prepare("SELECT id FROM plans WHERE active = 0").all<{ id: string }>();
    expect((rows.results ?? []).map((r) => r.id).sort()).toEqual(["free", "studio", "team"]);
  });

  it("exposes the picker's fields — price, headline limits, trial — and nothing else", async () => {
    const res = await SELF.fetch("http://x/api/me/onboarding/plans", { headers: auth(tenantlessCookie) });
    const { plans } = (await res.json()) as PlansPayload;
    const solo = plans.find((p) => p.id === "solo")!;
    expect(solo).toMatchObject({ name: "Solo", priceUsdMonth: 4.99, trialDays: 30 });
    expect(solo.limits).toMatchObject({ staffSeats: 1, activeClients: 1, monthlyCredits: 500 });
    // Trials are prominent on exactly two plans; the other two have none.
    expect(plans.find((p) => p.id === "light")!.trialDays).toBe(30);
    expect(plans.find((p) => p.id === "pro")!.trialDays).toBe(0);
    expect(plans.find((p) => p.id === "max")!.trialDays).toBe(0);
    // Shape is closed: no raw entitlements blob, no Stripe ids, no key material.
    for (const p of plans) {
      expect(Object.keys(p).sort()).toEqual(["features", "id", "limits", "name", "priceUsdMonth", "trialDays"]);
    }
  });

  it("leaks no secret or credential anywhere in the payload", async () => {
    const res = await SELF.fetch("http://x/api/me/onboarding/plans", { headers: auth(tenantlessCookie) });
    const raw = await res.text();
    for (const forbidden of ["entitlements_json", "stripe_price_id", "stripe_product_id", "secretKey", "sk_", "whsec", "publishableKey"]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it("never advertises a reserved (declared-but-unbuilt) feature", async () => {
    const res = await SELF.fetch("http://x/api/me/onboarding/plans", { headers: auth(tenantlessCookie) });
    const { plans } = (await res.json()) as PlansPayload;
    for (const p of plans) {
      expect(p.features).not.toContain("chat");
      expect(p.features).not.toContain("integrations");
    }
    // …and it does advertise what the catalog really switches on.
    expect(plans.find((p) => p.id === "pro")!.features).toContain("branding");
  });

  it("reports Stripe as unconfigured when no keys are set (the degrade signal)", async () => {
    const res = await SELF.fetch("http://x/api/me/onboarding/plans", { headers: auth(tenantlessCookie) });
    expect(((await res.json()) as PlansPayload).stripeEnabled).toBe(false);
  });
});

describe("onboarding plan selection", () => {
  it("409s `no_tenant` before the studio exists, so the wizard knows to create it", async () => {
    const res = await SELF.fetch("http://x/api/me/onboarding/plan", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(tenantlessCookie) },
      body: JSON.stringify({ planId: "light" }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "no_tenant" });
  });

  it("401s without a session", async () => {
    const res = await SELF.fetch("http://x/api/me/onboarding/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: "light" }),
    });
    expect(res.status).toBe(401);
  });

  it("records the choice as PENDING and does not grant the paid plan", async () => {
    const cookie = await createStudio(await signInNoTenant("onboarding-owner1@test.dev"), "Onboarding Studio A");

    const res = await SELF.fetch("http://x/api/me/onboarding/plan", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(cookie) },
      body: JSON.stringify({ planId: "max" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, planId: "max", planName: "Max", stripeEnabled: false, billing: "pending" });

    // The plan is recorded…
    const billing = (await (await SELF.fetch("http://x/api/billing", { headers: auth(cookie) })).json()) as {
      subscription: { planId: string; status: string; pendingPlanId: string | null };
    };
    expect(billing.subscription.pendingPlanId).toBe("max");
    // …and NOT granted: the tenant is still on the implicit free baseline.
    expect(billing.subscription.planId).toBe("free");

    // The teeth: entitlements are still free-tier, so an unpaid "Max" studio has
    // no Max capabilities (Max would be unlimited clients + the whole AI suite).
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(cookie) })).json()) as {
      entitlements: { features: Record<string, boolean>; quotas: Record<string, number>; aiCredits: { monthlyGrant: number } };
    };
    expect(ctx.entitlements.features.aiSuite).toBe(false);
    expect(ctx.entitlements.features.commerce).toBe(false);
    expect(ctx.entitlements.quotas.activeClients).toBe(3);
    expect(ctx.entitlements.aiCredits.monthlyGrant).toBe(0);
  });

  it("refuses a retired plan id", async () => {
    const cookie = await createStudio(await signInNoTenant("onboarding-owner2@test.dev"), "Onboarding Studio B");
    for (const planId of ["free", "studio", "team"]) {
      const res = await SELF.fetch("http://x/api/me/onboarding/plan", {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(cookie) },
        body: JSON.stringify({ planId }),
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "unknown_plan" });
    }
  });

  it("refuses an unknown plan id and a malformed body", async () => {
    const cookie = await createStudio(await signInNoTenant("onboarding-owner3@test.dev"), "Onboarding Studio C");
    const bad = await SELF.fetch("http://x/api/me/onboarding/plan", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(cookie) },
      body: JSON.stringify({ planId: "enterprise-unlimited" }),
    });
    expect(bad.status).toBe(400);
    const malformed = await SELF.fetch("http://x/api/me/onboarding/plan", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(cookie) },
      body: "not json",
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: "invalid body" });
  });

  it("re-reads the recorded choice so an abandoned onboarding resumes preselected", async () => {
    const cookie = await createStudio(await signInNoTenant("onboarding-owner4@test.dev"), "Onboarding Studio D");
    await SELF.fetch("http://x/api/me/onboarding/plan", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(cookie) },
      body: JSON.stringify({ planId: "light" }),
    });
    const body = (await (await SELF.fetch("http://x/api/me/onboarding/plans", { headers: auth(cookie) })).json()) as PlansPayload;
    expect(body.hasTenant).toBe(true);
    expect(body.current).toMatchObject({ planId: "free", pendingPlanId: "light" });
  });

  it("a later choice replaces the earlier one", async () => {
    const cookie = await createStudio(await signInNoTenant("onboarding-owner5@test.dev"), "Onboarding Studio E");
    const pick = (planId: string) =>
      SELF.fetch("http://x/api/me/onboarding/plan", {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(cookie) },
        body: JSON.stringify({ planId }),
      });
    await pick("solo");
    await pick("pro");
    const body = (await (await SELF.fetch("http://x/api/me/onboarding/plans", { headers: auth(cookie) })).json()) as PlansPayload;
    expect(body.current?.pendingPlanId).toBe("pro");
  });
});
