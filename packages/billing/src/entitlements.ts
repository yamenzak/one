/**
 * ENTITLEMENTS — what a tenant's plan bought them, resolved in one place.
 *
 * Value is metered on three axes and every app has all three:
 *
 *   quotas    capacity ceilings. `-1` is unlimited.
 *   features  capability gates. Booleans, and only literal `true` enables one.
 *   credits   a monthly grant of metered units.
 *
 * The KEYS are the app's — `activeClients` and `aiSuite` in one product,
 * `skuLines` and `barcodeScan` in another — so everything here is generic over
 * them. `bindEntitlements` closes over the app's free-tier baseline once, and
 * the baseline doubles as the key registry: a key absent from it does not exist,
 * which is what makes every merge below fail closed.
 *
 * ── Three rules that all point the same way ────────────────────────────────
 *
 * **Resolution coerces by type.** A feature is enabled only by a literal `true`,
 * a quota only by a finite number. A typo in operator-edited JSON (`"aiSuite": 1`,
 * `"true"`) cannot switch on a paid capability.
 *
 * **Overrides are GRANT-ONLY.** A per-tenant override may raise a quota, enable
 * a feature or increase a grant, and can never lower or disable one. So gifting
 * is always safe, and a plan edit can never bite a tenant through their own
 * override blob.
 *
 * **A suspended status clamps to free.** Applied once, at resolution, so every
 * gate inherits it with no per-caller bookkeeping. This is the single place
 * delinquency actually bites capability.
 */

/**
 * The shape every app's entitlement set takes.
 *
 * `quotas` and `features` are `object` rather than `Record<string, number>` /
 * `Record<string, boolean>` deliberately: a TypeScript INTERFACE has no implicit
 * index signature, so an app declaring `interface Quotas { staffSeats: number }`
 * — which is what you want, for autocomplete and for typo protection — would not
 * satisfy the Record constraint. The engine narrows internally; the app keeps
 * its precise types at every call site.
 */
export interface EntitlementShape {
  quotas: object;
  features: object;
  aiCredits: { monthlyGrant: number };
  /** Free-trial length in days for a NEW subscription (0 = none). */
  trialDays: number;
}

/** A grant/override blob — a deep-partial, raise/enable only. */
export interface EntitlementGrants<E extends EntitlementShape> {
  quotas?: Partial<E["quotas"]>;
  features?: Partial<E["features"]>;
  aiCredits?: { monthlyGrant: number };
}

/**
 * Raise a quota by an override — unlimited (-1) always wins, else the max.
 * Overrides lift a ceiling; they never lower one.
 */
export function raiseQuota(base: number, over: number): number {
  if (base < 0 || over < 0) return -1;
  return Math.max(base, over);
}

/**
 * Trial length for a NEW subscription, or `null` when the plan has none.
 *
 * Null rather than 0 because the caller must then OMIT the parameter entirely —
 * Stripe rejects a zero-day trial. Clamped to Stripe's accepted 1..730 so an
 * operator typo cannot produce a request the provider 400s on.
 */
export function trialPeriodDays(ent: Pick<EntitlementShape, "trialDays">): number | null {
  const d = Math.floor(ent.trialDays);
  if (!Number.isFinite(d) || d <= 0) return null;
  return Math.min(d, 730);
}

/** Statuses under which service is withheld and entitlements clamp to free. */
export const DEFAULT_SUSPENDED_STATUSES: ReadonlySet<string> = new Set(["suspended", "canceled", "unpaid"]);

export interface EntitlementConfig {
  /** Statuses that clamp to the free baseline. */
  suspendedStatuses?: ReadonlySet<string>;
}

/**
 * Bind an app's free-tier baseline. The baseline is also the key registry: only
 * keys present in it can be resolved, merged or granted.
 */
export function bindEntitlements<E extends EntitlementShape>(free: E, cfg: EntitlementConfig = {}) {
  const freeQuotas = free.quotas as Record<string, number>;
  const freeFeatures = free.features as Record<string, boolean>;
  const quotaKeys = Object.keys(freeQuotas);
  const featureKeys = Object.keys(freeFeatures);
  const suspended = cfg.suspendedStatuses ?? DEFAULT_SUSPENDED_STATUSES;

  /** Merge a stored (possibly partial) blob onto the free baseline. */
  function resolve(json: string | null | undefined): E {
    if (!json) return free;
    let raw: Partial<EntitlementShape>;
    try {
      raw = JSON.parse(json) as Partial<EntitlementShape>;
    } catch {
      return free;
    }
    const rawFeatures = (raw.features ?? {}) as Record<string, unknown>;
    const features: Record<string, boolean> = { ...freeFeatures };
    for (const k of featureKeys) if (k in rawFeatures) features[k] = rawFeatures[k] === true;

    const rawQuotas = (raw.quotas ?? {}) as Record<string, unknown>;
    const quotas: Record<string, number> = { ...freeQuotas };
    for (const k of quotaKeys) {
      const v = rawQuotas[k];
      if (typeof v === "number" && Number.isFinite(v)) quotas[k] = v;
    }

    const grant = raw.aiCredits?.monthlyGrant;
    const trial = raw.trialDays;
    return {
      ...free,
      quotas,
      features,
      aiCredits: {
        ...free.aiCredits,
        monthlyGrant:
          typeof grant === "number" && Number.isFinite(grant) ? grant : free.aiCredits.monthlyGrant,
      },
      // Coerced like a quota and floored non-negative, so a typo cannot hand out
      // an unbounded free trial.
      trialDays: typeof trial === "number" && Number.isFinite(trial) && trial > 0 ? Math.floor(trial) : 0,
    } as E;
  }

  /** Layer a per-tenant override on top — GRANT-ONLY. */
  function merge(base: E, json: string | null | undefined): E {
    if (!json) return base;
    let o: Partial<EntitlementShape>;
    try {
      o = JSON.parse(json) as Partial<EntitlementShape>;
    } catch {
      return base;
    }
    const oQuotas = (o.quotas ?? {}) as Record<string, unknown>;
    const oFeatures = (o.features ?? {}) as Record<string, unknown>;
    const baseQuotas = base.quotas as Record<string, number>;
    const quotas: Record<string, number> = { ...baseQuotas };
    for (const k of quotaKeys) {
      const ov = oQuotas[k];
      if (typeof ov === "number") quotas[k] = raiseQuota(baseQuotas[k]!, ov);
    }
    const features: Record<string, boolean> = { ...(base.features as Record<string, boolean>) };
    for (const k of featureKeys) if (oFeatures[k] === true) features[k] = true; // enable-only
    const aiCredits = { monthlyGrant: Math.max(base.aiCredits.monthlyGrant, o.aiCredits?.monthlyGrant ?? 0) };
    // `trialDays` is deliberately NOT overridable: it is consumed once, at
    // subscription creation, so gifting it to a tenant who already subscribed
    // would be inert — and a per-tenant trial belongs at the payment provider.
    return { ...base, quotas, features, aiCredits, trialDays: base.trialDays } as E;
  }

  /** Clamp to free when the status suspends service. */
  function clamp(resolved: E, status: string): E {
    return suspended.has(status) ? free : resolved;
  }

  /**
   * When a plan is edited DOWN, the partial entitlements — valued at the OLD
   * level — that existing tenants must keep. Merge into each affected tenant's
   * override to grandfather them; new tenants get the lower plan.
   */
  function snapshotDowngrade(oldE: E, newE: E): EntitlementGrants<E> {
    const oldQuotas = oldE.quotas as Record<string, number>;
    const newQuotas = newE.quotas as Record<string, number>;
    const oldFeatures = oldE.features as Record<string, boolean>;
    const newFeatures = newE.features as Record<string, boolean>;
    const quotas: Record<string, number> = {};
    for (const k of quotaKeys) {
      const o = oldQuotas[k]!;
      const n = newQuotas[k]!;
      const decreased = (o < 0 && n >= 0) || (o >= 0 && n >= 0 && n < o);
      if (decreased) quotas[k] = o;
    }
    const features: Record<string, boolean> = {};
    for (const k of featureKeys) if (oldFeatures[k] && !newFeatures[k]) features[k] = true;
    const out: EntitlementGrants<E> = {};
    if (Object.keys(quotas).length) out.quotas = quotas as Partial<E["quotas"]>;
    if (Object.keys(features).length) out.features = features as Partial<E["features"]>;
    if (newE.aiCredits.monthlyGrant < oldE.aiCredits.monthlyGrant) {
      out.aiCredits = { monthlyGrant: oldE.aiCredits.monthlyGrant };
    }
    return out;
  }

  /** Merge grants into an existing override blob, grant-only, returning JSON. */
  function raiseOverride(json: string | null | undefined, grants: EntitlementGrants<E>): string {
    let cur: Partial<EntitlementShape> = {};
    try {
      if (json) cur = JSON.parse(json) as Partial<EntitlementShape>;
    } catch {
      cur = {};
    }
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

  return { free, quotaKeys, featureKeys, resolve, merge, clamp, snapshotDowngrade, raiseOverride };
}
