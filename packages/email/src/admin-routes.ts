/**
 * THE OPERATOR'S EMAIL CONFIGURATION, as routes this package owns.
 *
 * ── Why these are here and not in an app ────────────────────────────────────
 *
 * `email.provider`, `email.from`, `email.platform_from` and
 * `email.credits_per_email` are THIS package's keys — it is the only thing that
 * reads them, and `provider.ts` fails closed when they are unset. An app that
 * takes `@4dl/email` and does not also copy a route module ends up with a mailer
 * it has no way to configure, which is a deployment that cannot send its own
 * sign-in codes.
 *
 * That is not hypothetical. Kova shipped exactly that: the endpoints lived in
 * its billing route module, and the only documented way to make a fresh deploy
 * send mail was to open D1 and write the rows by hand.
 *
 * ── The seam ────────────────────────────────────────────────────────────────
 *
 * The same shape `@4dl/auth` and `@4dl/tenancy` use: name only the bindings and
 * the guard actually needed, structurally, so any app whose Hono env is a
 * superset satisfies it. One guard here — these are operator-only, and who
 * counts as an operator is the app's answer.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { getConfig, setConfig, type HasDb } from "@4dl/core";
import { PLATFORM_FROM_DEFAULT } from "./mailer.js";

export type EmailAdminEnv = { Bindings: HasDb };
export type EmailAdminContext = Context<EmailAdminEnv>;

export interface EmailAdminGuards {
  /** Platform operator — an allowlist, a separate axis from tenant RBAC. */
  isPlatformAdmin: (c: EmailAdminContext) => boolean;
}

/**
 * The three provider values, and why the set is closed.
 *
 * `mock` is a DEVELOPMENT lane — it logs instead of sending, and `provider.ts`
 * refuses to treat it as configured outside a dev environment. Leaving it
 * selectable is deliberate: an operator who picks it in production gets a
 * deployment that visibly sends nothing, which is far better than one that
 * silently pretends to.
 */
const PROVIDERS = ["disabled", "mock", "cloudflare"] as const;

/** A sender the MIME builder can use: a bare address, or `Name <address>`. */
const SENDER = /^(?:[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+|[^<>]+<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>)$/;

export function emailAdminRoutes(guards: EmailAdminGuards, defaults: { from?: string; platformFrom?: string } = {}) {
  const fallbackFrom = defaults.from ?? "noreply@localhost";
  const fallbackPlatformFrom = defaults.platformFrom ?? PLATFORM_FROM_DEFAULT;

  return new Hono<EmailAdminEnv>()
    .get("/admin/email", async (c) => {
      if (!guards.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
      const cfg = await getConfig(c.env.DB);
      return c.json({
        provider: cfg["email.provider"] ?? "mock",
        from: cfg["email.from"] ?? fallbackFrom,
        platformFrom: cfg["email.platform_from"] ?? fallbackPlatformFrom,
        creditsPerEmail: Number(cfg["email.credits_per_email"] ?? "1"),
      });
    })
    .post("/admin/email", async (c) => {
      if (!guards.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
      const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body !== "object") return c.json({ error: "invalid body" }, 400);

      const { provider, from, platformFrom, creditsPerEmail } = body as {
        provider?: unknown; from?: unknown; platformFrom?: unknown; creditsPerEmail?: unknown;
      };

      // Validated here rather than trusted from the console, because these are
      // the rows that decide whether anyone can sign in. A malformed sender is
      // accepted by D1 and then rejected by the provider on every send — a
      // deployment that looks configured and delivers nothing.
      if (provider !== undefined && !PROVIDERS.includes(provider as (typeof PROVIDERS)[number])) {
        return c.json({ error: "invalid body", field: "provider" }, 400);
      }
      for (const [field, v] of [["from", from], ["platformFrom", platformFrom]] as const) {
        if (v === undefined) continue;
        if (typeof v !== "string" || v.length > 200 || !SENDER.test(v.trim())) {
          return c.json({ error: "invalid body", field }, 400);
        }
      }
      if (creditsPerEmail !== undefined) {
        if (typeof creditsPerEmail !== "number" || !Number.isFinite(creditsPerEmail) || creditsPerEmail < 0 || creditsPerEmail > 1000) {
          return c.json({ error: "invalid body", field: "creditsPerEmail" }, 400);
        }
      }

      if (provider !== undefined) await setConfig(c.env.DB, "email.provider", provider as string);
      if (from !== undefined) await setConfig(c.env.DB, "email.from", (from as string).trim());
      if (platformFrom !== undefined) await setConfig(c.env.DB, "email.platform_from", (platformFrom as string).trim());
      if (creditsPerEmail !== undefined) await setConfig(c.env.DB, "email.credits_per_email", String(creditsPerEmail));
      return c.json({ ok: true });
    });
}
