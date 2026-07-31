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
    CACHE: KVNamespace;
    MEDIA: R2Bucket;
    BILLING: DurableObjectNamespace;
    INBOX: DurableObjectNamespace;
  }
}
