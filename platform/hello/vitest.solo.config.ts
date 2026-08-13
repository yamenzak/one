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
 * The CONFIGURATION suite is here for the same reason, and it took an afternoon
 * to attribute. It blanks the deployment's mail sender to prove the one thing an
 * operator console has to be able to report — the lane is not working, and here
 * is why — and there is no way to prove that without the lane actually not
 * working. Run beside its neighbours it took every other file's sign-in down
 * with it: a 503 on the first attempt and the OTP cooldown on the retry,
 * surfacing as a different test failing in a different file on about a third of
 * runs, none of them near the cause.
 *
 * Splitting on "does this affect the whole deployment" rather than on subject
 * keeps the line predictable: anything global lives here.
 */
export default defineWorkersConfig({
  ...base,
  test: { ...base.test, exclude: ["**/node_modules/**"], include: ["test/**/*.solo.test.ts"] },
});
