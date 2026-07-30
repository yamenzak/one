/**
 * The tables tenancy owns.
 *
 *   tenant_domains   every hostname that routes to a tenant — its free subdomain
 *                    and any custom domain it brought, with the Cloudflare ids
 *                    and DCV state needed to provision and tear one down.
 *   tenant_settings  the tenant's own settings row.
 *
 * ── `tenant_settings` is a SHARED row, and that is deliberate ───────────────
 *
 * Tenancy creates it and owns two columns (`branding_json`, `marketplace_json`).
 * Every other column belongs to another package: `stripe_account_id` and the
 * Connect flags to billing, `ai_*_json` to AI, `email_*` to email,
 * `notif_policy_json` to notifications, `lapse_json` to commerce.
 *
 * They live on one row rather than one table each because that is what they are
 * — a tenant's configuration, read together, written rarely. The rule that keeps
 * it from becoming a shared mutable blob:
 *
 *   • A package adds ITS OWN columns through ITS OWN module's `alters`. This
 *     works because tenancy applies first, so the table exists.
 *   • A package reads and writes only its own columns. Never another's.
 *
 * Kova's module still carries most of those ALTERs today; they move out with the
 * packages that own them, one stage at a time.
 */

import type { SchemaModule } from "@4dl/core";

export const TENANCY_SCHEMA: SchemaModule = {
  id: "tenancy",
  version: "1",
  ddl: [
    "CREATE TABLE IF NOT EXISTS tenant_settings (tenant_id TEXT PRIMARY KEY, branding_json TEXT, ai_toggles_json TEXT, marketplace_json TEXT, integrations_json TEXT, stripe_account_id TEXT, updated_at TEXT);",
    "CREATE TABLE IF NOT EXISTS tenant_domains (hostname TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, kind TEXT DEFAULT 'custom', cf_hostname_id TEXT, cf_route_id TEXT, status TEXT DEFAULT 'pending', ssl_status TEXT, verify_name TEXT, verify_value TEXT, verify_json TEXT, cf_errors TEXT, cname_target TEXT, created_by TEXT, created_at TEXT, updated_at TEXT);",
    "CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant ON tenant_domains(tenant_id);",
  ],
  alters: [
    // Cloudflare for SaaS: the worker route created alongside a custom hostname.
    // Stored so removal deletes the exact route rather than searching by pattern
    // — see cloudflare.ts for why the route is per-hostname instead of a
    // zone-wide `*/*`.
    "ALTER TABLE tenant_domains ADD COLUMN cf_route_id TEXT",
    // EVERY DCV record Cloudflare asked for, not just the first. It can issue
    // more than one certificate per hostname, and all of the challenge records
    // must be present before any of them validate.
    "ALTER TABLE tenant_domains ADD COLUMN verify_json TEXT",
    // Cloudflare's own validation errors, surfaced to the owner. Without these a
    // CAA block reads as "Pending" forever with nothing to act on.
    "ALTER TABLE tenant_domains ADD COLUMN cf_errors TEXT",
    // `subdomain` vs `custom`. Added when the free subdomain tier arrived and
    // this table stopped being only about domains a tenant brought.
    "ALTER TABLE tenant_domains ADD COLUMN kind TEXT DEFAULT 'custom'",
  ],
  scoped: {
    tenantColumn: "tenant_id",
    tenantTables: ["tenant_domains", "tenant_settings"],
  },
};
