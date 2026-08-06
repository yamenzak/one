import * as React from "react";

/**
 * Dashboard-side authorization mirror (server is the real boundary; this just
 * hides/disables what would 403). A member's access is now a per-user permission
 * grant delivered by `/api/me` (custom, or the role preset); `useCan` checks that
 * grant, falling back to the role MATRIX only when no grant is present (e.g. an
 * older session or a board user).
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
  { resource: "member", label: "Team", actions: ["read", "create", "update"] },
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
    member: ["read", "create", "update"],
    analytics: ["read"],
    billing: ["read"],
    settings: ["read"],
  },
  receptionist: { screen: ["read", "control"], channel: ["read"], board: ["read", "operate"], station: ["read"] },
  viewer: { screen: ["read"], channel: ["read"], widget: ["read"], content: ["read"], board: ["read"], station: ["read"], analytics: ["read"], billing: ["read"] },
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
