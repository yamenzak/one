import { defineConfig } from "vitest/config";

/**
 * ⚠️ NO WORKER, AND NOTHING HERE NEEDS ONE. This package is a manifest and the
 * pure vocabulary under it — what a party is called, what its tax identifier is
 * called where it trades, and whether two rows are the same company written
 * twice. Every one of those is a function of its inputs.
 *
 * ⚠️ THE HANDLERS ARE PROVED AGAINST A REAL DATABASE ELSEWHERE — `engine/ground`
 * is where the deployment's own integration suite lives, because that is where a
 * shard, a directory and a session already exist.
 */
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
