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
    // Read-only views of things staff prescribe or sell TO the client. Without
    // these the client's own screens 403: Wellness (their supplements + lab
    // requests) and Plans & access (the studio's packages) both fan out reads
    // that the action gate demands `supplement`/`lab`/`package` for, and a
    // tenant requiring active access pins the client to that very screen — so a
    // missing read here bricks the whole app for them. No write actions:
    // prescribing, ordering labs, booking and selling stay staff-only, and each
    // read is narrowed to the client's own rows by requireClientAccess.
    goal: ["read"],
    supplement: ["read"],
    lab: ["read"],
    session: ["read"],
    package: ["read"],
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

/** Intersect a grant with a ceiling — keeps only (resource, action) pairs the
 *  ceiling also allows. The mechanism behind bounded custom grants. */
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

/**
 * Effective grant. A custom per-member grant is **bounded by the role** — it may
 * narrow within the role's preset but never exceed it (so a custom grant can't
 * hand a trainer billing/settings powers their role doesn't carry). The owner is
 * the one unbounded role: they always hold the full grant, custom or not.
 */
export function resolvePermissions(role: string | null, permsJson: string | null | undefined): Grant {
  const preset = ROLE_PRESETS[role ?? "client"] ?? ROLE_PRESETS.client!;
  if (role === "owner") return preset; // unbounded — full grant, nothing to exceed
  if (permsJson) {
    try {
      const custom = sanitizePermissions(JSON.parse(permsJson));
      if (Object.keys(custom).length) return intersectGrant(custom, preset);
    } catch {
      /* fall through to role preset */
    }
  }
  return preset;
}

/** Does a grant satisfy a required `{ resource: action[] }` permission set? */
export function grantSatisfies(grant: Grant, needed: Record<string, string[]>): boolean {
  return Object.entries(needed).every(([res, acts]) => acts.every((a) => grant[res]?.includes(a)));
}
