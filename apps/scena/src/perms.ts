/**
 * Per-user permissions (§25 · custom access). A member's authorization is a
 * `{ resource: action[] }` grant map. Historically this was derived from a fixed
 * role; now an admin can grant any subset at user-creation, stored per member as
 * `permissions_json`. Roles survive as convenient PRESETS that fill the grant.
 *
 * This is the single source of truth for the grantable surface (CATALOG) and the
 * role presets, used by: the create/update member store, the session `can()`
 * check, `/api/me` resolution, and (mirrored) the dashboard's permission editor.
 */

/** Every grantable resource → its actions (the Scena-relevant subset of the
 *  Better Auth access statement; org-management perms stay role-driven). */
export const PERMISSION_CATALOG: Record<string, string[]> = {
  screen: ["read", "control", "create", "update", "delete"],
  channel: ["read", "create", "update", "delete", "publish"],
  widget: ["read", "create", "update", "delete"],
  content: ["read", "create", "update", "delete"],
  board: ["read", "operate", "create", "update", "delete"],
  station: ["read", "create", "update", "delete"],
  member: ["read", "create", "update"],
  analytics: ["read"],
  billing: ["read", "manage"],
  settings: ["read", "manage"],
};

type Grant = Record<string, string[]>;

const full = (): Grant => {
  const g: Grant = {};
  for (const [r, a] of Object.entries(PERMISSION_CATALOG)) g[r] = [...a];
  return g;
};

/** Role presets — the default grant a role fills in. Mirror of access.ts. */
export const ROLE_PRESETS: Record<string, Grant> = {
  owner: full(),
  operator: {
    screen: ["read", "control", "create", "update"],
    channel: ["read", "create", "update", "delete", "publish"],
    widget: ["read", "create", "update", "delete"],
    content: ["read", "create", "update", "delete"],
    board: ["read", "operate", "create", "update", "delete"],
    station: ["read", "update"],
    member: ["read", "create", "update"],
    analytics: ["read"],
    billing: ["read"],
    settings: ["read"],
  },
  receptionist: {
    screen: ["read", "control"],
    channel: ["read"],
    board: ["read", "operate"],
    station: ["read"],
  },
  viewer: {
    screen: ["read"],
    channel: ["read"],
    widget: ["read"],
    content: ["read"],
    board: ["read"],
    station: ["read"],
    analytics: ["read"],
    billing: ["read"],
  },
};

/** Keep only catalogue-valid resource/action pairs (drops anything unknown). */
export function sanitizePermissions(input: unknown): Grant {
  const out: Grant = {};
  if (!input || typeof input !== "object") return out;
  for (const [res, acts] of Object.entries(input as Record<string, unknown>)) {
    const allowed = PERMISSION_CATALOG[res];
    if (!allowed || !Array.isArray(acts)) continue;
    const keep = acts.filter((a): a is string => typeof a === "string" && allowed.includes(a));
    if (keep.length) out[res] = [...new Set(keep)];
  }
  return out;
}

/** The effective grant for a member: their stored custom grant if any, else the
 *  role preset (falling back to viewer). */
export function resolvePermissions(role: string | null, permsJson: string | null | undefined): Grant {
  if (permsJson) {
    try {
      const g = sanitizePermissions(JSON.parse(permsJson));
      if (Object.keys(g).length) return g;
    } catch { /* fall through to role preset */ }
  }
  return ROLE_PRESETS[role ?? "viewer"] ?? ROLE_PRESETS.viewer!;
}

/** Does a grant satisfy a required `{ resource: action[] }` permission set? */
export function grantSatisfies(grant: Grant, needed: Record<string, string[]>): boolean {
  return Object.entries(needed).every(([res, acts]) => acts.every((a) => grant[res]?.includes(a)));
}
