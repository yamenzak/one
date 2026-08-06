/**
 * WHAT AN OPERATOR GIVES, AN OPERATOR CAN TAKE BACK.
 *
 * The per-tenant override lane was grant-only end to end: `raiseOverride` merges
 * with `max`, `raiseQuota` makes `-1` absorbing, and the route's only way down
 * was `reset` — which also discarded the GRANDFATHERING a plan edit had written.
 * So "give this studio 10 seats" was a one-way door, and the panel said so
 * rather than fixing it.
 *
 * Adjustments are the other lane. What matters is not that they store — it is
 * that the reduction reaches the GATES, and that it cannot erode a grandfathered
 * right on the way.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";

const B = "http://setup.localhost:8787";
const ADMIN = "http://admin.localhost:8787";

function grabCookies(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}
const auth = (cookies: string) => ({ Cookie: cookies, origin: B });
const J = (cookies: string) => ({ "content-type": "application/json", ...auth(cookies) });

async function signIn(email: string): Promise<string> {
  const db = env.DB as D1Database;
  await SELF.fetch(`${B}/api/auth/email-otp/send-verification-otp`, {
    method: "POST", headers: { "content-type": "application/json", origin: B },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const row = await db.prepare("SELECT value FROM verification ORDER BY createdAt DESC LIMIT 1").first<{ value: string }>();
  const otp = ((row?.value ?? "").match(/\d{6}/) ?? [])[0];
  if (!otp) throw new Error("could not read OTP from verification table");
  return grabCookies(await SELF.fetch(`${B}/api/auth/sign-in/email-otp`, {
    method: "POST", headers: { "content-type": "application/json", origin: B },
    body: JSON.stringify({ email, otp }),
  }));
}

async function studio(tag: string, planId = "pro") {
  let owner = await signIn(`${tag}-owner@test.dev`);
  const org = await SELF.fetch(`${B}/api/auth/organization/create`, {
    method: "POST", headers: J(owner),
    body: JSON.stringify({ name: `${tag} Studio`, slug: tag.toLowerCase().replace(/[^a-z0-9]+/g, "-") }),
  });
  const refreshed = grabCookies(org);
  if (refreshed) owner = refreshed;
  const tenantId = ((await (await SELF.fetch(`${B}/api/context`, { headers: auth(owner) })).json()) as { active: { tenantId: string } }).active.tenantId;
  expect((await SELF.fetch(`${ADMIN}/api/admin/tenants/${tenantId}/plan`, { method: "POST", headers: J(owner), body: JSON.stringify({ planId }) })).status).toBe(200);
  return { owner, tenantId };
}

interface Trace<T> { value: T; plan: T; source: string }
interface EntBody {
  planId: string;
  effective: { quotas: Record<string, number>; features: Record<string, boolean>; aiCredits: { monthlyGrant: number } };
  quotas: Record<string, Trace<number>>;
  features: Record<string, Trace<boolean>>;
  aiCredits: Trace<number>;
}
const readEnt = async (cookies: string, tenantId: string): Promise<EntBody> =>
  (await (await SELF.fetch(`${ADMIN}/api/admin/tenants/${tenantId}/entitlements`, { headers: auth(cookies) })).json()) as EntBody;
const patchEnt = (cookies: string, tenantId: string, body: unknown) =>
  SELF.fetch(`${ADMIN}/api/admin/tenants/${tenantId}/overrides`, { method: "PATCH", headers: J(cookies), body: JSON.stringify(body) });

beforeAll(async () => { await ensureSchema(env.DB as D1Database); });

describe("an operator can lower a tenant's limit", () => {
  it("reduces a quota below the plan, and the GATE honours it", async () => {
    const w = await studio("entdown");
    const before = await readEnt(w.owner, w.tenantId);
    expect(before.quotas.activeClients!.value).toBe(100);

    expect((await patchEnt(w.owner, w.tenantId, { adjustments: { quotas: { activeClients: 1 } } })).status).toBe(200);
    const after = await readEnt(w.owner, w.tenantId);
    expect(after.quotas.activeClients).toMatchObject({ value: 1, plan: 100, source: "adjusted" });

    // The gate is the point. One client fits; the second is refused.
    const first = await SELF.fetch(`${B}/api/clients`, { method: "POST", headers: J(w.owner), body: JSON.stringify({ displayName: "One" }) });
    expect(first.status).toBeLessThan(300);
    const second = await SELF.fetch(`${B}/api/clients`, { method: "POST", headers: J(w.owner), body: JSON.stringify({ displayName: "Two" }) });
    expect(second.status).toBe(403);
  });

  it("turns a feature OFF that the plan turns on, and the route 403s", async () => {
    const w = await studio("entoff");
    expect((await patchEnt(w.owner, w.tenantId, { adjustments: { features: { commerce: false } } })).status).toBe(200);
    const res = await SELF.fetch(`${B}/api/packages`, {
      method: "POST", headers: J(w.owner),
      body: JSON.stringify({ name: "Pack", budgets: [{ feature: "all", days: 30 }] }),
    });
    expect(res.status).toBe(403);
  });

  it("REVERSES an unlimited grant — the case the old lane could not undo", async () => {
    const w = await studio("entunlimited");
    await patchEnt(w.owner, w.tenantId, { grants: { quotas: { activeClients: -1 } } });
    expect((await readEnt(w.owner, w.tenantId)).quotas.activeClients!.value).toBe(-1);
    // The grant lane cannot walk this back — `raiseQuota` treats -1 as absorbing.
    await patchEnt(w.owner, w.tenantId, { grants: { quotas: { activeClients: 5 } } });
    expect((await readEnt(w.owner, w.tenantId)).quotas.activeClients!.value).toBe(-1);
    // The adjustment lane can.
    await patchEnt(w.owner, w.tenantId, { adjustments: { quotas: { activeClients: 5 } } });
    expect((await readEnt(w.owner, w.tenantId)).quotas.activeClients!.value).toBe(5);
  });
});

describe("an adjustment sits on top of grandfathering, never through it", () => {
  it("clearing one key returns to the GRANDFATHERED value, not the plan's", async () => {
    const w = await studio("entgrand");
    // A plan edit grandfathered them to 12 seats (this is what snapshotDowngrade
    // writes; the route's `grants` lane is the same write).
    await patchEnt(w.owner, w.tenantId, { grants: { quotas: { staffSeats: 12 } } });
    expect((await readEnt(w.owner, w.tenantId)).quotas.staffSeats).toMatchObject({ value: 12, source: "grandfathered" });

    // An operator pins them to 3 for support reasons…
    await patchEnt(w.owner, w.tenantId, { adjustments: { quotas: { staffSeats: 3 } } });
    expect((await readEnt(w.owner, w.tenantId)).quotas.staffSeats).toMatchObject({ value: 3, source: "adjusted" });

    // …and undoing that restores 12, NOT the plan's 5. This is the whole reason
    // the two lanes are separate columns.
    await patchEnt(w.owner, w.tenantId, { adjustments: { quotas: { staffSeats: null } } });
    expect((await readEnt(w.owner, w.tenantId)).quotas.staffSeats).toMatchObject({ value: 12, source: "grandfathered" });
  });

  it("reset clears BOTH lanes — deliberately, and it is the only thing that does", async () => {
    const w = await studio("entreset");
    await patchEnt(w.owner, w.tenantId, { grants: { quotas: { staffSeats: 12 } } });
    await patchEnt(w.owner, w.tenantId, { adjustments: { features: { commerce: false } } });
    expect((await patchEnt(w.owner, w.tenantId, { reset: true })).status).toBe(200);
    const after = await readEnt(w.owner, w.tenantId);
    expect(after.quotas.staffSeats).toMatchObject({ value: 5, source: "plan" });
    expect(after.features.commerce).toMatchObject({ value: true, source: "plan" });
  });
});

describe("the route refuses what it cannot honour", () => {
  it("rejects an unknown entitlement key instead of storing it", async () => {
    const w = await studio("entunknown");
    expect((await patchEnt(w.owner, w.tenantId, { adjustments: { quotas: { notAThing: 5 } } })).status).toBe(400);
    expect((await patchEnt(w.owner, w.tenantId, { adjustments: { features: { alsoNotAThing: true } } })).status).toBe(400);
  });

  it("a suspended studio still clamps to free, whatever the adjustment says", async () => {
    const w = await studio("entsuspended");
    await patchEnt(w.owner, w.tenantId, { adjustments: { quotas: { activeClients: 9_000 } } });
    await (env.DB as D1Database).prepare("UPDATE subscriptions SET status = 'suspended' WHERE tenant_id = ?").bind(w.tenantId).run();
    // The clamp is the LAST word — an adjustment cannot buy a delinquent tenant
    // back into service.
    const ctx = (await (await SELF.fetch(`${B}/api/context`, { headers: auth(w.owner) })).json()) as { entitlements: { quotas: { activeClients: number } } };
    expect(ctx.entitlements.quotas.activeClients).toBe(3); // the free baseline
  });
});
