/**
 * THE FIRST-RUN WIZARD'S TWO CALLS, and the gate they must not close.
 *
 * ── Why the gate assertion is the important one ──────────────────────────────
 *
 * `statusOf` reports `incomplete` for a centre with no paid plan, and the route
 * guard turns that into read-only — correct, and the whole reason the wizard has
 * a plan step. But it must only do that where a payment can actually be TAKEN.
 * On a deployment with no Stripe keys — a self-host, anything before DEPLOY.md's
 * Stripe step, this suite, the E2E suite — gating on "has not paid" strands every
 * centre over OUR misconfiguration.
 *
 * That fail-open was written, documented at length, and did not work.
 * `defaultSubscription` is `{ plan_id: "free", status: "incomplete" }`, and the
 * branch returned the stored status verbatim — so the moment anything
 * materialised the row, the gate read the parking default as a verdict and held
 * the centre read-only anyway. Nothing had noticed because nothing wrote the row
 * on a Stripe-less deployment; the wizard does, and the E2E suite went red with
 * `402 tenant_read_only, reason: setup` on an ordinary POST.
 *
 * So: create a centre through the same calls the wizard makes, then assert an
 * ordinary write still lands.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";

const SETUP = "http://setup.localhost:8787";
const db = () => env.DB as D1Database;

function cookies(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  return (h.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

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
    headers: { "content-type": "application/json", origin: SETUP },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  return cookies(
    await SELF.fetch(`${SETUP}/api/auth/sign-in/email-otp`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: SETUP },
      body: JSON.stringify({ email, otp: await latestOtp(email) }),
    }),
  );
}

/** Sign in and create a centre — the two things step 1 of the wizard does. */
async function newCentre(tag: string): Promise<{ jar: string; slug: string; origin: string }> {
  const slug = `${tag}-${crypto.randomUUID().slice(0, 6)}`;
  const jar = await signIn(`${slug}@example.com`);
  const created = await SELF.fetch(`${SETUP}/api/auth/organization/create`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SETUP, cookie: jar },
    body: JSON.stringify({ name: `Praxis ${slug}`, slug }),
  });
  expect(created.status, await created.text().catch(() => "")).toBeLessThan(300);
  return { jar, slug, origin: `http://${slug}.localhost:8787` };
}

beforeAll(async () => {
  await ensureSchema(db());
});

describe("onboarding", () => {
  it("serves the plan picker on the setup door to a caller with no centre", async () => {
    const jar = await signIn(`pick-${crypto.randomUUID().slice(0, 8)}@example.com`);
    const res = await SELF.fetch(`${SETUP}/api/me/onboarding/plans`, {
      headers: { origin: SETUP, cookie: jar },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      plans: { id: string; priceUsdMonth: number; trialDays: number }[];
      hasTenant: boolean;
      stripeEnabled: boolean;
    };
    // The whole point: a real catalog for somebody with no tenancy. Every
    // `/api/billing*` path would 401 this caller.
    expect(body.hasTenant).toBe(false);
    expect(body.stripeEnabled).toBe(false);
    expect(body.plans.map((p) => p.id)).toEqual(["practice"]);
    // The trial is what the wizard promises on the button, so it has to arrive.
    expect(body.plans[0]!.trialDays).toBe(14);
  });

  it("never offers `free`, nor any inactive or zero-price row", async () => {
    const jar = await signIn(`nofree-${crypto.randomUUID().slice(0, 8)}@example.com`);
    const res = await SELF.fetch(`${SETUP}/api/me/onboarding/plans`, { headers: { origin: SETUP, cookie: jar } });
    const body = (await res.json()) as { plans: { id: string; priceUsdMonth: number }[] };
    expect(body.plans.map((p) => p.id)).not.toContain("free");
    expect(body.plans.every((p) => p.priceUsdMonth > 0)).toBe(true);
  });

  it("answers 409 — not 403 — when the centre does not exist yet", async () => {
    // The wizard's retry hinges on this: 409 means "create it and come back",
    // where a 403 is a dead end nobody can resolve.
    const jar = await signIn(`notenant-${crypto.randomUUID().slice(0, 8)}@example.com`);
    const res = await SELF.fetch(`${SETUP}/api/me/onboarding/plan`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: SETUP, cookie: jar },
      body: JSON.stringify({ planId: "practice", returnUrl: "https://example.test/" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()) as { error: string }).toEqual({ error: "no_tenant" });
  });

  it("records the choice, grants nothing, and degrades to `pending` with no Stripe", async () => {
    const { jar, slug } = await newCentre("rec");
    const res = await SELF.fetch(`${SETUP}/api/me/onboarding/plan`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: SETUP, cookie: jar },
      body: JSON.stringify({ planId: "practice", returnUrl: `https://${slug}.example.test/` }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { billing: string; trialDays: number; checkoutUrl?: string };
    expect(body.billing).toBe("pending");
    expect(body.trialDays).toBe(14);
    expect(body.checkoutUrl).toBeUndefined();

    const org = await db().prepare('SELECT id FROM "organization" WHERE slug = ?').bind(slug).first<{ id: string }>();
    const sub = await db()
      .prepare("SELECT plan_id, pending_plan_id FROM subscriptions WHERE tenant_id = ?")
      .bind(org!.id)
      .first<{ plan_id: string; pending_plan_id: string | null }>();
    // The assertion this endpoint exists to keep true: the choice is a
    // breadcrumb. Only the Stripe webhook may stamp a paid plan.
    expect(sub?.pending_plan_id).toBe("practice");
    expect(sub?.plan_id).toBe("free");
  });

  it("rejects a plan id that is not for sale", async () => {
    const { jar, slug } = await newCentre("bad");
    // `free` EXISTS as a row and resolves entitlements for anyone sitting on it,
    // so "unknown plan" is the wrong test — "not for sale" is the right one.
    const res = await SELF.fetch(`${SETUP}/api/me/onboarding/plan`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: SETUP, cookie: jar },
      body: JSON.stringify({ planId: "free", returnUrl: `https://${slug}.example.test/` }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toEqual({ error: "unknown_plan" });
  });

  /**
   * ⚠️ THE ONE THAT CAUGHT A REAL OUTAGE. See the file header.
   *
   * With no Stripe keys, a centre carrying the `incomplete` PARKING status must
   * still be fully writable — otherwise every self-host and every test
   * deployment is read-only from the first screen, over a payment rail we never
   * configured.
   */
  it("leaves a centre writable when this deployment cannot take a payment", async () => {
    const { jar, slug, origin } = await newCentre("openfail");
    // Materialise the parking row exactly as the wizard does.
    await SELF.fetch(`${SETUP}/api/me/onboarding/plan`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: SETUP, cookie: jar },
      body: JSON.stringify({ planId: "practice", returnUrl: `https://${slug}.example.test/` }),
    });
    const stored = await db()
      .prepare('SELECT s.status FROM subscriptions s JOIN "organization" o ON o.id = s.tenant_id WHERE o.slug = ?')
      .bind(slug)
      .first<{ status: string }>();
    // The precondition. Without it this test would pass for the wrong reason on
    // the day the default row changes.
    expect(stored?.status).toBe("incomplete");

    const probe = (await (await SELF.fetch(`${origin}/api/host`)).json()) as {
      gate: { readOnly?: boolean; reason?: string } | null;
    };
    expect(probe.gate?.readOnly ?? false, `gate closed: ${probe.gate?.reason}`).toBe(false);

    const write = await SELF.fetch(`${origin}/api/catalog`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, cookie: jar },
      body: JSON.stringify({ name: "Sterile gauze 10x10", tracking: "lot", consumption: "discrete" }),
    });
    expect(write.status, await write.text().catch(() => "")).toBeLessThan(300);
  });
});
