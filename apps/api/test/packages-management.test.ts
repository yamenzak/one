/**
 * Package management (SPEC §7) — the edit + archive lanes on `/api/packages`.
 *
 * `PATCH /packages/:id` and `DELETE /packages/:id` shipped with zero UI callers,
 * so nothing ever exercised them: an owner who mistyped a price or a budget-day
 * count had a bad package selling on every client's Shop with no way back. These
 * tests pin the semantics the new Packages UI is built against:
 *
 *   - PATCH is a genuine partial update (omitted columns keep their value), and
 *     the `addons_json` / `flags_json` / `visibility` / `once_per_customer`
 *     branches all write.
 *   - DELETE is an ARCHIVE (`active = 0`), not an erase. The package leaves the
 *     live catalogue and stops being grantable, but `subject_subscriptions` rows
 *     are untouched — an existing buyer keeps every day they paid for.
 *   - PATCH `{ active: true }` is the only way back on sale.
 *
 * Auth follows api.test.ts: a real passwordless sign-in, then the session cookie.
 * Note the harness makes every signed-in user a platform admin (see AGENTS.md
 * §4), so action-gate 403s are NOT observable here — tenant scoping is.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";

const ORIGIN = "http://setup.localhost:8787";
/**
 * The OPERATOR door. `/api/admin/*` answers here and nowhere else in production —
 * a studio's subdomain must not reach platform administration even with a live
 * operator cookie, because that cookie is now valid across every host under the
 * root. Dev has a single root and therefore no separate door, so the restriction
 * stands down on loopback (`isDevRoot`) — but the suite addresses the real door
 * anyway, so a regression in that guard fails here rather than in production.
 */
const ADMIN = "http://admin.localhost:8787";

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
const H = (cookies: string = ownerCookie) => ({ "content-type": "application/json", ...auth(cookies) });

interface PkgRow {
  id: string;
  name: string;
  description: string | null;
  one_time_price_cents: number | null;
  monthly_price_cents: number | null;
  installment_months: number | null;
  budgets: { feature: string; days: number }[];
  addOns: { addOnTypeId: string; quantity: number }[];
  flags: Record<string, boolean> | null;
  visibility: string;
  once_per_customer: number;
  active: number;
}

const listPackages = async (archived = false, cookies: string = ownerCookie): Promise<PkgRow[]> =>
  ((await (await SELF.fetch(`${ORIGIN}/api/packages${archived ? "?archived=1" : ""}`, { headers: auth(cookies) })).json()) as { packages: PkgRow[] }).packages;

const readPackage = async (id: string, archived = false): Promise<PkgRow> => {
  const found = (await listPackages(archived)).find((p) => p.id === id);
  if (!found) throw new Error(`package ${id} not on the ${archived ? "archived" : "live"} list`);
  return found;
};

async function createPackage(body: Record<string, unknown>): Promise<string> {
  const res = await SELF.fetch(`${ORIGIN}/api/packages`, { method: "POST", headers: H(), body: JSON.stringify(body) });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const patchPackage = (id: string, body: Record<string, unknown>, cookies: string = ownerCookie) =>
  SELF.fetch(`${ORIGIN}/api/packages/${id}`, { method: "PATCH", headers: H(cookies), body: JSON.stringify(body) });

const deletePackage = (id: string, cookies: string = ownerCookie) =>
  SELF.fetch(`${ORIGIN}/api/packages/${id}`, { method: "DELETE", headers: auth(cookies) });

async function newClient(name: string): Promise<string> {
  const res = await SELF.fetch(`${ORIGIN}/api/clients`, { method: "POST", headers: H(), body: JSON.stringify({ displayName: name }) });
  return ((await res.json()) as { client: { id: string } }).client.id;
}

interface SubView { id: string; packageId: string | null; packageName: string | null; status: string; daysRemaining: number }
const subscriptions = async (clientId: string): Promise<SubView[]> =>
  ((await (await SELF.fetch(`${ORIGIN}/api/subscriptions?clientId=${clientId}`, { headers: auth(ownerCookie) })).json()) as { subscriptions: SubView[] }).subscriptions;

const grant = (clientId: string, packageId: string) =>
  SELF.fetch(`${ORIGIN}/api/subscriptions/grant`, { method: "POST", headers: H(), body: JSON.stringify({ clientId, packageId }) });

beforeAll(async () => {
  await ensureSchema(env.DB as D1Database);
  ownerCookie = await signInFlow("pkgowner@test.dev", "Package Studio");
  otherCookie = await signInFlow("pkgrival@test.dev", "Rival Studio");
  // The `commerce` entitlement gates POST /packages; the top plan opens it.
  const ctx = (await (await SELF.fetch(`${ORIGIN}/api/context`, { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
  await SELF.fetch(`${ADMIN}/api/admin/tenants/${ctx.active.tenantId}/plan`, {
    method: "POST",
    headers: H(),
    body: JSON.stringify({ planId: "team" }),
  });
});

describe("packages — editing an existing package (PATCH)", () => {
  it("updates the price and the budgets, and the change is what a read returns", async () => {
    const id = await createPackage({ name: "Transformation", oneTimePriceCents: 24900, budgets: [{ feature: "all", days: 30 }], visibility: "marketplace" });
    expect((await readPackage(id)).one_time_price_cents).toBe(24900);

    const res = await patchPackage(id, { oneTimePriceCents: 19900, budgets: [{ feature: "workout", days: 45 }, { feature: "meal", days: 60 }] });
    expect(res.status).toBe(200);

    const after = await readPackage(id);
    expect(after.one_time_price_cents).toBe(19900);
    expect(after.budgets).toEqual([{ feature: "workout", days: 45 }, { feature: "meal", days: 60 }]);
    // Untouched columns survive the update.
    expect(after.name).toBe("Transformation");
    expect(after.visibility).toBe("marketplace");
  });

  /**
   * The regression this guards: `PackageBody.partial()` leaves zod's
   * `.default()` in place under the `.optional()`, so `budgets` (`[]`),
   * `visibility` (`private`) and `oncePerCustomer` (`false`) materialised on
   * EVERY patch. A rename therefore wiped the budgets, pulled the package out of
   * the client Shop, and cleared once-per-customer — silently, with a 200.
   */
  it("is a true partial update — a rename leaves budgets, visibility and oncePerCustomer alone", async () => {
    const id = await createPackage({
      name: "Starter", description: "The intro block", oneTimePriceCents: 5000,
      budgets: [{ feature: "all", days: 30 }], flags: { aiInsights: true },
      visibility: "marketplace", oncePerCustomer: true,
    });

    expect((await patchPackage(id, { name: "Starter Plus" })).status).toBe(200);
    let row = await readPackage(id);
    expect(row.name).toBe("Starter Plus");
    expect(row.description).toBe("The intro block");
    expect(row.one_time_price_cents).toBe(5000);
    expect(row.flags).toEqual({ aiInsights: true });
    // None of these were in the patch body, so none of them may have moved.
    expect(row.budgets).toEqual([{ feature: "all", days: 30 }]);
    expect(row.visibility).toBe("marketplace");
    expect(row.once_per_customer).toBe(1);

    expect((await patchPackage(id, { visibility: "private", oncePerCustomer: false })).status).toBe(200);
    row = await readPackage(id);
    expect(row.visibility).toBe("private");
    expect(row.once_per_customer).toBe(0);
    expect(row.name).toBe("Starter Plus");
    expect(row.budgets).toEqual([{ feature: "all", days: 30 }]);

    // flags: null clears the column (how an owner drops a bespoke carve-out).
    expect((await patchPackage(id, { flags: null })).status).toBe(200);
    expect((await readPackage(id)).flags).toBeNull();

    // An empty patch is a no-op, not a 400 — and it must not reset anything.
    expect((await patchPackage(id, {})).status).toBe(200);
    row = await readPackage(id);
    expect(row.name).toBe("Starter Plus");
    expect(row.budgets).toEqual([{ feature: "all", days: 30 }]);
  });

  it("writes the addons_json PATCH branch — adds included add-ons and clears them again", async () => {
    // Created with no add-ons at all: addons_json starts null.
    const id = await createPackage({ name: "Coaching Block", oneTimePriceCents: 30000, budgets: [{ feature: "all", days: 30 }] });
    expect((await readPackage(id)).addOns).toEqual([]);

    expect((await patchPackage(id, { addOns: [{ addOnTypeId: "adt_consult", quantity: 2 }, { addOnTypeId: "adt_checkin", quantity: 4 }] })).status).toBe(200);
    expect((await readPackage(id)).addOns).toEqual([{ addOnTypeId: "adt_consult", quantity: 2 }, { addOnTypeId: "adt_checkin", quantity: 4 }]);

    // The UI sends [] when the owner zeroes every unit — that must actually clear.
    expect((await patchPackage(id, { addOns: [] })).status).toBe(200);
    expect((await readPackage(id)).addOns).toEqual([]);
  });

  it("switching a one-time package to monthly nulls the column it left behind", async () => {
    const id = await createPackage({ name: "Block", oneTimePriceCents: 9000, installmentMonths: 3, budgets: [{ feature: "all", days: 90 }] });
    expect((await patchPackage(id, { oneTimePriceCents: null, installmentMonths: null, monthlyPriceCents: 4900 })).status).toBe(200);
    const row = await readPackage(id);
    expect(row.monthly_price_cents).toBe(4900);
    expect(row.one_time_price_cents).toBeNull();
    expect(row.installment_months).toBeNull();
  });

  it("rejects an invalid body and refuses another tenant's package (404, no write)", async () => {
    const id = await createPackage({ name: "Guarded", oneTimePriceCents: 7000, budgets: [{ feature: "all", days: 30 }] });

    // A price that isn't an integer number of cents never reaches the column.
    expect((await patchPackage(id, { oneTimePriceCents: "99 USD" })).status).toBe(400);
    expect((await readPackage(id)).one_time_price_cents).toBe(7000);

    // Cross-tenant: not found, and the row is untouched.
    const rival = await patchPackage(id, { name: "Stolen", oneTimePriceCents: 1 }, otherCookie);
    expect(rival.status).toBe(404);
    const row = await readPackage(id);
    expect(row.name).toBe("Guarded");
    expect(row.one_time_price_cents).toBe(7000);
  });
});

describe("packages — archiving (DELETE) and restoring", () => {
  it("archives rather than erases: off the live list, on the archived list, and the existing buyer keeps their days", async () => {
    const id = await createPackage({ name: "Retiring Pack", oneTimePriceCents: 12000, budgets: [{ feature: "all", days: 30 }], visibility: "marketplace" });
    const clientId = await newClient("Early Buyer");
    expect((await grant(clientId, id)).status).toBeLessThan(300);

    const before = await subscriptions(clientId);
    expect(before).toHaveLength(1);
    expect(before[0]!.packageId).toBe(id);
    expect(before[0]!.daysRemaining).toBeGreaterThan(0);

    expect((await deletePackage(id)).status).toBe(200);

    // Gone from the live catalogue (which is exactly what the client Shop reads).
    expect((await listPackages()).map((p) => p.id)).not.toContain(id);
    // Still there, and readable, under ?archived=1.
    const archivedRow = await readPackage(id, true);
    expect(archivedRow.name).toBe("Retiring Pack");
    expect(archivedRow.active).toBe(0);

    // The buyer is untouched: same subscription, same status, same days.
    const after = await subscriptions(clientId);
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(before[0]!.id);
    expect(after[0]!.status).toBe("active");
    expect(after[0]!.daysRemaining).toBe(before[0]!.daysRemaining);

    /*
      AND THEY KEEP THE NAME.

      This assertion is the one that was missing, and its absence shipped the
      bug. The screen used to resolve the plan's name itself, by looking
      `packageId` up in `GET /packages` — which is `active = 1` only. So the
      moment a studio archived a package, every client still holding one
      rendered "Plan · Not yet" beside a day count that was still ticking down
      correctly. Reported across several clients on a live tenant.

      "Archived" means "no longer for sale". It does not mean "the people who
      bought it are now on nothing".
    */
    expect(after[0]!.packageName).toBe("Retiring Pack");
  });

  it("names the package from the GRANT LEDGER when the subscription's own column cannot", async () => {
    /*
      `subject_subscriptions.package_id` is only ever the package that OPENED
      the row — a repeat grant folds in and leaves it alone. The append-only
      `subject_package_grants` is what was actually applied, so it is the better
      answer whenever the column is null or dangling (legacy redemption rows
      created package-less subscriptions before /redeem was made a top-up).
    */
    const opener = await createPackage({ name: "Opening Pack", oneTimePriceCents: 5000, budgets: [{ feature: "all", days: 10 }] });
    const clientId = await newClient("Ledger Reader");
    expect((await grant(clientId, opener)).status).toBeLessThan(300);
    const subId = (await subscriptions(clientId))[0]!.id;

    // Null the column, exactly as a legacy row carries it.
    await (env.DB as D1Database).prepare("UPDATE subject_subscriptions SET package_id = NULL WHERE id = ?").bind(subId).run();

    const after = await subscriptions(clientId);
    expect(after[0]!.packageId).toBeNull();
    expect(after[0]!.packageName).toBe("Opening Pack");
  });

  it("an archived package can no longer be granted, and PATCH active:true puts it back on sale", async () => {
    const id = await createPackage({ name: "Off Sale", oneTimePriceCents: 8000, budgets: [{ feature: "all", days: 30 }], visibility: "marketplace" });
    const clientId = await newClient("Late Buyer");

    expect((await deletePackage(id)).status).toBe(200);
    const blocked = await grant(clientId, id);
    expect(blocked.status).toBe(404);
    expect(((await blocked.json()) as { error: string }).error).toBe("package not found");
    expect(await subscriptions(clientId)).toHaveLength(0);

    // Restore — the only path back, since nothing else ever sets active = 1.
    expect((await patchPackage(id, { active: true })).status).toBe(200);
    expect((await listPackages()).map((p) => p.id)).toContain(id);
    expect((await listPackages(true)).map((p) => p.id)).not.toContain(id);
    expect((await grant(clientId, id)).status).toBeLessThan(300);
    expect((await subscriptions(clientId))[0]!.daysRemaining).toBeGreaterThan(0);
  });

  it("archiving is idempotent, and another tenant's DELETE is a 404 that changes nothing", async () => {
    const id = await createPackage({ name: "Rival Target", oneTimePriceCents: 4000, budgets: [{ feature: "all", days: 30 }] });

    const rival = await deletePackage(id, otherCookie);
    expect(rival.status).toBe(404);
    expect((await listPackages()).map((p) => p.id)).toContain(id);

    expect((await deletePackage(id)).status).toBe(200);
    expect((await deletePackage(id)).status).toBe(200); // re-archive is a no-op
    expect((await readPackage(id, true)).active).toBe(0);

    // An unknown id is a 404, not a silent ok.
    expect((await deletePackage("pkg_does_not_exist")).status).toBe(404);
  });
});

describe("packages — once per customer", () => {
  it("PATCHing oncePerCustomer on stops the same client buying it twice (409)", async () => {
    const id = await createPackage({ name: "Intro Month", oneTimePriceCents: 5000, budgets: [{ feature: "all", days: 30 }], visibility: "marketplace", oncePerCustomer: false });
    const clientId = await newClient("Repeat Rita");

    // Off by default: a second grant extends the live runway.
    expect((await grant(clientId, id)).status).toBeLessThan(300);
    expect((await grant(clientId, id)).status).toBeLessThan(300);

    expect((await patchPackage(id, { oncePerCustomer: true })).status).toBe(200);
    expect((await readPackage(id)).once_per_customer).toBe(1);

    const third = await grant(clientId, id);
    expect(third.status).toBe(409);
    expect(((await third.json()) as { error: string }).error).toBe("package is once per customer");
  });
});
