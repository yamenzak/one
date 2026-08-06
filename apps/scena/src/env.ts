import type { ScreenDO } from "./screen-do.js";
import type { ChannelDO } from "./channel-do.js";
import type { QueueDO, RoomBoardDO, ScoreDO } from "./board-do.js";
import type { TenantBillingDO } from "./billing-do.js";

/** Cloudflare bindings for the Scena API Worker. */
export interface Env {
  /** One Durable Object per physical screen (holds the hibernatable socket). */
  SCREEN: DurableObjectNamespace<ScreenDO>;
  /** One Durable Object per on-air channel (epoch clock authority). */
  CHANNEL: DurableObjectNamespace<ChannelDO>;
  /** One Durable Object per queue board (ticket queue authority, §20). */
  QUEUE: DurableObjectNamespace<QueueDO>;
  /** One Durable Object per room-status board (§20). */
  ROOM: DurableObjectNamespace<RoomBoardDO>;
  /** One Durable Object per scoreboard (game scores, §boards). */
  SCORE: DurableObjectNamespace<ScoreDO>;
  /** One Durable Object per tenant — the single-threaded credit authority (§24). */
  BILLING: DurableObjectNamespace<TenantBillingDO>;
  /** Pairing code → ScreenDO id, and channel → current manifest pointer. */
  PAIRING: KVNamespace;
  /**
   * The SHARED platform config store — one KV namespace bound with the same id
   * into every 4DL worker (see `@4dl/core` config.ts). Optional: unbound, every
   * read falls back to this app's own `app_config`, which is what `wrangler dev`
   * and the test suite run.
   */
  PLATFORM_CONFIG?: KVNamespace;
  /** Relational authoring source of truth (tenants, screens, …). */
  DB: D1Database;
  /** Proof-of-play / playout telemetry sink (§22). Optional in local dev. */
  PLAYOUT?: AnalyticsEngineDataset;
  /** Media + content-addressed assets (§2). Uploaded slide images, etc. */
  MEDIA: R2Bucket;
  /** Workers AI — HTML slide/widget generation, TTS, image (§24). Optional in
   *  local dev (no Cloudflare account) → AI generation falls back to mock. */
  AI?: Ai;
  /** Legacy single-operator fallback identity (pre-auth). Retained so the
   *  platform-admin gate still resolves before the first real user exists. */
  OPERATOR_EMAIL?: string;
  /** Platform super-admin allowlist for the Admin console + admin routes.
   *  Separate from tenant RBAC roles — these emails reach the platform console. */
  ADMIN_EMAILS?: string;

  /**
   * The DEV LANE signal — `development` and nothing else.
   *
   * ⚠️ It must NEVER appear in `wrangler.jsonc`'s top-level `vars`, which is the
   * DEPLOYED config. In production it would let auth start on the repo-public
   * fallback secret (forgeable sessions) and put sign-in codes in retained logs.
   * It belongs in `.dev.vars`, which is gitignored and never uploaded.
   */
  ENVIRONMENT?: string;

  // ── Better Auth (multi-tenancy) ──────────────────────────────────────────
  /** Signing/encryption key. MUST be set in production (openssl rand -base64 32).
   *  A dev-only fallback is used when unset so local wrangler dev works. */
  BETTER_AUTH_SECRET?: string;
  /** Public origin the browser hits (e.g. https://scena.4dl.app), no trailing
   *  slash. Better Auth derives OAuth callback URLs from it; falls back to the
   *  request origin in dev. */
  BETTER_AUTH_URL?: string;
  /** Google OAuth (optional — social sign-in enables only when both are set). */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;

  /** Cloudflare Email Sending binding (`send_email`). When present + the sender
   *  domain is onboarded, the mailer sends transactional email (OTP codes, alert
   *  + billing notices) with native SPF/DKIM/DMARC — no third-party key. Optional:
   *  the mailer falls back to Resend or a dev mock when unset (see mailer.ts). */
  EMAIL?: SendEmailBinding;
}

/** Minimal shape of Cloudflare's `send_email` binding (Email Sending). The
 *  workers-types package may not yet type the new `.send()` API, so we declare
 *  just what the mailer calls. The `from` domain must be onboarded on the account. */
export interface SendEmailBinding {
  send(message: { to: string; from: string; subject: string; html?: string; text?: string }): Promise<{ messageId?: string } | void>;
}
