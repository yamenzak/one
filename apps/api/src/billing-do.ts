/**
 * TenantBillingDO (SPEC §6 — transplanted from Scena) — one Durable Object per tenant, the single
 * authority for its AI credit balance. Being single-threaded, concurrent
 * generations serialize, so a burst can never overspend (the whole reason the
 * meter is a DO and not a D1 row).
 *
 *   reserve(estimate) → hold      // atomic; rejects if available < estimate
 *   settle(hold, actual)          // finalize debit, release the remainder
 *   release(hold)                 // generation failed — drop the hold, no charge
 *   topUp / grantMonthly          // credit packs, promos, the recurring grant
 *
 * TWO-BUCKET BALANCE (billing centralization). The balance is split so the
 * platform can honour "purchased credits last forever, plan-granted credits do
 * not roll over":
 *   - `purchased` — credit packs, promos, admin top-ups. Never expires.
 *   - `granted`   — the monthly plan grant. RESET (overwritten) each period, not
 *                   added, so an unused grant lapses instead of rolling over.
 * Spending drains `granted` first (use-it-or-lose-it), then `purchased`, so a
 * tenant never loses a credit they paid for. Both counters + a rolling ledger
 * live in DO storage; every mutation mirrors to D1 `credit_ledger` (append-only).
 */

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env.js";
import { appendLedger } from "./billing-store.js";

interface Hold {
  credits: number;
  at: number;
}

export interface BalanceView {
  /** purchased + granted — the total the tenant can spend (pre-holds). */
  balance: number;
  /** Credit-pack / promo / admin credits. Persist forever. */
  purchased: number;
  /** The current period's plan grant. Lapses (does not roll over) on reset. */
  granted: number;
  held: number;
  available: number;
}

export interface LedgerEntry {
  delta: number;
  balance: number;
  reason: string;
  ref?: string;
  at: number;
}

const LEDGER_CAP = 50; // rolling window kept in the DO; full history in D1
// A hold older than this is orphaned (its request died between reserve and
// settle/release — isolate eviction, dropped connection, CPU kill). Reap it so a
// stuck hold can't permanently subtract from the tenant's available balance. The
// longest AI run is ~180s, so 10 min is comfortably past any live generation.
const HOLD_TTL_MS = 600_000;

export class TenantBillingDO extends DurableObject<Env> {
  /** The tenant id this DO represents (set on first use so we can mirror to D1). */
  private async tenant(): Promise<string> {
    return (await this.ctx.storage.get<string>("tenant")) ?? "tenant_unknown";
  }

  /** Bind the DO to its tenant id (idempotent; called from the router). */
  async bind(tenantId: string): Promise<void> {
    if ((await this.ctx.storage.get<string>("tenant")) === undefined) {
      await this.ctx.storage.put("tenant", tenantId);
    }
  }

  /** Erase all durable state — the credit buckets, holds and ledger — when a
   *  tenant is purged (close-studio / nuclear reset). */
  async wipe(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  /**
   * Read the two credit buckets, migrating a legacy single `balance` the first
   * time we see one: all existing credits become `purchased` (we never revoke
   * credits a tenant already holds), and `granted` starts empty — it fills on
   * the next monthly grant. Single-threaded DO ⇒ this lazy migration is safe.
   */
  private async buckets(): Promise<{ purchased: number; granted: number }> {
    let purchased = await this.ctx.storage.get<number>("purchased");
    let granted = await this.ctx.storage.get<number>("granted");
    if (purchased === undefined && granted === undefined) {
      const legacy = await this.ctx.storage.get<number>("balance");
      purchased = Math.max(0, legacy ?? 0);
      granted = 0;
      await this.ctx.storage.put("purchased", purchased);
      await this.ctx.storage.put("granted", granted);
      if (legacy !== undefined) await this.ctx.storage.delete("balance");
    }
    return { purchased: purchased ?? 0, granted: granted ?? 0 };
  }

  /** Spend `amount`, draining the (non-rolling) grant before purchased credits.
   *  Returns the credits actually charged; appends one ledger entry. */
  private async debit(amount: number, reason: string, ref?: string): Promise<number> {
    const cost = Math.max(0, Math.ceil(amount));
    if (cost === 0) return 0;
    const { purchased, granted } = await this.buckets();
    const fromGrant = Math.min(granted, cost);
    const fromPurchased = Math.min(purchased, cost - fromGrant);
    const charged = fromGrant + fromPurchased;
    const nextGranted = granted - fromGrant;
    const nextPurchased = purchased - fromPurchased;
    await this.ctx.storage.put("granted", nextGranted);
    await this.ctx.storage.put("purchased", nextPurchased);
    if (charged > 0) await this.record(-charged, nextGranted + nextPurchased, reason, ref);
    return charged;
  }

  async view(): Promise<BalanceView> {
    const { purchased, granted } = await this.buckets();
    const balance = purchased + granted;
    const holds = await this.reapStaleHolds();
    const held = Object.values(holds).reduce((s, h) => s + h.credits, 0);
    return { balance, purchased, granted, held, available: Math.max(0, balance - held) };
  }

  /** Drop holds past their TTL (orphaned by a died request) and persist if any
   *  were removed, so a stuck hold can't erode `available` forever. */
  private async reapStaleHolds(): Promise<Record<string, Hold>> {
    const holds = (await this.ctx.storage.get<Record<string, Hold>>("holds")) ?? {};
    const cutoff = Date.now() - HOLD_TTL_MS;
    let dropped = false;
    for (const [id, h] of Object.entries(holds)) {
      if (h.at < cutoff) { delete holds[id]; dropped = true; }
    }
    if (dropped) await this.ctx.storage.put("holds", holds);
    return holds;
  }

  /**
   * Atomically hold `estimate` credits against the available balance. Returns a
   * hold id to settle/release against, or `{ ok: false }` if funds are short.
   */
  async reserve(estimate: number): Promise<{ ok: true; hold: string; available: number } | { ok: false; available: number; needed: number }> {
    const est = Math.max(0, Math.ceil(estimate));
    const { available } = await this.view();
    if (est > available) return { ok: false, available, needed: est };
    const holds = (await this.ctx.storage.get<Record<string, Hold>>("holds")) ?? {};
    const hold = `hold_${randomHex(8)}`;
    holds[hold] = { credits: est, at: Date.now() };
    await this.ctx.storage.put("holds", holds);
    const after = await this.view();
    return { ok: true, hold, available: after.available };
  }

  /**
   * Finalize a hold: debit the *actual* credits (from real Workers AI usage),
   * release the reserved remainder, append a ledger entry. Never drives the
   * balance below zero.
   *
   * Two invariants make this safe:
   *  - **Idempotent.** If the hold is already gone (a retried/replayed settle,
   *    or one the reaper freed), this is a no-op — a settle never debits twice.
   *  - **Capped at the reservation.** The charge can never exceed what `reserve`
   *    held, so an `actual` that overruns the estimate (e.g. vision image tokens
   *    the char-count estimate can't see) can't push the tenant past what was
   *    reserved. This is what makes "a burst can never overspend" true even when
   *    the real usage beats the estimate — the platform eats the small overrun.
   */
  async settle(hold: string, actual: number, reason = "ai.generation", ref?: string): Promise<BalanceView> {
    const holds = (await this.ctx.storage.get<Record<string, Hold>>("holds")) ?? {};
    const held = holds[hold];
    if (!held) return this.view(); // already settled/released/reaped — no double charge
    const charge = Math.min(held.credits, Math.max(0, Math.ceil(actual)));
    delete holds[hold];
    await this.ctx.storage.put("holds", holds);
    await this.debit(charge, reason, ref);
    return this.view();
  }

  /** Drop a hold without charging (generation failed / cache hit). */
  async release(hold: string): Promise<BalanceView> {
    const holds = (await this.ctx.storage.get<Record<string, Hold>>("holds")) ?? {};
    delete holds[hold];
    await this.ctx.storage.put("holds", holds);
    return this.view();
  }

  /**
   * Pay-as-you-go debit for an external metered call (e.g. a weather API fetch):
   * atomically charge `credits` if the available balance covers it, else no-op.
   * Unlike reserve→settle this is a single round trip with no hold — right for a
   * fixed-price call whose cost is known up front. Returns `ok:false` (and does
   * not fetch/charge) when funds are short, so the caller skips the upstream call.
   */
  async charge(credits: number, reason = "usage", ref?: string): Promise<{ ok: boolean } & BalanceView> {
    const cost = Math.max(0, Math.ceil(credits));
    const { available } = await this.view();
    if (cost > available) return { ok: false, ...(await this.view()) };
    await this.debit(cost, reason, ref);
    return { ok: true, ...(await this.view()) };
  }

  /** Add credits to the durable `purchased` bucket (credit pack, promo, admin
   *  top-up). These persist forever — they are never touched by a grant reset. */
  async topUp(credits: number, reason = "topup", ref?: string): Promise<BalanceView> {
    const add = Math.max(0, Math.floor(credits));
    const { purchased, granted } = await this.buckets();
    if (add > 0) {
      const nextPurchased = purchased + add;
      await this.ctx.storage.put("purchased", nextPurchased);
      await this.record(add, nextPurchased + granted, reason, ref);
    }
    return this.view();
  }

  /**
   * Apply the recurring monthly grant for a plan, keyed by `periodKey`
   * (e.g. "2026-07") so repeated cron/webhook calls in the same period are a
   * no-op. The grant is a RESET, not a top-up: the prior period's unused grant
   * lapses and the new grant replaces it — this is what makes plan credits
   * non-rolling. Purchased credits are untouched. Two ledger entries (expire +
   * grant) keep the non-rollover visible in history.
   */
  async grantMonthly(credits: number, periodKey: string): Promise<BalanceView> {
    const last = await this.ctx.storage.get<string>("lastGrantKey");
    if (last === periodKey) return this.view();
    const grant = Math.max(0, Math.floor(credits));
    const { purchased, granted } = await this.buckets();
    await this.ctx.storage.put("lastGrantKey", periodKey);
    await this.ctx.storage.put("granted", grant);
    if (granted > 0) await this.record(-granted, purchased, "grant.expire", periodKey);
    if (grant > 0) await this.record(grant, purchased + grant, "grant.monthly", periodKey);
    return this.view();
  }

  /** Admin: set the total balance to an exact value (audited). Fills from the
   *  grant bucket first (kept), overflow into purchased; a target below the
   *  current grant clamps the grant down too, so the total is always exact. */
  async setBalance(credits: number, reason = "admin.adjust"): Promise<BalanceView> {
    const target = Math.max(0, Math.floor(credits));
    const { purchased, granted } = await this.buckets();
    const currentTotal = purchased + granted;
    const nextGranted = Math.min(granted, target);
    const nextPurchased = target - nextGranted;
    await this.ctx.storage.put("granted", nextGranted);
    await this.ctx.storage.put("purchased", nextPurchased);
    await this.record(target - currentTotal, target, reason);
    return this.view();
  }

  /** Recent ledger entries held in the DO (full history is in D1). */
  async recentLedger(): Promise<LedgerEntry[]> {
    return (await this.ctx.storage.get<LedgerEntry[]>("ledger")) ?? [];
  }

  private async record(delta: number, balance: number, reason: string, ref?: string): Promise<void> {
    const entry: LedgerEntry = { delta, balance, reason, ref, at: Date.now() };
    const ledger = ((await this.ctx.storage.get<LedgerEntry[]>("ledger")) ?? []).concat(entry).slice(-LEDGER_CAP);
    await this.ctx.storage.put("ledger", ledger);
    // Mirror to D1 for invoices/history. Best-effort: a mirror failure must not
    // corrupt the authoritative DO balance.
    try {
      await appendLedger(this.env.DB, { tenant_id: await this.tenant(), delta, balance, reason, ref: ref ?? null });
    } catch {
      /* D1 unavailable — the DO ledger remains the source of truth */
    }
  }
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}
