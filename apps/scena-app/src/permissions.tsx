import * as React from "react";

/**
 * Dashboard-side authorization mirror. The SERVER is the boundary; this only
 * hides and disables what would 403 anyway.
 *
 * `useCan` reads the per-member grant `/api/me` resolves — which is server-side,
 * bounded by the role, and always present now. The MATRIX below is the fallback
 * for a session that predates that, and the catalog is what the Team permission
 * editor renders as a checklist.
 *
 * ⚠️ THIS IS THE THIRD COPY OF A REGISTRY THAT HAS ONE HOME.
 *
 * `access.ts` defines the roles; `perms.ts` DERIVES the presets from it (it used
 * to restate them, and the copy had silently dropped both board roles, so every
 * station account resolved the `viewer` grant). This file is the same mistake
 * one layer out, and it had already drifted the same way: no board roles, and a
 * `member: "read"` action Better Auth does not define — a box an owner could
 * tick that resolves to nothing.
 *
 * Both are corrected below rather than derived, because deriving means fetching:
 * `/api/staff` already ships `roles` (with each role's grant) and `catalog`, and
 * the Team screen should render from that. That is Stage 7's rebuild, and it is
 * what DELETES this registry rather than repairing it a third time.
 */

/** The grantable surface — mirror of the server's PERMISSION_CATALOG (perms.ts),
 *  used by the Team permission editor. */
export const PERMISSION_CATALOG: { resource: string; label: string; actions: string[] }[] = [
  { resource: "screen", label: "Screens", actions: ["read", "control", "create", "update", "delete"] },
  { resource: "channel", label: "Channels", actions: ["read", "create", "update", "delete", "publish"] },
  { resource: "widget", label: "Widgets", actions: ["read", "create", "update", "delete"] },
  { resource: "content", label: "Content (playlists, media, feeds, ads, music)", actions: ["read", "create", "update", "delete"] },
  { resource: "board", label: "Live boards", actions: ["read", "operate", "create", "update", "delete"] },
  { resource: "station", label: "Board stations", actions: ["read", "create", "update", "delete"] },
  // Better Auth's org statement is `["create","update","delete"]` — there is no
  // `read`. Offering one produced a checkbox that saved and then resolved to
  // nothing, because the server intersects with the role preset.
  { resource: "member", label: "Team", actions: ["create", "update", "delete"] },
  { resource: "analytics", label: "Analytics", actions: ["read"] },
  { resource: "billing", label: "Billing", actions: ["read", "manage"] },
  { resource: "settings", label: "Settings", actions: ["read", "manage"] },
];

/** Role presets — mirror of perms.ts ROLE_PRESETS (fill the checklist). */
export const ROLE_PRESETS: Record<string, Record<string, string[]>> = {
  owner: Object.fromEntries(PERMISSION_CATALOG.map((r) => [r.resource, [...r.actions]])),
  operator: {
    screen: ["read", "control", "create", "update"],
    channel: ["read", "create", "update", "delete", "publish"],
    widget: ["read", "create", "update", "delete"],
    content: ["read", "create", "update", "delete"],
    board: ["read", "operate", "create", "update", "delete"],
    station: ["read", "update"],
    member: ["create", "update", "delete"],
    analytics: ["read"],
    billing: ["read"],
    settings: ["read"],
  },
  receptionist: { screen: ["read", "control"], channel: ["read"], board: ["read", "operate"], station: ["read"] },
  viewer: { screen: ["read"], channel: ["read"], widget: ["read"], content: ["read"], board: ["read"], station: ["read"], analytics: ["read"], billing: ["read"] },
  /*
    THE BOARD ROLES, which were absent.

    A station account with no grant fell through to `MATRIX[role] ?? viewer` and
    read as though it could see billing, analytics and the whole fleet. The
    server never agreed — its own presets are derived and correct — so this was
    a UI that offered a counter device controls it would then be refused. Worse
    than a missing button either way.

    Both roles carry the SAME grant on purpose: the difference between a
    coordinator and a station is WHICH board rows they may touch, which is
    row-level and lives in `board_users`, not in an action list.
  */
  board_coordinator: { board: ["read", "operate"] },
  board_station: { board: ["read", "operate"] },
};

const MATRIX = ROLE_PRESETS;

interface Perms {
  role: string | null;
  grant: Record<string, string[]> | null;
}
const PermCtx = React.createContext<Perms>({ role: null, grant: null });

export function can(perms: Perms, resource: string, action: string): boolean {
  if (perms.grant) return !!perms.grant[resource]?.includes(action);
  return !!MATRIX[perms.role ?? "viewer"]?.[resource]?.includes(action);
}

export function RoleProvider({ role, permissions, children }: { role: string | null; permissions?: Record<string, string[]> | null; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ role, grant: permissions ?? null }), [role, permissions]);
  return <PermCtx.Provider value={value}>{children}</PermCtx.Provider>;
}

/** `const can = useCan(); can("channel", "publish")`. */
export function useCan(): (resource: string, action: string) => boolean {
  const perms = React.useContext(PermCtx);
  return React.useCallback((resource: string, action: string) => can(perms, resource, action), [perms]);
}
