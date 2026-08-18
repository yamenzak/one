/**
 * A PACKAGE IS A ROLE WITH A CLOCK — WHICH IS EXACTLY WHY IT IS NOT A ROLE (D16).
 *
 * ⚠️ A ROLE IS GRANTED BY A PERSON AND LASTS UNTIL A PERSON TAKES IT AWAY. A
 * package is granted by a payment and DIES: expiry, grace, lapse, the
 * workspace's own retention. Modelling a purchase as a role assignment means
 * hand-building that lifecycle in app code — the double-bookkeeping this seam
 * exists to escape, one layer down. So a package is a priced bundle of TIMED
 * GRANTS on the buyer's membership, and the ONE resolver (`permissionsFor`)
 * is where they stop counting.
 *
 * ⚠️ A RENEWAL EXTENDS AND NEVER STACKS. Two live grants for one package is a
 * window nobody can reason about — which one the resolver reads decides
 * whether somebody paid for four months or two overlapping twos. `extendedUntil`
 * queues: the new period starts where the old one ends, or now if it already
 * lapsed.
 *
 * ⚠️ AND A PACKAGE MAY NOT SELL WHAT CANNOT BE DELIVERED. A key that no
 * operation and no screen reads — or that is only reachable behind an
 * entitlement no plan sells — is money taken for a 403. Refused when the
 * package is COMPOSED, because the alternative is discovered at a customer's
 * first refusal, weeks later, by the customer.
 *
 * Layer 3. Imports primitives, access, collection, operation, entitlement.
 */

import { instant, type Instant } from "./primitives.js";
import type { AccessSpec } from "./access.js";
import type { CollectionSpec, CrudVerb } from "./collection.js";
import { operationsFor, permissionFor } from "./collection.js";
import type { AnyOperation } from "./operation.js";
import type { EntitlementDef, PlanSpec } from "./entitlement.js";

/* ------------------------------------------------------------------ shape --- */

export interface PackageDef {
  readonly id: string;
  /** One app's vocabulary, like a custom role. */
  readonly app: string;
  readonly name: string;
  /** Minor units. An integer, always. Zero is a real price: a free package. */
  readonly priceCents: number;
  readonly currency: string;
  /** Days one purchase buys. */
  readonly periodDays: number;
  /** Days past expiry the grants still count, while both sides are told. */
  readonly graceDays: number;
  /** The permission keys holding it grants — what the buyer may DO. */
  readonly grants: readonly string[];
  /**
   * ⚠️ The workspace's own retention: days after lapse before a destructive
   * step may run. `null` means never destructive. The platform floor below
   * applies — a retention under it does not compose.
   */
  readonly retentionDays?: number | null;
  /** A package a person may buy once, answered by the LEDGER, never the row. */
  readonly oncePer?: boolean;
}

/**
 * ⚠️ NEVER DESTRUCTIVE BEFORE FOURTEEN DAYS. The floor is the platform's
 * because the ladder is: a workspace must not be able to configure a
 * customer's records out of existence the morning after a missed renewal.
 */
export const PACKAGE_FLOOR_DAYS = 14;

/* -------------------------------------------------------------- the clock --- */

export type PackageState = "active" | "grace" | "lapsed";

const DAY_MS = 86_400_000;

/**
 * Where one holding stands on the ladder. `paidUntil` null means no purchase
 * was ever applied — lapsed, not a special state.
 */
export function packageState(
  paidUntil: Instant | null, graceDays: number, now: Instant,
): PackageState {
  if (!paidUntil) return "lapsed";
  if (paidUntil > now) return "active";
  const graceEnds = instant(new Date(Date.parse(paidUntil) + graceDays * DAY_MS));
  return graceEnds > now ? "grace" : "lapsed";
}

/**
 * ⚠️ THE GRANTS COUNT THROUGH GRACE, so the clock the membership carries is
 * expiry PLUS grace — the resolver has one comparison and must not know the
 * ladder. What grace changes is the SENTENCE, not the access.
 */
export const grantUntil = (paidUntil: Instant, graceDays: number): Instant =>
  instant(new Date(Date.parse(paidUntil) + graceDays * DAY_MS));

/**
 * ⚠️ A RENEWAL EXTENDS FROM WHERE THE CLOCK STANDS — a queue, never a sum and
 * never a second overlapping window. Active: the new period starts at the old
 * expiry. Lapsed: it starts now; the dead months are not billed backwards.
 */
export const extendedUntil = (
  current: Instant | null, periodDays: number, now: Instant,
): Instant => {
  const base = current && current > now ? current : now;
  return instant(new Date(Date.parse(base) + periodDays * DAY_MS));
};

/**
 * Whether a destructive retention step may run yet.
 *
 * ⚠️ COUNTED FROM LAPSE, NOT FROM EXPIRY — grace is still a paid-for
 * relationship, and the floor is a floor on top of that.
 */
/* DEFER(engine-35) stage:35 — a workspace's own retention step against its own
   customers, which is a ladder no product here runs yet. */
export function mayDestroy(
  paidUntil: Instant | null, graceDays: number, retentionDays: number | null | undefined,
  now: Instant,
): boolean {
  if (retentionDays === null || retentionDays === undefined) return false;
  if (!paidUntil) return false;
  const lapse = Date.parse(paidUntil) + graceDays * DAY_MS;
  return Date.parse(now) >= lapse + Math.max(retentionDays, PACKAGE_FLOOR_DAYS) * DAY_MS;
}

/* ----------------------------------------------------------- deliverability --- */

/**
 * Every permission key a package could deliver in this app: named by an
 * operation or a screen whose entitlement (if any) at least one plan sells.
 *
 * ⚠️ GENERATED OPERATIONS COUNT. A collection's CRUD verbs carry derived
 * `thing:read` / `thing:write` keys nobody wrote, and they are most of what a
 * package sells — leaving them out refuses every honest package.
 */
export function sellableKeys(spec: {
  readonly access: AccessSpec;
  readonly collections: readonly CollectionSpec[];
  readonly operations: readonly AnyOperation[];
  readonly screens: readonly { readonly permission: string }[];
  readonly entitlements: Readonly<Record<string, EntitlementDef>>;
},
  /**
   * ⚠️ THE DEPLOYMENT'S PLANS, PASSED IN. A key no tier includes is one this
   * workspace could never have, so a package may not sell it — and since the
   * membership became one, only the deployment knows what the tiers are.
   */
  plans: readonly PlanSpec[] = [],
): ReadonlySet<string> {
  const everSold = (key: string | undefined): boolean => {
    if (!key) return true;
    if (spec.entitlements[key]?.reserved) return false;
    return plans.some((p) => !!p.includes[key]);
  };

  const out = new Set<string>();
  for (const c of spec.collections) {
    for (const opId of operationsFor(c)) {
      const verb = opId.slice(c.id.length + 1) as CrudVerb;
      out.add(permissionFor(c, verb));
    }
  }
  for (const o of spec.operations) {
    if (typeof o.permission === "string" && everSold(o.entitlement)) out.add(o.permission);
  }
  for (const s of spec.screens) out.add(s.permission);

  /* ⚠️ Only the app's OWN keys are sellable. A package granting `member:manage`
     would be workspace authority for money — the platform's offices are not
     for sale, exactly as they are not composable into custom roles. */
  const own = new Set(spec.access.permissions);
  return new Set([...out].filter((k) => own.has(k)));
}

export type PackageRefusal =
  | "id" | "empty" | "period" | "price" | "floor" | "undeliverable" | "beyond_you";

/**
 * ⚠️ EACH REFUSAL IS A DIFFERENT THING TO DO NEXT — and `beyond_you` is the
 * same escalation the role composer refuses: composing a package you could
 * not grant key by key, then buying it from yourself.
 */
export function refusePackage(
  pkg: PackageDef,
  sellable: ReadonlySet<string>,
  author: ReadonlySet<string>,
): PackageRefusal | null {
  if (!/^[a-z][a-z0-9-]{1,38}$/.test(pkg.id)) return "id";
  if (!pkg.grants.length) return "empty";
  if (!Number.isInteger(pkg.periodDays) || pkg.periodDays < 1) return "period";
  if (!Number.isInteger(pkg.priceCents) || pkg.priceCents < 0) return "price";
  if (typeof pkg.retentionDays === "number" && pkg.retentionDays < PACKAGE_FLOOR_DAYS) return "floor";
  if (pkg.grants.some((k) => !sellable.has(k))) return "undeliverable";
  if (pkg.grants.some((k) => !author.has(k))) return "beyond_you";
  return null;
}

/** The provenance stamp a package's grants share — found, extended and
    removed as ONE thing by it. */
export const packageSource = (packageId: string): string => `pkg:${packageId}`;
