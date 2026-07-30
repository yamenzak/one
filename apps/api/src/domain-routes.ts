/**
 * Custom domains (SPEC §14.1) — Cloudflare for SaaS white-label.
 *
 * ── What changed, and why this file got simpler ──────────────────────────────
 *
 * Every studio is now reachable at `<slug>.kova.4dl.app` from the moment it is
 * created (`provisionSubdomain` in clients.ts), which turns a custom domain from
 * *the* white-label mechanism into a purely additive one. Three consequences:
 *
 *  • **A half-provisioned domain is no longer an outage.** The studio keeps
 *    working at its subdomain the entire time DNS is propagating, so the flow can
 *    take as long as it takes.
 *  • **There is always somewhere to fall back to.** `canonicalHost` prefers an
 *    active custom domain and drops to the subdomain otherwise, so a domain that
 *    breaks degrades instead of stranding the tenant.
 *  • **Adding a domain has one job:** register the hostname, expose exactly what
 *    DNS needs (CNAME + every DCV TXT + the CAA fix when that is the obstacle),
 *    and route it. No platform-host special cases.
 *
 * Owner flow: add a hostname → we register a CF custom hostname and a worker
 * route → the owner sets DNS → we poll until CF reports the cert active → the
 * hostname resolves to this tenant (`resolveHost`) and scopes every request on it.
 *
 * `/api/host` is the ONE public read the pre-auth app uses to learn which DOOR it
 * is on: the root dead end, the setup wizard, the operator console, a studio's
 * subdomain, or a studio's own domain — plus that studio's brand and gate.
 */

import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, requireTenant, requirePermission, isPlatformAdmin } from "./auth-context.js";
import { setConfig, getConfig } from "./billing-store.js";
import { gateFeature } from "./client-flags.js";
import { turnstileConfig } from "@4dl/auth";
import { saasConfig, createCustomHostname, getCustomHostname, deleteCustomHostname, createWorkerRoute, deleteWorkerRoute, DEFAULT_WORKER_NAME, WORKER_NAME_RE, type CustomHostname } from "./cloudflare.js";
import { canonicalHost, invalidateHostCache, isPlatformDoor, rootDomain, shapeOf } from "./host-context.js";
import { nowIso } from "./ids.js";
import { parseJson } from "./db.js";
import { caaFixFromErrors, setupHostname } from "@4dl/tenancy";

const HOSTNAME = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, "enter a valid domain, e.g. train.yourgym.com");

interface DomainRow {
  hostname: string; tenant_id: string; cf_hostname_id: string | null; cf_route_id: string | null;
  status: string; ssl_status: string | null; verify_name: string | null; verify_value: string | null; verify_json: string | null; cf_errors: string | null; cname_target: string | null;
}

/** Shape returned to the owner UI. */
function present(row: DomainRow) {
  return {
    hostname: row.hostname,
    status: row.status, // pending | active | error
    sslStatus: row.ssl_status,
    cname: { name: row.hostname, target: row.cname_target },
    // `txt` is the first record (existing callers); `txts` is all of them.
    // Cloudflare can require two TXTs at the same name and the certificate issues
    // only once BOTH exist — showing one had owners waiting on a cert that could
    // never come, with nothing on the page to say why.
    txt: row.verify_name && row.verify_value ? { name: row.verify_name, value: row.verify_value } : null,
    txts: ((): { name: string; value: string }[] => {
      const all = parseJson<{ name: string | null; value: string | null }[]>(row.verify_json, []);
      const kept = all.filter((r): r is { name: string; value: string } => Boolean(r?.name && r?.value));
      if (kept.length) return kept;
      return row.verify_name && row.verify_value ? [{ name: row.verify_name, value: row.verify_value }] : [];
    })(),
    // Cloudflare's own words. It names the exact obstacle — a CAA allow-list that
    // omits its CA, a hostname that does not CNAME here, a DCV mismatch — and we
    // used to discard all of it, leaving the owner staring at a correct-looking
    // list of records with no idea why nothing was happening.
    errors: parseJson<string[]>(row.cf_errors, []).filter((e) => typeof e === "string" && e.trim()),
    // When the obstacle is CAA, the record that clears it. Derived from what
    // Cloudflare named rather than a hardcoded CA list (see caaFixFromErrors).
    caa: caaFixFromErrors(row.hostname, parseJson<string[]>(row.cf_errors, [])),
  };
}

/** Fold a CF poll result into our row + return the derived status. */
async function syncStatus(env: { DB: D1Database; CACHE?: KVNamespace }, row: DomainRow, ch: CustomHostname): Promise<string> {
  const status = ch.status === "active" && ch.sslStatus === "active" ? "active" : ch.errors.length ? "error" : "pending";
  await env.DB
    .prepare("UPDATE tenant_domains SET status = ?, ssl_status = ?, verify_name = ?, verify_value = ?, verify_json = ?, cf_errors = ?, updated_at = ? WHERE hostname = ?")
    .bind(status, ch.sslStatus, ch.verify.name ?? row.verify_name, ch.verify.value ?? row.verify_value, ch.verifyAll.length ? JSON.stringify(ch.verifyAll) : row.verify_json, JSON.stringify(ch.errors), nowIso(), row.hostname)
    .run();
  // A status flip (esp. active→pending/error) must not linger in the host cache.
  await invalidateHostCache(env, row.hostname);
  return status;
}

export const domainRoutes = new Hono<AppEnv>()
  /**
   * Public: "which door am I, and whose?"
   *
   * The single pre-auth read the app boots on. It answers three things the client
   * cannot work out for itself:
   *
   *  1. **The role** — root / setup / admin / tenant / custom. This decides which
   *     top-level screen renders, and it has to come from the server because only
   *     the server knows the configured root domain.
   *  2. **The studio** — brand, slug, and whether strangers may self-register, so
   *     the login wears the right identity before anyone signs in.
   *  3. **The gate** — whether this studio is read-only, so the app can say so
   *     up front instead of discovering it on the first refused write.
   *
   * `tenant: null` on a `tenant` role is meaningful: a well-formed subdomain with
   * no studio behind it. The app must render "no studio here", never a login.
   */
  .get("/host", async (c) => {
    const host = c.get("host");
    const t = host.tenant;
    /**
     * The root this request was CLASSIFIED against — `host.shape.root`, not the
     * configured `ROOT_DOMAIN`.
     *
     * They differ on loopback, where `classifyHost` always classifies against
     * `localhost` so dev and the E2E suite get the real topology. Reporting the
     * configured value there sent the app to `https://<slug>.kova.4dl.app` the
     * moment anything built a studio URL — a real external domain, from localhost,
     * which lands on a blank page. Anything the CLIENT builds has to agree with what
     * the SERVER resolves, so it has to be the same value.
     *
     * The port comes from the request URL for the same reason: dev is on :8787, and
     * a hostname without it resolves to a port nothing is listening on.
     */
    const here = new URL(c.req.url);
    const root = host.shape.root;
    const port = here.port ? `:${here.port}` : "";
    return c.json({
      role: host.shape.role,
      // Retained for the app's existing branching: true on our own doors, false on
      // anything that resolves a studio by hostname.
      platform: isPlatformDoor(host.shape),
      rootDomain: root,
      setupUrl: `${here.protocol}//${setupHostname(root)}${port}`,
      tenant: t
        ? { tenantId: t.tenantId, name: t.name, slug: t.slug, branding: t.branding, allowSignup: t.allowSignup }
        : null,
      // The WHOLE gate, not a hand-picked pair. Listing fields here meant adding
      // `blocked` to the model, the resolver and the app, and still shipping a
      // client that never saw it — the app read `gate.blocked` as undefined and
      // rendered the read-only app for a studio whose access was withheld. There
      // is nothing private in a HostGate; spread it.
      gate: host.gate ? { ...host.gate } : null,
      turnstile: await turnstileConfig(c.env.DB),
    });
  })

  /**
   * This tenant's domains, with live Cloudflare status.
   *
   * Only `kind = 'custom'` rows are listed. The studio's own subdomain is reported
   * separately as `subdomain` — it is not a row the owner manages, it has no DNS
   * for them to set and no status to poll, and putting it in the same list gave it
   * a Remove button that would have made the studio unreachable.
   */
  .get("/domains", async (c) => {
    const guard = requirePermission(c, { settings: ["manage"] });
    if (guard) return guard;
    const who = requireTenant(c)!;
    const rows = (await c.env.DB.prepare("SELECT * FROM tenant_domains WHERE tenant_id = ? AND kind = 'custom' ORDER BY created_at").bind(who.tenantId).all<DomainRow>()).results ?? [];
    const cfg = await saasConfig(c.env.DB);
    const out = [];
    for (const row of rows) {
      if (cfg && row.cf_hostname_id && row.status !== "active") {
        const ch = await getCustomHostname(cfg, row.cf_hostname_id).catch(() => null);
        if (ch) { row.status = await syncStatus(c.env, row, ch); row.ssl_status = ch.sslStatus; if (ch.verify.name) { row.verify_name = ch.verify.name; row.verify_value = ch.verify.value; } }
      }
      out.push(present(row));
    }
    const sub = await c.env.DB
      .prepare("SELECT hostname FROM tenant_domains WHERE tenant_id = ? AND kind = 'subdomain' LIMIT 1")
      .bind(who.tenantId)
      .first<{ hostname: string }>()
      .catch(() => null);
    return c.json({
      domains: out,
      subdomain: sub?.hostname ?? null,
      canonical: await canonicalHost(c.env, c.env.DB, who.tenantId),
      configured: !!cfg,
    });
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

    // Nothing under our own root may be added as a "custom" domain.
    //
    // This is the check that keeps the domains form from being a takeover
    // primitive. Without it an owner could type `admin.kova.4dl.app` — or another
    // studio's `bolt.kova.4dl.app` — and, because a custom-domain row is looked up
    // by hostname and pins the tenancy, have our own infrastructure host or a
    // competitor's studio resolve to THEM. The old check compared against the
    // single platform hostname only, which stopped exactly one of these.
    //
    // Their own subdomain is not an exception: it already exists, provisioned at
    // studio creation, and re-adding it through this route would replace a
    // system-owned row with a tenant-managed one.
    if (shapeOf(hostname, c.env).underRoot) {
      return c.json({ error: `${hostname} belongs to the platform. Add a domain you own, e.g. train.yourgym.com.` }, 400);
    }

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
      "INSERT INTO tenant_domains (hostname, tenant_id, cf_hostname_id, cf_route_id, status, ssl_status, verify_name, verify_value, verify_json, cf_errors, cname_target, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(hostname, who.tenantId, ch.id, routeId, status, ch.sslStatus, ch.verify.name ?? null, ch.verify.value ?? null, JSON.stringify(ch.verifyAll), JSON.stringify(ch.errors), cfg.cnameTarget, who.userId, nowIso(), nowIso())
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
    const row = await c.env.DB.prepare("SELECT * FROM tenant_domains WHERE hostname = ? AND tenant_id = ? AND kind = 'custom'").bind(c.req.param("hostname").toLowerCase(), who.tenantId).first<DomainRow>();
    // A missing row and the studio's own subdomain are both 404 here: the
    // subdomain is not a custom domain, and it is the address the studio is
    // reachable at, so this route must never be able to remove it.
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
    // Read the raw rows rather than `saasConfig`, which returns null until the
    // token/zone/CNAME triple is complete. `workerName` has to be readable
    // BEFORE that — it is the one value whose wrong setting fails silently
    // (see DEFAULT_WORKER_NAME), so it must never be invisible while the rest
    // of the form is being filled in.
    const cfg = await getConfig(c.env.DB);
    const zoneId = cfg["cf.saas.zone_id"] || null;
    const cnameTarget = cfg["cf.saas.cname_target"] || null;
    const tokenSet = Boolean(cfg["cf.saas.api_token"]);
    const workerName = cfg["cf.saas.worker_name"] || null;
    // Never echo the token back — only whether it's set + the public bits.
    return c.json({
      configured: tokenSet && !!zoneId && !!cnameTarget,
      zoneId,
      cnameTarget,
      tokenSet,
      /** The stored override, or null when the default applies. */
      workerName,
      /** What the code falls back to, so the console can show what is in force. */
      workerNameDefault: DEFAULT_WORKER_NAME,
    });
  })
  .post("/admin/domains/config", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const d = z
      .object({
        apiToken: z.string().min(1).optional(),
        zoneId: z.string().min(1).optional(),
        cnameTarget: z.string().min(1).optional(),
        // Empty string CLEARS the override so the default applies again; that is
        // the recovery path from a stale name and has to be expressible. The
        // others stay "blank keeps it" because clearing them just breaks the
        // feature loudly, whereas a stale worker name breaks it silently.
        workerName: z.string().max(63).optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!d.success) return c.json({ error: "invalid body" }, 400);
    const workerName = d.data.workerName?.trim().toLowerCase();
    if (workerName && !WORKER_NAME_RE.test(workerName)) {
      return c.json({ error: "invalid worker name" }, 400);
    }
    if (d.data.apiToken) await setConfig(c.env.DB, "cf.saas.api_token", d.data.apiToken);
    if (d.data.zoneId) await setConfig(c.env.DB, "cf.saas.zone_id", d.data.zoneId);
    if (d.data.cnameTarget) await setConfig(c.env.DB, "cf.saas.cname_target", d.data.cnameTarget.trim().toLowerCase());
    if (workerName !== undefined) await setConfig(c.env.DB, "cf.saas.worker_name", workerName);
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
