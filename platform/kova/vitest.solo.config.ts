import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import base from "./vitest.config.js";

/**
 * ⚠️ A SUITE THAT CANNOT RUN BESIDE ANYTHING ELSE, in its own invocation.
 *
 * The lapse sweep is the deployment's scheduled handler, and a scheduled handler
 * visits EVERY workspace in the directory — including the ones other suites are
 * in the middle of building. Run beside them it archives their clients, deletes
 * their records, and races them for the job-run row that decides whether it is
 * due at all; the symptom is four unrelated suites failing on data that was
 * correct when they wrote it.
 *
 * Splitting on "does this act on the whole deployment" rather than on subject
 * keeps the line predictable: anything global lives here.
 */
export default defineWorkersConfig({
  ...base,
  test: { ...base.test, exclude: ["**/node_modules/**"], include: ["test/**/*.solo.test.ts"] },
});
