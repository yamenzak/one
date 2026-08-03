import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

/**
 * Two suites, one config.
 *
 * `test/conformance.test.ts` reads declarations and needs no runtime at all;
 * `test/integration.test.ts` drives the real worker over HTTP through Miniflare.
 * Running both in the Workers pool costs the conformance checks a little startup
 * and buys one command, one config, and no chance of a test landing in the wrong
 * project by accident.
 */
export default defineWorkersConfig({
  test: {
    // Almost every integration test provisions its own world through the real
    // HTTP surface — a passwordless OTP sign-in, an organization create — before
    // it asserts anything. Vitest's 5s default fails on a slow runner rather
    // than on a bug.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    /**
     * ONE RETRY, for the pool's own teardown and nothing else.
     *
     * These suites are not flaky in the ordinary sense — the failure that
     * brought CI down did not come from an assertion at all:
     *
     *   Error: Network connection lost.
     *     at WorkersTestRunner.updateStackedStorage
     *     at WorkersTestRunner.ensurePoppedActiveTryStorage
     *     at WorkersTestRunner.onAfterTryTask
     *
     * That is the Workers pool pushing and popping its per-test isolated
     * storage stack, losing the connection to the Miniflare runtime under load.
     * The same file passes in 4s locally and took 34s on the runner that failed
     * it — several Workers-pool suites run concurrently under the root
     * `pnpm test`, and the loser of that contention dies in the after-hook. It
     * is the same fault CLAUDE.md records as "Isolated storage failed"; only
     * the message differs.
     *
     * A retry is the right instrument here and a bad one in general, so the
     * bound matters: ONE. A genuine assertion failure fails identically on the
     * second attempt and still turns the run red — retries cannot hide a real
     * regression, only a runtime that dropped underneath one. The alternative
     * is a red main branch on a coin flip, which teaches everybody to re-run CI
     * without reading it, and that habit is how a real failure gets waved past.
     */
    retry: 1,
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          compatibilityFlags: ["nodejs_compat"],
          // ENVIRONMENT=development + empty ADMIN_EMAILS ⇒ any signed-in user is
          // a platform admin (the dev-only fail-open; production fails closed),
          // and the mock mailer logs the OTP instead of sending it.
          //
          // ⚠️ This is also why these tests cannot see a route-guard 403 on an
          // action gate: every test user is an operator. Assert authorization
          // failures through a path that does NOT consult platform-admin status
          // — row-level scope, or an in-handler owner check.
          //
          // ROOT_DOMAIN is `localhost` HERE and the app's real apex in
          // `wrangler.jsonc`. Without the override the guard provisions
          // `<slug>.template.4dl.app` while the test drives `<slug>.localhost`,
          // and the two never meet. Overriding it is not a fudge: the whole
          // topology is exercised for real — `setup.localhost` is the setup
          // door, `<slug>.localhost` is a tenant, and Miniflare preserves the
          // Host header exactly as the edge does.
          bindings: {
            ADMIN_EMAILS: "",
            ENVIRONMENT: "development",
            BETTER_AUTH_URL: "http://localhost:8787",
            ROOT_DOMAIN: "localhost",
          },
        },
      },
    },
  },
});
