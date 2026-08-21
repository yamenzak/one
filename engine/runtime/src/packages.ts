/**
 * THE PACKAGE RAIL — WHAT A WORKSPACE SELLS ITS OWN CUSTOMERS (D16).
 *
 * ⚠️ EVERY WAY A PACKAGE IS APPLIED IS ONE PATH. A webhook confirming a
 * payment, a staff member granting a comped month and a manual confirmation
 * all land on `applyPackage` — so a comped month and a paid month are the same
 * mechanism, and there is no second lane that forgets the ledger. The ledger
 * (`purchase`) is append-only and is what answers "did they already buy this";
 * the live grant row cannot, because a repeat purchase FOLDS INTO it and its
 * clock only ever shows the latest window.
 *
 * ⚠️ THE MONEY IS NOT HERE, DELIBERATELY. The workspace is paid on their own
 * provider; what confirms a payment opens a purchase. This rail owns what a
 * purchase GRANTS and when it stops.
 *
 * ⚠️ AND THE GRANTS ARE WRITTEN WITH THEIR CLOCK, ALWAYS. A grant without
 * `until` is a person's standing exception — a package writing one would sell
 * access that never expires, silently, and the resolver would be correct to
 * honour it.
 */

import type { AppSpec, Instant, PackageDef, TenantId } from "@engine/kernel";
import {
  extendedUntil, grantUntil, instant, newId, packageSource, packageState, refusePackage,
  sellableKeys, type Grant, type PackageState,
} from "@engine/kernel";
import { membersOf, type MemberRow } from "./membership.js";
import type { PlatformCtx } from "./member-ops.js";
import type { Resolved } from "./compose.js";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const PACKAGE_SCHEMA: SchemaModule = {
  id: "package",
  statements: [
    `CREATE TABLE IF NOT EXISTS package (id TEXT NOT NULL, tenant_id TEXT NOT NULL, app TEXT NOT NULL, name TEXT NOT NULL, price_cents INTEGER NOT NULL, currency TEXT NOT NULL, period_days INTEGER NOT NULL, grace_days INTEGER NOT NULL, grants_json TEXT NOT NULL, retention_days INTEGER, once_per INTEGER NOT NULL DEFAULT 0, archived_at TEXT, at TEXT NOT NULL, PRIMARY KEY (tenant_id, id));`,
    /* ⚠️ Append-only. A purchase row is never edited and never deleted while
       the membership lives — it is the ledger `once_per` reads. */
    `CREATE TABLE IF NOT EXISTS purchase (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, package_id TEXT NOT NULL, member_id TEXT NOT NULL, source TEXT NOT NULL, paid_until TEXT NOT NULL, at TEXT NOT NULL);`,
    `CREATE INDEX IF NOT EXISTS ix_purchase_member ON purchase (tenant_id, member_id, package_id);`,
  ],
};

/* ------------------------------------------------------------------- rows --- */

export interface PackageRow extends PackageDef {
  readonly archivedAt: string | null;
}

const asPackage = (r: Record<string, unknown>): PackageRow => ({
  id: r.id as string,
  app: r.app as string,
  name: r.name as string,
  priceCents: r.price_cents as number,
  currency: r.currency as string,
  periodDays: r.period_days as number,
  graceDays: r.grace_days as number,
  grants: JSON.parse(r.grants_json as string) as string[],
  retentionDays: (r.retention_days as number | null) ?? null,
  oncePer: !!r.once_per,
  archivedAt: (r.archived_at as string | null) ?? null,
});

export const packagesOf = async (
  db: Db, tenantId: TenantId, app: string,
): Promise<readonly PackageRow[]> => {
  const rows = await db.prepare(
    `SELECT * FROM package WHERE tenant_id = ? AND app = ? ORDER BY at`)
    .bind(tenantId, app).all();
  return rows.results.map(asPackage);
};

export const packageOf = async (
  db: Db, tenantId: TenantId, app: string, id: string,
): Promise<PackageRow | null> => {
  const row = await db.prepare(
    `SELECT * FROM package WHERE tenant_id = ? AND app = ? AND id = ?`)
    .bind(tenantId, app, id).first();
  return row ? asPackage(row) : null;
};

/* ---------------------------------------------------------------- holding --- */

export interface Holding {
  readonly packageId: string;
  readonly state: PackageState;
  readonly paidUntil: Instant | null;
}

/**
 * What one member holds of one package, derived from the LEDGER's latest
 * window — the grants carry expiry PLUS grace, so they cannot answer where on
 * the ladder somebody stands.
 */
export async function holdingOf(
  db: Db, tenantId: TenantId, memberId: string, pkg: PackageRow, now: Date,
): Promise<Holding> {
  const last = await db.prepare(
    `SELECT paid_until FROM purchase WHERE tenant_id = ? AND member_id = ? AND package_id = ?
     ORDER BY at DESC LIMIT 1`)
    .bind(tenantId, memberId, pkg.id).first<{ paid_until: string }>();
  const paidUntil = (last?.paid_until ?? null) as Instant | null;
  return { packageId: pkg.id, paidUntil, state: packageState(paidUntil, pkg.graceDays, instant(now)) };
}

export const hasPurchased = async (
  db: Db, tenantId: TenantId, memberId: string, packageId: string,
): Promise<boolean> => {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM purchase WHERE tenant_id = ? AND member_id = ? AND package_id = ?`)
    .bind(tenantId, memberId, packageId).first<{ n: number }>();
  return (row?.n ?? 0) > 0;
};

/* --------------------------------------------------------------- applying --- */

export type ApplyRefusal = "no_such_package" | "no_such_member" | "archived" | "once";

/**
 * ⚠️ THE ONE PATH EVERY CONFIRMATION LANDS ON — paid, comped, manual. It
 * extends (never stacks: the old window's grants are REPLACED, keyed by
 * `source`), appends the ledger row, and writes every grant WITH its clock —
 * expiry plus grace, so the resolver's one comparison is the whole ladder.
 */
export async function applyPackage(
  db: Db, tenantId: TenantId, memberId: string, packageId: string, app: string,
  source: string, now: Date,
): Promise<{ readonly paidUntil: Instant } | ApplyRefusal> {
  const pkg = await packageOf(db, tenantId, app, packageId);
  if (!pkg) return "no_such_package";
  if (pkg.archivedAt) return "archived";

  const member = (await membersOf(db, tenantId)).find((m) => m.id === memberId);
  if (!member) return "no_such_member";

  /* ⚠️ The LEDGER answers, never the live row — a repeat purchase folds into
     the grants, so their clock only ever shows the latest window. */
  if (pkg.oncePer && await hasPurchased(db, tenantId, memberId, packageId)) return "once";

  const held = await holdingOf(db, tenantId, memberId, pkg, now);
  const paidUntil = extendedUntil(held.paidUntil, pkg.periodDays, instant(now));

  await db.prepare(
    `INSERT INTO purchase (id, tenant_id, package_id, member_id, source, paid_until, at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(newId("buy", now), tenantId, packageId, memberId, source, paidUntil, now.toISOString())
    .run();

  await writePackageGrants(db, member, pkg, grantUntil(paidUntil, pkg.graceDays));
  return { paidUntil };
}

/** Remove one package's grants — the repair path. The ledger stays: what was
    bought was bought. */
export async function revokePackage(
  db: Db, member: MemberRow, packageId: string,
): Promise<void> {
  const keep = (member.grants ?? []).filter((g) => g.source !== packageSource(packageId));
  await db.prepare(`UPDATE membership SET grants_json = ? WHERE id = ?`)
    .bind(JSON.stringify(keep), member.id).run();
}

async function writePackageGrants(
  db: Db, member: MemberRow, pkg: PackageRow, until: Instant,
): Promise<void> {
  const source = packageSource(pkg.id);
  const next: Grant[] = [
    ...(member.grants ?? []).filter((g) => g.source !== source),
    ...pkg.grants.map((key) => ({ key, app: pkg.app, until, source })),
  ];
  await db.prepare(`UPDATE membership SET grants_json = ? WHERE id = ?`)
    .bind(JSON.stringify(next), member.id).run();
}

/* ------------------------------------------------------------- operations --- */

/**
 * The package operations, derived per app — the composer, the shelf and the
 * grant path, in the platform's surface exactly like the roster's.
 */
export function packageOps(app: AppSpec): Readonly<Record<string, Resolved>> {
  /*
    ⚠️ THE TARGET APP IS AN INPUT, NOT THE COMPOSITION. Every app's composition
    carries these operations under the same ids, and the HTTP route resolves
    whichever app happens to be FIRST on the tenant's list — so an op bound to
    its composing app could never answer for the second product. `app` in the
    input names the product; absent, the composing app stands.
  */
  const targetOf = (ctx: PlatformCtx, input: Record<string, unknown>): AppSpec | null => {
    const named = input.app === undefined ? app.id : String(input.app);
    if (!ctx.enabledApps.includes(named)) return null;
    return named === app.id ? app : ctx.appOf(named);
  };

  const op = (
    id: string, kind: "read" | "write", permission: string, summary: string,
    run: (ctx: PlatformCtx, input: Record<string, unknown>) => Promise<unknown>,
    tool?: { readonly why: string },
  ): Resolved => ({
    id, kind,
    method: kind === "read" ? "GET" : "POST",
    path: `/api/${id}`,
    permission,
    spec: {
      id, kind, summary,
      input: {}, output: {},
      permission,
      idempotency: { mode: "none" },
      ...(tool ? { tool } : {}),
      ...(kind === "write" ? { emits: [`${id}d`] } : {}),
      async handler() { return {} as never; },
    } as Resolved["spec"],
    run: (ctx, input) => run(ctx as PlatformCtx, input),
  });

  return {
    "package.list": op("package.list", "read", "member:read", "What this workspace sells.",
      async (ctx, input) => {
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        return {
          items: (await packagesOf(ctx.db, ctx.tenantId as TenantId, target.id))
            .filter((p) => !p.archivedAt),
        };
      }),

    "package.create": op("package.create", "write", "tenant:manage", "Compose a package.",
      async (ctx, input) => {
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        const def: PackageDef = {
          id: String(input.id ?? "").trim().toLowerCase(),
          app: target.id,
          name: String(input.name ?? "").trim(),
          priceCents: Number(input.priceCents ?? NaN),
          currency: String(input.currency ?? "EUR"),
          periodDays: Number(input.periodDays ?? NaN),
          graceDays: Number.isInteger(input.graceDays) ? Number(input.graceDays) : 3,
          grants: Array.isArray(input.grants) ? input.grants.map(String) : [],
          retentionDays: input.retentionDays === null || input.retentionDays === undefined
            ? null : Number(input.retentionDays),
          oncePer: input.oncePer === true,
        };
        if (!def.name) return ctx.fail("platform.invalid");

        /*
          ⚠️ REFUSED WHEN COMPOSED, NOT AT THE CUSTOMER'S FIRST 403. The two
          bounds: it may not sell what this app cannot deliver, and the author
          may not bundle keys they do not themselves hold in this app — the
          role composer's rule, or buying from yourself is an escalation.
        */
        const refused = refusePackage(def, sellableKeys(target), await ctx.permissionsIn(target.id));
        if (refused === "beyond_you") return ctx.fail("platform.forbidden");
        if (refused === "undeliverable") return ctx.fail("platform.invalid", { detail: "undeliverable" });
        if (refused) return ctx.fail("platform.invalid", { detail: refused });

        const seen = await packageOf(ctx.db, ctx.tenantId as TenantId, target.id, def.id);
        if (seen) return ctx.fail("platform.conflict");

        await ctx.db.prepare(
          `INSERT INTO package (id, tenant_id, app, name, price_cents, currency, period_days, grace_days, grants_json, retention_days, once_per, archived_at, at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`)
          .bind(def.id, ctx.tenantId, def.app, def.name, def.priceCents, def.currency,
            def.periodDays, def.graceDays, JSON.stringify(def.grants),
            def.retentionDays, def.oncePer ? 1 : 0, ctx.now).run();
        return { id: def.id };
      },
      { why: "It defines what a payment buys, which only a person weighs." }),

    /* ⚠️ Archiving stops the SELLING. Live holdings run out their clock — a
       purchase already made is a promise already priced. */
    "package.archive": op("package.archive", "write", "tenant:manage", "Stop selling a package.",
      async (ctx, input) => {
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        const id = String(input.id ?? "");
        const seen = await packageOf(ctx.db, ctx.tenantId as TenantId, target.id, id);
        if (!seen) return ctx.fail("platform.not_found");
        await ctx.db.prepare(
          `UPDATE package SET archived_at = ? WHERE tenant_id = ? AND app = ? AND id = ?`)
          .bind(ctx.now, ctx.tenantId, target.id, id).run();
        return { id };
      }),

    "package.held": op("package.held", "read", "member:read", "What somebody holds.",
      async (ctx, input) => {
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        const memberId = String(input.member ?? "");
        const member = (await membersOf(ctx.db, ctx.tenantId as TenantId))
          .find((m) => m.id === memberId);
        if (!member) return ctx.fail("platform.not_found");
        const all = await packagesOf(ctx.db, ctx.tenantId as TenantId, target.id);
        const held = await Promise.all(all.map(async (pkg) => ({
          ...(await holdingOf(ctx.db, ctx.tenantId as TenantId, memberId, pkg, new Date(ctx.now))),
          name: pkg.name,
        })));
        return { items: held.filter((h) => h.paidUntil !== null) };
      }),

    /*
      ⚠️ GRANT AND RENEW ARE THE SAME OPERATION because they are the same path —
      `applyPackage` extends, never stacks. `source` records which lane
      confirmed it; staff is one lane beside the webhook, not a second
      mechanism.
    */
    "package.grant": op("package.grant", "write", "member:manage", "Grant or extend a package.",
      async (ctx, input) => {
        const target = targetOf(ctx, input);
        if (!target) return ctx.fail("platform.not_found");
        const memberId = String(input.member ?? "");
        const packageId = String(input.package ?? "");
        /* ⚠️ The staff lane is still bounded: nobody applies grants they could
           not hand out key by key in the package's own app. */
        const pkg = await packageOf(ctx.db, ctx.tenantId as TenantId, target.id, packageId);
        if (!pkg) return ctx.fail("platform.not_found");
        const mine = await ctx.permissionsIn(target.id);
        if (pkg.grants.some((k) => !mine.has(k))) return ctx.fail("platform.forbidden");

        const out = await applyPackage(ctx.db, ctx.tenantId as TenantId, memberId, packageId,
          target.id, `staff:${ctx.accountId ?? "unknown"}`, new Date(ctx.now));
        if (out === "no_such_package" || out === "no_such_member") return ctx.fail("platform.not_found");
        if (out === "archived") return ctx.fail("platform.invalid");
        if (out === "once") return ctx.fail("platform.conflict");
        return { member: memberId, package: packageId, paidUntil: out.paidUntil };
      },
      { why: "It grants access, so a model must not be able to call it from a sentence." }),

    "package.revoke": op("package.revoke", "write", "member:manage", "Take a package away.",
      async (ctx, input) => {
        const memberId = String(input.member ?? "");
        const member = (await membersOf(ctx.db, ctx.tenantId as TenantId))
          .find((m) => m.id === memberId);
        if (!member) return ctx.fail("platform.not_found");
        await revokePackage(ctx.db, member, String(input.package ?? ""));
        return { member: memberId };
      },
      { why: "It takes access away, which only a person weighs." }),
  };
}
