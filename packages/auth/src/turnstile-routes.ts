/**
 * Turnstile's operator console endpoints.
 *
 * They lived in the app's `domain-routes.ts` for one reason — they sat next to
 * the Cloudflare-for-SaaS credentials and both are "Cloudflare things an
 * operator configures". They are not related: a bot check on the sign-in path is
 * AUTH's, and it is the only reason `@4dl/tenancy` ever imported `@4dl/auth`.
 * Separating them is what let the domain routes move at all.
 *
 * The site key is public and reported to the pre-auth client through the host
 * probe; the SECRET is never echoed back, only whether one is set. An empty
 * string clears a value — which is how Turnstile is turned off — while
 * `undefined` keeps it.
 */

import { Hono } from "hono";
import { z } from "zod";
import { getConfig, setConfig } from "@4dl/core";
import type { RouteEnv, RouteGuards } from "./route-deps.js";

export function turnstileAdminRoutes(deps: Pick<RouteGuards, "isPlatformAdmin">) {
  return new Hono<RouteEnv>()
  // ── Cloudflare Turnstile (bot check on the OTP-send path) ──────────────────
  .get("/admin/turnstile/config", async (c) => {
    if (!deps.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const cfg = await getConfig(c.env.DB);
    // Site key is public; the secret is never echoed — only whether it's set.
    return c.json({ siteKey: cfg["turnstile.site_key"] ?? null, secretSet: Boolean(cfg["turnstile.secret"]) });
  })
  .post("/admin/turnstile/config", async (c) => {
    if (!deps.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const d = z
      // Empty string clears a value (turn Turnstile off); undefined keeps it.
      .object({ siteKey: z.string().max(120).optional(), secret: z.string().max(200).optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!d.success) return c.json({ error: "invalid body" }, 400);
    if (d.data.siteKey !== undefined) await setConfig(c.env.DB, "turnstile.site_key", d.data.siteKey.trim());
    if (d.data.secret !== undefined) await setConfig(c.env.DB, "turnstile.secret", d.data.secret.trim());
    return c.json({ ok: true });
  });
}
