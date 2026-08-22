import { defineConfig } from "vitest/config";

/**
 * ⚠️ A SECOND PROJECT, BECAUSE THESE SCREENS NEED NO WORKER. The suite beside
 * this one boots Miniflare and real databases; this one renders the reference
 * app's own declarations through the real components and reads the result. One
 * project would make every screen assertion pay for a runtime it never touches.
 */
export default defineConfig({
  test: { include: ["test/**/*.screens.test.tsx"], exclude: ["**/*.seen.test.*"], environment: "node" },
  esbuild: { jsx: "automatic" },
});
