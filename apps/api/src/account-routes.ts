/**
 * Personal account actions (`/api/me/*`) — the GDPR self-delete. An OTP emailed
 * to the signed-in user confirms the erasure; on verify we hard-delete their
 * client record + data in every studio they belong to, their memberships, and
 * their identity (see purge.ts). An OWNER can't self-delete here — that's the
 * studio-close flow (it has to cancel billing + wipe the whole tenant first).
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "./auth-context.js";
import { sendActionOtp, verifyActionOtp } from "./action-otp.js";
import { purgeUser, isOwnerAnywhere } from "./purge.js";

export const accountRoutes = new Hono<AppEnv>()
  // Email a confirmation code for account deletion.
  .post("/me/delete/request-otp", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthenticated" }, 401);
    if (await isOwnerAnywhere(c.env.DB, user.id)) return c.json({ error: "owner_must_close_studio" }, 409);
    if (!user.email) return c.json({ error: "no email on file" }, 400);
    await sendActionOtp(c.env, { subject: user.id, purpose: "account_delete", email: user.email, actionLabel: "deleting your account" });
    return c.json({ ok: true });
  })

  // Verify the code and erase the account (irreversible).
  .post("/me/delete", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthenticated" }, 401);
    const parsed = z.object({ code: z.string().min(4).max(12) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    if (await isOwnerAnywhere(c.env.DB, user.id)) return c.json({ error: "owner_must_close_studio" }, 409);
    if (!(await verifyActionOtp(c.env, { subject: user.id, purpose: "account_delete", code: parsed.data.code }))) return c.json({ error: "invalid_code" }, 403);
    await purgeUser(c.env, user.id);
    // The caller's session was just deleted — the client signs out + reloads.
    return c.json({ ok: true });
  });
