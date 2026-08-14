/**
 * ONE WALLET PER BUSINESS, WHATEVER PRODUCTS SPEND FROM IT.
 *
 * ⚠️ A BALANCE PER PRODUCT WOULD BE THE SAME MISTAKE AS A BILL PER PRODUCT (D1).
 * A business that topped up in one product and ran out in another, on the same
 * day, holding the same card, is a business being told to buy credits twice.
 * The ledger carries which product spent what — that is a report, not a wall.
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

import type { AppId, TenantId } from "@quad/kernel";
import { newId, settle as settleAt, type Reserve } from "@quad/kernel";
import type { Db } from "./sql.js";

export interface Balance {
  readonly balance: number;
  readonly held: number;
  /** What may actually be spent right now. */
  readonly spendable: number;
}

export async function balanceOf(db: Db, tenantId: TenantId): Promise<Balance> {
  const row = await db.prepare(`SELECT balance, held FROM billing_account WHERE tenant_id = ?`)
    .bind(tenantId).first<{ balance: number; held: number }>();
  const balance = row?.balance ?? 0;
  const held = row?.held ?? 0;
  return { balance, held, spendable: Math.max(0, balance - held) };
}

export async function openAccount(
  db: Db, tenantId: TenantId, currency = "EUR", now = new Date(),
): Promise<void> {
  await db.prepare(
    `INSERT INTO billing_account (tenant_id, customer_ref, currency, balance, held, at)
     VALUES (?, NULL, ?, 0, 0, ?) ON CONFLICT(tenant_id) DO NOTHING`)
    .bind(tenantId, currency, now.toISOString()).run();
}

/**
 * ⚠️ EVERY MOVEMENT IS A LEDGER ROW AND A BALANCE UPDATE, in that order. The row
 * is the record somebody can be shown; the balance is a cache of it. Writing the
 * balance without the row leaves money that appeared from nowhere, and that is
 * the one thing nobody can reconstruct afterwards.
 */
export async function credit(
  db: Db, tenantId: TenantId, amount: number, reason: string,
  opts: { readonly appId?: AppId; readonly ref?: string } = {}, now = new Date(),
): Promise<void> {
  if (amount <= 0) return;
  await db.prepare(
    `INSERT INTO credit_ledger (id, tenant_id, app_id, at, delta, reason, ref) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(newId("led", now), tenantId, opts.appId ?? null, now.toISOString(), amount, reason,
      opts.ref ?? null).run();
  await db.prepare(`UPDATE billing_account SET balance = balance + ? WHERE tenant_id = ?`)
    .bind(amount, tenantId).run();
}

export type ReserveRefusal = "not_enough";

/**
 * Hold what a call might cost.
 *
 * ⚠️ ONE STATEMENT, WITH THE CHECK IN THE `WHERE`. Two concurrent calls that
 * both read a balance of 100 and both hold 80 have spent 160 of it; making the
 * database do the comparison is what makes that impossible rather than unlikely.
 */
export async function reserve(
  db: Db, tenantId: TenantId, credits: number, of: string,
): Promise<Reserve | ReserveRefusal> {
  if (credits <= 0) return { credits: 0, of };
  const done = await db.prepare(
    `UPDATE billing_account SET held = held + ? WHERE tenant_id = ? AND balance - held >= ?`)
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
 */
export async function settle(
  db: Db, tenantId: TenantId, held: Reserve, actual: number | null,
  opts: { readonly appId?: AppId; readonly ref?: string } = {}, now = new Date(),
): Promise<number> {
  const charged = settleAt(held, actual);
  await db.prepare(`UPDATE billing_account SET held = MAX(0, held - ?), balance = balance - ? WHERE tenant_id = ?`)
    .bind(held.credits, charged, tenantId).run();
  if (charged > 0) {
    await db.prepare(
      `INSERT INTO credit_ledger (id, tenant_id, app_id, at, delta, reason, ref) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(newId("led", now), tenantId, opts.appId ?? null, now.toISOString(), -charged, held.of,
        opts.ref ?? null).run();
  }
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
