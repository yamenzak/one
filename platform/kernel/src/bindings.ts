/**
 * WHAT THE RUNTIME PROVIDES — declared logically, resolved regionally.
 *
 * Layer 1. Imports primitives only.
 *
 * An app declares `db`, not `DB`. The framework resolves which physical store
 * that is from the tenant's region, per request, so a handler can never reach
 * the wrong continent — and never has to know there are continents.
 *
 * ⚠️ The rule this file exists to enforce: NO HANDLER EVER SEES A RAW BINDING.
 * A query written against `env.DB` is a query that will hit the wrong region the
 * day a second one exists, and nothing else in the system would notice.
 */

import type { RegionId } from "./primitives.js";

/* ---------------------------------------------------------------- stores --- */

export type StoreKind = "sql" | "objects" | "cache" | "actor" | "inference" | "queue";

interface StoreCommon {
  readonly kind: StoreKind;
  /**
   * One instance per region. False means a single global instance, which is
   * only correct for something holding no tenant data at all.
   */
  readonly regional: boolean;
}

export interface SqlStore extends StoreCommon {
  readonly kind: "sql";
  readonly regional: true;
  /** Read replicas. ⚠️ A replica outside the region is the transfer you sold against. */
  readonly replicas?: readonly RegionId[];
}

export interface ObjectStore extends StoreCommon {
  readonly kind: "objects";
  readonly regional: true;
  /**
   * ⚠️ A JURISDICTION IS NOT A LOCATION HINT. One is a contractual guarantee
   * that data does not leave; the other is best-effort placement. They look
   * alike in a config file and differ in a DPA — declare which you mean.
   */
  readonly jurisdictional: boolean;
  /**
   * Keys are content hashes, so one object may be referenced by many tenants.
   * The accounting is per tenant; the bytes are stored once. Relocation must
   * COPY such an object, never move it.
   */
  readonly contentAddressed?: boolean;
}

/**
 * ⚠️ A CACHE IS GLOBALLY REPLICATED AND CANNOT BE REGIONALISED.
 *
 * Cloudflare KV replicates to every point of presence by design, with no
 * jurisdiction option. So a cache may hold routing data, ephemeral codes and
 * operator configuration — and may never hold anything personal, for any tenant,
 * because "in the EU" and "in every PoP on earth" are not compatible claims.
 *
 * `personal` is typed `false` rather than `boolean`: declaring a cache that
 * holds personal data does not compile. That is the strongest form the rule can
 * take, and it is cheaper than the review that would otherwise have to catch it.
 */
export interface CacheStore extends StoreCommon {
  readonly kind: "cache";
  readonly regional: false;
  readonly personal: false;
}

export interface ActorStore extends StoreCommon {
  readonly kind: "actor";
  readonly regional: true;
  /** The class name. ⚠️ Load-bearing: migrations bind it to durable storage. */
  readonly className: string;
  readonly jurisdictional: boolean;
  /**
   * ⚠️ REQUIRED, and it is the field people will want to skip.
   *
   * Durable Object storage cannot be relocated across jurisdictions, so a region
   * change means seal → export → recreate → import → verify → repoint. Every
   * class must be able to do that or a tenant is pinned to wherever it was
   * created. `seal` matters most: a credit balance moved wrongly either mints
   * money or destroys it, silently, on the money path.
   */
  readonly relocatable: true;
}

export interface InferenceStore extends StoreCommon {
  readonly kind: "inference";
  readonly regional: false;
  /**
   * ⚠️ THE ONE STORE A DEPLOYMENT MAY LEGITIMATELY NOT HAVE, and the reason it
   * is declared rather than assumed. A missing database is a broken deployment;
   * a missing model runner is a deployment that does not generate — a self-host,
   * a region with no permitted sub-processor, an installation before anybody has
   * bought credits. Every generation refuses, and nothing anywhere substitutes
   * an answer.
   *
   * ⚠️ IT IS NOT A GENERAL ESCAPE HATCH. An app whose product IS generation
   * should leave it absent, so a runner that fails to bind is a deployment that
   * fails to start rather than one that silently does nothing.
   */
  readonly optional?: boolean;
  /**
   * Residency is not only storage. A region carries a sub-processor allow-list,
   * so an EU tenant may resolve a different — or empty — model set.
   */
  readonly subprocessors: readonly string[];
}

export interface QueueStore extends StoreCommon {
  readonly kind: "queue";
  readonly regional: true;
}

export type Store = SqlStore | ObjectStore | CacheStore | ActorStore | InferenceStore | QueueStore;

/* --------------------------------------------------------------- builders --- */

export const sql = (o: Omit<SqlStore, "kind" | "regional"> = {}): SqlStore => ({ kind: "sql", regional: true, ...o });
export const objects = (o: Omit<ObjectStore, "kind" | "regional">): ObjectStore => ({ kind: "objects", regional: true, ...o });
export const cache = (): CacheStore => ({ kind: "cache", regional: false, personal: false });
export const actor = (o: Omit<ActorStore, "kind" | "regional" | "relocatable">): ActorStore => ({ kind: "actor", regional: true, relocatable: true, ...o });
export const inference = (o: Omit<InferenceStore, "kind" | "regional">): InferenceStore => ({ kind: "inference", regional: false, ...o });
export const queue = (): QueueStore => ({ kind: "queue", regional: true });

/* --------------------------------------------------------------- declare --- */

export type BindingSpec = Readonly<Record<string, Store>>;

/**
 * Declare an app's stores. The names become the keys on `ctx`, so an operation
 * writes `ctx.db` and the region is already decided.
 */
export function defineBindings<const B extends BindingSpec>(spec: B): B {
  return spec;
}

/** What a handler actually receives: resolved handles, never a region parameter. */
/**
 * ⚠️ AN OPTIONAL STORE IS TYPED AS POSSIBLY ABSENT, because it is. Resolving it
 * to a handle the type says is always there would move the failure from the
 * declaration — where it is one honest branch — into whichever handler happened
 * to reach for it first.
 */
export type ResolvedBindings<B extends BindingSpec> = {
  readonly [K in keyof B]: B[K] extends { readonly optional: true } ? Handle<B[K]> | undefined : Handle<B[K]>;
};

/* --------------------------------------------------------------- handles --- */

/**
 * What a handler may do with a store, and nothing more.
 *
 * ⚠️ THESE ARE DELIBERATELY NARROWER THAN THE PLATFORM UNDERNEATH THEM. A handle
 * is not a wrapper around a vendor's client — it is the subset an app is allowed
 * to reach, chosen so the things the platform must account for cannot be gone
 * around. An object written outside the ledger is invisible to the quota and to
 * erasure forever, and nothing else would notice; so `ObjectHandle` has no
 * unaccounted write, rather than a documented rule against one.
 *
 * They name no vendor. The contract layer describes what an app needs; which
 * product provides it is the runtime's problem, and swapping one is a change in
 * one package rather than in every handler.
 */

export interface SqlHandle {
  all<T>(sql: string, ...params: readonly unknown[]): Promise<T[]>;
  first<T>(sql: string, ...params: readonly unknown[]): Promise<T | null>;
  run(sql: string, ...params: readonly unknown[]): Promise<void>;
  /** One transaction-ish unit. ⚠️ A DDL batch must arrive as ONE call. */
  batch(statements: readonly string[]): Promise<void>;
}

export interface ObjectHandle {
  /** Returns the ledger key. ⚠️ There is no write that skips the ledger. */
  put(key: string, body: ArrayBuffer | ReadableStream, contentType: string): Promise<string>;
  get(key: string): Promise<ArrayBuffer | null>;
  delete(key: string): Promise<void>;
}

/**
 * ⚠️ A CACHE KEY IS TYPED, and the reason is residency rather than tidiness.
 *
 * A cache is globally replicated with no jurisdiction option, so anything in it
 * is in every point of presence on earth. Keys therefore come from a declared
 * space — routing, ephemeral codes, operator configuration — and there is no
 * method taking a free-form string, because a free-form string is where a
 * tenant's data eventually lands.
 */
export type CacheNamespace = "route" | "pairing" | "config";
export interface CacheHandle {
  get(ns: CacheNamespace, key: string): Promise<string | null>;
  put(ns: CacheNamespace, key: string, value: string, ttlSeconds?: number): Promise<void>;
  delete(ns: CacheNamespace, key: string): Promise<void>;
}

export interface ActorHandle {
  /** One actor per name. The jurisdiction is already decided by the region. */
  for(name: string): { fetch(request: Request): Promise<Response> };
}

export interface InferenceHandle {
  run(model: string, input: unknown): Promise<unknown>;
  /** ⚠️ A region's sub-processor allow-list, resolved. May be empty. */
  readonly permitted: readonly string[];
}

export interface QueueHandle {
  send(body: unknown): Promise<void>;
}

/**
 * ⚠️ A HANDLE IS ALL A HANDLER EVER RECEIVES, and it arrives already pointed at
 * one region. There is no method to change region, no field naming one, and no
 * way to obtain a second — which is what makes "a query cannot hit the wrong
 * continent" a property of the type rather than of a review.
 */
export type Handle<S extends Store> =
  S extends SqlStore ? SqlHandle
  : S extends ObjectStore ? ObjectHandle
  : S extends CacheStore ? CacheHandle
  : S extends ActorStore ? ActorHandle
  : S extends InferenceStore ? InferenceHandle
  : S extends QueueStore ? QueueHandle
  : never;
