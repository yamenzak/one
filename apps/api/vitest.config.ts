import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    // Vitest's 5s default is wrong for THIS suite, and it fails on a slow runner
    // rather than on a bug.
    //
    // Almost every test here provisions its own world through the real HTTP
    // surface — two passwordless OTP sign-in flows, an organization create, a
    // client, a package grant — before it asserts anything. Measured locally the
    // slowest single test is ~2.2s and the typical gated-route test is 1.4-2.0s,
    // so the whole suite was running with barely a 2.3x margin. A shared CI
    // runner is routinely slower than that, so the first casualty was a
    // three-line assertion timing out at 5s while asserting a 403 that the local
    // run returns in 1.8s. The cascading "Isolated storage failed" that follows is
    // the pool's teardown reacting to the abort, not a second fault.
    //
    // 30s is ~13x the local worst case, so a genuine hang still surfaces (the
    // whole file set finishes in ~140s) while ordinary CI variance cannot trip
    // it. Set here rather than sprinkled per-test: the two tests that carried an
    // inline timeout were the ones someone had already been bitten by, and the
    // other ~400 were one slow runner away from the same thing.
    testTimeout: 30_000,
    // `beforeAll` does the same sign-in work, and its default is tighter still.
    hookTimeout: 30_000,
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // AI binding is optional; mock lane covers tests without it.
          compatibilityFlags: ["nodejs_compat"],
          // ENVIRONMENT=development + empty ADMIN_EMAILS → any signed-in user is a
          // platform admin (the dev-only fail-open; production fails closed).
          // A local origin keeps Better Auth cookies non-secure in tests.
          // STRIPE_TEST_SECRET_KEY is the opt-in switch for test/stripe-live.test.ts
          // (the only suite that talks to real Stripe). It is threaded from the
          // shell here because a Workers-pool test cannot read process.env, and it
          // is deliberately NOT read out of apps/api/.dev.vars: the live suite must
          // stay off unless someone exports the variable for that one run, so a
          // keyless CI (and a normal `pnpm test`) skips it and stays green/offline.
          // Empty string ⇒ skip. Never hard-code a key value here.
          bindings: { ADMIN_EMAILS: "", ENVIRONMENT: "development", BETTER_AUTH_URL: "http://localhost:8787", STRIPE_TEST_SECRET_KEY: process.env.STRIPE_TEST_SECRET_KEY ?? "" },
        },
      },
    },
  },
});
