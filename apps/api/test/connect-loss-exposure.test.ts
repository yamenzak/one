/**
 * THE PLATFORM CARRIES THE LOSS.
 *
 * Kova's Stripe Connect platform profile makes us responsible for losses from
 * seller fraud and for negative balances on connected accounts. That single
 * agreement turns a handful of previously-cosmetic gaps into money, so this
 * suite pins the controls that bound them. None of these prevent fraud — nothing
 * in an app can — they bound the SIZE of an attempt and make an attempt visible
 * while it is still small.
 *
 * ── What is asserted, and why each one is here ──────────────────────────────
 *
 *   PRICE CEILING   The textbook attack on any Connect platform: sign up, price
 *                   a package absurdly high, "sell" it to yourself on stolen
 *                   cards, take the payout before the chargebacks land.
 *                   `oneTimePriceCents` was `min(0)` with NO upper bound, so a
 *                   studio could write a $9,999,999 package. The cap is checked
 *                   twice on purpose — in the editor's schema AND at the charge —
 *                   because they answer different questions: the schema bounds
 *                   what can be written from now on, the charge bounds what can
 *                   be CHARGED, including rows that predate the cap or arrive by
 *                   some other path. The second check is the one that holds the
 *                   money, so it is tested against a row written directly to D1.
 *
 *   ONBOARD GATE    Connect requires the `commerce` entitlement, which no free
 *                   or Starter tenant has. This is the barrier that makes the
 *                   attack cost real money on a real card before it can start,
 *                   and it is asserted here so a future catalog edit that adds
 *                   `commerce` to a cheap tier fails loudly rather than silently
 *                   widening our exposure.
 *
 *   RESTRICTION     `charges_enabled = 0` is the same value for "hasn't finished
 *   VISIBILITY      onboarding" and "Stripe restricted them for suspected
 *                   fraud". Only the second one predicts a loss we pay for, and
 *                   until `connect_disabled_reason` existed the two were
 *                   indistinguishable without opening the Stripe dashboard by
 *                   hand, per account.
 *
 * Auth follows packages-management.test.ts. The harness makes every signed-in
 * user a platform admin (AGENTS.md §4), so action-gate 403s are not observable
 * here — the value ceilings and the stored state are.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";
import { MAX_PACKAGE_PRICE_CENTS } from "../src/commerce-routes.js";
import { syncConnectAccount } from "@4dl/commerce";

const ORIGIN = "http://setup.localhost:8787";
const db = () => env.DB as D1Database;

function grabCookies(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  return (h.getSetCookie?.() ?? []).map((c: string) => c.split(";")[0]).join("; ");
}

async function signInFlow(email: string, studioName: string): Promise<string> {
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

const auth = (c: string) => ({ Cookie: c, origin: ORIGIN });
const H = (c: string) => ({ "content-type": "application/json", ...auth(c) });

let owner = "";
let tenantId = "";

/**
 * Everything shared lives HERE and not in a test, because the harness gives each
 * test its own storage frame: a row written inside `it(...)` is invisible to the
 * next one, while a `beforeAll` write is replayed into every frame. Getting this
 * wrong produces a suite that passes in isolation and fails in sequence.
 */
beforeAll(async () => {
  await ensureSchema(db());
  owner = await signInFlow("connect-exposure@test.dev", "Exposure Studio");
  const ctx = (await (await SELF.fetch(`${ORIGIN}/api/context`, { headers: auth(owner) })).json()) as {
    active: { tenantId: string };
  };
  tenantId = ctx.active.tenantId;

  /**
   * Put the studio on a plan that HAS `commerce`.
   *
   * A brand-new tenant parks on `free`, which deliberately does not carry it —
   * that is the barrier the last test in this file pins. So without this step
   * every package write here 403s at the feature gate and the price-ceiling
   * assertions below would pass for entirely the wrong reason, never reaching
   * the cap at all.
   */
  await SELF.fetch(`${ORIGIN}/api/admin/tenants/${tenantId}/plan`, {
    method: "POST",
    headers: H(owner),
    body: JSON.stringify({ planId: "light", comp: true }),
  });

  // A settings row with a connected account, for the restriction assertions.
  await db()
    .prepare(
      "INSERT INTO tenant_settings (tenant_id, stripe_account_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET stripe_account_id = excluded.stripe_account_id",
    )
    .bind(tenantId, "acct_exposure_test", new Date().toISOString())
    .run();
});

describe("a package price cannot be unbounded", () => {
  it("refuses a package priced above the ceiling", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/packages`, {
      method: "POST",
      headers: H(owner),
      body: JSON.stringify({
        name: "Fraud Amplifier",
        oneTimePriceCents: MAX_PACKAGE_PRICE_CENTS + 1,
        budgets: [{ feature: "all", days: 30 }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("refuses an unbounded MONTHLY price too — the recurring half of the same hole", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/packages`, {
      method: "POST",
      headers: H(owner),
      body: JSON.stringify({
        name: "Recurring Amplifier",
        monthlyPriceCents: MAX_PACKAGE_PRICE_CENTS + 1,
        budgets: [{ feature: "all", days: 30 }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("still accepts a price at the ceiling — the cap must not be off by one", async () => {
    // Without this the previous two would pass just as happily if the ceiling
    // were accidentally set to zero, and every legitimate package would break.
    const res = await SELF.fetch(`${ORIGIN}/api/packages`, {
      method: "POST",
      headers: H(owner),
      body: JSON.stringify({
        name: "Expensive But Legitimate",
        oneTimePriceCents: MAX_PACKAGE_PRICE_CENTS,
        budgets: [{ feature: "all", days: 365 }],
      }),
    });
    expect(res.status).toBe(201);
  });

  it("the ceiling is a sane order of magnitude, not a placeholder", async () => {
    // A guard on the guard. If someone later "relaxes" this to a huge number the
    // tests above keep passing while the protection is gone, because they are
    // written in terms of the constant itself.
    expect(MAX_PACKAGE_PRICE_CENTS).toBeGreaterThanOrEqual(100_000); // >= $1,000 — real packages fit
    expect(MAX_PACKAGE_PRICE_CENTS).toBeLessThanOrEqual(5_000_000); // <= $50,000 — a single loss stays survivable
  });
});

describe("the charge is capped independently of the editor", () => {
  it("refuses to charge a row that got past the schema", async () => {
    // Written straight to D1, bypassing the editor exactly as a pre-cap row, an
    // import or a future bulk edit would. This is the check that actually holds
    // the money; if only the zod schema existed, this purchase would go through.
    await db()
      .prepare(
        // `marketplace`, NOT `private`. A grant-only package is refused by the
        // visibility rule before the price is ever looked at, so this test would
        // have passed without a ceiling existing at all.
        "INSERT INTO packages (id, tenant_id, name, one_time_price_cents, currency, visibility, active, created_at) VALUES (?, ?, ?, ?, 'usd', 'marketplace', 1, ?)",
      )
      .bind("pkg_overcap", tenantId, "Legacy Overpriced", MAX_PACKAGE_PRICE_CENTS + 500_000, new Date().toISOString())
      .run();

    const client = await SELF.fetch(`${ORIGIN}/api/clients`, {
      method: "POST",
      headers: H(owner),
      body: JSON.stringify({ displayName: "Buyer" }),
    });
    const clientId = ((await client.json()) as { client: { id: string } }).client.id;

    const res = await SELF.fetch(`${ORIGIN}/api/purchases`, {
      method: "POST",
      headers: H(owner),
      body: JSON.stringify({ clientId, packageId: "pkg_overcap" }),
    });
    // Pinned precisely, not just "not 2xx". A loose assertion here is how this
    // test previously kept passing after the route it called stopped existing:
    // a 404 is also "not ok". The cap must be the reason.
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ maxCents: MAX_PACKAGE_PRICE_CENTS });
  });
});

describe("a restricted seller is distinguishable from an unfinished one", () => {
  it("stores Stripe's reason, not just the boolean", async () => {
    await syncConnectAccount(db(), {
      id: "acct_exposure_test",
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: true,
      requirements: { disabled_reason: "rejected.fraud" },
    });

    const row = await db()
      .prepare("SELECT charges_enabled, connect_disabled_reason FROM tenant_settings WHERE tenant_id = ?")
      .bind(tenantId)
      .first<{ charges_enabled: number; connect_disabled_reason: string | null }>();
    expect(row?.charges_enabled).toBe(0);
    // The whole point: `charges_enabled = 0` alone could not tell us this.
    expect(row?.connect_disabled_reason).toBe("rejected.fraud");
  });

  it("clears the reason when Stripe lifts the restriction", async () => {
    // A reason that never clears would have every recovered studio permanently
    // flagged in the operator console, which trains the operator to ignore it.
    //
    // Set it FIRST, in this test's own storage frame: the previous test's write
    // is not visible here, so asserting the clear against it would be asserting
    // that null overwrites null.
    await syncConnectAccount(db(), {
      id: "acct_exposure_test",
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: true,
      requirements: { disabled_reason: "rejected.fraud" },
    });
    await syncConnectAccount(db(), {
      id: "acct_exposure_test",
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      requirements: { disabled_reason: null },
    });
    const row = await db()
      .prepare("SELECT charges_enabled, connect_disabled_reason FROM tenant_settings WHERE tenant_id = ?")
      .bind(tenantId)
      .first<{ charges_enabled: number; connect_disabled_reason: string | null }>();
    expect(row?.charges_enabled).toBe(1);
    expect(row?.connect_disabled_reason).toBeNull();
  });
});

describe("selling requires a paid plan", () => {
  it("no cheap tier carries `commerce` — the barrier in front of the whole rail", async () => {
    // The economic control: a fraudster must pass a real card for a real plan
    // before they can create a connected account at all, which leaves us their
    // Stripe customer record. If a future catalog edit puts `commerce` on free
    // or Starter, that barrier is gone — silently — so it fails here instead.
    const rows = await db()
      .prepare("SELECT id, price_usd_month, entitlements_json FROM plans")
      .all<{ id: string; price_usd_month: number; entitlements_json: string }>();
    for (const p of rows.results) {
      const ent = JSON.parse(p.entitlements_json) as { features?: Record<string, boolean> };
      if (!ent.features?.commerce) continue;
      expect(Number(p.price_usd_month), `plan ${p.id} sells on Connect but is not a paid plan`).toBeGreaterThan(0);
      // Starter is deliberately below the commerce line too — see billing-store.ts.
      expect(Number(p.price_usd_month), `plan ${p.id} enables commerce too cheaply`).toBeGreaterThanOrEqual(10);
    }
  });
});
