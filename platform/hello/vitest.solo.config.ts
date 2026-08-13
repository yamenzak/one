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
 * ⚠️ THE MAIL SUITE WAS HERE AND THAT WAS NOT FAR ENOUGH — it is
 * `vitest.mail.config.ts` now. It blanks the deployment's sender on purpose, and
 * every file in THIS project signs in, which seeds the sender back on the way
 * past. So the two arrangements failed in opposite directions from the same
 * window: the mail suite passing by sending a code it exists to prove could not
 * be sent, and a job suite whose fixture could not get a session reporting a
 * workspace that was never erased. Both at about a third of runs, alternating,
 * with nothing naming the cause.
 *
 * Splitting on "does this affect the whole deployment" rather than on subject
 * keeps the line predictable: anything global lives here.
 */
export default defineWorkersConfig({
  ...base,
  test: { ...base.test, exclude: ["**/node_modules/**"], include: ["test/**/*.solo.test.ts"] },
});
