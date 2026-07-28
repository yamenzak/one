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
  /**
   * The starter exercise library — install or remove, explicitly.
   *
   * It used to install itself on the first `GET /api/exercises`, which meant a
   * deployment could not be empty: deleting the 40 rows just brought them back on
   * the next request. Content the operator did not ask for and cannot refuse is
   * not a starter kit, it is an imposition — so it is now a button, and a fresh
   * install genuinely starts empty.
   */
  .get("/admin/starter-library", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const row = await c.env.DB
      .prepare("SELECT COUNT(*) AS n FROM exercises WHERE source = 'seed' AND tenant_id IS NULL")
      .first<{ n: number }>()
      .catch(() => null);
    const { SEED_COUNT } = await import("./exercise-seed.js");
    return c.json({ installed: (row?.n ?? 0) > 0, count: row?.n ?? 0, available: SEED_COUNT });
  })
  .post("/admin/starter-library", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const body = (await c.req.json().catch(() => ({}))) as { install?: boolean };
    const { seedExercises, SEED_COUNT } = await import("./exercise-seed.js");
    if (body.install === false) {
      // Only the platform seed rows. A tenant's OWN exercises are their content
      // and are never touched by this.
      await c.env.DB.prepare("DELETE FROM exercises WHERE source = 'seed' AND tenant_id IS NULL").run().catch(() => undefined);
      return c.json({ ok: true, installed: false, count: 0, available: SEED_COUNT });
    }
    await seedExercises(c.env.DB);
    const row = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM exercises WHERE source = 'seed' AND tenant_id IS NULL").first<{ n: number }>().catch(() => null);
    return c.json({ ok: true, installed: (row?.n ?? 0) > 0, count: row?.n ?? 0, available: SEED_COUNT });
  })
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
