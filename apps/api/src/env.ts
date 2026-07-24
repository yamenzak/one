import type { TenantBillingDO } from "./billing-do.js";
import type { InboxDO } from "./inbox-do.js";

/** Cloudflare bindings for the Mossa API Worker (SPEC §3). */
export interface Env {
  /** One Durable Object per tenant — the single-threaded credit authority. */
  BILLING: DurableObjectNamespace<TenantBillingDO>;
  /** One Durable Object per user — real-time notification push (WebSocket). */
  INBOX: DurableObjectNamespace<InboxDO>;
  /** Relational source of truth: Better Auth + all tenant coaching data. */
  DB: D1Database;
  /** External-provider response cache + short-lived tokens. */
  CACHE: KVNamespace;
  /** Media library (exercise media, food images, progress photos, labs). */
  MEDIA: R2Bucket;
  /** Workers AI. Optional in local dev → AI falls back to the mock. */
  AI?: Ai;
  /** Product analytics sink. Optional in local dev. */
  USAGE?: AnalyticsEngineDataset;

  /** Platform super-admin allowlist (comma-separated emails). */
  ADMIN_EMAILS?: string;
  /** Deploy environment. Only an explicit "development" opens the admin lane when
   *  ADMIN_EMAILS is empty; anything else (incl. unset) fails closed. */
  ENVIRONMENT?: string;

  // ── Better Auth ───────────────────────────────────────────────────────────
  /** Signing/encryption key. Optional only on the dev lane (ENVIRONMENT=development
   *  or a localhost origin); anywhere else `createAuth` fails CLOSED when it is
   *  unset rather than signing sessions with a repo-public fallback. */
  BETTER_AUTH_SECRET?: string;
  /** Public origin (e.g. https://mossa.4dl.app); falls back to request origin. */
  BETTER_AUTH_URL?: string;

  /** Cloudflare Email Sending binding; mailer mocks when absent. */
  EMAIL?: SendEmailBinding;
}

/** Cloudflare's `send_email` binding — takes an EmailMessage (cloudflare:email). */
export interface SendEmailBinding {
  send(message: unknown): Promise<void>;
}
