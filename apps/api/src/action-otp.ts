/**
 * Kova's step-up confirmation codes — `@4dl/auth`'s mechanism, Kova's email.
 *
 * The package owns the secret handling: a random 6-digit code, only its
 * purpose-bound SHA-256 stored, five attempts, ten minutes, one live code per
 * `(subject, purpose)` so a code minted for "delete my account" cannot be
 * replayed against "close the studio". Verifying never mints a session.
 *
 * This file owns the message.
 */

import { sendActionOtp as mint, verifyActionOtp } from "@4dl/auth";
import type { Env } from "./env.js";
import { sendEmail, emailShell, emailButton, escapeHtml, KOVA_BRAND, type BrandKit } from "./mailer.js";

export { verifyActionOtp };
// Re-exported so callers that need a CTA in a follow-up email can reuse the same
// primitive without another import path.
export { emailButton };

export async function sendActionOtp(
  env: Env,
  opts: { subject: string; purpose: string; email: string; actionLabel: string; brand?: BrandKit },
): Promise<void> {
  await mint(env, {
    subject: opts.subject,
    purpose: opts.purpose,
    actionLabel: opts.actionLabel,
    deliver: async (code, actionLabel) => {
      const brand = opts.brand ?? KOVA_BRAND;
      const html = emailShell(
        "Confirm this action",
        `<p style="margin:0 0 16px">To confirm <strong>${escapeHtml(actionLabel)}</strong>, enter this code. It expires in 10 minutes and works once. If you didn't request this, ignore this email — nothing will change.</p>
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background:#1e2126;border:1px solid #23262c;border-radius:18px;padding:22px 0">
           <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;font-weight:800;letter-spacing:10px;color:#e8eaed;padding-left:10px">${code}</div>
         </td></tr></table>
         <p style="margin:18px 0 0;color:#8b9099;font-size:13px;line-height:1.6">This action is permanent and can't be undone.</p>`,
        { brand, preheader: `${code} — your confirmation code` },
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
