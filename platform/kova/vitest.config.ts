import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

/**
 * ⚠️ THE TOPOLOGY IS REAL. Miniflare preserves the Host exactly as the edge does
 * and browsers resolve `.localhost` to loopback, so `setup.kova.localhost` IS
 * the setup door and `<slug>.kova.localhost` IS a workspace. A suite that drove
 * one origin and asserted door behaviour from a flag would be testing the flag.
 */
export default defineWorkersConfig({
  test: {
    /* ⚠️ The lock check needs a filesystem, so it lives in the node project. */
    exclude: ["**/*.node.test.ts", "**/*.solo.test.ts", "**/node_modules/**"],
    /*
      A serial root run absorbs Miniflare storage contention; one retry absorbs
      the rest. A genuine assertion failure still fails twice.
    */
    retry: 1,
    poolOptions: {
      workers: {
        /*
          ⚠️ SHARED STORAGE ACROSS THE FILE, ON PURPOSE. These tests describe a
          deployment's life — it boots, a workspace is created, the workspace is
          then served — and rolling storage back between them would make every
          test after the first run against a database with no schema.
        */
        isolatedStorage: false,
        miniflare: {
          compatibilityDate: "2026-01-01",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: {
            /* Global. Routing data only — see DIRECTORY_COLUMNS. */
            DIRECTORY: "one-kova-directory",
            /* The default region keeps the bare name; a second is ADDITIVE beside it. */
            DB: "one-kova-auto",
          },
          r2Buckets: { MEDIA: "one-kova-media" },
          kvNamespaces: ["CACHE"],
        },
      },
    },
  },
});
