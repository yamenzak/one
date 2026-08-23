/**
 * WHAT THE DEPLOYMENT HAS MADE, WHAT IT STILL OWES, AND WHAT IT IS ABOUT TO
 * THROW AWAY.
 *
 * ⚠️ PROVISIONING IS A LADDER, NOT A CALL, and the reason is a property of the
 * platform rather than a preference. Adding a binding produces a NEW VERSION of
 * the worker; the isolate that asked for it is running the old one and cannot
 * see it. A reconciler that marked a resource usable after a successful patch
 * would be reporting a binding that reads `undefined` for however long the
 * rollout takes — and `undefined` is not an error, it is an empty answer, which
 * is the failure mode every guard in this repository exists to catch.
 *
 * ⚠️ SO `live` IS ONLY EVER WRITTEN BY AN ISOLATE THAT CAN SEE THE BINDING. That
 * is `observe`, it runs at boot, and it is the one honest confirmation available
 * — everything else is a claim about what should have happened.
 *
 * ⚠️ AND NOTHING IS DELETED ON THE PASS THAT NOTICES IT IS UNWANTED. An app
 * removed from a deployment by a typo would otherwise take its database with it,
 * in the same minute, with a green log line. A resource drains for
 * `DRAIN_DAYS` and is reaped afterwards, by a different pass, which is the only
 * shape of this that survives a bad edit.
 *
 * ⚠️ THE ROW IS THE AUTHORITY ON WHAT WE MADE, NOT CLOUDFLARE'S LIST. A list is
 * what exists on the account, including things people made by hand; this table
 * is what THIS DEPLOYMENT created and is therefore what it may destroy. The
 * reaper reads this and never that, so a bucket somebody made in the dashboard
 * is never something the sweep deletes at three in the morning.
 */

import type { AppSpec, NeedDef, Residency, ResourceKind, ResourceState, Shard } from "@engine/kernel";
import {
  DRAIN_DAYS, IS_CREATED, KEEPS_RESIDENCY, LIVE_STATES,
  bindingName, dayOf, instant, needsOf, newId, resourceName, shardsWanted,
} from "@engine/kernel";
import { bindingFor } from "./handles.js";
import type { Account, WireBinding } from "./cloudflare.js";
import { create, destroy, listRemote, patchBindings } from "./cloudflare.js";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

export const RESOURCE_SCHEMA: SchemaModule = {
  id: "resources",
  statements: [
    /* ⚠️ UNIQUE ON THE NAME, because the name is derived and the name is the
       identity. Two rows for one resource is two lifecycles over one database,
       and the second one's reaper deletes what the first one is still using. */
    `CREATE TABLE IF NOT EXISTS resource (id TEXT PRIMARY KEY, kind TEXT NOT NULL, app_id TEXT NOT NULL, need_id TEXT NOT NULL, name TEXT NOT NULL, binding TEXT NOT NULL, residency TEXT, remote_id TEXT, state TEXT NOT NULL, detail TEXT, at TEXT NOT NULL, live_at TEXT, drain_after TEXT, gone_at TEXT);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ix_resource_name ON resource (name);`,
    `CREATE INDEX IF NOT EXISTS ix_resource_state ON resource (state);`,
  ],
};

/* ------------------------------------------------------------------- rows --- */

export interface ResourceRow {
  readonly id: string;
  readonly kind: ResourceKind;
  readonly appId: string;
  readonly needId: string;
  readonly name: string;
  readonly binding: string;
  readonly residency: Residency | null;
  readonly remoteId: string | null;
  readonly state: ResourceState;
  readonly detail: string | null;
  readonly drainAfter: string | null;
}

const asRow = (r: Record<string, unknown>): ResourceRow => ({
  id: r.id as string, kind: r.kind as ResourceKind, appId: r.app_id as string,
  needId: r.need_id as string, name: r.name as string, binding: r.binding as string,
  residency: (r.residency as Residency | null) ?? null,
  remoteId: (r.remote_id as string | null) ?? null,
  state: r.state as ResourceState, detail: (r.detail as string | null) ?? null,
  drainAfter: (r.drain_after as string | null) ?? null,
});

export async function resources(db: Db): Promise<readonly ResourceRow[]> {
  const out = await db.prepare(`SELECT * FROM resource ORDER BY name`).all<Record<string, unknown>>();
  return out.results.map(asRow);
}

const setState = async (
  db: Db, id: string, state: ResourceState, extra: Record<string, unknown> = {},
): Promise<void> => {
  const keys = Object.keys(extra);
  await db.prepare(
    `UPDATE resource SET state = ?${keys.map((k) => `, ${k} = ?`).join("")} WHERE id = ?`)
    .bind(state, ...keys.map((k) => extra[k]), id).run();
};

/* ------------------------------------------------------------------ wants --- */

/** One thing that ought to exist, derived from a manifest and a residency. */
export interface Want {
  readonly kind: ResourceKind;
  readonly appId: string;
  readonly need: NeedDef;
  readonly name: string;
  readonly binding: string;
  readonly residency: Residency | null;
}

/**
 * EVERYTHING THIS DEPLOYMENT OUGHT TO HAVE, DERIVED.
 *
 * ⚠️ A NEED THAT CANNOT KEEP THE RESIDENCY IS DROPPED FOR THAT RESIDENCY AND
 * KEPT FOR THE OTHERS, which is the whole design in one line. The alternative
 * readings are both wrong: refusing it everywhere takes a working feature away
 * from workspaces that were never promised anything, and allowing it everywhere
 * is the broken promise. What actually happens is that the feature does not
 * exist in the EU — a shape a product can see, refuse against and explain,
 * rather than a sentence in a privacy notice that is not true.
 */
/**
 * ⚠️ THE PLATFORM'S OWN NEED, AND IT IS NOT AN APP'S. A shard holds every
 * workspace's records for a jurisdiction, so its holding is whatever the worst
 * app stores — `sensitive`, necessarily, and therefore one database per
 * jurisdiction IN that jurisdiction. Declared here rather than in a manifest
 * because no product asks for it: it is what the deployment stands on.
 */
const SHARD_NEED: NeedDef = {
  id: "shard", kind: "d1", perResidency: true, holds: "sensitive",
  why: "Holds the records of every workspace placed in this jurisdiction.",
};

/**
 * ⚠️ THE NAME AND THE BINDING ARE THE SHARD'S OWN, NOT `resourceName`'s. A shard
 * is addressed by `bindingFor` on every request — `SHARD_EU_1`, derived from the
 * id the directory places tenants on — so a resource named by the app-shaped
 * rule would create a database under one name and be read under another. That is
 * `undefined` at the first request and nothing at all before it.
 */
const shardWant = (deployment: string, id: string, where: Residency): Want => ({
  kind: "d1", appId: "platform", need: SHARD_NEED,
  name: `${deployment}-shard-${id}`, binding: bindingFor(id), residency: where,
});

export function wanted(
  deployment: string, apps: readonly AppSpec[], serves: readonly Residency[],
  /**
   * ⚠️ WHAT THE DIRECTORY ALREADY PLACES ON, so capacity can be wanted before it
   * runs out. Absent, this reconciles the apps' stores and nothing else — which
   * is what it did, and why a full deployment turned away signups rather than
   * building the next database.
   */
  shards: readonly Shard[] = [],
  /** ⚠️ Workspaces waiting on a database of their own — see `shardsWanted`. */
  alone: readonly { readonly where: Residency }[] = [],
): readonly Want[] {
  const out: Want[] = [];
  /*
    ⚠️ THE SHARDS FIRST, because a shard is what everything else is placed on and
    a plan read by a person should say so before it lists a product's buckets.
  */
  for (const s of shards) out.push(shardWant(deployment, s.id, s.where));
  for (const s of shardsWanted(shards, serves, alone)) {
    out.push(shardWant(deployment, s.id, s.where));
  }
  for (const app of apps) {
    /* ⚠️ `needsOf`, NOT `app.needs` — a media field implies a bucket nobody
       declared, and reading the raw declaration provisions nothing for it. */
    for (const need of Object.values(needsOf(app))) {
      if (!IS_CREATED[need.kind]) continue;
      const wheres: (Residency | null)[] = need.perResidency ? [...serves] : [null];
      for (const where of wheres) {
        const promised = where !== null && where !== "global";
        if (promised && need.holds !== "none" && !KEEPS_RESIDENCY[need.kind]) continue;
        out.push({
          kind: need.kind, appId: app.id, need,
          name: resourceName(deployment, app.id, need, where),
          binding: bindingName(app.id, need, where),
          residency: where,
        });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------- plan --- */

export type Step =
  | { readonly do: "create"; readonly want: Want }
  | { readonly do: "bind"; readonly want: Want; readonly remoteId: string }
  | { readonly do: "drain"; readonly row: ResourceRow }
  | { readonly do: "reap"; readonly row: ResourceRow };

/**
 * WHAT AN APPLY WOULD DO, WITHOUT DOING ANY OF IT.
 *
 * ⚠️ SEPARATE FROM `apply` ON PURPOSE, AND THE OPERATOR SEES THIS FIRST. Every
 * destructive step in this system is at the far end of a thirty-day window, so
 * the plan is where a mistake is still free — a `drain` on a database with
 * customers on it is a sentence somebody can read a month before it becomes a
 * deletion.
 */
export function plan(
  want: readonly Want[], have: readonly ResourceRow[], now = new Date(),
): readonly Step[] {
  const steps: Step[] = [];
  const byName = new Map(have.map((r) => [r.name, r]));

  for (const w of want) {
    const row = byName.get(w.name);
    if (!row) { steps.push({ do: "create", want: w }); continue; }
    /* ⚠️ A DRAINING RESOURCE THAT IS WANTED AGAIN COMES BACK rather than being
       made a second time — the drain window is exactly the period in which
       undoing the mistake has to be free. */
    if (row.state === "draining" && row.remoteId) {
      steps.push({ do: "bind", want: w, remoteId: row.remoteId });
      continue;
    }
    if (row.state === "created" && row.remoteId) {
      steps.push({ do: "bind", want: w, remoteId: row.remoteId });
    }
  }

  const keep = new Set(want.map((w) => w.name));
  for (const row of have) {
    if (!keep.has(row.name) && LIVE_STATES.includes(row.state)) {
      steps.push({ do: "drain", row });
    }
    if (row.state === "draining" && !keep.has(row.name)
      && row.drainAfter && row.drainAfter <= now.toISOString()) {
      steps.push({ do: "reap", row });
    }
  }
  return steps;
}

/* ------------------------------------------------------------------ apply --- */

export interface ApplyDeps {
  readonly directory: Db;
  readonly at: Account;
  readonly deployment: string;
  readonly apps: readonly AppSpec[];
  readonly serves: readonly Residency[];
  /**
   * ⚠️ WHAT THE DIRECTORY PLACES ON, AND IT IS REQUIRED. A deployment running out
   * of room has to build the next database rather than turn away signups, and an
   * optional dependency is one somebody forgets — which here degrades in silence:
   * `shardsWanted` would see an empty list for ever, want the first shard for
   * ever, find it already made, and do nothing while the deployment fills up.
   * That is the shape this whole change exists to remove.
   */
  readonly shards: () => Promise<readonly Shard[]>;
  /**
   * ⚠️ WHO HAS ASKED TO BE ALONE AND IS STILL WAITING — see `waitingAlone`. An
   * isolation request is a reason to build a database exactly as running low is,
   * and it has to be built before anybody can be moved onto it.
   *
   * ⚠️ REQUIRED, FOR THE SAME REASON `shards` IS. Left optional, a deployment
   * that did not pass it would reconcile perfectly and never build an isolation
   * shard — the ask sitting in a column, the nightly pass reporting success, and
   * nothing anywhere saying which of the two halves was missing.
   */
  readonly alone: () => Promise<readonly { readonly where: Residency }[]>;
  readonly now?: () => Date;
}

export interface Reconciled {
  readonly did: readonly string[];
  readonly refused: readonly string[];
}

/** What a live resource looks like as a binding on the wire. */
const asBinding = (row: { kind: ResourceKind; binding: string; name: string; remoteId: string; residency: Residency | null }): WireBinding | null => {
  switch (row.kind) {
    case "d1": return { type: "d1", name: row.binding, id: row.remoteId };
    case "kv": return { type: "kv_namespace", name: row.binding, namespace_id: row.remoteId };
    case "r2": return {
      type: "r2_bucket", name: row.binding, bucket_name: row.name,
      ...(row.residency === "eu" ? { jurisdiction: "eu" } : {}),
    };
    case "queue": return { type: "queue", name: row.binding, queue_name: row.name };
    default: return null;
  }
};

/**
 * MAKE WHAT IS MISSING, AND ASK FOR IT TO BE BOUND.
 *
 * ⚠️ THE ROW IS WRITTEN BEFORE THE RESOURCE IS MADE, and it has to be. The other
 * order loses a database on any failure between the call and the insert: it
 * exists on the account, nothing here knows its name, the next pass makes
 * another, and the orphan is never reaped because the reaper only reads this
 * table. `creating` is the state that says "we may have made this" — and it is
 * reconciled against the real list, not assumed.
 *
 * ⚠️ AND A FAILED LIST STOPS THE PASS. Creating on the basis of a list that
 * errored is how duplicates get made.
 */
export async function apply(deps: ApplyDeps): Promise<Reconciled> {
  const now = deps.now?.() ?? new Date();
  const did: string[] = [];
  const refused: string[] = [];

  const want = wanted(deps.deployment, deps.apps, deps.serves,
    await deps.shards(), await deps.alone());
  const have = await resources(deps.directory);
  const steps = plan(want, have, now);

  /* One list per kind, once, so a pass creating six things asks six times about
     nothing. A kind nothing needs is never listed at all. */
  const listed = new Map<ResourceKind, Map<string, string>>();
  const known = async (kind: ResourceKind): Promise<Map<string, string> | null> => {
    if (listed.has(kind)) return listed.get(kind)!;
    const out = await listRemote(deps.at, kind);
    if (!out.ok) { refused.push(`${kind}: ${out.why}`); return null; }
    const m = new Map(out.value.map((r) => [r.name, r.id]));
    listed.set(kind, m);
    return m;
  };

  const bind: Want[] = [];
  const remoteOf = new Map<string, string>();

  for (const step of steps) {
    if (step.do === "create") {
      const already = await known(step.want.kind);
      if (!already) continue;

      const id = newId("res", now);
      await deps.directory.prepare(
        `INSERT INTO resource (id, kind, app_id, need_id, name, binding, residency, state, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'creating', ?) ON CONFLICT(name) DO NOTHING`)
        .bind(id, step.want.kind, step.want.appId, step.want.need.id, step.want.name,
          step.want.binding, step.want.residency, now.toISOString()).run();

      /* ⚠️ ADOPTED RATHER THAN DUPLICATED. A resource with our derived name
         already on the account is one a previous pass made and failed to record
         — making a second is the exact fault the derived name exists to stop. */
      let remoteId = already.get(step.want.name) ?? null;
      if (!remoteId) {
        const made = await create(deps.at, step.want.kind, step.want.name, step.want.residency);
        if (!made.ok) {
          await deps.directory.prepare(`UPDATE resource SET state = 'failed', detail = ? WHERE name = ?`)
            .bind(made.why, step.want.name).run();
          refused.push(`${step.want.name}: ${made.why}`);
          continue;
        }
        remoteId = made.value.id;
        did.push(`created ${step.want.name}`);
      } else {
        did.push(`adopted ${step.want.name}`);
      }

      await deps.directory.prepare(
        `UPDATE resource SET state = 'created', remote_id = ?, detail = NULL WHERE name = ?`)
        .bind(remoteId, step.want.name).run();
      bind.push(step.want);
      remoteOf.set(step.want.name, remoteId);
    }

    if (step.do === "bind") { bind.push(step.want); remoteOf.set(step.want.name, step.remoteId); }

    if (step.do === "drain") {
      const after = new Date(now.getTime() + DRAIN_DAYS * 24 * 60 * 60 * 1000);
      await setState(deps.directory, step.row.id, "draining", { drain_after: after.toISOString() });
      did.push(`draining ${step.row.name} until ${dayOf(instant(after))}`);
    }

    if (step.do === "reap") {
      if (!step.row.remoteId) { await setState(deps.directory, step.row.id, "gone"); continue; }
      const done = await destroy(deps.at, step.row.kind, step.row.remoteId);
      if (!done.ok) { refused.push(`${step.row.name}: ${done.why}`); continue; }
      await setState(deps.directory, step.row.id, "gone", { gone_at: now.toISOString() });
      did.push(`destroyed ${step.row.name}`);
    }
  }

  /* ⚠️ ONE PATCH FOR EVERYTHING, because each one is a new version of the
     worker — six patches is six rollouts for one reconciliation. */
  if (bind.length) {
    const wire = bind.map((w) => asBinding({
      kind: w.kind, binding: w.binding, name: w.name,
      remoteId: remoteOf.get(w.name)!, residency: w.residency,
    })).filter((b): b is WireBinding => !!b);

    const patched = await patchBindings(deps.at, wire);
    if (!patched.ok) refused.push(`bindings: ${patched.why}`);
    else {
      for (const w of bind) {
        /*
          ⚠️ AND `drain_after` IS CLEARED, WHICH IS THE HALF THAT WOULD HAVE
          BITTEN LATER. A resource wanted again is reached through the same bind
          step, and leaving its drain date in place gives it a working binding
          and a deletion thirty days out — the mistake looks fixed, the product
          works, and the database disappears a month after anybody was watching.

          ⚠️ `draining` MOVES HERE TOO. Only `created` did, so a revived resource
          stayed draining for ever: bound, serving, and reaped on schedule.
        */
        await deps.directory.prepare(
          `UPDATE resource SET state = 'bound', drain_after = NULL
           WHERE name = ? AND state IN ('created', 'draining')`)
          .bind(w.name).run();
      }
      if (patched.value.added.length) did.push(`bound ${patched.value.added.join(", ")}`);
    }
  }

  return { did, refused };
}

/* ---------------------------------------------------------------- observe --- */

/**
 * THE ONE HONEST CONFIRMATION: an isolate that can actually see the binding.
 *
 * ⚠️ RUN AT BOOT, WHERE A NEW VERSION IS BY DEFINITION RUNNING. Everything else
 * in this file is a claim about what should have happened; this is the only
 * thing that knows. A resource stuck at `bound` across several deploys is a
 * patch that reported success and produced no usable binding — which is exactly
 * the failure this whole ladder was built to make visible.
 */
/**
 * ONE READ OF THE LEDGER, AND BOTH ANSWERS OUT OF IT.
 *
 * ⚠️ `observe` AND `liveBindings` EACH READ THE SAME TABLE, one after the other,
 * on the way to answering the first request an isolate ever serves. Neither is
 * expensive; the pair is one round trip that buys nothing, and this boot is a
 * list of those.
 *
 * ⚠️ A ROW FLIPPED IN THIS PASS COUNTS AS LIVE, which is why they were in that
 * order. The binding is in `env` right now — that is what the flip observed —
 * so making the caller wait for a second read to admit it would be a resource
 * that works and reads as absent for one isolate.
 */
/**
 * ⚠️ AND THE LEDGER IS A PARAMETER, BECAUSE THE BOOT HAS ALREADY READ IT. The
 * paragraph above is about the two reads INSIDE this function; the boot that
 * calls it reads the same table one wave earlier to find the shards the
 * reconciler has grown, so merging those two left a third. Measured on a settled
 * database, `SELECT * FROM resource ORDER BY name` went out twice, one after the
 * other, before any request could be answered — a whole round trip, on every
 * cold isolate, for bytes the caller was holding.
 */
export async function settleBindings(
  db: Db, env: Readonly<Record<string, unknown>>,
  rows?: readonly ResourceRow[], now = new Date(),
): Promise<{ readonly said: readonly string[]; readonly live: ReadonlyMap<string, unknown> }> {
  const said: string[] = [];
  const live = new Map<string, unknown>();

  for (const row of rows ?? await resources(db)) {
    const held = env[row.binding];
    /* ⚠️ `bound` means asked for and not yet confirmed; an isolate that can SEE
       the binding is the only thing that can confirm it. */
    const became = row.state === "bound" && held !== undefined;
    if (became) {
      await setState(db, row.id, "live", { live_at: now.toISOString() });
      said.push(`${row.binding} is live`);
    }
    /* ⚠️ AND ONLY `live` COUNTS. Handing out a merely-bound binding hands out
       `undefined`, which reads as "this deployment has no bucket". */
    if ((became || row.state === "live") && held !== undefined) {
      live.set(bindingKey(row.appId, row.needId, row.residency), held);
    }
  }
  return { said, live };
}

export async function observe(
  db: Db, env: Readonly<Record<string, unknown>>, now = new Date(),
): Promise<readonly string[]> {
  const said: string[] = [];
  for (const row of await resources(db)) {
    if (row.state === "bound" && env[row.binding]) {
      await setState(db, row.id, "live", { live_at: now.toISOString() });
      said.push(`${row.binding} is live`);
    }
  }
  return said;
}

/**
 * THE LIVE BINDINGS, BY APP AND NEED, RESOLVED ONCE PER ISOLATE.
 *
 * ⚠️ CACHING THIS IS NOT AN OPTIMISATION, IT IS CORRECT BY CONSTRUCTION. A
 * binding cannot appear or change without a new version of the worker, and a new
 * version is a new isolate — so a map built at boot is exactly as fresh as `env`
 * itself, for the whole life of the isolate. Re-reading it per request would put
 * a directory round trip in front of every upload to learn something that cannot
 * have changed.
 *
 * ⚠️ AND `live` IS THE ONLY STATE THAT COUNTS. A resource that is merely `bound`
 * has been asked for and not yet confirmed; handing its binding out would hand
 * out `undefined`, which reads as "this deployment has no bucket" rather than as
 * an error — the honest answer while it is on its way.
 */
export async function liveBindings(
  db: Db, env: Readonly<Record<string, unknown>>,
): Promise<ReadonlyMap<string, unknown>> {
  const out = new Map<string, unknown>();
  for (const row of await resources(db)) {
    if (row.state !== "live") continue;
    const held = env[row.binding];
    if (held !== undefined) out.set(bindingKey(row.appId, row.needId, row.residency), held);
  }
  return out;
}

/**
 * ⚠️ THE RESIDENCY IS PART OF THE KEY, AND LEAVING IT OUT WAS A REAL BUG. A
 * `perResidency` need is one row per jurisdiction and every one of them carries
 * the SAME need id — so keyed on `app:need` alone, two rows collapse onto one
 * entry and whichever is read last wins for everybody. An EU workspace then
 * resolves the global bucket: both work, both uploads succeed, and one
 * workspace's files are simply in the wrong regime, discovered by a regulator or
 * by nobody.
 *
 * ⚠️ IT WAS INVISIBLE WITH ONE JURISDICTION, which is exactly why it had to be
 * found before a second one exists rather than after. A deployment serving only
 * `eu` has one row, the collision cannot happen, and every test passes.
 */
export const bindingKey = (
  appId: string, needId: string, residency: string | null = null,
): string => `${appId}:${needId}:${residency ?? "any"}`;
