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
 * **Adjustments are ABSOLUTE, and they are a different thing.** Overrides carry
 * GRANDFATHERING — written by `snapshotDowngrade` when a plan is edited down, to
 * hold existing tenants at what they were sold — and that must only ever ratchet.
 * An operator deliberately setting one tenant's ceiling is not that, and for a
 * long time it had nowhere else to live: both went through the same grant-only
 * blob, so "give this studio 10 seats" could be raised forever and never lowered,
 * granting `-1` was irreversible, and the only way back was `reset`, which threw
 * away the grandfathering as well. Adjustments are their own sparse layer, set in
 * both directions, cleared per key, and applied AFTER the override — so an
 * operator can take back exactly what an operator gave without touching a right
 * a tenant paid for.
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
 * An operator's ABSOLUTE per-tenant setting. Sparse: a key that is absent means
 * "whatever the plan and the grandfathering say", which is what makes clearing
 * one possible at all.
 */
export interface EntitlementAdjustments<E extends EntitlementShape> {
  quotas?: Partial<E["quotas"]>;
  features?: Partial<E["features"]>;
  aiCredits?: { monthlyGrant: number };
}

/** Where an entitlement's effective value came from. */
export type EntitlementSource = "plan" | "grandfathered" | "adjusted";

/** One entitlement, with its provenance — the read model behind an operator UI
 *  that has to say why a number is what it is before anyone edits it. */
export interface EntitlementTrace<T> {
  value: T;
  /** The plan's own value, before anything was layered on. */
  plan: T;
  source: EntitlementSource;
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

  /**
   * Apply the operator's ABSOLUTE adjustments over an already-merged set.
   *
   * Runs AFTER `merge`, so it can lower something the grandfathering raised —
   * which is the entire point, and is also why it must never run before: an
   * operator's number is a decision about this one tenant, and grandfathering is
   * a promise about what they bought. The decision is the later word.
   *
   * Sparse and type-coerced like everything else here: only a finite number sets
   * a quota, only a real boolean sets a feature, and an absent key falls through
   * rather than reading as 0 / false.
   */
  function adjust(base: E, json: string | null | undefined): E {
    if (!json) return base;
    let a: Partial<EntitlementShape>;
    try {
      a = JSON.parse(json) as Partial<EntitlementShape>;
    } catch {
      return base;
    }
    const aQuotas = (a.quotas ?? {}) as Record<string, unknown>;
    const aFeatures = (a.features ?? {}) as Record<string, unknown>;
    const quotas: Record<string, number> = { ...(base.quotas as Record<string, number>) };
    for (const k of quotaKeys) {
      const v = aQuotas[k];
      // `-1` is unlimited and is a legitimate setting; anything below that is not
      // a ceiling anyone meant, so it floors at 0 rather than inverting the gate.
      if (typeof v === "number" && Number.isFinite(v)) quotas[k] = v < 0 ? -1 : Math.floor(v);
    }
    const features: Record<string, boolean> = { ...(base.features as Record<string, boolean>) };
    for (const k of featureKeys) if (typeof aFeatures[k] === "boolean") features[k] = aFeatures[k] as boolean;
    const grant = a.aiCredits?.monthlyGrant;
    const aiCredits = {
      monthlyGrant: typeof grant === "number" && Number.isFinite(grant) && grant >= 0 ? Math.floor(grant) : base.aiCredits.monthlyGrant,
    };
    return { ...base, quotas, features, aiCredits } as E;
  }

  /**
   * SET one adjustment, or clear it with `null`. Returns the new blob as JSON,
   * or `null` when nothing is left — so an operator who undoes every change
   * leaves no row behind claiming the tenant is special.
   */
  function setAdjustment(
    json: string | null | undefined,
    axis: "quotas" | "features" | "aiCredits",
    key: string,
    value: number | boolean | null,
  ): string | null {
    let cur: Record<string, Record<string, unknown>> = {};
    try {
      if (json) cur = JSON.parse(json) as Record<string, Record<string, unknown>>;
    } catch {
      cur = {};
    }
    const bucket = { ...(cur[axis] ?? {}) };
    if (value === null) delete bucket[key];
    else bucket[key] = value;
    const next: Record<string, unknown> = { ...cur };
    if (Object.keys(bucket).length) next[axis] = bucket;
    else delete next[axis];
    for (const k of Object.keys(next)) if (!next[k] || !Object.keys(next[k] as object).length) delete next[k];
    return Object.keys(next).length ? JSON.stringify(next) : null;
  }

  /**
   * The three layers, with their working shown — the read model an operator
   * console needs to say WHY a number is what it is before anyone edits it.
   *
   * `resolve → merge → adjust` produces the same values this reports; the trace
   * is the same walk, not a second opinion.
   */
  function explain(planEnt: E, overridesJson: string | null | undefined, adjustmentsJson: string | null | undefined) {
    const merged = merge(planEnt, overridesJson);
    const final = adjust(merged, adjustmentsJson);
    let adj: Partial<EntitlementShape> = {};
    try {
      if (adjustmentsJson) adj = JSON.parse(adjustmentsJson) as Partial<EntitlementShape>;
    } catch {
      adj = {};
    }
    const aQuotas = (adj.quotas ?? {}) as Record<string, unknown>;
    const aFeatures = (adj.features ?? {}) as Record<string, unknown>;
    const planQuotas = planEnt.quotas as Record<string, number>;
    const planFeatures = planEnt.features as Record<string, boolean>;
    const finalQuotas = final.quotas as Record<string, number>;
    const finalFeatures = final.features as Record<string, boolean>;

    const quotas: Record<string, EntitlementTrace<number>> = {};
    for (const k of quotaKeys) {
      const source: EntitlementSource = typeof aQuotas[k] === "number" ? "adjusted"
        : finalQuotas[k] !== planQuotas[k] ? "grandfathered" : "plan";
      quotas[k] = { value: finalQuotas[k]!, plan: planQuotas[k]!, source };
    }
    const features: Record<string, EntitlementTrace<boolean>> = {};
    for (const k of featureKeys) {
      const source: EntitlementSource = typeof aFeatures[k] === "boolean" ? "adjusted"
        : finalFeatures[k] !== planFeatures[k] ? "grandfathered" : "plan";
      features[k] = { value: finalFeatures[k]!, plan: planFeatures[k]!, source };
    }
    const grantAdjusted = typeof adj.aiCredits?.monthlyGrant === "number";
    const aiCredits: EntitlementTrace<number> = {
      value: final.aiCredits.monthlyGrant,
      plan: planEnt.aiCredits.monthlyGrant,
      source: grantAdjusted ? "adjusted"
        : final.aiCredits.monthlyGrant !== planEnt.aiCredits.monthlyGrant ? "grandfathered" : "plan",
    };
    return { effective: final, quotas, features, aiCredits };
  }

  return { free, quotaKeys, featureKeys, resolve, merge, adjust, clamp, snapshotDowngrade, raiseOverride, setAdjustment, explain };
}
