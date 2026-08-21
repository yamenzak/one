import { defineConfig } from "vitest/config";

/**
 * ⚠️ NO WORKER, AND NOTHING HERE NEEDS ONE. This package is a manifest and the
 * pure arithmetic under it — what a scan resolves to, what a ledger event does
 * to a balance, which clock wins an expiry. Every one of those is a function of
 * its inputs, so a suite that booted Miniflare to ask them would be paying for a
 * runtime it never touches.
 *
 * ⚠️ THE HANDLERS ARE PROVED AGAINST A REAL DATABASE ELSEWHERE — `apps/hello` is
 * where the deployment's own integration suite lives, because that is where a
 * shard, a directory and a session already exist.
 */
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
