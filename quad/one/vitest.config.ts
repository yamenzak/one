import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

/**
 * ⚠️ THE REAL `wrangler.jsonc`, NOT A SECOND SET OF BINDINGS. This is the one
 * package in the tree that IS a deployment, so its suite should boot the same
 * configuration a deploy does — a suite with its own bindings proves the suite.
 *
 * ⚠️ THE ASSETS BINDING IS THE EXCEPTION and it is stubbed below, because the
 * Hub's build is a separate artefact and this suite is about the worker. What it
 * asserts is that the worker DELEGATED rather than answered.
 */
export default defineWorkersConfig({
  test: {
    fileParallelism: false,
    retry: 1,
    poolOptions: {
      workers: {
        isolatedStorage: false,
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          compatibilityDate: "2025-07-12",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DIRECTORY", "SHARD_EU_1"],
          bindings: { ROOT: "localhost", ENVIRONMENT: "production", AUTH_SECRET: "test-secret" },
          serviceBindings: {
            ASSETS: () => new Response("<!doctype html><title>One</title>", {
              headers: { "content-type": "text/html" },
            }),
          },
        },
      },
    },
  },
});
