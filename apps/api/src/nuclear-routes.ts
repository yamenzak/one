/**
 * Platform nuclear reset (`/api/admin/nuclear-reset`) — wipes EVERY tenant, all
 * users, and the whole media bucket back to an empty install, preserving only
 * platform config (plans, credit packs, app_config, AI models). For the operator
 * to start fresh after big schema changes. Guarded three ways: the /api/admin/*
 * platform lane, an OTP emailed to the admin, and a typed confirmation phrase.
 */

import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, isPlatformAdmin } from "./auth-context.js";
import { sendActionOtp, verifyActionOtp } from "./action-otp.js";
import { purgeEverything } from "./purge.js";
import { KOVA_BRAND } from "./mailer.js";

const PURPOSE = "nuclear_reset";
const CONFIRM_PHRASE = "RESET EVERYTHING";

export const nuclearRoutes = new Hono<AppEnv>()
  // Email the operator a confirmation code (to their own admin address).
  .post("/admin/nuclear-reset/request-otp", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const user = c.get("user");
    if (!user?.email) return c.json({ error: "no admin email" }, 400);
    await sendActionOtp(c.env, { subject: `${PURPOSE}:${user.id}`, purpose: PURPOSE, email: user.email, actionLabel: "resetting the entire platform", brand: KOVA_BRAND });
    return c.json({ ok: true });
  })

  // Verify the code + the typed phrase, then wipe everything.
  .post("/admin/nuclear-reset", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const user = c.get("user")!;
    const parsed = z.object({ code: z.string().min(4).max(12), confirm: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    if (parsed.data.confirm !== CONFIRM_PHRASE) return c.json({ error: "confirm_phrase", expected: CONFIRM_PHRASE }, 400);
    if (!(await verifyActionOtp(c.env, { subject: `${PURPOSE}:${user.id}`, purpose: PURPOSE, code: parsed.data.code }))) return c.json({ error: "invalid_code" }, 403);
    const result = await purgeEverything(c.env);
    return c.json({ ok: true, ...result });
  });
