/**
 * WHAT SOMEBODY MAY DO, AND WHO MAY GIVE IT TO THEM.
 *
 * ⚠️ TWO KINDS OF AUTHORITY ON ONE MEMBERSHIP, AND THE SPLIT IS THE MULTI-APP
 * MODEL (D15). A PLATFORM role says what somebody may do to the WORKSPACE —
 * manage members, settings, the bill — in keys identical across every product.
 * An APP role says what they may do INSIDE one product, in that product's own
 * vocabulary, held per enabled app. A single flat role cannot be both: "trainer"
 * names Kova keys and names nothing in the next app, and the failure is silent
 * 403s in the second product for everybody. Per-app MEMBERSHIPS are the other
 * wrong answer — two rosters, two invitations, two seats for one person, the
 * seam D1 exists to close.
 *
 * ⚠️ NOBODY MAY GRANT WHAT THEY DO NOT HOLD. Without that one rule, anybody who
 * can edit access escalates in two steps: give yourself the key you lack, then
 * use it. It is asked of platform roles and of each app's roles separately,
 * because bounding one and not the other is the same escalation with a shorter
 * first step.
 *
 * ⚠️ AND A ROLE IS A NAME FOR A BUNDLE, NEVER A COPY OF ONE. Storing the
 * permission SET on a membership row is the shape that rots: a key added to a
 * role reaches nobody who joined before it, and one removed keeps working for
 * everybody who did.
 *
 * ⚠️ A GRANT MAY CARRY A CLOCK, AND AN EXPIRED GRANT IS NOT HELD. This is the
 * seam the package rail stands on (D16): a purchase applies keys with an
 * `until`, and the ONE resolver below is where they stop counting — not N
 * checks in N apps. Bare keys (no clock) remain what they were: a person's
 * deliberate exception.
 *
 * Layer 2. Imports primitives.
 */

import type { AccountId, TenantId } from "./primitives.js";

/* -------------------------------------------------------- platform authority --- */

/**
 * ⚠️ THE PLATFORM'S OWN KEYS, IDENTICAL IN EVERY PRODUCT. An app may NAME them
 * on its operations and screens — "the money screen needs `billing:read`" — but
 * may never declare them as its own or put them in its role bundles: they are
 * granted by the platform role alone, so "who runs this workspace" means one
 * thing however many products it holds.
 *
 * ⚠️ `billing:*`, NOT `money:*`. A product about money (invoices a studio
 * raises) legitimately owns a `money` vocabulary; the workspace's bill WITH US
 * is a different fact, and sharing a prefix would make one screen's key
 * accidentally open the other's.
 */
export const PLATFORM_PERMISSIONS = [
  "member:read", "member:manage", "tenant:manage", "billing:read", "billing:manage",
] as const;

/**
 * ⚠️ FOUR PLATFORM ROLES AND NO REGISTRY TO EDIT. These are the workspace's
 * constitutional offices, the same in every product — which is what lets the
 * People screen, the seat count and the stranding rule exist once. An app's
 * creativity lives in its OWN roles; a workspace's lives in custom app roles.
 *
 *   owner     everything, including the bill.
 *   manager   runs the roster and the settings; sees the bill, cannot change it.
 *   staff     is on the team. App roles say what they do all day.
 *   customer  is IN the workspace — a client, a buyer — with no workspace
 *             authority at all. Costs no seat, ever.
 */
export const PLATFORM_ROLES: RoleRegistry = {
  owner: ["member:read", "member:manage", "tenant:manage", "billing:read", "billing:manage"],
  manager: ["member:read", "member:manage", "tenant:manage", "billing:read"],
  staff: ["member:read"],
  customer: [],
};

/** ⚠️ What somebody holds before they belong to anything — see `personal.ts`. */
export const PLATFORM_PERSONAL: readonly string[] = ["tenant:create"];

export type RoleRegistry = Readonly<Record<string, readonly string[]>>;

/* -------------------------------------------------------------- membership --- */

/**
 * ⚠️ A GRANT IS A KEY WITH A PROVENANCE. `app` scopes it (absent = platform),
 * `until` is the clock (absent = a person's standing exception), `source` says
 * where it came from — `"pkg:strength"` is what lets a package's grants be
 * found, extended and removed as one thing.
 */
export interface Grant {
  readonly key: string;
  readonly app?: string;
  /** ISO instant. At or past it, the grant is not held. */
  readonly until?: string;
  readonly source?: string;
}

export interface Membership {
  readonly accountId: AccountId;
  readonly tenantId: TenantId;
  /** One of `PLATFORM_ROLES`' keys. */
  readonly platformRole: string;
  /** appId → that app's role name. Absent app = not a user of it. */
  readonly appRoles: Readonly<Record<string, string>>;
  readonly grants?: readonly Grant[];
  /** Withheld keys. Applied last, so it always wins. */
  readonly revoked?: readonly string[];
}

/**
 * What one person may do, in one app's context.
 *
 * ⚠️ ONE RESOLVER, AND EVERY READER USES IT — the gate, the audience test, the
 * settings screens, the tool catalogue, the navigation. Two implementations of
 * "what can this person do" is how a screen comes to promise what a route
 * refuses.
 *
 * ⚠️ THE ORDER: platform role ∪ app role ∪ live grants, MINUS revoked — and
 * revocation is last because "their role, except this one thing" is only
 * expressible if nothing follows it. An expired grant contributes nothing: that
 * single comparison is the whole lapse mechanism every app inherits (D16).
 */
export function permissionsFor(
  m: Membership | null,
  appId: string | null,
  appRoles: RoleRegistry = {},
  now?: string,
): ReadonlySet<string> {
  if (!m) return new Set();
  const out = new Set<string>(PLATFORM_ROLES[m.platformRole] ?? []);
  if (appId !== null) {
    const named = m.appRoles[appId];
    for (const p of (named ? appRoles[named] : undefined) ?? []) out.add(p);
  }
  for (const g of m.grants ?? []) {
    if (g.app !== undefined && g.app !== appId) continue;
    if (g.until !== undefined && now !== undefined && g.until <= now) continue;
    out.add(g.key);
  }
  for (const p of m.revoked ?? []) out.delete(p);
  return out;
}

/* -------------------------------------------------------------- the bounds --- */

/**
 * ⚠️ A ROLE IS GRANTABLE ONLY WHEN THE GRANTER HOLDS EVERY KEY IT CARRIES, so
 * "assign a role" cannot be a back door around "grant a permission". Asked at
 * the invitation and at the re-role, per authority: platform roles against the
 * granter's platform keys, each app's role against the granter's keys IN THAT
 * APP.
 */
export const canGrant = (granter: ReadonlySet<string>, keys: readonly string[]): boolean =>
  keys.every((k) => granter.has(k));

export const canAssign = (granter: ReadonlySet<string>, role: string, roles: RoleRegistry): boolean =>
  canGrant(granter, roles[role] ?? []);

/* ------------------------------------------------------------ custom roles --- */

/**
 * ⚠️ A CUSTOM ROLE COMPOSES ONE APP'S KEYS. The platform's four offices are not
 * composable — a fifth kind of "who runs this place" is a governance question,
 * not a bundle — and a role spanning two apps would be a name that means
 * something different depending on which product is looking at it.
 */
export interface CustomRole {
  readonly id: string;
  readonly app: string;
  readonly name: string;
  readonly permissions: readonly string[];
}

/**
 * ⚠️ A ROLE ID IS A SLUG BECAUSE IT IS A KEY IN A MERGED REGISTRY. One with a
 * space or a dot in it is a key nobody can type into a `roles: [...]` and a row
 * that resolves to nothing.
 */
export const roleIdOk = (id: string): boolean => /^[a-z][a-z0-9-]{1,38}$/.test(id);

/**
 * ⚠️ THE APP'S OWN ROLES WIN, AND THE ORDER IS THE SECURITY PROPERTY. Spread the
 * other way a workspace could redefine a declared role, and everybody holding it
 * would hold whatever that workspace said.
 */
export const registryWith = (declared: RoleRegistry, custom: readonly CustomRole[]): RoleRegistry => ({
  ...Object.fromEntries(custom.map((r) => [r.id, r.permissions])),
  ...declared,
});

export type RoleRefusal = "id" | "declared" | "undeclared_permission" | "beyond_you";

/**
 * ⚠️ EACH REFUSAL IS A DIFFERENT THING TO DO NEXT. A bad id is a typo; a
 * declared name is a role that already exists; an undeclared key is one that
 * would grant nothing; `beyond_you` is the escalation. Collapsed into
 * "invalid", the last one reads as a bug in the form.
 */
/*
  ⚠️ `beyond_you` IS THE ESCALATION AND IT IS THE ONE TO READ TWICE. A workspace
  composing a role out of keys its author does not hold is the shortest path
  there is from "I can manage people" to "I can do anything": make the role,
  assign it to yourself, and the ceiling is gone. `saveRole` is the only writer
  that reaches this, and it is why that write is guarded rather than validated.
*/
export function refuseRole(
  role: CustomRole, declared: RoleRegistry, known: ReadonlySet<string>, author: ReadonlySet<string>,
): RoleRefusal | null {
  if (!roleIdOk(role.id)) return "id";
  if (declared[role.id]) return "declared";
  if (role.permissions.some((p) => !known.has(p))) return "undeclared_permission";
  if (role.permissions.some((p) => !author.has(p))) return "beyond_you";
  return null;
}

/* ------------------------------------------------------------- stranding --- */

/**
 * WHETHER REMOVING SOMEBODY WOULD LEAVE NOBODY IN CHARGE.
 *
 * ⚠️ A WORKSPACE WITH NOBODY WHO CAN MANAGE MEMBERS IS NOT CLOSED, IT IS
 * UNREACHABLE. Its records are intact, its bill keeps running, and nobody left
 * inside can invite anybody back in. Asked of the PLATFORM authority alone,
 * because running the workspace is the platform's question — an app role
 * cannot confer it and a custom role cannot compose it.
 */
export function wouldStrand(
  members: readonly Membership[], accountId: AccountId, key = "member:manage",
): boolean {
  const manages = (m: Membership) => permissionsFor(m, null).has(key);
  const target = members.find((m) => m.accountId === accountId);
  if (!target || !manages(target)) return false;
  return members.filter(manages).length === 1;
}

/* -------------------------------------------------------------- the seats --- */

export interface SeatSpec {
  /**
   * ⚠️ WHICH PLATFORM ROLES COST A SEAT. Platform roles, because a seat is a
   * workspace fact — a person is on the team or they are not, however many
   * products the team uses. `customer` may never be listed: customers are the
   * product, not the staff.
   */
  readonly counts: readonly string[];
  /** The entitlement key the count is checked against. */
  readonly entitlement: string;
}

/**
 * ⚠️ AN INVITATION OCCUPIES A SEAT BEFORE IT IS ANSWERED. Counting only accepted
 * members lets anybody past the ceiling by inviting twenty people and waiting —
 * and the overage then arrives days later as a bill rather than as a refusal.
 */
export const seatsUsed = (members: readonly Membership[], counts: readonly string[]): number =>
  members.filter((m) => counts.includes(m.platformRole)).length;

/* -------------------------------------------------------------- the spec --- */

/**
 * A BUNDLE A WORKSPACE CAN ADOPT AS ONE OF ITS OWN ROLES.
 *
 * ⚠️ IT IS A STARTING POINT, NOT A ROLE. A declared role is the app's and every
 * workspace has it; a preset is a shape the app knows about — "the person on the
 * floor in a kitchen", "the one who signs for a sterilisation load" — that a
 * workspace COPIES into a role of its own and then owns. The difference matters
 * the day the app ships a new key: a declared role gains it everywhere, and a
 * role somebody adopted does not, because it is theirs.
 *
 * ⚠️ AND IT IS THE ONLY HONEST WAY A PRODUCT CAN SHAPE ACCESS TO A SETTING. What
 * an app knows is that a clinic and a basement want different people to be able
 * to release a load; what it may not do is write a workspace's roles for it,
 * which is a governance act under `member:manage` — a different authority from
 * the one that edits a product's settings. So the app OFFERS and the workspace
 * ADOPTS, through the same bounded write anybody composing a role goes through.
 */
export interface RolePreset {
  /** The id the adopted role gets. A slug — see `roleIdOk`. */
  readonly id: string;
  readonly name: string;
  /** What this person does all day, in one line. It is the row. */
  readonly said: string;
  readonly permissions: readonly string[];
}

export interface AccessSpec {
  /** The app's OWN keys. Naming a platform key here is refused — see below. */
  readonly permissions: readonly string[];
  readonly roles: RoleRegistry;
  /**
   * ⚠️ SHAPES A WORKSPACE CAN START FROM, and the reason they are not roles is
   * above. Every key one names must be one this app declares — a preset
   * granting nothing is a bundle somebody adopts and then wonders about.
   */
  readonly presets?: readonly RolePreset[];
  /**
   * The app role a workspace's creator gets. Absent, the first declared role —
   * stated so a manifest's role order is visibly load-bearing.
   */
  readonly founding?: string;
  readonly seats: SeatSpec;
}

/** The app role a new workspace's creator holds in this app. */
export const foundingAppRole = (access: AccessSpec): string | null =>
  access.founding ?? Object.keys(access.roles)[0] ?? null;

/**
 * ⚠️ AN APP CLAIMING A PLATFORM KEY WOULD LET ITS ROLES GRANT WORKSPACE
 * AUTHORITY — a product update quietly minting managers. Named as its own
 * refusal because the fix (delete the line) is different from an undeclared
 * key's (declare it).
 */
export const claimsPlatform = (access: AccessSpec): readonly string[] => {
  const platform = new Set<string>([...PLATFORM_PERMISSIONS, ...PLATFORM_PERSONAL]);
  return [
    ...access.permissions.filter((p) => platform.has(p)),
    ...[...new Set(Object.values(access.roles).flat())].filter((p) => platform.has(p)),
  ];
};

/**
 * ⚠️ A PERMISSION NO ROLE HOLDS IS DECLARED AND UNHOLDABLE. Every operation
 * naming it refuses every caller, for ever, and the 403 is indistinguishable
 * from one somebody forgot to grant. Grants can hand out any declared key, so
 * this is a warning about roles, not a wall — but an app whose key is ONLY
 * reachable by grant should know it said so.
 */
export const unholdable = (access: AccessSpec): readonly string[] => {
  const held = new Set(Object.values(access.roles).flat());
  return access.permissions.filter((p) => !held.has(p));
};

/**
 * ⚠️ A ROLE NAMING AN UNDECLARED KEY GRANTS NOTHING. It looks like access
 * somebody has and behaves like access they do not — the hardest permission bug
 * to see from either side. Platform keys are known everywhere and app keys must
 * be the app's own.
 */
export const undeclared = (access: AccessSpec): readonly string[] => {
  const known = new Set([...access.permissions, ...PLATFORM_PERMISSIONS, ...PLATFORM_PERSONAL]);
  return [...new Set(Object.values(access.roles).flat())].filter((p) => !known.has(p));
};
