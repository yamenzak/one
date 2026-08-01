/**
 * Pre-flight the one piece of local config the suite cannot work without.
 *
 * `apps/tessa/.dev.vars` carries `ENVIRONMENT=development`, and that single
 * variable is what makes the mock mailer *deliver* — to the console, and more
 * usefully for us to Better Auth's `verification` table — instead of failing
 * closed. Without it every sign-in dies at the first step with a message about
 * email providers, an error that reads like a product bug and is not one.
 *
 * Created from the checked-in example rather than left to the developer,
 * because "one command from a clean checkout" is the point.
 */

import { copyFileSync, existsSync } from "node:fs";

const DEV_VARS = new URL("../../tessa/.dev.vars", import.meta.url).pathname;
const EXAMPLE = new URL("../../tessa/.dev.vars.example", import.meta.url).pathname;

export default function globalSetup(): void {
  if (existsSync(DEV_VARS)) return;
  if (!existsSync(EXAMPLE)) {
    throw new Error(`Missing ${EXAMPLE} — cannot bootstrap apps/tessa/.dev.vars for the E2E run.`);
  }
  copyFileSync(EXAMPLE, DEV_VARS);
  console.log("[e2e] created apps/tessa/.dev.vars from .dev.vars.example (ENVIRONMENT=development)");
}
