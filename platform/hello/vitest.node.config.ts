import { defineConfig } from "vitest/config";

/**
 * ⚠️ A SECOND PROJECT, AND THE REASON IS THE FILESYSTEM.
 *
 * Everything else in this app runs inside the Workers pool, which is the point —
 * a suite that drove a mock instead of the real runtime would be testing the
 * mock. But a worker has no filesystem, so the manifest lock, which is a FILE
 * this app commits, cannot be written from there.
 *
 * Splitting on "does it need a worker" rather than "is it a unit test" keeps the
 * line somewhere a reader can predict. This project holds exactly the checks
 * about the repository, and nothing about behaviour.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.node.test.ts"],
  },
});
