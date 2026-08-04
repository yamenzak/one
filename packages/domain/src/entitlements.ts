/**
 * Kova's plan REGISTRY + downgrade eligibility, over `@4dl/billing`'s engine.
 *
 * The engine — resolve, merge-grant-only, clamp-on-suspension, snapshot a
 * downgrade, raise an override — is product-agnostic and lives in
 * `@4dl/billing` `entitlements.ts`. What is Kova's is the KEY SET below
 * (`staffSeats`, `aiSuite`, …), the free-tier baseline that doubles as that
 * registry, the label metadata, and `checkDowngrade`, whose usage counters are
 * Kova's nouns.
 *
 * Original header follows.
 *
 * Plan entitlements + downgrade eligibility (SPEC §5) — pure.
 *
 * Each plan carries an `entitlements_json` blob resolved onto the tenant. Value
 * is metered on three axes: capacity **quotas**, feature **gates**, and **AI
 * credits**. Enforcement happens at write time (block creating beyond quota)
 * and inline in feature routes (`if (!ent.features.aiSuite) 403`).
 *
 * Two flag systems, deliberately distinct (SPEC §5): these platform
 * entitlements are what the TENANT bought from Kova. Per-package client flags
 * (clientFlags.ts) are what a CLIENT bought from the tenant. Client capability
 * = entitlements ∩ resolved client flags.
 *
 * Downgrade is compliance-gated: you cannot shed a plan while still using what
 * it paid for. `checkDowngrade` diffs current usage against a target plan and
 * returns an exact remediation checklist.
 */

import {
  bindEntitlements,
  raiseQuota,
  trialPeriodDays,
  type EntitlementGrants as Grants,
  type EntitlementShape,
} from "@4dl/billing/model";

export { raiseQuota, trialPeriodDays };

export interface Quotas {
  /** Staff seats: owner + trainers + assistants (-1 = unlimited). */
  staffSeats: number;
  /** Active (non-archived) client records. */
  activeClients: number;
  /** Workout + meal templates combined (-1 = unlimited). */
  templates: number;
  /** R2 media budget in megabytes. */
  storageMb: number;
}

export interface Features {
  /** Selling packages to the studio's own customers (the tenant rail). */
  commerce: boolean;
  /** The AI suite as a whole (per-feature toggles live in tenant settings). */
  aiSuite: boolean;
  /** Camera body-fat estimator. */
  bfCamera: boolean;
  /** External food/exercise providers beyond the keyless ones. */
  externalSearch: boolean;
  /** Supplements + lab tests module. */
  supplementsLabs: boolean;
  /** Assistant role + sessions/booking surface. */
  frontDesk: boolean;
  /** Tenant branding: login skin, accent swap, content-hub public blog. */
  branding: boolean;
  /** API/webhooks + data exports. */
  integrations: boolean;
  /** Trainer <-> client chat (phase 2). */
  chat: boolean;
}

export interface Entitlements extends EntitlementShape {
  quotas: Quotas;
  features: Features;
  aiCredits: { monthlyGrant: number };
  /**
   * Free-trial length in days for a NEW subscription to this plan (0 = none).
   *
   * This lives in `entitlements_json` rather than in a `plans` column on
   * purpose: a column means a `db.ts` DDL + `SCHEMA_VERSION` bump (AGENTS.md §7
   * calls the forgotten bump the most dangerous omission in the repo), while the
   * JSON blob is already read on every plan resolution, already deep-merged over
   * this baseline, and already admin-editable through the plan builder. It is
   * not a capability — nothing gates on it; it is a parameter of subscription
   * *creation*, consumed once by `trialPeriodDays()` at Stripe checkout.
   */
  trialDays: number;
}

/** The most restrictive baseline — an unknown/free tenant resolves to this. */
export const FREE_ENTITLEMENTS: Entitlements = {
  quotas: {
    staffSeats: 1,
    activeClients: 3,
    templates: 5,
    storageMb: 250,
  },
  features: {
    commerce: false,
    aiSuite: false,
    bfCamera: false,
    externalSearch: true, // keyless providers only (OFF, wger) — route enforces which
    supplementsLabs: false,
    frontDesk: false,
    branding: false,
    integrations: false,
    chat: false,
  },
  aiCredits: { monthlyGrant: 0 },
  trialDays: 0,
};

/** The full key sets, derived from the baseline — new keys auto-appear in the
 *  admin plan builder and resolve everywhere without extra wiring. */
export const QUOTA_KEYS = Object.keys(FREE_ENTITLEMENTS.quotas) as (keyof Quotas)[];
export const FEATURE_KEYS = Object.keys(FREE_ENTITLEMENTS.features) as (keyof Features)[];

/** Human labels for the admin UI; unknown/new keys fall back to the raw key.
 *  `reserved` marks a feature that is DECLARED but not yet enforced by any route
 *  (roadmap) — the admin builder hides it and a conformance test permits it to
 *  have no gate. Every non-reserved feature must be gated somewhere. */
export const FEATURE_META: Record<string, { label: string; hint: string; reserved?: boolean }> = {
  commerce: { label: "Commerce", hint: "Sell packages and take payment your own way" },
  aiSuite: { label: "AI suite", hint: "AI drafting, coach notes, vision & image" },
  bfCamera: { label: "Body-fat camera", hint: "Camera body-fat estimator" },
  externalSearch: { label: "External food search", hint: "USDA / Nutritionix / FatSecret providers" },
  supplementsLabs: { label: "Supplements & labs", hint: "Supplement tracking + lab tests" },
  frontDesk: { label: "Front desk", hint: "Assistant role + sessions / booking" },
  branding: { label: "White-label branding", hint: "Your name, colours and logo throughout" },
  integrations: { label: "Integrations", hint: "API / webhooks + data exports", reserved: true },
  chat: { label: "Chat", hint: "Trainer ↔ client messaging", reserved: true },
};

/** Features declared but not yet enforced (roadmap). Kept explicit so a gate
 *  conformance test can distinguish "intentionally unwired" from "forgotten". */
export const RESERVED_FEATURES = FEATURE_KEYS.filter((k) => FEATURE_META[k]?.reserved);
export const QUOTA_META: Record<string, { label: string; hint: string; unit?: string }> = {
  staffSeats: { label: "Staff seats", hint: "Owner + trainers + assistants", unit: "seats" },
  activeClients: { label: "Active clients", hint: "Non-archived client records" },
  templates: { label: "Templates", hint: "Workout + meal templates combined" },
  storageMb: { label: "Storage", hint: "Media budget", unit: "MB" },
};

/**
 * Subscription statuses that SUSPEND paid service: the tenant falls back to
 * free capabilities until they settle billing. `past_due` is deliberately NOT
 * here — that's the grace window (full service while dunning). This is the
 * enforcement teeth behind the me→tenant lifecycle, and — because a client's
 * capability is `entitlements ∩ clientFlags` — the passthrough to that tenant's
 * clients: a suspended tenant's clients lose every tenant-derived paid feature
 * (AI, commerce, …) automatically, with no per-client bookkeeping.
 */
/**
 * Statuses under which service is withheld and entitlements clamp to free.
 *
 * This clamp is the ONE place delinquency bites capability: it is applied once,
 * in `tenantEntitlements`, so every `hasFeature`/`withinQuota` gate and the
 * client-flag intersection inherit the passthrough with no per-caller work.
 */
export const SUSPENDED_STATUSES: ReadonlySet<string> = new Set(["suspended", "canceled", "unpaid"]);

/** Kova's baseline, bound to the shared engine. It doubles as the key registry:
 *  a quota or feature absent from it does not exist, which is what makes every
 *  merge below fail closed on an unknown key. */
const engine = bindEntitlements<Entitlements>(FREE_ENTITLEMENTS, { suspendedStatuses: SUSPENDED_STATUSES });

/**
 * The bound engine itself, for `@4dl/billing`'s catalog store.
 *
 * The five named wrappers below stay — they read better at a call site and every
 * one of them is used — but the store needs the engine as a VALUE, because it is
 * generic over an app's entitlement shape and cannot import Kova's.
 */
export const entitlementsEngine = engine;

/** Clamp resolved entitlements down to free when the status suspends service. */
export const clampEntitlementsForStatus = (resolved: Entitlements, status: string): Entitlements =>
  engine.clamp(resolved, status);

/** Merge a stored (possibly partial) blob onto the free baseline. Values are
 *  coerced by type — a feature is enabled ONLY by a literal `true`, a quota only
 *  by a finite number — so a typo in admin JSON can't switch on a paid feature. */
export const resolveEntitlements = (json: string | null | undefined): Entitlements => engine.resolve(json);

/** A grant/override blob — a deep-partial of Entitlements (raise/enable only). */
export type EntitlementGrants = Grants<Entitlements>;

/**
 * Layer a per-tenant override on top of the plan's resolved entitlements — an
 * admin "gift". GRANT-ONLY: it can raise a quota, enable a feature or increase
 * the credit grant, and can NEVER lower a limit or disable a feature. So gifting
 * is always safe and a plan edit never bites a tenant through their override.
 */
export const mergeOverrides = (base: Entitlements, json: string | null | undefined): Entitlements =>
  engine.merge(base, json);

/**
 * When a plan is edited DOWN, the partial entitlements — valued at the OLD level
 * — that existing tenants must keep. Merge into each affected tenant's override
 * (via `raiseOverride`) to grandfather them; new tenants get the lower plan.
 */
export const snapshotDowngrade = (oldE: Entitlements, newE: Entitlements): EntitlementGrants =>
  engine.snapshotDowngrade(oldE, newE);

/** Merge grants into an existing override blob, grant-only, returning the new
 *  override JSON. Used to grandfather and to gift. */
export const raiseOverride = (json: string | null | undefined, grants: EntitlementGrants): string =>
  engine.raiseOverride(json, grants);

/** A tenant's current resource usage, gathered for a downgrade check. */
export interface TenantUsage {
  staffSeats: number;
  activeClients: number;
  templates: number;
  storageMb: number;
  /** Active client subscriptions sold on the studio's own payment rail. */
  activeCommerceSubs: number;
}

export type Violation =
  | { type: "quota"; resource: string; have: number; max: number; removeCount: number }
  | { type: "feature"; resource: string; instances: number; action: string };

export interface DowngradeResult {
  eligible: boolean;
  violations: Violation[];
}

const unlimited = (max: number) => max < 0;

/**
 * Diff current usage against a target plan's entitlements. Returns the exact
 * remediation checklist; `eligible` only when nothing is over the line.
 */
export function checkDowngrade(usage: TenantUsage, target: Entitlements): DowngradeResult {
  const v: Violation[] = [];
  const q = target.quotas;

  const overQuota = (resource: string, have: number, max: number) => {
    if (!unlimited(max) && have > max) {
      v.push({ type: "quota", resource, have, max, removeCount: have - max });
    }
  };
  overQuota("staffSeats", usage.staffSeats, q.staffSeats);
  overQuota("activeClients", usage.activeClients, q.activeClients);
  overQuota("templates", usage.templates, q.templates);
  overQuota("storageMb", usage.storageMb, q.storageMb);

  // Feature loss: tenants with live paid client subscriptions can't drop commerce.
  if (!target.features.commerce && usage.activeCommerceSubs > 0) {
    v.push({
      type: "feature",
      resource: "commerce",
      instances: usage.activeCommerceSubs,
      action: "wait out or cancel active client subscriptions sold through your packages",
    });
  }

  return { eligible: v.length === 0, violations: v };
}
