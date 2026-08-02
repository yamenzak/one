/**
 * Tessa's step-up confirmation codes — `@4dl/auth`'s mechanism, Tessa's email.
 *
 * The package owns the secret handling: a random 6-digit code, only its
 * purpose-bound SHA-256 stored, five attempts, ten minutes, one live code per
 * `(subject, purpose)` — so a code minted for "delete my account" cannot be
 * replayed to close a centre. What is here is the message it arrives in.
 *
 * On the PLATFORM rail under Tessa's identity, not the centre's: "confirm
 * closing your centre" is a message from us about the account, and wearing the
 * centre's own branding on it would be a small lie in the one place a reader is
 * checking whether the mail is genuine.
 */

import { sendActionOtp as mint, verifyActionOtp as check } from "@4dl/auth";
import { APP_BRAND, emailShell, escapeHtml, sendEmail } from "./mailer.js";
import type { Env } from "./env.js";

export async function sendActionOtp(
  env: Env,
  opts: { subject: string; purpose: string; email: string; actionLabel: string },
): Promise<void> {
  await mint(env, {
    subject: opts.subject,
    purpose: opts.purpose,
    actionLabel: opts.actionLabel,
    deliver: async (code, actionLabel) => {
      const html = emailShell(
        "Confirm this action",
        `<p style="margin:0 0 16px">To confirm <strong>${escapeHtml(actionLabel)}</strong>, enter this code. It expires in 10 minutes and works once. If you didn't request this, ignore this email — nothing will change.</p>
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background:#1e2126;border:1px solid #23262c;border-radius:18px;padding:22px 0">
           <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;font-weight:800;letter-spacing:10px;color:#e8eaed;padding-left:10px">${code}</div>
         </td></tr></table>
         <p style="margin:18px 0 0;color:#8b9099;font-size:13px;line-height:1.6">This action is permanent and can't be undone.</p>`,
        { brand: APP_BRAND, preheader: `${code} — your confirmation code` },
      );
      await sendEmail(
        env.DB,
        { to: opts.email, subject: `${code} — confirm ${actionLabel}`, html, text: `Your confirmation code is ${code} (expires in 10 minutes).` },
        env.EMAIL,
        undefined,
        env.ENVIRONMENT === "development",
      ).catch(() => undefined);
    },
  });
}

export const verifyActionOtp = (env: Env, opts: { subject: string; purpose: string; code: string }): Promise<boolean> =>
  check(env, opts);
