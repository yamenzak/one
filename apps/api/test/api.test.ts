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
import { ensureSchema } from "../src/db.js";

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
    const clientRes = await SELF.fetch("http://x/api/clients", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
      body: JSON.stringify({ displayName: "AITest" }),
    });
    const { client } = (await clientRes.json()) as { client: { id: string } };
    const res = await SELF.fetch("http://x/api/ai/parse-food", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(ownerCookie) },
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
    const snapOut = (await snap.json()) as { entries: unknown[]; mocked: boolean };
    expect(snapOut.mocked).toBe(true);
    expect(snapOut.entries.length).toBeGreaterThan(0);
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

describe("AI meal draft — food import from the library", () => {
  it("resolves drafted food queries to real library food ids", async () => {
    const H = { "content-type": "application/json", ...auth(ownerCookie) };
    const ctx = (await (await SELF.fetch("http://x/api/context", { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
    await SELF.fetch(`http://x/api/admin/tenants/${ctx.active.tenantId}/plan`, { method: "POST", headers: H, body: JSON.stringify({ planId: "studio" }) });
    // Seed a food that the mock draft will reference ("rolled oats").
    const { id: foodId } = (await (await SELF.fetch("http://x/api/foods", { method: "POST", headers: H, body: JSON.stringify({ name: "Rolled Oats", calories: 380, proteinG: 13, carbsG: 67, fatG: 7 }) })).json()) as { id: string };
    const { client } = (await (await SELF.fetch("http://x/api/clients", { method: "POST", headers: H, body: JSON.stringify({ displayName: "MealAI" }) })).json()) as { client: { id: string } };

    const r = (await (await SELF.fetch("http://x/api/ai/draft-meal", { method: "POST", headers: H, body: JSON.stringify({ clientId: client.id }) })).json()) as { draft: { mealOptions: { mealType: string; foods: { foodId: string; quantity: number; unit: string }[] }[] } };
    const breakfast = r.draft.mealOptions.find((o) => o.mealType === "breakfast")!;
    expect(breakfast.foods.length).toBeGreaterThan(0);
    // The "rolled oats" query resolved to our seeded food id.
    expect(breakfast.foods.some((f) => f.foodId === foodId)).toBe(true);
    expect(breakfast.foods[0]!.quantity).toBeGreaterThan(0);
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
    expect(subs.subscriptions[0]!.daysRemaining).toBe(60);
    expect(subs.subscriptions[0]!.budgets.length).toBe(2);
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

    const feed = (await (await SELF.fetch(`http://x/api/activity-history?clientId=${client.id}&from=2026-07-08&to=2026-07-10`, { headers: auth(ownerCookie) })).json()) as { events: { kind: string; date: string; title: string; ref?: string; metric?: { unit: string; value: number } }[] };
    const kinds = feed.events.map((e) => e.kind);
    expect(kinds).toContain("food:lunch");
    expect(kinds).toContain("water");
    expect(kinds).toContain("activity");
    expect(kinds).toContain("workout");
    expect(kinds).toContain("checkin");
    expect(feed.events.every((e) => e.date >= "2026-07-08" && e.date <= "2026-07-10")).toBe(true);
    const food = feed.events.find((e) => e.kind === "food:lunch")!;
    expect(food.metric).toMatchObject({ unit: "energy", value: 500 });
    // Deep-link ref: a check-in carries its date so the feed can open its detail.
    expect(feed.events.find((e) => e.kind === "checkin")!.ref).toBe(d);
    // A lab is dated by its creation time; a wide window catches it, ref = lab id.
    const wide = (await (await SELF.fetch(`http://x/api/activity-history?clientId=${client.id}&from=2026-07-08&to=2030-01-01`, { headers: auth(ownerCookie) })).json()) as { events: { kind: string; ref?: string }[] };
    expect(wide.events.find((e) => e.kind === "lab")!.ref).toBe(labId);
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

  it("the /foods/:id editor route does not shadow /foods/search-external (regression)", async () => {
    // Before the id was constrained to `food_…`, this GET matched /foods/:id
    // with id="search-external" and 404'd — silently killing web food search.
    const res = await SELF.fetch("http://x/api/foods/search-external?q=banana", { headers: auth(ownerCookie) });
    expect(res.status).not.toBe(404);
    const body = (await res.json()) as { foods?: unknown[]; error?: string };
    expect(body.error).not.toBe("not found");
  });

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
