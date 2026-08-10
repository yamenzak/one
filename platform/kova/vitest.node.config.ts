import { defineConfig } from "vitest/config";

/**
 * ⚠️ A SECOND PROJECT, AND THE REASON IS THE FILESYSTEM. A worker has none, and
 * the manifest lock is a file this app commits.
 *
 * The split is on "does this need a worker" rather than on "is this a unit
 * test" — splitting the other way puts behavioural tests in front of a mock.
 */
export default defineConfig({
  test: { include: ["test/**/*.node.test.ts"] },
});
