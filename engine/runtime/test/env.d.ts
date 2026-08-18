/**
 * ⚠️ THE BINDINGS THE SUITE RUNS AGAINST, TYPED. Without this `env` is
 * `ProvidedEnv` with nothing on it, and every access is an error — which reads
 * as the suite being wrong rather than the declaration being absent.
 */
declare module "cloudflare:test" {
  interface ProvidedEnv {
    DIRECTORY: D1Database;
    SHARD_EU_1: D1Database;
    SHARD_EU_2: D1Database;
    SHARD_GLOBAL_1: D1Database;
  }
}
