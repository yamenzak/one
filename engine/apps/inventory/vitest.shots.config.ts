import { defineConfig } from "vitest/config";

/**
 * ⚠️ A THIRD PROJECT, AND IT IS NOT PART OF `test`. Photographing every screen
 * at two widths in two themes is seventy-six pages in a real browser — minutes,
 * not seconds — and none of it is a question the gate needs answered. The split
 * is the one Kova draws for the same reason: a launch gate runs on every push,
 * and images are made when images are wanted.
 *
 * ⚠️ SERIAL, BECAUSE IT IS ONE BROWSER. Threads would each launch their own
 * Chromium and the machine would spend its memory on the runner rather than on
 * the pages.
 */
export default defineConfig({
  test: {
    include: ["shots/**/*.shots.tsx"],
    environment: "node",
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
    testTimeout: 60_000,
  },
  esbuild: { jsx: "automatic" },
});
