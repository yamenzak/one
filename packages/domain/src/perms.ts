/**
 * Per-member permissions (SPEC §4) — pure.
 *
 * A member's authorization is a `{ resource: action[] }` grant map. Roles are
 * convenient PRESETS that fill the grant; owners may attach a custom per-member
 * grant (`member.permissions_json`) — the "assigned level" dial beyond roster
 * scoping. Row-level scoping (trainer -> assigned clients only, client -> own
 * record only) is enforced separately by the route layer; this module answers
 * "may this role touch this resource kind at all".
 */

export const TENANT_ROLES = ["owner", "trainer", "assistant", "client"] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

/** Every grantable resource → its actions. */
export const PERMISSION_CATALOG: Record<string, string[]> = {
  client: ["read", "create", "update", "archive"],
  plan: ["read", "create", "update", "publish", "delete"], // workout + meal plans/templates
  library: ["read", "create", "update", "delete"], // exercises, foods
  tracking: ["read", "create", "update"], // logs, check-ins, measurements (own-record for clients)
  goal: ["read", "create", "update"],
  supplement: ["read", "create", "update", "delete"],
  lab: ["read", "create", "update", "delete"],
  content: ["read", "create", "update", "publish", "delete"], // content hub / blog
  session: ["read", "create", "update"], // trainer sessions / front desk
  package: ["read", "create", "update", "delete"], // commerce: packages, codes
  member: ["read", "create", "update"], // staff management
  report: ["read"],
  billing: ["read", "manage"], // platform plan + credits + Connect
  settings: ["read", "manage"],
  ai: ["use"],
};

export type Grant = Record<string, string[]>;

const full = (): Grant => {
  const g: Grant = {};
  for (const [r, a] of Object.entries(PERMISSION_CATALOG)) g[r] = [...a];
  return g;
};

/** Role presets — the default grant a role fills in. */
export const ROLE_PRESETS: Record<string, Grant> = {
  owner: full(),
  trainer: {
    client: ["read", "create", "update"],
    plan: ["read", "create", "update", "publish", "delete"],
    library: ["read", "create", "update", "delete"],
    tracking: ["read", "create", "update"],
    goal: ["read", "create", "update"],
    supplement: ["read", "create", "update", "delete"],
    lab: ["read", "create", "update", "delete"],
    content: ["read", "create", "update", "publish", "delete"],
    session: ["read", "create", "update"],
    package: ["read"],
    report: ["read"],
    ai: ["use"],
  },
  assistant: {
    client: ["read"],
    session: ["read", "create", "update"],
    package: ["read"],
    content: ["read"],
  },
  client: {
    tracking: ["read", "create", "update"], // own record only (row-level in routes)
    plan: ["read"],
    content: ["read"],
    ai: ["use"],
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

/** Effective grant: stored custom grant if any, else the role preset. */
export function resolvePermissions(role: string | null, permsJson: string | null | undefined): Grant {
  if (permsJson) {
    try {
      const g = sanitizePermissions(JSON.parse(permsJson));
      if (Object.keys(g).length) return g;
    } catch {
      /* fall through to role preset */
    }
  }
  return ROLE_PRESETS[role ?? "client"] ?? ROLE_PRESETS.client!;
}

/** Does a grant satisfy a required `{ resource: action[] }` permission set? */
export function grantSatisfies(grant: Grant, needed: Record<string, string[]>): boolean {
  return Object.entries(needed).every(([res, acts]) => acts.every((a) => grant[res]?.includes(a)));
}
