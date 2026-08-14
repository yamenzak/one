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
    /* ⚠️ The screen suite is its own project — see vitest.screens.config.ts. */
    /*
      ⚠️ ONE FILE AT A TIME, AND EVERY TEST GETS ITS OWN WORLD. These suites
      describe a deployment's life — shards registered, tenants placed, schema
      applied — so they write the same names into the same databases. Sharing one
      store makes each of them a test of whichever ran first, and it surfaces as a
      different test failing on each run, none near the code that caused it.

      ⚠️ AND THERE IS NO `retry`, DELIBERATELY. A retry is what a shared store has
      instead of isolation: it turns a suite that is wrong some of the time into a
      suite that is green, and absorbs the next real intermittent failure with it.
    */
    fileParallelism: false,
    poolOptions: {
      workers: {
        isolatedStorage: true,
        miniflare: {
          compatibilityDate: "2025-07-12",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DIRECTORY", "SHARD_EU_1", "SHARD_EU_2"],
        },
      },
    },
  },
});
