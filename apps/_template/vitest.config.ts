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
