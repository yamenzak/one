/**
 * Plan entitlements + downgrade eligibility (SPEC §5) — pure.
 *
 * Each plan carries an `entitlements_json` blob resolved onto the tenant. Value
 * is metered on three axes: capacity **quotas**, feature **gates**, and **AI
 * credits**. Enforcement happens at write time (block creating beyond quota)
 * and inline in feature routes (`if (!ent.features.aiSuite) 403`).
 *
 * Two flag systems, deliberately distinct (SPEC §5): these platform
 * entitlements are what the TENANT bought from Mossa. Per-package client flags
 * (clientFlags.ts) are what a CLIENT bought from the tenant. Client capability
 * = entitlements ∩ resolved client flags.
 *
 * Downgrade is compliance-gated: you cannot shed a plan while still using what
 * it paid for. `checkDowngrade` diffs current usage against a target plan and
 * returns an exact remediation checklist.
 */

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
  /** Stripe Connect packages / marketplace (tenant rail). */
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

export interface Entitlements {
  quotas: Quotas;
  features: Features;
  aiCredits: { monthlyGrant: number };
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
};

/** Deep-ish merge of a stored (possibly partial) blob onto the free baseline. */
export function resolveEntitlements(json: string | null | undefined): Entitlements {
  if (!json) return FREE_ENTITLEMENTS;
  let raw: Partial<Entitlements>;
  try {
    raw = JSON.parse(json) as Partial<Entitlements>;
  } catch {
    return FREE_ENTITLEMENTS;
  }
  return {
    quotas: { ...FREE_ENTITLEMENTS.quotas, ...(raw.quotas ?? {}) },
    features: { ...FREE_ENTITLEMENTS.features, ...(raw.features ?? {}) },
    aiCredits: { ...FREE_ENTITLEMENTS.aiCredits, ...(raw.aiCredits ?? {}) },
  };
}

/**
 * Layer a per-tenant override blob (a partial Entitlements) on top of the
 * plan's resolved entitlements — an admin "gift": extra seats, an unlocked
 * feature, a bigger grant. Only keys present in the override win.
 */
export function mergeOverrides(base: Entitlements, json: string | null | undefined): Entitlements {
  if (!json) return base;
  let o: Partial<Entitlements>;
  try {
    o = JSON.parse(json) as Partial<Entitlements>;
  } catch {
    return base;
  }
  return {
    quotas: { ...base.quotas, ...(o.quotas ?? {}) },
    features: { ...base.features, ...(o.features ?? {}) },
    aiCredits: { ...base.aiCredits, ...(o.aiCredits ?? {}) },
  };
}

/** A tenant's current resource usage, gathered for a downgrade check. */
export interface TenantUsage {
  staffSeats: number;
  activeClients: number;
  templates: number;
  storageMb: number;
  /** Active client subscriptions sold via Stripe Connect. */
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
