/**
 * STEP-UP CONFIRMATION CODES — `@4dl/auth`'s mechanism, this app's email.
 *
 * The package owns the secret handling: a random 6-digit code, only its
 * purpose-bound SHA-256 stored, five attempts, ten minutes, one live code per
 * `(subject, purpose)` — so a code minted for "delete my account" cannot be
 * replayed to close a tenant. What is here is the message it arrives in.
 *
 * On the PLATFORM rail under this app's identity, not the tenant's: "confirm
 * closing your workspace" is a message from us about the account, and wearing
 * the tenant's own branding on it would be a small lie in the one place a reader
 * is checking whether the mail is genuine.
 *
 * Both exports are consumed by `exit-routes.ts`. Nothing else needs them — a
 * step-up code is for an action that cannot be undone, and spreading it onto
 * ordinary writes trains people to type the code without reading what it is for.
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
         <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:32px;font-weight:800;letter-spacing:10px">${code}</p>
         <p style="margin:18px 0 0;font-size:13px;line-height:1.6">This action is permanent and can't be undone.</p>`,
        { brand: APP_BRAND, preheader: `${code} — your confirmation code` },
      );
      /*
        A failed send is SWALLOWED, and that is the right shape here: the code is
        already minted, so throwing would leave a live code the person cannot
        receive and no way to ask for another until it expires. They see "we sent
        a code", it does not arrive, and they press resend — which works.
      */
      await sendEmail(
        env,
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
