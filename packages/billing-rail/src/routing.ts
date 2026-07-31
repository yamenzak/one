/**
 * WHICH APP DOES THIS EVENT BELONG TO?
 *
 * Pure, and deliberately the only thing in this package that decides anything.
 * One Stripe account serving several 4DL apps means every webhook delivery has
 * to be attributed before it can be handled, and getting that wrong is the most
 * expensive failure the platform has: a payment succeeds, the wrong app (or no
 * app) is told, and the buyer is charged for something they never receive.
 *
 * ── The failure this exists to prevent ──────────────────────────────────────
 *
 * Kova's handler is a switch over `event.type` whose branches are guarded like
 * `if (meta.kova_pack && meta.kova_credits && meta.kova_tenant)`. An event
 * carrying another app's metadata matches nothing, falls out of the switch, and
 * the endpoint answers `200 {received: true}` — with the event id ALREADY
 * claimed in the idempotency table, so Stripe never retries it. Money captured,
 * nothing granted, and not one line of signal anywhere.
 *
 * That is harmless while one app owns the account, which is exactly why it would
 * ship. The second app turns it into silent revenue loss.
 *
 * ── Two ways an object names its app, and both must work ────────────────────
 *
 * **`metadata.app`** is the contract going forward: explicit, greppable, and
 * filterable in Stripe's own dashboard (`metadata['app']:'kova'`).
 *
 * **The prefixed keys** — `kova_tenant`, `kova_plan`, `kova_pack` — are what
 * live objects already carry. `@4dl/billing`'s `stripeBranding.metadataPrefix`
 * generates them, and its own doc comment calls it live data that can never be
 * changed because the webhook reads it back. So inference from the prefix is not
 * a nicety: without it, every subscription and customer created before this
 * package existed becomes unroutable on the day it ships.
 *
 * Explicit beats inferred when both are present. If they DISAGREE, that is not a
 * tie to break — it is a corrupted object, and guessing either way risks
 * crediting the wrong tenant. It is unroutable, loudly.
 */

/** An app the rail knows how to deliver to. */
export interface RailApp {
  /** Stable slug — the value of `metadata.app`. */
  slug: string;
  /**
   * The app's `metadataPrefix` from `@4dl/billing`'s `StripeBranding`, if it has
   * one. Objects created before `metadata.app` existed carry only this.
   */
  metadataPrefix?: string;
}

export type RouteVia =
  /** `metadata.app` named it. */
  | "explicit"
  /** A legacy `<prefix>_*` key implied it. */
  | "prefix"
  /**
   * The app RECOGNISED it — see `RailDeps.claims`. Metadata named nobody, and
   * exactly one app looked the object up and said "mine".
   *
   * This is not a nicety. Kova resolves several event types by Stripe customer
   * id rather than metadata (`invoice.paid` falls back to `tenantByCustomer`),
   * so metadata-only routing would park events it handles correctly today.
   */
  | "claim";

export type RouteResult =
  | { app: string; via: RouteVia; unroutable?: never }
  | { unroutable: true; reason: UnroutableReason; candidates?: string[]; app?: never };

export type UnroutableReason =
  /** No `metadata.app` and no recognised prefix — nothing names an app. */
  | "no-app-marker"
  /** `metadata.app` names an app the rail was not told about. */
  | "unknown-app"
  /** Explicit and inferred disagree, or two prefixes both matched. */
  | "ambiguous";

/** Stripe metadata is always string→string; anything else is not ours. */
export type Metadata = Record<string, string>;

/**
 * Every metadata bag an event could hide its attribution in.
 *
 * Stripe nests the interesting object differently per event type, and the app
 * marker does not always ride on the top-level object: a `checkout.session`
 * carries it, but an `invoice` for a subscription may only have it on
 * `subscription_details.metadata` or on a line item's. Collecting them and
 * requiring agreement is safer than picking one and being wrong on a type
 * nobody tested.
 */
export function metadataBags(obj: unknown): Metadata[] {
  const bags: Metadata[] = [];
  const push = (v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === "string");
      if (entries.length) bags.push(Object.fromEntries(entries) as Metadata);
    }
  };
  if (!obj || typeof obj !== "object") return bags;
  const o = obj as Record<string, unknown>;
  push(o.metadata);
  const parent = o.parent as Record<string, unknown> | undefined;
  push((parent?.subscription_details as Record<string, unknown> | undefined)?.metadata);
  push((o.subscription_details as Record<string, unknown> | undefined)?.metadata);
  const lines = (o.lines as { data?: unknown[] } | undefined)?.data;
  if (Array.isArray(lines)) for (const l of lines) push((l as Record<string, unknown>)?.metadata);
  return bags;
}

/** The apps whose prefix appears in this bag, e.g. `kova_tenant` → `kova`. */
function prefixMatches(bag: Metadata, apps: RailApp[]): string[] {
  const hit = new Set<string>();
  for (const app of apps) {
    const p = app.metadataPrefix;
    if (!p) continue;
    // `kova_tenant`, `kova_plan`, `kova_pack`, `kova_credits`, `kova_promo` — any
    // key the app stamps. Matching the PREFIX rather than a fixed list means a
    // new marker an app adds later still routes.
    if (Object.keys(bag).some((k) => k.startsWith(`${p}_`))) hit.add(app.slug);
  }
  return [...hit];
}

/**
 * Attribute one Stripe event.
 *
 * `apps` is injected — this package does not know that Kova exists, and an app
 * list baked in here would be the product vocabulary the whole platform rule
 * forbids.
 */
export function resolveApp(event: { data?: { object?: unknown } }, apps: RailApp[]): RouteResult {
  const bags = metadataBags(event?.data?.object);
  const known = new Set(apps.map((a) => a.slug));

  const explicit = new Set<string>();
  const inferred = new Set<string>();
  for (const bag of bags) {
    const e = bag.app?.trim();
    if (e) explicit.add(e);
    for (const s of prefixMatches(bag, apps)) inferred.add(s);
  }

  // Two different apps claiming one object is corruption, not a tie. Crediting
  // either one risks granting a paid product to the wrong tenant.
  if (explicit.size > 1) return { unroutable: true, reason: "ambiguous", candidates: [...explicit].sort() };
  if (explicit.size === 0 && inferred.size > 1) return { unroutable: true, reason: "ambiguous", candidates: [...inferred].sort() };

  const [one] = explicit;
  if (one) {
    if (!known.has(one)) return { unroutable: true, reason: "unknown-app", candidates: [one] };
    // Explicit wins, but a prefix pointing somewhere ELSE means the object was
    // stamped by two different code paths that disagree. Refuse it.
    const other = [...inferred].filter((s) => s !== one);
    if (other.length) return { unroutable: true, reason: "ambiguous", candidates: [one, ...other].sort() };
    return { app: one, via: "explicit" };
  }

  const [only] = inferred;
  if (only) return { app: only, via: "prefix" };
  return { unroutable: true, reason: "no-app-marker" };
}
