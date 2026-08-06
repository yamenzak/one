/**
 * Scena's credit authority — `@4dl/billing`'s `CreditLedgerDO`, bound to D1.
 *
 * ⚠️ **The class name is load-bearing.** `wrangler.jsonc`'s `migrations` bind
 * `TenantBillingDO` to durable storage, and every tenant's balance lives under
 * that binding. Renaming this class orphans all of them — the DO would come up
 * empty and every tenant would silently be at zero credits. It stays.
 *
 * The only thing the base class cannot do is write the append-only mirror,
 * because that is the app's table.
 *
 * ── What changed: the balance is TWO buckets now, and a grant LAPSES ───────
 *
 * Scena's own DO kept a single `balance` and implemented `grantMonthly` as a
 * top-up, with a comment reading "a floor top-up: purchased credits persist
 * alongside it". With one counter it could not distinguish them, so what
 * actually happened is that **an unused monthly grant rolled over forever**: a
 * workspace on the top tier accrued its 5,000 credits every month whether or not
 * it generated anything, and could bank 60,000 in a year and spend them in an
 * afternoon. That is not what a monthly grant is, and it is not what the pricing
 * page describes.
 *
 * The shared base splits the balance:
 *
 *   purchased  credit packs, promos, admin top-ups. Never expire.
 *   granted    the current period's plan grant. RESET (overwritten) each period,
 *              not added, so an unused grant lapses.
 *
 * Spending drains `granted` first — use-it-or-lose-it — then `purchased`, so a
 * tenant never loses a credit they paid for. Both halves ship in `BalanceView`,
 * which is what lets the billing screen say "1,200 this month + 340 you bought"
 * instead of one number that hides which is which.
 *
 * ⚠️ The storage layout differs from the old single-counter one. There are no
 * live Scena tenants, so this is a re-seed rather than a migration; a deployment
 * that DID have balances would need one, and it would be a real one.
 */

import { CreditLedgerDO, type CreditLedgerMirror } from "@4dl/billing";
import type { Env } from "./env.js";
import { appendLedger } from "./billing-store.js";

export type { BalanceView, LedgerEntry } from "@4dl/billing";

export class TenantBillingDO extends CreditLedgerDO<Env> {
  protected override async mirror(entry: CreditLedgerMirror): Promise<void> {
    await appendLedger(this.env.DB, entry);
  }
}
