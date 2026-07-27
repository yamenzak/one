/**
 * The owner's email policy has to reach the weekly digest.
 *
 * `digest` is the one category whose email never goes through `notify()` — the
 * cron builds and sends it directly — so it is the one place the studio-wide
 * switch can be wired wrong without any other test noticing. It was: the gate
 * called `emailAllowedByPolicy(policy, "digest")` with NO audience, and the
 * owner UI writes only the per-audience map, so the lookup fell through to the
 * legacy all-audiences map (which nothing writes any more) and read its
 * `?? true` default. Every studio that switched the weekly digest off kept
 * sending it.
 *
 * These drive the REAL sweep against D1 and assert on `digest_sent` — the
 * claim row is written immediately before the send, so its presence or absence
 * is the honest record of who was actually emailed.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";
import { runWeeklyDigest } from "../src/digest.js";

const db = () => env.DB as D1Database;

/** A studio with one owner and one client, both digest-eligible by default. */
async function seedStudio(id: string): Promise<void> {
  const d = db();
  await d.prepare("INSERT OR IGNORE INTO organization (id, name, slug, createdAt) VALUES (?, ?, ?, '2026-01-01')").bind(id, `Studio ${id}`, id).run();
  for (const [uid, email] of [[`${id}_owner`, `owner@${id}.test`], [`${id}_client`, `client@${id}.test`]]) {
    await d.prepare('INSERT OR IGNORE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, \'2026-01-01\', \'2026-01-01\')').bind(uid, uid, email).run();
  }
  await d.prepare("INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, 'owner', '2026-01-01')").bind(`${id}_mem`, id, `${id}_owner`).run();
  await d.prepare("INSERT OR IGNORE INTO clients (id, tenant_id, user_id, display_name, status, created_at) VALUES (?, ?, ?, 'Digest Dana', 'active', '2026-01-01')").bind(`${id}_cl`, id, `${id}_client`).run();
  await d.prepare("INSERT OR IGNORE INTO tenant_settings (tenant_id, updated_at) VALUES (?, '2026-01-01')").bind(id).run();
}

/** Write the policy exactly the way the owner UI writes it: per-audience only. */
async function setPolicy(id: string, policy: unknown): Promise<void> {
  await db().prepare("UPDATE tenant_settings SET notif_policy_json = ? WHERE tenant_id = ?").bind(JSON.stringify(policy), id).run();
}

/** Which kinds of digest were actually claimed for a studio's users. */
async function sentKinds(id: string): Promise<string[]> {
  const r = await db().prepare("SELECT kind FROM digest_sent WHERE user_id LIKE ? ORDER BY kind").bind(`${id}_%`).all<{ kind: string }>();
  return (r.results ?? []).map((x) => x.kind);
}

describe("the owner's email policy governs the weekly digest, per audience", () => {
  beforeAll(async () => { await ensureSchema(db()); });

  it("no policy set — everyone gets it", async () => {
    const id = "dgbase";
    await seedStudio(id);
    await runWeeklyDigest(env as never);
    expect(await sentKinds(id)).toEqual(["client", "owner"]);
  });

  it("digest off for CLIENTS still reaches staff — and the client is not emailed", async () => {
    const id = "dgnoclient";
    await seedStudio(id);
    // Exactly the shape `PATCH /settings` stores: `emailAudience` only, no
    // legacy `emailCategories` key at all. The audience-less lookup this
    // replaced read straight past it.
    await setPolicy(id, { emailAudience: { client: { digest: false } } });
    await runWeeklyDigest(env as never);
    expect(await sentKinds(id)).toEqual(["owner"]);
  });

  it("digest off for STAFF still reaches clients", async () => {
    const id = "dgnostaff";
    await seedStudio(id);
    await setPolicy(id, { emailAudience: { staff: { digest: false } } });
    await runWeeklyDigest(env as never);
    expect(await sentKinds(id)).toEqual(["client"]);
  });

  it("off for both — nobody is emailed", async () => {
    const id = "dgnone";
    await seedStudio(id);
    await setPolicy(id, { emailAudience: { client: { digest: false }, staff: { digest: false } } });
    await runWeeklyDigest(env as never);
    expect(await sentKinds(id)).toEqual([]);
  });

  it("a legacy all-audiences policy is still honoured", async () => {
    // Tenants configured before the per-audience split carry `emailCategories`.
    // The per-audience lookup falls back to it when no audience entry exists,
    // so a grandfathered studio keeps the setting it chose.
    const id = "dglegacy";
    await seedStudio(id);
    await setPolicy(id, { emailCategories: { digest: false } });
    await runWeeklyDigest(env as never);
    expect(await sentKinds(id)).toEqual([]);
  });
});
