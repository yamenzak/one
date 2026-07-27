/**
 * Custom domains (SPEC §14.1) — Cloudflare for SaaS white-label.
 *
 * Owner flow: add a hostname → we register a CF custom hostname and hand back
 * the CNAME target + DCV TXT record → owner sets DNS → we poll until CF reports
 * the cert active → the hostname routes to this worker and `resolveHostTenant`
 * scopes every request on it to this tenant.
 *
 * `/api/host` is the ONE public read the pre-auth app uses to brand the login
 * screen for whichever tenant owns the domain the browser is on.
 */

import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, requireTenant, requirePermission, isPlatformAdmin } from "./auth-context.js";
import { setConfig, getConfig } from "./billing-store.js";
import { gateFeature } from "./client-flags.js";
import { turnstileConfig } from "./turnstile.js";
import { saasConfig, createCustomHostname, getCustomHostname, deleteCustomHostname, createWorkerRoute, deleteWorkerRoute, type CustomHostname } from "./cloudflare.js";
import { hostnameOf, isPlatformHost, invalidateHostCache, resolveTenantDoor } from "./host-context.js";
import { nowIso } from "./ids.js";

const HOSTNAME = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, "enter a valid domain, e.g. train.yourgym.com");

interface DomainRow {
  hostname: string; tenant_id: string; cf_hostname_id: string | null; cf_route_id: string | null;
  status: string; ssl_status: string | null; verify_name: string | null; verify_value: string | null; cname_target: string | null;
}

/** Shape returned to the owner UI. */
function present(row: DomainRow) {
  return {
    hostname: row.hostname,
    status: row.status, // pending | active | error
    sslStatus: row.ssl_status,
    cname: { name: row.hostname, target: row.cname_target },
    txt: row.verify_name && row.verify_value ? { name: row.verify_name, value: row.verify_value } : null,
  };
}

/** Fold a CF poll result into our row + return the derived status. */
async function syncStatus(env: { DB: D1Database; CACHE?: KVNamespace }, row: DomainRow, ch: CustomHostname): Promise<string> {
  const status = ch.status === "active" && ch.sslStatus === "active" ? "active" : ch.errors.length ? "error" : "pending";
  await env.DB
    .prepare("UPDATE tenant_domains SET status = ?, ssl_status = ?, verify_name = ?, verify_value = ?, updated_at = ? WHERE hostname = ?")
    .bind(status, ch.sslStatus, ch.verify.name ?? row.verify_name, ch.verify.value ?? row.verify_value, nowIso(), row.hostname)
    .run();
  // A status flip (esp. active→pending/error) must not linger in the host cache.
  await invalidateHostCache(env, row.hostname);
  return status;
}

export const domainRoutes = new Hono<AppEnv>()
  // Public: the pre-auth app asks "whose domain am I on?" to brand the login.
  // A custom domain pins the tenant (platform:false). On the neutral platform
  // host, a `?slug=` (from the `/t/<slug>` entry) brands the login WITHOUT
  // pinning — the app still allows cross-tenant switching after sign-in.
  .get("/host", async (c) => {
    const ht = c.get("hostTenant");
    const platform = isPlatformHost(hostnameOf(c.req.url), c.env);
    if (ht) {
      return c.json({
        platform: false,
        tenant: { tenantId: ht.tenantId, name: ht.name, slug: ht.slug, branding: ht.branding, allowSignup: ht.allowSignup },
        turnstile: await turnstileConfig(c.env.DB),
      });
    }
    // Which door is this? `slug` comes from a `/t/<slug>` entry; `t` from the
    // tenant hint every emailed CTA already carries, so a signed-out recipient
    // of a notification lands on THEIR studio's branded login rather than a
    // generic one. Neither pins the tenant — the platform host still allows
    // cross-tenant switching after auth; this only decides whose brand shows.
    const slug = c.req.query("slug");
    const hintedTenant = c.req.query("t");
    if (platform && (slug || hintedTenant)) {
      const st = await resolveTenantDoor(c.env.DB, { slug: slug ?? undefined, tenantId: hintedTenant ?? undefined });
      if (st) return c.json({ platform: true, tenant: { tenantId: st.tenantId, name: st.name, slug: st.slug, branding: st.branding, allowSignup: st.allowSignup }, turnstile: await turnstileConfig(c.env.DB) });
    }
    return c.json({ platform, tenant: null, turnstile: await turnstileConfig(c.env.DB) });
  })

  // List this tenant's domains, refreshing live status from Cloudflare.
  .get("/domains", async (c) => {
    const guard = requirePermission(c, { settings: ["manage"] });
    if (guard) return guard;
    const who = requireTenant(c)!;
    const rows = (await c.env.DB.prepare("SELECT * FROM tenant_domains WHERE tenant_id = ? ORDER BY created_at").bind(who.tenantId).all<DomainRow>()).results ?? [];
    const cfg = await saasConfig(c.env.DB);
    const out = [];
    for (const row of rows) {
      if (cfg && row.cf_hostname_id && row.status !== "active") {
        const ch = await getCustomHostname(cfg, row.cf_hostname_id).catch(() => null);
        if (ch) { row.status = await syncStatus(c.env, row, ch); row.ssl_status = ch.sslStatus; if (ch.verify.name) { row.verify_name = ch.verify.name; row.verify_value = ch.verify.value; } }
      }
      out.push(present(row));
    }
    return c.json({ domains: out, configured: !!cfg });
  })

  // Register a custom hostname for this tenant.
  .post("/domains", async (c) => {
    const guard = requirePermission(c, { settings: ["manage"] });
    if (guard) return guard;
    const who = requireTenant(c)!;
    { const g = await gateFeature(c, "branding"); if (g) return g; }
    const parsed = HOSTNAME.safeParse((await c.req.json().catch(() => ({})) as { hostname?: string }).hostname);
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid hostname" }, 400);
    const hostname = parsed.data;
    if (isPlatformHost(hostname, c.env)) return c.json({ error: "that's the platform domain" }, 400);

    const cfg = await saasConfig(c.env.DB);
    if (!cfg) return c.json({ error: "custom domains aren't enabled on this platform yet" }, 503);

    // One tenant per hostname (the PK also enforces this at the DB).
    const taken = await c.env.DB.prepare("SELECT tenant_id FROM tenant_domains WHERE hostname = ?").bind(hostname).first<{ tenant_id: string }>();
    if (taken && taken.tenant_id !== who.tenantId) return c.json({ error: "that domain is already in use" }, 409);
    if (taken) return c.json({ error: "you've already added that domain" }, 409);

    let ch: CustomHostname;
    try {
      ch = await createCustomHostname(cfg, hostname);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "cloudflare error" }, 502);
    }
    const status = ch.status === "active" && ch.sslStatus === "active" ? "active" : "pending";

    // Point the hostname at this worker. Without a route the certificate issues,
    // the DNS resolves, and every request still dies — the worker never runs,
    // because a Cloudflare route is matched by hostname and a tenant's domain is
    // not in our zone. One route per hostname rather than a zone-wide `*/*`,
    // which would swallow the unrelated apps on this zone (see cloudflare.ts).
    let routeId: string | null = null;
    try {
      routeId = await createWorkerRoute(cfg, hostname);
    } catch (e) {
      // Roll the hostname back rather than leaving a registration that can never
      // serve traffic: a half-provisioned domain reads as "pending" forever and
      // there is nothing the owner can do about it.
      await deleteCustomHostname(cfg, ch.id);
      return c.json({ error: e instanceof Error ? e.message : "cloudflare route error" }, 502);
    }

    await c.env.DB.prepare(
      "INSERT INTO tenant_domains (hostname, tenant_id, cf_hostname_id, cf_route_id, status, ssl_status, verify_name, verify_value, cname_target, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(hostname, who.tenantId, ch.id, routeId, status, ch.sslStatus, ch.verify.name ?? null, ch.verify.value ?? null, cfg.cnameTarget, who.userId, nowIso(), nowIso())
      .run();
    const row = await c.env.DB.prepare("SELECT * FROM tenant_domains WHERE hostname = ?").bind(hostname).first<DomainRow>();
    return c.json({ domain: present(row!) }, 201);
  })

  // Force a status re-poll (owner clicks "Check now").
  .post("/domains/:hostname/refresh", async (c) => {
    const guard = requirePermission(c, { settings: ["manage"] });
    if (guard) return guard;
    const who = requireTenant(c)!;
    const row = await c.env.DB.prepare("SELECT * FROM tenant_domains WHERE hostname = ? AND tenant_id = ?").bind(c.req.param("hostname").toLowerCase(), who.tenantId).first<DomainRow>();
    if (!row) return c.json({ error: "not found" }, 404);
    const cfg = await saasConfig(c.env.DB);
    if (cfg && row.cf_hostname_id) {
      const ch = await getCustomHostname(cfg, row.cf_hostname_id).catch(() => null);
      if (ch) { row.status = await syncStatus(c.env, row, ch); row.ssl_status = ch.sslStatus; if (ch.verify.name) { row.verify_name = ch.verify.name; row.verify_value = ch.verify.value; } }
    }
    return c.json({ domain: present(row) });
  })

  // Remove a custom hostname (deregisters it at Cloudflare too).
  .delete("/domains/:hostname", async (c) => {
    const guard = requirePermission(c, { settings: ["manage"] });
    if (guard) return guard;
    const who = requireTenant(c)!;
    const row = await c.env.DB.prepare("SELECT * FROM tenant_domains WHERE hostname = ? AND tenant_id = ?").bind(c.req.param("hostname").toLowerCase(), who.tenantId).first<DomainRow>();
    if (!row) return c.json({ error: "not found" }, 404);
    const cfg = await saasConfig(c.env.DB);
    // Both sides, or the zone accumulates routes pointing at hostnames nobody
    // owns any more — and a tenant re-adding the domain later would collide.
    if (cfg && row.cf_hostname_id) await deleteCustomHostname(cfg, row.cf_hostname_id);
    if (cfg && row.cf_route_id) await deleteWorkerRoute(cfg, row.cf_route_id);
    await c.env.DB.prepare("DELETE FROM tenant_domains WHERE hostname = ? AND tenant_id = ?").bind(row.hostname, who.tenantId).run();
    await invalidateHostCache(c.env, row.hostname);
    return c.json({ ok: true });
  });

// ── Platform admin: Cloudflare for SaaS credentials ──────────────────────────
export const domainAdminRoutes = new Hono<AppEnv>()
  .get("/admin/domains/config", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const cfg = await saasConfig(c.env.DB);
    // Never echo the token back — only whether it's set + the public bits.
    return c.json({ configured: !!cfg, zoneId: cfg?.zoneId ?? null, cnameTarget: cfg?.cnameTarget ?? null, tokenSet: !!cfg?.apiToken });
  })
  .post("/admin/domains/config", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const d = z
      .object({ apiToken: z.string().min(1).optional(), zoneId: z.string().min(1).optional(), cnameTarget: z.string().min(1).optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!d.success) return c.json({ error: "invalid body" }, 400);
    if (d.data.apiToken) await setConfig(c.env.DB, "cf.saas.api_token", d.data.apiToken);
    if (d.data.zoneId) await setConfig(c.env.DB, "cf.saas.zone_id", d.data.zoneId);
    if (d.data.cnameTarget) await setConfig(c.env.DB, "cf.saas.cname_target", d.data.cnameTarget.trim().toLowerCase());
    return c.json({ ok: true });
  })

  // ── Cloudflare Turnstile (bot check on the OTP-send path) ──────────────────
  .get("/admin/turnstile/config", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const cfg = await getConfig(c.env.DB);
    // Site key is public; the secret is never echoed — only whether it's set.
    return c.json({ siteKey: cfg["turnstile.site_key"] ?? null, secretSet: Boolean(cfg["turnstile.secret"]) });
  })
  .post("/admin/turnstile/config", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const d = z
      // Empty string clears a value (turn Turnstile off); undefined keeps it.
      .object({ siteKey: z.string().max(120).optional(), secret: z.string().max(200).optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!d.success) return c.json({ error: "invalid body" }, 400);
    if (d.data.siteKey !== undefined) await setConfig(c.env.DB, "turnstile.site_key", d.data.siteKey.trim());
    if (d.data.secret !== undefined) await setConfig(c.env.DB, "turnstile.secret", d.data.secret.trim());
    return c.json({ ok: true });
  });
