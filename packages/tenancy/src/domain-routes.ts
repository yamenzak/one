/**
 * Custom domains (SPEC §14.1) — Cloudflare for SaaS white-label.
 *
 * ── What changed, and why this file got simpler ──────────────────────────────
 *
 * Every tenant is now reachable at `<slug>.example.app` from the moment it is
 * created (`provisionSubdomain`), which turns a custom domain from
 * *the* white-label mechanism into a purely additive one. Three consequences:
 *
 *  • **A half-provisioned domain is no longer an outage.** The tenant keeps
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
 * is on: the root dead end, the setup wizard, the operator console, a tenant's
 * subdomain, or a tenant's own domain — plus that tenant's brand and gate.
 */

import { Hono } from "hono";
import { z } from "zod";
import { getConfig, nowIso, parseJson, setConfig } from "@4dl/core";
import type { ConfigSource } from "@4dl/core";
import { saasConfig, createCustomHostname, getCustomHostname, useHttpValidation, deleteCustomHostname, createWorkerRoute, deleteWorkerRoute, WORKER_NAME_RE, type CustomHostname } from "./cloudflare.js";
import { canonicalHost, invalidateHostCache, isPlatformDoor, shapeOf, type RootDomainEnv, type TenancyConfig } from "./host-context.js";
import { caaFixFromErrors } from "./dcv.js";
import { checkCname } from "./dns-check.js";
import { setupHostname } from "./hosts.js";
import { MAINTENANCE_OFF } from "./maintenance.js";
import type { RouteEnv, RouteGuards } from "./route-deps.js";

/**
 * What this app cannot be asked to guess.
 *
 * `workerName` is the one value whose wrong setting fails SILENTLY: the route is
 * created, the certificate issues, the domain reports ACTIVE, and every request
 * reaches a script that is not there. It must match `name` in the app's
 * `wrangler.jsonc`, and no package can know it.
 */
export interface DomainRouteConfig {
  config: (env: RootDomainEnv) => TenancyConfig;
  workerName: string;
}

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

/**
 * The DCV records to STORE, given what Cloudflare just said.
 *
 * Two rules, and the second one is the whole reason this is a function.
 *
 * On `txt` DCV, an empty answer is KEPT: Cloudflare omits the validation
 * records from some polls, and blanking the row on one of those would erase the
 * instructions from under an owner who is halfway through typing them.
 *
 * On `http` DCV there ARE no records, permanently and by design — the CA fetches
 * a token over port 80 instead. So the same "keep what we had" rule becomes a
 * lie that cannot expire: a hostname created under `txt` and later migrated to
 * `http` keeps its old `_acme-challenge` values forever, and the screen goes on
 * demanding a TXT record that no longer does anything, at a domain whose
 * certificate is issuing perfectly well without it. That is exactly what
 * happened to every domain added before the switch, and it looks from the
 * outside like the migration did not work.
 */
export function verifyToStore(row: Pick<DomainRow, "verify_name" | "verify_value" | "verify_json">, ch: CustomHostname): { name: string | null; value: string | null; json: string | null } {
  if (ch.sslMethod === "http") return { name: null, value: null, json: null };
  return {
    name: ch.verify.name ?? row.verify_name,
    value: ch.verify.value ?? row.verify_value,
    json: ch.verifyAll.length ? JSON.stringify(ch.verifyAll) : row.verify_json,
  };
}

/** Fold a CF poll result into our row + return the derived status. */
async function syncStatus(env: { DB: D1Database; CACHE?: KVNamespace }, row: DomainRow, ch: CustomHostname): Promise<string> {
  const status = ch.status === "active" && ch.sslStatus === "active" ? "active" : ch.errors.length ? "error" : "pending";
  const v = verifyToStore(row, ch);
  await env.DB
    .prepare("UPDATE tenant_domains SET status = ?, ssl_status = ?, verify_name = ?, verify_value = ?, verify_json = ?, cf_errors = ?, updated_at = ? WHERE hostname = ?")
    .bind(status, ch.sslStatus, v.name, v.value, v.json, JSON.stringify(ch.errors), nowIso(), row.hostname)
    .run();
  // The in-memory row is what `present()` serialises to the caller, so it has to
  // carry the same answer the database just took — otherwise the response to the
  // very refresh that migrated a hostname still shows the TXT it just dropped.
  row.verify_name = v.name;
  row.verify_value = v.value;
  row.verify_json = v.json;
  // A status flip (esp. active→pending/error) must not linger in the host cache.
  await invalidateHostCache(env, row.hostname);
  return status;
}

export function domainRoutes(deps: RouteGuards, opts: DomainRouteConfig) {
  const saas = (src: ConfigSource) => saasConfig(src, opts.workerName);
  return new Hono<RouteEnv>()
  /**
   * Public: "which door am I, and whose?"
   *
   * The single pre-auth read the app boots on. It answers three things the client
   * cannot work out for itself:
   *
   *  1. **The role** — root / setup / admin / tenant / custom. This decides which
   *     top-level screen renders, and it has to come from the server because only
   *     the server knows the configured root domain.
   *  2. **The tenant** — brand, slug, and whether strangers may self-register, so
   *     the login wears the right identity before anyone signs in.
   *  3. **The gate** — whether this tenant is read-only, so the app can say so
   *     up front instead of discovering it on the first refused write.
   *
   * `tenant: null` on a `tenant` role is meaningful: a well-formed subdomain with
   * no tenant behind it. The app must render "no tenant here", never a login.
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
     * configured value there sent the app to `https://<slug>.example.app` the
     * moment anything built a tenant URL — a real external domain, from localhost,
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
      // anything that resolves a tenant by hostname.
      platform: isPlatformDoor(host.shape),
      rootDomain: root,
      setupUrl: `${here.protocol}//${setupHostname(root)}${port}`,
      tenant: t
        ? { tenantId: t.tenantId, name: t.name, slug: t.slug, branding: t.branding, allowSignup: t.allowSignup }
        : null,
      // The WHOLE gate, not a hand-picked pair. Listing fields here meant adding
      // `blocked` to the model, the resolver and the app, and still shipping a
      // client that never saw it — the app read `gate.blocked` as undefined and
      // rendered the read-only app for a tenant whose access was withheld. There
      // is nothing private in a HostGate; spread it.
      gate: host.gate ? { ...host.gate } : null,
      /**
       * The DEPLOYMENT-wide switch, alongside the tenant's own gate.
       *
       * This endpoint is the one read that answers during `full` maintenance,
       * and it has to be: it is how the app learns to render the closed sign
       * rather than a login it cannot complete or a generic "something didn't
       * load". `off` is reported as `off` rather than omitted, so a client can
       * tell "not in maintenance" from "this server is too old to say".
       */
      maintenance: c.get("maintenance") ?? MAINTENANCE_OFF,
      turnstile: (await deps.turnstile?.(c.env)) ?? null,
    });
  })

  /**
   * This tenant's domains, with live Cloudflare status.
   *
   * Only `kind = 'custom'` rows are listed. The tenant's own subdomain is reported
   * separately as `subdomain` — it is not a row the owner manages, it has no DNS
   * for them to set and no status to poll, and putting it in the same list gave it
   * a Remove button that would have made the tenant unreachable.
   */
  .get("/domains", async (c) => {
    const guard = deps.requirePermission(c, { settings: ["manage"] });
    if (guard) return guard;
    const who = deps.requireTenant(c)!;
    const rows = (await c.env.DB.prepare("SELECT * FROM tenant_domains WHERE tenant_id = ? AND kind = 'custom' ORDER BY created_at").bind(who.tenantId).all<DomainRow>()).results ?? [];
    const cfg = await saas(c.env);
    const out = [];
    for (const row of rows) {
      if (cfg && row.cf_hostname_id && row.status !== "active") {
        let ch = await getCustomHostname(cfg, row.cf_hostname_id).catch(() => null);
        // Migrate here as well as on `Check now`, because this is the read that
        // renders the instructions. A domain added before the switch to `http`
        // DCV would otherwise show its old TXT to whoever opened the screen, and
        // the honest reaction to that is to go and publish the TXT — not to
        // press a button captioned "Check now" about a record you have not
        // added yet. By the time anyone reads the page, it should already be
        // telling them the truth.
        if (ch && ch.sslMethod === "txt" && ch.sslStatus !== "active") {
          ch = (await useHttpValidation(cfg, row.cf_hostname_id).catch(() => null)) ?? ch;
        }
        // `syncStatus` owns the verify columns now, in memory as well as in D1 —
        // re-applying `ch.verify` here was what put the migrated hostname's old
        // TXT back on the response after the database had correctly dropped it.
        if (ch) { row.status = await syncStatus(c.env, row, ch); row.ssl_status = ch.sslStatus; }
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
      canonical: await canonicalHost({ ...c.env }, who.tenantId, opts.config(c.env)),
      configured: !!cfg,
    });
  })

  // Register a custom hostname for this tenant.
  .post("/domains", async (c) => {
    const guard = deps.requirePermission(c, { settings: ["manage"] });
    if (guard) return guard;
    const who = deps.requireTenant(c)!;
    { const g = await deps.gateCustomDomain?.(c); if (g) return g; }
    const parsed = HOSTNAME.safeParse((await c.req.json().catch(() => ({})) as { hostname?: string }).hostname);
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid hostname" }, 400);
    const hostname = parsed.data;

    // Nothing under our own root may be added as a "custom" domain.
    //
    // This is the check that keeps the domains form from being a takeover
    // primitive. Without it an owner could type `admin.example.app` — or another
    // tenant's `bolt.example.app` — and, because a custom-domain row is looked up
    // by hostname and pins the tenancy, have our own infrastructure host or a
    // competitor's tenant resolve to THEM. The old check compared against the
    // single platform hostname only, which stopped exactly one of these.
    //
    // Their own subdomain is not an exception: it already exists, provisioned at
    // tenant creation, and re-adding it through this route would replace a
    // system-owned row with a tenant-managed one.
    if (shapeOf(hostname, opts.config(c.env)).underRoot) {
      return c.json({ error: `${hostname} belongs to the platform. Add a domain you own, e.g. train.yourgym.com.` }, 400);
    }

    const cfg = await saas(c.env);
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
  /**
   * Re-poll one domain — and, when it is not working, say WHY in the owner's
   * own terms rather than Cloudflare's.
   *
   * Three things happen here and the order matters:
   *
   *  1. A hostname still on `txt` DCV is migrated to `http` in place. Every
   *     domain added before that switch is parked waiting for TXT records its
   *     owner may never manage to publish, and "delete it and start again" asks
   *     them to redo the step that already failed.
   *  2. Cloudflare's status is folded into the row as before.
   *  3. DNS is READ, live, whenever the domain is not active — because
   *     Cloudflare's "custom hostname does not CNAME to this zone" is true and
   *     unactionable, and the commonest cause by a distance is a registrar that
   *     appended its own zone to the Host field. See dns-check.ts.
   *
   * The DNS read is skipped for an active domain: it is a network round trip to
   * confirm something already proven by a working certificate.
   */
  .post("/domains/:hostname/refresh", async (c) => {
    const guard = deps.requirePermission(c, { settings: ["manage"] });
    if (guard) return guard;
    const who = deps.requireTenant(c)!;
    const row = await c.env.DB.prepare("SELECT * FROM tenant_domains WHERE hostname = ? AND tenant_id = ?").bind(c.req.param("hostname").toLowerCase(), who.tenantId).first<DomainRow>();
    if (!row) return c.json({ error: "not found" }, 404);
    const cfg = await saas(c.env);
    if (cfg && row.cf_hostname_id) {
      let ch = await getCustomHostname(cfg, row.cf_hostname_id).catch(() => null);
      if (ch && ch.sslMethod === "txt" && ch.sslStatus !== "active") {
        ch = (await useHttpValidation(cfg, row.cf_hostname_id).catch(() => null)) ?? ch;
      }
      // `syncStatus` owns the verify columns now, in memory as well as in D1 —
      // re-applying `ch.verify` here was what put the migrated hostname's old
      // TXT back on the response after the database had correctly dropped it.
      if (ch) { row.status = await syncStatus(c.env, row, ch); row.ssl_status = ch.sslStatus; }
    }
    const target = row.cname_target ?? cfg?.cnameTarget ?? null;
    const dns = row.status !== "active" && target ? await checkCname(row.hostname, target).catch(() => null) : null;
    return c.json({ domain: present(row), dns });
  })

  // Remove a custom hostname (deregisters it at Cloudflare too).
  .delete("/domains/:hostname", async (c) => {
    const guard = deps.requirePermission(c, { settings: ["manage"] });
    if (guard) return guard;
    const who = deps.requireTenant(c)!;
    const row = await c.env.DB.prepare("SELECT * FROM tenant_domains WHERE hostname = ? AND tenant_id = ? AND kind = 'custom'").bind(c.req.param("hostname").toLowerCase(), who.tenantId).first<DomainRow>();
    // A missing row and the tenant's own subdomain are both 404 here: the
    // subdomain is not a custom domain, and it is the address the tenant is
    // reachable at, so this route must never be able to remove it.
    if (!row) return c.json({ error: "not found" }, 404);
    const cfg = await saas(c.env);
    // Both sides, or the zone accumulates routes pointing at hostnames nobody
    // owns any more — and a tenant re-adding the domain later would collide.
    if (cfg && row.cf_hostname_id) await deleteCustomHostname(cfg, row.cf_hostname_id);
    if (cfg && row.cf_route_id) await deleteWorkerRoute(cfg, row.cf_route_id);
    await c.env.DB.prepare("DELETE FROM tenant_domains WHERE hostname = ? AND tenant_id = ?").bind(row.hostname, who.tenantId).run();
    await invalidateHostCache(c.env, row.hostname);
      return c.json({ ok: true });
    });
}

// ── Platform admin: Cloudflare for SaaS credentials ──────────────────────────
export function domainAdminRoutes(deps: RouteGuards, opts: DomainRouteConfig) {
  return new Hono<RouteEnv>()
  .get("/admin/domains/config", async (c) => {
    if (!deps.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    // Read the raw rows rather than `saasConfig`, which returns null until the
    // token/zone/CNAME triple is complete. `workerName` has to be readable
    // BEFORE that — it is the one value whose wrong setting fails silently
    // (see `DomainRouteConfig.workerName`), so it must never be invisible while the rest
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
      workerNameDefault: opts.workerName,
    });
  })
  .post("/admin/domains/config", async (c) => {
    if (!deps.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
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
  });
}
