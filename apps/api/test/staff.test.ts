/**
 * THE STAFF SCREEN — the three things Kova could not do before `@4dl/auth`'s
 * `staffRoutes`.
 *
 * Kova has always been able to SEND a staff invitation: the UI posted to Better
 * Auth's `organization/invite-member`, `sendInvitation` delivered a branded
 * email on the studio's rail, and `beforeCreateInvitation` held the seat. That
 * half was never the gap and is asserted elsewhere.
 *
 * The gap was everything after sending. `GET /members` joined `member` alone, so
 * a pending invitation was invisible: it held a seat the screen could not
 * account for, and an invite to a mistyped address sat there until it expired
 * with no way to take it back. There was no way to remove a member either.
 *
 * So these tests are about visibility, revocation and removal — plus the guards
 * that make removal safe, each of which is a permanent lockout if it goes.
 *
 * As in `entitlement-guards.test.ts`: `vitest.config.ts` makes every signed-in
 * test user a platform admin, so the route guard's ACTION gate is not observable
 * here. Everything below runs INSIDE the handler and consults no admin status.
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
    method: "POST",
    headers: { "content-type": "application/json", origin: B },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const row = await db.prepare("SELECT value FROM verification ORDER BY createdAt DESC LIMIT 1").first<{ value: string }>();
  const otp = ((row?.value ?? "").match(/\d{6}/) ?? [])[0];
  if (!otp) throw new Error("could not read OTP from verification table");
  return grabCookies(
    await SELF.fetch(`${B}/api/auth/sign-in/email-otp`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: B },
      body: JSON.stringify({ email, otp }),
    }),
  );
}

async function studio(tag: string, planId = "pro") {
  const db = env.DB as D1Database;
  let owner = await signIn(`${tag}-owner@test.dev`);
  const org = await SELF.fetch(`${B}/api/auth/organization/create`, {
    method: "POST",
    headers: J(owner),
    body: JSON.stringify({ name: `${tag} Studio`, slug: tag }),
  });
  owner = grabCookies(org) || owner;
  const tenantId = ((await (await SELF.fetch(`${B}/api/context`, { headers: auth(owner) })).json()) as { active: { tenantId: string } })
    .active.tenantId;
  await db.prepare("UPDATE subscriptions SET plan_id = ?, status = 'active' WHERE tenant_id = ?").bind(planId, tenantId).run();
  return { db, owner, tenantId };
}

interface StaffPayload {
  members: { userId: string; role: string; email: string | null }[];
  invitations: { id: string; email: string; role: string }[];
  seats: { used: number; pending: number; max: number; remaining: number };
  canManage: boolean;
}

const readStaff = async (cookies: string): Promise<StaffPayload> =>
  (await (await SELF.fetch(`${B}/api/staff`, { headers: auth(cookies) })).json()) as StaffPayload;

const invite = (cookies: string, email: string, role = "trainer") =>
  SELF.fetch(`${B}/api/staff/invite`, { method: "POST", headers: J(cookies), body: JSON.stringify({ email, role }) });

beforeAll(async () => {
  await ensureSchema(env.DB as D1Database);
});

describe("a pending invitation is visible, and holds a seat", () => {
  it("lists it, counts it, and hands back a link that works even if the mail did not", async () => {
    const { owner } = await studio("stf1");

    const before = await readStaff(owner);
    expect(before.members).toHaveLength(1); // the owner
    expect(before.invitations).toHaveLength(0);
    expect(before.seats.used).toBe(1);

    const res = await invite(owner, "stf1-coach@test.dev");
    expect(res.status, await res.clone().text()).toBe(201);
    const body = (await res.json()) as { id: string; url: string | null; emailed: boolean };
    // The row IS the invitation; the email is only how the link travelled. A
    // failed send must still leave something an owner can hand over in person.
    expect(body.url).toContain("/accept-invitation/");

    const after = await readStaff(owner);
    expect(after.invitations.map((i) => i.email)).toEqual(["stf1-coach@test.dev"]);
    // The seat arithmetic the old screen could not do: pending is RESERVED.
    expect(after.seats.pending).toBe(1);
    expect(after.seats.remaining).toBe(after.seats.max - after.seats.used - 1);
  }, 30_000);

  it("refuses a second invitation to the same address", async () => {
    // Re-inviting used to create a row that could never be accepted — the accept
    // hook sees the existing invitation and returns — leaving a ghost nobody
    // could clear from a screen that could not show it either.
    const { owner } = await studio("stf2");
    expect((await invite(owner, "stf2-dup@test.dev")).status).toBe(201);
    const second = await invite(owner, "stf2-dup@test.dev");
    expect(second.status).toBe(409);
    expect((await second.json()) as { invitationId: string }).toHaveProperty("invitationId");
  }, 30_000);

  it("refuses an invitation to somebody already on staff", async () => {
    const { owner, tenantId, db } = await studio("stf3");
    const email = "stf3-already@test.dev";
    await signIn(email);
    const userId = (await db.prepare('SELECT id FROM "user" WHERE email = ?').bind(email).first<{ id: string }>())!.id;
    await db
      .prepare('INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)')
      .bind("mbr_stf3", tenantId, userId, "trainer", "2026-01-01")
      .run();
    expect((await invite(owner, email)).status).toBe(409);
  }, 30_000);

  it("will not mint a CLIENT through the staff invite", async () => {
    // A client joins through the client-invite flow, which creates a client
    // record. A `client` membership from here would be a member with no client
    // record: in the roster, absent from the app.
    const { owner } = await studio("stf4");
    expect((await invite(owner, "stf4-client@test.dev", "client")).status).toBe(400);
  }, 30_000);
});

describe("revoking", () => {
  it("removes the invitation and frees the seat it held", async () => {
    const { owner } = await studio("stf5");
    const id = ((await (await invite(owner, "stf5-coach@test.dev")).json()) as { id: string }).id;
    expect((await readStaff(owner)).seats.pending).toBe(1);

    const res = await SELF.fetch(`${B}/api/staff/invitations/${id}`, { method: "DELETE", headers: auth(owner) });
    expect(res.status).toBe(200);

    const after = await readStaff(owner);
    expect(after.invitations).toHaveLength(0);
    expect(after.seats.pending).toBe(0);
  }, 30_000);

  it("cannot revoke another studio's invitation", async () => {
    // An unscoped delete by id is a cross-tenant write. The id is guessable in
    // exactly the way an opaque id is not supposed to matter.
    const a = await studio("stf6a");
    const b = await studio("stf6b");
    const id = ((await (await invite(a.owner, "stf6-coach@test.dev")).json()) as { id: string }).id;

    const res = await SELF.fetch(`${B}/api/staff/invitations/${id}`, { method: "DELETE", headers: auth(b.owner) });
    expect(res.status).toBe(404);
    expect((await readStaff(a.owner)).invitations).toHaveLength(1);
  }, 40_000);
});

describe("removing a member", () => {
  async function withCoach(tag: string) {
    const s = await studio(tag);
    const email = `${tag}-coach@test.dev`;
    await signIn(email);
    const userId = (await s.db.prepare('SELECT id FROM "user" WHERE email = ?').bind(email).first<{ id: string }>())!.id;
    await s.db
      .prepare('INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)')
      .bind(`mbr_${tag}`, s.tenantId, userId, "trainer", "2026-01-01")
      .run();
    return { ...s, userId, email };
  }

  it("removes them and frees the seat", async () => {
    const { owner, userId } = await withCoach("stf7");
    expect((await readStaff(owner)).seats.used).toBe(2);

    const res = await SELF.fetch(`${B}/api/staff/${userId}`, { method: "DELETE", headers: auth(owner) });
    expect(res.status).toBe(200);

    const after = await readStaff(owner);
    expect(after.members.map((m) => m.userId)).not.toContain(userId);
    expect(after.seats.used).toBe(1);
  }, 30_000);

  it("refuses to remove yourself", async () => {
    // An owner removing themselves is the fastest route to a studio nobody can
    // administer, and it reads as a normal action until the next page load.
    const { owner, tenantId, db } = await studio("stf8");
    const ownerId = (await db
      .prepare('SELECT userId FROM "member" WHERE organizationId = ? AND role = ?')
      .bind(tenantId, "owner")
      .first<{ userId: string }>())!.userId;
    const res = await SELF.fetch(`${B}/api/staff/${ownerId}`, { method: "DELETE", headers: auth(owner) });
    expect(res.status).toBe(409);
    expect((await readStaff(owner)).members.map((m) => m.userId)).toContain(ownerId);
  }, 30_000);

  it("clears a pending invitation for the same person, so no ghost is left", async () => {
    const { owner, userId, email, tenantId } = await withCoach("stf9");
    // They are staff AND have an old pending invitation — possible when someone
    // was invited, joined by another route, and the row was never cleared.
    await (env.DB as D1Database)
      .prepare('INSERT INTO "invitation" (id, organizationId, email, role, status, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind("inv_stf9", tenantId, email, "trainer", "pending", "2030-01-01", "2026-01-01")
      .run();
    expect((await readStaff(owner)).invitations).toHaveLength(1);

    await SELF.fetch(`${B}/api/staff/${userId}`, { method: "DELETE", headers: auth(owner) });
    expect((await readStaff(owner)).invitations).toHaveLength(0);
  }, 30_000);
});

/**
 * THE SEAT COUNT ON THE SCREEN IS THE SEAT COUNT THE INVITE ENFORCES.
 *
 * `/api/staff` reported `used` as EVERY membership row and `pending` as every
 * invitation, while `checkStaffSeat` counts only non-customer roles. So a studio
 * with two coaches and two clients was told it had used four staff seats, and
 * `remaining` was computed off that inflated number — a five-seat plan showing
 * one seat left with three actually free, and at the boundary an anchor reading
 * "none left" over an invite button that worked.
 *
 * The whole reason the counters were moved server-side was to stop the screen
 * and the enforcement disagreeing. They still disagreed; the route re-derived
 * instead of calling the same functions. These pin them together.
 */
describe("a client is not a staff seat", () => {
  it("counts staff only, however many clients the studio has", async () => {
    const { db, owner, tenantId } = await studio("stfseat");

    // Two clients, exactly as the client-invite path leaves them: a `member` row
    // in the customer role.
    for (const n of [1, 2]) {
      await db
        .prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, \'2026-01-01\', \'2026-01-01\')')
        .bind(`u_stfseat_${n}`, `Client ${n}`, `stfseat-c${n}@test.dev`)
        .run();
      await db
        .prepare('INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, \'2026-01-01\')')
        .bind(`m_stfseat_${n}`, tenantId, `u_stfseat_${n}`, "client")
        .run();
    }

    const after = await readStaff(owner);
    // Three memberships in the tenant; ONE staff seat, which is the owner.
    expect(after.members).toHaveLength(3);
    expect(after.seats.used).toBe(1);
    expect(after.seats.remaining).toBe(after.seats.max - 1);
  }, 30_000);

  /** The same divergence on the other counter: a customer invitation reserves no
   *  staff seat, so it must not be subtracted from the ceiling either. */
  it("does not reserve a seat for a pending CLIENT invitation", async () => {
    const { db, owner, tenantId } = await studio("stfseat2");
    await db
      .prepare('INSERT INTO "invitation" (id, organizationId, email, role, status, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind("inv_stfseat2", tenantId, "stfseat2-client@test.dev", "client", "pending", "2030-01-01", "2026-01-01")
      .run();

    const after = await readStaff(owner);
    expect(after.seats.pending).toBe(0);
    expect(after.seats.remaining).toBe(after.seats.max - 1);
  }, 30_000);
});
