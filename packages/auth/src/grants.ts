/**
 * GRANTS — the permission algebra, with no opinion about what is being permitted.
 *
 * A member's authorization is a `{ resource: action[] }` map. Roles are
 * convenient PRESETS that fill it; an owner may attach a custom per-member grant
 * that NARROWS within the role but never exceeds it. Row-level scoping (this
 * trainer's assigned clients, this user's own record) is a separate concern
 * enforced by the route layer — this module answers only "may this role touch
 * this resource kind at all".
 *
 * ── Why the catalog is a parameter ─────────────────────────────────────────
 *
 * The four functions here are pure set algebra over strings. What the strings
 * MEAN — `client`, `plan`, `lab` in Kova; `sku`, `lot`, `purchase-order` in an
 * inventory app — is the app's registry, so it arrives as an argument rather
 * than living here. The engine is shared; the vocabulary is not.
 *
 * `bindGrants` wraps both in a closure so an app binds its registry once and its
 * call sites keep the two-argument signatures they always had.
 */

export type Grant = Record<string, string[]>;

/** Resource → the actions that exist on it. The app's registry. */
export type PermissionCatalog = Record<string, readonly string[]>;

/** Role name → the grant that role carries by default. The app's registry. */
export type RolePresets = Record<string, Grant>;

/** Keep only catalogue-valid resource/action pairs (drops anything unknown). */
export function sanitizeGrant(input: unknown, catalog: PermissionCatalog): Grant {
  const out: Grant = {};
  if (!input || typeof input !== "object") return out;
  for (const [res, acts] of Object.entries(input as Record<string, unknown>)) {
    const allowed = catalog[res];
    if (!allowed || !Array.isArray(acts)) continue;
    const keep = acts.filter((a): a is string => typeof a === "string" && allowed.includes(a));
    if (keep.length) out[res] = [...new Set(keep)];
  }
  return out;
}

/** Intersect a grant with a ceiling — keeps only pairs the ceiling also allows.
 *  The mechanism behind bounded custom grants. */
export function intersectGrant(grant: Grant, ceiling: Grant): Grant {
  const out: Grant = {};
  for (const [res, acts] of Object.entries(grant)) {
    const cap = ceiling[res];
    if (!cap) continue;
    const keep = acts.filter((a) => cap.includes(a));
    if (keep.length) out[res] = keep;
  }
  return out;
}

/** Does a grant satisfy a required `{ resource: action[] }` set? */
export function grantSatisfies(grant: Grant, needed: Record<string, string[]>): boolean {
  return Object.entries(needed).every(([res, acts]) => acts.every((a) => grant[res]?.includes(a)));
}

export interface GrantConfig {
  catalog: PermissionCatalog;
  presets: RolePresets;
  /** The preset used when a member has no role, or an unknown one. */
  fallbackRole: string;
  /**
   * Roles a custom grant may not bound.
   *
   * An owner always holds the full preset: there is nothing above them to
   * narrow toward, and letting a stored custom grant clip an owner is how a
   * tenant locks itself out of its own billing.
   */
  unboundedRoles?: readonly string[];
}

/**
 * Bind an app's registry once.
 *
 * `resolve` is the one that matters: a custom per-member grant is BOUNDED BY THE
 * ROLE — it may narrow within the role's preset but never exceed it, so a custom
 * grant cannot hand a mid-tier role the billing or settings powers its role does
 * not carry. Everything else is a convenience over the free functions above.
 */
export function bindGrants(cfg: GrantConfig) {
  const fallback = cfg.presets[cfg.fallbackRole] ?? {};
  const unbounded = new Set(cfg.unboundedRoles ?? []);
  return {
    sanitize: (input: unknown): Grant => sanitizeGrant(input, cfg.catalog),
    resolve(role: string | null, permsJson: string | null | undefined): Grant {
      const preset = cfg.presets[role ?? cfg.fallbackRole] ?? fallback;
      if (role && unbounded.has(role)) return preset;
      if (permsJson) {
        try {
          const custom = sanitizeGrant(JSON.parse(permsJson), cfg.catalog);
          if (Object.keys(custom).length) return intersectGrant(custom, preset);
        } catch {
          /* fall through to the role preset */
        }
      }
      return preset;
    },
  };
}
