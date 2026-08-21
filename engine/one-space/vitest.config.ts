import { defineConfig } from "vitest/config";

/**
 * ⚠️ NO DOM, AND THAT IS THE POINT. What is worth asserting about the OneSpace is
 * which screen a door and a session resolve to, and what a screen puts on the
 * page — both answerable by rendering to a string. A jsdom suite would buy the
 * ability to click, at the price of every assertion depending on a component
 * library's internals; the golden paths are a browser's job.
 */
export default defineConfig({
  /* ⚠️ THE BROWSER SUITE IS A SECOND PROJECT — see `vitest.seen.config.ts`. */
  test: {
    include: ["test/**/*.test.ts?(x)"], exclude: ["**/*.seen.test.*"], environment: "node",
  },
  esbuild: { jsx: "automatic" },
});
