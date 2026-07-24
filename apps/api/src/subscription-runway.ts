/**
 * Optimistic-concurrency (CAS) writes for a `client_subscriptions` row's
 * `budgets_json` / `addons_json` runway columns.
 *
 * These JSON columns are mutated read-modify-write by FOUR uncoordinated
 * writers — the staff grant, the client `/redeem`, the Connect webhook grant,
 * and the renewal top-up — plus the lazy reconcile. Without a compare-and-swap,
 * genuinely concurrent traffic (a client redeeming a code at the same instant a
 * Stripe renewal webhook lands on the same active row) computes each write from
 * a stale read and the last writer silently overwrites the other — destroying
 * paid access days that were bought with a burned redemption slot or a real
 * charge, with no error and no compensation.
 *
 * This mirrors the CAS retry already used for the session-completion add-on
 * decrement (`session-routes.ts`): re-read the row, recompute, and write guarded
 * by `budgets_json IS <prev> AND addons_json IS <prev>` so a concurrent commit
 * is detected and we retry. Returns whether the write landed (false = the row
 * vanished or we exhausted retries — the caller decides how to surface it).
 */

import type { Budget, AddOnBalance } from "@mossa/domain";
import { parseJson, j } from "./db.js";

const MAX_ATTEMPTS = 5;

export interface RunwayUpdate {
  budgets: Budget[];
  addOns: AddOnBalance[];
  /** Extra columns set in the SAME guarded UPDATE (status, payment_status,
   *  installment counters, …). `sql` is a fragment appended after the two JSON
   *  assignments (leading comma added here); `binds` fills its `?`s in order. */
  extra?: { sql: string; binds: unknown[] };
}

/**
 * Apply a CAS retry loop over one subscription row's runway columns. `apply`
 * receives the freshly-read budgets + add-on balances and returns the next
 * arrays (plus any extra columns to set). Returns true once the guarded write
 * commits, false if the row is gone or all attempts raced out.
 */
export async function updateSubscriptionRunway(
  db: D1Database,
  rowId: string,
  apply: (budgets: Budget[], addOns: AddOnBalance[]) => RunwayUpdate,
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const row = await db
      .prepare("SELECT budgets_json, addons_json FROM client_subscriptions WHERE id = ?")
      .bind(rowId)
      .first<{ budgets_json: string | null; addons_json: string | null }>();
    if (!row) return false;
    const prevB = row.budgets_json ?? null;
    const prevA = row.addons_json ?? null;
    const next = apply(parseJson<Budget[]>(prevB, []), parseJson<AddOnBalance[]>(prevA, []));
    const extraSql = next.extra?.sql ? `, ${next.extra.sql}` : "";
    const extraBinds = next.extra?.binds ?? [];
    const w = await db
      .prepare(
        `UPDATE client_subscriptions SET budgets_json = ?, addons_json = ?${extraSql} WHERE id = ? AND budgets_json IS ? AND addons_json IS ?`,
      )
      .bind(j(next.budgets), j(next.addOns), ...extraBinds, rowId, prevB, prevA)
      .run();
    if ((w.meta?.changes ?? 0) > 0) return true;
  }
  return false;
}
