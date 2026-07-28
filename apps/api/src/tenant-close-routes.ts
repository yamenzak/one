/**
 * Studio close + wipe (owner, `/api/tenant/close`). An OTP emailed to the owner
 * confirms it; on verify we cancel the Kova subscription immediately (charging
 * stops) and mark the studio for deletion in 7 days. The daily cron hard-purges
 * it (R2 + D1 + billing DO + member identities) once the hold lapses; the owner
 * can undo within the window.
 */

import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { sendActionOtp, verifyActionOtp } from "./action-otp.js";
import { scheduleTenantClose, cancelTenantClose } from "./purge.js";
import { tenantBrandKit } from "./notify.js";

const PURPOSE = "tenant_close";

export const tenantCloseRoutes = new Hono<AppEnv>()
  // Is a close already scheduled? (drives the danger-zone UI)
  .get("/tenant/close/status", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    const row = await c.env.DB.prepare("SELECT status, delete_at FROM subscriptions WHERE tenant_id = ?").bind(who.tenantId).first<{ status: string; delete_at: string | null }>();
    return c.json({ closing: row?.status === "closing", deleteAt: row?.status === "closing" ? row?.delete_at ?? null : null });
  })

  // Email the owner a confirmation code.
  .post("/tenant/close/request-otp", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    const email = c.get("user")?.email;
    if (!email) return c.json({ error: "no email on file" }, 400);
    const brand = await tenantBrandKit(c.env.DB, who.tenantId);
    await sendActionOtp(c.env, { subject: `${PURPOSE}:${who.tenantId}`, purpose: PURPOSE, email, actionLabel: `closing ${brand.name}`, brand });
    return c.json({ ok: true });
  })

  // Verify + schedule the close (cancels billing now, purge in 7 days).
  .post("/tenant/close", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    const parsed = z.object({ code: z.string().min(4).max(12) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    if (!(await verifyActionOtp(c.env, { subject: `${PURPOSE}:${who.tenantId}`, purpose: PURPOSE, code: parsed.data.code }))) return c.json({ error: "invalid_code" }, 403);
    const { deleteAt } = await scheduleTenantClose(c.env, who.tenantId);
    return c.json({ ok: true, deleteAt });
  })

  // Undo a pending close within the grace window.
  .post("/tenant/close/cancel", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    await cancelTenantClose(c.env, who.tenantId);
    return c.json({ ok: true });
  });
