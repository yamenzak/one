/**
 * Per-member permissions (SPEC §4) — Kova's REGISTRY, over `@4dl/auth`'s algebra.
 *
 * The set algebra (sanitize, intersect, satisfy, resolve-bounded-by-role) is
 * product-agnostic and lives in `@4dl/auth` `grants.ts`. What is Kova's is the
 * vocabulary below: which resources exist, which actions they carry, and what
 * each role starts with. Row-level scoping (trainer → assigned clients only,
 * client → own record only) is enforced by the route layer; this answers "may
 * this role touch this resource kind at all".
 *
 * The wrappers at the bottom bind the registry once so every call site keeps the
 * signature it always had.
 */

import { bindGrants, grantSatisfies, intersectGrant, sanitizeGrant, type Grant } from "@4dl/auth/model";

export { grantSatisfies, intersectGrant, type Grant };

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

/**
 * Kova's registry, bound to the shared algebra.
 *
 * `owner` is the one unbounded role: a stored custom grant may narrow any other
 * role within its preset, but an owner always holds the full grant. Letting a
 * custom grant clip an owner is how a studio locks itself out of its own billing.
 */
const grants = bindGrants({
  catalog: PERMISSION_CATALOG,
  presets: ROLE_PRESETS,
  fallbackRole: "client",
  unboundedRoles: ["owner"],
});

/** Keep only catalogue-valid resource/action pairs (drops anything unknown). */
export const sanitizePermissions = (input: unknown): Grant => grants.sanitize(input);

/**
 * Effective grant. A custom per-member grant is BOUNDED BY THE ROLE — it may
 * narrow within the role's preset but never exceed it, so a custom grant cannot
 * hand a trainer the billing or settings powers their role does not carry.
 */
export const resolvePermissions = (role: string | null, permsJson: string | null | undefined): Grant =>
  grants.resolve(role, permsJson);
