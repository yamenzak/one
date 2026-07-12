/**
 * Session context (SPEC §10 `/api/context`) — the one bundle the app boots
 * from: who am I, which tenant, which persona, what am I entitled to.
 */

import type { ClientFlags, Entitlements, Grant, TenantRole, UnitPrefs } from "@mossa/domain";

export interface PersonaRef {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: TenantRole;
  /** Linked client record when this membership can "Train" (client persona). */
  clientId: string | null;
}

/** Tenant branding for theming the app (SPEC §7); applied at boot. */
export interface TenantBranding {
  preset?: string | null;
  primary?: string | null;
  primaryForeground?: string | null;
  radius?: number | null;
  defaultMode?: "dark" | "light" | null;
  logoUrl?: string | null;
  iconUrl?: string | null;
  /** Granular per-mode CSS-variable overrides (e.g. a pasted shadcn theme). */
  tokens?: { light?: Record<string, string> | null; dark?: Record<string, string> | null } | null;
}

/** A placed home widget: which widget, and whether it renders as a big ring
 *  (1 col × 3 rows) or a small card (1 × 1) in the swipeable hero grid. */
export interface WidgetItem {
  id: string;
  size: "big" | "small";
}

/** Per-user home-screen widget layout: ordered placements per surface. */
export interface WidgetPrefs {
  home?: WidgetItem[] | null;
  coachHome?: WidgetItem[] | null;
}

export interface SessionContext {
  user: { id: string; email: string; name: string | null; units: UnitPrefs; widgets: WidgetPrefs };
  /** Every (tenant, role) pair the user holds — feeds the context switcher. */
  personas: PersonaRef[];
  /** The active persona (null until one is chosen). */
  active: PersonaRef | null;
  /** Active mode for staff with a linked client record: coach or train. */
  mode: "coach" | "train";
  perms: Grant;
  entitlements: Entitlements;
  /** Resolved flags for the active client persona (train mode / client role). */
  clientFlags: ClientFlags | null;
  /** Active tenant's branding for theming (null before a tenant is chosen). */
  branding: TenantBranding | null;
  isPlatformAdmin: boolean;
  /**
   * Set when the app is served on a tenant's custom domain (SPEC §14.1): the
   * tenant pinned by the Host. The app hides cross-tenant switching here — the
   * domain IS the tenant. Null on the neutral platform host.
   */
  hostTenantId: string | null;
}

export interface BillingSummary {
  planId: string;
  planName: string;
  status: "active" | "trialing" | "past_due" | "suspended" | "canceled";
  comp: boolean;
  currentPeriodEnd: string | null;
  creditBalance: number;
  entitlements: Entitlements;
}
