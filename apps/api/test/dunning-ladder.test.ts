/**
 * The dunning ladder, end to end, WITH Stripe talking over it.
 *
 * Two clocks drive one row and they must not fight. Stripe owns the raw payment
 * state and pushes it at us whenever it changes; `dailySweep` owns the
 * escalation layered on `past_due_at`, and every rung selects on the PREVIOUS
 * rung's status:
 *
 *     past_due --7d--> suspended --30d--> blocked --37d--> purged
 *
 * So a webhook that rewrites the CURRENT rung breaks the chain permanently, and
 * it breaks it QUIETLY — the tenant stays read-only, nothing is deleted, no
 * error is raised anywhere. The only symptom is storage that is never reclaimed.
 *
 * Stripe's own retry schedule exhausts around day 21 and flips the subscription
 * to `unpaid` — squarely between the 7-day and 30-day rungs. That is the event
 * this file exists for.
 *
 * These tests drive the real webhook endpoint (signature and all) and the real
 * `scheduled` handler, and move time by back-dating `past_due_at` rather than by
 * faking a clock — the sweep's own cutoff arithmetic is then under test too.
 */

import { env, SELF, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/index.js";
import { ensureSchema } from "../src/db.js";

const ORIGIN = "http://setup.localhost:8787";
const SECRET = "whsec_dunning_test";
const db = () => env.DB as D1Database;

/** A signed platform webhook, exactly as Stripe sends one. */
async function sign(payload: string): Promise<string> {
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  return `t=${t},v1=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Deliver `customer.subscription.updated` carrying one Stripe status. */
async function subscriptionStatus(customerId: string, status: string): Promise<void> {
  const payload = JSON.stringify({
    id: `evt_${status}_${Math.random().toString(36).slice(2)}`,
    type: "customer.subscription.updated",
    data: { object: { id: `sub_${customerId}`, customer: customerId, status, items: { data: [] } } },
  });
  const res = await SELF.fetch(`${ORIGIN}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": await sign(payload) },
    body: payload,
  });
  expect(res.status, `webhook for status=${status}`).toBe(200);
}

/** Run the real daily cron. */
async function runDailySweep(): Promise<void> {
  const ctx = createExecutionContext();
  await worker.scheduled?.({ cron: "10 0 * * *", scheduledTime: Date.now(), noRetry() {} } as ScheduledController, env as never);
  await waitOnExecutionContext(ctx);
}

/** Pretend the tenant first went past due `days` ago. */
async function pastDueDaysAgo(tenantId: string, days: number): Promise<void> {
  const at = new Date(Date.now() - days * 86_400_000).toISOString();
  await db().prepare("UPDATE subscriptions SET past_due_at = ? WHERE tenant_id = ?").bind(at, tenantId).run();
}

const statusOf = async (tenantId: string): Promise<string | null> =>
  (await db().prepare("SELECT status FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<{ status: string }>())?.status ?? null;

/** A tenant on a paid plan with a Stripe customer, and nothing else. */
async function seedTenant(id: string): Promise<string> {
  const customer = `cus_${id}`;
  await db().prepare('INSERT OR REPLACE INTO "organization" (id, name, slug, createdAt) VALUES (?, ?, ?, ?)').bind(id, id, id, new Date().toISOString()).run();
  await db()
    .prepare(
      "INSERT OR REPLACE INTO subscriptions (tenant_id, plan_id, status, stripe_customer_id, stripe_sub_id, comp, past_due_at, suspend_at, delete_at, updated_at) VALUES (?, 'pro', 'active', ?, ?, 0, NULL, NULL, NULL, ?)",
    )
    .bind(id, customer, `sub_${customer}`, new Date().toISOString())
    .run();
  return customer;
}

beforeAll(async () => {
  await ensureSchema(db());
  await db()
    .prepare("INSERT INTO app_config (key, value) VALUES ('stripe.webhook_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(SECRET)
    .run();
});

describe("a payment webhook cannot stall the dunning ladder", () => {
  it("an `unpaid` event mid-ladder leaves the rung alone, and the ladder finishes", async () => {
    const tenantId = "t_unpaid_midladder";
    const customer = await seedTenant(tenantId);

    // Day 0 — Stripe reports the first failure.
    await subscriptionStatus(customer, "past_due");
    expect(await statusOf(tenantId)).toBe("past_due");

    // Day 8 — the sweep takes rung one.
    await pastDueDaysAgo(tenantId, 8);
    await runDailySweep();
    expect(await statusOf(tenantId)).toBe("suspended");

    // Day ~21 — Stripe exhausts its retries and flips the subscription to
    // `unpaid`. THIS is the event that used to overwrite `suspended`.
    await subscriptionStatus(customer, "unpaid");
    expect(await statusOf(tenantId), "an `unpaid` webhook overwrote the ladder's rung").toBe("suspended");

    // Day 31 — rung two only matches because the rung above survived.
    await pastDueDaysAgo(tenantId, 31);
    await runDailySweep();
    expect(await statusOf(tenantId), "the ladder stalled at read-only").toBe("blocked");

    // …and the row now carries the purge deadline, which is what actually
    // reclaims the tenant's storage.
    const row = await db().prepare("SELECT delete_at FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<{ delete_at: string | null }>();
    expect(row?.delete_at).toBeTruthy();
  });

  it("a `canceled` event mid-ladder does not reset it either", async () => {
    // Same shape, different Stripe terminal state: some accounts are configured
    // to cancel rather than mark unpaid when retries run out.
    const tenantId = "t_canceled_midladder";
    const customer = await seedTenant(tenantId);
    await subscriptionStatus(customer, "past_due");
    await pastDueDaysAgo(tenantId, 8);
    await runDailySweep();
    expect(await statusOf(tenantId)).toBe("suspended");

    await subscriptionStatus(customer, "canceled");
    expect(await statusOf(tenantId)).toBe("suspended");
  });

  it("a healthy tenant's cancellation is still recorded", async () => {
    // The clamp must not swallow a real cancellation — a tenant NOT on the
    // ladder cancels normally and drops to the free plan.
    const tenantId = "t_plain_cancel";
    const customer = await seedTenant(tenantId);
    await subscriptionStatus(customer, "canceled");
    const row = await db().prepare("SELECT status, plan_id FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<{ status: string; plan_id: string }>();
    expect(row).toMatchObject({ status: "canceled", plan_id: "free" });
  });

  it("paying still restores a blocked tenant — every marker cleared", async () => {
    // The other half of the invariant. The clamp is on DEGRADATION only:
    // recovery must overwrite every rung, or paying would not be a way out.
    const tenantId = "t_recovers";
    const customer = await seedTenant(tenantId);
    await subscriptionStatus(customer, "past_due");
    await pastDueDaysAgo(tenantId, 31);
    await runDailySweep(); // → suspended
    await runDailySweep(); // → blocked
    expect(await statusOf(tenantId)).toBe("blocked");

    await subscriptionStatus(customer, "active");
    const row = await db()
      .prepare("SELECT status, past_due_at, suspend_at, delete_at FROM subscriptions WHERE tenant_id = ?")
      .bind(tenantId)
      .first<{ status: string; past_due_at: string | null; suspend_at: string | null; delete_at: string | null }>();
    expect(row).toMatchObject({ status: "active", past_due_at: null, suspend_at: null, delete_at: null });
  });
});

describe("a payment webhook cannot cancel an owner's studio close", () => {
  /**
   * `scheduleTenantClose` cancels the Stripe subscription and THEN marks the row
   * `closing` with a 7-day `delete_at`. Stripe answers that cancellation with a
   * `canceled` event, so the two race — and when the webhook landed second it
   * turned a scheduled close into a plain cancellation. `delete_at` survived,
   * but the purge sweep selects `WHERE status = 'closing'`, so it never matched
   * again: a studio the owner asked us to delete was kept indefinitely.
   */
  it("the `canceled` echo of the close itself leaves `closing` intact", async () => {
    const tenantId = "t_closing";
    const customer = await seedTenant(tenantId);
    const deleteAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await db().prepare("UPDATE subscriptions SET status = 'closing', delete_at = ? WHERE tenant_id = ?").bind(deleteAt, tenantId).run();

    await subscriptionStatus(customer, "canceled");

    const row = await db().prepare("SELECT status, delete_at FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<{ status: string; delete_at: string | null }>();
    expect(row?.status, "the close was downgraded to a plain cancellation").toBe("closing");
    expect(row?.delete_at).toBe(deleteAt);
  });

  it("a late `active` event does not silently un-close a studio", async () => {
    // Undoing a close is `cancelTenantClose`'s job — an explicit owner action
    // with its own route. A stale webhook must not do it by accident.
    const tenantId = "t_closing_active";
    const customer = await seedTenant(tenantId);
    await db().prepare("UPDATE subscriptions SET status = 'closing', delete_at = ? WHERE tenant_id = ?").bind(new Date().toISOString(), tenantId).run();

    await subscriptionStatus(customer, "active");
    expect(await statusOf(tenantId)).toBe("closing");
  });
});
