/**
 * THE ACCESS ECONOMY, AGAINST THE FIVE WAYS IT WAS WRONG.
 *
 * Every test here reproduces a defect that reached production and cost real
 * customers real days. They are written as the symptom first, because that is
 * how each one was reported:
 *
 *   "once per customer doesn't apply"    A repeat grant FOLDS into the client's
 *                                        live subscription row, which keeps the
 *                                        FIRST package's `package_id`. The rule
 *                                        asked "is there a row with package_id =
 *                                        X" and got `no` forever, so a once-only
 *                                        package could be applied without limit.
 *   "weird numbers of days"              The consequence of the above: the same
 *                                        package stacking, four times over.
 *   "package failing to be granted"      A raced-out CAS on the extend path was
 *                                        discarded — 200 OK, an audit row, a
 *                                        notification, and zero days.
 *   "redeem a code without a package"    `/redeem` minted a subscription from
 *                                        nothing, and a client may call it for
 *                                        themselves.
 *   (found on the way) `clientId: undefined` on every subscription, because the
 *                      row interface named a column the table does not have.
 *
 * Plus the repair route the owner needs when the numbers are already wrong.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";

const ORIGIN = "http://setup.localhost:8787";
const ADMIN = "http://admin.localhost:8787";

let ownerCookie = "";
let tenantId = "";

function grabCookies(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() ?? []).map((c: string) => c.split(";")[0]).join("; ");
}

async function signInFlow(email: string, studioName: string): Promise<string> {
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
  let cookies = grabCookies(verify);
  const org = await SELF.fetch(`${ORIGIN}/api/auth/organization/create`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, Cookie: cookies },
    body: JSON.stringify({ name: studioName, slug: studioName.toLowerCase().replace(/[^a-z0-9]+/g, "-") }),
  });
  const refreshed = grabCookies(org);
  if (refreshed) cookies = refreshed;
  return cookies;
}

const auth = () => ({ Cookie: ownerCookie, origin: ORIGIN });
const H = () => ({ "content-type": "application/json", ...auth() });

const createPackage = async (body: Record<string, unknown>): Promise<string> => {
  const res = await SELF.fetch(`${ORIGIN}/api/packages`, { method: "POST", headers: H(), body: JSON.stringify(body) });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
};

const newClient = async (name: string): Promise<string> => {
  const res = await SELF.fetch(`${ORIGIN}/api/clients`, { method: "POST", headers: H(), body: JSON.stringify({ displayName: name }) });
  return ((await res.json()) as { client: { id: string } }).client.id;
};

const grant = (clientId: string, packageId: string) =>
  SELF.fetch(`${ORIGIN}/api/subscriptions/grant`, { method: "POST", headers: H(), body: JSON.stringify({ clientId, packageId }) });

interface SubView {
  id: string; clientId: string; packageId: string | null; status: string;
  daysRemaining: number; daysByFeature: Record<string, number>;
}
const subscriptions = async (clientId: string): Promise<SubView[]> =>
  ((await (await SELF.fetch(`${ORIGIN}/api/subscriptions?clientId=${clientId}`, { headers: auth() })).json()) as { subscriptions: SubView[] }).subscriptions;

const days = async (clientId: string): Promise<number> => (await subscriptions(clientId))[0]?.daysRemaining ?? 0;

const setDays = (subId: string, body: Record<string, unknown>) =>
  SELF.fetch(`${ORIGIN}/api/subscriptions/${subId}/days`, { method: "POST", headers: H(), body: JSON.stringify(body) });

beforeAll(async () => {
  await ensureSchema(env.DB as D1Database);
  ownerCookie = await signInFlow("accessowner@test.dev", "Access Studio");
  const ctx = (await (await SELF.fetch(`${ORIGIN}/api/context`, { headers: auth() })).json()) as { active: { tenantId: string } };
  tenantId = ctx.active.tenantId;
  await SELF.fetch(`${ADMIN}/api/admin/tenants/${tenantId}/plan`, { method: "POST", headers: H(), body: JSON.stringify({ planId: "team" }) });
});

describe("once per customer holds on the SECOND package, not just the first", () => {
  it("refuses a repeat grant even when the days folded into someone else's row", async () => {
    const client = await newClient("Repeat Grant");
    // The setup that broke it: a first package opens the row and OWNS its
    // `package_id`. The once-only one then extends that row, leaving no trace of
    // itself anywhere the old check could look.
    const opener = await createPackage({ name: "Starter block", budgets: [{ feature: "workout", days: 10 }] });
    const intro = await createPackage({ name: "Intro offer", budgets: [{ feature: "workout", days: 30 }], oncePerCustomer: true });

    expect((await grant(client, opener)).status).toBe(201);
    expect((await grant(client, intro)).status).toBe(200); // extended the existing row
    const second = await grant(client, intro);
    expect(second.status).toBe(409);
    expect((await second.json()) as { error: string }).toEqual({ error: "package is once per customer" });
  });

  it("still refuses a repeat when the once-only package OPENED the row (the case that always worked)", async () => {
    const client = await newClient("First Grant");
    const intro = await createPackage({ name: "Intro only", budgets: [{ feature: "workout", days: 30 }], oncePerCustomer: true });
    expect((await grant(client, intro)).status).toBe(201);
    expect((await grant(client, intro)).status).toBe(409);
  });

  it("does not stack a once-only package into an impossible day count", async () => {
    const client = await newClient("Impossible Days");
    const opener = await createPackage({ name: "Base", budgets: [{ feature: "workout", days: 10 }] });
    const intro = await createPackage({ name: "Bonus 90", budgets: [{ feature: "workout", days: 90 }], oncePerCustomer: true });
    await grant(client, opener);
    await grant(client, intro);
    // Four more attempts. Before the ledger every one of them landed: 10 + 90×5.
    for (let i = 0; i < 4; i++) expect((await grant(client, intro)).status).toBe(409);
    expect(await days(client)).toBe(100);
  });
});

describe("a grant either happens or says it didn't", () => {
  it("reports the package and the days it actually applied", async () => {
    const client = await newClient("Honest Grant");
    const pkg = await createPackage({ name: "Twelve weeks", budgets: [{ feature: "all", days: 84 }] });
    const res = await grant(client, pkg);
    expect(res.status).toBe(201);
    const subs = await subscriptions(client);
    expect(subs[0]!.daysRemaining).toBe(84);
    // The wildcard expands per scope, so BOTH are covered — a single queued
    // `all` budget would have left one of them at zero.
    expect(subs[0]!.daysByFeature).toEqual({ workout: 84, meal: 84 });
  });

  it("names the client the subscription belongs to", async () => {
    // `SubRow` declared `client_id`; the column is `subject_id`. Every
    // subscription therefore reported `clientId: undefined`.
    const client = await newClient("Named Client");
    const pkg = await createPackage({ name: "Named", budgets: [{ feature: "workout", days: 7 }] });
    await grant(client, pkg);
    expect((await subscriptions(client))[0]!.clientId).toBe(client);
  });
});

describe("a redemption code tops access up — it does not create it", () => {
  const makeCode = (code: string, body: Record<string, unknown> = {}) =>
    SELF.fetch(`${ORIGIN}/api/redemption-codes`, { method: "POST", headers: H(), body: JSON.stringify({ code, daysToAdd: 30, ...body }) });
  const redeem = (clientId: string, code: string) =>
    SELF.fetch(`${ORIGIN}/api/redeem`, { method: "POST", headers: H(), body: JSON.stringify({ clientId, code }) });

  it("refuses a client who holds no package at all", async () => {
    const client = await newClient("No Package");
    await makeCode("NAKED30");
    const res = await redeem(client, "NAKED30");
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/package you already have/i);
    expect(await subscriptions(client)).toHaveLength(0);
  });

  it("does not burn a use slot on a refusal", async () => {
    const client = await newClient("No Package Two");
    await makeCode("NAKED31", { maxUses: 1 });
    expect((await redeem(client, "NAKED31")).status).toBe(409);
    // The slot survived, so a client who DOES hold a package can still use it.
    const holder = await newClient("Package Holder");
    const pkg = await createPackage({ name: "Backing", budgets: [{ feature: "workout", days: 5 }] });
    await grant(holder, pkg);
    expect((await redeem(holder, "NAKED31")).status).toBe(200);
  });

  it("tops up a client who does hold one, queued behind their runway", async () => {
    const client = await newClient("Top Up");
    const pkg = await createPackage({ name: "Ten days", budgets: [{ feature: "workout", days: 10 }] });
    await grant(client, pkg);
    await makeCode("TOPUP20", { daysToAdd: 20, targetFeature: "workout" });
    expect((await redeem(client, "TOPUP20")).status).toBe(200);
    expect(await days(client)).toBe(30); // queued, not pooled
  });

  it("tops up a LAPSED client — that is what these codes are for", async () => {
    const client = await newClient("Lapsed");
    const pkg = await createPackage({ name: "Short", budgets: [{ feature: "workout", days: 1 }] });
    await grant(client, pkg);
    const sub = (await subscriptions(client))[0]!;
    // Run the runway out without touching the code path.
    await (env.DB as D1Database).prepare("UPDATE subject_subscriptions SET budgets_json = '[]', status = 'expired' WHERE id = ?").bind(sub.id).run();
    await makeCode("REVIVE14", { daysToAdd: 14, targetFeature: "workout" });
    expect((await redeem(client, "REVIVE14")).status).toBe(200);
    expect(await days(client)).toBe(14);
    expect((await subscriptions(client))[0]!.status).toBe("active");
  });
});

describe("the owner can correct the days when they are already wrong", () => {
  it("sets a scope to exactly the number given, collapsing a stacked runway", async () => {
    const client = await newClient("Correct Me");
    const pkg = await createPackage({ name: "Stacker", budgets: [{ feature: "workout", days: 60 }] });
    await grant(client, pkg);
    await grant(client, pkg); // not once-only, so this legitimately stacks
    await grant(client, pkg);
    expect(await days(client)).toBe(180);

    const sub = (await subscriptions(client))[0]!;
    const res = await setDays(sub.id, { feature: "workout", days: 30, reason: "granted three times by mistake" });
    expect(res.status).toBe(200);
    expect(await days(client)).toBe(30);
  });

  it("sets every scope at once through the wildcard", async () => {
    const client = await newClient("Correct All");
    const pkg = await createPackage({ name: "Both", budgets: [{ feature: "all", days: 200 }] });
    await grant(client, pkg);
    const sub = (await subscriptions(client))[0]!;
    expect((await setDays(sub.id, { feature: "all", days: 14, reason: "billing dispute" })).status).toBe(200);
    expect((await subscriptions(client))[0]!.daysByFeature).toEqual({ workout: 14, meal: 14 });
  });

  it("re-opens an expired subscription when days are put back", async () => {
    const client = await newClient("Revive By Hand");
    const pkg = await createPackage({ name: "Gone", budgets: [{ feature: "workout", days: 1 }] });
    await grant(client, pkg);
    const sub = (await subscriptions(client))[0]!;
    await (env.DB as D1Database).prepare("UPDATE subject_subscriptions SET budgets_json = '[]', status = 'expired' WHERE id = ?").bind(sub.id).run();
    expect((await setDays(sub.id, { feature: "workout", days: 21, reason: "goodwill" })).status).toBe(200);
    const after = (await subscriptions(client))[0]!;
    expect(after.status).toBe("active");
    expect(after.daysRemaining).toBe(21);
  });

  it("zero takes the access away without erasing what was sold", async () => {
    const client = await newClient("Zeroed");
    const pkg = await createPackage({ name: "Revoke", budgets: [{ feature: "workout", days: 40 }] });
    await grant(client, pkg);
    const sub = (await subscriptions(client))[0]!;
    expect((await setDays(sub.id, { feature: "workout", days: 0, reason: "refunded in full" })).status).toBe(200);
    expect(await days(client)).toBe(0);
  });

  it("insists on a reason", async () => {
    const client = await newClient("No Reason");
    const pkg = await createPackage({ name: "Whatever", budgets: [{ feature: "workout", days: 10 }] });
    await grant(client, pkg);
    const sub = (await subscriptions(client))[0]!;
    expect((await setDays(sub.id, { feature: "workout", days: 5 })).status).toBe(400);
    expect((await setDays(sub.id, { feature: "workout", days: 5, reason: "ok" })).status).toBe(400); // under the floor
  });

  it("writes an audit line naming the before, the after and the reason", async () => {
    const client = await newClient("Audited");
    const pkg = await createPackage({ name: "Audit me", budgets: [{ feature: "workout", days: 90 }] });
    await grant(client, pkg);
    const sub = (await subscriptions(client))[0]!;
    await setDays(sub.id, { feature: "workout", days: 30, reason: "duplicate webhook" });
    const row = await (env.DB as D1Database)
      .prepare("SELECT summary FROM audit_log WHERE client_id = ? AND action = 'access.days_set' ORDER BY at DESC LIMIT 1")
      .bind(client)
      .first<{ summary: string }>();
    expect(row?.summary).toContain("was 90");
    expect(row?.summary).toContain("duplicate webhook");
  });

  it("refuses another studio's subscription", async () => {
    const client = await newClient("Mine");
    const pkg = await createPackage({ name: "Mine", budgets: [{ feature: "workout", days: 10 }] });
    await grant(client, pkg);
    const sub = (await subscriptions(client))[0]!;
    const rival = await signInFlow("accessrival@test.dev", "Rival Access Studio");
    const res = await SELF.fetch(`${ORIGIN}/api/subscriptions/${sub.id}/days`, {
      method: "POST",
      headers: { "content-type": "application/json", Cookie: rival, origin: ORIGIN },
      body: JSON.stringify({ feature: "workout", days: 999, reason: "not mine to change" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("the grant history explains where the days came from", () => {
  it("lists every package applied, not just the one that opened the row", async () => {
    const client = await newClient("History");
    const a = await createPackage({ name: "First up", budgets: [{ feature: "workout", days: 10 }] });
    const b = await createPackage({ name: "Second up", budgets: [{ feature: "workout", days: 20 }] });
    await grant(client, a);
    await grant(client, b);
    const res = await SELF.fetch(`${ORIGIN}/api/subscriptions/history?clientId=${client}`, { headers: auth() });
    const { grants } = (await res.json()) as { grants: { packageName: string; source: string }[] };
    expect(grants.map((g) => g.packageName).sort()).toEqual(["First up", "Second up"]);
    expect(grants.every((g) => g.source === "admin")).toBe(true);
  });
});
