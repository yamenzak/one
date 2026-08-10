/**
 * THE GLOBAL TENANT DIRECTORY, over SQL.
 *
 * Routing data only, readable from every region, holding the minimum needed to
 * decide WHERE a tenant's data lives before touching any of it.
 *
 * ⚠️ ITS COLUMNS ARE AN ALLOW-LIST, ENFORCED. This store is global precisely
 * because nothing residency governs is in it. One convenient addition — an
 * owner's email, a contact name — and that stops being true, silently, with
 * every existing claim about data residency now false and nothing failing.
 * `DIRECTORY_COLUMNS` is checked against the DDL by a guard.
 */

import type { Directory, DirectoryEntry, Instant, RegionId, SchemaModule, SqlHandle, Standing, TenantId } from "@one/kernel";

/** Every column, and the list is the point. Nothing about a PERSON is here. */
export const DIRECTORY_COLUMNS = ["tenant_id", "slug", "region", "standing", "standing_reason", "standing_next_at", "domains", "branding"] as const;

export const DIRECTORY_SCHEMA: SchemaModule = {
  id: "directory",
  ddl: [
    /*
      ⚠️ `branding` IS A COPY OF THREE REGIONAL SETTINGS, and it is here for one
      reason: the sign-in screen wears a workspace's name and colour, and it
      renders BEFORE there is a session — so before there is a tenancy whose own
      database could be read. Resolving the host already reads this row, so the
      branding rides along and a cold sign-in shows the right name rather than
      flashing the product's own and correcting itself.
    */
    `CREATE TABLE IF NOT EXISTS tenant_directory (tenant_id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, region TEXT NOT NULL, standing TEXT NOT NULL, standing_reason TEXT NOT NULL, standing_next_at TEXT, domains TEXT NOT NULL DEFAULT '[]', branding TEXT NOT NULL DEFAULT '{}');`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_directory_slug ON tenant_directory(slug);`,
  ],
};

/**
 * A custom domain is looked up on every request to it, so it gets its own
 * indexed table rather than a JSON scan of the column beside it. The column
 * stays because a tenant's own view of "my domains" should be one read.
 */
export const DOMAIN_SCHEMA: SchemaModule = {
  id: "directory_domains",
  after: ["directory"],
  ddl: [`CREATE TABLE IF NOT EXISTS tenant_domains (hostname TEXT PRIMARY KEY, tenant_id TEXT NOT NULL);`],
};

interface Row {
  tenant_id: string; slug: string; region: string;
  standing: string; standing_reason: string; standing_next_at: string | null;
  domains: string;
  branding: string | null;
}

const toEntry = (r: Row): DirectoryEntry => ({
  tenantId: r.tenant_id as TenantId,
  slug: r.slug,
  region: r.region as RegionId,
  standing: {
    standing: r.standing as Standing,
    reason: r.standing_reason as DirectoryEntry["standing"]["reason"],
    ...(r.standing_next_at ? { nextAt: r.standing_next_at as Instant } : {}),
  },
  domains: JSON.parse(r.domains) as string[],
  /* ⚠️ An older row predates the column, and a workspace with no branding is the
     ordinary case — so an unreadable value is the empty one rather than a throw
     on every request to that host. */
  branding: parseOr(r.branding),
});

const parseOr = (text: string | null): Readonly<Record<string, string>> => {
  if (!text) return {};
  try { return JSON.parse(text) as Record<string, string>; } catch { return {}; }
};

const COLUMNS = DIRECTORY_COLUMNS.join(", ");

export function sqlDirectory(db: SqlHandle): Directory {
  return {
    async bySlug(slug) {
      const r = await db.first<Row>(`SELECT ${COLUMNS} FROM tenant_directory WHERE slug = ?`, slug);
      return r ? toEntry(r) : null;
    },
    async byDomain(hostname) {
      const r = await db.first<Row>(
        `SELECT d.${DIRECTORY_COLUMNS.join(", d.")} FROM tenant_directory d JOIN tenant_domains x ON x.tenant_id = d.tenant_id WHERE x.hostname = ?`,
        hostname,
      );
      return r ? toEntry(r) : null;
    },
  };
}

/**
 * ⚠️ THE DIRECTORY WRITE IS THE ONLY NON-IDEMPOTENT STEP IN A RELOCATION, and
 * that is by design: everything before it is re-runnable and the source is not
 * deleted until somebody could still change their mind. Keeping it to one
 * statement is what makes "the flip" a thing that either happened or did not.
 */
export async function placeTenant(db: SqlHandle, entry: DirectoryEntry): Promise<void> {
  await db.run(
    `INSERT INTO tenant_directory (tenant_id, slug, region, standing, standing_reason, standing_next_at, domains)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id) DO UPDATE SET slug = excluded.slug, region = excluded.region,
       standing = excluded.standing, standing_reason = excluded.standing_reason,
       standing_next_at = excluded.standing_next_at, domains = excluded.domains`,
    entry.tenantId, entry.slug, entry.region,
    entry.standing.standing, entry.standing.reason, entry.standing.nextAt ?? null,
    JSON.stringify(entry.domains),
  );
}
