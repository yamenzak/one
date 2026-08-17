/**
 * THE DAILY SWEEP — what happens to a workspace nobody is looking at.
 *
 * ⚠️ THE LADDER CLIMBS BY ITSELF; ERASURE DOES NOT. Standing is DERIVED from
 * `past_due_at` every time it is read, so a workspace slides from serving to
 * read-only to blocked with nothing running — which is the right design and is
 * also why the missing clock was invisible for so long. The rung that needs a
 * clock is the last one: at day 37 the records are destroyed, and a deletion
 * that only happens when somebody visits is a deletion that never happens for
 * exactly the workspaces nobody visits.
 *
 * ⚠️ SO THE ONE THING THIS DOES IS THE IRREVERSIBLE THING, and it is written to
 * be re-runnable rather than clever: erase what is due, and if the same sweep
 * runs twice the second one finds nothing to delete. A scheduler that must not
 * be run twice is a scheduler nobody dares re-run after a failure.
 *
 * ⚠️ fan-out-exempt: retention is a rule about ROWS and this is the one caller
 * that is not a request. D5 forbids a fan-out because a per-request walk gets
 * slower with every shard and times out at the size where it matters; a nightly
 * sweep visiting every database once is the shape that rule exists to make
 * affordable, and asking it per workspace would be the same answer arrived at
 * once per customer.
 *
 * ⚠️ AND IT DERIVES ITS ERASURE WORK FROM THE DIRECTORY (D5). "Which workspaces are past
 * their date" answered by asking every shard is a walk that gets slower with
 * every shard and times out at the size where it starts to matter.
 */

import type { AppSpec, Instant, PackDef, TenantId } from "@engine/kernel";

import { erase } from "./records.js";
import { closeTenant, forgetBelonging, membersOfTenant, tenantById } from "./directory.js";
import { forgetWorkspace } from "./dossier.js";
import { eraseObjects, type Bucket, type Where } from "./storage.js";
import { forgetBranding } from "./branding.js";
import { forgetIcon } from "./icon.js";
import { dueForErasure, run } from "./jobs.js";
import { apply, type ApplyDeps } from "./resources.js";
import { carryObjects, carryRows, finishMove, reapMoved } from "./move.js";
import { chargeOffSession, type StripeDeps } from "./stripe.js";
import { dueForTopUp, noteTopUpAttempt, noteTopUpFailed } from "./wallet.js";
import { column, table, type Db } from "./sql.js";

export interface SweepDeps {
  readonly directory: Db;
  /** Where a workspace's records are. Null when its shard is not bound here. */
  readonly shardOf: (tenantId: TenantId) => Promise<Db | null>;
  readonly apps: Readonly<Record<string, () => AppSpec>>;
  /**
   * ⚠️ EVERY SHARD, NOT ONE PER TENANT. Retention is a rule about ROWS, not
   * about workspaces — "older than two years" is one statement per table per
   * database, and asking it per workspace is the same answer arrived at once
   * per customer.
   */
  readonly shards: readonly Db[];
  /**
   * ⚠️ WHERE THIS WORKSPACE'S FILES ARE, so erasure can take the objects and not
   * only the rows. Absent means this deployment stores no files — which is true
   * of one whose bucket the reconciler has not made live yet, and is why it is
   * optional rather than assumed.
   */
  readonly bucketFor?: (where: Where) => Bucket | null;
  /**
   * ⚠️ WHAT A STANDING TOP-UP MAY BUY. Absent is a deployment that sells no
   * packs, and the pass stands down rather than charging anybody — which is what
   * every test and every `wrangler dev` runs.
   */
  readonly packs?: readonly PackDef[];
  /** ⚠️ What a stored Stripe key is encrypted under — see `config.ts`. */
  readonly configSecret?: string;
  /**
   * ⚠️ A SHARD BY ITS ID, WHICH A MOVE NEEDS AND A TENANT LOOKUP CANNOT GIVE. The
   * target shard has no workspace on it yet, so `shardOf` — which resolves
   * through the tenant — cannot reach it.
   */
  readonly shardById?: (shardId: string) => Db | null;
  /** Which jurisdiction a shard is in, so a move can find the target's bucket. */
  readonly residencyOf?: (shardId: string) => string | undefined;
  /**
   * ⚠️ THE INFRASTRUCTURE RECONCILER, AND IT IS OPTIONAL BECAUSE A DEPLOYMENT
   * WITH NO TOKEN IS A LEGITIMATE DEPLOYMENT. Absent means every resource a
   * product declares stays `wanted` and every capability behind one reads as
   * absent — which is the honest behaviour, and is what a self-host and every
   * test run actually are.
   */
  readonly reconcile?: Omit<ApplyDeps, "directory" | "now">;
  readonly now?: () => Date;
}

/**
 * Erase every workspace past its erasure date.
 *
 * ⚠️ THE RECORDS FIRST, THE BELONGING LAST. Somebody who is no longer a member
 * cannot be found by the walk that would erase their records, so removing the
 * membership before the rows leaves the rows behind — with nothing pointing at
 * them, which is worse than either order failing loudly.
 */
export async function sweepErasure(deps: SweepDeps): Promise<{ touched: number; detail: string }> {
  const now = (deps.now ?? (() => new Date()))();
  const due = await dueForErasure(deps.directory, now.toISOString() as Instant);

  let erased = 0;
  const missed: string[] = [];
  for (const one of new Map(due.map((d) => [d.tenantId, d])).values()) {
    /* ⚠️ ALREADY DONE IS NOT DUE. Erasure leaves nothing behind to notice, so
       without this the same workspace is past its date again tomorrow and the
       run record claims work every night for the rest of the deployment. */
    const tenant = await tenantById(deps.directory, one.tenantId);
    if (!tenant || tenant.closedAt) continue;

    const db = await deps.shardOf(one.tenantId);
    if (!db) {
      /* ⚠️ REPORTED, NEVER SKIPPED QUIETLY. A workspace whose shard this
         deployment does not bind is one nothing will ever erase, and a sweep
         that returned "0 erased" over it would look like a clean run. */
      missed.push(one.tenantId);
      continue;
    }

    for (const make of Object.values(deps.apps)) {
      await erase(db, make().collections, "tenant", one.tenantId);
    }
    /*
      ⚠️ AND THE PLATFORM'S OWN TABLES, FROM THE LEDGER RATHER THAN FROM MEMORY.
      This step used to be the two lines below it — the belonging rows and the
      branding — so a workspace reported as erased kept its roster, every
      notification, its audit trail, its settings, its packages, its purchases
      and the whole vault, encrypted health facts included. `forgetWorkspace`
      walks the same declaration the export walks, which is what stops the two
      halves of "erased" from meaning different things.
    */
    /*
      ⚠️ THE OBJECTS BEFORE THE ROWS, AND THE ORDER IS THE WHOLE POINT. The row
      is the only thing that knows an object's key; once it is deleted the file
      is unreachable by anything except a bucket listing nobody runs, so it stays
      in the bucket for ever — after a workspace was reported erased, with every
      photograph anybody uploaded still in it, and nothing anywhere that would
      look. Doing this second is indistinguishable from not doing it at all.
    */
    await eraseObjects(db, deps.bucketFor?.({ tenantId: one.tenantId, residency: tenant.residency }) ?? null, { tenantId: one.tenantId });

    await forgetWorkspace(
      [{ db, of: "shard", apps: [] }, { db: deps.directory, of: "directory", apps: [] }],
      one.tenantId);
    for (const accountId of await membersOfTenant(deps.directory, one.tenantId)) {
      await forgetBelonging(deps.directory, accountId, one.tenantId);
    }
    await forgetBranding(deps.directory, one.tenantId);
    /* ⚠️ AND THE ICON, WHICH IS THE SAME OMISSION ONE TABLE OVER. Both live in
       the directory, so the cascade derived from every app's collections cannot
       see either — a logo left behind after a business closed is their mark
       still on our infrastructure. */
    await forgetIcon(deps.directory, one.tenantId);
    await closeTenant(deps.directory, one.tenantId, now);
    erased++;
  }

  const detail = missed.length
    ? `${erased} erased, ${missed.length} on a shard this deployment does not bind: ${missed.join(", ")}`
    : `${erased} erased`;
  return { touched: erased, detail };
}

/**
 * Delete what has been kept for as long as it was promised.
 *
 * ⚠️ A RETENTION NOBODY ENFORCES IS WORSE THAN NONE, and this is the shape it
 * had: `retention` is declared on every collection and every purpose, and
 * `vault.processing` PUBLISHES it to the person it is about. Telling somebody
 * in writing that a fact is kept for two years and then keeping it forever is
 * not a gap — it is a documented commitment the system contradicts, discovered
 * by whoever asks for their data in year three.
 *
 * ⚠️ AND IT IS DERIVED, so a collection added today expires today. A list of
 * tables to sweep is a list that will one day be missing the newest one, which
 * is exactly the table nobody thinks to check.
 *
 * ⚠️ A FACT IS KEPT AS LONG AS ITS LONGEST PURPOSE NEEDS IT. One fact may serve
 * two, and expiring it on the shorter would delete something the other purpose
 * is still lawfully — and visibly — holding.
 */
export async function sweepRetention(deps: SweepDeps): Promise<{ touched: number; detail: string }> {
  const now = (deps.now ?? (() => new Date()))();
  const day = 24 * 60 * 60 * 1000;
  const before = (days: number) => new Date(now.getTime() - days * day).toISOString();

  let deleted = 0;
  const said: string[] = [];

  for (const db of deps.shards) {
    for (const make of Object.values(deps.apps)) {
      const app = make();

      for (const spec of app.collections) {
        if (spec.retention === null) continue;
        /* ⚠️ A missing table is not a failure — a shard legitimately holds only
           the apps placed on it, and a sweep that threw would stop before the
           tables that ARE there. */
        try {
          const done = await db.prepare(
            `DELETE FROM ${table(spec.id)} WHERE ${column("at")} < ?`)
            .bind(before(spec.retention)).run() as { meta?: { changes?: number } };
          const rows = done?.meta?.changes ?? 0;
          if (rows) { deleted += rows; said.push(`${spec.id} ${rows}`); }
        } catch { /* not on this shard */ }
      }

      /* The vault's own, by the longest purpose that covers each fact. */
      for (const [key, field] of Object.entries(app.vault ?? {})) {
        const days = field.purposes
          .map((id) => app.purposes?.[id]?.retention ?? null)
          .reduce<number | null>((a, b) => (a === null || b === null ? null : Math.max(a, b)),
            field.purposes.length ? 0 : null);
        if (days === null || days === 0) continue;
        try {
          const done = await db.prepare(
            `DELETE FROM vault_fact WHERE field = ? AND at < ?`)
            .bind(key, before(days)).run() as { meta?: { changes?: number } };
          const rows = done?.meta?.changes ?? 0;
          if (rows) { deleted += rows; said.push(`${key} ${rows}`); }
        } catch { /* not on this shard */ }
      }
    }
  }

  return { touched: deleted, detail: said.length ? said.join(", ") : "nothing was past its date" };
}

/**
 * ⚠️ EVERY RUN IS RECORDED, SUCCESSES AND FAILURES ALIKE. A job that stops
 * running does not fail — nothing is waiting for its answer, so a throw at 03:00
 * has no user, no request, no 500 and no red test. The console reads the LAST
 * run, because a job that is merely scheduled tells you nothing.
 */
export async function sweep(deps: SweepDeps): Promise<void> {
  const now = (deps.now ?? (() => new Date()))();
  await run(deps.directory, "erasure", () => sweepErasure(deps), now);
  /* ⚠️ ITS OWN RUN ROW, because "the sweep ran" is not the question anybody
     asks after something was kept too long. Two jobs, two records, and the
     console shows which of them stopped. */
  await run(deps.directory, "retention", () => sweepRetention(deps), now);

  /*
    ⚠️ AND A MOVE IN FLIGHT IS ADVANCED, because nothing else will. The operator
    starts one and the workspace goes read-only immediately; if the copy only
    ever ran from a request, a move begun and not finished would leave somebody
    unable to write with no path forward except a support conversation.
  */
  await run(deps.directory, "moves", () => sweepMoves(deps), now);

  /*
    ⚠️ AND THE STANDING TOP-UPS, WHICH ARE THE ONLY THING HERE THAT SPENDS
    SOMEBODY'S MONEY. It runs on the sweep rather than on a request because a
    Stripe round trip does not belong on the path of a call somebody is waiting
    for — and because the point is to top up BEFORE the balance reaches zero,
    which is a question about a threshold rather than about a refusal.
  */
  if (deps.packs?.length) {
    await run(deps.directory, "topups", () => sweepTopUps(deps), now);
  }

  /*
    ⚠️ AND THE INFRASTRUCTURE, ON THE SAME CLOCK. Reconciling on a schedule
    rather than on a deploy is what makes "this app needs a queue" a line in a
    manifest instead of a ticket: the declaration lands, the next pass makes it
    exist, and the pass after that sees the binding and marks it live.

    ⚠️ IT CANNOT DESTROY ANYTHING IT DECIDED ABOUT TODAY. Everything destructive
    here is at the far end of a thirty-day drain, so a nightly job holding the
    account token cannot turn a bad edit into data loss — the worst it can do
    overnight is create something spurious, which is a bill and not an
    incident.
  */
  if (deps.reconcile) {
    const at = deps.reconcile;
    await run(deps.directory, "resources", async () => {
      const out = await apply({ ...at, directory: deps.directory, now: () => now });
      /* ⚠️ A REFUSAL THROWS, BECAUSE `run` DECIDES `ok` FROM WHETHER THIS DID.
         Returned as an ordinary result it is a green run row over a
         reconciliation that achieved nothing — a job quietly doing nothing for a
         month, which is exactly how a reconciler stops being one. What DID
         happen is in the message, so a partial pass is not lost either. */
      if (out.refused.length) {
        throw new Error([...out.did, ...out.refused.map((r) => `refused: ${r}`)].join("; "));
      }
      return { touched: out.did.length, detail: out.did.join("; ") || "nothing to do" };
    }, now);
  }
}

/**
 * CARRY EVERY MOVE THAT IS IN FLIGHT, AND CLEAR EVERY SOURCE THAT HAS DRAINED.
 *
 * ⚠️ THE COPY IS RE-RUNNABLE, SO A PASS THAT DIED HALF WAY IS SIMPLY RUN AGAIN.
 * `carryRows` replaces by primary key and `finishMove` refuses on any count that
 * does not match — so the worst a failed pass costs is another night, and never
 * a workspace flipped onto a database with holes in it.
 *
 * ⚠️ AND THE FLIP IS REFUSED RATHER THAN FORCED. A mismatch leaves the workspace
 * read-only and in flight, which is visible in the console and recoverable —
 * the alternative is a customer reading a workspace that is quietly missing
 * rows, which is not.
 */
export async function sweepMoves(deps: SweepDeps): Promise<{ touched: number; detail: string }> {
  const now = (deps.now ?? (() => new Date()))();
  const apps = Object.values(deps.apps).map((make) => make());
  const said: string[] = [];
  let touched = 0;

  const inFlight = await deps.directory.prepare(
    `SELECT tenant_id, from_shard, to_shard FROM move WHERE state = 'copying'`)
    .all<{ tenant_id: string; from_shard: string; to_shard: string }>();

  for (const row of inFlight.results) {
    const from = await deps.shardOf(row.tenant_id as never);
    const to = deps.shardById?.(row.to_shard) ?? null;
    if (!from || !to) {
      said.push(`${row.tenant_id}: a shard this deployment does not bind`);
      continue;
    }

    await carryRows(from, to, row.tenant_id as never, apps);
    /* ⚠️ THE OBJECTS TOO, and they are read and re-written one at a time —
       there is no server-side copy across a jurisdiction, which is the whole
       reason the bucket is different. */
    const tenant = await tenantById(deps.directory, row.tenant_id as never);
    await carryObjects(
      from,
      deps.bucketFor?.({ tenantId: row.tenant_id, residency: tenant?.residency }) ?? null,
      deps.bucketFor?.({ tenantId: row.tenant_id, residency: deps.residencyOf?.(row.to_shard) }) ?? null,
      row.tenant_id as never,
    );

    const wrong = await finishMove(deps.directory, from, to, row.tenant_id as never, apps, now);
    if (wrong) said.push(`${row.tenant_id}: ${wrong.join("; ")}`);
    else { touched++; said.push(`${row.tenant_id} moved to ${row.to_shard}`); }
  }

  const reaped = await reapMoved(
    deps.directory, (id) => deps.shardById?.(id) ?? null, apps, now);
  if (reaped) said.push(`${reaped} drained source copy(ies) cleared`);

  return { touched: touched + reaped, detail: said.join("; ") || "nothing in flight" };
}

/* --------------------------------------------------------------- top-ups --- */

/**
 * CARRY OUT EVERY STANDING TOP-UP THAT IS DUE.
 *
 * ⚠️ THE ATTEMPT IS RECORDED BEFORE THE CHARGE, and that order is the whole
 * safety. A charge that succeeded and then failed to write its cooldown is one
 * the next pass makes again — "the card was charged twice and the record says
 * once" is the failure this exists to prevent, and recording first can only ever
 * cost a customer an hour.
 *
 * ⚠️ AND THE CREDITS ARE GRANTED BY THE WEBHOOK, NEVER HERE. `chargeOffSession`
 * answering `succeeded` is us reading a response; `payment_intent.succeeded`
 * arriving signed is Stripe telling us. Granting on the first would be the one
 * place in this deployment where money is claimed to have moved on our own say
 * so, and it would grant twice when the event arrives as well.
 *
 * ⚠️ A DECLINE IS NOT AN ERROR, IT IS AN ANSWER. A bank may demand
 * authentication a browserless charge cannot give it, so the pass records why on
 * the row the customer's own money screen reads, and does not retry.
 */
export async function sweepTopUps(deps: SweepDeps): Promise<{ touched: number; detail: string }> {
  const now = (deps.now ?? (() => new Date()))();
  const packs = deps.packs ?? [];
  const stripe: StripeDeps = {
    directory: deps.directory,
    ...(deps.configSecret ? { configSecret: deps.configSecret } : {}),
  };

  let charged = 0;
  const said: string[] = [];

  for (const owing of await dueForTopUp(deps.directory, now)) {
    const pack = packs.find((p) => p.id === owing.packId);
    if (!pack) {
      /* ⚠️ A PACK THAT LEFT THE CATALOGUE IS NOT A SILENT NO-OP. The customer
         armed something that no longer exists, and nothing else would ever tell
         them why their balance stopped topping up. */
      await noteTopUpFailed(deps.directory, owing.tenantId, "That pack is no longer sold.");
      said.push(`${owing.tenantId}: no such pack`);
      continue;
    }

    await noteTopUpAttempt(deps.directory, owing.tenantId, now);
    const out = await chargeOffSession(stripe, {
      tenantId: owing.tenantId, customerRef: owing.customerRef, pack,
    });

    if (out === "not_charging") {
      await noteTopUpFailed(deps.directory, owing.tenantId, "We cannot take payments right now.");
      said.push(`${owing.tenantId}: not charging`);
      continue;
    }
    if (out === "declined") {
      await noteTopUpFailed(deps.directory, owing.tenantId, "Your bank did not approve the charge.");
      said.push(`${owing.tenantId}: declined`);
      continue;
    }
    charged++;
    said.push(`${owing.tenantId}: ${pack.id}`);
  }

  return { touched: charged, detail: said.join("; ") || "nothing to do" };
}
