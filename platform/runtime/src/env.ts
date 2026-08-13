/**
 * THE BINDING CHOKEPOINT — the only file in the platform that touches a raw
 * environment.
 *
 * ⚠️ EVERYTHING ELSE RECEIVES HANDLES. A handler that reached the environment
 * directly would be writing a query that hits the wrong continent the day a
 * second region exists, and nothing in the system would notice: the query
 * succeeds, against the wrong database, returning somebody else's absence of
 * rows. `scripts/binding-chokepoint.test.mjs` is what keeps this the only door.
 *
 * The shapes below are declared STRUCTURALLY rather than imported from a
 * vendor's type package. Two reasons, and the second is the load-bearing one:
 * the runtime uses a small fraction of each API and saying which fraction is
 * useful documentation; and a structural minimum is satisfiable by a fake, so
 * the pipeline above it is testable without a runtime at all.
 */

import type {
  ActorHandle, BindingSpec, CacheHandle, CacheNamespace, Handle, InferenceHandle,
  GlobalSql, ObjectHandle, QueueHandle, RegionId, ResolvedBindings, ResolvedRegion, SqlHandle, Store,
} from "@one/kernel";

/* ------------------------------------------------------------- the shapes --- */

interface RawStatement { bind(...v: readonly unknown[]): RawStatement; all<T>(): Promise<{ results: T[] }>; first<T>(): Promise<T | null>; run(): Promise<unknown> }
export interface RawSql { prepare(sql: string): RawStatement; batch(s: readonly RawStatement[]): Promise<unknown>; exec(sql: string): Promise<unknown> }
export interface RawObjects { put(k: string, v: ArrayBuffer | ReadableStream, o?: { httpMetadata?: { contentType?: string } }): Promise<unknown>; get(k: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>; delete(k: string): Promise<void> }
export interface RawCache { get(k: string): Promise<string | null>; put(k: string, v: string, o?: { expirationTtl?: number }): Promise<void>; delete(k: string): Promise<void> }
export interface RawActors { idFromName(n: string): unknown; get(id: unknown): { fetch(r: Request): Promise<Response> }; jurisdiction?(j: string): RawActors }
export interface RawInference { run(model: string, input: unknown): Promise<unknown> }
export interface RawQueue { send(body: unknown): Promise<void> }

export type RawEnv = Readonly<Record<string, unknown>>;

/* ------------------------------------------------------------------ names --- */

/**
 * Which physical binding a logical store resolves to, in one region.
 *
 * ⚠️ THE DEFAULT REGION KEEPS THE BARE NAME, and that is not cosmetic. Suffixing
 * every region would mean adding the second one RENAMES the first — a change to
 * a live worker's bindings, applied at deploy, where getting it wrong takes the
 * product down rather than degrading a feature. Additive is the only safe shape:
 * `DB` exists from the first day and `DB_EU` appears beside it.
 */
export function physicalName(logical: string, store: Store, region: RegionId, defaultRegion: RegionId): string {
  const base = logical.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
  return store.regional && region !== defaultRegion ? `${base}_${region.toUpperCase()}` : base;
}

export class BindingMissing extends Error {
  constructor(readonly logical: string, readonly physical: string, readonly region: RegionId) {
    super(`no binding "${physical}" for "${logical}" in region "${region}"`);
    this.name = "BindingMissing";
  }
}

/* ---------------------------------------------------------------- wrappers --- */

const sqlHandle = (raw: RawSql): SqlHandle => ({
  async all<T>(sql: string, ...params: readonly unknown[]) {
    return (await raw.prepare(sql).bind(...params).all<T>()).results ?? [];
  },
  first<T>(sql: string, ...params: readonly unknown[]) {
    return raw.prepare(sql).bind(...params).first<T>();
  },
  async run(sql: string, ...params: readonly unknown[]) {
    await raw.prepare(sql).bind(...params).run();
  },
  /*
    ⚠️ DDL ARRIVES AS ONE CALL, and the schema runner depends on it. Statements
    applied one at a time leave a database half-composed when the fifth fails —
    a state no marker describes, on a database that then reports a version it
    does not have.
  */
  async batch(statements: readonly string[]) {
    await raw.batch(statements.map((s) => raw.prepare(s)));
  },
});

const objectHandle = (raw: RawObjects): ObjectHandle => ({
  async put(key, body, contentType) {
    await raw.put(key, body, { httpMetadata: { contentType } });
    return key;
  },
  async get(key) {
    const o = await raw.get(key);
    return o ? await o.arrayBuffer() : null;
  },
  delete: (key) => raw.delete(key),
});

/**
 * ⚠️ THE NAMESPACE IS PART OF THE KEY, so a cache write states which of the
 * three declared spaces it belongs to. A globally-replicated store with a
 * free-form key space is one where a tenant's data eventually lands and no
 * residency claim survives; prefixing makes the space auditable by reading it.
 */
const cacheHandle = (raw: RawCache): CacheHandle => {
  const k = (ns: CacheNamespace, key: string) => `${ns}:${key}`;
  return {
    get: (ns, key) => raw.get(k(ns, key)),
    put: (ns, key, value, ttlSeconds) => raw.put(k(ns, key), value, ttlSeconds ? { expirationTtl: ttlSeconds } : undefined),
    delete: (ns, key) => raw.delete(k(ns, key)),
  };
};

/**
 * ⚠️ A DURABLE ACTOR PICKS ITS JURISDICTION AT CALL TIME, on one namespace —
 * which is why actor bindings do not multiply by region the way a database does.
 * The consequence to know: a jurisdiction-scoped namespace mints DIFFERENT ids
 * for the same name, so an actor created under one cannot be reached from the
 * other. That is a relocation, not a lookup.
 */
const actorHandle = (raw: RawActors, region: RegionId, jurisdictional: boolean): ActorHandle => {
  const ns = jurisdictional && region !== "auto" && raw.jurisdiction ? raw.jurisdiction(region) : raw;
  return { for: (name) => ns.get(ns.idFromName(name)) };
};

/* ----------------------------------------------------------------- resolve --- */

export interface RegionalConfig {
  readonly defaultRegion: RegionId;
}

/**
 * Turn a declaration plus a raw environment into handles, for ONE region.
 *
 * ⚠️ IT TAKES A `ResolvedRegion`, WHICH ONLY `resolveRegion` CAN MINT. A handler
 * cannot guess a region, default to one, or read one from a header — it can only
 * be handed the one its request resolved to. In the previous generation this
 * rule was a lint over source text; here it is the type system, and the lint
 * only has to watch this one file.
 *
 * ⚠️ A MISSING BINDING THROWS. The tempting alternative — resolve what exists
 * and let the handler find out — turns a provisioning gap into
 * `Cannot read properties of undefined`, thrown from whichever query happens to
 * run first, which names neither the region nor the store.
 */
export function bindingsFor<B extends BindingSpec>(
  spec: B, env: RawEnv, cfg: RegionalConfig,
): (region: ResolvedRegion) => ResolvedBindings<B> {
  return (region) => {
    const out: Record<string, unknown> = {};
    for (const [logical, store] of Object.entries(spec)) {
      const physical = physicalName(logical, store, region, cfg.defaultRegion);
      const raw = env[physical];
      /*
        ⚠️ ONE KIND OF STORE MAY BE ABSENT, AND ONLY WHERE IT SAYS SO. A missing
        database is a broken deployment; a missing model runner is a deployment
        that does not generate, which is a real and supported configuration —
        a self-host, or anything before somebody has bought credits. It resolves
        to nothing, every generation refuses, and nothing substitutes an answer.
      */
      if (!raw && store.kind === "inference" && store.optional) continue;
      if (!raw) throw new BindingMissing(logical, physical, region);
      out[logical] = wrap(store, raw, region, cfg);
    }
    return out as ResolvedBindings<B>;
  };
}

/**
 * The GLOBAL store behind a named binding — the directory, and nothing else.
 *
 * ⚠️ IT EXISTS BECAUSE THE DIRECTORY CANNOT GO THROUGH THE RESOLVER. The
 * resolver needs a region and the directory is what answers the region, so
 * there is one store the pipeline must reach before it knows anything. Putting
 * that here rather than in the pipeline keeps the count of files that index an
 * environment at one, which is the entire value of a chokepoint.
 */
export function globalSql(env: RawEnv, binding: string): GlobalSql | null {
  const raw = env[binding];
  /*
    ⚠️ THE ONE PLACE A GLOBAL HANDLE IS MINTED, and the cast is what makes it so.
    `GlobalSql` is a `SqlHandle` the type system can tell apart, so a function
    that must never receive the shared store can say so — see the type's own
    header for the swap it exists to refuse.
  */
  return raw ? (sqlHandle(raw as RawSql) as GlobalSql) : null;
}

function wrap(store: Store, raw: unknown, region: RegionId, cfg: RegionalConfig): Handle<Store> {
  switch (store.kind) {
    case "sql": return sqlHandle(raw as RawSql) as Handle<Store>;
    case "objects": return objectHandle(raw as RawObjects) as Handle<Store>;
    case "cache": return cacheHandle(raw as RawCache) as Handle<Store>;
    case "actor": return actorHandle(raw as RawActors, region, store.jurisdictional) as Handle<Store>;
    case "inference": {
      /*
        ⚠️ RESIDENCY IS NOT ONLY STORAGE. A region carries a sub-processor
        allow-list, so an EU tenant may resolve a narrower — or empty — set. The
        handle reports it rather than the caller looking it up, because a caller
        that has to remember to check is a caller that will not.
      */
      /*
        ⚠️ THE BINDING'S OWN MAP, NOT A RUNTIME OPTION. This read
        `cfg.subprocessors?.[region]`, which no caller ever supplied — so the
        allow-list silently resolved to the app-wide set in every region and
        residency stopped at storage. It is declared beside the models now, and
        a region with no entry is refused at composition rather than defaulted.
      */
      const permitted = store.byRegion?.[region] ?? store.subprocessors;
      const inner = raw as RawInference;
      const h: InferenceHandle = {
        permitted,
        run: (model, input) => inner.run(model, input),
      };
      return h as Handle<Store>;
    }
    case "queue": {
      const inner = raw as RawQueue;
      const h: QueueHandle = { send: (body) => inner.send(body) };
      return h as Handle<Store>;
    }
  }
}

/**
 * A plain secret from the deployment's own variables.
 *
 * ⚠️ IT LIVES HERE BECAUSE THIS IS THE ONLY FILE ALLOWED TO READ A RAW
 * ENVIRONMENT, and a payment provider's signing secret is not a binding — it is
 * a string, with no handle, no region and nothing to resolve. Reading it inline
 * wherever it was needed would put the one thing this package exists to
 * centralise back in three files.
 *
 * Absent returns `""`, which every caller already reads as "not configured" —
 * and for the webhook secret specifically, "not configured" means REFUSE.
 */
export const secretFor = (env: RawEnv, name: string): string => {
  const value = (env as Record<string, unknown>)[name];
  return typeof value === "string" ? value : "";
};
