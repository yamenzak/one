import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

/**
 * ⚠️ NO `wrangler.jsonc`, DELIBERATELY. The bindings below are what a deployment
 * will have; declaring them here lets the suite run against real D1 without this
 * package looking like something that can be deployed. A runtime is a library.
 *
 * ⚠️ THREE DATABASES, BECAUSE ONE WOULD PROVE NOTHING. The whole subject of this
 * stage is that a tenant's records are somewhere OTHER than the directory, and a
 * suite where "the shard" and "the directory" are the same store would pass with
 * the placement wired backwards.
 */
export default defineWorkersConfig({
  test: {
    /*
      ⚠️ ONE FILE AT A TIME AND NO ISOLATION. These suites describe a
      deployment's life — shards registered, tenants placed, schema applied — and
      running them concurrently against one store is contention by construction.
      It surfaces as a different test failing on each run, none of them near the
      code that caused it.
    */
    fileParallelism: false,
    retry: 1,
    poolOptions: {
      workers: {
        isolatedStorage: false,
        miniflare: {
          compatibilityDate: "2025-07-12",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DIRECTORY", "SHARD_EU_1", "SHARD_EU_2"],
        },
      },
    },
  },
});
