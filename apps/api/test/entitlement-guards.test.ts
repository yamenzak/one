/**
 * Entitlement-enforcement integration tests (round-5 audit): the two gaps where
 * something PAID was not actually metered.
 *
 * 1. **Session add-on balances** (`session-routes.ts`). Booking must be refused
 *    past the included quantity; `completed` AND `no_show` each consume one unit;
 *    re-opening / cancelling a consumed session refunds one; resolved sessions
 *    stay visible as history; and `PATCH /sessions/:id` is gated on the
 *    `frontDesk` entitlement like the POST paths are.
 * 2. **`staffSeats`** — the ceiling now holds on invitation creation, on Better
 *    Auth's `accept-invitation` (the deep link), and on role promotion, not just
 *    on the email-matched auto-accept in `/api/context`.
 *
 * What these CAN assert (AGENTS.md §4): `vitest.config.ts` sets `ADMIN_EMAILS: ""`
 * + `ENVIRONMENT: "development"`, so every signed-in test user is a platform
 * admin and `route-guard.ts` short-circuits the ACTION gate for admins — an
 * action-gate 403 is therefore NOT observable here (assert those in
 * `route-gate.conformance.test.ts`). `gateFeature`, `requireClientAccess` and
 * quota rejections all run inside handlers, consult no admin status, and ARE
 * observable — which is exactly what this file exercises.
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

/** Passwordless sign-in only — no organization. Used for an invitee, who must
 *  NOT own a studio (an org of their own would change the seat arithmetic). */
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

/** Sign in and create a studio (the caller becomes its owner). */
async function signInFlow(email: string, studioName: string): Promise<string> {
  let cookies = await signIn(email);
  const org = await SELF.fetch(`${B}/api/auth/organization/create`, {
    method: "POST",
    headers: J(cookies),
    body: JSON.stringify({ name: studioName, slug: studioName.toLowerCase().replace(/[^a-z0-9]+/g, "-") }),
  });
  const refreshed = grabCookies(org);
  if (refreshed) cookies = refreshed;
  return cookies;
}

async function setPlan(tenantId: string, planId: string, cookies: string): Promise<void> {
  const r = await SELF.fetch(`${B}/api/admin/tenants/${tenantId}/plan`, {
    method: "POST",
    headers: J(cookies),
    body: JSON.stringify({ planId }),
  });
  expect(r.status).toBe(200);
}

/** A studio on `planId` with its owner signed in. */
async function studio(tag: string, planId: string) {
  const db = env.DB as D1Database;
  const owner = await signInFlow(`${tag}-owner@test.dev`, `${tag} Studio`);
  const tenantId = ((await (await SELF.fetch(`${B}/api/context`, { headers: auth(owner) })).json()) as { active: { tenantId: string } }).active.tenantId;
  await setPlan(tenantId, planId, owner);
  return { db, owner, tenantId };
}

beforeAll(async () => {
  await ensureSchema(env.DB as D1Database);
});

// ─────────────────────────────────────────────────────────────────────────────
// TASK 1 — session add-on balances
// ─────────────────────────────────────────────────────────────────────────────
describe("session add-on balances are enforced", () => {
  /** A studio with frontDesk, one client, one add-on type, and a subscription
   *  carrying `included` units of that type. */
  async function frontDesk(tag: string, included: number, standalonePriceCents: number | null = null) {
    const { db, owner, tenantId } = await studio(tag, "team"); // team includes frontDesk
    const clientId = ((await (await SELF.fetch(`${B}/api/clients`, { method: "POST", headers: J(owner), body: JSON.stringify({ displayName: `${tag} Client` }) })).json()) as { client: { id: string } }).client.id;
    const typeRes = await SELF.fetch(`${B}/api/addon-types`, {
      method: "POST",
      headers: J(owner),
      body: JSON.stringify({ label: "Nutrition consult", durationMinutes: 30, standalonePriceCents }),
    });
    expect(typeRes.status).toBe(201);
    const addOnTypeId = ((await typeRes.json()) as { id: string }).id;
    const subId = `csub_${tag}`;
    await db
      .prepare("INSERT INTO client_subscriptions (id, tenant_id, client_id, status, budgets_json, addons_json, started_at) VALUES (?, ?, ?, 'active', '[]', ?, ?)")
      .bind(subId, tenantId, clientId, JSON.stringify([{ addOnTypeId, quantityTotal: included, quantityUsed: 0 }]), new Date().toISOString())
      .run();
    return { db, owner, tenantId, clientId, addOnTypeId, subId };
  }

  const book = (owner: string, clientId: string, addOnTypeId: string, when: string) =>
    SELF.fetch(`${B}/api/sessions`, {
      method: "POST",
      headers: J(owner),
      body: JSON.stringify({ clientId, addOnTypeId, scheduledAt: when, durationMinutes: 30 }),
    });

  const patch = (owner: string, id: string, status: string) =>
    SELF.fetch(`${B}/api/sessions/${id}`, { method: "PATCH", headers: J(owner), body: JSON.stringify({ status }) });

  const usedUnits = async (db: D1Database, subId: string, addOnTypeId: string): Promise<number> => {
    const row = (await db.prepare("SELECT addons_json FROM client_subscriptions WHERE id = ?").bind(subId).first<{ addons_json: string }>())!;
    return (JSON.parse(row.addons_json) as { addOnTypeId: string; quantityUsed: number }[]).find((b) => b.addOnTypeId === addOnTypeId)!.quantityUsed;
  };

  it("refuses booking beyond the included quantity, and says how to fix it", async () => {
    const { owner, clientId, addOnTypeId } = await frontDesk("bal1", 2);
    // Two included units → two bookings. Outstanding scheduled sessions count
    // against the balance, or the same unit books forever (nothing is consumed
    // until a session resolves).
    expect((await book(owner, clientId, addOnTypeId, "2026-09-01T10:00:00Z")).status).toBe(201);
    expect((await book(owner, clientId, addOnTypeId, "2026-09-02T10:00:00Z")).status).toBe(201);
    const third = await book(owner, clientId, addOnTypeId, "2026-09-03T10:00:00Z");
    expect(third.status).toBe(409);
    const body = (await third.json()) as { error: string };
    expect(body.error).toMatch(/no Nutrition consult left/i);
    expect(body.error).toMatch(/standalone price|package/i); // actionable, not a bare refusal
  }, 30_000);

  it("allows booking past the balance when the add-on type has a standalone price (unattached, consumes nothing)", async () => {
    const { db, owner, clientId, addOnTypeId, subId } = await frontDesk("bal2", 0, 5000);
    const res = await book(owner, clientId, addOnTypeId, "2026-09-01T10:00:00Z");
    expect(res.status).toBe(201);
    const id = ((await res.json()) as { id: string }).id;
    // Booked with no subscription attached — so completing it can't burn a unit
    // the client never bought.
    const row = (await db.prepare("SELECT subscription_id FROM trainer_sessions WHERE id = ?").bind(id).first<{ subscription_id: string | null }>())!;
    expect(row.subscription_id).toBeNull();
    expect((await patch(owner, id, "completed")).status).toBe(200);
    expect(await usedUnits(db, subId, addOnTypeId)).toBe(0);
  }, 30_000);

  it("completing consumes exactly one unit", async () => {
    const { db, owner, clientId, addOnTypeId, subId } = await frontDesk("bal3", 3);
    const id = ((await (await book(owner, clientId, addOnTypeId, "2026-09-01T10:00:00Z")).json()) as { id: string }).id;
    expect(await usedUnits(db, subId, addOnTypeId)).toBe(0); // booking alone spends nothing
    expect((await patch(owner, id, "completed")).status).toBe(200);
    expect(await usedUnits(db, subId, addOnTypeId)).toBe(1);
    // Idempotent: re-completing an already-completed session must not double-burn.
    expect((await patch(owner, id, "completed")).status).toBe(200);
    expect(await usedUnits(db, subId, addOnTypeId)).toBe(1);
  }, 30_000);

  it("a NO-SHOW consumes one unit (the client doesn't keep a session they didn't attend)", async () => {
    const { db, owner, clientId, addOnTypeId, subId } = await frontDesk("bal4", 3);
    const id = ((await (await book(owner, clientId, addOnTypeId, "2026-09-01T10:00:00Z")).json()) as { id: string }).id;
    expect((await patch(owner, id, "no_show")).status).toBe(200);
    expect(await usedUnits(db, subId, addOnTypeId)).toBe(1);
    // completed -> no_show stays on the spent side of the boundary: still one.
    expect((await patch(owner, id, "completed")).status).toBe(200);
    expect(await usedUnits(db, subId, addOnTypeId)).toBe(1);
  }, 30_000);

  it("cancelling refunds a CONSUMED unit, and refunds nothing for a still-scheduled one", async () => {
    const { db, owner, clientId, addOnTypeId, subId } = await frontDesk("bal5", 3);
    const a = ((await (await book(owner, clientId, addOnTypeId, "2026-09-01T10:00:00Z")).json()) as { id: string }).id;
    const b = ((await (await book(owner, clientId, addOnTypeId, "2026-09-02T10:00:00Z")).json()) as { id: string }).id;

    // Cancel while scheduled: nothing was spent, so nothing comes back (and the
    // counter must not go negative).
    expect((await patch(owner, b, "cancelled")).status).toBe(200);
    expect(await usedUnits(db, subId, addOnTypeId)).toBe(0);

    // Complete then cancel: the spent unit is handed back, exactly once.
    expect((await patch(owner, a, "completed")).status).toBe(200);
    expect(await usedUnits(db, subId, addOnTypeId)).toBe(1);
    expect((await patch(owner, a, "cancelled")).status).toBe(200);
    expect(await usedUnits(db, subId, addOnTypeId)).toBe(0);
    expect((await patch(owner, a, "cancelled")).status).toBe(200);
    expect(await usedUnits(db, subId, addOnTypeId)).toBe(0);
  }, 30_000);

  it("re-opening a no-showed session refunds the unit", async () => {
    const { db, owner, clientId, addOnTypeId, subId } = await frontDesk("bal6", 2);
    const id = ((await (await book(owner, clientId, addOnTypeId, "2026-09-01T10:00:00Z")).json()) as { id: string }).id;
    expect((await patch(owner, id, "no_show")).status).toBe(200);
    expect(await usedUnits(db, subId, addOnTypeId)).toBe(1);
    expect((await patch(owner, id, "scheduled")).status).toBe(200);
    expect(await usedUnits(db, subId, addOnTypeId)).toBe(0);
  }, 30_000);

  it("completing a session whose subscription has no matching balance fails loudly", async () => {
    const { db, owner, clientId, addOnTypeId, subId } = await frontDesk("bal7", 2);
    const id = ((await (await book(owner, clientId, addOnTypeId, "2026-09-01T10:00:00Z")).json()) as { id: string }).id;
    // The balance entry disappears (a package rewrite / bad migration). Before the
    // fix the completion silently no-op'd the ledger and reported success.
    await db.prepare("UPDATE client_subscriptions SET addons_json = '[]' WHERE id = ?").bind(subId).run();
    const res = await patch(owner, id, "completed");
    expect(res.status).toBe(409);
    expect((await db.prepare("SELECT status FROM trainer_sessions WHERE id = ?").bind(id).first<{ status: string }>())!.status).toBe("scheduled");
    void addOnTypeId;
  }, 30_000);

  it("the front-desk list returns resolved sessions as history, not just upcoming", async () => {
    const { owner, clientId, addOnTypeId } = await frontDesk("bal8", 3);
    const past = ((await (await book(owner, clientId, addOnTypeId, new Date(Date.now() - 86_400_000).toISOString())).json()) as { id: string }).id;
    const soon = ((await (await book(owner, clientId, addOnTypeId, "2026-09-02T10:00:00Z")).json()) as { id: string }).id;
    expect((await patch(owner, past, "completed")).status).toBe(200);

    const list = (await (await SELF.fetch(`${B}/api/sessions`, { headers: auth(owner) })).json()) as { sessions: { id: string; status: string }[] };
    const byId = new Map(list.sessions.map((s) => [s.id, s.status]));
    expect(byId.get(past)).toBe("completed"); // used to vanish the moment it resolved
    expect(byId.get(soon)).toBe("scheduled");

    // The window is bounded and caller-tunable: historyDays=0 drops the tail.
    const upcomingOnly = (await (await SELF.fetch(`${B}/api/sessions?historyDays=0`, { headers: auth(owner) })).json()) as { sessions: { id: string }[] };
    expect(upcomingOnly.sessions.map((s) => s.id)).not.toContain(past);
    expect(upcomingOnly.sessions.map((s) => s.id)).toContain(soon);
  }, 30_000);

  it("a tenant without frontDesk cannot PATCH a session", async () => {
    const { db, owner, tenantId, clientId, addOnTypeId, subId } = await frontDesk("bal9", 2);
    const id = ((await (await book(owner, clientId, addOnTypeId, "2026-09-01T10:00:00Z")).json()) as { id: string }).id;
    // Downgrade off frontDesk (free has no frontDesk). The POST paths were gated;
    // PATCH was not, so a downgraded tenant could still burn paid add-on units.
    await setPlan(tenantId, "free", owner);
    const res = await patch(owner, id, "completed");
    expect(res.status).toBe(403);
    expect((await res.json()) as { feature?: string }).toMatchObject({ feature: "frontDesk" });
    expect((await db.prepare("SELECT status FROM trainer_sessions WHERE id = ?").bind(id).first<{ status: string }>())!.status).toBe("scheduled");
    expect(await usedUnits(db, subId, addOnTypeId)).toBe(0);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// TASK 2 — staffSeats
// ─────────────────────────────────────────────────────────────────────────────
describe("staffSeats ceiling holds on every path that claims a seat", () => {
  const inviteMember = (cookies: string, email: string, role = "trainer") =>
    SELF.fetch(`${B}/api/auth/organization/invite-member`, {
      method: "POST",
      headers: J(cookies),
      body: JSON.stringify({ email, role }),
    });

  const memberRole = async (db: D1Database, tenantId: string, email: string): Promise<string | null> => {
    const row = await db
      .prepare('SELECT m.role AS role FROM "member" m JOIN "user" u ON u.id = m.userId WHERE m.organizationId = ? AND LOWER(u.email) = LOWER(?)')
      .bind(tenantId, email)
      .first<{ role: string }>();
    return row?.role ?? null;
  };

  it("invitation creation is refused once the seats are full — and the owner alone is not locked out", async () => {
    // Free = staffSeats 1, filled by the owner themselves (the quota's own label
    // is "Owner + trainers + assistants"), so a one-coach plan sells one coach.
    const { owner, tenantId } = await studio("seat1", "free");
    const refused = await inviteMember(owner, "seat1-coach@test.dev");
    expect(refused.status).toBe(403);
    const body = (await refused.json()) as { message?: string; code?: string };
    expect(body.code).toBe("STAFF_SEATS_EXCEEDED");
    expect(body.message).toMatch(/staff seat/i);
    expect(body.message).toMatch(/upgrade/i); // actionable
    expect((await (env.DB as D1Database).prepare('SELECT COUNT(*) AS n FROM "invitation" WHERE organizationId = ?').bind(tenantId).first<{ n: number }>())!.n).toBe(0);

    // The owner's own workspace still works and upgrading unblocks the invite —
    // the check is a ceiling, not a wall in front of every studio.
    await setPlan(tenantId, "studio", owner); // 4 seats
    expect((await inviteMember(owner, "seat1-coach@test.dev")).status).toBeLessThan(300);

    // …and pending invitations reserve their seat: 1 owner + 3 pending = 4/4.
    expect((await inviteMember(owner, "seat1-b@test.dev")).status).toBeLessThan(300);
    expect((await inviteMember(owner, "seat1-c@test.dev")).status).toBeLessThan(300);
    const overflow = await inviteMember(owner, "seat1-d@test.dev");
    expect(overflow.status).toBe(403);
    expect(((await overflow.json()) as { message?: string }).message).toMatch(/in use or invited/i);
  }, 40_000);

  it("the deep-link accept path (Better Auth accept-invitation) enforces the ceiling too", async () => {
    const { db, owner, tenantId } = await studio("seat2", "studio"); // room to invite
    const invited = "seat2-coach@test.dev";
    const inv = await inviteMember(owner, invited);
    expect(inv.status).toBeLessThan(300);
    const invitationId = ((await inv.json()) as { id: string }).id;

    // The studio downgrades before the coach clicks the link: 1 seat, owner in it.
    await setPlan(tenantId, "free", owner);
    const coach = await signIn(invited);
    const denied = await SELF.fetch(`${B}/api/auth/organization/accept-invitation`, {
      method: "POST",
      headers: J(coach),
      body: JSON.stringify({ invitationId }),
    });
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { message?: string }).message).toMatch(/staff seat/i);
    expect(await memberRole(db, tenantId, invited)).toBeNull(); // no membership minted
    // The invitation is untouched, so it still works when a seat frees up.
    expect((await db.prepare('SELECT status FROM "invitation" WHERE id = ?').bind(invitationId).first<{ status: string }>())!.status).toBe("pending");

    // Upgrade and the very same accept succeeds — proves the hook gates on seats,
    // not on something incidental about the request.
    await setPlan(tenantId, "studio", owner);
    const ok = await SELF.fetch(`${B}/api/auth/organization/accept-invitation`, {
      method: "POST",
      headers: J(coach),
      body: JSON.stringify({ invitationId }),
    });
    expect(ok.status).toBeLessThan(300);
    expect(await memberRole(db, tenantId, invited)).toBe("trainer");
  }, 40_000);

  it("role promotion (client → staff) is counted against the ceiling", async () => {
    const { db, owner, tenantId } = await studio("seat3", "free"); // 1 seat, owner in it
    // A client-role member: a real user linked to a client record, minted the way
    // /api/context does it. A client seat is free; promoting them is not.
    const clientCookie = await signIn("seat3-client@test.dev");
    const userId = (await db.prepare('SELECT id FROM "user" WHERE email = ?').bind("seat3-client@test.dev").first<{ id: string }>())!.id;
    await db
      .prepare('INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)')
      .bind("mbr_seat3_client", tenantId, userId, "client", "2026-01-01")
      .run();
    void clientCookie;

    const promote = (role: string) =>
      SELF.fetch(`${B}/api/members/${userId}/role`, { method: "PATCH", headers: J(owner), body: JSON.stringify({ role }) });

    const denied = await promote("trainer");
    expect(denied.status).toBe(403);
    const body = (await denied.json()) as { error: string; quota?: string; limit?: number };
    expect(body.quota).toBe("staffSeats");
    expect(body.limit).toBe(1);
    expect(body.error).toMatch(/upgrade/i);
    expect(await memberRole(db, tenantId, "seat3-client@test.dev")).toBe("client"); // not promoted

    // With seats available the same promotion lands…
    await setPlan(tenantId, "studio", owner);
    expect((await promote("trainer")).status).toBe(200);
    expect(await memberRole(db, tenantId, "seat3-client@test.dev")).toBe("trainer");

    // …and a sideways staff→staff move is never seat-checked, so a studio sitting
    // exactly on its ceiling can still reshuffle roles.
    //
    // The sideways target is deliberately NOT `assistant`: that role is half of
    // what `frontDesk` sells, so it is now feature-gated and would 403 on `free`
    // for a reason that has nothing to do with seats. Using a role the plan always
    // includes keeps this assertion about the seat ceiling, which is its point.
    await setPlan(tenantId, "pro", owner);
    expect((await promote("assistant")).status).toBe(200);
    expect(await memberRole(db, tenantId, "seat3-client@test.dev")).toBe("assistant");
    await setPlan(tenantId, "free", owner);
    expect((await promote("trainer")).status).toBe(200);
    expect(await memberRole(db, tenantId, "seat3-client@test.dev")).toBe("trainer");
    // Demoting to client frees the seat — also never blocked.
    expect((await promote("client")).status).toBe(200);
    expect(await memberRole(db, tenantId, "seat3-client@test.dev")).toBe("client");
  }, 40_000);

  it("the assistant ROLE needs frontDesk — both the promotion route and the invite path", async () => {
    // The assistant seat is the other half of what `frontDesk` sells (SPEC §5:
    // "Assistant role + sessions/booking"). Only the sessions half used to be
    // gated, so a tenant on a plan without frontDesk could mint assistants and
    // access.ts hands that role real powers — whole-roster read and the entire
    // scheduling surface. Two independent doors, so both are asserted: closing one
    // would just move the purchase to the other.
    const { db, owner, tenantId } = await studio("assist", "light"); // no frontDesk
    const clientCookie = await signIn("assist-client@test.dev");
    void clientCookie;
    const userId = (await db.prepare('SELECT id FROM "user" WHERE email = ?').bind("assist-client@test.dev").first<{ id: string }>())!.id;
    await db
      .prepare('INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)')
      .bind("mbr_assist_client", tenantId, userId, "client", "2026-01-01")
      .run();
    const setRole = (role: string) =>
      SELF.fetch(`${B}/api/members/${userId}/role`, { method: "PATCH", headers: J(owner), body: JSON.stringify({ role }) });
    const invite = (role: string) =>
      SELF.fetch(`${B}/api/auth/organization/invite-member`, {
        method: "POST",
        headers: J(owner),
        body: JSON.stringify({ email: `assist-invite-${role}@test.dev`, role, organizationId: tenantId }),
      });

    // Door 1: the promotion route, refused on a plan without frontDesk. Assert it
    // is the FEATURE gate and not the seat ceiling: every plan lacking frontDesk
    // also has staffSeats 1 (the owner fills it), so a bare 403 here would be
    // ambiguous. requireFeature names the feature; the seat refusal carries
    // `quota: "staffSeats"` instead.
    const denied = await setRole("assistant");
    expect(denied.status).toBe(403);
    const deniedBody = (await denied.json()) as { error: string; feature?: string; quota?: string };
    expect(deniedBody.feature).toBe("frontDesk");
    expect(deniedBody.quota).toBeUndefined();
    expect(await memberRole(db, tenantId, "assist-client@test.dev")).toBe("client");

    // Door 2: the invitation path, which Better Auth serves through its own lane
    // (so it needs its own hook — the route gate above cannot see it).
    expect((await invite("assistant")).status).toBeGreaterThanOrEqual(400);

    // Upgrade to a plan that includes frontDesk and both doors open.
    await setPlan(tenantId, "pro", owner);
    expect((await setRole("assistant")).status).toBe(200);
    expect(await memberRole(db, tenantId, "assist-client@test.dev")).toBe("assistant");
    expect((await invite("assistant")).status).toBeLessThan(300);
  }, 40_000);

  it("the email-matched auto-accept in /api/context shares the same check", async () => {
    const { db, owner, tenantId } = await studio("seat4", "studio");
    const invited = "seat4-coach@test.dev";
    expect((await inviteMember(owner, invited)).status).toBeLessThan(300);
    await setPlan(tenantId, "free", owner);

    const coach = await signIn(invited);
    await SELF.fetch(`${B}/api/context`, { headers: auth(coach) }); // the auto-accept lane
    expect(await memberRole(db, tenantId, invited)).toBeNull();
    expect((await db.prepare('SELECT status FROM "invitation" WHERE organizationId = ?').bind(tenantId).first<{ status: string }>())!.status).toBe("pending");

    await setPlan(tenantId, "studio", owner);
    await SELF.fetch(`${B}/api/context`, { headers: auth(coach) });
    expect(await memberRole(db, tenantId, invited)).toBe("trainer");
  }, 40_000);
});
