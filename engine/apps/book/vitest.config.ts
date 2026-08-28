import { defineConfig } from "vitest/config";

/**
 * ⚠️ NO WORKER, AND NOTHING HERE NEEDS ONE. This package is a manifest, the
 * charts a workspace can start from, and the rules a chart has to satisfy —
 * every one of which is a function of its inputs.
 *
 * ⚠️ THE SHIPPED CHARTS ARE ASSERTED BY THE SAME FUNCTION THAT WOULD REFUSE A
 * NEW ONE, which is what makes adding a country a literal in a data file rather
 * than a change anybody has to review for correctness by eye.
 */
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
