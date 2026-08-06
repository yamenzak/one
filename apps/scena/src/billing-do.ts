/**
 * TenantBillingDO (BLUEPRINT §24) — one Durable Object per tenant, the single
 * authority for its AI credit balance. Being single-threaded, concurrent
 * generations serialize, so a burst can never overspend (the whole reason the
 * meter is a DO and not a D1 row).
 *
 *   reserve(estimate) → hold      // atomic; rejects if available < estimate
 *   settle(hold, actual)          // finalize debit, release the remainder
 *   release(hold)                 // generation failed — drop the hold, no charge
 *   topUp / grantMonthly          // credit packs, promos, the recurring grant
 *
 * The balance + a rolling ledger live in DO storage; every mutation is also
 * mirrored to D1 `credit_ledger` for invoices/history (append-only).
 */

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env.js";
import { appendLedger } from "./billing-store.js";

interface Hold {
  credits: number;
  at: number;
}

export interface BalanceView {
  balance: number;
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
    return (await this.ctx.storage.get<string>("tenant")) ?? "tenant_demo";
  }

  /** Bind the DO to its tenant id (idempotent; called from the router). */
  async bind(tenantId: string): Promise<void> {
    if ((await this.ctx.storage.get<string>("tenant")) === undefined) {
      await this.ctx.storage.put("tenant", tenantId);
    }
  }

  async view(): Promise<BalanceView> {
    const balance = (await this.ctx.storage.get<number>("balance")) ?? 0;
    const holds = await this.reapStaleHolds();
    const held = Object.values(holds).reduce((s, h) => s + h.credits, 0);
    return { balance, held, available: Math.max(0, balance - held) };
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
   */
  async settle(hold: string, actual: number, reason = "ai.generation", ref?: string): Promise<BalanceView> {
    const holds = (await this.ctx.storage.get<Record<string, Hold>>("holds")) ?? {};
    const charge = Math.max(0, Math.ceil(actual));
    const balance = (await this.ctx.storage.get<number>("balance")) ?? 0;
    const next = Math.max(0, balance - charge);
    delete holds[hold];
    await this.ctx.storage.put("holds", holds);
    await this.ctx.storage.put("balance", next);
    if (charge > 0) await this.record(-charge, next, reason, ref);
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
    const balance = (await this.ctx.storage.get<number>("balance")) ?? 0;
    const next = Math.max(0, balance - cost);
    await this.ctx.storage.put("balance", next);
    if (cost > 0) await this.record(-cost, next, reason, ref);
    return { ok: true, ...(await this.view()) };
  }

  /** Add credits (credit pack, promo top-up, admin adjustment). */
  async topUp(credits: number, reason = "topup", ref?: string): Promise<BalanceView> {
    const add = Math.max(0, Math.floor(credits));
    const balance = (await this.ctx.storage.get<number>("balance")) ?? 0;
    const next = balance + add;
    await this.ctx.storage.put("balance", next);
    if (add > 0) await this.record(add, next, reason, ref);
    return this.view();
  }

  /**
   * Apply the recurring monthly grant for a plan, keyed by `periodKey`
   * (e.g. "2026-07") so repeated cron/webhook calls in the same period are a
   * no-op. The grant is a floor top-up: purchased credits persist alongside it.
   */
  async grantMonthly(credits: number, periodKey: string): Promise<BalanceView> {
    const last = await this.ctx.storage.get<string>("lastGrantKey");
    if (last === periodKey) return this.view();
    await this.ctx.storage.put("lastGrantKey", periodKey);
    return this.topUp(credits, "grant.monthly", periodKey);
  }

  /** Admin: set the balance to an exact value (audited). */
  async setBalance(credits: number, reason = "admin.adjust"): Promise<BalanceView> {
    const target = Math.max(0, Math.floor(credits));
    const balance = (await this.ctx.storage.get<number>("balance")) ?? 0;
    await this.ctx.storage.put("balance", target);
    await this.record(target - balance, target, reason);
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
