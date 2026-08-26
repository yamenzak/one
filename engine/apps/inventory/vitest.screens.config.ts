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

/*
  ⚠️ THIS CONFIG IS NOT IN `pnpm test` WHILE THE SURFACE IS BEING REWRITTEN, and
  it is said here rather than left to whoever notices the script is shorter. It
  runs `*.screens.test.tsx` — the suites that render a screen this app draws
  itself — and there are none, because there are no sessions yet. Vitest with no
  files is a failure, and the alternative (`passWithNoTests`) is worse: it is the
  green-over-an-empty-corpus fault that half the guards in this repository exist
  to catch, written into a config on purpose.

  ⚠️ IT GOES BACK INTO `test` WITH THE FIRST SESSION. A session draws its own
  controls, so it is the one kind of screen that needs a suite here.
*/
