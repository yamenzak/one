/**
 * PER-CLIENT capability overrides, end to end.
 *
 * A coach wants one client on the Pro package to also get AI insights, without
 * minting a near-duplicate package to hold the difference. `overrides_json` is
 * that exception — a sparse diff over whatever the package sells.
 *
 * Two things matter more than the happy path, and both are asserted here:
 *
 *   the CLIENT must never be able to write one. `requireClientAccess` admits a
 *   client reading their own record, so the route's own role check is the wall
 *   — and it is the wall that gets tested, because the action gate in
 *   route-guard.ts is invisible to this suite (AGENTS.md §4).
 *
 *   an override must not outrun the two gates BELOW it. It may hand a client a
 *   capability the package omitted; it may not conjure days that expired or a
 *   feature the studio's own Kova plan does not carry.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";

const B = "http://setup.localhost:8787";

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

interface Capability { key: string; value: boolean; source: string; granted: boolean; blockedBy: string | null; override: boolean | null }
interface CapRow { subscriptionId: string; packageName: string | null; capabilities: Capability[] }

/**
 * A `pro` studio, a client, a package with `flags`, and both sessions.
 *
 * `downgradeTo` moves the studio's OWN plan after the package is sold, which is
 * the only way to reach the entitlement blocker: no stock plan carries
 * `commerce` without also carrying `bfCamera` and `aiSuite`, so a studio that
 * could never have sold the package cannot be set up directly. It is also the
 * real scenario — a studio drops to a cheaper plan and its clients lose a
 * capability they were sold.
 */
async function world(tag: string, flags: Record<string, boolean>, budgets = [{ feature: "all", days: 30 }], downgradeTo?: string) {
  let owner = await signIn(`${tag}-owner@test.dev`);
  const org = await SELF.fetch(`${B}/api/auth/organization/create`, {
    method: "POST", headers: J(owner),
    body: JSON.stringify({ name: `${tag} Studio`, slug: tag.toLowerCase().replace(/[^a-z0-9]+/g, "-") }),
  });
  const refreshed = grabCookies(org);
  if (refreshed) owner = refreshed;
  const tenantId = ((await (await SELF.fetch(`${B}/api/context`, { headers: auth(owner) })).json()) as { active: { tenantId: string } }).active.tenantId;
  expect((await SELF.fetch(`${B}/api/admin/tenants/${tenantId}/plan`, { method: "POST", headers: J(owner), body: JSON.stringify({ planId: "pro" }) })).status).toBe(200);

  const email = `${tag}-client@test.dev`;
  const created = await SELF.fetch(`${B}/api/clients`, { method: "POST", headers: J(owner), body: JSON.stringify({ displayName: `${tag} Client`, email }) });
  const clientId = ((await created.json()) as { client: { id: string } }).client.id;

  const pkg = await SELF.fetch(`${B}/api/packages`, {
    method: "POST", headers: J(owner), body: JSON.stringify({ name: `${tag} Pack`, budgets, flags }),
  });
  expect(pkg.status).toBe(201);
  const packageId = ((await pkg.json()) as { id: string }).id;
  expect((await SELF.fetch(`${B}/api/subscriptions/grant`, { method: "POST", headers: J(owner), body: JSON.stringify({ clientId, packageId }) })).status).toBeLessThan(300);

  if (downgradeTo) {
    expect((await SELF.fetch(`${B}/api/admin/tenants/${tenantId}/plan`, { method: "POST", headers: J(owner), body: JSON.stringify({ planId: downgradeTo }) })).status).toBe(200);
  }

  const client = await signIn(email);
  await SELF.fetch(`${B}/api/context`, { headers: auth(client) });
  await SELF.fetch(`${B}/api/context/switch`, { method: "POST", headers: J(client), body: JSON.stringify({ tenantId }) });
  return { owner, client, clientId, tenantId };
}

const caps = async (cookies: string, clientId: string): Promise<CapRow[]> =>
  ((await (await SELF.fetch(`${B}/api/subscriptions/capabilities?clientId=${clientId}`, { headers: auth(cookies) })).json()) as { rows: CapRow[] }).rows;
const capOf = (row: CapRow, key: string) => row.capabilities.find((c) => c.key === key)!;
const setOverride = (cookies: string, subId: string, overrides: Record<string, boolean | null>) =>
  SELF.fetch(`${B}/api/subscriptions/${subId}/overrides`, { method: "PATCH", headers: J(cookies), body: JSON.stringify({ overrides }) });

beforeAll(async () => { await ensureSchema(env.DB as D1Database); });

describe("a coach can see what each client actually has", () => {
  it("reports every capability with its source", async () => {
    const w = await world("capview", { canViewExerciseReport: false });
    const rows = await caps(w.owner, w.clientId);
    expect(rows.length).toBe(1);
    expect(rows[0]!.packageName).toBe("capview Pack");
    expect(capOf(rows[0]!, "canViewExerciseReport")).toMatchObject({ value: false, source: "package", override: null });
    expect(capOf(rows[0]!, "canLogSleep")).toMatchObject({ value: true, source: "default" });
  });

  it("says WHY a capability is off, not just that it is", async () => {
    // A workout-only package: the meal capabilities have no covering days.
    const w = await world("capwhy", {}, [{ feature: "workout", days: 30 }]);
    const row = (await caps(w.owner, w.clientId))[0]!;
    expect(capOf(row, "canAccessMealPlan")).toMatchObject({ value: false, granted: true, blockedBy: "budget" });
  });

  it("reports the entitlement blocker on a studio whose plan lacks the feature", async () => {
    // Sold on `pro`, then the studio drops to `solo` — which carries aiSuite but
    // not bfCamera. The body scan is now blocked by what the STUDIO holds, which
    // is a different fix from anything per-client.
    const w = await world("capent", {}, [{ feature: "all", days: 30 }], "solo");
    const row = (await caps(w.owner, w.clientId))[0]!;
    expect(capOf(row, "canUseBodyScan")).toMatchObject({ value: false, blockedBy: "entitlement" });
  });

  it("is closed to the client themselves", async () => {
    const w = await world("capclient", {});
    expect((await SELF.fetch(`${B}/api/subscriptions/capabilities?clientId=${w.clientId}`, { headers: auth(w.client) })).status).toBe(403);
  });
});

describe("a coach can override one capability for one client", () => {
  it("grants what the package left off, and says it was set for them", async () => {
    const w = await world("ovon", { canViewExerciseReport: false });
    const before = (await caps(w.owner, w.clientId))[0]!;
    expect((await setOverride(w.owner, before.subscriptionId, { canViewExerciseReport: true })).status).toBe(200);

    const after = (await caps(w.owner, w.clientId))[0]!;
    expect(capOf(after, "canViewExerciseReport")).toMatchObject({ value: true, source: "override", override: true });
    // And the ROUTES agree — the whole point. The strength lens is shaped by
    // this flag (see report-shaping.test.ts).
    const p = (await (await SELF.fetch(`${B}/api/progress/${w.clientId}?range=30d&today=2026-05-04`, { headers: auth(w.client) })).json()) as { included: { training: boolean } };
    expect(p.included.training).toBe(true);
  });

  it("takes away what the package included", async () => {
    const w = await world("ovoff", {});
    const row = (await caps(w.owner, w.clientId))[0]!;
    expect((await setOverride(w.owner, row.subscriptionId, { canLogOwnFood: false })).status).toBe(200);
    // Enforced, not just displayed: /logs/food gates on `foodLogging`.
    const post = await SELF.fetch(`${B}/api/logs/food`, {
      method: "POST", headers: J(w.client),
      body: JSON.stringify({ clientId: w.clientId, data: { date: "2026-05-04", mealType: "snack", label: "Apple", calories: 90, proteinG: 0, carbsG: 24, fatG: 0 } }),
    });
    expect(post.status).toBe(403);
  });

  it("RESETS to the package with null, rather than guessing what it said", async () => {
    const w = await world("ovreset", { canTrackFasting: false });
    const row = (await caps(w.owner, w.clientId))[0]!;
    await setOverride(w.owner, row.subscriptionId, { canTrackFasting: true });
    expect(capOf((await caps(w.owner, w.clientId))[0]!, "canTrackFasting")).toMatchObject({ value: true, override: true });

    expect((await setOverride(w.owner, row.subscriptionId, { canTrackFasting: null })).status).toBe(200);
    expect(capOf((await caps(w.owner, w.clientId))[0]!, "canTrackFasting")).toMatchObject({ value: false, source: "package", override: null });
  });

  it("does NOT touch the package, so every other client is unaffected", async () => {
    const w = await world("ovpkg", { canViewExerciseReport: false });
    const row = (await caps(w.owner, w.clientId))[0]!;
    await setOverride(w.owner, row.subscriptionId, { canViewExerciseReport: true });
    const pkgs = (await (await SELF.fetch(`${B}/api/packages`, { headers: auth(w.owner) })).json()) as { packages: { name: string; flags: Record<string, boolean> | null }[] };
    const pack = pkgs.packages.find((p) => p.name === "ovpkg Pack")!;
    expect(pack.flags?.canViewExerciseReport).toBe(false);
  });

  it("cannot conjure days that expired — the budget gate still wins", async () => {
    const w = await world("ovbudget", {}, [{ feature: "workout", days: 30 }]);
    const row = (await caps(w.owner, w.clientId))[0]!;
    const res = await setOverride(w.owner, row.subscriptionId, { canAccessMealPlan: true });
    expect(res.status).toBe(200);
    // Stored, and overruled — reported honestly rather than as a success the
    // client will never see.
    const after = capOf((await caps(w.owner, w.clientId))[0]!, "canAccessMealPlan");
    expect(after).toMatchObject({ value: false, granted: true, blockedBy: "budget", override: true });
  });

  it("cannot outrun the studio's own plan", async () => {
    const w = await world("ovent", {}, [{ feature: "all", days: 30 }], "solo"); // no bfCamera
    const row = (await caps(w.owner, w.clientId))[0]!;
    expect((await setOverride(w.owner, row.subscriptionId, { canUseBodyScan: true })).status).toBe(200);
    expect(capOf((await caps(w.owner, w.clientId))[0]!, "canUseBodyScan")).toMatchObject({ value: false, blockedBy: "entitlement" });
  });

  it("refuses a RESERVED capability rather than storing a promise it can't keep", async () => {
    const w = await world("ovreserved", {});
    const row = (await caps(w.owner, w.clientId))[0]!;
    const res = await setOverride(w.owner, row.subscriptionId, { canReorderExercises: true });
    expect(res.status).toBe(400);
  });

  it("REFUSES THE CLIENT — a client cannot grant themselves a capability", async () => {
    const w = await world("ovescalate", { canViewExerciseReport: false, canLogOwnFood: false });
    const row = (await caps(w.owner, w.clientId))[0]!;
    const res = await setOverride(w.client, row.subscriptionId, { canViewExerciseReport: true, canLogOwnFood: true });
    expect(res.status).toBe(403);
    // …and nothing was written.
    expect(capOf((await caps(w.owner, w.clientId))[0]!, "canViewExerciseReport")).toMatchObject({ value: false, override: null });
  });

  it("refuses a subscription belonging to another studio", async () => {
    const a = await world("ovtenanta", {});
    const b = await world("ovtenantb", {});
    const bRow = (await caps(b.owner, b.clientId))[0]!;
    expect((await setOverride(a.owner, bRow.subscriptionId, { canLogWater: false })).status).toBe(404);
  });
});
