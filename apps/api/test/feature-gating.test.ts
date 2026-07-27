/**
 * Feature-gating conformance (audit round-6): the two flag systems, end to end.
 *
 * The owner's report was "after a failed onboarding, with no subscription at all,
 * nothing was locked". This file is the regression net for the enforcement half
 * of that: for every PLATFORM entitlement, a tenant that does not hold it is
 * REFUSED on the routes that require it and a tenant that does hold it is not;
 * for every per-package CLIENT flag, the client is refused when their package
 * omits it; and the INTERSECTION holds in both directions (tenant lacks it →
 * refused even with the flag on; client's package lacks it → refused even on the
 * top plan). Plus: nothing can reach a `reserved: true` feature.
 *
 * What this file CAN and CANNOT assert (AGENTS.md §4): `vitest.config.ts` sets
 * `ADMIN_EMAILS: ""` + `ENVIRONMENT: "development"`, so every signed-in test user
 * is a platform admin and `route-guard.ts` short-circuits the ACTION gate for
 * admins — an action-gate 403 is NOT observable here. But `gateFeature`,
 * `requireClientFlag` and `requireClientAccess` all run INSIDE handlers, consult
 * no admin status, and ARE observable. Every assertion below is one of those.
 *
 * Plan feature matrix used (billing-store.ts DEFAULT_PLANS):
 *   free  → externalSearch only
 *   solo  → externalSearch, aiSuite
 *   light → + commerce, bfCamera
 *   pro   → + supplementsLabs, frontDesk, branding   (everything that exists)
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { FEATURE_KEYS, RESERVED_FEATURES, featuresForEntitlement, type ClientFlags } from "@mossa/domain";
import { ensureSchema } from "../src/db.js";

const B = "http://localhost:8787"; // treated as local by createAuth (non-secure cookies)

function grabCookies(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

const auth = (cookies: string) => ({ Cookie: cookies, origin: B });
const J = (cookies: string) => ({ "content-type": "application/json", ...auth(cookies) });

/** Passwordless sign-in, no organization. */
async function signIn(email: string): Promise<string> {
  const db = env.DB as D1Database;
  await SELF.fetch(`${B}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: B },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const row = await db.prepare("SELECT value FROM verification ORDER BY createdAt DESC LIMIT 1").first<{ value: string }>();
  const otp = ((row?.value ?? "").match(/\d{6}/) ?? [])[0];
  if (!otp) throw new Error("could not read OTP from verification table");
  return grabCookies(
    await SELF.fetch(`${B}/api/auth/sign-in/email-otp`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: B },
      body: JSON.stringify({ email, otp }),
    }),
  );
}

/** Sign in and create a studio (the caller becomes its owner). */
async function signInFlow(email: string, studioName: string): Promise<string> {
  let cookies = await signIn(email);
  const org = await SELF.fetch(`${B}/api/auth/organization/create`, {
    method: "POST",
    headers: J(cookies),
    body: JSON.stringify({ name: studioName, slug: studioName.toLowerCase().replace(/[^a-z0-9]+/g, "-") }),
  });
  const refreshed = grabCookies(org);
  if (refreshed) cookies = refreshed;
  return cookies;
}

/** A studio on `planId` with its owner signed in. */
async function studio(tag: string, planId: string) {
  const db = env.DB as D1Database;
  const owner = await signInFlow(`${tag}-owner@test.dev`, `${tag} Studio`);
  const tenantId = ((await (await SELF.fetch(`${B}/api/context`, { headers: auth(owner) })).json()) as { active: { tenantId: string } }).active.tenantId;
  const r = await SELF.fetch(`${B}/api/admin/tenants/${tenantId}/plan`, { method: "POST", headers: J(owner), body: JSON.stringify({ planId }) });
  expect(r.status).toBe(200);
  return { db, owner, tenantId };
}

/** Create a client record on the studio's roster. */
async function newClient(owner: string, displayName: string, email?: string): Promise<string> {
  const res = await SELF.fetch(`${B}/api/clients`, {
    method: "POST",
    headers: J(owner),
    body: JSON.stringify({ displayName, ...(email ? { email } : {}) }),
  });
  expect(res.status).toBeLessThan(300);
  return ((await res.json()) as { client: { id: string } }).client.id;
}

/**
 * Sign a CLIENT in as themselves and select the studio persona. The
 * email-matched auto-link in /api/context mints the membership; /context/switch
 * makes that tenant active so `c.get("role") === "client"` — which is the only
 * role `requireClientFlag` constrains.
 */
async function clientSession(email: string, tenantId: string): Promise<string> {
  const cookie = await signIn(email);
  await SELF.fetch(`${B}/api/context`, { headers: auth(cookie) });
  await SELF.fetch(`${B}/api/context/switch`, { method: "POST", headers: J(cookie), body: JSON.stringify({ tenantId }) });
  const ctx = (await (await SELF.fetch(`${B}/api/context`, { headers: auth(cookie) })).json()) as { active: { role: string; clientId: string | null } };
  expect(ctx.active.role).toBe("client");
  return cookie;
}

/**
 * Sell the client a package whose flags are exactly `flags` over the permissive
 * defaults, with an `all` budget so budget-gating never masks the flag under
 * test (a `workout`-only budget would switch the meal flags off for its own
 * reasons — see resolveClientFlags).
 */
async function grantPackage(owner: string, clientId: string, tag: string, flags: Partial<ClientFlags>): Promise<void> {
  const pkg = await SELF.fetch(`${B}/api/packages`, {
    method: "POST",
    headers: J(owner),
    body: JSON.stringify({ name: `${tag} Pack`, budgets: [{ feature: "all", days: 30 }], flags }),
  });
  expect(pkg.status).toBe(201);
  const packageId = ((await pkg.json()) as { id: string }).id;
  const grant = await SELF.fetch(`${B}/api/subscriptions/grant`, {
    method: "POST",
    headers: J(owner),
    body: JSON.stringify({ clientId, packageId }),
  });
  expect(grant.status).toBeLessThan(300);
}

/** A studio + a signed-in client of that studio, on `planId`. */
async function studioWithClient(tag: string, planId: string) {
  const s = await studio(tag, planId);
  const email = `${tag}-client@test.dev`;
  const clientId = await newClient(s.owner, `${tag} Client`, email);
  const client = await clientSession(email, s.tenantId);
  return { ...s, clientId, client, email };
}

const today = "2026-05-04";

beforeAll(async () => {
  await ensureSchema(env.DB as D1Database);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1 — PLATFORM ENTITLEMENTS: what the TENANT bought from Mossa
// ─────────────────────────────────────────────────────────────────────────────
describe("platform entitlements are enforced per route", () => {
  /** Every non-reserved entitlement, the route that requires it, and a request
   *  body that gets past zod so the 403 we see is the GATE and not a 400. */
  const CASES: { feature: string; label: string; call: (cookies: string, clientId: string) => Promise<Response> }[] = [
    {
      feature: "commerce", label: "POST /api/packages",
      call: (c) => SELF.fetch(`${B}/api/packages`, { method: "POST", headers: J(c), body: JSON.stringify({ name: "Pack", budgets: [{ feature: "all", days: 30 }] }) }),
    },
    {
      feature: "supplementsLabs", label: "POST /api/supplements",
      call: (c, clientId) => SELF.fetch(`${B}/api/supplements`, { method: "POST", headers: J(c), body: JSON.stringify({ clientId, name: "Creatine", schedule: [{ slot: "daily" }] }) }),
    },
    {
      feature: "supplementsLabs", label: "POST /api/labs",
      call: (c, clientId) => SELF.fetch(`${B}/api/labs`, { method: "POST", headers: J(c), body: JSON.stringify({ clientId, panel: "Lipids", displayName: "Lipid panel" }) }),
    },
    {
      feature: "frontDesk", label: "POST /api/addon-types",
      call: (c) => SELF.fetch(`${B}/api/addon-types`, { method: "POST", headers: J(c), body: JSON.stringify({ label: "Consult", durationMinutes: 30 }) }),
    },
    {
      feature: "bfCamera", label: "GET /api/body-scan/cues",
      call: (c) => SELF.fetch(`${B}/api/body-scan/cues`, { headers: auth(c) }),
    },
    {
      feature: "branding", label: "PATCH /api/settings (branding)",
      call: (c) => SELF.fetch(`${B}/api/settings`, { method: "PATCH", headers: J(c), body: JSON.stringify({ branding: { tokens: { dark: { "--primary": "oklch(0.6 0.1 200)" } } } }) }),
    },
    {
      feature: "aiSuite", label: "POST /api/ai/client-summary",
      call: (c, clientId) => SELF.fetch(`${B}/api/ai/client-summary`, { method: "POST", headers: J(c), body: JSON.stringify({ clientId, today }) }),
    },
    {
      feature: "aiSuite", label: "POST /api/ai/draft-plan",
      call: (c, clientId) => SELF.fetch(`${B}/api/ai/draft-plan`, { method: "POST", headers: J(c), body: JSON.stringify({ clientId, instructions: "3-day full body" }) }),
    },
  ];

  for (const [i, tc] of CASES.entries()) {
    it(`a tenant WITHOUT ${tc.feature} is refused on ${tc.label}`, async () => {
      // `free` holds no feature but externalSearch, so it stands in for the
      // never-subscribed / suspended tenant the owner reported.
      const { owner } = await studio(`ng${i}`, "free");
      const clientId = await newClient(owner, "Nope");
      const res = await tc.call(owner, clientId);
      expect(res.status).toBe(403);
      // The gate's uniform shape (requireFeature) — not an incidental 403.
      expect(await res.json()).toMatchObject({ feature: tc.feature });
    });

    it(`a tenant WITH ${tc.feature} is not refused on ${tc.label}`, async () => {
      const { owner } = await studio(`ok${i}`, "pro"); // pro carries every live feature
      const clientId = await newClient(owner, "Yep");
      const res = await tc.call(owner, clientId);
      expect(res.status).not.toBe(403);
    });
  }

  it("externalSearch gates the provider fan-out (proved by taking it away)", async () => {
    // Every shipping plan enables externalSearch, so the only way to observe this
    // gate is to build a plan without it. isolatedStorage rolls the edit back.
    // NB: no positive-path assertion here on purpose — with the entitlement on,
    // the route fans out to real providers over the network (4 s per provider),
    // which is neither fast nor deterministic in CI. The gate is what's under test.
    //
    // Park the tenant on `solo` while `free` is edited DOWN. That ordering is
    // load-bearing: `snapshotDowngrade` + `raiseOverride` deliberately
    // grandfather every tenant sitting on a plan whose features are removed, so
    // editing `free` while the tenant was on it handed them an
    // `overrides_json` with externalSearch:true and the gate correctly stayed
    // open. Move on to the edited plan afterwards and no grandfathering applies.
    const { owner, tenantId } = await studio("extsearch", "solo");
    await SELF.fetch(`${B}/api/admin/plans/free`, {
      method: "PATCH",
      headers: J(owner),
      body: JSON.stringify({ entitlements: { quotas: {}, features: { externalSearch: false }, aiCredits: { monthlyGrant: 0 } } }),
    });
    const move = await SELF.fetch(`${B}/api/admin/tenants/${tenantId}/plan`, { method: "POST", headers: J(owner), body: JSON.stringify({ planId: "free" }) });
    expect(move.status).toBe(200);

    const foods = await SELF.fetch(`${B}/api/foods/search-external?q=oats`, { headers: auth(owner) });
    expect(foods.status).toBe(403);
    expect(await foods.json()).toMatchObject({ feature: "externalSearch" });
    // The exercise fan-out rides the same entitlement (FEATURES.externalExerciseSearch).
    const ex = await SELF.fetch(`${B}/api/exercises/search-external?q=squat`, { headers: auth(owner) });
    expect(ex.status).toBe(403);
    expect(await ex.json()).toMatchObject({ feature: "externalSearch" });
  });

  // NB: no assistant-seat assertion here. `frontDesk` is sold as "Assistant role
  // + sessions/booking" (SPEC §5) but only the sessions half is gated; promotion
  // to `assistant` in member-routes.ts is an ungated role string. Landing that
  // gate requires editing `entitlement-guards.test.ts`, which asserts
  // trainer→assistant returns 200 on `free` — handed off, see member-routes.ts.

  it("a suspended subscription drops the tenant to free capabilities", async () => {
    // clampEntitlementsForStatus is the passthrough that makes delinquency bite
    // every gate at once; assert it lands on a real route, not just in the pure fn.
    const db = env.DB as D1Database;
    const { owner, tenantId } = await studio("susp", "pro");
    const before = await SELF.fetch(`${B}/api/addon-types`, { method: "POST", headers: J(owner), body: JSON.stringify({ label: "Consult", durationMinutes: 30 }) });
    expect(before.status).toBe(201);

    await db.prepare("UPDATE subscriptions SET status = 'suspended' WHERE tenant_id = ?").bind(tenantId).run();
    const after = await SELF.fetch(`${B}/api/addon-types`, { method: "POST", headers: J(owner), body: JSON.stringify({ label: "Consult 2", durationMinutes: 30 }) });
    expect(after.status).toBe(403);
    expect(await after.json()).toMatchObject({ feature: "frontDesk" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 — PER-PACKAGE CLIENT FLAGS: what the CLIENT bought from the tenant
// ─────────────────────────────────────────────────────────────────────────────
describe("per-package client flags are enforced per route", () => {
  /** Each newly-gated capability: the flag, the route, and a valid body. */
  const CASES: { flag: keyof ClientFlags; label: string; call: (cookies: string, clientId: string) => Promise<Response> }[] = [
    {
      flag: "canLogWater", label: "POST /api/logs/water",
      call: (c, clientId) => SELF.fetch(`${B}/api/logs/water`, { method: "POST", headers: J(c), body: JSON.stringify({ clientId, data: { date: today, amountMl: 300 } }) }),
    },
    {
      flag: "canLogSleep", label: "POST /api/logs/sleep",
      call: (c, clientId) => SELF.fetch(`${B}/api/logs/sleep`, { method: "POST", headers: J(c), body: JSON.stringify({ clientId, data: { date: today, durationMinutes: 430 } }) }),
    },
    {
      flag: "canLogMood", label: "POST /api/logs/mood",
      call: (c, clientId) => SELF.fetch(`${B}/api/logs/mood`, { method: "POST", headers: J(c), body: JSON.stringify({ clientId, data: { date: today, mood: 4 } }) }),
    },
    {
      flag: "canLogMeasurements", label: "POST /api/measurements",
      call: (c, clientId) => SELF.fetch(`${B}/api/measurements`, { method: "POST", headers: J(c), body: JSON.stringify({ clientId, data: { date: today, weightKg: 71.5 } }) }),
    },
    {
      flag: "canTrackFasting", label: "POST /api/fasting",
      call: (c, clientId) => SELF.fetch(`${B}/api/fasting`, { method: "POST", headers: J(c), body: JSON.stringify({ clientId, data: { action: "start", targetHours: 16 } }) }),
    },
    {
      flag: "canLogOwnFood", label: "POST /api/logs/food",
      call: (c, clientId) => SELF.fetch(`${B}/api/logs/food`, { method: "POST", headers: J(c), body: JSON.stringify({ clientId, data: { date: today, mealType: "snack", label: "Apple", calories: 95, proteinG: 0, carbsG: 25, fatG: 0, source: "self_logged" } }) }),
    },
    {
      flag: "canLogExtraWorkouts", label: "POST /api/logs/activity",
      call: (c, clientId) => SELF.fetch(`${B}/api/logs/activity`, { method: "POST", headers: J(c), body: JSON.stringify({ clientId, data: { date: today, activityKey: "walking", durationMin: 30 } }) }),
    },
    {
      flag: "showNutritionReports", label: "GET /api/logs/nutrition/week",
      call: (c, clientId) => SELF.fetch(`${B}/api/logs/nutrition/week?clientId=${clientId}&date=${today}`, { headers: auth(c) }),
    },
    {
      flag: "canViewBodyMetricsReport", label: "GET /api/reports/client/:id",
      call: (c, clientId) => SELF.fetch(`${B}/api/reports/client/${clientId}?range=30d&today=${today}`, { headers: auth(c) }),
    },
  ];

  for (const [i, tc] of CASES.entries()) {
    it(`a client whose package omits ${tc.flag} is refused on ${tc.label}`, async () => {
      const { owner, clientId, client } = await studioWithClient(`cf${i}`, "pro");
      await grantPackage(owner, clientId, `cf${i}`, { [tc.flag]: false } as Partial<ClientFlags>);

      const res = await tc.call(client, clientId);
      expect(res.status).toBe(403);
      // requireClientFlag's uniform shape — names the flag, not the feature.
      expect(await res.json()).toMatchObject({ flag: tc.flag });
    });

    it(`the same client succeeds on ${tc.label} once the package includes ${tc.flag}`, async () => {
      const { owner, clientId, client } = await studioWithClient(`cy${i}`, "pro");
      await grantPackage(owner, clientId, `cy${i}`, { [tc.flag]: true } as Partial<ClientFlags>);

      const res = await tc.call(client, clientId);
      expect(res.status).not.toBe(403);
    });

    it(`a COACH is never limited by the client's package on ${tc.label}`, async () => {
      // requireClientFlag no-ops for staff by design: a client's package bounds
      // the client's own self-service, never the coach acting on their behalf.
      const { owner, clientId } = await studioWithClient(`cs${i}`, "pro");
      await grantPackage(owner, clientId, `cs${i}`, { [tc.flag]: false } as Partial<ClientFlags>);

      const res = await tc.call(owner, clientId);
      expect(res.status).not.toBe(403);
    });
  }

  it("a client whose package omits canRequestExerciseSwap cannot open a swap", async () => {
    // Swaps need a real plan of their own, so they don't fit the table above.
    const { owner, clientId, client } = await studioWithClient("swap", "pro");
    await grantPackage(owner, clientId, "swap", { canRequestExerciseSwap: false });
    const planId = ((await (await SELF.fetch(`${B}/api/workout-plans`, {
      method: "POST", headers: J(owner),
      body: JSON.stringify({ clientId, name: "Plan A" }),
    })).json()) as { plan: { id: string } }).plan.id;

    const body = JSON.stringify({ clientId, workoutPlanId: planId, dayIndex: 0, blockIndex: 0, slotIndex: 0, currentExerciseId: "exr_x", reason: "knee" });
    const refused = await SELF.fetch(`${B}/api/swaps`, { method: "POST", headers: J(client), body });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ flag: "canRequestExerciseSwap" });
  });

  it("a client whose package omits canEditMealPlan cannot save a meal arrangement", async () => {
    const { owner, clientId, client } = await studioWithClient("arr", "pro");
    await grantPackage(owner, clientId, "arr", { canEditMealPlan: false });
    const mealPlanId = ((await (await SELF.fetch(`${B}/api/meal-plans`, {
      method: "POST", headers: J(owner),
      body: JSON.stringify({ clientId, name: "Meals A" }),
    })).json()) as { plan: { id: string } }).plan.id;

    const res = await SELF.fetch(`${B}/api/arrangements`, {
      method: "PUT", headers: J(client),
      body: JSON.stringify({ clientId, data: { mealPlanId, slots: [{ weekday: 0, mealType: "breakfast", optionIndex: 0 }] } }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ flag: "canEditMealPlan" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 — THE INTERSECTION: entitlements ∩ client flags (AGENTS.md §1 invariant 6)
// ─────────────────────────────────────────────────────────────────────────────
describe("client capability is the intersection, in both directions", () => {
  const scan = (cookies: string, clientId: string) =>
    SELF.fetch(`${B}/api/body-scans`, {
      method: "POST", headers: J(cookies),
      body: JSON.stringify({ clientId, date: today, weightKg: 64, circumferences: { neckCm: 33, waistCm: 74 }, storeSilhouette: false }),
    });

  it("tenant HAS bfCamera + package HAS canUseBodyScan → allowed", async () => {
    const { owner, clientId, client } = await studioWithClient("ix1", "pro");
    await grantPackage(owner, clientId, "ix1", { canUseBodyScan: true });
    expect((await scan(client, clientId)).status).not.toBe(403);
  });

  it("tenant LACKS bfCamera but package HAS canUseBodyScan → refused (the entitlement half)", async () => {
    // `solo` has aiSuite but no bfCamera. The tenant cannot sell what Mossa
    // didn't sell them, no matter what the package says.
    const { owner, clientId, client, tenantId } = await studioWithClient("ix2", "pro");
    await grantPackage(owner, clientId, "ix2", { canUseBodyScan: true });
    await SELF.fetch(`${B}/api/admin/tenants/${tenantId}/plan`, { method: "POST", headers: J(owner), body: JSON.stringify({ planId: "solo" }) });

    const res = await scan(client, clientId);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ feature: "bfCamera" });
  });

  it("tenant HAS bfCamera but package OMITS canUseBodyScan → refused (the client-flag half)", async () => {
    const { owner, clientId, client } = await studioWithClient("ix3", "pro");
    await grantPackage(owner, clientId, "ix3", { canUseBodyScan: false });

    const res = await scan(client, clientId);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ flag: "canUseBodyScan" });
  });

  it("the resolver forces a client flag off when the tenant loses its backing entitlement", async () => {
    // The intersection is applied inside resolveClientFlags, so /api/context —
    // what the UI gates on — must report the flag off too, not just the route.
    const { owner, clientId, client, tenantId } = await studioWithClient("ix4", "pro");
    await grantPackage(owner, clientId, "ix4", { canUseBodyScan: true });
    const on = (await (await SELF.fetch(`${B}/api/context`, { headers: auth(client) })).json()) as { clientFlags: ClientFlags | null };
    expect(on.clientFlags?.canUseBodyScan).toBe(true);

    await SELF.fetch(`${B}/api/admin/tenants/${tenantId}/plan`, { method: "POST", headers: J(owner), body: JSON.stringify({ planId: "solo" }) });
    const off = (await (await SELF.fetch(`${B}/api/context`, { headers: auth(client) })).json()) as { clientFlags: ClientFlags | null; entitlements: { features: Record<string, boolean> } };
    expect(off.entitlements.features.bfCamera).toBe(false);
    expect(off.clientFlags?.canUseBodyScan).toBe(false);
  });

  it("the AI master switch kills the AI groups it bounds", async () => {
    const { owner, clientId, client } = await studioWithClient("ix5", "pro");
    await grantPackage(owner, clientId, "ix5", { canUseAi: false, aiMealTools: true, aiCoachInsights: true });
    const ctx = (await (await SELF.fetch(`${B}/api/context`, { headers: auth(client) })).json()) as { clientFlags: ClientFlags | null };
    expect(ctx.clientFlags?.canUseAi).toBe(false);
    expect(ctx.clientFlags?.aiMealTools).toBe(false);
    expect(ctx.clientFlags?.aiCoachInsights).toBe(false);

    // …and the composed gate (FEATURES.clientAi = aiSuite ∩ canUseAi) refuses.
    const res = await SELF.fetch(`${B}/api/ai/activity-estimate`, {
      method: "POST", headers: J(client),
      body: JSON.stringify({ clientId, activityKey: "walking", durationMin: 30 }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ flag: "canUseAi" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 — RESERVED FEATURES: declared, sold by nobody, reachable from nowhere
// ─────────────────────────────────────────────────────────────────────────────
describe("reserved features are unreachable", () => {
  it("the registry names exactly the two features that do not exist", () => {
    expect([...RESERVED_FEATURES].sort()).toEqual(["chat", "integrations"]);
  });

  it("no reserved entitlement is referenced by any FeatureSpec, so gateFeature cannot reach one", () => {
    // This is the structural guarantee: enforcement DERIVES from FEATURES, so a
    // feature nothing references can never be the thing a route gates on — and
    // therefore can never be the thing a route lets through either.
    for (const key of RESERVED_FEATURES) expect(featuresForEntitlement(key)).toEqual([]);
    // Conversely, every LIVE entitlement is reachable through the registry.
    for (const key of FEATURE_KEYS) {
      if (RESERVED_FEATURES.includes(key)) continue;
      expect(featuresForEntitlement(key).length, `${key} has no FeatureSpec`).toBeGreaterThan(0);
    }
  });

  it("no plan on offer enables a reserved feature", async () => {
    const { owner } = await studio("resv", "free");
    const plans = (await (await SELF.fetch(`${B}/api/admin/plans`, { headers: auth(owner) })).json()) as {
      plans: { id: string; entitlements: { features: Record<string, boolean> } }[];
    };
    expect(plans.plans.length).toBeGreaterThan(0);
    for (const p of plans.plans) {
      for (const key of RESERVED_FEATURES) {
        // The retired `studio`/`team` rows still carry chat:true in their stored
        // D1 JSON on purpose (a grandfathered tenant keeps what it was sold), so
        // exempt the inactive rows and hold the line on everything sellable.
        if (p.id === "studio" || p.id === "team") continue;
        expect(p.entitlements.features[key], `${p.id}.${key}`).toBe(false);
      }
    }
  });

  it("even a tenant gifted a reserved feature gains no surface from it", async () => {
    // An admin override CAN write chat:true (mergeOverrides is enable-only and
    // key-agnostic). That must stay inert: nothing consults it.
    const { owner, tenantId } = await studio("resv2", "free");
    const gift = await SELF.fetch(`${B}/api/admin/tenants/${tenantId}/overrides`, {
      method: "PATCH", headers: J(owner),
      body: JSON.stringify({ grants: { features: { chat: true, integrations: true } } }),
    });
    expect(gift.status).toBeLessThan(300);
    // Nothing else moved: the tenant is still on free capabilities everywhere.
    const res = await SELF.fetch(`${B}/api/packages`, { method: "POST", headers: J(owner), body: JSON.stringify({ name: "Pack", budgets: [{ feature: "all", days: 30 }] }) });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ feature: "commerce" });
  });
});

describe("storage remaining is the owner's number, not the studio's members'", () => {
  it("a client and a trainer are refused; the owner is not", async () => {
    // The meter reports a PLAN ceiling — the studio's commercial position, not a
    // fact about the viewer's own files. A client uploading into a full studio
    // still gets a clear 413 from the upload route, which is all they need.
    const { owner, client } = await studioWithClient("stor1", "pro");
    expect((await SELF.fetch(`${B}/api/storage-usage`, { headers: auth(client) })).status).toBe(403);
    const asOwner = await SELF.fetch(`${B}/api/storage-usage`, { headers: auth(owner) });
    expect(asOwner.status).toBe(200);
    expect(await asOwner.json()).toHaveProperty("usedMb");
  });
});
