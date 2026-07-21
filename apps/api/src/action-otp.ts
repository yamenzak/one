/**
 * Action OTP — a one-time code emailed to confirm an IRREVERSIBLE action for an
 * already signed-in user (wipe my data, close studio, platform nuclear reset).
 *
 * Deliberately separate from the sign-in OTP (Better Auth): verifying here never
 * mints a session, and the code is scoped to a (subject, purpose) so a code for
 * "delete account" can't be replayed against "close studio". Only the SHA-256 of
 * the code is stored; `attempts` caps brute force; codes expire in 10 minutes.
 */

import type { Env } from "./env.js";
import { sendEmail, emailShell, emailButton, escapeHtml, MOSSA_BRAND, type BrandKit } from "./mailer.js";
import { nowMs } from "./ids.js";

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
 * Mint + email a confirmation code for `(subject, purpose)`. `subject` is the
 * stable key we later verify against (a user id, or an admin email for the
 * platform reset); the email goes to `email`. Replaces any live code for the
 * same (subject, purpose).
 */
export async function sendActionOtp(
  env: Env,
  opts: { subject: string; purpose: string; email: string; actionLabel: string; brand?: BrandKit },
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

  const brand = opts.brand ?? MOSSA_BRAND;
  const html = emailShell(
    "Confirm this action",
    `<p style="margin:0 0 16px">To confirm <strong>${escapeHtml(opts.actionLabel)}</strong>, enter this code. It expires in 10 minutes and works once. If you didn't request this, ignore this email — nothing will change.</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background:#1e2126;border:1px solid #23262c;border-radius:18px;padding:22px 0">
       <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;font-weight:800;letter-spacing:10px;color:#e8eaed;padding-left:10px">${code}</div>
     </td></tr></table>
     <p style="margin:18px 0 0;color:#8b9099;font-size:13px;line-height:1.6">This action is permanent and can't be undone.</p>`,
    { brand, preheader: `${code} — your confirmation code` },
  );
  await sendEmail(env.DB, { to: opts.email, subject: `${code} — confirm ${opts.actionLabel}`, html, text: `Your confirmation code is ${code} (expires in 10 minutes).` }, env.EMAIL, undefined, env.ENVIRONMENT === "development").catch(() => undefined);
}

/** Verify + CONSUME a code. Returns true only for a live, matching, un-exhausted
 *  code; a wrong code burns an attempt. Safe to call at most-once per submit. */
export async function verifyActionOtp(env: Env, opts: { subject: string; purpose: string; code: string }): Promise<boolean> {
  const row = await env.DB
    .prepare("SELECT code_hash, expires_at, attempts FROM action_otps WHERE subject = ? AND purpose = ?")
    .bind(opts.subject, opts.purpose)
    .first<{ code_hash: string; expires_at: number; attempts: number }>()
    .catch(() => null);
  if (!row) return false;
  const clear = () => env.DB.prepare("DELETE FROM action_otps WHERE subject = ? AND purpose = ?").bind(opts.subject, opts.purpose).run().catch(() => undefined);
  if (row.expires_at < nowMs() || row.attempts >= MAX_ATTEMPTS) {
    await clear();
    return false;
  }
  const ok = (await sha256Hex(`${opts.purpose}:${opts.code.trim()}`)) === row.code_hash;
  if (!ok) {
    await env.DB.prepare("UPDATE action_otps SET attempts = attempts + 1 WHERE subject = ? AND purpose = ?").bind(opts.subject, opts.purpose).run().catch(() => undefined);
    return false;
  }
  await clear(); // one-time
  return true;
}

// emailButton is re-exported so callers that need a CTA in a follow-up email can
// reuse the same primitive without another import path.
export { emailButton };
