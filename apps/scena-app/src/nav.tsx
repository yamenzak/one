import type { NavGroup } from "@4dl/ui";
import { icons } from "./icons.js";
import { featureOn } from "./entitlements.js";

/**
 * Sidebar structure — Displays-first. The screen (a Display) and its channels
 * lead; the reusable slide/music/widget/media/source/ad entities are grouped as
 * "Building blocks" (compose these into a display when you scale, but you don't
 * start here); live boards, insights, and account settings follow.
 */
export const NAV: NavGroup[] = [
  {
    label: "Displays",
    items: [
      { key: "screens", label: "Screens", icon: icons.screens },
      { key: "channels", label: "Channels", icon: icons.channels },
    ],
  },
  {
    label: "Building blocks",
    items: [
      { key: "playlists", label: "Slide playlists", icon: icons.playlists },
      { key: "music", label: "Music playlists", icon: icons.music },
      { key: "profiles", label: "Widget profiles", icon: icons.widgets },
      { key: "media", label: "Media library", icon: icons.media },
      { key: "feeds", label: "Sources", icon: icons.feeds },
      { key: "ads", label: "Ads", icon: icons.ads },
    ],
  },
  {
    label: "Live boards",
    items: [
      { key: "boards", label: "Live boards", icon: icons.boards },
    ],
  },
  {
    label: "Insights",
    items: [
      { key: "analytics", label: "Analytics", icon: icons.analytics },
      { key: "alerts", label: "Alerts", icon: icons.alerts },
    ],
  },
  {
    label: "Account",
    items: [
      { key: "team", label: "Team", icon: icons.team },
      { key: "billing", label: "Billing", icon: icons.billing },
      { key: "settings", label: "Settings", icon: icons.settings },
    ],
  },
];

export const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  screens: { title: "Screens", subtitle: "Pair, monitor, and control your fleet" },
  channels: { title: "Channels", subtitle: "Compose a slide playlist, music, and a widget profile" },
  playlists: { title: "Slide playlists", subtitle: "Reusable slide sequences, shared across channels" },
  media: { title: "Media library", subtitle: "Every uploaded and generated asset, in one place" },
  profiles: { title: "Widget profiles", subtitle: "Reusable widget scenes, shared across channels" },
  widgets: { title: "Widget builder", subtitle: "Compose the on-screen scene" },
  boards: { title: "Live boards", subtitle: "Queues, room status & scoreboards" },
  feeds: { title: "Sources", subtitle: "RSS, API, Google Sheets, and manual data" },
  analytics: { title: "Analytics", subtitle: "Proof-of-play and uptime" },
  alerts: { title: "Alerts", subtitle: "Health monitoring and delivery" },
  billing: { title: "Billing", subtitle: "Plan, quotas, and AI credits" },
  music: { title: "Music playlists", subtitle: "Reusable clock-synced playlists, shared across channels" },
  ads: { title: "Ad profiles", subtitle: "Reusable rotations of audio, video, and command interrupts" },
  // Kept because the sidebar item still needs a label, but it is no longer a
  // page in this app: selecting it loads the `admin.` origin (App.tsx). The
  // console lives there and nowhere else — see AdminDoor.tsx.
  admin: { title: "Admin", subtitle: "The platform console, on its own address" },
  team: { title: "Team", subtitle: "Staff logins, roles, and access" },
  settings: { title: "Settings", subtitle: "Weather, locations, and integrations" },
};

/** The Admin nav item — appended to the sidebar only for allowed emails. */
export const ADMIN_NAV = { key: "admin", label: "Admin", icon: icons.admin };

/** Which nav keys each RBAC role may see (fallback when no permission grant). */
const ROLE_NAV: Record<string, string[] | "all"> = {
  owner: "all",
  operator: ["screens", "channels", "playlists", "media", "music", "profiles", "widgets", "boards", "feeds", "ads", "analytics", "alerts", "team", "billing", "settings"],
  receptionist: ["screens", "boards"],
  viewer: ["screens", "analytics", "alerts", "billing"],
};

/** Nav key → the permission (resource:action) it requires. Drives the sidebar
 *  from the caller's grant, so custom per-user permissions shape the nav. */
const NAV_PERM: Record<string, [string, string]> = {
  screens: ["screen", "read"],
  channels: ["channel", "read"],
  playlists: ["content", "read"],
  media: ["content", "read"],
  music: ["content", "read"],
  profiles: ["widget", "read"],
  boards: ["board", "read"],
  feeds: ["content", "read"],
  ads: ["content", "read"],
  analytics: ["analytics", "read"],
  alerts: ["analytics", "read"],
  team: ["member", "read"],
  billing: ["billing", "read"],
  settings: ["settings", "read"],
};

function grantAllows(key: string, grant: Record<string, string[]>): boolean {
  const need = NAV_PERM[key];
  if (!need) return true; // unmapped keys (e.g. widgets builder) always allowed
  return !!grant[need[0]]?.includes(need[1]);
}

/** Nav keys hidden when the tenant's plan doesn't include the feature. Only the
 *  clearly-premium modules are gated; core pages always show. Platform admins are
 *  exempt (they manage all tenants). Fail-open: unknown/absent feature ⇒ shown. */
const NAV_FEATURE: Record<string, string> = {
  boards: "roomQueueManagement",
  ads: "ads",
  music: "musicLibrary",
  analytics: "proofOfPlay",
};

function featureGated(key: string, features: Record<string, unknown> | null | undefined): boolean {
  const feat = NAV_FEATURE[key];
  return !!feat && !featureOn(features ?? null, feat);
}

/** Build the sidebar from the caller's permission grant (custom or role preset),
 *  hiding plan-gated modules, and appending Admin for platform admins. Falls back
 *  to the role→nav map when no grant is available (older sessions / board users). */
export function navForRole(role: string | null, isAdmin: boolean, features?: Record<string, unknown> | null, grant?: Record<string, string[]> | null): NavGroup[] {
  const roleAllow = ROLE_NAV[role ?? "owner"] ?? "all";
  const permitted = (key: string) => (grant ? grantAllows(key, grant) : roleAllow === "all" || roleAllow.includes(key));
  const gate = (it: { key: string }) => (isAdmin || permitted(it.key)) && (isAdmin || !featureGated(it.key, features));
  const base = NAV.map((g) => ({ ...g, items: g.items.filter(gate) })).filter((g) => g.items.length > 0);
  if (!isAdmin) return base;
  return base.some((g) => g.label === "Account")
    ? base.map((g) => (g.label === "Account" ? { ...g, items: [...g.items, ADMIN_NAV] } : g))
    : [...base, { label: "Account", items: [ADMIN_NAV] }];
}

/** The set of route keys a caller may reach (for guarding direct navigation). */
export function allowedKeys(role: string | null, isAdmin: boolean, features?: Record<string, unknown> | null, grant?: Record<string, string[]> | null): Set<string> {
  const keys = new Set<string>();
  for (const g of navForRole(role, isAdmin, features, grant)) for (const it of g.items) keys.add(it.key);
  keys.add("screens"); // home is always reachable
  return keys;
}

/** Whether a caller may open a top-level route `key` via direct navigation.
 *  Only sidebar-governed keys (those with a NAV_PERM mapping) are gated; the
 *  builder deep-links (widgets) and detail routes pass through and are guarded
 *  by their own page + the server. Blocks e.g. a viewer typing
 *  /billing or /team in the address bar (the sidebar already hides them). */
export function canAccessKey(key: string, role: string | null, isAdmin: boolean, features?: Record<string, unknown> | null, grant?: Record<string, string[]> | null): boolean {
  if (isAdmin) return true;
  if (!NAV_PERM[key]) return true; // not a sidebar-governed key (widgets, admin, unknown)
  return allowedKeys(role, isAdmin, features, grant).has(key);
}
