/**
 * The credit ledger's DATA types, separated from the Durable Object that
 * produces them.
 *
 * `credit-do.ts` imports `cloudflare:workers`, which does not exist outside the
 * Workers runtime — so a browser or plain-Node consumer that only wants to
 * RENDER a balance cannot import from there, and even a type-only re-export
 * still makes TypeScript typecheck that module. Splitting the types out is the
 * only version of this that works in both directions.
 */

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

/** One movement, as handed to the app's append-only mirror. */
export interface CreditLedgerMirror {
  tenant_id: string;
  delta: number;
  balance: number;
  reason: string;
  ref: string | null;
}
