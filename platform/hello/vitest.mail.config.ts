import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import base from "./vitest.config.js";

/**
 * ⚠️ THE ONE SUITE THAT TAKES THE MAIL LANE AWAY FROM THE DEPLOYMENT, and it
 * needs a runtime of its own for the same reason the maintenance suite does.
 *
 * It blanks the sender on purpose — there is no way to prove an operator console
 * reports "the lane is not working, and here is why" without the lane actually
 * not working. Every file in this package shares one deployment, and `signIn`
 * seeds the mail lane on the way past, so a neighbour signing in during that
 * window either puts the sender back (and this suite passes by SENDING the code
 * it exists to prove could not be sent) or fails to get a session at all (and an
 * unrelated file goes red with a 503 nobody can attribute).
 *
 * ⚠️ IT LIVED IN THE `solo` PROJECT AND THAT WAS NOT FAR ENOUGH. Solo means "not
 * beside the ordinary suites"; the maintenance and job suites are in there too,
 * and they sign in. Both symptoms above were observed from that arrangement, at
 * about a third of runs, alternating between two files with nothing naming the
 * cause.
 */
export default defineWorkersConfig({
  ...base,
  test: { ...base.test, exclude: ["**/node_modules/**"], include: ["test/**/*.mail.test.ts"] },
});
