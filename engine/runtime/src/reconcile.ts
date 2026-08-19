/**
 * THE ONLY CHECK ON THE MONEY THAT IS NOT OUR OWN ARITHMETIC.
 *
 * ⚠️ EVERY OTHER NUMBER IN THE METERING CHAIN AGREES WITH THE OTHERS BY
 * CONSTRUCTION. The estimate, the rate table, the multiplier and the settle are
 * all ours, all derived from each other, and all four would go on agreeing
 * perfectly through a mistake they share. Cloudflare bills us from ITS numbers,
 * so its numbers are the one independent authority on whether a run was sold
 * above cost.
 *
 * ⚠️ AND A RESERVE IS A CEILING ON REVENUE, which is what makes that authority
 * necessary rather than nice. The charge can come in under an estimate and never
 * over it, so an estimate that is too low is a loss that nothing downstream can
 * catch — by design. This is what catches it.
 *
 * ⚠️ TWO PASSES, AND THEY ARE NOT THE SAME QUESTION. The TRUE-UP corrects one
 * run against what that run actually cost. The SWEEP asks whether the day, in
 * total, was sold above what it cost — which stays answerable even for the runs
 * whose logs never arrived.
 */

import type { TenantId } from "@engine/kernel";
import { MILLI, milliFromUsd, priced } from "@engine/kernel";
import { costOf, type LogReader } from "./gateway.js";
import { refundMilli } from "./wallet.js";
import type { Db } from "./sql.js";

/* ---------------------------------------------------------------- true-up --- */

interface Open {
  readonly id: string;
  readonly tenant_id: string;
  readonly log_id: string;
  readonly charged_milli: number;
  readonly multiplier: number;
}

export interface TruedUp {
  readonly looked: number;
  readonly corrected: number;
  readonly refundedMilli: number;
  readonly stillOpen: number;
}

/** ⚠️ Long enough for a log to be written, short enough to be a statement. */
export const TRUE_UP_AFTER_MINUTES = 10;
/** ⚠️ And a run whose log never arrives is closed rather than asked for ever. */
export const GIVE_UP_AFTER_HOURS = 48;

/**
 * CORRECT WHAT A RUN WAS CHARGED AGAINST WHAT IT COST.
 *
 * ⚠️ THE SETTLE ERRS HIGH ON PURPOSE AND THIS IS WHY THAT IS FAIR. Reasoning
 * tokens may be reported beside `completion_tokens` rather than within, and the
 * payload is identical either way — so the run charges the sum and this hands
 * back the difference once the truth is known. Without this pass that erring is
 * a permanent overcharge rather than a temporary one.
 *
 * ⚠️ AND IT ONLY EVER REFUNDS. Allowing it to charge more would re-open a
 * settled call: a balance moving hours later for work somebody finished with,
 * with no way for them to have seen it coming.
 */
export async function trueUp(
  db: Db, reader: LogReader | null, now = new Date(), limit = 200,
): Promise<TruedUp> {
  const ready = new Date(now.getTime() - TRUE_UP_AFTER_MINUTES * 60_000).toISOString();
  const giveUp = new Date(now.getTime() - GIVE_UP_AFTER_HOURS * 3_600_000).toISOString();

  const rows = await db.prepare(
    `SELECT r.id, r.tenant_id, r.log_id, r.charged_milli, COALESCE(m.multiplier, 1) AS multiplier`
    + ` FROM ai_run r LEFT JOIN ai_model m ON m.id = r.model`
    + ` WHERE r.trued = 0 AND r.log_id IS NOT NULL AND r.at <= ? ORDER BY r.at LIMIT ?`)
    .bind(ready, limit).all<Open>();

  let corrected = 0;
  let refundedMilli = 0;

  for (const row of rows.results) {
    const cost = await costOf(reader, row.log_id);
    if (!cost) continue;

    /* ⚠️ THE PRICE IS THE COST TIMES THE ROW'S OWN MULTIPLIER. Reading the
       multiplier at true-up time rather than storing it on the run means an
       operator changing a margin re-prices runs they have already sold — so it
       is read from the JOIN above, which is the margin as it was catalogued, and
       the correction can only reduce what was charged either way. */
    const should = priced(milliFromUsd(cost.usd), row.multiplier);
    const back = row.charged_milli - should;

    await db.prepare(
      `UPDATE ai_run SET cost_milli = ?, trued = 1, charged_milli = ? WHERE id = ?`)
      .bind(milliFromUsd(cost.usd), back > 0 ? should : row.charged_milli, row.id).run();

    if (back > 0) {
      await refundMilli(db, row.tenant_id as TenantId, back, "AI usage corrected", now);
      refundedMilli += back;
      corrected++;
    }
  }

  /* ⚠️ A LOG THAT NEVER ARRIVED IS CLOSED, NOT CARRIED. Left open the sweep asks
     the gateway about the same dead call every day for ever, and the queue it is
     working through never empties. */
  const closed = await db.prepare(
    `UPDATE ai_run SET trued = 1 WHERE trued = 0 AND at <= ?`).bind(giveUp).run();

  return {
    looked: rows.results.length,
    corrected,
    refundedMilli,
    stillOpen: Math.max(0, rows.results.length - corrected - (closed?.meta?.changes ?? 0)),
  };
}

/* ----------------------------------------------------------------- margin --- */

export interface Margin {
  readonly tenantId: string;
  readonly runs: number;
  readonly chargedMilli: number;
  readonly costMilli: number;
}

/**
 * WHAT EACH WORKSPACE WAS CHARGED AGAINST WHAT ITS RUNS COST.
 *
 * ⚠️ ONLY RUNS WHOSE COST IS KNOWN. Counting a run with no cost as costing
 * nothing makes every day look profitable in exactly the proportion that the
 * true-up is failing — which is the one circumstance where this check most
 * needs to fire.
 */
export async function marginsSince(db: Db, since: string): Promise<readonly Margin[]> {
  const rows = await db.prepare(
    `SELECT tenant_id, COUNT(*) AS runs, SUM(charged_milli) AS charged, SUM(cost_milli) AS cost`
    + ` FROM ai_run WHERE at >= ? AND ok = 1 AND cost_milli IS NOT NULL`
    + ` GROUP BY tenant_id`)
    .bind(since).all<{ tenant_id: string; runs: number; charged: number; cost: number }>();
  return rows.results.map((r) => ({
    tenantId: r.tenant_id, runs: r.runs,
    chargedMilli: r.charged ?? 0, costMilli: r.cost ?? 0,
  }));
}

export interface Loss {
  readonly tenantId: string;
  readonly runs: number;
  /** Milli-credits short. Positive means we paid more than we were paid. */
  readonly shortMilli: number;
}

/**
 * ⚠️ WHAT IS REPORTED IS A SHORTFALL, NOT A RATIO. "Margin fell to 4.2×" is a
 * number somebody has to have an opinion about; "this workspace cost us 340
 * credits more than it paid" is a fact with an action attached.
 */
export const lossesIn = (margins: readonly Margin[]): readonly Loss[] =>
  margins
    .filter((m) => m.costMilli > m.chargedMilli)
    .map((m) => ({ tenantId: m.tenantId, runs: m.runs, shortMilli: m.costMilli - m.chargedMilli }))
    .sort((a, b) => b.shortMilli - a.shortMilli);

/** ⚠️ Said in credits, because that is the unit the rest of the console speaks. */
export const inCredits = (milli: number): number => Math.round(milli / MILLI * 100) / 100;
