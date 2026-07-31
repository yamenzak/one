/**
 * Kova's credit authority — `@4dl/billing`'s `CreditLedgerDO`, bound to D1.
 *
 * ⚠️ **The class name is load-bearing.** `wrangler.jsonc`'s `migrations` bind
 * `TenantBillingDO` to durable storage, and every tenant's balance lives under
 * that binding. Renaming this class orphans all of them — the DO would come up
 * empty and every tenant would silently be at zero credits. It stays.
 *
 * The only thing the base class cannot do is write the append-only mirror,
 * because that is the app's table.
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
