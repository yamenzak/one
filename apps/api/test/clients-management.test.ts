/**
 * Client management flows that had routes but no caller until now (AGENTS.md §3
 * "half-wiring"): coach assignment (`client_trainers`) and archive/offboard.
 *
 * The payoff assertion is deliberately made THROUGH `GET /api/clients` as the
 * trainer, not by reading `client_trainers` — `visibleClientIds` is what turns a
 * row in that table into a roster, and the roster is what the coach actually
 * sees. Same for archive: the seat must STAY taken, proven by `POST /clients`
 * still 403ing after it — and come back only once the record is deleted.
 *
 * Note (AGENTS.md §4): the pool sets ADMIN_EMAILS "" + ENVIRONMENT development,
 * so every signed-in user here is a platform admin and route-guard's ACTION gate
 * short-circuits. Nothing below asserts an action-gate 403 — only
 * `requireClientAccess` rejections and `visibleClientIds` scoping, both of which
 * run inside the handlers and ignore platform-admin status.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";

const ORIGIN = "http://localhost:8787"; // treated as local by createAuth (non-secure cookies)

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
const json = (cookies: string) => ({ "content-type": "application/json", ...auth(cookies) });

const tenantOf = async (cookies: string): Promise<string> =>
  ((await (await SELF.fetch("http://x/api/context", { headers: auth(cookies) })).json()) as { active: { tenantId: string } }).active.tenantId;

const mkClient = async (cookies: string, displayName: string): Promise<string> =>
  ((await (
    await SELF.fetch("http://x/api/clients", { method: "POST", headers: json(cookies), body: JSON.stringify({ displayName }) })
  ).json()) as { client: { id: string } }).client.id;

const rosterIds = async (cookies: string): Promise<string[]> =>
  ((await (await SELF.fetch("http://x/api/clients", { headers: auth(cookies) })).json()) as { clients: { id: string }[] }).clients.map((c) => c.id);

const trainersOf = async (cookies: string, clientId: string) =>
  ((await (await SELF.fetch(`http://x/api/clients/${clientId}/trainers`, { headers: auth(cookies) })).json()) as {
    trainers: { userId: string; isPrimary: boolean; name: string | null; email: string | null }[];
  }).trainers;

/** Sign a user in, add them to `tenantId` with `role`, and switch them into it. */
async function staffIn(tenantId: string, email: string, ownOrg: string, role: string): Promise<{ cookie: string; userId: string }> {
  const db = env.DB as D1Database;
  const cookie = await signInFlow(email, ownOrg);
  const user = await db.prepare('SELECT id FROM "user" WHERE email = ?').bind(email).first<{ id: string }>();
  await db
    .prepare('INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)')
    .bind(`mbr_${user!.id}_${tenantId}`.slice(0, 60), tenantId, user!.id, role, "2026-01-01")
    .run();
  const sw = await SELF.fetch("http://x/api/context/switch", { method: "POST", headers: json(cookie), body: JSON.stringify({ tenantId }) });
  expect(sw.status).toBe(200);
  return { cookie, userId: user!.id };
}

let ownerCookie = "";
let ownerTenant = "";

beforeAll(async () => {
  await ensureSchema(env.DB as D1Database);
  ownerCookie = await signInFlow("cm-owner@test.dev", "Client Mgmt Studio");
  ownerTenant = await tenantOf(ownerCookie);
});

describe("coach assignment (client_trainers)", () => {
  it("assigning a coach puts the client on their roster; unassigning takes it back off", async () => {
    const trainer = await staffIn(ownerTenant, "cm-coach@test.dev", "CM Coach Org", "trainer");
    const clientA = await mkClient(ownerCookie, "Handed Over");
    const clientB = await mkClient(ownerCookie, "Kept By Owner");

    // Before any assignment the coach's roster is empty — the exact dead end the
    // missing UI produced (owner-created clients are auto-assigned to the OWNER).
    expect(await rosterIds(trainer.cookie)).toEqual([]);
    expect((await SELF.fetch(`http://x/api/clients/${clientA}`, { headers: auth(trainer.cookie) })).status).toBe(403);

    const assign = await SELF.fetch(`http://x/api/clients/${clientA}/trainers`, {
      method: "POST",
      headers: json(ownerCookie),
      body: JSON.stringify({ trainerUserId: trainer.userId }),
    });
    expect(assign.status).toBe(200);

    // THE payoff: the roster the coach sees now contains A and still not B.
    const after = await rosterIds(trainer.cookie);
    expect(after).toContain(clientA);
    expect(after).not.toContain(clientB);
    expect((await SELF.fetch(`http://x/api/clients/${clientA}`, { headers: auth(trainer.cookie) })).status).toBe(200);
    expect((await SELF.fetch(`http://x/api/clients/${clientB}`, { headers: auth(trainer.cookie) })).status).toBe(403);

    // …and the owner's Coaches list shows both themself (creator auto-assign) and
    // the coach they just handed the client to.
    const listed = await trainersOf(ownerCookie, clientA);
    expect(listed.map((t) => t.userId)).toContain(trainer.userId);
    expect(listed.length).toBe(2);

    const unassign = await SELF.fetch(`http://x/api/clients/${clientA}/trainers/${trainer.userId}`, {
      method: "DELETE",
      headers: auth(ownerCookie),
    });
    expect(unassign.status).toBe(200);

    // Removing the row removes the roster entry AND the row-level access again.
    expect(await rosterIds(trainer.cookie)).not.toContain(clientA);
    expect((await SELF.fetch(`http://x/api/clients/${clientA}`, { headers: auth(trainer.cookie) })).status).toBe(403);
    expect((await trainersOf(ownerCookie, clientA)).map((t) => t.userId)).not.toContain(trainer.userId);
  });

  it("isPrimary moves the flag — exactly one primary coach at a time", async () => {
    const trainer = await staffIn(ownerTenant, "cm-primary@test.dev", "CM Primary Org", "trainer");
    const clientId = await mkClient(ownerCookie, "Primary Routing");

    // The creator (owner) is auto-assigned primary.
    const before = await trainersOf(ownerCookie, clientId);
    expect(before.filter((t) => t.isPrimary).length).toBe(1);
    expect(before.find((t) => t.isPrimary)!.userId).not.toBe(trainer.userId);

    const res = await SELF.fetch(`http://x/api/clients/${clientId}/trainers`, {
      method: "POST",
      headers: json(ownerCookie),
      body: JSON.stringify({ trainerUserId: trainer.userId, isPrimary: true }),
    });
    expect(res.status).toBe(200);

    const after = await trainersOf(ownerCookie, clientId);
    expect(after.filter((t) => t.isPrimary).length).toBe(1);
    expect(after.find((t) => t.isPrimary)!.userId).toBe(trainer.userId);
    // Promoting doesn't unassign the previous primary — they keep the client.
    expect(after.length).toBe(2);
  });

  it("only staff can be assigned — a stranger and a client-role member are 400", async () => {
    const clientId = await mkClient(ownerCookie, "Assign Validation");
    const post = (body: unknown) =>
      SELF.fetch(`http://x/api/clients/${clientId}/trainers`, { method: "POST", headers: json(ownerCookie), body: JSON.stringify(body) });

    expect((await post({ trainerUserId: "usr_not_a_member" })).status).toBe(400);
    expect((await post({})).status).toBe(400); // trainerUserId is required

    const db = env.DB as D1Database;
    await db
      .prepare('INSERT OR IGNORE INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)')
      .bind("mbr_cm_clientrole", ownerTenant, "usr_cm_clientrole", "client", "2026-01-01")
      .run();
    expect((await post({ trainerUserId: "usr_cm_clientrole" })).status).toBe(400);
  });

  it("a coach cannot reach the coach list of a client they were never given", async () => {
    const trainer = await staffIn(ownerTenant, "cm-outsider@test.dev", "CM Outsider Org", "trainer");
    const clientId = await mkClient(ownerCookie, "Not Theirs");
    // requireClientAccess, not the action gate — observable despite the admin bypass.
    expect((await SELF.fetch(`http://x/api/clients/${clientId}/trainers`, { headers: auth(trainer.cookie) })).status).toBe(403);
    expect(
      (
        await SELF.fetch(`http://x/api/clients/${clientId}/trainers`, {
          method: "POST",
          headers: json(trainer.cookie),
          body: JSON.stringify({ trainerUserId: trainer.userId }),
        })
      ).status,
    ).toBe(403);
  });
});

describe("archive / offboard", () => {
  it("archiving drops the client from the roster but keeps the seat", async () => {
    // A brand-new tenant starts on `free` (billing-store DEFAULT_PLANS):
    // activeClients = 3, so the ceiling is reachable in three creates.
    const cookie = await signInFlow("cm-quota@test.dev", "CM Quota Studio");
    const a = await mkClient(cookie, "Quota One");
    const b = await mkClient(cookie, "Quota Two");
    await mkClient(cookie, "Quota Three");

    // Fourth create is refused — the ratchet an owner with no archive UI was stuck in.
    const blocked = await SELF.fetch("http://x/api/clients", { method: "POST", headers: json(cookie), body: JSON.stringify({ displayName: "Quota Four" }) });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ error: "active client limit reached", limit: 3 });

    const archived = await SELF.fetch(`http://x/api/clients/${a}/archive`, { method: "POST", headers: auth(cookie) });
    expect(archived.status).toBe(200);
    expect(await archived.json()).toMatchObject({ ok: true });

    // Off the roster…
    const roster = await rosterIds(cookie);
    expect(roster).not.toContain(a);
    expect(roster).toContain(b);

    // …but the seat is NOT back. The studio is still storing that client's whole
    // record, so it is still using the capacity it bought. Archiving used to free
    // the seat, which meant a 3-seat studio could hold unlimited client data by
    // archiving everyone. Deleting is what frees a seat, because deleting is what
    // stops the storage.
    const still = await SELF.fetch("http://x/api/clients", { method: "POST", headers: json(cookie), body: JSON.stringify({ displayName: "Quota Four" }) });
    expect(still.status).toBe(403);

    // Erasing the archived record does free it.
    const del = await SELF.fetch(`http://x/api/clients/${a}/delete`, { method: "POST", headers: json(cookie), body: JSON.stringify({ confirm: "Quota One" }) });
    expect(del.status).toBe(200);
    const allowed = await SELF.fetch("http://x/api/clients", { method: "POST", headers: json(cookie), body: JSON.stringify({ displayName: "Quota Four" }) });
    expect(allowed.status).toBe(201);
  });

  it("archiving retains the record and stamps archived_at (no delete, no un-archive route)", async () => {
    const clientId = await mkClient(ownerCookie, "Retained");
    expect((await SELF.fetch(`http://x/api/clients/${clientId}/archive`, { method: "POST", headers: auth(ownerCookie) })).status).toBe(200);

    const row = await (env.DB as D1Database)
      .prepare("SELECT status, archived_at, display_name FROM clients WHERE id = ?")
      .bind(clientId)
      .first<{ status: string; archived_at: string | null; display_name: string }>();
    expect(row).toMatchObject({ status: "archived", display_name: "Retained" });
    expect(row!.archived_at).toBeTruthy();

    // The record is still addressable by id for staff (requireClientAccess uses
    // getClient, which does not filter status) — this is what "data is retained"
    // means in the archive copy. There is no route back to 'active'.
    expect((await SELF.fetch(`http://x/api/clients/${clientId}`, { headers: auth(ownerCookie) })).status).toBe(200);
    expect(await rosterIds(ownerCookie)).not.toContain(clientId);

    // A linked client user loses their own space: clientForUser filters archived,
    // which is why the UI copy says they lose access.
    const linked = await (env.DB as D1Database).prepare("SELECT COUNT(*) AS n FROM clients WHERE id = ? AND status != 'archived'").bind(clientId).first<{ n: number }>();
    expect(linked!.n).toBe(0);
  });
});
