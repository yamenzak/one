/**
 * THE SETTINGS SURFACE, AND THE DOMAIN ONE — both derived from a declaration.
 *
 * ⚠️ A SETTINGS SCREEN WRITTEN BY HAND IS THREE THINGS TO REMEMBER. A control to
 * add to a form, a validation to add to a write endpoint, and a default to apply
 * in every reader — and the reader that guesses differently is a lapse policy
 * that says fourteen days on the screen and never in the sweep. Declaring the
 * setting produces all three from one place.
 */

import type { AnyOperation, AppSpec, BindingSpec, SettingsSpec, SqlHandle } from "@one/kernel";
import { BRANDING, SENDING, operation, s } from "@one/kernel";
import { BRANDING_KEYS, publishBranding, readSettings, storedSettings, writeSetting } from "./settings.js";

/** ⚠️ A symbol, so an app cannot reach the directory by writing a property name. */
export const SETTINGS = Symbol.for("one.runtime.settings");

export interface SettingsDeps {
  readonly db: SqlHandle;
  /** ⚠️ Where the branding copy and the domain claims live. */
  readonly directory: SqlHandle;
  readonly tenantId: string;
  /** Whether this caller acts for the deployment rather than one workspace. */
  readonly isOperator: boolean;
}

export interface SettingsCarrier { readonly [SETTINGS]: SettingsDeps }

const deps = (ctx: unknown): SettingsDeps => (ctx as SettingsCarrier)[SETTINGS];

/**
 * ⚠️ THE PERMISSION IS ONE WORD FOR EVERY APP, so a settings screen is reachable
 * by the same role everywhere and an app cannot accidentally put its own
 * behaviour behind a permission nobody holds.
 */
export const SETTINGS_PERMISSION = "workspace:settings";

/** Branding, the sign-off, then whatever the app declared. Branding first, because it renders first. */
export const settingsFor = (app: { readonly settings?: SettingsSpec }): SettingsSpec =>
  ({ ...BRANDING, ...SENDING, ...(app.settings ?? {}) });

export function settingsOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  const spec = settingsFor(app);

  const read = operation({
    id: "settings.read",
    kind: "read",
    summary: "What this workspace has chosen, and what it may choose.",
    input: s.object({}),
    /*
      ⚠️ THE DECLARATION TRAVELS WITH THE VALUES, so a screen is rendered from
      what the deployment actually has rather than from a form somebody wrote to
      match. A setting added to the manifest appears; one removed stops
      appearing; neither needs a second edit anywhere.
    */
    output: s.object({ values: s.json(), declared: s.json() }),
    permission: SETTINGS_PERMISSION,
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      return { values: await readSettings(d.db, spec, d.tenantId), declared: spec };
    },
  });

  const write = operation({
    id: "settings.write",
    kind: "write",
    summary: "Change one of them.",
    input: s.object({ key: s.text({ max: 60 }), value: s.json() }),
    output: s.object({ ok: s.bool() }),
    permission: SETTINGS_PERMISSION,
    idempotency: { mode: "natural", key: "key" },
    audit: (i: { key: string }) => ({ subject: "settings", verb: `set:${i.key}` }),
    outcome: { message: "Saved", tone: "success", invalidates: ["settings"] },
    fails: ["platform.invalid", "platform.forbidden"],
    /*
      ⚠️ NOT A TOOL. A model that can change how long a lapsed customer keeps
      access, or what this workspace is called in the messages it sends, is one
      sentence in something it was asked to read away from doing so.
    */
    tool: false,
    async handler(ctx, input: { key: string; value: unknown }) {
      const d = deps(ctx);
      /*
        ⚠️ A SETTING MAY BE NARROWER THAN THE SCREEN IT IS ON. Most are written
        by whoever may open settings at all; the ones that cost money or take
        something away name their own permission, and naming it has to MEAN
        something or the declaration is decoration — which is what `write` on a
        collection field was until it was enforced.
      */
      const narrower = spec[input.key]?.write;
      if (narrower && !ctx.holds(narrower)) ctx.fail("platform.forbidden", { field: input.key });

      const refused = await writeSetting(d.db, spec, d.tenantId, input.key, input.value, ctx.now());
      if (refused) ctx.fail("platform.invalid", { field: input.key, reason: refused });

      /*
        ⚠️ THE BRANDING COPY IS REFRESHED ON THE SAME REQUEST. It is read by the
        sign-in screen, which cannot reach this database — so a copy written
        later, or by a sweep, is a workspace whose new name does not appear where
        people actually see it until something else happens to run.
      */
      if ((BRANDING_KEYS as readonly string[]).includes(input.key)) {
        const stored = await storedSettings(d.db, d.tenantId);
        const branding: Record<string, string> = {};
        for (const key of BRANDING_KEYS) if (stored[key]) branding[key] = stored[key]!;
        await publishBranding(d.directory, d.tenantId, branding);
      }
      return { ok: true };
    },
  });

  return [read, write, ...domainOperations()] as unknown as readonly AnyOperation[];
}

/* --------------------------------------------------------------- domains --- */

/**
 * ⚠️ A HOSTNAME IS CLAIMED, THEN PROVED, THEN SERVED — three states, and
 * collapsing them is how one workspace takes another's address.
 *
 * Claiming records an intent and nothing else. Nothing routes to a claimed
 * hostname, because at that point the only thing we know is that somebody typed
 * it — and the thing somebody typed may be a domain belonging to a competitor,
 * a bank, or another workspace on this same deployment. Only a DNS record that
 * could only have been placed by whoever controls the domain moves it to served.
 *
 * ⚠️ THE TOKEN IS PER CLAIM AND UNGUESSABLE. A verification value derived from
 * the workspace id or the hostname is one anybody can compute for a domain they
 * do not own, which makes the whole ceremony decorative.
 */
export const DOMAIN_CLAIM_SCHEMA = {
  id: "directory_domain_claims",
  after: ["directory"],
  ddl: [
    `CREATE TABLE IF NOT EXISTS tenant_domain_claims (hostname TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, token TEXT NOT NULL, state TEXT NOT NULL, at TEXT NOT NULL, checked_at TEXT);`,
    `CREATE INDEX IF NOT EXISTS idx_domain_claims_tenant ON tenant_domain_claims(tenant_id);`,
  ],
};

/**
 * ⚠️ A HOSTNAME, NOT A URL AND NOT A PATTERN. A wildcard claimed by one
 * workspace covers hostnames belonging to others; a URL carries a scheme, a port
 * and a path, none of which a host lookup can use, and all of which somebody
 * will paste.
 */
export const badHostname = (host: string): string | null => {
  const h = host.trim().toLowerCase();
  if (h !== host.trim()) return null;
  if (h.length === 0 || h.length > 253) return "a hostname is between 1 and 253 characters";
  if (h.startsWith(".") || h.endsWith(".")) return "a hostname does not start or end with a dot";
  if (h.includes("*")) return "a wildcard would cover hostnames you do not own";
  if (h.includes("/") || h.includes(":")) return "this is a hostname, not an address — no scheme, port or path";
  if (!/^[a-z0-9.-]+$/.test(h)) return "a hostname is letters, digits, dots and hyphens";
  if (!h.includes(".")) return "a hostname has at least one dot";
  return null;
};

/** What DNS must say, and it must have been placed by whoever controls the domain. */
export const dnsRecordFor = (hostname: string, token: string): { name: string; type: "TXT"; value: string } =>
  ({ name: `_one-verify.${hostname}`, type: "TXT", value: token });

function domainOperations(): readonly AnyOperation[] {
  const list = operation({
    id: "domain.list",
    kind: "read",
    summary: "The domains this workspace has claimed, and what each still needs.",
    input: s.object({}),
    output: s.object({ domains: s.json() }),
    permission: SETTINGS_PERMISSION,
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      const rows = await d.directory.all<{ hostname: string; state: string; token: string; at: string }>(
        `SELECT hostname, state, token, at FROM tenant_domain_claims WHERE tenant_id = ? ORDER BY at DESC`, d.tenantId,
      ).catch(() => []);
      return {
        domains: rows.map((r) => ({
          hostname: r.hostname, state: r.state, at: r.at,
          /*
            ⚠️ THE RECORD TO CREATE TRAVELS WITH THE CLAIM. A verification screen
            that shows a state and not the thing to go and do is a screen people
            open twice and act on neither time.
          */
          record: r.state === "served" ? null : dnsRecordFor(r.hostname, r.token),
        })),
      };
    },
  });

  const claim = operation({
    id: "domain.claim",
    kind: "write",
    summary: "Claim a domain you own. It serves nothing until it is proved.",
    input: s.object({ hostname: s.text({ max: 253 }) }),
    output: s.object({ hostname: s.text(), record: s.json() }),
    permission: SETTINGS_PERMISSION,
    idempotency: { mode: "natural", key: "hostname" },
    audit: (i: { hostname: string }) => ({ subject: i.hostname, verb: "claim" }),
    outcome: { message: "Claimed — now prove it", tone: "info", invalidates: ["domain"] },
    fails: ["platform.invalid", "platform.conflict"],
    tool: false,
    async handler(ctx, input: { hostname: string }) {
      const d = deps(ctx);
      const host = input.hostname.trim().toLowerCase();
      const bad = badHostname(host);
      if (bad) ctx.fail("platform.invalid", { field: "hostname", reason: bad });

      /*
        ⚠️ A HOSTNAME IS CLAIMED BY ONE WORKSPACE AT A TIME, AND THE SECOND
        CLAIM IS REFUSED RATHER THAN QUEUED. Two live claims on one hostname is a
        race whose winner is whoever proves first — which sounds fair and is not:
        the loser's claim sits there looking pending forever, and a support
        conversation about it discloses that another workspace holds it.
      */
      const held = await d.directory.first<{ tenant_id: string }>(
        `SELECT tenant_id FROM tenant_domain_claims WHERE hostname = ?`, host,
      ).catch(() => null);
      if (held && held.tenant_id !== d.tenantId) ctx.fail("platform.conflict", { field: "hostname", reason: "that domain is already claimed" });

      /*
        ⚠️ AND THE TOKEN IS MINTED FRESH ONLY WHEN THERE IS NO CLAIM. Re-issuing
        it on every call means somebody who has already placed the DNS record and
        pressed the button again can never verify — the record they published no
        longer matches what we are looking for.
      */
      const existing = await d.directory.first<{ token: string }>(
        `SELECT token FROM tenant_domain_claims WHERE hostname = ? AND tenant_id = ?`, host, d.tenantId,
      ).catch(() => null);
      const token = existing?.token ?? `one-${crypto.randomUUID().replace(/-/g, "")}`;

      await d.directory.run(
        `INSERT INTO tenant_domain_claims (hostname, tenant_id, token, state, at) VALUES (?, ?, ?, 'claimed', ?)
         ON CONFLICT(hostname) DO UPDATE SET tenant_id = excluded.tenant_id, at = excluded.at`,
        host, d.tenantId, token, ctx.now(),
      );
      return { hostname: host, record: dnsRecordFor(host, token) };
    },
  });

  const verify = operation({
    id: "domain.verify",
    kind: "write",
    summary: "Check the record is there, and start serving if it is.",
    input: s.object({ hostname: s.text({ max: 253 }), seen: s.optional(s.array(s.text({ max: 200 }), { max: 20 })) }),
    output: s.object({ state: s.text(), record: s.json() }),
    permission: SETTINGS_PERMISSION,
    idempotency: { mode: "none" },
    audit: (i: { hostname: string }) => ({ subject: i.hostname, verb: "verify" }),
    fails: ["platform.not_found", "platform.invalid"],
    tool: false,
    async handler(ctx, input: { hostname: string; seen?: readonly string[] }) {
      const d = deps(ctx);
      const host = input.hostname.trim().toLowerCase();
      const row = await d.directory.first<{ token: string; state: string }>(
        `SELECT token, state FROM tenant_domain_claims WHERE hostname = ? AND tenant_id = ?`, host, d.tenantId,
      ).catch(() => null);
      if (!row) ctx.fail("platform.not_found", { field: "hostname" });

      /*
        ⚠️ THE LOOKUP IS THE CALLER'S AND THE DECISION IS OURS. A worker cannot
        resolve TXT records itself, so the records it found are handed in — and
        that is precisely why the comparison must happen HERE rather than the
        caller reporting a verdict. A boolean from the client is a custom domain
        anybody can take by sending `{verified: true}`.
      */
      const found = (input.seen ?? []).map((v) => v.trim().replace(/^"|"$/g, ""));
      if (!found.includes(row!.token)) {
        ctx.fail("platform.invalid", { field: "hostname", reason: "the record is not there yet" });
      }

      await d.directory.run(
        `UPDATE tenant_domain_claims SET state = 'served', checked_at = ? WHERE hostname = ?`, ctx.now(), host,
      );
      /* ⚠️ Routing is turned on HERE and only here — the row a host lookup reads. */
      await d.directory.run(
        `INSERT INTO tenant_domains (hostname, tenant_id) VALUES (?, ?) ON CONFLICT(hostname) DO UPDATE SET tenant_id = excluded.tenant_id`,
        host, d.tenantId,
      );
      return { state: "served", record: null };
    },
  });

  const remove = operation({
    id: "domain.remove",
    kind: "write",
    summary: "Stop serving this workspace from a domain.",
    input: s.object({ hostname: s.text({ max: 253 }) }),
    output: s.object({ ok: s.bool() }),
    permission: SETTINGS_PERMISSION,
    idempotency: { mode: "natural", key: "hostname" },
    audit: (i: { hostname: string }) => ({ subject: i.hostname, verb: "release" }),
    outcome: { message: "Released", tone: "info", invalidates: ["domain"] },
    fails: ["platform.not_found"],
    tool: false,
    async handler(ctx, input: { hostname: string }) {
      const d = deps(ctx);
      const host = input.hostname.trim().toLowerCase();
      /*
        ⚠️ BOUND TO THIS WORKSPACE, which is what stops a release becoming a way
        to take somebody else's domain down. The claim table is keyed on the
        hostname alone — deliberately, so a hostname has one claim — and that is
        exactly the shape where a delete without the tenant reaches across.
      */
      const row = await d.directory.first<{ hostname: string }>(
        `SELECT hostname FROM tenant_domain_claims WHERE hostname = ? AND tenant_id = ?`, host, d.tenantId,
      ).catch(() => null);
      if (!row) ctx.fail("platform.not_found", { field: "hostname" });

      await d.directory.run(`DELETE FROM tenant_domains WHERE hostname = ? AND tenant_id = ?`, host, d.tenantId);
      await d.directory.run(`DELETE FROM tenant_domain_claims WHERE hostname = ? AND tenant_id = ?`, host, d.tenantId);
      return { ok: true };
    },
  });

  return [list, claim, verify, remove] as unknown as readonly AnyOperation[];
}

/* ------------------------------------------------------------- the operator --- */

/**
 * ⚠️ EVERY CLAIM ON THE DEPLOYMENT, AND THE QUESTION IT ANSWERS IS A SUPPORT
 * ONE. "Why is my domain not working" is asked of an operator, about a workspace
 * whose settings screen they cannot open — and without this the only answer
 * available is to ask the customer to read their own screen back.
 */
export function domainAdminOperations(operate: string): readonly AnyOperation[] {
  const all = operation({
    id: "admin.domains",
    kind: "read",
    summary: "Every custom domain on this deployment, and what each is waiting for.",
    input: s.object({ limit: s.optional(s.number({ integer: true, min: 1, max: 200 })) }),
    output: s.object({ domains: s.json() }),
    permission: operate,
    idempotency: { mode: "none" },
    async handler(ctx, input: { limit?: number }) {
      const d = deps(ctx);
      const rows = await d.directory.all<{ hostname: string; tenant_id: string; state: string; at: string; checked_at: string | null }>(
        `SELECT c.hostname, c.tenant_id, c.state, c.at, c.checked_at FROM tenant_domain_claims c ORDER BY c.at DESC LIMIT ?`,
        Math.min(input.limit ?? 100, 200),
      ).catch(() => []);
      /*
        ⚠️ THE TOKEN IS NOT HERE. An operator does not need it to answer the
        question, and a console that displays every workspace's verification
        secret is one screenshot away from somebody claiming a domain they have
        no DNS access to.
      */
      return {
        domains: rows.map((r) => ({
          hostname: r.hostname, tenantId: r.tenant_id, state: r.state, at: r.at, checkedAt: r.checked_at,
        })),
      };
    },
  });
  return [all] as unknown as readonly AnyOperation[];
}
