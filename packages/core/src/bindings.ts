/**
 * THE BINDINGS CONTRACT — how a shared package reaches Cloudflare without
 * knowing which app it is running inside.
 *
 * A worker's `Env` is one concrete interface listing every binding that app has.
 * If `@4dl/billing` imports it, billing is welded to that app: the next app must
 * either name its bindings identically AND declare every binding billing's
 * neighbours use, or fork the package. Both are the failure this whole extraction
 * exists to prevent.
 *
 * So packages declare the SLICE they need, structurally:
 *
 *     // in @4dl/storage
 *     export type StorageBindings = HasDb & HasMedia
 *     export async function putMedia<E extends StorageBindings>(env: E, …)
 *
 * An app's own `Env` satisfies that by shape — no import, no registration, no
 * base interface to extend. And the compiler now enforces least privilege: a
 * function typed `HasDb` cannot reach R2 even by accident, because R2 is not on
 * the type it was handed.
 *
 * ── The one convention this imposes ─────────────────────────────────────────
 *
 * Structural typing matches on NAME, so every 4DL app binds the same things to
 * the same names in `wrangler.jsonc`. That is the whole price of admission, and
 * it is worth paying: `DB`, `CACHE`, `MEDIA`, `AI`, `EMAIL`. An app that needs a
 * second bucket or a second KV names it something else and passes it explicitly.
 */

/** D1 — the relational store. Every package that persists anything needs this. */
export interface HasDb {
  DB: D1Database;
}

/** KV — provider-response cache and short-lived tokens. Never a source of truth. */
export interface HasCache {
  CACHE: KVNamespace;
}

/** R2 — the media bucket. */
export interface HasMedia {
  MEDIA: R2Bucket;
}

/** Workers AI. Optional everywhere: absent means the mock lane or a hard refusal,
 *  decided by the AI package, never by its callers. */
export interface HasAi {
  AI?: Ai;
}

/**
 * Cloudflare's `send_email` binding, structurally.
 *
 * Typed here rather than imported from `cloudflare:email` so a package can accept
 * a mailer binding without pulling a Workers-runtime module into its type graph
 * (which would break `vitest` runs outside the workers pool).
 */
export interface SendEmailBinding {
  send(message: unknown): Promise<void>;
}

export interface HasEmail {
  EMAIL?: SendEmailBinding;
}

/**
 * The deploy lane.
 *
 * Exactly one value opens a dev-only path: the literal `"development"`. Anything
 * else — including unset — is production and fails closed. This is deliberately
 * not a boolean: the absence of a flag must never be the thing that unlocks a
 * mock mailer, a fabricating AI lane or a repo-public signing key.
 */
export interface HasEnvironment {
  ENVIRONMENT?: string;
}

/** True only on the explicit development lane. The single predicate every
 *  package asks, so no two of them can disagree about what "dev" means. */
export const isDevLane = (env: HasEnvironment): boolean => env.ENVIRONMENT === "development";

/** The floor every persistence-backed package builds on. */
export type BaseBindings = HasDb & HasEnvironment;
