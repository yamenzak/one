import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import base from "./vitest.config.js";

/**
 * ⚠️ A SUITE THAT CANNOT RUN BESIDE ANYTHING ELSE, in its own invocation.
 *
 * Maintenance closes every door in the deployment. That is what it is for, and
 * it is why it cannot be asserted in a run that shares a database with other
 * suites — a file that turns it on turns it on for whatever is executing beside
 * it, and the symptom is three unrelated tests reporting a 503 from endpoints
 * that have nothing to do with the one that closed the door.
 *
 * Splitting on "does this affect the whole deployment" rather than on subject
 * keeps the line predictable: anything global lives here, and there is exactly
 * one thing that qualifies.
 */
export default defineWorkersConfig({
  ...base,
  test: { ...base.test, exclude: ["**/node_modules/**"], include: ["test/**/*.solo.test.ts"] },
});
