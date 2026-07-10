import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // AI binding is optional; mock lane covers tests without it.
          compatibilityFlags: ["nodejs_compat"],
          // Empty ADMIN_EMAILS → any signed-in user is a platform admin (dev),
          // and a local origin keeps Better Auth cookies non-secure in tests.
          bindings: { ADMIN_EMAILS: "", BETTER_AUTH_URL: "http://localhost:8787" },
        },
      },
    },
  },
});
