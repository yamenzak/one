/**
 * THE BINDINGS. Every name here is fixed by `@4dl/core`'s bindings contract.
 *
 * Shared packages declare the SLICE they need structurally (`HasDb & HasMedia`),
 * never this interface — so `Env` satisfies them by SHAPE, with no import and no
 * registration. The price of that is the naming: `DB`, `CACHE`, `MEDIA`, `AI`,
 * `EMAIL`. Rename one and the packages stop matching, silently, at the type
 * level. A second bucket or a second KV gets a different name and is passed
 * explicitly.
 *
 * Read `packages/core/src/bindings.ts` before changing anything above the fold.
 */

import type { SendEmailBinding } from "@4dl/core";
import type { InboxDO } from "./inbox-do.js";
import type { TenantBillingDO } from "./billing-do.js";

export interface Env {
  /** One Durable Object per tenant — the single-threaded credit authority. */
  BILLING: DurableObjectNamespace<TenantBillingDO>;
  /** One Durable Object per user — real-time notification push (WebSocket). */
  INBOX: DurableObjectNamespace<InboxDO>;
  /** Relational source of truth: identity, tenancy, and this app's own tables. */
  DB: D1Database;
  /** Response cache + short-lived tokens. Never a source of truth. */
  CACHE: KVNamespace;
  /** Object storage, accounted through `@4dl/storage`'s media ledger. */
  MEDIA: R2Bucket;
  /** Workers AI. Optional: absent means the mock lane (dev) or a refusal. */
  AI?: Ai;
  /** Cloudflare Email Sending. Absent means the mailer falls back to the mock. */
  EMAIL?: SendEmailBinding;

  /** Platform super-admin allowlist (comma-separated emails). */
  ADMIN_EMAILS?: string;
  /**
   * The deploy lane. Exactly one value opens a dev-only path: the literal
   * `"development"`. Anything else — including unset — is production and fails
   * closed. Never put this in `wrangler.jsonc`'s top-level `vars`: that block is
   * the DEPLOYED config, and the dev lane puts sign-in codes in retained logs,
   * accepts a fallback auth secret, and turns on the fabricating AI mock.
   */
  ENVIRONMENT?: string;

  /** Better Auth signing key. Optional only on the dev lane. */
  BETTER_AUTH_SECRET?: string;
  /** Canonical public origin of the ROOT door. */
  BETTER_AUTH_URL?: string;
  /**
   * The apex tenants are served under, e.g. `example.4dl.app`.
   *
   * Set it EXPLICITLY. Deriving it silently reclassifies every tenant subdomain
   * as a foreign custom domain, which fails closed — presenting as "every tenant
   * 404s", with nothing pointing at the cause.
   */
  ROOT_DOMAIN?: string;
}
