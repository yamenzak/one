import type { TenantBillingDO } from "./billing-do.js";

/** Cloudflare bindings for the Mossa API Worker (SPEC §3). */
export interface Env {
  /** One Durable Object per tenant — the single-threaded credit authority. */
  BILLING: DurableObjectNamespace<TenantBillingDO>;
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

  // ── Better Auth ───────────────────────────────────────────────────────────
  /** Signing/encryption key. MUST be set in production. */
  BETTER_AUTH_SECRET?: string;
  /** Public origin (e.g. https://mossa.4dl.app); falls back to request origin. */
  BETTER_AUTH_URL?: string;

  /** Cloudflare Email Sending binding; mailer mocks when absent. */
  EMAIL?: SendEmailBinding;
}

/** Minimal shape of Cloudflare's `send_email` binding. */
export interface SendEmailBinding {
  send(message: {
    to: string;
    from: string;
    subject: string;
    html?: string;
    text?: string;
  }): Promise<{ messageId?: string } | void>;
}
