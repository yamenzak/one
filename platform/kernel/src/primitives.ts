/**
 * THE PRIMITIVES EVERY OTHER DECLARATION IS BUILT FROM.
 *
 * Layer 0. Imports nothing.
 *
 * Most of this file exists to move a rule from §9 of MANIFEST.md — "must exist
 * before the first table" — from a document into the type checker, which is
 * level 1 of the ranking in STANDARDS.md rather than level 5. A branded type
 * costs nothing at runtime and makes a whole class of mistake unrepresentable.
 */

/* ------------------------------------------------------------------ ids --- */

declare const BRAND: unique symbol;
/** A nominal string. `Id<"client">` is not assignable to `Id<"plan">`. */
export type Id<K extends string> = string & { readonly [BRAND]: K };

/* ----------------------------------------------------------------- time --- */

/**
 * ⚠️ AN INSTANT IS ISO-8601 UTC TEXT, AND THE BRAND IS THE POINT.
 *
 * An epoch-millisecond number and an ISO string are both "a time", and SQLite
 * will store either in either column without complaint — at which point
 * `past_due_at + graceMs` is string concatenation and `past_due_at < ?` compares
 * a number against text. Nothing throws; a workspace is simply never suspended,
 * or suspended immediately.
 *
 * Branding it means a `number` cannot reach a column that holds one, and the
 * mistake becomes a compile error instead of a support ticket. Arithmetic goes
 * through the helpers, which is the only place a conversion is allowed to exist.
 */
export type Instant = string & { readonly [BRAND]: "instant" };

/**
 * A calendar date with NO instant behind it — `YYYY-MM-DD`, in the subject's own
 * local reckoning.
 *
 * Distinct from `Instant` because "the day someone logged this" is not a point
 * on a timeline: it is the date on the wall where they were standing, and
 * converting it to UTC and back moves it. A day-bucketed row keeps this; an
 * event keeps an `Instant`.
 */
export type PlainDate = string & { readonly [BRAND]: "plain-date" };

/** IANA zone (`Europe/Berlin`). A tenant has one; it is not a display setting. */
export type TimeZone = string & { readonly [BRAND]: "tz" };
/** BCP 47 (`en`, `de`, `ar-AE`). A person has one. */
export type Locale = string & { readonly [BRAND]: "locale" };

/* ---------------------------------------------------------------- money --- */

/**
 * ⚠️ MINOR UNITS AND A CURRENCY, ALWAYS. NEVER A FLOAT, NEVER A BARE NUMBER.
 *
 * `19.99` cannot be represented exactly in binary floating point, and a total
 * assembled from floats disagrees with the one the customer's card is charged.
 * Every price in the platform is an integer count of the currency's smallest
 * unit, carried with the currency it counts.
 *
 * The currency travels WITH the amount rather than sitting on the tenant,
 * because a tenant that sells in two currencies is a normal business and a
 * schema that assumes one is a migration waiting to happen. Today every product
 * here is single-currency; the type costs nothing until the day one is not.
 */
export interface Money {
  /** Integer count of the smallest unit — cents, fils, yen. */
  readonly minor: number;
  readonly currency: Currency;
}

/** Extensible on purpose: `(string & {})` keeps autocomplete for the known set. */
export type Currency = "USD" | "EUR" | "GBP" | "AED" | "SAR" | (string & {});

/* ---------------------------------------------------------------- units --- */

/** What a stored number MEANS. Storage is canonical; display converts. */
export type Dimension = "mass" | "length" | "volume" | "energy" | "temperature" | "duration";
export type UnitSystem = "metric" | "imperial";

/**
 * A measured value, in the dimension's canonical unit.
 *
 * Canonical is kg, m, L, kcal, °C, seconds. A person reading it in pounds is a
 * rendering decision made from their `UnitSystem`, not a different stored
 * number — which is what stops two screens disagreeing about someone's weight.
 */
export interface Quantity<D extends Dimension = Dimension> {
  readonly value: number;
  readonly dimension: D;
}

/* ------------------------------------------------------------- identity --- */

export type UserId = Id<"user">;
export type TenantId = Id<"tenant">;

/**
 * Where a tenant's data lives. `auto` lets the platform place it; a named region
 * is a commitment that appears in a DPA.
 *
 * ⚠️ Not "global vs EU". The WORKER runs everywhere; a store has a home. What a
 * tenant chooses is the home — see PLAN.md §4.3, and do not let the marketing
 * word for it back into the type.
 */
export type RegionId = "auto" | "eu" | (string & {});

/** Who is acting. Every operation gets one; none may assume a human. */
export interface Actor {
  readonly userId: UserId | null;
  readonly tenantId: TenantId | null;
  readonly kind: ActorKind;
  /** Set when an operator is acting AS someone. Audited, time-boxed, announced. */
  readonly impersonatedBy?: UserId;
}

/**
 * ⚠️ `tool` IS A FIRST-CLASS ACTOR, and that is deliberate.
 *
 * The AI's surface is the route surface masked by the caller's permissions, so
 * an operation must be able to see that it is being driven by a tool without
 * that changing what it is ALLOWED to do. Making the distinction visible but
 * non-privileging is what stops "the assistant can do more than the person".
 */
export type ActorKind = "user" | "tool" | "device" | "system" | "operator";
