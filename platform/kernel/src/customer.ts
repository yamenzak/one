/**
 * WHAT THE TENANT'S OWN CUSTOMER BOUGHT FROM THEM — the second rail.
 *
 * Layer 2. Imports primitives only.
 *
 * ⚠️ NEVER MERGED WITH THE FIRST. `entitlement.ts` is the platform selling to a
 * workspace; this is a workspace selling to the people it serves. They resolve
 * separately and a real capability is the INTERSECTION, which is the only
 * arrangement where a workspace cannot sell what it did not itself buy, and
 * where losing a plan does not silently rewrite what its customers were sold.
 *
 * An app declares whether it has this rail at all. Most do not.
 */

import type { Instant, Money } from "./primitives.js";

/* ------------------------------------------------------------- the offer --- */

export interface PackageSpec {
  readonly id: string;
  readonly name: string;
  readonly price: Money;
  /** Which capabilities it turns on. */
  readonly flags: Readonly<Record<string, boolean>>;
  /** Scope → days of access. A scope is a bucket of time, not a count of uses. */
  readonly budgets: Readonly<Record<string, number>>;
  /**
   * ⚠️ Answered from the GRANT LEDGER, never from the live row.
   *
   * A repeat purchase folds into the row that is already open, so the row's own
   * package id is only ever the package that OPENED it. Asking "is there a row
   * for this package" therefore answers no forever for every package after the
   * first, and a strictly-once package stacks without limit.
   */
  readonly oncePerCustomer: boolean;
}

/**
 * ⚠️ HOW A SOLD CAPABILITY IS ACTUALLY WITHHELD.
 *
 * Same rule as an entitlement's, and it exists because of the same failure: a
 * package builder that renders a switch for every declared flag makes adding one
 * a single line, and forgetting to enforce it completely invisible. A product
 * shipped a report endpoint that way — four lenses in one payload, three of them
 * sold, no gate anywhere, and the app merely HIDING the tabs. Every customer
 * received all four over the wire.
 *
 * `derived` is the one honest exemption and it is narrower than it looks: a
 * capability computed entirely from the customer's own data, where there is
 * nothing a route could withhold without breaking the thing that produced it.
 */
export type FlagEnforcement =
  | "gate"
  | "shape"
  | { readonly derived: string };

export interface FlagDef {
  /**
   * ⚠️ WHAT THIS IS CALLED TO THE CUSTOMER BUYING IT. Same argument as the other
   * rail's: a package is sold from a screen, and the alternative to a label here
   * is copy written beside the declaration, which drifts from what is enforced.
   */
  readonly label: string;
  readonly enforcement: FlagEnforcement;
  /** The budget scope whose days gate it. Absent means time does not gate it. */
  readonly scope?: string;
  /**
   * ⚠️ THE ENTITLEMENT THE WORKSPACE ITSELF MUST HOLD, named rather than assumed.
   *
   * The intersection is the rule that stops a workspace selling what it did not
   * buy, but the two rails have separate vocabularies and a shared key name is a
   * coincidence a framework may not rely on. Absent means the workspace's own
   * plan does not gate this — which is a real case, and is not the same as
   * "there happened to be no matching key".
   */
  readonly requires?: string;
  /** What a customer holding no package at all has. */
  readonly parked: boolean;
}

/* -------------------------------------------------------------- runway --- */

const DAY_MS = 86_400_000;

/**
 * ⚠️ DAYS QUEUE, THEY DO NOT SUM, AND THEY DO NOT RESTART.
 *
 * Buying thirty days on day ten of an existing thirty leaves fifty to run, not
 * thirty and not sixty. Extending from `now` throws away what was paid for;
 * summing the remainders drifts every time a boundary is crossed. Extending from
 * the LATER of now and the current expiry is the only arrangement where a
 * customer gets exactly what they bought, whenever they buy it.
 */
export function extendBudget(current: Instant | null, now: Instant, days: number): Instant {
  const from = current && current > now ? current : now;
  return new Date(Date.parse(from) + days * DAY_MS).toISOString() as Instant;
}

/** Whole days left, floored at zero. A budget is spent the moment it expires. */
export function daysRemaining(expiresAt: Instant, now: Instant): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.parse(now)) / DAY_MS));
}

/**
 * ⚠️ THE HEADLINE NUMBER IS A MAXIMUM ACROSS SCOPES, AND IT IS A LIE ON ITS OWN.
 *
 * A customer with sixty days of one thing and none of another reads as sixty
 * days covered. The per-scope breakdown is therefore not an optional detail
 * beside the headline — it is the correction to it, so there is deliberately no
 * function here that returns the headline alone and nothing to pass to a screen
 * that would render one without the other.
 */
export interface Runway {
  readonly overall: number;
  readonly byScope: Readonly<Record<string, number>>;
}

export function runwayFor(budgets: Readonly<Record<string, Instant>>, now: Instant): Runway {
  const byScope: Record<string, number> = {};
  for (const [scope, expiresAt] of Object.entries(budgets)) byScope[scope] = daysRemaining(expiresAt, now);
  const values = Object.values(byScope);
  return { overall: values.length ? Math.max(...values) : 0, byScope };
}

/* --------------------------------------------------------------- buying --- */

/**
 * Whether this customer may buy this package.
 *
 * `priorGrants` is the append-only ledger of packages actually APPLIED — one
 * entry per application, including the repeat purchases that folded into an open
 * row. Every path that applies a package's budgets must write to it, or this
 * question has no way to be answered correctly.
 */
export function mayPurchase(
  pkg: PackageSpec,
  priorGrants: readonly string[],
): { readonly allowed: true } | { readonly allowed: false; readonly refusal: "already_purchased" } {
  if (pkg.oncePerCustomer && priorGrants.includes(pkg.id)) return { allowed: false, refusal: "already_purchased" };
  return { allowed: true };
}

/* ---------------------------------------------------------- the three layers --- */

export type FlagSource = "parked" | "package" | "snapshot" | "override" | "lapsed" | "not_sold";

export interface FlagResolution {
  readonly value: boolean;
  readonly from: FlagSource;
  /** Which scope ran out, or which entitlement the workspace itself lacks. */
  readonly blockedBy?: string;
}

/**
 * THE WALK: parked → package → snapshot → override → budget → ∩ entitlements.
 *
 * ⚠️ ONLY ONE OF THE FIRST FOUR IS A DIFF, and the difference is load-bearing.
 *
 * `snapshot` is copied WHOLE from the package at grant time, so it deliberately
 * masks later package edits for anyone already holding a row — a customer keeps
 * what they were sold when a coach reworks the offer. `overrides` is the sparse
 * per-customer exception, where `null` means "back to the package"; that only
 * works because it is a diff and would be a way to silently strip everything if
 * it were a snapshot too.
 *
 * The two gates run AFTER all four, so no exception can widen a lapsed budget or
 * reach past what the workspace itself bought.
 */
export function explainCustomerFlags(input: {
  readonly declared: Readonly<Record<string, FlagDef>>;
  readonly pkg: PackageSpec | null;
  readonly snapshot: Readonly<Record<string, boolean>>;
  readonly overrides: Readonly<Record<string, boolean | null>>;
  readonly runway: Runway;
  readonly tenantHolds: ReadonlySet<string>;
}): Readonly<Record<string, FlagResolution>> {
  const out: Record<string, FlagResolution> = {};
  for (const [key, def] of Object.entries(input.declared)) {
    let value = def.parked;
    let from: FlagSource = "parked";

    const sold = input.pkg?.flags[key];
    if (sold !== undefined) { value = sold; from = "package"; }

    const kept = input.snapshot[key];
    if (kept !== undefined) { value = kept; from = "snapshot"; }

    const set = input.overrides[key];
    if (set !== undefined && set !== null) { value = set; from = "override"; }

    if (value && def.scope && (input.runway.byScope[def.scope] ?? 0) <= 0) {
      out[key] = { value: false, from: "lapsed", blockedBy: def.scope };
      continue;
    }
    if (value && def.requires && !input.tenantHolds.has(def.requires)) {
      out[key] = { value: false, from: "not_sold", blockedBy: def.requires };
      continue;
    }
    out[key] = { value, from };
  }
  return out;
}

/** The same walk, without the working. A projection, never a second merge. */
export function resolveCustomerFlags(input: Parameters<typeof explainCustomerFlags>[0]): ReadonlySet<string> {
  return new Set(Object.entries(explainCustomerFlags(input)).filter(([, r]) => r.value).map(([k]) => k));
}

/* -------------------------------------------------------- contradictions --- */

export interface Contradiction {
  readonly kind: "flag_without_days" | "days_without_flag";
  readonly subject: string;
  readonly explanation: string;
}

/**
 * ⚠️ REPORTED, NEVER REFUSED.
 *
 * A package can contradict itself in two directions: a capability turned on with
 * no days sold for the scope that gates it resolves off anyway, and days sold
 * for a scope where every capability it gates is off buy nothing and still count
 * down. Both are almost always mistakes.
 *
 * Almost. Refusing them would be a framework overruling somebody who may be
 * running a promotion, staging a launch, or selling time they will attach
 * capabilities to next week. The builder says so and the person decides — which
 * is the general rule for anything the platform can detect but cannot know.
 */
export function packageContradictions(
  pkg: PackageSpec,
  declared: Readonly<Record<string, FlagDef>>,
): readonly Contradiction[] {
  const out: Contradiction[] = [];
  for (const [key, on] of Object.entries(pkg.flags)) {
    const scope = declared[key]?.scope;
    if (!on || !scope) continue;
    if ((pkg.budgets[scope] ?? 0) <= 0) {
      out.push({
        kind: "flag_without_days",
        subject: key,
        explanation: `sold with no ${scope} days, so it resolves off anyway`,
      });
    }
  }
  for (const [scope, days] of Object.entries(pkg.budgets)) {
    if (days <= 0) continue;
    const gated = Object.entries(declared).filter(([, def]) => def.scope === scope).map(([key]) => key);
    if (gated.length && !gated.some((key) => pkg.flags[key])) {
      out.push({
        kind: "days_without_flag",
        subject: scope,
        explanation: `${days} days that gate nothing this package turns on`,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------- lapsing --- */

/**
 * WHAT A WORKSPACE DOES ABOUT A CUSTOMER WHOSE ACCESS RAN OUT.
 *
 * ⚠️ THE WORKSPACE'S RULE, NOT THE PLATFORM'S, and the rungs are ordered by how
 * much they take away. Access running out already withholds what was sold — this
 * is the separate question of what happens to the RECORD afterwards, and the
 * answer differs by trade: a coaching studio archives after a season, a clinic
 * may be required to keep everything for years.
 */
export const RUNGS = ["none", "read_only", "blocked", "archive", "delete"] as const;
export type Rung = (typeof RUNGS)[number];

/**
 * ⚠️ THE DESTRUCTIVE PAIR CARRIES A FLOOR, and it is not advisory. Archiving or
 * deleting somebody a fortnight after a payment slipped is a support incident
 * with no undo — a card expires, somebody is on holiday, an invoice sits in a
 * spam folder. Below this, the setting is refused rather than clamped, because
 * silently doing something gentler than what an operator typed is its own
 * failure.
 */
export const DESTRUCTIVE_FLOOR_DAYS = 14;

export interface Ladder {
  /** Days after access lapses, per rung. Absent means the rung never happens. */
  readonly readOnlyAfter?: number;
  readonly blockedAfter?: number;
  readonly archiveAfter?: number;
  readonly deleteAfter?: number;
}

/** Why a ladder cannot be saved. Empty is the whole of the pass condition. */
export function ladderProblems(ladder: Ladder): readonly string[] {
  const out: string[] = [];
  const rungs: readonly [Rung, number | undefined][] = [
    ["read_only", ladder.readOnlyAfter], ["blocked", ladder.blockedAfter],
    ["archive", ladder.archiveAfter], ["delete", ladder.deleteAfter],
  ];
  for (const [name, days] of rungs) {
    if (days === undefined) continue;
    if (!Number.isInteger(days) || days < 0) out.push(`${name}: not a number of days`);
    else if ((name === "archive" || name === "delete") && days < DESTRUCTIVE_FLOOR_DAYS) {
      out.push(`${name}: at least ${DESTRUCTIVE_FLOOR_DAYS} days`);
    }
  }
  /*
    ⚠️ A LADDER THAT GOES BACKWARDS IS NOT A LADDER. Deleting before archiving
    means the archive rung never happens, which reads on the settings screen as
    a step somebody configured and gets, and is neither.
  */
  const set = rungs.filter(([, d]) => d !== undefined).map(([n, d]) => [n, d!] as const);
  for (let i = 1; i < set.length; i++) {
    if (set[i]![1] < set[i - 1]![1]) out.push(`${set[i]![0]}: comes before ${set[i - 1]![0]}`);
  }
  return out;
}

/**
 * Which rung a customer has reached.
 *
 * ⚠️ THE FURTHEST ONE, not the first one crossed — a sweep that missed a week
 * must land somebody where they should be today rather than walking them through
 * every rung it skipped. Each rung's action is idempotent for the same reason.
 */
export function rungFor(daysLapsed: number, ladder: Ladder): Rung {
  let at: Rung = "none";
  if (ladder.readOnlyAfter !== undefined && daysLapsed >= ladder.readOnlyAfter) at = "read_only";
  if (ladder.blockedAfter !== undefined && daysLapsed >= ladder.blockedAfter) at = "blocked";
  if (ladder.archiveAfter !== undefined && daysLapsed >= ladder.archiveAfter) at = "archive";
  if (ladder.deleteAfter !== undefined && daysLapsed >= ladder.deleteAfter) at = "delete";
  return at;
}

/**
 * How long ago the last thing they held ran out.
 *
 * ⚠️ MEASURED FROM THE LATEST EXPIRY, so somebody who still holds one scope has
 * not lapsed at all. Taking the earliest would start the clock on a customer who
 * is still paying for something — and the rungs at the end of it are destructive.
 *
 * Null when they hold nothing that ever expired, which is not the same as zero:
 * a customer who never bought anything has not lapsed, and a ladder that treated
 * them as lapsed would archive every record a workspace ever created.
 */
export function lapsedFor(budgets: Readonly<Record<string, Instant>>, now: Instant): number | null {
  const times = Object.values(budgets).map((at) => Date.parse(at));
  if (!times.length) return null;
  const last = Math.max(...times);
  const days = Math.floor((Date.parse(now) - last) / DAY_MS);
  return days > 0 ? days : null;
}
