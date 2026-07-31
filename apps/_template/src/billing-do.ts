/**
 * THE CREDIT AUTHORITY — `@4dl/billing`'s `CreditLedgerDO`, bound to this app.
 *
 * ⚠️ **The class name is load-bearing.** `wrangler.jsonc`'s `migrations` bind it
 * to durable storage, and every tenant's balance lives under that binding.
 * Renaming the class orphans all of them — the DO comes up empty and every
 * tenant is silently at zero credits. Pick the name once.
 *
 * The only thing the base class cannot do is write the append-only mirror,
 * because that is the app's table.
 */

import { CreditLedgerDO, type CreditLedgerMirror } from "@4dl/billing";
import { newId, nowMs } from "@4dl/core";
import type { Env } from "./env.js";

export type { BalanceView, LedgerEntry } from "@4dl/billing";

export class TenantBillingDO extends CreditLedgerDO<Env> {
  protected override async mirror(entry: CreditLedgerMirror): Promise<void> {
    await this.env.DB
      .prepare("INSERT INTO credit_ledger (id, tenant_id, delta, balance, reason, ref, at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(newId("led"), entry.tenant_id, entry.delta, entry.balance, entry.reason, entry.ref, nowMs())
      .run();
  }
}
