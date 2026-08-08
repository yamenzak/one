/**
 * THE ONE GATE IN FRONT OF THE SIGN-IN CODE.
 *
 * Tessa has no password provider, so `POST /api/auth/email-otp/send-verification-otp`
 * is the entire front door — and it was mounted BARE until `otpSendGuard` landed:
 * Better Auth's handler, straight through, with none of the five controls
 * `@4dl/auth` had already written, tested and shipped. Nothing failed, which is
 * the whole problem and the reason for this file.
 *
 * What each assertion below is really pinning is that the guard is MOUNTED. A
 * package can ship a perfect gate and an app can decline to put it on the door;
 * only a test that speaks HTTP to this app can tell the two apart.
 *
 * ⚠️ The deliverability pre-flight is NOT tested here and cannot be: this suite
 * runs with `ENVIRONMENT: development`, which is exactly the lane that makes the
 * mock mailer deliverable, and a Workers-pool binding is fixed for the whole
 * runtime. `@4dl/email`'s own suite covers `emailDeliverable`; what this file can
 * prove is that the guard runs at all, and the other four controls do that.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";

const SETUP = "http://setup.localhost:8787";
const ROOT = "http://localhost:8787";
const db = () => env.DB as D1Database;

const json = (origin: string) => ({ "content-type": "application/json", origin });

const send = (origin: string, body: Record<string, unknown>, ip?: string) =>
  SELF.fetch(`${origin}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { ...json(origin), ...(ip ? { "cf-connecting-ip": ip } : {}) },
    body: JSON.stringify(body),
  });

/** A fresh address per assertion, so the 30-second cooldown never crosses tests. */
const fresh = () => `otp-${crypto.randomUUID().slice(0, 8)}@example.com`;

/**
 * One centre, made in `beforeAll` on purpose.
 *
 * This suite runs with the Workers pool's per-test isolated storage, so a
 * centre created INSIDE a test is rolled back before the next one and its door
 * then 404s — which reads as a broken route rather than as isolation doing its
 * job. `beforeAll` writes sit beneath that stack frame and survive the file.
 */
let centre: { email: string; door: string; tenantId: string };

beforeAll(async () => {
  await ensureSchema(db());

  const email = fresh();
  await send(SETUP, { email, type: "sign-in" });
  const row = await db()
    .prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1")
    .bind(`%otp%${email}%`)
    .first<{ value: string }>();
  const otp = (row?.value ?? "").match(/\d{6}/)?.[0];
  const signedIn = await SELF.fetch(`${SETUP}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers: json(SETUP),
    body: JSON.stringify({ email, otp }),
  });
  const h = signedIn.headers as Headers & { getSetCookie?: () => string[] };
  const cookie = (h.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  const slug = `otpgate${crypto.randomUUID().slice(0, 6)}`;
  const created = await SELF.fetch(`${SETUP}/api/auth/organization/create`, {
    method: "POST",
    headers: { ...json(SETUP), cookie },
    body: JSON.stringify({ name: "OTP Gate Centre", slug }),
  });
  const org = (await created.json()) as { id?: string };
  centre = { email, door: `http://${slug}.localhost:8787`, tenantId: org.id ?? "" };
});

describe("the guard is mounted", () => {
  it("refuses a body with no usable address before anything else runs", async () => {
    const res = await send(SETUP, { email: "not-an-email", type: "sign-in" });
    expect(res.status).toBe(400);
  });

  it("enforces a per-address cooldown between codes", async () => {
    /*
      The control that proves the guard is in the path at all. Better Auth's own
      cap is 6 per HOUR and silently drops the seventh with a 200 — so a second
      request answering 429 with a countdown can only be this middleware.
    */
    const email = fresh();
    expect((await send(SETUP, { email, type: "sign-in" })).status).toBe(200);
    const second = await send(SETUP, { email, type: "sign-in" });
    expect(second.status).toBe(429);
    const body = (await second.json()) as { error: string; retryAfterSec: number };
    expect(body.error).toBe("cooldown");
    // Reflected so the resend button can count down rather than looking broken.
    expect(body.retryAfterSec).toBeGreaterThan(0);
  });

  it("enforces a per-SOURCE hourly ceiling, which is the limit that matters", async () => {
    /*
      A per-address cap only slows somebody reusing one address. The actual
      attack is rotating them — each new address at a centre that allows
      self-registration would otherwise be free — so the ceiling is keyed on the
      connecting IP and every attempt counts toward it whatever the outcome.
    */
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    let throttled = false;
    for (let i = 0; i < 25; i += 1) {
      const res = await send(SETUP, { email: fresh(), type: "sign-in" }, ip);
      if (res.status === 429 && ((await res.json()) as { error: string }).error === "too_many_requests") {
        throttled = true;
        break;
      }
    }
    expect(throttled, "the per-IP ceiling never fired in 25 attempts").toBe(true);
  });
});

describe("who may receive a code", () => {
  it("lets anyone request one on the SETUP door — that is how a new owner gets in", async () => {
    expect((await send(SETUP, { email: fresh(), type: "sign-in" })).status).toBe(200);
  });

  it("turns a stranger away at a centre's own door, and says only invite_only", async () => {
    // A CSSD has no self-registration lane: everyone arrives by invitation. The
    // body must NOT reveal whether the address is known — the two answers
    // together would make this endpoint an oracle for who works at a centre.
    const email = fresh();
    const res = await send(centre.door, { email, type: "sign-in" });
    expect(res.status).toBe(403);
    expect((await res.json()) as { error: string }).toEqual({ error: "invite_only" });
  });

  it("lets an address that already has an account through at a centre's door", async () => {
    // A DIFFERENT account from the centre's owner, so this proves "has an
    // account" rather than "is a member here" — which is the rule, since one
    // person may work at two centres.
    const other = fresh();
    await send(SETUP, { email: other, type: "sign-in" });
    const row = await db()
      .prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1")
      .bind(`%otp%${other}%`)
      .first<{ value: string }>();
    await SELF.fetch(`${SETUP}/api/auth/sign-in/email-otp`, {
      method: "POST",
      headers: json(SETUP),
      body: JSON.stringify({ email: other, otp: (row?.value ?? "").match(/\d{6}/)?.[0] }),
    });
    // Past the 30s cooldown is the one thing this cannot wait for, so assert the
    // guard got as far as ELIGIBILITY: a cooldown means it was let through.
    const res = await send(centre.door, { email: other, type: "sign-in" });
    expect([200, 429]).toContain(res.status);
    expect(res.status).not.toBe(403);
  });

  it("lets an INVITED address through, because otherwise the accept link is a dead end", async () => {
    const invited = fresh();
    await db()
      .prepare(
        `INSERT INTO "invitation" (id, organizationId, email, role, status, expiresAt, inviterId, createdAt)
         VALUES (?, ?, ?, 'member', 'pending', datetime('now', '+7 days'), ?, CURRENT_TIMESTAMP)`,
      )
      .bind(`inv_${crypto.randomUUID().slice(0, 8)}`, centre.tenantId, invited, "someone")
      .run();
    expect((await send(centre.door, { email: invited, type: "sign-in" })).status).toBe(200);
  });

  it("closes the door again when the invitation is revoked", async () => {
    // Revoking is how a mistyped address is undone, so a revoked invitation that
    // still admitted its holder would make the revoke button decorative.
    const invited = fresh();
    await db()
      .prepare(
        `INSERT INTO "invitation" (id, organizationId, email, role, status, expiresAt, inviterId, createdAt)
         VALUES (?, ?, ?, 'member', 'canceled', datetime('now', '+7 days'), ?, CURRENT_TIMESTAMP)`,
      )
      .bind(`inv_${crypto.randomUUID().slice(0, 8)}`, centre.tenantId, invited, "someone")
      .run();
    expect((await send(centre.door, { email: invited, type: "sign-in" })).status).toBe(403);
  });

  it("points a caller on the ROOT door at their own address instead of admitting them", async () => {
    const res = await send(ROOT, { email: fresh(), type: "sign-in" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("wrong_door");
  });
});

describe("the ways around the guard are closed", () => {
  it("404s both password-reset OTP siblings", async () => {
    /*
      Both endpoints the emailOTP plugin registers unconditionally call the same
      send callback DIRECTLY, so each skips Turnstile, the cooldown, the ceiling
      and eligibility. There is no password provider here, so neither has a
      legitimate caller — and 404 rather than 403 so we do not confirm they exist.
    */
    for (const path of ["/api/auth/email-otp/request-password-reset", "/api/auth/forget-password/email-otp"]) {
      const res = await SELF.fetch(`${SETUP}${path}`, { method: "POST", headers: json(SETUP), body: JSON.stringify({ email: fresh() }) });
      expect(res.status, path).toBe(404);
    }
  });
});
