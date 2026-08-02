/**
 * STAFF — the guards, over real HTTP.
 *
 * The happy path (invite → accept → they can work) is the easy half. What is
 * worth a test is the set of refusals, because every one of them is a PERMANENT
 * lockout that returns 200 if it is missing:
 *
 *   demoting the last owner       nobody can reach billing or settings again
 *   changing your own role        the same, one click faster
 *   removing yourself             the same
 *   a non-owner managing staff    whoever can add staff can add themselves owner
 *
 * None of these throws. Each is a plausible-looking action whose consequence
 * only appears on the next page load, by which time the person who did it can no
 * longer undo it.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";
import { seedBilling } from "../src/billing-store.js";

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
  if (!otp) throw new Error(`no OTP for ${email}`);
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

/** A centre with an owner, returning everything a test needs to act as them. */
async function centre(): Promise<{ origin: string; jar: string; tenantId: string; userId: string }> {
  const email = `owner-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const slug = `centre-${crypto.randomUUID().slice(0, 6)}`;
  const jar = await signIn(email);
  await SELF.fetch(`${SETUP}/api/auth/organization/create`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SETUP, cookie: jar },
    body: JSON.stringify({ name: "Praxis", slug }),
  });
  const org = await db().prepare('SELECT id FROM "organization" WHERE slug = ?').bind(slug).first<{ id: string }>();
  const user = await db().prepare('SELECT id FROM "user" WHERE LOWER(email) = ?').bind(email).first<{ id: string }>();
  return { origin: `http://${slug}.localhost:8787`, jar, tenantId: org!.id, userId: user!.id };
}

const json = (jar: string) => ({ "content-type": "application/json", cookie: jar });

beforeAll(async () => {
  await ensureSchema(db());
  await seedBilling(db());
});

describe("the staff list", () => {
  it("reports the roles, the seat ceiling, and what each role may do", async () => {
    const c = await centre();
    const res = await SELF.fetch(`${c.origin}/api/staff`, { headers: { cookie: c.jar } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      members: { role: string }[];
      seats: { used: number; max: number; remaining: number };
      roles: { name: string; label: string; grant: Record<string, string[]> }[];
      canManage: boolean;
    };

    // The creator is a member and an owner — and consumes a seat, which is the
    // whole point of CUSTOMER_ROLE being a sentinel nobody holds.
    expect(body.members).toHaveLength(1);
    expect(body.members[0]!.role).toBe("owner");
    expect(body.seats.used).toBe(1);
    expect(body.canManage).toBe(true);

    // All five roles travel with their grant, so the screen renders "what this
    // role can do" from the same registry the server enforces.
    expect(body.roles.map((r) => r.name).sort()).toEqual(["auditor", "clinical", "cssd", "owner", "stockKeeper"]);
    const cssd = body.roles.find((r) => r.name === "cssd")!;
    expect(cssd.grant.sterilisation).toContain("release");
  });
});

describe("inviting", () => {
  it("creates a pending invitation that reserves a seat", async () => {
    const c = await centre();
    const email = `nurse-${crypto.randomUUID().slice(0, 6)}@example.com`;
    const res = await SELF.fetch(`${c.origin}/api/staff/invite`, {
      method: "POST",
      headers: json(c.jar),
      body: JSON.stringify({ email, role: "cssd" }),
    });
    expect(res.status, await res.clone().text()).toBe(201);
    const body = (await res.json()) as { id: string; url: string };
    // The link points at the CENTRE's hostname, whatever origin the owner was
    // standing on when they sent it.
    expect(body.url).toContain("/accept-invitation/");

    const after = (await (await SELF.fetch(`${c.origin}/api/staff`, { headers: { cookie: c.jar } })).json()) as {
      invitations: { email: string; role: string }[];
      seats: { pending: number; remaining: number; max: number };
    };
    expect(after.invitations).toHaveLength(1);
    expect(after.invitations[0]!.role).toBe("cssd");
    // A pending invitation HOLDS a seat. Reporting it as free is how a centre
    // sends five invitations against one seat and four fail on acceptance.
    expect(after.seats.pending).toBe(1);
    expect(after.seats.remaining).toBe(after.seats.max - 2);
  });

  it("refuses a second invitation to the same address", async () => {
    const c = await centre();
    const email = `dup-${crypto.randomUUID().slice(0, 6)}@example.com`;
    const body = JSON.stringify({ email, role: "clinical" });
    expect((await SELF.fetch(`${c.origin}/api/staff/invite`, { method: "POST", headers: json(c.jar), body })).status).toBe(201);
    // A second pending row could never be accepted — the accept hook returns
    // early once a membership exists — so it would sit on the screen forever.
    const second = await SELF.fetch(`${c.origin}/api/staff/invite`, { method: "POST", headers: json(c.jar), body });
    expect(second.status).toBe(409);
  });

  it("refuses inviting someone already on staff", async () => {
    const c = await centre();
    const owner = await db().prepare('SELECT email FROM "user" WHERE id = ?').bind(c.userId).first<{ email: string }>();
    const res = await SELF.fetch(`${c.origin}/api/staff/invite`, {
      method: "POST",
      headers: json(c.jar),
      body: JSON.stringify({ email: owner!.email, role: "clinical" }),
    });
    expect(res.status).toBe(409);
  });

  it("refuses a role that does not exist", async () => {
    const c = await centre();
    const res = await SELF.fetch(`${c.origin}/api/staff/invite`, {
      method: "POST",
      headers: json(c.jar),
      body: JSON.stringify({ email: "x@example.com", role: "superuser" }),
    });
    expect(res.status).toBe(400);
  });

  it("revokes a pending invitation, and only its own centre's", async () => {
    const a = await centre();
    const b = await centre();
    const invite = (await (
      await SELF.fetch(`${a.origin}/api/staff/invite`, {
        method: "POST",
        headers: json(a.jar),
        body: JSON.stringify({ email: `rev-${crypto.randomUUID().slice(0, 6)}@example.com`, role: "auditor" }),
      })
    ).json()) as { id: string };

    // Centre B cannot revoke centre A's invitation. The DELETE is scoped by
    // tenant, so an id from elsewhere is simply not found.
    const cross = await SELF.fetch(`${b.origin}/api/staff/invitations/${invite.id}`, { method: "DELETE", headers: { cookie: b.jar } });
    expect(cross.status).toBe(404);

    const own = await SELF.fetch(`${a.origin}/api/staff/invitations/${invite.id}`, { method: "DELETE", headers: { cookie: a.jar } });
    expect(own.status).toBe(200);
  });
});

describe("the lockout guards", () => {
  it("lets a SECOND owner be demoted, so the count is a count and not a constant", async () => {
    /**
     * The reachable half of the last-owner guard.
     *
     * The unreachable half is the guard firing: the only caller is an owner, so
     * demoting the last owner means demoting themselves, which the self-guard
     * refuses first. What CAN be got wrong here is the comparison — `<= 2`, or
     * counting members instead of owners — and that shows up as a centre with
     * two owners unable to demote either.
     */
    const c = await centre();
    const other = `co-${crypto.randomUUID().slice(0, 6)}@example.com`;
    await signIn(other);
    const u2 = await db().prepare('SELECT id FROM "user" WHERE LOWER(email) = ?').bind(other).first<{ id: string }>();
    await db()
      .prepare('INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), c.tenantId, u2!.id, "owner", new Date().toISOString())
      .run();

    const res = await SELF.fetch(`${c.origin}/api/staff/${u2!.id}/role`, {
      method: "PATCH",
      headers: json(c.jar),
      body: JSON.stringify({ role: "clinical" }),
    });
    expect(res.status, await res.clone().text()).toBe(200);

    // …and now that they are the only owner again, the centre still has one.
    const owners = await db()
      .prepare('SELECT COUNT(*) AS n FROM "member" WHERE organizationId = ? AND role = ?')
      .bind(c.tenantId, "owner")
      .first<{ n: number }>();
    expect(owners?.n).toBe(1);
  });

  it("refuses an owner changing their OWN role", async () => {
    const c = await centre();
    const res = await SELF.fetch(`${c.origin}/api/staff/${c.userId}/role`, {
      method: "PATCH",
      headers: json(c.jar),
      body: JSON.stringify({ role: "clinical" }),
    });
    expect(res.status).toBe(409);
    // …and it really is unchanged, not just reported as refused.
    const row = await db().prepare('SELECT role FROM "member" WHERE organizationId = ? AND userId = ?').bind(c.tenantId, c.userId).first<{ role: string }>();
    expect(row?.role).toBe("owner");
  });

  it("refuses an owner removing themselves", async () => {
    const c = await centre();
    const res = await SELF.fetch(`${c.origin}/api/staff/${c.userId}`, { method: "DELETE", headers: { cookie: c.jar } });
    expect(res.status).toBe(409);
  });

  it("refuses a non-owner managing staff at all", async () => {
    const c = await centre();
    const staff = `st-${crypto.randomUUID().slice(0, 6)}@example.com`;
    const jar2 = await signIn(staff);
    const u2 = await db().prepare('SELECT id FROM "user" WHERE LOWER(email) = ?').bind(staff).first<{ id: string }>();
    await db()
      .prepare('INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), c.tenantId, u2!.id, "cssd", new Date().toISOString())
      .run();

    // A CSSD member is a real, trusted role — they perform the Freigabe. They
    // still may not add staff, because whoever can add staff can add themselves
    // an owner.
    for (const [method, path, body] of [
      ["POST", "/api/staff/invite", JSON.stringify({ email: "x@example.com", role: "owner" })],
      ["PATCH", `/api/staff/${c.userId}/role`, JSON.stringify({ role: "clinical" })],
      ["DELETE", `/api/staff/${c.userId}`, undefined],
    ] as const) {
      const res = await SELF.fetch(`${c.origin}${path}`, { method, headers: json(jar2), body });
      expect(res.status, `${method} ${path}`).toBe(403);
    }

    // …but they CAN read the list. Checking who holds release rights before a
    // shift handover is not a privileged question.
    const read = await SELF.fetch(`${c.origin}/api/staff`, { headers: { cookie: jar2 } });
    expect(read.status).toBe(200);
    expect(((await read.json()) as { canManage: boolean }).canManage).toBe(false);
  });

  it("lets an owner re-role and remove someone who is not them", async () => {
    const c = await centre();
    const staff = `mv-${crypto.randomUUID().slice(0, 6)}@example.com`;
    await signIn(staff);
    const u2 = await db().prepare('SELECT id FROM "user" WHERE LOWER(email) = ?').bind(staff).first<{ id: string }>();
    await db()
      .prepare('INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), c.tenantId, u2!.id, "clinical", new Date().toISOString())
      .run();

    const promoted = await SELF.fetch(`${c.origin}/api/staff/${u2!.id}/role`, {
      method: "PATCH",
      headers: json(c.jar),
      body: JSON.stringify({ role: "cssd" }),
    });
    expect(promoted.status, await promoted.clone().text()).toBe(200);
    const row = await db().prepare('SELECT role FROM "member" WHERE organizationId = ? AND userId = ?').bind(c.tenantId, u2!.id).first<{ role: string }>();
    expect(row?.role).toBe("cssd");

    expect((await SELF.fetch(`${c.origin}/api/staff/${u2!.id}`, { method: "DELETE", headers: { cookie: c.jar } })).status).toBe(200);
    const gone = await db().prepare('SELECT 1 AS x FROM "member" WHERE organizationId = ? AND userId = ?').bind(c.tenantId, u2!.id).first<{ x: number }>();
    expect(gone).toBeNull();
  });
});

describe("cross-tenant scope", () => {
  it("never lets one centre act on another's member", async () => {
    const a = await centre();
    const b = await centre();
    // B's owner, addressed on B's own host, is still not A's member — so A's
    // owner cannot touch them, and neither can B's owner reach A's roster by
    // aiming at A's host with B's session.
    const res = await SELF.fetch(`${a.origin}/api/staff/${b.userId}/role`, {
      method: "PATCH",
      headers: json(a.jar),
      body: JSON.stringify({ role: "auditor" }),
    });
    expect(res.status).toBe(404);

    const foreign = await SELF.fetch(`${a.origin}/api/staff`, { headers: { cookie: b.jar } });
    // B's session on A's host resolves no membership of A — the tenancy is
    // pinned from the hostname before the session is read.
    expect(foreign.status).toBeGreaterThanOrEqual(400);
  });
});
