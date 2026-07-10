/// <reference types="@cloudflare/vitest-pool-workers" />

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    CACHE: KVNamespace;
    MEDIA: R2Bucket;
    BILLING: DurableObjectNamespace;
  }
}
