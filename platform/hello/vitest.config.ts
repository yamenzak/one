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
    /*
      ⚠️ THE MAINTENANCE SUITE IS NOT HERE — see `vitest.solo.config.ts`. Files
      share one database on purpose, and maintenance is a DEPLOYMENT-WIDE switch,
      so a file that closes the door closes it for whatever is running beside it.
      Three unrelated suites went red the first time it lived here, every one of
      them reporting a 503 from an endpoint with nothing to do with the test that
      turned it on.
    */
    /* ⚠️ The lock check needs a filesystem, so it lives in the node project. */
    exclude: ["**/*.node.test.ts", "**/*.solo.test.ts", "**/node_modules/**"],
    /*
      ⚠️ The screen suite is plain React rendered to a string — no worker, no
      Miniflare. It runs in the same project because one command is worth more
      than the second of startup it costs, and because a screen that cannot be
      rendered beside the routes it calls is a screen nobody checks.
    */
    /*
      ⚠️ ONE FILE AT A TIME, BECAUSE THE FILES SHARE ONE DATABASE. `isolatedStorage`
      is false below on purpose — these tests describe a deployment's life — and
      running them concurrently against one store is contention by construction
      rather than by accident. It surfaced as a different test failing on each
      run, none of them near the code that caused it, and about a third of runs:
      a sign-in racing another file's, a workspace read before its neighbour's
      write landed.

      ⚠️ AND THE RETRY DOES NOT SAVE IT, which is what made this look like flake
      rather than a fault. This package's fixtures use FIXED addresses and slugs,
      so a retried file signs the same email in again inside the OTP cooldown and
      gets no session at all — the second attempt fails for a different reason
      than the first, and the reported error describes neither.

      ⚠️ THIS ALONE DID NOT FIX IT, and the note is here so nobody trusts it to.
      What actually did was moving the CONFIGURATION suite to the solo project:
      it blanks the deployment's mail sender on purpose, and no amount of
      ordering saves a neighbour that runs during that window. `signIn` throwing
      instead of returning an empty cookie is what turned three weeks of
      "something is flaky" into one line naming the door and the status.
    */
    fileParallelism: false,
    // One retry absorbs what is left. A genuine assertion failure still fails twice.
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
          /*
            ⚠️ THE SECRET IS PRESENT IN THE SUITE AND ABSENT IN `hello`'s OWN
            DEFAULTS, so both halves are exercised: a deployment with no provider
            configured refuses the public endpoint, and one with a secret verifies
            against the exact bytes that were signed.
          */
          bindings: { PROVIDER_WEBHOOK_SECRET: "whsec_test" },
        },
      },
    },
  },
});
