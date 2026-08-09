import { defineConfig } from "vitest/config";

/** Plain Node: this suite reads the repository, and there is no worker in it. */
export default defineConfig({ test: { include: ["test/**/*.node.test.ts"] } });
