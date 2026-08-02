/**
 * Kova's binding of the shared self-delete (`/api/me/delete*`).
 *
 * The ceremony — step-up code, the double-checked block, the irreversible
 * erasure — is `@4dl/auth`'s. What is Kova's is the reason an owner cannot go
 * this way: deleting themselves would leave a studio nobody can administer,
 * still billing, holding other people's data. They close the studio instead,
 * which cancels billing and wipes the tenant on a grace window.
 */

import { accountRoutes as sharedAccountRoutes } from "@4dl/auth";
import type { AppEnv } from "./auth-context.js";
import { sendActionOtp, verifyActionOtp } from "./action-otp.js";
import { purgeUser, isOwnerAnywhere } from "./purge.js";

export const accountRoutes = sharedAccountRoutes<AppEnv>({
  actorOf: (c) => {
    const user = c.get("user");
    return user ? { userId: user.id, email: user.email ?? null } : null;
  },
  /** A code the app branches on — Settings turns it into a link to Close studio. */
  blockedReason: async (c, userId) => ((await isOwnerAnywhere(c.env.DB, userId)) ? "owner_must_close_studio" : null),
  sendOtp: (c, opts) => sendActionOtp(c.env, opts),
  verifyOtp: (c, opts) => verifyActionOtp(c.env, opts),
  purgeUser: (c, userId) => purgeUser(c.env, userId),
});
