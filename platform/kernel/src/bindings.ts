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
export type ResolvedBindings<B extends BindingSpec> = {
  readonly [K in keyof B]: Handle<B[K]["kind"]>;
};

/**
 * Deliberately opaque at stage 0.
 *
 * The point being proved here is that a handler CANNOT reach a raw binding, and
 * an opaque handle proves it more honestly than a plausible-looking interface
 * would. The real shapes arrive with the implementation in stage 1.
 */
declare const HANDLE: unique symbol;
export type Handle<K extends StoreKind> = { readonly [HANDLE]: K };
