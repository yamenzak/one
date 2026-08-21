import { defineConfig } from "vitest/config";

/**
 * ⚠️ A SECOND PROJECT, BECAUSE THESE SCREENS NEED NO WORKER — the same split the
 * reference app draws. The suite beside this one is arithmetic and a manifest;
 * this one renders the real components and reads the result.
 */
export default defineConfig({
  test: { include: ["test/**/*.screens.test.tsx"], exclude: ["**/*.seen.test.*"], environment: "node" },
  esbuild: { jsx: "automatic" },
});
