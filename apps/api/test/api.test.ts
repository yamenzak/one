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
