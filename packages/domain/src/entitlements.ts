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

/** The full key sets, derived from the baseline — new keys auto-appear in the
 *  admin plan builder and resolve everywhere without extra wiring. */
export const QUOTA_KEYS = Object.keys(FREE_ENTITLEMENTS.quotas) as (keyof Quotas)[];
export const FEATURE_KEYS = Object.keys(FREE_ENTITLEMENTS.features) as (keyof Features)[];

/** Human labels for the admin UI; unknown/new keys fall back to the raw key. */
export const FEATURE_META: Record<string, { label: string; hint: string }> = {
  commerce: { label: "Commerce", hint: "Sell packages via Stripe Connect" },
  aiSuite: { label: "AI suite", hint: "AI drafting, coach notes, vision & image" },
  bfCamera: { label: "Body-fat camera", hint: "Camera body-fat estimator" },
  externalSearch: { label: "External food search", hint: "USDA / Nutritionix / FatSecret providers" },
  supplementsLabs: { label: "Supplements & labs", hint: "Supplement tracking + lab tests" },
  frontDesk: { label: "Front desk", hint: "Assistant role + sessions / booking" },
  branding: { label: "White-label branding", hint: "Login skin, accent, public blog" },
  integrations: { label: "Integrations", hint: "API / webhooks + data exports" },
  chat: { label: "Chat", hint: "Trainer ↔ client messaging" },
};
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
export const SUSPENDED_STATUSES: ReadonlySet<string> = new Set(["suspended", "canceled", "unpaid"]);

/** Clamp resolved entitlements down to free when the subscription status
 *  suspends service. Applied once, in `tenantEntitlements`, so every gate and
 *  the client-flag intersection inherit the passthrough for free. */
export function clampEntitlementsForStatus(resolved: Entitlements, status: string): Entitlements {
  return SUSPENDED_STATUSES.has(status) ? FREE_ENTITLEMENTS : resolved;
}

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

/** A grant/override blob — a deep-partial of Entitlements (raise/enable only). */
export interface EntitlementGrants {
  quotas?: Partial<Quotas>;
  features?: Partial<Features>;
  aiCredits?: { monthlyGrant: number };
}

/** Raise a quota by an override — unlimited (-1) always wins, else the max.
 *  Overrides can only lift a ceiling, never lower it. */
export function raiseQuota(base: number, over: number): number {
  if (base < 0 || over < 0) return -1;
  return Math.max(base, over);
}

/**
 * Layer a per-tenant override blob on top of the plan's resolved entitlements —
 * an admin "gift". GRANT-ONLY: an override can raise a quota, enable a feature,
 * or increase the credit grant, but it can NEVER lower a limit or disable a
 * feature. So gifting is always safe and downgrades never bite a tenant.
 */
export function mergeOverrides(base: Entitlements, json: string | null | undefined): Entitlements {
  if (!json) return base;
  let o: Partial<Entitlements>;
  try {
    o = JSON.parse(json) as Partial<Entitlements>;
  } catch {
    return base;
  }
  const quotas = { ...base.quotas };
  for (const k of QUOTA_KEYS) {
    const ov = o.quotas?.[k];
    if (typeof ov === "number") quotas[k] = raiseQuota(base.quotas[k], ov);
  }
  const features = { ...base.features };
  for (const k of FEATURE_KEYS) if (o.features?.[k] === true) features[k] = true; // enable-only
  const aiCredits = { monthlyGrant: Math.max(base.aiCredits.monthlyGrant, o.aiCredits?.monthlyGrant ?? 0) };
  return { quotas, features, aiCredits };
}

/**
 * When a plan is edited DOWN (a quota lowered, a feature disabled, the grant
 * cut), this returns the partial entitlements — valued at the OLD level — that
 * existing tenants must keep. Merge it into each affected tenant's override
 * (via `raiseOverride`) to grandfather them; new tenants get the lower plan.
 */
export function snapshotDowngrade(oldE: Entitlements, newE: Entitlements): EntitlementGrants {
  const quotas: Partial<Quotas> = {};
  for (const k of QUOTA_KEYS) {
    const o = oldE.quotas[k], n = newE.quotas[k];
    const decreased = (o < 0 && n >= 0) || (o >= 0 && n >= 0 && n < o);
    if (decreased) quotas[k] = o;
  }
  const features: Partial<Features> = {};
  for (const k of FEATURE_KEYS) if (oldE.features[k] && !newE.features[k]) features[k] = true;
  const out: EntitlementGrants = {};
  if (Object.keys(quotas).length) out.quotas = quotas;
  if (Object.keys(features).length) out.features = features;
  if (newE.aiCredits.monthlyGrant < oldE.aiCredits.monthlyGrant) out.aiCredits = { monthlyGrant: oldE.aiCredits.monthlyGrant };
  return out;
}

/** Merge grants into an existing override blob, grant-only (raise/enable),
 *  returning the new override JSON. Used to grandfather + to gift. */
export function raiseOverride(json: string | null | undefined, grants: EntitlementGrants): string {
  let cur: Partial<Entitlements> = {};
  try { if (json) cur = JSON.parse(json) as Partial<Entitlements>; } catch { cur = {}; }
  const quotas: Record<string, number> = { ...(cur.quotas ?? {}) };
  for (const [k, v] of Object.entries(grants.quotas ?? {})) {
    if (typeof v !== "number") continue;
    quotas[k] = typeof quotas[k] === "number" ? raiseQuota(quotas[k]!, v) : v;
  }
  const features: Record<string, boolean> = { ...(cur.features ?? {}) };
  for (const [k, v] of Object.entries(grants.features ?? {})) if (v) features[k] = true;
  const aiCredits = { monthlyGrant: Math.max(cur.aiCredits?.monthlyGrant ?? 0, grants.aiCredits?.monthlyGrant ?? 0) };
  return JSON.stringify({ quotas, features, aiCredits });
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
