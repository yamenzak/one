import { defineConfig } from "vitest/config";

/**
 * WHAT A BROWSER HAS TO BE OPENED TO ANSWER.
 *
 * ⚠️ A `.seen.` SUITE LAUNCHES CHROMIUM AND ASKS ABOUT PIXELS — where a row
 * wraps, how tall a control is, whether two marks collide. Nothing static can
 * ask any of it, which is why these exist; and none of it can tell you whether
 * the deployment boots or answers, which is why they do not gate one. They run
 * in `pnpm engine:seen`, where a person is looking at the screens anyway.
 *
 * ⚠️ THE ARGUMENT AND THE MEASUREMENTS ARE IN `design/vitest.seen.config.ts`,
 * once. `scripts/seen.test.mjs` is what keeps the suffix honest: a browser test
 * written without it lands back in the fast lane, and the deploy gets slow again
 * by a route nobody chose.
 */
export default defineConfig({
  test: { include: ["test/**/*.seen.test.tsx"], environment: "node" },
  esbuild: { jsx: "automatic" },
});
