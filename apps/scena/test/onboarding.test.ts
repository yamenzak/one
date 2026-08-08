/**
 * THE FIRST-RUN WIZARD'S TWO CALLS, over real HTTP.
 *
 * Every assertion here corresponds to a way this endpoint can be wrong while
 * typechecking perfectly:
 *
 *   • **It answers on the SETUP door.** `/api/me/onboarding/*` is the whole
 *     reason `isPersonal` exists in Scena's route guard — every `/api/billing*`
 *     path needs a tenancy, and this caller has none. Scena declared no personal
 *     lane at all and got away with it only while `@4dl/auth` lent the session's
 *     active organization to any door with no tenant of its own. Closing that
 *     (it is what made `scena.4dl.app` render a whole 404ing app) left this
 *     lane 401ing, so it is pinned here.
 *   • **`free` is never offered.** It is the PARKING ROW every new workspace is
 *     stamped with and `active = 0`; a picker that listed it would sell the
 *     state `statusOf` gates read-only, i.e. sell nothing for nothing.
 *   • **Choosing never grants.** `plan_id`/`status` must be untouched, because
 *     the only thing allowed to stamp a paid plan is the Stripe webhook.
 *   • **It degrades rather than blocking.** With no Stripe keys — this suite,
 *     every self-host, anything before the deploy guide's Stripe step — a
 *     mandatory paid step that refused would mean nobody can create a workspace
 *     at all.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";
import { ensureBilling, listPlans } from "../src/billing-store.js";

const SETUP = "http://setup.localhost:8787";

const db = () => env.DB as D1Database;

function cookies(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  return (h.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

const json = (origin: string, cookie?: string): Record<string, string> => ({
  "content-type": "application/json",
  origin,
  ...(cookie ? { cookie } : {}),
});

/** The freshest sign-in code, out of D1 — never out of a log. */
async function latestOtp(email: string): Promise<string> {
  const row = await db()
    .prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1")
    .bind(`%otp%${email}%`)
    .first<{ value: string }>();
  const otp = (row?.value ?? "").match(/\d{6}/)?.[0];
  if (!otp) throw new Error(`no OTP in the verification table for ${email}`);
  return otp;
}

async function signIn(email: string): Promise<string> {
  await SELF.fetch(`${SETUP}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: json(SETUP),
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const res = await SELF.fetch(`${SETUP}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers: json(SETUP),
    body: JSON.stringify({ email, otp: await latestOtp(email) }),
  });
  expect(res.status, `sign-in for ${email}`).toBe(200);
  return cookies(res);
}

const uniq = (tag: string) =>
  `${tag}-${Math.abs(Number(BigInt(Date.now()) % 1_000_000n)) + Math.floor(performance.now())}`;

beforeAll(async () => {
  await ensureSchema(db());
  await ensureBilling(db());
});

describe("onboarding", () => {
  it("serves the plan picker on the setup door to a caller with NO workspace", async () => {
    const cookie = await signIn(`${uniq("pick")}@example.com`);
    const res = await SELF.fetch(`${SETUP}/api/me/onboarding/plans`, { headers: json(SETUP, cookie) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plans: { id: string }[]; hasTenant: boolean; stripeEnabled: boolean };
    // The point of the endpoint: a real catalog for somebody with no tenancy.
    expect(body.hasTenant).toBe(false);
    expect(body.plans.length).toBeGreaterThan(0);
    // No Stripe keys in this suite, which is what the degrade path is for.
    expect(body.stripeEnabled).toBe(false);
  });

  it("never offers `free`, nor any inactive or zero-price row", async () => {
    const cookie = await signIn(`${uniq("nofree")}@example.com`);
    const res = await SELF.fetch(`${SETUP}/api/me/onboarding/plans`, { headers: json(SETUP, cookie) });
    const body = (await res.json()) as { plans: { id: string; priceCents: number }[] };
    expect(body.plans.map((p) => p.id)).not.toContain("free");
    expect(body.plans.every((p) => p.priceCents > 0)).toBe(true);

    // …and it is the STORE's filter doing it, not a hand-maintained deny-list:
    // every sellable row appears, so adding a plan needs no edit here.
    const sellable = await listPlans(db(), true);
    expect(body.plans.map((p) => p.id).sort()).toEqual(sellable.map((p) => p.id).sort());
  });

  it("refuses an unauthenticated caller", async () => {
    const res = await SELF.fetch(`${SETUP}/api/me/onboarding/plans`, { headers: json(SETUP) });
    expect(res.status).toBe(401);
  });

  it("answers 409 — not 403 — when the workspace does not exist yet", async () => {
    // The wizard's retry hinges on this: 409 means "create it and come back",
    // where a 403 would send the owner to a dead end they cannot resolve.
    const cookie = await signIn(`${uniq("notenant")}@example.com`);
    const res = await SELF.fetch(`${SETUP}/api/me/onboarding/plan`, {
      method: "POST",
      headers: json(SETUP, cookie),
      body: JSON.stringify({ planId: "starter" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()) as { error: string }).toEqual({ error: "no_tenant" });
  });

  it("records the choice, grants nothing, and degrades to `pending` with no Stripe", async () => {
    const slug = uniq("ws");
    const cookie0 = await signIn(`${slug}@example.com`);
    const created = await SELF.fetch(`${SETUP}/api/auth/organization/create`, {
      method: "POST",
      headers: json(SETUP, cookie0),
      body: JSON.stringify({ name: `Workspace ${slug}`, slug }),
    });
    expect(created.status).toBe(200);
    const active = await SELF.fetch(`${SETUP}/api/auth/organization/set-active`, {
      method: "POST",
      headers: json(SETUP, cookie0),
      body: JSON.stringify({ organizationSlug: slug }),
    });
    const cookie = cookies(active) || cookie0;

    const res = await SELF.fetch(`${SETUP}/api/me/onboarding/plan`, {
      method: "POST",
      headers: json(SETUP, cookie),
      body: JSON.stringify({ planId: "starter" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { billing: string; planId: string; trialDays: number; checkoutUrl?: string };
    expect(body.billing).toBe("pending");
    expect(body.planId).toBe("starter");
    // The trial is what replaced the free tier, so it has to reach the client.
    expect(body.trialDays).toBe(30);
    expect(body.checkoutUrl).toBeUndefined();

    const org = await db().prepare('SELECT id FROM "organization" WHERE slug = ?').bind(slug).first<{ id: string }>();
    const sub = await db()
      .prepare("SELECT plan_id, pending_plan_id, status FROM subscriptions WHERE tenant_id = ?")
      .bind(org!.id)
      .first<{ plan_id: string; pending_plan_id: string | null; status: string }>();
    // THE assertion of this file: the choice is a breadcrumb, not a grant.
    expect(sub?.pending_plan_id).toBe("starter");
    expect(sub?.plan_id).toBe("free");
  });

  it("rejects a plan id that is not sellable", async () => {
    const slug = uniq("bad");
    const cookie0 = await signIn(`${slug}@example.com`);
    await SELF.fetch(`${SETUP}/api/auth/organization/create`, {
      method: "POST",
      headers: json(SETUP, cookie0),
      body: JSON.stringify({ name: `Workspace ${slug}`, slug }),
    });
    const active = await SELF.fetch(`${SETUP}/api/auth/organization/set-active`, {
      method: "POST",
      headers: json(SETUP, cookie0),
      body: JSON.stringify({ organizationSlug: slug }),
    });
    const cookie = cookies(active) || cookie0;

    // `free` EXISTS as a row and resolves entitlements for anyone sitting on it,
    // so "unknown plan" is the wrong test — "not for sale" is the right one.
    const res = await SELF.fetch(`${SETUP}/api/me/onboarding/plan`, {
      method: "POST",
      headers: json(SETUP, cookie),
      body: JSON.stringify({ planId: "free" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toEqual({ error: "unknown_plan" });
  });
});
