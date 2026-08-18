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
import { entitlementKeys, type PlanSpec } from "@engine/kernel";
import { walletOf } from "./wallet.js";
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
  /**
   * ⚠️ THE DEPLOYMENT'S CATALOGUE. One membership covers every product a
   * workspace has switched on, so the plans are the deployment's rather than any
   * app's — see `PlanSpec`.
   */
  readonly plans: readonly PlanSpec[];
  /**
   * ⚠️ WHETHER THIS DEPLOYMENT CAN TAKE A PAYMENT AT ALL — see `standingFor`.
   * Gating "has not paid" on a deployment that cannot charge strands every
   * workspace over OUR misconfiguration, so it fails closed on their
   * non-payment and open on ours.
   *
   * ⚠️ ASKED PER REQUEST RATHER THAN READ AT BOOT, because the key is pasted
   * into the console while the worker is running. Resolved once at startup, an
   * operator would set it, watch the screen say so, and find every isolate
   * still refusing to charge until the next deploy — the same fault the push
   * keypair has a paragraph about.
   */
  readonly charging: () => Promise<boolean>;
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

    const charging = await deps.charging();
    /*
      ⚠️ ONE RESOLUTION FOR THE WHOLE WORKSPACE, over the UNION of what the
      platform sells and what every enabled product declares. Resolving per app
      answered `false` for another app's keys the moment two products were on —
      and it also meant "the strictest standing wins" was reducing over rows that
      were always going to agree, because there is one membership behind them.
    */
    const keys = entitlementKeys(apps);
    const held = await heldBy(
      deps.directory, tenant.id, { plans: deps.plans, keys }, now, charging);
    const standing = held.standing;

    /*
      ⚠️ A WORKSPACE BEING COPIED IS READ-ONLY, AND THIS IS WHERE THAT IS TRUE.
      A copy taken from a live database loses every row written after the table
      was read — silently, with no error, discovered by the customer weeks later
      as records that went missing. Clamping it here rather than in the move
      means the window is closed by the same gate every write already passes,
      including the agent door, rather than by anything remembering to check.

      ⚠️ AND READS ARE NEVER WITHHELD FOR THIS. Somebody whose workspace is
      being moved still sees everything they have — the difference between a few
      minutes of "you cannot change this right now" and an outage.

      ⚠️ AND IT NARROWS THE STANDING RATHER THAN REPLACING IT. Replacing would
      hand a SUSPENDED workspace `serving: true` for the length of its move —
      restoring, for minutes, a product we had stopped providing. The strictest
      wins here as it does everywhere above.
    */
    const settled = tenant.movingTo
      ? {
        writable: false,
        serving: standing.serving,
        reason: standing.reason
          || "This workspace is being moved. It will be writable again shortly.",
      }
      : standing;

    const wallet = await walletOf(deps.directory, tenant.id);

    /*
      ⚠️ A METERED DEBT AN EMPTY WALLET CANNOT COVER STOPS THE WRITES, and it
      stops nothing else. Storage over the included amount is metered rather than
      refused — refusing an upload because a colleague filled the bucket punishes
      the wrong person — so the consequence arrives here instead, one rung up:
      everything is still readable and exportable, and adding credits clears it.

      ⚠️ AND IT NARROWS RATHER THAN REPLACES, like the move above. Replacing
      would hand a suspended workspace `serving: true` because it happens to owe
      for storage as well; the strictest standing wins here as it does everywhere.
    */
    const owing = wallet.owing
      ? {
        writable: false,
        serving: settled.serving,
        reason: settled.reason
          || "This workspace is over its included storage and out of credits. "
            + "Adding credits makes it writable again. Nothing has been deleted.",
      }
      : settled;
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
      /* ⚠️ CARRIED SO THE FILE LOOKUP CAN RESOLVE THE BUCKET IN THE RIGHT
         JURISDICTION. Residency is in the addressing rather than in a check —
         see `bucketOf`. */
      residency: tenant.residency,
      standing: owing,
      entitlements: held.entitlements,
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
