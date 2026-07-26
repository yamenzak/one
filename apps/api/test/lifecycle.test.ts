/**
 * Client lifecycle + downgrade eligibility (SPEC §5, §8.1) — Miniflare
 * integration, conventions copied from api.test.ts.
 *
 * Two flows:
 *
 *  1. **Offboarding.** Archive frees an `activeClients` slot and keeps the
 *     record; `POST /clients/:id/delete` frees the same slot AND erases the D1
 *     rows + the R2 objects, including the two classes that used to escape the
 *     `t/<tenant>/c/<client>/` prefix sweep (the client's own avatar and AI
 *     images). The freed-slot assertions are the real proof: a create that 403s
 *     on quota must succeed afterwards.
 *
 *  2. **Downgrade.** The checklist reports the right blockers with real numbers;
 *     an ineligible plan change is refused server-side — both on the dedicated
 *     `/billing/plan-change` route AND on the pre-existing Stripe
 *     `/billing/plan-intent` route it guards — and goes through once the
 *     blockers are cleared.
 *
 * NOTE on what these can assert (AGENTS §4): vitest.config.ts makes every
 * signed-in test user a platform admin, so route-guard action-gate 403s are NOT
 * observable here. The negative cases below assert `requireClientAccess`
 * rejections and the in-handler owner check, both of which run inside handlers
 * and never consult platform-admin status.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";

const B = "http://localhost:8787";

function grabCookies(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() ?? []).map((c: string) => c.split(";")[0]).join("; ");
}

/** Read the freshest OTP straight out of the local verification table. */
async function latestOtp(email: string): Promise<string> {
  const db = env.DB as D1Database;
  const row = await db
    .prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1")
    .bind(`%otp%${email}%`)
    .first<{ value: string }>();
  const fallback = await db.prepare("SELECT value FROM verification ORDER BY createdAt DESC LIMIT 1").first<{ value: string }>();
  const otp = ((row?.value ?? fallback?.value ?? "").match(/\d{6}/) ?? [])[0];
  if (!otp) throw new Error("could not read OTP from verification table");
  return otp;
}

async function signIn(email: string): Promise<string> {
  await SELF.fetch(`${B}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: B },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const otp = await latestOtp(email);
  return grabCookies(
    await SELF.fetch(`${B}/api/auth/sign-in/email-otp`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: B },
      body: JSON.stringify({ email, otp }),
    }),
  );
}

/** Full passwordless sign-in + studio create (owner). */
async function signInFlow(email: string, studioName: string): Promise<string> {
  let cookies = await signIn(email);
  const org = await SELF.fetch(`${B}/api/auth/organization/create`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: B, Cookie: cookies },
    body: JSON.stringify({ name: studioName, slug: studioName.toLowerCase().replace(/[^a-z0-9]+/g, "-") }),
  });
  const refreshed = grabCookies(org);
  if (refreshed) cookies = refreshed;
  return cookies;
}

const auth = (cookies: string) => ({ Cookie: cookies, origin: B });
const json = (cookies: string) => ({ "content-type": "application/json", ...auth(cookies) });

async function tenantOf(cookie: string): Promise<string> {
  const ctx = (await (await SELF.fetch(`${B}/api/context`, { headers: auth(cookie) })).json()) as { active: { tenantId: string } };
  return ctx.active.tenantId;
}

/** Pin a tenant's quotas directly on its subscription override (grant-only, so
 *  these RAISE nothing we then rely on being low) — no: overrides can only raise,
 *  so capacity is squeezed by writing a throwaway plan instead. See `pinPlan`. */
async function pinPlan(tenantId: string, planId: string, quotas: Record<string, number>, features: Record<string, boolean> = {}): Promise<void> {
  const db = env.DB as D1Database;
  await db
    .prepare("INSERT INTO plans (id, name, price_usd_month, entitlements_json, ord, active) VALUES (?, ?, ?, ?, 99, 1) ON CONFLICT(id) DO UPDATE SET entitlements_json = excluded.entitlements_json, price_usd_month = excluded.price_usd_month, active = 1")
    .bind(planId, planId, quotasPrice(planId), JSON.stringify({ quotas, features, aiCredits: { monthlyGrant: 0 } }))
    .run();
  await db.prepare("INSERT INTO subscriptions (tenant_id, plan_id, status, comp, updated_at) VALUES (?, ?, 'active', 0, ?) ON CONFLICT(tenant_id) DO UPDATE SET plan_id = excluded.plan_id, status = 'active', overrides_json = NULL")
    .bind(tenantId, planId, new Date().toISOString())
    .run();
}
/** Throwaway test plans get a price derived from the id so "is this a downgrade"
 *  (a catalog-price comparison, never a hardcoded tier order) has something to
 *  compare. `_pN` suffix = $N/month. */
function quotasPrice(planId: string): number {
  const m = planId.match(/_p(\d+)$/);
  return m ? Number(m[1]) : 50;
}

const mkClient = async (cookie: string, displayName: string, email?: string): Promise<{ status: number; id: string | null }> => {
  const res = await SELF.fetch(`${B}/api/clients`, {
    method: "POST",
    headers: json(cookie),
    body: JSON.stringify({ displayName, ...(email ? { email } : {}) }),
  });
  const body = (await res.json().catch(() => ({}))) as { client?: { id: string } };
  return { status: res.status, id: body.client?.id ?? null };
};

beforeAll(async () => {
  await ensureSchema(env.DB as D1Database);
});

describe("client offboarding — archive frees a slot, delete frees it and reclaims storage", () => {
  it("delete removes the client's rows AND its R2 objects, and frees a slot a 403 proved was full", async () => {
    const db = env.DB as D1Database;
    const cookie = await signInFlow("lc-del@test.dev", "Delete Studio");
    const tenantId = await tenantOf(cookie);
    // A two-client ceiling, so "the slot is free" is observable as a 403 → 201.
    await pinPlan(tenantId, "lc_del_p50", { staffSeats: 5, activeClients: 2, templates: 5, storageMb: 500 });

    const a = await mkClient(cookie, "Keeper");
    const b = await mkClient(cookie, "Goner");
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const goner = b.id!;

    // At the ceiling → the third create is refused.
    expect((await mkClient(cookie, "Third")).status).toBe(403);

    // Give the client data across three storage shapes:
    //  1. a client-scoped upload  → t/<tenant>/c/<client>/progress/… (inside the prefix)
    //  2. their avatar            → t/<tenant>/avatar/…  (OUTSIDE it, client_id NULL)
    //  3. an AI-attributed image  → t/<tenant>/ai/…      (OUTSIDE it, client_id set)
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(4096)], { type: "image/png" }), "progress.png");
    form.set("purpose", "progress");
    form.set("clientId", goner);
    const scoped = (await (await SELF.fetch(`${B}/api/media/upload`, { method: "POST", headers: auth(cookie), body: form })).json()) as { key: string };

    const avatarForm = new FormData();
    avatarForm.set("file", new Blob([new Uint8Array(2048)], { type: "image/png" }), "face.png");
    avatarForm.set("purpose", "avatar"); // no clientId — exactly how the app uploads it
    const avatar = (await (await SELF.fetch(`${B}/api/media/upload`, { method: "POST", headers: auth(cookie), body: avatarForm })).json()) as { key: string };
    expect(avatar.key.startsWith(`t/${tenantId}/avatar/`)).toBe(true);
    expect((await SELF.fetch(`${B}/api/clients/${goner}/avatar`, { method: "POST", headers: json(cookie), body: JSON.stringify({ avatarUrl: `/api/media/${avatar.key}` }) })).status).toBe(200);

    // The AI-image shape, written the way ai.ts writes it: outside the client
    // prefix, but stamped with the client id on the ledger row.
    const aiKey = `t/${tenantId}/ai/lc_del_img.png`;
    await env.MEDIA.put(aiKey, new Uint8Array(1024), { httpMetadata: { contentType: "image/png" } });
    await db
      .prepare("INSERT INTO media_assets (id, tenant_id, client_id, r2_key, purpose, content_type, size_bytes, created_at) VALUES ('mda_lc_del_ai', ?, ?, ?, 'ai', 'image/png', 1024, ?)")
      .bind(tenantId, goner, aiKey, new Date().toISOString())
      .run();

    await SELF.fetch(`${B}/api/check-ins`, { method: "POST", headers: json(cookie), body: JSON.stringify({ clientId: goner, data: { date: "2026-06-10", mood: 4 } }) });
    await SELF.fetch(`${B}/api/measurements`, { method: "POST", headers: json(cookie), body: JSON.stringify({ clientId: goner, data: { date: "2026-06-10", weightKg: 70 } }) });

    // Sanity: all three objects exist and the meter counts them. (Drain the R2
    // bodies — isolated-storage hygiene, as api.test.ts does.)
    for (const k of [scoped.key, avatar.key, aiKey]) {
      const o = await env.MEDIA.get(k);
      expect(o, `object missing before delete: ${k}`).not.toBeNull();
      await o!.arrayBuffer();
    }
    const usageBefore = (await (await SELF.fetch(`${B}/api/storage-usage`, { headers: auth(cookie) })).json()) as { usedBytes: number };
    expect(usageBefore.usedBytes).toBeGreaterThanOrEqual(4096 + 2048 + 1024);

    // A single tap can't do it: the typed confirmation is enforced server-side.
    const wrong = await SELF.fetch(`${B}/api/clients/${goner}/delete`, { method: "POST", headers: json(cookie), body: JSON.stringify({ confirm: "whatever" }) });
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { error: string }).error).toBe("confirm_mismatch");
    expect(await db.prepare("SELECT id FROM clients WHERE id = ?").bind(goner).first()).not.toBeNull();

    const res = await SELF.fetch(`${B}/api/clients/${goner}/delete`, { method: "POST", headers: json(cookie), body: JSON.stringify({ confirm: "goner" }) }); // case-insensitive
    expect(res.status).toBe(200);
    const out = (await res.json()) as { storage: { objectsRemoved: number; bytesFreed: number }; activeClients: { used: number; max: number } };

    // D1: the record and its child rows are gone.
    expect(await db.prepare("SELECT id FROM clients WHERE id = ?").bind(goner).first()).toBeNull();
    expect((await db.prepare("SELECT COUNT(*) AS n FROM check_ins WHERE client_id = ?").bind(goner).first<{ n: number }>())!.n).toBe(0);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM measurements WHERE client_id = ?").bind(goner).first<{ n: number }>())!.n).toBe(0);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM client_trainers WHERE client_id = ?").bind(goner).first<{ n: number }>())!.n).toBe(0);

    // R2: all three objects gone — including the two outside the client prefix,
    // which a prefix-only sweep left behind.
    expect(await env.MEDIA.get(scoped.key), "client-scoped object survived").toBeNull();
    expect(await env.MEDIA.get(avatar.key), "avatar survived erasure (outside the client prefix)").toBeNull();
    expect(await env.MEDIA.get(aiKey), "AI image survived erasure (outside the client prefix)").toBeNull();

    // The reported figure is real: the storage meter actually drops by it.
    expect(out.storage.objectsRemoved).toBeGreaterThanOrEqual(3);
    expect(out.storage.bytesFreed).toBeGreaterThanOrEqual(4096 + 2048 + 1024);
    const usageAfter = (await (await SELF.fetch(`${B}/api/storage-usage`, { headers: auth(cookie) })).json()) as { usedBytes: number };
    expect(usageAfter.usedBytes).toBe(usageBefore.usedBytes - out.storage.bytesFreed);

    // The slot is genuinely free: the create that 403'd now succeeds.
    expect(out.activeClients.used).toBe(1);
    expect(out.activeClients.max).toBe(2);
    expect((await mkClient(cookie, "Third")).status).toBe(201);
  }, 30_000);

  it("archive frees a slot but retains the record", async () => {
    const db = env.DB as D1Database;
    const cookie = await signInFlow("lc-arch@test.dev", "Archive Studio");
    const tenantId = await tenantOf(cookie);
    await pinPlan(tenantId, "lc_arch_p50", { staffSeats: 5, activeClients: 2, templates: 5, storageMb: 500 });

    const a = await mkClient(cookie, "Stays");
    const b = await mkClient(cookie, "Retired");
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    await SELF.fetch(`${B}/api/check-ins`, { method: "POST", headers: json(cookie), body: JSON.stringify({ clientId: b.id, data: { date: "2026-06-11", mood: 3 } }) });

    expect((await mkClient(cookie, "Third")).status).toBe(403);
    expect((await SELF.fetch(`${B}/api/clients/${b.id}/archive`, { method: "POST", headers: json(cookie), body: "{}" })).status).toBe(200);

    // Slot freed …
    expect((await mkClient(cookie, "Third")).status).toBe(201);
    // … and NOTHING erased — this is the whole difference from delete.
    const row = await db.prepare("SELECT status, archived_at FROM clients WHERE id = ?").bind(b.id).first<{ status: string; archived_at: string | null }>();
    expect(row!.status).toBe("archived");
    expect(row!.archived_at).toBeTruthy();
    expect((await db.prepare("SELECT COUNT(*) AS n FROM check_ins WHERE client_id = ?").bind(b.id).first<{ n: number }>())!.n).toBe(1);
    // Off the roster, but still readable by id (history review).
    const roster = (await (await SELF.fetch(`${B}/api/clients`, { headers: auth(cookie) })).json()) as { clients: { id: string }[] };
    expect(roster.clients.find((c) => c.id === b.id)).toBeFalsy();
  }, 30_000);

  it("delete is refused for a non-owner: an unassigned trainer 403s, and an assigned one still can't", async () => {
    const db = env.DB as D1Database;
    const owner = await signInFlow("lc-scope-owner@test.dev", "Scope Studio");
    const tenantId = await tenantOf(owner);
    const assigned = (await mkClient(owner, "Assigned")).id!;
    const victim = (await mkClient(owner, "Victim")).id!;

    const trainerCookie = await signInFlow("lc-scope-trainer@test.dev", "Scope Trainer Org");
    const trainerUser = (await db.prepare('SELECT id FROM "user" WHERE email = ?').bind("lc-scope-trainer@test.dev").first<{ id: string }>())!;
    await db.prepare('INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)')
      .bind("mbr_lc_scope_trainer", tenantId, trainerUser.id, "trainer", "2026-01-01")
      .run();
    await SELF.fetch(`${B}/api/clients/${assigned}/trainers`, { method: "POST", headers: json(owner), body: JSON.stringify({ trainerUserId: trainerUser.id }) });
    expect((await SELF.fetch(`${B}/api/context/switch`, { method: "POST", headers: json(trainerCookie), body: JSON.stringify({ tenantId }) })).status).toBe(200);

    const del = (cookie: string, clientId: string, confirm: string) =>
      SELF.fetch(`${B}/api/clients/${clientId}/delete`, { method: "POST", headers: json(cookie), body: JSON.stringify({ confirm }) });

    // requireClientAccess: no client_trainers link → 403 before anything else.
    expect((await del(trainerCookie, victim, "victim")).status).toBe(403);
    // Even WITH the link, deleting is an owner power — the in-handler role check.
    expect((await del(trainerCookie, assigned, "assigned")).status).toBe(403);
    // Nothing was removed by either attempt.
    expect(await db.prepare("SELECT id FROM clients WHERE id = ?").bind(victim).first()).not.toBeNull();
    expect(await db.prepare("SELECT id FROM clients WHERE id = ?").bind(assigned).first()).not.toBeNull();
    // The owner can.
    expect((await del(owner, victim, "Victim")).status).toBe(200);
  }, 30_000);
});

describe("downgrade checklist + server-side enforcement", () => {
  /** A studio on a roomy plan with a tight target plan to move down to. */
  async function studio(tag: string, opts: { clients: number; targetActiveClients: number; targetTemplates?: number; targetStorageMb?: number }) {
    const cookie = await signInFlow(`${tag}@test.dev`, `${tag} Studio`);
    const tenantId = await tenantOf(cookie);
    await pinPlan(tenantId, `${tag}_big_p90`, { staffSeats: 10, activeClients: 50, templates: -1, storageMb: 5000 });
    await pinPlan(tenantId, `${tag}_big_p90`, { staffSeats: 10, activeClients: 50, templates: -1, storageMb: 5000 });
    // The target: deliberately tighter.
    const db = env.DB as D1Database;
    await db
      .prepare("INSERT INTO plans (id, name, price_usd_month, entitlements_json, ord, active) VALUES (?, ?, 10, ?, 98, 1) ON CONFLICT(id) DO UPDATE SET entitlements_json = excluded.entitlements_json, price_usd_month = 10, active = 1")
      .bind(`${tag}_small_p10`, `${tag} Small`, JSON.stringify({
        quotas: {
          staffSeats: 10,
          activeClients: opts.targetActiveClients,
          templates: opts.targetTemplates ?? -1,
          storageMb: opts.targetStorageMb ?? 5000,
        },
        features: {},
        aiCredits: { monthlyGrant: 0 },
      }))
      .run();
    for (let i = 0; i < opts.clients; i++) expect((await mkClient(cookie, `${tag} C${i}`)).status).toBe(201);
    return { cookie, tenantId, target: `${tag}_small_p10`, big: `${tag}_big_p90` };
  }

  const check = async (cookie: string, planId: string) => {
    const res = await SELF.fetch(`${B}/api/billing/downgrade-check`, { method: "POST", headers: json(cookie), body: JSON.stringify({ planId }) });
    return { status: res.status, body: (await res.json()) as { eligible: boolean; clean: boolean; blockers: { key: string; hard: boolean; current: number; ceiling: number; removeCount: number; action?: { href: string } }[]; usage: { activeClients: number } } };
  };

  it("reports the right blockers with real numbers, and separates hard from soft", async () => {
    const { cookie, target } = await studio("lcdg1", { clients: 4, targetActiveClients: 2, targetStorageMb: 1 });
    // 3 MB of media against a 1 MB target ceiling → a SOFT storage blocker.
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(3 * 1024 * 1024)], { type: "image/png" }), "big.png");
    form.set("purpose", "misc");
    expect((await SELF.fetch(`${B}/api/media/upload`, { method: "POST", headers: auth(cookie), body: form })).status).toBe(201);

    const { status, body } = await check(cookie, target);
    expect(status).toBe(200);
    expect(body.usage.activeClients).toBe(4);

    const clients = body.blockers.find((b) => b.key === "activeClients")!;
    expect(clients).toBeTruthy();
    expect(clients.hard).toBe(true);
    expect(clients.current).toBe(4);
    expect(clients.ceiling).toBe(2);
    expect(clients.removeCount).toBe(2); // exact remediation count
    expect(clients.action?.href).toBe("/clients"); // leads somewhere useful

    const storage = body.blockers.find((b) => b.key === "storageMb")!;
    expect(storage).toBeTruthy();
    expect(storage.hard).toBe(false); // soft: never refuses the change
    expect(storage.action?.href).toBe("/media");

    // A hard blocker present → not eligible, and not "clean" either.
    expect(body.eligible).toBe(false);
    expect(body.clean).toBe(false);

    // Unlimited ceilings are never blockers.
    expect(body.blockers.find((b) => b.key === "templates")).toBeFalsy();
  }, 30_000);

  it("refuses a blocked downgrade server-side — on plan-change AND on the guarded Stripe plan-intent", async () => {
    const db = env.DB as D1Database;
    const { cookie, tenantId, target } = await studio("lcdg2", { clients: 3, targetActiveClients: 1 });

    const change = await SELF.fetch(`${B}/api/billing/plan-change`, { method: "POST", headers: json(cookie), body: JSON.stringify({ planId: target }) });
    expect(change.status).toBe(409);
    const blocked = (await change.json()) as { error: string; blockers: { key: string; removeCount: number }[] };
    expect(blocked.error).toBe("downgrade_blocked");
    expect(blocked.blockers.find((b) => b.key === "activeClients")!.removeCount).toBe(2);
    // The plan was NOT changed.
    expect((await db.prepare("SELECT plan_id FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<{ plan_id: string }>())!.plan_id).toBe("lcdg2_big_p90");

    // The pre-existing Stripe route is gated by the same list: the guard runs
    // ahead of stripe-routes' handler and answers 409 instead of starting a
    // subscription. (Were the guard dead, this would be stripe's own 400/409.)
    const intent = await SELF.fetch(`${B}/api/billing/plan-intent`, { method: "POST", headers: json(cookie), body: JSON.stringify({ planId: target }) });
    expect(intent.status).toBe(409);
    expect(((await intent.json()) as { error: string }).error).toBe("downgrade_blocked");
  }, 30_000);

  it("succeeds once the blockers are cleared — re-checked on submit, not on open", async () => {
    const db = env.DB as D1Database;
    const { cookie, tenantId, target } = await studio("lcdg3", { clients: 3, targetActiveClients: 1 });

    // Open the sheet while ineligible (this is the stale snapshot).
    expect((await check(cookie, target)).body.eligible).toBe(false);

    const roster = (await (await SELF.fetch(`${B}/api/clients`, { headers: auth(cookie) })).json()) as { clients: { id: string; displayName: string }[] };
    expect(roster.clients.length).toBe(3);
    // One archived, one deleted — both must count towards the ceiling.
    expect((await SELF.fetch(`${B}/api/clients/${roster.clients[0]!.id}/archive`, { method: "POST", headers: json(cookie), body: "{}" })).status).toBe(200);
    expect((await SELF.fetch(`${B}/api/clients/${roster.clients[1]!.id}/delete`, { method: "POST", headers: json(cookie), body: JSON.stringify({ confirm: roster.clients[1]!.displayName }) })).status).toBe(200);

    // Submit WITHOUT re-opening the sheet: the route re-checks and lets it through.
    const change = await SELF.fetch(`${B}/api/billing/plan-change`, { method: "POST", headers: json(cookie), body: JSON.stringify({ planId: target }) });
    expect(change.status).toBe(200);
    const out = (await change.json()) as { ok: boolean; planId: string; eligible: boolean };
    expect(out.ok).toBe(true);
    expect(out.eligible).toBe(true);
    expect((await db.prepare("SELECT plan_id FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<{ plan_id: string }>())!.plan_id).toBe(target);

    // And the new, tighter ceiling is live — the roster is full at 1.
    expect((await mkClient(cookie, "OneTooMany")).status).toBe(403);
  }, 30_000);

  it("an upgrade is never gated by the downgrade check", async () => {
    const { cookie, big, target } = await studio("lcdg4", { clients: 3, targetActiveClients: 1 });
    // Sit on the tight plan first (no blockers at 3 clients? there are — so move
    // by hand), then ask to go UP: the guard must not fire.
    await (env.DB as D1Database).prepare("UPDATE subscriptions SET plan_id = ? WHERE tenant_id = (SELECT tenant_id FROM subscriptions WHERE plan_id = ?)").bind(target, big).run();
    const intent = await SELF.fetch(`${B}/api/billing/plan-intent`, { method: "POST", headers: json(cookie), body: JSON.stringify({ planId: big }) });
    // Stripe isn't configured in the test env, so the REAL handler answers (400 /
    // 409 "not synced"). What matters is that it is NOT our 409 downgrade_blocked
    // — i.e. the guard fell through to the handler it wraps.
    expect(intent.status).not.toBe(200);
    const body = (await intent.json()) as { error?: string };
    expect(body.error).not.toBe("downgrade_blocked");

    // Same proof for plan-change: an upgrade is rejected as "not a downgrade",
    // never as blocked.
    const change = await SELF.fetch(`${B}/api/billing/plan-change`, { method: "POST", headers: json(cookie), body: JSON.stringify({ planId: big }) });
    expect(change.status).toBe(400);
    expect(((await change.json()) as { error: string }).error).toBe("not_a_downgrade");
  }, 30_000);
});
