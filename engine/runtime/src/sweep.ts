/**
 * THE DAILY SWEEP — what happens to a workspace nobody is looking at.
 *
 * ⚠️ THE LADDER CLIMBS BY ITSELF; ERASURE DOES NOT. Standing is DERIVED from
 * `past_due_at` every time it is read, so a workspace slides from serving to
 * read-only to blocked with nothing running — which is the right design and is
 * also why the missing clock was invisible for so long. The rung that needs a
 * clock is the last one: at the ladder's last rung the records are destroyed,
 * and a deletion
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

import type {
  AppSpec, Channel, Instant, JobBook, JobDef, Letter, PackDef, PlanSpec, TenantId,
} from "@engine/kernel";
import { UNLIMITED, isSearchable } from "@engine/kernel";

/* ⚠️ THE SAME DISPATCH A REQUEST USES, aliased because `tell` is already the
   name of the failure route on `SweepDeps` and two things called `tell` in one
   file is how a failure report ends up in a customer's inbox. */
import { tell as tellAbout } from "./dispatch.js";
import { mailedAs } from "./inbox.js";
import { availableChannels, type NotifyDeps } from "./services.js";
import { settingsFor } from "./settings.js";

import { erase, readOne } from "./records.js";
import {
  closeTenant, dedicateShard, forgetBelonging, membersOfTenant, shards, tenantById, waitingAlone,
} from "./directory.js";
import { forgetWorkspace } from "./dossier.js";
import { bytesUsed, eraseObjects, type Bucket, type Where } from "./storage.js";
import { brandingOf, forgetBranding } from "./branding.js";
import { forgetIcon } from "./icon.js";
import { dueForErasure, run, runDue, type RunnerDeps } from "./jobs.js";
import { apply, type ApplyDeps } from "./resources.js";
import { carryObjects, carryRows, finishMove, isolateWaiting, reapMoved } from "./move.js";
import { chargeOffSession, type StripeDeps } from "./stripe.js";
import {
  collectOwed, dueForAllowance, dueForTopUp, noteTopUpAttempt, noteTopUpFailed, owe,
  renewAllowance, walletOf, MILLI,
} from "./wallet.js";
import { compedSubscriptions } from "./billing.js";
import { column, table, type Db } from "./sql.js";
import { type LogReader } from "./gateway.js";
import { dropItem, ensureInstance, listModels, putItem, type Account } from "./cloudflare.js";
import { preferOurs, propertyIdsOf, readCatalogue, syncModels } from "./models.js";
import { listGeminiModels } from "./google.js";
import { inCredits, lossesIn, marginsSince, trueUp } from "./reconcile.js";
import { flushIndex, instanceFor, type Index } from "./search.js";

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
  /**
   * ⚠️ WHAT A WORKSPACE'S PLAN INCLUDES, so the storage meter knows where the
   * included amount ends. Absent is a deployment that meters nothing.
   */
  readonly plans?: readonly PlanSpec[];
  /**
   * ⚠️ WHAT A GIGABYTE-MONTH COSTS OVER THE INCLUDED AMOUNT, in credits. It is
   * the deployment's number rather than a constant here, because it is a price
   * and every price in this repository is a declaration somebody can read.
   */
  readonly storageRate?: number;
  /** ⚠️ What a stored Stripe key is encrypted under — see `config.ts`. */
  readonly configSecret?: string;
  /**
   * ⚠️ THE GOOGLE KEY, SO THE CATALOGUE IS THE WHOLE CATALOGUE. Cloudflare's own
   * list covers the models it hosts and nothing else, so without this a
   * deployment routing Gemini through the gateway has no Gemini row to sell.
   * Absent is a deployment with no Google key set, which sells Cloudflare's
   * models and says so.
   */
  readonly googleKey?: () => string | null;
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
  /**
   * ⚠️ WHAT AN OPERATOR MOVED A JOB TO, IF ANYTHING. The declaration stays the
   * authority for the floor, the budget and the failure route — none of which a
   * console may edit — and only the cadence is theirs to change.
   */
  readonly scheduleOf?: (jobId: string) => string | undefined;
  /** ⚠️ `onFail: tell` — where a failure is reported. */
  readonly tell?: (notification: string, detail: string) => Promise<void>;
  /**
   * ⚠️ HOW A NIGHT'S WORK REACHES THE PEOPLE IT CONCERNS. Not the same thing as
   * `tell` above, which reports a job that BROKE to an operator: this carries
   * what a job FOUND into the workspace it found it in, through the same inbox,
   * the same audience-by-permission and the same channel resolution a request
   * uses. Absent is a deployment with no inbox wired — every test harness, and
   * a `wrangler dev` before push has a keypair — and a job then simply has no
   * `ctx.tell`.
   */
  readonly notify?: NotifyDeps;
  /**
   * ⚠️ THE WORKSPACE ZONE, SO A LETTER CARRIES A WAY BACK. A note filed in an
   * inbox is one press from the thing it is about; the same note as an email
   * arrives among four hundred others and its `link` is a route that means
   * nothing outside the app. Absent is a deployment that sends no mail, and the
   * letter then says what happened without offering a door — which is worse than
   * a link and better than a broken one.
   */
  readonly root?: string;
  /**
   * ⚠️ THE ACCOUNT CREDENTIAL, WHICH IS NOT THE GATEWAY'S. This one reads the
   * model catalogue; the gateway's runs models. A deployment holding only the
   * second runs everything and syncs nothing, which is a working deployment on
   * a catalogue that stops moving — so this is optional and its absence simply
   * removes the job.
   */
  readonly account?: () => Account | null;
  /** ⚠️ What a new catalogue row's margin is bound to — see `DEFAULT_MULTIPLIER`. */
  readonly multiplier?: number;
  /**
   * ⚠️ WHERE A RUN'S REAL COST IS READ. Absent is a deployment that cannot check
   * its own margin, which is worth knowing about rather than pretending away —
   * the job simply is not in the book, and the console says the check is not
   * running.
   */
  readonly logs?: () => LogReader | null;
  /**
   * ⚠️ WHICH DEPLOYMENT THIS IS, AND IT IS HALF OF EVERY SEARCH INSTANCE NAME.
   * One Cloudflare account can carry a staging deployment and a live one, and an
   * instance named for the app alone would be one index holding both — so a
   * query in staging would find production records. The reader composes the same
   * name from the same two halves; see `instanceFor`.
   */
  readonly deployment?: string;
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
/**
 * THE PLATFORM'S OWN JOBS, DECLARED LIKE EVERYBODY ELSE'S.
 *
 * ⚠️ THESE WERE STRING LITERALS PASSED TO `run`, AND THAT IS WHY THE CONSOLE
 * COULD NOT SEE THEM. `op.jobs` builds its book from every app's `jobs`, so the
 * seven things this deployment actually does every night appeared on no screen —
 * while the one app job that WAS on the screen was never run by anything. The
 * operator's "Nightly work" listed exactly the jobs that do not happen and
 * omitted exactly the ones that do.
 *
 * ⚠️ THE ORDER IS LOAD-BEARING AND IT IS THIS OBJECT'S KEY ORDER. The allowance
 * is the money and everything after it reads a balance, so allowances precede
 * the storage meter and the meter precedes the top-ups — metering second would
 * leave every workspace it emptied waiting a day for the top-up that would have
 * covered it.
 *
 * ⚠️ AND WHAT IS NOT CONFIGURED IS ABSENT RATHER THAN FAILING. A deployment with
 * no plans has no allowance to renew; listing the job anyway would put a row on
 * the console that is permanently quiet and means nothing.
 */
export function platformJobs(deps: SweepDeps): JobBook {
  const now = (deps.now ?? (() => new Date()))();
  const book: Record<string, JobDef> = {};
  const at = (
    id: string, label: string, why: string,
    work: () => Promise<{ touched: number; detail: string }>,
    extra: Partial<JobDef> = {},
  ) => {
    book[id] = {
      id, label, why,
      schedule: "0 3 * * *", scope: "deployment",
      onFail: { then: "park" }, rerunnable: true,
      work: async () => work(),
      ...extra,
    };
  };

  at("erasure", "Erase what is past its date",
    "Destroys the records of workspaces that reached the end of the ladder.",
    () => sweepErasure(deps),
    /* ⚠️ THE LADDER'S OWN LAST RUNG IS THIRTY DAYS PAST DUE — see `dueForPurge`.
       Declared here so `refuseJob` can see that this one deletes. */
    { destroys: { floorDays: 30 }, budgetSeconds: 120 });

  /* ⚠️ ITS OWN ROW, because "the sweep ran" is not the question anybody asks
     after something was kept too long. */
  at("retention", "Delete what was kept long enough",
    "Enforces every collection's and every purpose's declared retention.",
    () => sweepRetention(deps),
    { destroys: { floorDays: 1 }, budgetSeconds: 120 });

  /*
    ⚠️ A MOVE IN FLIGHT IS ADVANCED, because nothing else will. The operator
    starts one and the workspace goes read-only immediately; if the copy only
    ever ran from a request, a move begun and not finished would leave somebody
    unable to write with no path forward except a support conversation.
  */
  at("moves", "Carry a workspace to its new shard",
    "Advances every move in flight, and clears a source once it has drained.",
    () => sweepMoves(deps), { budgetSeconds: 120 });

  /*
    ⚠️ A COMPED WORKSPACE IS RENEWED BY THIS CLOCK, because it has no other.
  */
  if (deps.plans?.length) {
    at("allowances", "Renew the monthly allowance",
      "Grants each workspace the credits its plan includes for the month.",
      () => sweepAllowances(deps));
  }

  if (deps.plans?.length && deps.storageRate) {
    at("storage", "Meter what is stored",
      "Charges each workspace for the storage it keeps over what its plan includes.",
      () => sweepStorage(deps));
  }

  /*
    ⚠️ THE ONLY THING HERE THAT SPENDS SOMEBODY'S MONEY. It runs on the sweep
    rather than on a request because a Stripe round trip does not belong on the
    path of a call somebody is waiting for — and because the point is to top up
    BEFORE the balance reaches zero, which is a question about a threshold rather
    than about a refusal.
  */
  if (deps.packs?.length) {
    at("topups", "Buy the standing top-ups",
      "Tops up a workspace that armed one and fell under its threshold.",
      () => sweepTopUps(deps));
  }

  /*
    ⚠️ AND THE INFRASTRUCTURE, ON THE SAME CLOCK. Reconciling on a schedule
    rather than on a deploy is what makes "this app needs a queue" a line in a
    manifest instead of a ticket: the declaration lands, the next pass makes it
    exist, and the pass after that sees the binding and marks it live.

    ⚠️ IT CANNOT DESTROY ANYTHING IT DECIDED ABOUT TODAY. Everything destructive
    here is at the far end of a thirty-day drain, so a nightly job holding the
    account token cannot turn a bad edit into data loss — the worst it can do
    overnight is create something spurious, which is a bill and not an incident.
  */
  if (deps.reconcile) {
    const re = deps.reconcile;
    at("resources", "Make what the apps declared exist",
      "Creates, binds and drains the stores every product's manifest asks for.",
      async () => {
        const out = await apply({ ...re, directory: deps.directory, now: () => now });
        /* ⚠️ A REFUSAL THROWS, BECAUSE `run` DECIDES `ok` FROM WHETHER THIS DID.
           Returned as an ordinary result it is a green run row over a
           reconciliation that achieved nothing — a job quietly doing nothing for
           a month, which is exactly how a reconciler stops being one. What DID
           happen is in the message, so a partial pass is not lost either. */
        if (out.refused.length) {
          throw new Error([...out.did, ...out.refused.map((r) => `refused: ${r}`)].join("; "));
        }
        return { touched: out.did.length, detail: out.did.join("; ") || "nothing to do" };
      },
      { destroys: { floorDays: 30 }, budgetSeconds: 120 });

    /*
      ⚠️ AND THE SHARD BUILT FOR A WORKSPACE IS GIVEN TO IT, IN THE SAME PASS.
      The reconciler above creates it because somebody asked to be alone;
      without this it stays empty for ever and the ask is a row nothing acts on.
      Reserving and beginning the move is the whole remaining step — the carry,
      the verification and the flip are already below.

      ⚠️ AFTER the reconciler, because the shard it needs is one that pass made.
      A `live` binding takes a rollout, so the shard is usually adopted on the
      NEXT night rather than this one, and that is fine: this is a reconciler,
      not a script.
    */
    at("isolating", "Give a workspace the database it asked for",
      "Reserves an empty shard for each workspace waiting on one, and starts the move.",
      async () => {
        const waiting = await waitingAlone(deps.directory);
        if (!waiting.length) return { touched: 0, detail: "nobody is waiting" };
        const said = await isolateWaiting({
          directory: deps.directory,
          waiting,
          shards: await shards(deps.directory),
          countOn: async (shardId) => (await deps.directory.prepare(
            `SELECT COUNT(*) AS n FROM tenant WHERE shard_id = ? AND closed_at IS NULL`)
            .bind(shardId).first<{ n: number }>())?.n ?? 1,
          reserve: (id, forTenant) => dedicateShard(deps.directory, id, forTenant),
          now,
        });
        return { touched: said.length, detail: said.join("; ") || "no empty shard yet" };
      });
  }

  /*
    ⚠️ THE CATALOGUE IS A FACT ABOUT THE WORLD AND THE WORLD DOES NOT ASK US. A
    provider adds a model, retires one, or changes a price, and a deployment
    reading a catalogue it synced once is selling last quarter's prices at this
    quarter's cost. Daily is the cadence the prices actually move at.

    ⚠️ AND IT WRITES ALL ROWS OR NONE — see `syncModels`. A partial catalogue
    applied at 03:00 is a lane whose only enabled model vanished.
  */
  if (deps.account) {
    const account = deps.account;
    at("models", "Learn what the models cost",
      "Discovers new models, retires gone ones, and refreshes every price.",
      async () => {
        const at = account();
        if (!at) throw new Error("catalogue: no account token");
        const answer = await listModels(at);
        /*
          ⚠️ THE REASON NAMES THE CREDENTIAL, BECAUSE THERE ARE TWO AND THEY LOOK
          ALIKE. The gateway token on the Keys screen authenticates calls THROUGH
          the gateway; this reads the model catalogue off the account and is the
          deployment's own `CF_API_TOKEN`. An operator who had just set the first
          one read "catalogue: Authentication error" and reasonably concluded the
          value they had pasted was wrong — the message named neither which token
          nor what it needed, so the one screen that could end the guess started
          it instead.
        */
        if (!answer.ok) {
          throw new Error(`catalogue: ${answer.why}. This is the deployment's own Cloudflare `
            + `account token, which needs the Workers AI Read permission — not the gateway `
            + `token under Keys, which is a different credential and is used for running `
            + `models rather than listing them.`);
        }
        /*
          ⚠️ TWO SOURCES, ONE CATALOGUE, AND CLOUDFLARE'S IS ONLY HALF OF IT.
          `/ai/models/search` answers for the models Cloudflare HOSTS; Gemini
          reaches us through the same gateway and appears in none of them. So a
          deployment with a Google key set, a gateway that would route the call
          and an operator who had done everything right had no Gemini row to
          switch on, and nothing said why — from the catalogue's own side
          nothing was missing.

          ⚠️ AND GOOGLE'S FAILURE MUST NOT BE CLOUDFLARE'S. Retiring is scoped by
          provider (see `syncModels`), so a pass that reached one vendor and not
          the other retires everything the missing one sells. A partial answer is
          therefore reported and NOT applied.
        */
        const alsoGoogle = deps.googleKey?.();
        const google = alsoGoogle ? await listGeminiModels(alsoGoogle) : null;
        if (google && !google.ok) {
          throw new Error(`catalogue: Cloudflare answered, Google did not — ${google.why}. `
            + `Nothing was applied, because a pass that reaches one vendor and not the `
            + `other retires every model the missing one sells.`);
        }

        /* ⚠️ THE ROW WE ARE ACTUALLY CHARGED FOR WINS — see `preferOurs`.
           Cloudflare resells Gemini and this deployment does not buy it there. */
        const found = preferOurs(readCatalogue(answer.value), google?.value ?? []);
        const out = await syncModels(deps.directory, found, deps.multiplier, now);
        /*
          ⚠️ A REFUSAL SAYS WHAT IT SAW, because the alternative is what happened
          here: `no_priced_row` was true, correct, and told nobody whether the
          catalogue was empty, the permission wrong or the parser looking for a
          field that does not exist. The property ids from the first row are the
          one fact that separates those three, and they cost a sentence.
        */
        if (out.refused.length) {
          const saw = answer.value[0];
          const ids = saw ? propertyIdsOf(saw).join(", ") : "none";
          throw new Error(`catalogue refused: ${out.refused.join(", ")}. `
            + `${answer.value.length} row(s) read; the first one is `
            + `"${saw?.id ?? "unnamed"}"/"${saw?.name ?? "unnamed"}" and carries: ${ids}.`);
        }
        /* ⚠️ A SKIPPED ROW IS SAID OUT LOUD. It is a model this deployment cannot
           address — a vendor with no prefix here — and it is the difference
           between a catalogue that grew and one that changed shape. Counted
           silently, the second reads exactly like the first. */
        /*
          ⚠️ AND WHICH VENDORS IT SAW, BECAUSE "WHERE ARE THE GEMINI MODELS" IS A
          QUESTION THIS LINE CAN ANSWER AND NOTHING ELSE CAN. Cloudflare's list
          and Google's are two sources with two failure modes, and a total tells
          neither apart from the other: a key that was never read, a vendor the
          gateway has no lane for, and a catalogue that simply has fewer models
          than somebody expected all show up as one number.
        */
        const seen = new Map<string, number>();
        for (const f of found) seen.set(f.provider ?? "", (seen.get(f.provider ?? "") ?? 0) + 1);
        const per = [...seen.entries()]
          .filter(([vendor]) => vendor)
          .sort((a, b) => b[1] - a[1])
          .map(([vendor, n]) => `${vendor} ${n}`)
          .join(", ");

        return {
          touched: out.added + out.priced + out.retired,
          detail: `${out.added} new, ${out.priced} repriced, ${out.retired} retired`
            + (out.skipped ? `, ${out.skipped} unaddressable` : "")
            + (per ? ` · ${per}` : ""),
        };
      },
      { budgetSeconds: 60 });
  }

  /*
    ⚠️ THE ONE CHECK ON THE MONEY THAT IS NOT OUR OWN ARITHMETIC — see
    `reconcile.ts`. It corrects each run against what the gateway says that run
    cost, and then reports any workspace whose day cost more than it paid.

    ⚠️ IT RUNS WHENEVER THE GATEWAY CAN BE READ, INCLUDING WITH NO ACCOUNT TOKEN.
    The two credentials are different: syncing the catalogue needs the account,
    reading a log needs only the gateway binding. A deployment that can run
    models must be able to check what they cost.
  */
  if (deps.logs) {
    const logs = deps.logs;
    at("ai-costs", "Check what the AI really cost",
      "Corrects every run against the gateway's own bill, and reports any workspace sold under cost.",
      async () => {
        const up = await trueUp(deps.directory, logs(), now);
        const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();
        const losses = lossesIn(await marginsSince(deps.directory, since));
        const said = `${up.corrected} of ${up.looked} corrected`
          + (up.refundedMilli ? `, ${inCredits(up.refundedMilli)} credits returned` : "");
        /* ⚠️ A LOSS IS A FAILED RUN, NOT A LINE IN A DETAIL NOBODY READS. The
           job's own row is where an operator looks; making it green with the
           bad news inside is the shape this whole module exists against. */
        if (losses.length) {
          throw new Error(`${said}; sold under cost to ${losses.length} workspace(s), `
            + `worst ${losses[0]!.tenantId} short ${inCredits(losses[0]!.shortMilli)} credits`);
        }
        return { touched: up.corrected, detail: said };
      },
      { budgetSeconds: 120 });
  }

  /*
    ⚠️ THE INDEX CATCHES UP HERE, WHICH IS WHY A SAVE NEVER WAITS ON IT. A write
    marks a row and returns; this carries what is marked. Nothing about a
    retrieval service is then on the latency of somebody saving a note, a save
    cannot fail because an index was down, and the account token — which is what
    the items API takes — never reaches a tenant request path.

    ⚠️ IT RUNS MORE OFTEN THAN THE REST OF THE BOOK, because everything else here
    is a daily rule about money or retention and this is a lag somebody can SEE:
    a record saved in the morning and not findable until tomorrow reads as search
    being broken. Quarter-hourly is the compromise between that and a job that
    wakes up to do nothing.
  */
  if (deps.account && deps.deployment) {
    const account = deps.account;
    const deployment = deps.deployment;
    at("search", "Carry what changed to the index",
      "Sends new and edited records to search, and removes the deleted ones.",
      async () => {
        const to = account();
        if (!to) throw new Error("search: no account token");
        const apps = Object.values(deps.apps).map((make) => make());
        const index = indexOn(to);
        let sent = 0, removed = 0, failed = 0;
        const said: string[] = [];

        /* ⚠️ THE INSTANCES FIRST, AND A FAILURE HERE STOPS THE PASS. Pushing an
           item to an instance that does not exist is a failure per item — every
           row would be marked `failed`, which is terminal, so one missing
           instance would permanently poison a whole product's index. */
        for (const app of apps) {
          if (!app.collections.some(isSearchable)) continue;
          const ready = await ensureInstance(to, instanceFor(deployment, app.id));
          if (!ready.ok) throw new Error(`search: ${app.id}: ${ready.why}`);
        }

        /* ⚠️ EVERY SHARD, NOT ONE PER WORKSPACE. The ledger is a table, and
           asking it per workspace is the same statement run once per customer —
           the same reason retention walks shards. */
        for (const db of deps.shards) {
          const out = await flushIndex({
            db, index, deployment, now,
            collections: (appId) => apps.find((a) => a.id === appId)?.collections ?? [],
            read: (spec, scope, recordId) => readOne(db, spec, scope, recordId),
          });
          sent += out.sent; removed += out.removed; failed += out.failed;
          if (out.failed) said.push(out.detail);
        }

        /* ⚠️ A REFUSED ITEM FAILS THE RUN. A green row over an index that is
           quietly not taking anything is the shape every guard in this
           repository exists against — and search failing silently reads to a
           customer as their records having vanished. */
        if (failed) {
          throw new Error(`${sent} indexed, ${removed} removed, ${failed} refused: `
            + (said[0] ?? "no reason given"));
        }
        return {
          touched: sent + removed,
          detail: `${sent} indexed, ${removed} removed`,
        };
      },
      { schedule: "*/15 * * * *", budgetSeconds: 60 });
  }

  return book;
}

/**
 * ⚠️ THE ADAPTER IS HERE RATHER THAN IN `search.ts`, so that module knows nothing
 * about an account token and the job that holds one is the only thing that binds
 * it. `search.ts` takes an `Index`; this is the one that is real.
 */
const indexOn = (to: Account): Index => ({
  put: async (instance, key, text) => {
    const out = await putItem(to, instance, key, text);
    return out.ok ? { ok: true } : { ok: false, why: out.why };
  },
  drop: async (instance, key) => {
    const out = await dropItem(to, instance, key);
    return out.ok ? { ok: true } : { ok: false, why: out.why };
  },
});

/**
 * ⚠️ THE SWEEP IS NOW "RUN WHAT IS DUE", AND THE BOOK IS EVERYTHING. The
 * platform's seven and every app's own go through one runner, so a job cannot be
 * declared and left unrun — which is what happened to `tidy` for three stages,
 * with a console row saying so the whole time and nobody able to read it as a
 * fault.
 */
export async function sweep(deps: SweepDeps): Promise<void> {
  await runDue(runnerFor(deps), jobBookFor(deps));
}

/**
 * ⚠️ THE COMPOSED BOOK — the platform's, then every app's. The platform's come
 * first because the erasure and the money are what everything else stands on: an
 * app job fanning out over workspaces should not be walking one that is about to
 * be destroyed.
 */
export const jobBookFor = (deps: SweepDeps): JobBook => ({
  ...platformJobs(deps),
  ...Object.fromEntries(
    Object.values(deps.apps).flatMap((of) => Object.entries(of().jobs ?? {}))),
});

/**
 * WHICH APP EACH JOB CAME FROM.
 *
 * ⚠️ THE BOOK ABOVE FLATTENS EVERY PRODUCT INTO ONE MAP AND LOSES THIS, which
 * is correct for running them — a runner has no reason to care — and is exactly
 * what a job telling somebody needs. A notification is looked up in ITS APP'S
 * book: its audience, its link and its copy are the app's, and dispatching
 * against the wrong one finds no type at all and files nothing, quietly.
 *
 * ⚠️ THE PLATFORM'S OWN ARE ABSENT, and that is the deployment-scope refusal
 * one level down. They have no app, they run over the directory, and a note is
 * filed in a workspace.
 */
export const jobAppsFor = (deps: SweepDeps): Readonly<Record<string, AppSpec>> =>
  Object.fromEntries(Object.values(deps.apps).flatMap((of) => {
    const spec = of();
    return Object.keys(spec.jobs ?? {}).map((id) => [id, spec] as const);
  }));

/**
 * ⚠️ THE FAN-OUT LIST IS THE DIRECTORY'S (D5). Every workspace this deployment
 * serves, minus the closed ones — a per-tenant job walking a closed workspace is
 * work against records the erasure job is on its way to destroy.
 */
export const runnerFor = (deps: SweepDeps): RunnerDeps => {
  const of = jobAppsFor(deps);
  /* ⚠️ RESOLVED ONCE PER PASS, NOT PER NOTE. `availableChannels` asks whether
     push is live, which is a read; a sweep raising a note per expiring batch
     would ask it once per batch per workspace. */
  let channels: Promise<readonly Channel[]> | null = null;
  /* ⚠️ ONE LOOKUP PER WORKSPACE, HELD FOR THE PASS. What a letter needs beyond
     the note itself — whose name is in the subject, and which origin to send
     somebody back to — is one directory row, and a nightly sweep raises many
     notes per workspace. */
  const said = new Map<string, Promise<{ workspace?: string; origin?: string;
    letters?: Readonly<Record<string, Letter>> }>>();

  /* ⚠️ KEYED BY WORKSPACE AND APP, because whether a letter wears the
     workspace's name is the APP's `whitelabel` question — two products in one
     workspace can answer it differently, and a memo on the workspace alone
     would give the second one the first one's answer. */
  const addressed = (tenantId: TenantId, db: Db, app: AppSpec) => {
    const key = `${tenantId}:${app.id}`;
    const held = said.get(key);
    if (held) return held;
    const asking = (async () => {
      const tenant = await tenantById(deps.directory, tenantId);
      return {
        ...(tenant ? { workspace: tenant.name } : {}),
        ...(tenant && deps.root ? { origin: `https://${tenant.slug}.${deps.root}` } : {}),
        /* ⚠️ ONLY WHERE THE WORKSPACE'S BRAND REACHES ITS MAIL — the same
           question the request side asks, through the same function. Two
           answers to "may this letter wear their name" is how a night's mail
           comes to be branded where a day's is not. */
        ...(tenant
          ? await mailedAs(db, tenantId, app,
            await brandingOf(deps.directory, tenantId), tenant.kind)
          : {}),
      };
    })();
    said.set(key, asking);
    return asking;
  };

  return ({
    directory: deps.directory,
    shardOf: deps.shardOf,
    now: deps.now,
    scheduleOf: deps.scheduleOf,
    tell: deps.tell,
    ...(deps.notify
      ? {
        telling: async ({ jobId, tenantId, db, event, values }) => {
          const app = of[jobId];
          /* ⚠️ A PLATFORM JOB HAS NO APP BOOK TO LOOK IN. It cannot reach here
             — `refuseJob` refuses `emits` on a deployment-scope job — and the
             day one is per-tenant, silence is not the answer. */
          if (!app) throw new Error(`${jobId} raised "${event}" and belongs to no app`);
          channels ??= availableChannels(deps.notify!);
          await tellAbout(db, {
            app,
            tenantId,
            events: [event],
            input: values,
            answer: {},
            /* ⚠️ NOBODY ACTED, SO NOBODY IS EXCLUDED. `audienceFor` leaves the
               actor out of their own notification, which is right for a person
               and wrong for a clock — everyone who holds the permission needs
               to hear what the night found. */
            actor: null,
            actorName: null,
            channels: await channels,
            ...(deps.notify!.pusher ? { pusher: deps.notify!.pusher } : {}),
            /* ⚠️ RESOLVED ONCE PER WORKSPACE PER PASS, not once per note. A
               sweep raising forty expiries for one workspace would otherwise
               look its name up forty times to put it in forty subjects. */
            ...(deps.notify!.mailer
              ? { mailer: deps.notify!.mailer, ...await addressed(tenantId, db, app) }
              : {}),
          });
        },
      }
      : {}),
    /*
      ⚠️ THE SAME RESOLUTION A HANDLER READS, THROUGH THE SAME FUNCTION. A sweep
      governed by different numbers from the screen is a product that warns at
      thirty days and shows a list drawn at ninety, with nothing anywhere saying
      which is the workspace's answer.

      ⚠️ AND NO ACCOUNT, BECAUSE A JOB IS NOT A PERSON. `settingsFor` reads
      personal rows only when given an id, so a tenant job resolves personal
      settings to their declared fallback rather than to whoever happened to be
      first in the table.
    */
    settings: async ({ jobId, tenantId, db }) => {
      const app = of[jobId];
      return app ? settingsFor(db, tenantId, app, null) : {};
    },
    tenants: async () => {
      const rows = await deps.directory.prepare(
        `SELECT id FROM tenant WHERE closed_at IS NULL`).all<{ id: string }>();
      return rows.results.map((r) => r.id as TenantId);
    },
  });
};

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

/* --------------------------------------------------------------- storage --- */

/** ⚠️ A month, for proration. Not a calendar month — an average, so a February
    day does not cost more than a March one for the same bytes. */
const DAYS_IN_MONTH = 30;
const GB = 1024 * 1024 * 1024;

/**
 * WHAT EVERY WORKSPACE IS STORING, AND WHAT THE EXCESS COSTS.
 *
 * ⚠️ A METER, NOT A REFUSAL, AND THAT IS THE DESIGN. A seat and a domain are
 * things somebody adds deliberately, so refusing past the number is fair.
 * Storage accumulates as a side effect of ordinary work — refusing an upload
 * because a colleague filled the bucket punishes the wrong person for doing
 * their job, and it does it at the worst possible moment. So the included amount
 * is where the meter STARTS rather than where the product stops.
 *
 * ⚠️ AND IT NEVER DELETES ANYTHING. Not at the included amount, not when the
 * wallet empties, not ever. A product that deletes a customer's files to settle
 * a bill is one nobody can safely put anything in.
 *
 * ⚠️ WHAT AN EMPTY WALLET COSTS IS THE WRITES, and only the writes. The debt
 * stays owed, `locate` narrows the standing to read-only, and everything is
 * still there to read and to export — the same rung the unpaid-invoice ladder
 * starts on, for the same reason.
 *
 * ⚠️ AND UNLIMITED IS UNLIMITED. `-1` is a real answer every consumer knows, and
 * a meter that treated it as a number would charge the tiers that were sold as
 * having no limit.
 */
export async function sweepStorage(deps: SweepDeps): Promise<{ touched: number; detail: string }> {
  const now = (deps.now ?? (() => new Date()))();
  const plans = deps.plans ?? [];
  const rate = deps.storageRate ?? 0;
  if (!rate) return { touched: 0, detail: "no rate" };

  const rows = await deps.directory.prepare(
    `SELECT t.id AS tenant_id, s.plan_id AS plan_id
     FROM tenant t LEFT JOIN subscription s ON s.tenant_id = t.id
     WHERE t.closed_at IS NULL`).all<{ tenant_id: string; plan_id: string | null }>();

  let charged = 0;
  const said: string[] = [];

  for (const row of rows.results) {
    const tenantId = row.tenant_id as TenantId;
    const plan = plans.find((p) => p.id === row.plan_id)
      ?? plans.find((p) => p.parking);
    const included = plan?.includes.storage;
    /* ⚠️ Unlimited is unlimited, and a plan silent about storage is refused at
       boot — so a missing number here is a workspace nothing can price. */
    if (included === UNLIMITED || typeof included !== "number") continue;

    const db = await deps.shardOf(tenantId);
    /* ⚠️ A SHARD THIS DEPLOYMENT DOES NOT BIND IS SKIPPED, NOT CHARGED. Reading
       zero bytes off a database we cannot reach and calling it "under the
       limit" is a meter that silently stops metering. */
    if (!db) { said.push(`${tenantId}: no shard`); continue; }

    const used = await bytesUsed(db, tenantId);
    const over = used - included;
    if (over <= 0) continue;

    /* ⚠️ THOUSANDTHS, because a day of a few hundred megabytes over is a
       fraction of a credit — see `owe`. */
    const milli = (over / GB) * rate * MILLI / DAYS_IN_MONTH;
    await owe(deps.directory, tenantId, milli);

    const took = await collectOwed(deps.directory, tenantId, "Storage over your plan", now);
    if (took > 0) charged++;

    const wallet = await walletOf(deps.directory, tenantId);
    said.push(`${tenantId}: ${Math.round(over / GB * 100) / 100}GB over`
      + (wallet.owing ? ", unpaid" : ""));
  }

  return { touched: charged, detail: said.join("; ") || "nothing to do" };
}

/* ------------------------------------------------------------ allowances --- */

/**
 * THE MONTHLY ALLOWANCE FOR EVERY WORKSPACE NOBODY IS BILLING.
 *
 * ⚠️ A PAYING WORKSPACE IS NOT HERE, AND MUST NOT BE. Its allowance is granted
 * by `invoice.paid`, on Stripe's own period boundary; renewing it here as well
 * would set the same number on a second, drifting day of the month — harmless
 * while the two agree and a support conversation the first time somebody watches
 * their credits reset twice.
 *
 * ⚠️ AND `renewAllowance` SETS RATHER THAN ADDS, so a pass that runs twice in a
 * day is a no-op rather than a double grant. That is what makes this safe to
 * re-run after a failure, which is the property every sweep here is written for.
 */
export async function sweepAllowances(deps: SweepDeps): Promise<{ touched: number; detail: string }> {
  const now = (deps.now ?? (() => new Date()))();
  const plans = deps.plans ?? [];

  let granted = 0;
  const said: string[] = [];

  for (const one of await compedSubscriptions(deps.directory)) {
    if (!await dueForAllowance(deps.directory, one.tenantId, now)) continue;
    const credits = await renewAllowance(deps.directory, one.tenantId, plans, now);
    granted++;
    said.push(`${one.tenantId}: ${credits}`);
  }

  return { touched: granted, detail: said.join("; ") || "nothing to do" };
}
