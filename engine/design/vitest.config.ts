import { defineConfig } from "vitest/config";

/**
 * ⚠️ NO BROWSER, AND THAT IS THE POINT OF THE SPLIT. These screens are rendered
 * to a string and read: what is asserted is what a person is offered — which
 * controls exist, which are absent because a permission is missing, which are
 * disabled because a plan does not include them. A headless browser would test
 * the same thing more slowly and less legibly.
 */
export default defineConfig({
  /* ⚠️ THE BROWSER SUITES ARE A SECOND PROJECT — see `vitest.seen.config.ts`. */
  test: { exclude: ["**/node_modules/**", "**/*.seen.test.*"], environment: "node" },
  esbuild: { jsx: "automatic" },
});
