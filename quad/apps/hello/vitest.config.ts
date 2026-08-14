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
    exclude: ["**/*.screens.test.tsx", "**/node_modules/**"],
    /*
      ⚠️ ONE FILE AT A TIME, AND EVERY TEST GETS ITS OWN WORLD. These suites
      describe a deployment's life — shards registered, tenants placed, schema
      applied — so they write the same names into the same three databases:
      `northwind` is created by nine tests and one wallet is spent by a dozen.
      A shared store makes each of those a test of whichever ran first.

      ⚠️ AND THE FAULT IS ALWAYS SOMEWHERE ELSE. It surfaces as a different test
      failing on each run, none near the code that caused it, at a rate low
      enough that a re-run looks like a fix — `expected 200 to be 409` because a
      slug a previous test took had gone, `expected 'not_enough'` because a
      wallet a previous test drained had not. Measured here at roughly one run in
      two with retries off; nothing at all with the stack on.

      ⚠️ SO THERE IS NO `retry`, DELIBERATELY. A retry is what this config had
      instead of isolation, and it turns a suite that is wrong half the time into
      a suite that is green — which is strictly worse than red, because the next
      real intermittent failure is absorbed by the same line and nobody sees it.
    */
    fileParallelism: false,
    poolOptions: {
      workers: {
        /*
          ⚠️ PER-TEST STORAGE STACK. `beforeAll` seeding survives (the stack pops
          back to it, not past it), and each test's writes are discarded — which
          is the property every assertion in this package already assumed.
        */
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
