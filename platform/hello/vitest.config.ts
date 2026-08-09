import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

/**
 * ⚠️ NO `wrangler.jsonc`, DELIBERATELY. The bindings below are the ones a
 * manifest will generate, declared here so the suite can run without the app
 * being deployable: a `wrangler.jsonc` under `platform/` is discovered by the
 * app registry guard, and an app in the registry is an app CI can ship. `hello`
 * exists to be proved, not published.
 *
 * ⚠️ THE TOPOLOGY IS REAL. Miniflare preserves the Host exactly as the edge
 * does and browsers resolve `.localhost` to loopback, so `setup.hello.localhost`
 * IS the setup door and `<slug>.hello.localhost` IS a workspace. A suite that
 * drove one origin and asserted door behaviour from a flag would be testing the
 * flag.
 */
export default defineWorkersConfig({
  test: {
    // A serial root run absorbs Miniflare storage contention; one retry absorbs
    // the rest. A genuine assertion failure still fails twice.
    retry: 1,
    poolOptions: {
      workers: {
        /*
          ⚠️ SHARED STORAGE ACROSS THE FILE, ON PURPOSE. These tests describe a
          deployment's life — it boots, a workspace is created, the workspace is
          then served — and rolling storage back between them would make every
          test after the first run against a database with no schema, since a
          runtime memoises its composition per isolate exactly as production
          wants it to.
        */
        isolatedStorage: false,
        miniflare: {
          compatibilityDate: "2026-01-01",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: {
            // Global. Routing data only — see DIRECTORY_COLUMNS.
            DIRECTORY: "one-hello-directory",
            // The default region keeps the bare name; a second region is
            // ADDITIVE beside it rather than a rename of this one.
            DB: "one-hello-auto",
            DB_EU: "one-hello-eu",
          },
          r2Buckets: { MEDIA: "one-hello-media", MEDIA_EU: "one-hello-media-eu" },
          kvNamespaces: ["CACHE"],
        },
      },
    },
  },
});
