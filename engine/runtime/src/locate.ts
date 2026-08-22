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
import type { Located, Locating } from "./serve.js";
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
  readonly now?: () => Date;
}

/**
 * ⚠️ THE FIRST APP'S STANDING IS THE WORKSPACE'S STANDING, and that is a real
 * decision rather than a shortcut: arrears on any product close the workspace's
 * writes, because the bill is the workspace's. Serving one product to a business
 * that is not paying for another is how a business ends up with a product it
 * cannot pay for and cannot stop using.
 *
 * ⚠️ IT ANSWERS TWICE FROM ONE READ, AND THAT IS THE WHOLE SHAPE OF IT. WHERE a
 * door is — the workspace and its shard — is known after the first query;
 * everything else (the plan, the wallet, the counts) is three more waits on top.
 * The identity does not need any of that: resolving who is asking needs a session
 * and a roster, and the roster is on the shard. Waiting for the bill to be
 * resolved before looking anybody up put three round trips in front of every
 * request for no reason anybody could name.
 *
 * ⚠️ ONE PROMISE UNDERNEATH BOTH, so the workspace is looked up ONCE. Two
 * functions here would be two reads of the same row, and worse, two places that
 * could disagree about whether a closed workspace is a workspace.
 */
export function locator(deps: LocateDeps): (door: Door) => Locating {
  return (door: Door): Locating => {
    const found = (async (): Promise<TenantRow | null> => {
      if (door.kind !== "tenant" || !door.slug) return null;
      const row = await tenantBySlug(deps.directory, door.slug);
      return !row || row.closedAt ? null : row;
    })();

    const where = found.then((t) => (t ? { tenantId: t.id, db: deps.shardOf(t) } : null));
    /* ⚠️ HANDLED HERE SO A FAILED LOOKUP IS NOT AN UNHANDLED REJECTION. A caller
       that only wants the full answer never awaits `where`, and a rejected
       promise nobody awaited is a warning in the log about a fault that WAS
       reported, on the other half, correctly. Awaiting it still rejects. */
    where.catch(() => undefined);

    return { where, located: everything(deps, found) };
  };
}

async function everything(
  deps: LocateDeps, found: Promise<TenantRow | null>,
): Promise<Located | null> {
  {
    const tenant = await found;
    if (!tenant) return null;

    const now = (deps.now?.() ?? new Date()).toISOString() as Instant;
    const db = deps.shardOf(tenant);

    /*
      ⚠️ TOGETHER, BECAUSE NONE OF THEM FEEDS THE OTHERS. Which products this
      workspace has, whether the deployment charges, what its wallet holds and
      what it has been flagged — four questions about the same tenant, awaited
      one after the other, in front of every request this workspace makes. Four
      waits for one round trip's worth of work.

      ⚠️ AND THE ORDER OF THE CODE STOPS SAYING WHICH. `await` reads the same
      whether a call needed the one before it or merely followed it, which is
      why `ground/test/request-cost.test.ts` measures the DEPTH rather than
      trusting a reading of this file.
    */
    const [apps, charging, wallet] = await Promise.all([
      deps.appsOf(tenant),
      deps.charging(),
      walletOf(deps.directory, tenant.id),
    ]);

    /*
      ⚠️ ONE RESOLUTION FOR THE WHOLE WORKSPACE, over the UNION of what the
      platform sells and what every enabled product declares. Resolving per app
      answered `false` for another app's keys the moment two products were on —
      and it also meant "the strictest standing wins" was reducing over rows that
      were always going to agree, because there is one membership behind them.
    */
    const keys = entitlementKeys(apps);
    /*
      ⚠️ AND THESE TWO TOGETHER FOR THE SAME REASON. What the workspace holds is
      a question for the directory and what it has used is a question for its
      shard — two different databases, and neither answer is an input to the
      other. Awaited in turn they were the last two waits of a locate that had
      already made four.
    */
    const [held, used] = await Promise.all([
      heldBy(deps.directory, tenant.id, { plans: deps.plans, keys }, now, charging),
      /* ⚠️ SETTLED BEFORE THE GATE RUNS. The gate asks synchronously and a
         database does not answer synchronously, so the counts are read here and
         served from memory — which also means two gates in one request cannot
         disagree about how many there are. */
      countsFor(db, tenant.id, apps),
    ]);
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
      /*
        ⚠️ THE ROWS, NOT THE ANSWER — resolution is `serve`'s, once, over the
        books. It was here for an afternoon and that was wrong in the one
        direction that matters: a deployment or a test wiring its own `locate`
        supplies no switches, and an unresolved absence reads as "every flag
        off" — including the ones whose declared fallback is ON. Doing the
        arithmetic where nothing can skip it means a missing store gives every
        flag what its own declaration says.
      */
      balance: wallet.spendable,
      used,
    };
  }
}

async function prime(
  db: Db, tenantId: TenantId, apps: readonly AppSpec[], into: Map<string, number>,
): Promise<void> {
  /*
    ⚠️ EVERY COUNT AT ONCE. One query per quota'd collection plus one for the
    roster, against one database, and not one of them is an input to another —
    so awaited in turn they were a wait per collection, in front of every request
    the app serves. A cost that grows with the size of the manifest is the kind
    that is fine in the reference app and unusable in a real one.
  */
  const counting: Promise<{ key: string; n: number } | null>[] = [];

  for (const app of apps) {
    for (const c of app.collections) {
      if (!c.quota) continue;
      const key = c.quota;
      counting.push((async () => {
        try {
          const row = await db.prepare(
            `SELECT COUNT(*) AS n FROM ${tableFor(c)} WHERE tenant_id = ?`)
            .bind(tenantId).first<{ n: number }>();
          return { key, n: row?.n ?? 0 };
        } catch {
          /* ⚠️ A shard that has not applied this app's schema yet — absent, not
             zero-with-a-throw. */
          return null;
        }
      })());
    }

    /* ⚠️ SEATS ARE COUNTED FROM THE ROSTER RATHER THAN FROM A COLUMN, because
       who holds one is a rule (`seatsUsed`) and a stored number would be a
       second answer to it. */
    const seats = app.access.seats;
    if (seats?.entitlement) {
      const key = seats.entitlement;
      counting.push((async () => {
        try {
          return { key, n: seatsUsed(await membersOf(db, tenantId), seats.counts) };
        } catch { return null; }
      })());
    }
  }

  for (const got of await Promise.all(counting)) {
    if (got) into.set(got.key, (into.get(got.key) ?? 0) + got.n);
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
