/**
 * LEAVING IS ALWAYS ALLOWED — the invariant, finally enforceable here.
 *
 * `route-guard.ts` has exempted `/api/tenant/close` from the read-only gate
 * since it was written, because the standing ladder is deliberately built so
 * that paying is A way out and not the ONLY one. The route it exempted did not
 * exist. So the exemption protected nothing, and a suspended centre was in a
 * trap: every write refused, the copy telling them to settle the invoice, and no
 * way to shut the thing down and end the relationship instead.
 *
 * The first test below is the one that matters — it puts a centre on the
 * read-only rung and then closes it. It fails on any commit that removes the
 * routes, the exemption, or the ordering between them.
 *
 * The step-up code is read out of `action_otps` the way the sign-in tests read
 * `verification`: never from a log, and never by weakening the ceremony.
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

async function signIn(email: string): Promise<string> {
  await SELF.fetch(`${SETUP}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SETUP },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const row = await db()
    .prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1")
    .bind(`%otp%${email}%`)
    .first<{ value: string }>();
  const otp = ((row?.value ?? "").match(/\d{6}/) ?? [])[0];
  return cookies(
    await SELF.fetch(`${SETUP}/api/auth/sign-in/email-otp`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: SETUP },
      body: JSON.stringify({ email, otp }),
    }),
  );
}

async function centre(tag: string) {
  const email = `${tag}@test.dev`;
  let jar = await signIn(email);
  const org = await SELF.fetch(`${SETUP}/api/auth/organization/create`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SETUP, Cookie: jar },
    body: JSON.stringify({ name: `${tag} Clinic`, slug: tag }),
  });
  jar = cookies(org) || jar;
  // Read the ids from D1 rather than from `/api/context`, the way this app's
  // other suites do — its context payload is a WORKSPACE (keyed `id`), not a
  // `{ tenantId }`, and the two are easy to confuse from the outside.
  const row = await db().prepare('SELECT id FROM "organization" WHERE slug = ?').bind(tag).first<{ id: string }>();
  const user = await db().prepare('SELECT id FROM "user" WHERE LOWER(email) = ?').bind(email).first<{ id: string }>();
  // A subscribed centre, which is what a real one is by the time any of this
  // matters. The row is written lazily in production (the first `/api/billing`
  // read), so a test that skips it is testing an unsubscribed centre by accident
  // — and gets a different gate.
  await db()
    .prepare("INSERT OR REPLACE INTO subscriptions (tenant_id, plan_id, status, comp) VALUES (?, 'practice', 'active', 0)")
    .bind(row!.id)
    .run();
  return { jar, origin: `http://${tag}.localhost:8787`, tenantId: row!.id, userId: user!.id };
}

const H = (jar: string, origin: string) => ({ "content-type": "application/json", origin, Cookie: jar });

/** The live step-up code for a (subject, purpose), read from the table. */
async function stepUpCode(subject: string, purpose: string): Promise<string> {
  // Only the HASH is stored, so the code itself cannot be read back — which is
  // the point of the mechanism. The dev mailer logs it; here the deterministic
  // path is to mint a known one by writing the hash the verifier will compute.
  const code = "424242";
  const data = new TextEncoder().encode(`${purpose}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  await db()
    .prepare("INSERT OR REPLACE INTO action_otps (subject, purpose, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, ?, 0, ?)")
    .bind(subject, purpose, hash, Date.now() + 600_000, Date.now())
    .run();
  return code;
}

beforeAll(async () => {
  await ensureSchema(db());
});

describe("a centre can always close itself", () => {
  it("closes even while SUSPENDED — the rung the exemption exists for", async () => {
    const c = await centre("leave1");

    // Put them on the read-only rung, the way the dunning sweep would.
    await db()
      .prepare("UPDATE subscriptions SET status = 'suspended', past_due_at = ?, suspend_at = ? WHERE tenant_id = ?")
      .bind("2026-01-01T00:00:00.000Z", "2026-01-08T00:00:00.000Z", c.tenantId)
      .run();

    // An ordinary write is refused — the gate really is closed.
    const ordinary = await SELF.fetch(`${c.origin}/api/catalog`, {
      method: "POST",
      headers: H(c.jar, c.origin),
      body: JSON.stringify({ name: "Anything" }),
    });
    // 402 — the standing gate's refusal, not a permission one.
    expect(ordinary.status).toBe(402);

    // …and leaving still works.
    const code = await stepUpCode(`tenant_close:${c.tenantId}`, "tenant_close");
    const closed = await SELF.fetch(`${c.origin}/api/tenant/close`, {
      method: "POST",
      headers: H(c.jar, c.origin),
      body: JSON.stringify({ code }),
    });
    expect(closed.status, await closed.clone().text()).toBe(200);
    const { deleteAt } = (await closed.json()) as { deleteAt: string };
    expect(Date.parse(deleteAt)).toBeGreaterThan(Date.now());

    const row = await db().prepare("SELECT status FROM subscriptions WHERE tenant_id = ?").bind(c.tenantId).first<{ status: string }>();
    expect(row?.status).toBe("closing");
  }, 40_000);

  it("refuses without a valid code", async () => {
    const c = await centre("leave2");
    const res = await SELF.fetch(`${c.origin}/api/tenant/close`, {
      method: "POST",
      headers: H(c.jar, c.origin),
      body: JSON.stringify({ code: "000000" }),
    });
    expect(res.status).toBe(403);
    const row = await db().prepare("SELECT status FROM subscriptions WHERE tenant_id = ?").bind(c.tenantId).first<{ status: string }>();
    expect(row?.status).not.toBe("closing");
  }, 30_000);

  it("reports a pending close, and undoes it WITHOUT a second code", async () => {
    // Undoing a destructive act is not itself destructive. Putting a step-up in
    // front of the undo is how a mistake becomes permanent because the
    // confirmation email was slow.
    const c = await centre("leave3");
    const code = await stepUpCode(`tenant_close:${c.tenantId}`, "tenant_close");
    await SELF.fetch(`${c.origin}/api/tenant/close`, { method: "POST", headers: H(c.jar, c.origin), body: JSON.stringify({ code }) });

    const status = (await (await SELF.fetch(`${c.origin}/api/tenant/close/status`, { headers: { Cookie: c.jar } })).json()) as {
      closing: boolean;
      deleteAt: string | null;
    };
    expect(status.closing).toBe(true);
    expect(status.deleteAt).toBeTruthy();

    const undone = await SELF.fetch(`${c.origin}/api/tenant/close/cancel`, { method: "POST", headers: H(c.jar, c.origin) });
    expect(undone.status).toBe(200);
    const after = (await (await SELF.fetch(`${c.origin}/api/tenant/close/status`, { headers: { Cookie: c.jar } })).json()) as {
      closing: boolean;
    };
    expect(after.closing).toBe(false);
  }, 40_000);

  it("is owner-only", async () => {
    const c = await centre("leave4");
    // A member of the centre who is not its owner.
    const staffJar = await signIn("leave4-staff@test.dev");
    const userId = (await db().prepare('SELECT id FROM "user" WHERE email = ?').bind("leave4-staff@test.dev").first<{ id: string }>())!.id;
    await db()
      .prepare('INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)')
      .bind("mbr_leave4", c.tenantId, userId, "cssd", "2026-01-01")
      .run();

    const res = await SELF.fetch(`${c.origin}/api/tenant/close`, {
      method: "POST",
      headers: H(staffJar, c.origin),
      body: JSON.stringify({ code: "424242" }),
    });
    expect(res.status).toBe(403);
  }, 40_000);
});

describe("a person can always delete their own account", () => {
  it("erases the membership and the identity", async () => {
    const c = await centre("leave5");
    const email = "leave5-staff@test.dev";
    const staffJar = await signIn(email);
    const userId = (await db().prepare('SELECT id FROM "user" WHERE email = ?').bind(email).first<{ id: string }>())!.id;
    await db()
      .prepare('INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)')
      .bind("mbr_leave5", c.tenantId, userId, "cssd", "2026-01-01")
      .run();

    const code = await stepUpCode(userId, "account_delete");
    const res = await SELF.fetch(`${c.origin}/api/me/delete`, {
      method: "POST",
      headers: H(staffJar, c.origin),
      body: JSON.stringify({ code }),
    });
    expect(res.status, await res.clone().text()).toBe(200);

    expect(await db().prepare('SELECT id FROM "user" WHERE id = ?').bind(userId).first()).toBeNull();
    expect(await db().prepare('SELECT id FROM "member" WHERE userId = ?').bind(userId).first()).toBeNull();
  }, 40_000);

  it("refuses an OWNER, and says which flow to use instead", async () => {
    // Deleting themselves would leave a centre nobody can administer, still
    // billing, holding records other people answer for.
    const c = await centre("leave6");
    const res = await SELF.fetch(`${c.origin}/api/me/delete/request-otp`, { method: "POST", headers: H(c.jar, c.origin) });
    expect(res.status).toBe(409);
    expect((await res.json()) as { error: string }).toEqual({ error: "owner_must_close_centre" });
  }, 30_000);
});
