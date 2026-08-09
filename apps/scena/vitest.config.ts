import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

/**
 * TWO SUITES, ONE CONFIG — and this file arrived late, which cost something.
 *
 * Everything under `test/` was a pure unit test until Stage 2: registries,
 * pricing maths, schema declarations. All useful, and structurally blind to the
 * class of failure this app actually produces. Stage 2 was verified by hand
 * against a real `wrangler dev` and that hour found four defects, every one of
 * which typechecks perfectly and passes all 141 unit tests:
 *
 *   • enabling the station credential provider also opened Better Auth's PUBLIC
 *     `POST /sign-up/email`, so a stranger could register a password account on
 *     a routable address and sign in with it
 *   • `@4dl/core` bootstraps `app_config (key, value)` before any module runs,
 *     so Scena's wider `CREATE TABLE IF NOT EXISTS` never added `updated_at` —
 *     a fresh deployment could not seed its catalog or save any setting, while
 *     an existing one worked perfectly
 *   • the worker's `assets.directory` still pointed at the SPA's path in the
 *     repo Scena came from
 *   • a module cycle resolved a constant to `undefined` at init, surfacing as
 *     `D1_TYPE_ERROR` from the seed on a fresh database
 *
 * None of those is findable without running the real worker against a real D1.
 * `test/integration.test.ts` is that, and it exists so the remaining stages —
 * each of which moves schema and routes — do not have to be found the same way.
 *
 * Running the pure suites in the Workers pool too costs them a little startup
 * and buys one command, one config, and no chance of a test landing in the
 * wrong project by accident.
 */
export default defineWorkersConfig({
  test: {
    // The integration tests provision their own world through the real HTTP
    // surface — an OTP sign-in, an organization create — before asserting
    // anything. Vitest's 5s default fails on a slow runner rather than a bug.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    /**
     * ONE RETRY, for the pool's own teardown and nothing else.
     *
     * Under a parallel root `pnpm test` several Workers-pool suites contend for
     * the Miniflare runtime, and the loser dies in an after-hook with
     * `Isolated storage failed` or `Network connection lost` thrown from
     * `updateStackedStorage` — the same fault with two messages, and never an
     * assertion. The bound matters: ONE. A genuine failure fails identically on
     * the second attempt and still turns the run red.
     */
    retry: 1,
    poolOptions: {
      workers: {
        /*
          ⚠️ PER-TEST STORAGE ISOLATION IS OFF, and it has to be for a suite
          that writes R2.

          The pool snapshots every storage backend between tests by copying the
          SQLite files behind them, asserting each filename ends in `.sqlite`.
          An R2 bucket that has been WRITTEN to leaves a `-shm` sidecar next to
          its database while the connection is open, and the assertion fails on
          it — `Expected .sqlite, got …sqlite-shm`, thrown from the pool's own
          start-of-test hook, deterministically, on the SECOND test in a file
          that puts an object. It is a pool limitation, not a flake: the retry
          reproduces it exactly.

          Turning isolation off costs this suite nothing, because it never
          relied on it. Every test provisions its own workspace under a unique
          slug and asserts against that workspace; `beforeAll` seeds the schema
          and the plan catalog once, deliberately shared. What isolation would
          add is a rollback nothing here wants.
        */
        isolatedStorage: false,
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          compatibilityFlags: ["nodejs_compat"],
          /*
            A SECOND, EMPTY D1 — the only way to test a MIGRATION.

            `billing-reconcile.test.ts` has to build a database in the shape
            Scena shipped BEFORE it adopted `BILLING_SCHEMA` — `price_cents`,
            `sort`, `created_at`, epoch-millisecond timestamps — and then watch
            the reconciler move it. `env.DB` is by definition not in that shape:
            it is the current one, seeded once in `beforeAll` and shared across
            this whole suite because `isolatedStorage` is off. Rebuilding the
            legacy tables inside it would take the catalog every other test
            reads down with them.

            It binds nothing else and no production config knows about it.
          */
          d1Databases: { MIGRATION_DB: { id: "scena-migration-test" } },
          /*
            `ENVIRONMENT: development` is what lets `@4dl/auth` start without a
            real signing secret — outside development it REFUSES rather than
            signing sessions with a key that is public in this repo. Empty
            `ADMIN_EMAILS` then makes any signed-in user a platform admin (the
            dev-only fail-open).

            ⚠️ That second part is why these tests CANNOT observe a route-guard
            action gate refusing: every test user is an operator. Assert
            authorization through something that does not consult platform-admin
            status — the seat ceiling, row-level board scope, or an in-handler
            owner check. All three are exercised below.
          */
          bindings: {
            ADMIN_EMAILS: "",
            ENVIRONMENT: "development",
            BETTER_AUTH_URL: "http://localhost:8787",
            /*
              `localhost` HERE and the real apex in `wrangler.jsonc`.

              Without the override the slug guard provisions
              `<slug>.scena.4dl.app` while the suite drives `<slug>.localhost`,
              and the two never meet — the workspace still RESOLVES (the lookup
              is by slug), so only the `tenant_domains` row is missing and the
              failure looks like a provisioning bug rather than a config one.

              It is not a fudge: the whole topology is exercised for real.
              `setup.localhost` is the setup door, `play.localhost` is the
              device door, `<slug>.localhost` is a workspace, and Miniflare
              preserves the Host header exactly as the edge does.
            */
            ROOT_DOMAIN: "localhost",
          },
        },
      },
    },
  },
});
