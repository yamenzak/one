/**
 * ONE PERSON MUST NOT BE ABLE TO SPEND THE WORKSPACE'S WHOLE BALANCE.
 *
 * `@4dl/ai` has shipped `checkActorDailyBudget` since before Scena joined the
 * platform, and nothing here called it — so the only ceiling on a generation was
 * the workspace balance itself. A single member with a stuck retry, or a session
 * somebody else had, could drain the monthly grant and every purchased credit in
 * an afternoon, and the first anyone would know is a wall of screens that cannot
 * generate.
 *
 * ── The half that would have made mounting it pointless ─────────────────────
 *
 * `ai_generations.actor_user_id` was written as a literal `NULL` on every row.
 * The budget check sums a rolling 24 hours of an ACTOR's rows, so against NULLs
 * it can only ever read zero: the cap would have passed its own tests, refused
 * nobody, and looked exactly like a working control. That is the failure this
 * whole audit is about, so the first assertion below is that the actor is
 * recorded at all — everything else is downstream of it.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ACTOR_DAILY_REQUEST_LIMIT, checkActorDailyBudget } from "@4dl/ai";
import { ensureSchema } from "../src/db.js";

const db = () => env.DB as D1Database;
const TENANT = "budget-tenant";

/** A generation row as `generate()` writes one, so the sum sees real shapes. */
async function record(actorUserId: string | null, credits: number, atMs = Date.now()): Promise<void> {
  await db()
    .prepare(
      "INSERT INTO ai_generations (id, tenant_id, actor_user_id, subject_id, feature, model, neurons, credits, ok, error, at) VALUES (?, ?, ?, NULL, 'text', 'm', 1, ?, 1, NULL, ?)",
    )
    .bind(`gen_${crypto.randomUUID().slice(0, 12)}`, TENANT, actorUserId, credits, atMs)
    .run();
}

/** Set (or clear) the owner-configurable per-actor daily credit cap. */
async function setCap(cap: number): Promise<void> {
  await db()
    .prepare("INSERT INTO tenant_settings (tenant_id, ai_config_json) VALUES (?, ?) ON CONFLICT(tenant_id) DO UPDATE SET ai_config_json = excluded.ai_config_json")
    .bind(TENANT, JSON.stringify({ perActorDailyCreditCap: cap }))
    .run();
}

beforeAll(async () => {
  await ensureSchema(db());
});

describe("the generation audit row identifies its actor", () => {
  it("stores the actor, so a per-actor sum is not summing NULLs", async () => {
    const actor = `u_${crypto.randomUUID().slice(0, 8)}`;
    await record(actor, 10);
    const row = await db()
      .prepare("SELECT actor_user_id FROM ai_generations WHERE tenant_id = ? AND actor_user_id = ?")
      .bind(TENANT, actor)
      .first<{ actor_user_id: string | null }>();
    expect(row?.actor_user_id).toBe(actor);
  });
});

describe("the owner's daily credit cap", () => {
  it("is OFF until somebody sets it — an unset workspace is unchanged", async () => {
    const actor = `u_${crypto.randomUUID().slice(0, 8)}`;
    await setCap(0);
    await record(actor, 1_000_000);
    expect(await checkActorDailyBudget(env as never, TENANT, actor)).toEqual({ ok: true });
  });

  it("refuses once the actor has spent it", async () => {
    const actor = `u_${crypto.randomUUID().slice(0, 8)}`;
    await setCap(100);
    await record(actor, 60);
    expect(await checkActorDailyBudget(env as never, TENANT, actor)).toEqual({ ok: true });
    await record(actor, 50); // 110 > 100
    const verdict = await checkActorDailyBudget(env as never, TENANT, actor);
    expect(verdict).toMatchObject({ ok: false, reason: "daily_cap", limit: 100 });
  });

  it("bounds ONE actor, not the workspace — a colleague is unaffected", async () => {
    // The whole point: this is a per-person share of a shared balance, not a
    // second tenant-level quota. A cap that also stopped everybody else would be
    // indistinguishable from running out of credits.
    const spender = `u_${crypto.randomUUID().slice(0, 8)}`;
    const colleague = `u_${crypto.randomUUID().slice(0, 8)}`;
    await setCap(100);
    await record(spender, 500);
    expect((await checkActorDailyBudget(env as never, TENANT, spender)).ok).toBe(false);
    expect(await checkActorDailyBudget(env as never, TENANT, colleague)).toEqual({ ok: true });
  });

  it("is a ROLLING 24 hours, so yesterday's spend does not hold somebody out", async () => {
    const actor = `u_${crypto.randomUUID().slice(0, 8)}`;
    await setCap(100);
    await record(actor, 5_000, Date.now() - 25 * 60 * 60 * 1000);
    expect(await checkActorDailyBudget(env as never, TENANT, actor)).toEqual({ ok: true });
  });
});

describe("the always-on request ceiling", () => {
  it("is the backstop when no owner cap is set", async () => {
    /*
      The cap is opt-in, so without this an untouched workspace would have no
      per-actor bound at all — which is the state every workspace is in today.
      It is deliberately generous: ordinary use never meets it, and a runaway
      loop stops in minutes rather than at the end of the balance.
    */
    const actor = `u_${crypto.randomUUID().slice(0, 8)}`;
    await setCap(0);
    for (let i = 0; i < ACTOR_DAILY_REQUEST_LIMIT; i += 1) await record(actor, 0);
    const verdict = await checkActorDailyBudget(env as never, TENANT, actor);
    expect(verdict).toMatchObject({ ok: false, reason: "rate_limited", limit: ACTOR_DAILY_REQUEST_LIMIT });
  });
});
