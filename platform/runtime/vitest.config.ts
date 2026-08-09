import { defineConfig } from "vitest/config";

/**
 * Pure, with a fake store. The runtime's own rules — what re-runs, what is
 * tolerated, what refuses to resolve — are decidable without a database, and a
 * suite that needs one to answer them is a suite nobody runs while working.
 */
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
