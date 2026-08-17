/**
 * TURNING A DOOR INTO EVERYTHING A REQUEST NEEDS.
 *
 * ⚠️ ONE FUNCTION, SO A DEPLOYMENT CANNOT ASSEMBLE IT DIFFERENTLY. Resolving the
 * workspace, its shard, its standing, what its plan includes, what it has left
 * to spend and what it has used is six questions with one right set of answers —
 * and every one of them feeds a gate. A deployment that wired its own would be a
 * deployment where one gate quietly reads something else, and the symptom is a
 * customer who is refused or allowed for reasons nobody can reproduce.
 *
 * ⚠️ THE QUOTA COUNT IS THE PART THAT LOOKS OPTIONAL AND IS NOT. A quota gate
 * with a counter that always answers zero refuses nothing, for ever, and reads
 * on every screen as a limit that is working.
 */

import type { AppSpec, Door, Instant, TenantId } from "@engine/kernel";
import { seatsUsed, tableFor } from "@engine/kernel";
import { heldBy } from "./billing.js";
import { balanceOf } from "./credits.js";
import { tenantBySlug, type TenantRow } from "./directory.js";
import { membersOf } from "./membership.js";
import type { Located } from "./serve.js";
import type { Db } from "./sql.js";

export interface LocateDeps {
  readonly directory: Db;
  /** Shard id → database. `handles.ts` derives this from the binding name. */
  readonly shardOf: (tenant: TenantRow) => Db;
  /** Which products a workspace has switched on, and their manifests. */
  readonly appsOf: (tenant: TenantRow) => Promise<readonly AppSpec[]>;
  /** ⚠️ Whether this deployment can take a payment at all — see `standingFor`. */
  readonly charging: boolean;
  /** Flags resolved for this workspace. Absent is the declaration's fallback. */
  readonly flags?: (tenant: TenantRow) => Promise<Readonly<Record<string, boolean>>>;
  readonly now?: () => Date;
}

/**
 * ⚠️ THE FIRST APP'S STANDING IS THE WORKSPACE'S STANDING, and that is a real
 * decision rather than a shortcut: arrears on any product close the workspace's
 * writes, because the bill is the workspace's. Serving one product to a business
 * that is not paying for another is how a business ends up with a product it
 * cannot pay for and cannot stop using.
 */
export function locator(deps: LocateDeps): (door: Door) => Promise<Located | null> {
  return async (door: Door): Promise<Located | null> => {
    if (door.kind !== "tenant" || !door.slug) return null;
    const tenant = await tenantBySlug(deps.directory, door.slug);
    if (!tenant || tenant.closedAt) return null;

    const now = (deps.now?.() ?? new Date()).toISOString() as Instant;
    const db = deps.shardOf(tenant);
    const apps = await deps.appsOf(tenant);

    const held = await Promise.all(
      apps.map((app) => heldBy(deps.directory, tenant.id, app, now, deps.charging)));

    /* ⚠️ The strictest standing wins — see the header. */
    const standing = held.reduce(
      (worst, one) => ({
        writable: worst.writable && one.standing.writable,
        serving: worst.serving && one.standing.serving,
        reason: worst.reason || one.standing.reason,
      }),
      { writable: true, serving: true, reason: "" });

    const wallet = await balanceOf(deps.directory, tenant.id);
    /* ⚠️ SETTLED BEFORE THE GATE RUNS. The gate asks synchronously and a
       database does not answer synchronously, so the counts are read here and
       served from memory — which also means two gates in one request cannot
       disagree about how many there are. */
    const used = await countsFor(db, tenant.id, apps);

    return {
      tenantId: tenant.id,
      db,
      apps: apps.map((a) => a.id),
      /* ⚠️ RESOLVED HERE BECAUSE EVERY GATE READS IT AND ONE FUNCTION ANSWERS
         IT (see the header). A deployment wiring its own `locate` and omitting
         the kind gets `personal` at the gate — commercial-only capabilities
         withheld, never handed out — which is the direction a mistake here has
         to fail in. */
      kind: tenant.kind,
      name: tenant.name,
      standing,
      entitlements: held.flatMap((h) => h.entitlements),
      flags: (await deps.flags?.(tenant)) ?? {},
      balance: wallet.spendable,
      used,
    };
  };
}

async function prime(
  db: Db, tenantId: TenantId, apps: readonly AppSpec[], into: Map<string, number>,
): Promise<void> {
  for (const app of apps) {
    for (const c of app.collections) {
      if (!c.quota) continue;
      try {
        const row = await db.prepare(
          `SELECT COUNT(*) AS n FROM ${tableFor(c)} WHERE tenant_id = ?`)
          .bind(tenantId).first<{ n: number }>();
        into.set(c.quota, (into.get(c.quota) ?? 0) + (row?.n ?? 0));
      } catch { /* a shard that has not applied this app's schema yet */ }
    }
    const seats = app.access.seats;
    if (seats?.entitlement) {
      const members = await membersOf(db, tenantId);
      into.set(seats.entitlement, seatsUsed(members, seats.counts));
    }
  }
}

/**
 * How many of a quota's thing already exist.
 *
 * ⚠️ COUNTED FROM WHATEVER COLLECTION NAMES THE KEY, AND SETTLED BEFORE THE GATE
 * RUNS. A quota gate with a counter that always answers zero refuses nothing,
 * for ever, and reads on every screen as a limit that is working.
 *
 * ⚠️ AND SEATS ARE COUNTED FROM THE ROSTER, INCLUDING INVITATIONS NOBODY HAS
 * ANSWERED. Counting only accepted members lets anybody past the ceiling by
 * inviting twenty people and waiting, and the overage arrives days later as a
 * bill rather than as a refusal.
 */
export async function countsFor(
  db: Db, tenantId: TenantId, apps: readonly AppSpec[],
): Promise<(key: string) => number> {
  const counts = new Map<string, number>();
  await prime(db, tenantId, apps, counts);
  return (key: string) => counts.get(key) ?? 0;
}
