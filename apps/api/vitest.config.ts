import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
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
