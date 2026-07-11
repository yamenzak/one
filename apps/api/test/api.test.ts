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
