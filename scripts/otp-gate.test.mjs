/**
 * THE FRONT DOOR IS GUARDED IN EVERY APP, OR THE BUILD FAILS.
 *
 * ── The failure this exists to stop, which already happened twice ───────────
 *
 * Every 4DL app is 100% passwordless, so
 * `POST /api/auth/email-otp/send-verification-otp` is the only way anybody signs
 * in. `@4dl/auth` has shipped `otpSendGuard` — the bot check, a 30-second
 * per-address cooldown, a per-source hourly ceiling, app-supplied eligibility,
 * and the deliverability pre-flight — since before the second app existed.
 *
 * Kova mounted it. Tessa and Scena mounted Better Auth's handler bare, and every
 * check in this repo stayed green: the package's tests passed, both apps' tests
 * passed, the boundary held, the typecheck was clean. The capability was simply
 * absent, and the only thing that could see it was lining the apps up side by
 * side, by hand, months later.
 *
 * ── Why the list is DERIVED ─────────────────────────────────────────────────
 *
 * From `apps.json`, like `ui-ownership.test.mjs` and unlike most of the guards
 * beside it. The one lesson this repo has learned more than once is that a
 * hardcoded per-app list is a per-app list somebody forgets — which is the same
 * shape as the bug above, one level up. An app added to the registry is checked
 * from its first commit without anybody remembering to add it here.
 *
 * ── What it checks, and what it deliberately does not ───────────────────────
 *
 *  1. An app that mounts Better Auth's catch-all (`/api/auth/*`) must ALSO mount
 *     something on the send path before it. It does not check WHAT: an app is
 *     free to wrap `otpSendGuard` in its own middleware, and pinning the symbol
 *     would refuse a legitimate binding.
 *  2. It must close the two sibling endpoints the emailOTP plugin registers
 *     unconditionally. Both call `sendVerificationOTP` DIRECTLY, so each is a
 *     complete way around the guard — no Turnstile, no cooldown, no ceiling, no
 *     eligibility. Mounting the gate and leaving these open protects nothing.
 *  3. Ordering: the send-path mount must appear BEFORE the catch-all in the
 *     file. Hono matches in registration order, so a guard registered after it
 *     never runs — which is the one way to hold every symbol this checks for and
 *     still be unguarded.
 *
 * Text matching rather than a parse, on purpose: this runs in `pnpm gate`,
 * before `pnpm install`, with no dependencies available.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const registry = JSON.parse(readFileSync(join(ROOT, "apps.json"), "utf8"));

let failed = 0;
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  failed++;
};

/** The catch-all that hands the whole `/api/auth/*` lane to Better Auth. */
const CATCH_ALL = /app\.on\(\s*\[[^\]]*\]\s*,\s*["'`]\/api\/auth\/\*["'`]/;
/** Anything registered on the send path — a guard binding, whatever it is called. */
const SEND_PATH = /["'`]\/api\/auth\/email-otp\/send-verification-otp["'`]/;
/** The two endpoints that bypass the guard entirely and must be closed. */
const SIBLINGS = [
  "/api/auth/email-otp/request-password-reset",
  "/api/auth/forget-password/email-otp",
];

let checked = 0;

for (const app of registry.apps) {
  // A worker with no SPA and no auth lane (the marketing sites, the player) has
  // no sign-in to guard. The catch-all test below is what decides, not the id.
  const entry = join(ROOT, app.dir, "src/index.ts");
  if (!existsSync(entry)) continue;
  const src = readFileSync(entry, "utf8");

  const catchAll = src.search(CATCH_ALL);
  if (catchAll === -1) continue; // no Better Auth lane here — nothing to guard.
  checked++;

  const send = src.search(SEND_PATH);
  if (send === -1) {
    fail(
      `${app.id} (${app.dir}/src/index.ts) hands /api/auth/* to Better Auth with NOTHING on the ` +
        `send path. On a passwordless product that endpoint is the entire front door: no bot check, ` +
        `no cooldown, no per-IP ceiling, no eligibility, and — worst — no deliverability pre-flight, ` +
        `so a deployment with no mail provider tells every user "we sent you a code" forever and ` +
        `nobody can get in. Mount @4dl/auth's otpSendGuard (see apps/api/src/otp-guard.ts).`,
    );
    continue;
  }

  if (send > catchAll) {
    fail(
      `${app.id} mounts the OTP send guard AFTER the /api/auth/* catch-all. Hono matches in ` +
        `registration order, so the catch-all answers first and the guard never runs. Move it up.`,
    );
  }

  for (const sibling of SIBLINGS) {
    if (!src.includes(sibling)) {
      fail(
        `${app.id} does not close ${sibling}. The emailOTP plugin registers it unconditionally and ` +
          `it calls sendVerificationOTP directly — a complete way around the guard. Answer 404.`,
      );
    }
  }
}

if (checked === 0) {
  fail("no app with a Better Auth lane was found — the walk is not reaching apps/, so this guard is vacuous.");
}

if (failed) {
  console.error(`\n${failed} problem(s) with the sign-in front door.`);
  process.exit(1);
}

console.log(`✓ otp gate: ${checked} app(s) with a sign-in lane, all guarded, ordered, and with the bypasses closed`);
