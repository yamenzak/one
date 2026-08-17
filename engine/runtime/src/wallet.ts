/**
 * ONEWALLET — ONE BALANCE PER BUSINESS, WHATEVER PRODUCTS SPEND FROM IT.
 *
 * ⚠️ A BALANCE PER PRODUCT WOULD BE THE SAME MISTAKE AS A BILL PER PRODUCT (D1).
 * A business that topped up in one product and ran out in another, on the same
 * day, holding the same card, is a business being told to buy credits twice.
 * The ledger carries which product spent what — that is a report, not a wall.
 *
 * ⚠️ BUT IT IS TWO NUMBERS, AND THEY OBEY OPPOSITE RULES. The month's ALLOWANCE
 * comes with the plan and is SET on renewal — unused allowance that compounds is
 * a cost model that stops holding after three quiet months. What somebody BOUGHT
 * with a card never expires, because taking it back is taking their money. One
 * column each, and the allowance is always spent first: draw from the balance
 * that expires while it still can.
 *
 * ⚠️ AND NEITHER IS CONFISCATED WHEN STANDING STOPS. The entitlement walk ends
 * with a clamp that zeroes everything a workspace holds, which is correct for a
 * permission and theft for a balance — so credits are a plan FIELD rather than an
 * entitlement, and they never go through the walk at all. A suspended workspace
 * cannot spend, because the gate refuses the write; it does not lose what it
 * paid for, and it finds it there when it comes back.
 *
 * ⚠️ RESERVE → RUN → SETTLE, AND THE RESERVE IS A CEILING ON REVENUE. Settlement
 * charges `min(held, actual)`, so every unit an estimate fails to anticipate is
 * a unit the platform pays for and the customer does not — silently, on every
 * call. The cap exists so a runaway cannot bankrupt a customer; the consequence
 * is that an optimistic estimate cannot be caught downstream, because nothing
 * downstream is allowed to charge more.
 *
 * ⚠️ AND THE HOLD IS TAKEN IN THE SAME STATEMENT THAT CHECKS IT. `SELECT` then
 * `UPDATE` is a race two concurrent calls both win, and the symptom is a
 * customer who spent more than they had — discovered from a balance that went
 * negative, long after the calls that did it.
 */

import type { AppId, PlanSpec, TenantId } from "@engine/kernel";
import { newId, settle as settleAt, type Reserve } from "@engine/kernel";
import { MEMBERSHIP, subscriptionFor } from "./billing.js";
import type { Db } from "./sql.js";

/* ---------------------------------------------------------------- the copy --- */

/**
 * ⚠️ WHAT A LEDGER ROW SAYS IS THE STATEMENT SOMEBODY READS, so the reasons are
 * a closed set rather than whatever each caller typed. Two spellings of "monthly
 * allowance" is a statement that looks like two different things happened.
 */
export const LEDGER = {
  allowance: "Monthly allowance",
  expired: "Allowance not carried over",
  topUp: "Credits added",
  refund: "Credits returned",
} as const;

/* --------------------------------------------------------------- the shape --- */

export interface Wallet {
  /** ⚠️ This month's, and it does not carry over. */
  readonly granted: number;
  /** ⚠️ Bought with a card, and it never expires. */
  readonly bought: number;
  readonly held: number;
  readonly balance: number;
  /** What may actually be spent right now. */
  readonly spendable: number;
}

const shape = (granted: number, bought: number, held: number): Wallet => {
  const balance = granted + bought;
  return { granted, bought, held, balance, spendable: Math.max(0, balance - held) };
};

export async function walletOf(db: Db, tenantId: TenantId): Promise<Wallet> {
  const row = await db.prepare(
    `SELECT granted, bought, held FROM billing_account WHERE tenant_id = ?`)
    .bind(tenantId).first<{ granted: number | null; bought: number | null; held: number }>();
  return shape(row?.granted ?? 0, row?.bought ?? 0, row?.held ?? 0);
}

export async function openAccount(
  db: Db, tenantId: TenantId, currency = "EUR", now = new Date(),
): Promise<void> {
  await db.prepare(
    `INSERT INTO billing_account (tenant_id, customer_ref, currency, granted, bought, held, at)
     VALUES (?, NULL, ?, 0, 0, 0, ?) ON CONFLICT(tenant_id) DO NOTHING`)
    .bind(tenantId, currency, now.toISOString()).run();
}

/* --------------------------------------------------------------- filling it --- */

/**
 * ⚠️ EVERY MOVEMENT IS A LEDGER ROW AND A BALANCE UPDATE, in that order. The row
 * is the record somebody can be shown; the balance is a cache of it. Writing the
 * balance without the row leaves money that appeared from nowhere, and that is
 * the one thing nobody can reconstruct afterwards.
 */
async function record(
  db: Db, tenantId: TenantId, delta: number, reason: string,
  opts: { readonly appId?: AppId; readonly ref?: string }, now: Date,
): Promise<void> {
  if (delta === 0) return;
  await db.prepare(
    `INSERT INTO credit_ledger (id, tenant_id, app_id, at, delta, reason, ref) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(newId("led", now), tenantId, opts.appId ?? null, now.toISOString(), delta, reason,
      opts.ref ?? null).run();
}

/**
 * THE MONTH'S ALLOWANCE, SET RATHER THAN ADDED.
 *
 * ⚠️ SET, AND THE DIFFERENCE IS THE WHOLE COST MODEL. A plan that grants 1,500 a
 * month to somebody who used none of last month's grants 1,500, not 3,000 — an
 * allowance that compounds prices a quiet quarter as three months of headroom,
 * and the customer who then has a busy month costs more than they ever paid.
 *
 * ⚠️ AND WHAT LAPSES IS WRITTEN DOWN. Setting the column silently would make a
 * balance drop between two statements with nothing between them to explain it,
 * so the unused remainder is a ledger row of its own — the one line somebody
 * reads when they ask where their credits went.
 *
 * ⚠️ THE BOUGHT BALANCE IS NOT TOUCHED HERE, at all. It is the only rule that
 * makes topping up safe to do at any point in the month.
 */
export async function grantAllowance(
  db: Db, tenantId: TenantId, credits: number, now = new Date(),
): Promise<void> {
  const before = await walletOf(db, tenantId);
  if (before.granted > 0) {
    await record(db, tenantId, -before.granted, LEDGER.expired, {}, now);
  }
  await record(db, tenantId, credits, LEDGER.allowance, {}, now);
  await db.prepare(`UPDATE billing_account SET granted = ? WHERE tenant_id = ?`)
    .bind(Math.max(0, credits), tenantId).run();
}

/**
 * A PERIOD BEGINS, SO THE ALLOWANCE IS SET TO WHAT THE PLAN GRANTS.
 *
 * ⚠️ THE PLAN IS READ FROM THE SUBSCRIPTION, NEVER PASSED IN. A caller that
 * named the plan could name a different one from the one the workspace is on,
 * and the two would disagree in the customer's favour on the day somebody
 * mistyped an id — which is the sort of bug that is found by an accountant.
 *
 * ⚠️ AND IT IS SAFE TO CALL TWICE FOR ONE PERIOD, which is what makes it safe to
 * hang off the ladder at all. The first month arrives as both a completed
 * checkout and a paid invoice, minutes apart; because this SETS rather than
 * adds, the second call lands on the same number. The only thing it can undo is
 * spending between the two, and it undoes it in the customer's favour.
 */
export async function renewAllowance(
  db: Db, tenantId: TenantId, plans: readonly PlanSpec[], now = new Date(),
): Promise<number> {
  const sub = await subscriptionFor(db, tenantId, MEMBERSHIP);
  const plan = plans.find((p) => p.id === sub?.planId);
  /* ⚠️ NO PLAN GRANTS NOTHING, AND DOES NOT ZERO. A workspace whose row we
     cannot read is not one to take an allowance from. */
  if (!plan) return 0;
  await grantAllowance(db, tenantId, plan.credits, now);
  return plan.credits;
}

/**
 * CREDITS SOMEBODY BOUGHT.
 *
 * ⚠️ THESE NEVER EXPIRE AND ARE NEVER RESET. A renewal that swept them away
 * would be a monthly confiscation of something bought with a card, and it would
 * happen on the day they were least likely to be looking.
 */
export async function topUp(
  db: Db, tenantId: TenantId, credits: number, reason: string = LEDGER.topUp,
  opts: { readonly appId?: AppId; readonly ref?: string } = {}, now = new Date(),
): Promise<void> {
  if (credits <= 0) return;
  await record(db, tenantId, credits, reason, opts, now);
  await db.prepare(`UPDATE billing_account SET bought = COALESCE(bought, 0) + ? WHERE tenant_id = ?`)
    .bind(credits, tenantId).run();
}

/* ------------------------------------------------------- topping up by itself --- */

/**
 * THE STANDING INSTRUCTION: BUY THIS PACK WHEN THE BALANCE FALLS BELOW THIS.
 *
 * ⚠️ IT IS STATE ON THE BILLING ROW, NOT A PREFERENCE. What it authorises is a
 * charge to a card with nobody present, so it belongs beside the card — and
 * beside the cooldown and the last failure, which are the two things that decide
 * whether it may run again and what to tell somebody if it did not.
 *
 * ⚠️ AND IT IS ARMED BY A PERSON, EVERY TIME. Nothing turns this on by default,
 * nothing raises the threshold on somebody's behalf, and clearing the pack turns
 * it off completely — a standing charge somebody did not set is the shape of
 * every subscription complaint there has ever been.
 */
export interface AutoTopUp {
  readonly packId: string | null;
  readonly below: number;
  readonly at: string | null;
  readonly error: string | null;
}

export async function armAutoTopUp(
  db: Db, tenantId: TenantId, packId: string | null, below: number,
): Promise<void> {
  await db.prepare(
    `UPDATE billing_account SET auto_pack = ?, auto_below = ?, auto_error = NULL WHERE tenant_id = ?`)
    .bind(packId, Math.max(0, Math.trunc(below)), tenantId).run();
}

export async function autoTopUpOf(db: Db, tenantId: TenantId): Promise<AutoTopUp> {
  const row = await db.prepare(
    `SELECT auto_pack, auto_below, auto_at, auto_error FROM billing_account WHERE tenant_id = ?`)
    .bind(tenantId).first<{
      auto_pack: string | null; auto_below: number | null;
      auto_at: string | null; auto_error: string | null;
    }>();
  return {
    packId: row?.auto_pack ?? null,
    below: row?.auto_below ?? 0,
    at: row?.auto_at ?? null,
    error: row?.auto_error ?? null,
  };
}

/** ⚠️ One attempt an hour, whatever asks. See `dueForTopUp`. */
export const TOPUP_COOLDOWN_MS = 60 * 60 * 1000;

export interface Owing {
  readonly tenantId: TenantId;
  readonly packId: string;
  readonly customerRef: string;
}

/**
 * EVERY WORKSPACE WHOSE STANDING INSTRUCTION IS DUE.
 *
 * ⚠️ THE COOLDOWN IS IN THE QUERY, AND IT IS THE WHOLE SAFETY. Without it, a
 * workspace out of credits with a busy afternoon asks for a top-up on every
 * refusal — so a card is charged as fast as the requests arrive, and the first
 * anybody knows is the statement. One attempt an hour is slow enough that a
 * runaway costs a customer one purchase and fast enough to be a feature.
 *
 * ⚠️ AND A WORKSPACE WITH NO CUSTOMER RECORD IS NOT DUE. Charging off-session
 * needs a card Stripe already holds; without one the attempt is a guaranteed
 * refusal, recorded as an error somebody has to read and cannot act on.
 */
export async function dueForTopUp(
  db: Db, now = new Date(), cooldownMs = TOPUP_COOLDOWN_MS,
): Promise<readonly Owing[]> {
  const since = new Date(now.getTime() - cooldownMs).toISOString();
  const rows = await db.prepare(
    `SELECT tenant_id, auto_pack, customer_ref FROM billing_account
     WHERE auto_pack IS NOT NULL AND auto_pack != ''
       AND customer_ref IS NOT NULL
       AND COALESCE(granted, 0) + COALESCE(bought, 0) - held < COALESCE(auto_below, 0)
       AND (auto_at IS NULL OR auto_at < ?)`)
    .bind(since).all<{ tenant_id: string; auto_pack: string; customer_ref: string }>();
  return rows.results.map((r) => ({
    tenantId: r.tenant_id as TenantId, packId: r.auto_pack, customerRef: r.customer_ref,
  }));
}

/**
 * ⚠️ THE ATTEMPT IS STAMPED BEFORE THE CHARGE, NEVER AFTER. A charge that
 * succeeds and then fails to record its attempt is one the next pass makes
 * again — and "the card was charged twice and the log says once" is the failure
 * mode this whole cooldown exists to prevent. Recording first can only ever cost
 * a customer an hour's delay.
 */
export async function noteTopUpAttempt(
  db: Db, tenantId: TenantId, now = new Date(),
): Promise<void> {
  await db.prepare(`UPDATE billing_account SET auto_at = ?, auto_error = NULL WHERE tenant_id = ?`)
    .bind(now.toISOString(), tenantId).run();
}

/** ⚠️ Why it did not work, where the customer looks — see `AutoTopUp`. */
export async function noteTopUpFailed(
  db: Db, tenantId: TenantId, why: string,
): Promise<void> {
  await db.prepare(`UPDATE billing_account SET auto_error = ? WHERE tenant_id = ?`)
    .bind(why, tenantId).run();
}

/* -------------------------------------------------------------- spending it --- */

export type ReserveRefusal = "not_enough";

/**
 * Hold what a call might cost.
 *
 * ⚠️ ONE STATEMENT, WITH THE CHECK IN THE `WHERE`. Two concurrent calls that
 * both read a balance of 100 and both hold 80 have spent 160 of it; making the
 * database do the comparison is what makes that impossible rather than unlikely.
 *
 * ⚠️ AND THE HOLD IS AGAINST BOTH BALANCES TOGETHER. Which one a call ends up
 * drawing from is decided at settlement, when the real cost is known — holding
 * against the allowance alone would refuse a workspace that is holding plenty of
 * bought credit.
 */
export async function reserve(
  db: Db, tenantId: TenantId, credits: number, of: string,
): Promise<Reserve | ReserveRefusal> {
  if (credits <= 0) return { credits: 0, of };
  const done = await db.prepare(
    `UPDATE billing_account SET held = held + ?
     WHERE tenant_id = ? AND COALESCE(granted, 0) + COALESCE(bought, 0) - held >= ?`)
    .bind(credits, tenantId, credits).run() as { meta?: { changes?: number } };
  if (!done?.meta?.changes) return "not_enough";
  return { credits, of };
}

/**
 * Charge what it really cost, and release the rest.
 *
 * ⚠️ `min(held, actual)` — see the header. And a missing usage report falls back
 * to the RESERVE rather than to a recount: because of the cap, a recount can
 * only ever charge less than the truth, so the guess would always be free money
 * in one direction.
 *
 * ⚠️ THE ALLOWANCE IS SPENT FIRST, and it is not a preference. What expires at
 * the end of the month should be the thing that gets used; drawing from the
 * bought balance while an allowance sits there means the customer pays cash for
 * something they had already been given, and watches it lapse.
 */
export async function settle(
  db: Db, tenantId: TenantId, held: Reserve, actual: number | null,
  opts: { readonly appId?: AppId; readonly ref?: string } = {}, now = new Date(),
): Promise<number> {
  const charged = settleAt(held, actual);

  /*
    ⚠️ THE SPLIT IS COMPUTED IN SQL, IN ONE STATEMENT, for the same reason the
    hold is: a read-then-write here races another settlement on the same
    workspace and one of the two draws from a balance that is already gone.
    `MIN(granted, charged)` off the allowance, the remainder off what was bought.
  */
  await db.prepare(
    `UPDATE billing_account SET
       held = MAX(0, held - ?),
       granted = MAX(0, COALESCE(granted, 0) - MIN(COALESCE(granted, 0), ?)),
       bought = MAX(0, COALESCE(bought, 0) - MAX(0, ? - COALESCE(granted, 0)))
     WHERE tenant_id = ?`)
    .bind(held.credits, charged, charged, tenantId).run();

  if (charged > 0) await record(db, tenantId, -charged, held.of, opts, now);
  return charged;
}

/**
 * ⚠️ A RESERVE THAT IS NEVER SETTLED WOULD HOLD SOMEBODY'S CREDITS FOR EVER. A
 * worker that dies mid-call leaves the hold behind, and the customer sees a
 * balance they cannot spend with nothing to explain it — so a release exists and
 * a sweep calls it.
 */
export async function release(db: Db, tenantId: TenantId, held: Reserve): Promise<void> {
  await db.prepare(`UPDATE billing_account SET held = MAX(0, held - ?) WHERE tenant_id = ?`)
    .bind(held.credits, tenantId).run();
}

/* ----------------------------------------------------------------- report --- */

export interface Spent {
  readonly appId: string | null;
  readonly credits: number;
}

/**
 * ⚠️ WHERE THE MONEY WENT, PER PRODUCT. One wallet does not mean one number: a
 * business paying for three of our products has to be able to see which one is
 * spending, or the shared balance becomes the reason they cannot tell.
 */
export async function spentByApp(
  db: Db, tenantId: TenantId, since: string,
): Promise<readonly Spent[]> {
  const rows = await db.prepare(
    `SELECT app_id, SUM(-delta) AS credits FROM credit_ledger
     WHERE tenant_id = ? AND at >= ? AND delta < 0 GROUP BY app_id ORDER BY credits DESC`)
    .bind(tenantId, since).all<{ app_id: string | null; credits: number }>();
  return rows.results.map((r) => ({ appId: r.app_id, credits: r.credits }));
}

export interface Movement {
  readonly at: string;
  readonly delta: number;
  readonly reason: string;
  readonly appId: string | null;
}

/**
 * ⚠️ THE STATEMENT, AND IT IS THE ANSWER TO "WHERE DID MY CREDITS GO". A balance
 * with no history behind it is a number somebody has to take on trust, and the
 * first time they do not, there is nothing to show them.
 */
export async function movements(
  db: Db, tenantId: TenantId, limit = 50,
): Promise<readonly Movement[]> {
  const rows = await db.prepare(
    `SELECT at, delta, reason, app_id FROM credit_ledger
     WHERE tenant_id = ? ORDER BY at DESC, id DESC LIMIT ?`)
    .bind(tenantId, limit).all<{ at: string; delta: number; reason: string; app_id: string | null }>();
  return rows.results.map((r) => ({ at: r.at, delta: r.delta, reason: r.reason, appId: r.app_id }));
}
