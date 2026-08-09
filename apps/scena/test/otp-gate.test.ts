/**
 * THE ONE GATE IN FRONT OF THE SIGN-IN CODE.
 *
 * `POST /api/auth/email-otp/send-verification-otp` is the only way a PERSON
 * signs in here, and it was mounted BARE until `otpSendGuard` landed: Better
 * Auth's handler, straight through, with none of the five controls `@4dl/auth`
 * had already written, tested and shipped. Nothing failed anywhere — the package
 * was green, the app was green, the boundary held — which is precisely the gap
 * `docs/PLATFORM-AUDIT.md` is about and the reason this file speaks HTTP rather
 * than calling the guard directly. A package can ship a perfect gate and an app
 * can decline to put it on the door; only a request can tell the two apart.
 *
 * ⚠️ The deliverability pre-flight is NOT tested here and cannot be: the suite
 * runs with `ENVIRONMENT: development`, which is the lane that makes the mock
 * mailer deliverable, and a Workers-pool binding is fixed for the whole runtime.
 * The other four controls are what prove the guard runs at all.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";

const SETUP = "http://setup.localhost:8787";
const ROOT = "http://localhost:8787";
const db = () => env.DB as D1Database;

const json = (origin: string, cookie?: string): Record<string, string> => ({
  "content-type": "application/json",
  origin,
  ...(cookie ? { cookie } : {}),
});

const send = (origin: string, body: Record<string, unknown>, ip?: string) =>
  SELF.fetch(`${origin}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { ...json(origin), ...(ip ? { "cf-connecting-ip": ip } : {}) },
    body: JSON.stringify(body),
  });

/** A fresh address per assertion, so the 30-second cooldown never crosses tests. */
const fresh = () => `otp-${crypto.randomUUID().slice(0, 8)}@example.com`;

function cookies(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  return (h.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

/** Sign in on the SETUP door and return the session cookie. */
async function signIn(email: string): Promise<string> {
  await send(SETUP, { email, type: "sign-in" });
  const row = await db()
    .prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1")
    .bind(`%otp%${email}%`)
    .first<{ value: string }>();
  const otp = (row?.value ?? "").match(/\d{6}/)?.[0];
  return cookies(
    await SELF.fetch(`${SETUP}/api/auth/sign-in/email-otp`, {
      method: "POST",
      headers: json(SETUP),
      body: JSON.stringify({ email, otp }),
    }),
  );
}

let workspace: { door: string; tenantId: string };

beforeAll(async () => {
  await ensureSchema(db());
  const owner = fresh();
  const cookie = await signIn(owner);
  const slug = `otpgate${crypto.randomUUID().slice(0, 6)}`;
  const created = await SELF.fetch(`${SETUP}/api/auth/organization/create`, {
    method: "POST",
    headers: json(SETUP, cookie),
    body: JSON.stringify({ name: "OTP Gate Workspace", slug }),
  });
  const org = (await created.json()) as { id?: string };
  workspace = { door: `http://${slug}.localhost:8787`, tenantId: org.id ?? "" };
});

describe("the guard is mounted", () => {
  it("refuses a body with no usable address before anything else runs", async () => {
    expect((await send(SETUP, { email: "not-an-email", type: "sign-in" })).status).toBe(400);
  });

  it("enforces a per-address cooldown between codes", async () => {
    /*
      The control that proves the guard is in the path. `createAuth`'s own cap is
      6 per HOUR and silently drops the seventh with a 200 — so a second request
      answering 429 with a countdown can only be this middleware.
    */
    const email = fresh();
    expect((await send(SETUP, { email, type: "sign-in" })).status).toBe(200);
    const second = await send(SETUP, { email, type: "sign-in" });
    expect(second.status).toBe(429);
    const body = (await second.json()) as { error: string; retryAfterSec: number };
    expect(body.error).toBe("cooldown");
    expect(body.retryAfterSec).toBeGreaterThan(0);
  });

  it("enforces a per-SOURCE hourly ceiling, which is the limit that matters", async () => {
    // A per-address cap only slows somebody reusing one address; the attack is
    // rotating them, and only a per-source ceiling sees that.
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
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

  it("turns a stranger away at a workspace's own door, and says only invite_only", async () => {
    // Everybody who signs in with a code works here and arrives by invitation.
    // The body must not reveal whether the address is known — the two answers
    // together would make this an oracle for who works at a given workspace.
    const res = await send(workspace.door, { email: fresh(), type: "sign-in" });
    expect(res.status).toBe(403);
    expect((await res.json()) as { error: string }).toEqual({ error: "invite_only" });
  });

  it("lets an INVITED address through, because otherwise the accept link is a dead end", async () => {
    const invited = fresh();
    await db()
      .prepare(
        `INSERT INTO "invitation" (id, organizationId, email, role, status, expiresAt, inviterId, createdAt)
         VALUES (?, ?, ?, 'member', 'pending', datetime('now', '+7 days'), ?, CURRENT_TIMESTAMP)`,
      )
      .bind(`inv_${crypto.randomUUID().slice(0, 8)}`, workspace.tenantId, invited, "someone")
      .run();
    expect((await send(workspace.door, { email: invited, type: "sign-in" })).status).toBe(200);
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
      .bind(`inv_${crypto.randomUUID().slice(0, 8)}`, workspace.tenantId, invited, "someone")
      .run();
    expect((await send(workspace.door, { email: invited, type: "sign-in" })).status).toBe(403);
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
      and eligibility. A station's credential login is a different plugin and is
      unaffected; nothing else here has a password to reset. 404 rather than 403
      so we do not confirm they exist.
    */
    for (const path of ["/api/auth/email-otp/request-password-reset", "/api/auth/forget-password/email-otp"]) {
      const res = await SELF.fetch(`${SETUP}${path}`, { method: "POST", headers: json(SETUP), body: JSON.stringify({ email: fresh() }) });
      expect(res.status, path).toBe(404);
    }
  });
});
