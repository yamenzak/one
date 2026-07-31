/**
 * STEP-UP CONFIRMATION — a one-time code emailed to confirm an IRREVERSIBLE
 * action for a user who is ALREADY signed in.
 *
 * Deliberately not Better Auth's sign-in OTP, for two reasons that both matter:
 *
 *   • Verifying here never mints a session. A confirmation is not a login, and a
 *     flow that hands out a session as a side effect of confirming a deletion is
 *     a flow that can be turned into one.
 *   • The code is scoped to a `(subject, purpose)` pair, so a code minted for
 *     "delete my account" cannot be replayed against "close the tenant".
 *
 * Only the SHA-256 of `purpose:code` is stored — never the code — so a database
 * read cannot confirm anything, and the hash is purpose-bound so two live codes
 * cannot collide. `attempts` caps brute force at five; codes live ten minutes.
 *
 * Delivery is INJECTED. This module owns the secret handling and knows nothing
 * about email templates, branding, or which provider is configured.
 */

import type { HasDb } from "@4dl/core";
import { nowMs } from "@4dl/core";

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A cryptographically-random 6-digit code (leading zeros kept). */
function randomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return String(n).padStart(6, "0");
}

/**
 * Mint a confirmation code for `(subject, purpose)` and hand it to `deliver`.
 *
 * `subject` is the stable key later verified against — a user id, or an operator
 * email for a platform-wide action. Replaces any live code for the same pair, so
 * asking again invalidates the previous one rather than leaving two valid.
 *
 * `deliver` failing is not fatal here: the code is already stored, and the user
 * can ask for another. What must NOT happen is the code reaching the log.
 */
export async function sendActionOtp(
  env: HasDb,
  opts: {
    subject: string;
    purpose: string;
    /** What the user is confirming, in their words — for the message. */
    actionLabel: string;
    deliver: (code: string, actionLabel: string) => Promise<void>;
  },
): Promise<void> {
  const code = randomCode();
  const hash = await sha256Hex(`${opts.purpose}:${code}`);
  const now = nowMs();
  await env.DB
    .prepare(
      `INSERT INTO action_otps (subject, purpose, code_hash, expires_at, attempts, created_at)
       VALUES (?, ?, ?, ?, 0, ?)
       ON CONFLICT(subject, purpose) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at`,
    )
    .bind(opts.subject, opts.purpose, hash, now + TTL_MS, now)
    .run();
  await opts.deliver(code, opts.actionLabel);
}

/**
 * Verify and CONSUME a code.
 *
 * True only for a live, matching, un-exhausted code. A wrong code burns an
 * attempt; an expired or exhausted one is cleared outright. Safe to call at most
 * once per submit — it is one-time by construction, so a retry of the same
 * request fails.
 */
export async function verifyActionOtp(
  env: HasDb,
  opts: { subject: string; purpose: string; code: string },
): Promise<boolean> {
  const row = await env.DB
    .prepare("SELECT code_hash, expires_at, attempts FROM action_otps WHERE subject = ? AND purpose = ?")
    .bind(opts.subject, opts.purpose)
    .first<{ code_hash: string; expires_at: number; attempts: number }>()
    .catch(() => null);
  if (!row) return false;
  const clear = () =>
    env.DB.prepare("DELETE FROM action_otps WHERE subject = ? AND purpose = ?")
      .bind(opts.subject, opts.purpose)
      .run()
      .catch(() => undefined);
  if (row.expires_at < nowMs() || row.attempts >= MAX_ATTEMPTS) {
    await clear();
    return false;
  }
  const ok = (await sha256Hex(`${opts.purpose}:${opts.code.trim()}`)) === row.code_hash;
  if (!ok) {
    await env.DB.prepare("UPDATE action_otps SET attempts = attempts + 1 WHERE subject = ? AND purpose = ?")
      .bind(opts.subject, opts.purpose)
      .run()
      .catch(() => undefined);
    return false;
  }
  await clear(); // one-time
  return true;
}
