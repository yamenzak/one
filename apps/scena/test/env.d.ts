/**
 * `cloudflare:test` is a virtual module the Workers vitest pool supplies at run
 * time; without this reference `tsc` cannot see it and the integration suite
 * fails typecheck while passing perfectly. Declaring `ProvidedEnv` is what makes
 * `env.DB` typed rather than `unknown`.
 */
/// <reference types="@cloudflare/vitest-pool-workers" />

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    /** Scratch database for `billing-reconcile.test.ts`. See vitest.config.ts. */
    MIGRATION_DB: D1Database;
    PAIRING: KVNamespace;
    MEDIA: R2Bucket;
    SCREEN: DurableObjectNamespace;
    CHANNEL: DurableObjectNamespace;
    QUEUE: DurableObjectNamespace;
    ROOM: DurableObjectNamespace;
    SCORE: DurableObjectNamespace;
    BILLING: DurableObjectNamespace;
  }
}
