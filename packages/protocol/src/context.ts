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
  /**
   * The linked client's avatar, so the app bar can show the SAME face the rest
   * of the app shows for this person.
   *
   * Better Auth's `user.image` is a different field entirely and is never set on
   * this passwordless stack — the photo a client uploads in Profile lands on the
   * clients row (`avatar_url`), and their shuffled DiceBear seed on
   * `avatar_seed`. The bar used to render `user.image` with `user.email` as the
   * seed, so an uploaded photo never appeared there and the generated face did
   * not match the one on the coach's roster. Null for staff with no client
   * record — they fall back to their initials.
   */
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  /**
   * Enough of the studio's brand to render it as a BUSINESS in the switcher — its
   * mark and its primary colour. A person who trains at one studio and coaches at
   * another is looking at two companies, and a list of names in one typeface does
   * not say that; the logo and the colour are how you recognise which is which
   * before you read anything.
   *
   * Deliberately not the whole `TenantBranding`: the switcher needs an icon and a
   * colour, and shipping every token for every persona on every context read
   * would put a studio's full theme in a payload that only wants a swatch.
   */
  iconUrl?: string | null;
  logoUrl?: string | null;
  primary?: string | null;
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
  /** Studio's avatar for the AI coach persona; falls back to a bottts robot. */
  aiAvatarUrl?: string | null;
  /** Studio's name for its AI (e.g. "Nova", "Coach K"); falls back to "Coach". */
  aiName?: string | null;
  /** Granular per-mode CSS-variable overrides (e.g. a pasted shadcn theme). */
  tokens?: { light?: Record<string, string> | null; dark?: Record<string, string> | null } | null;
  /** Sign-in screen copy + affordances, shown on the tenant's branded login
   *  (custom domain or `/t/<slug>`). All optional — blanks fall back to the
   *  shipped premium defaults. */
  login?: LoginBranding | null;
}

/** The tenant's sign-in screen — copy, an optional hero image, and which
 *  affordances show. Applied only on the branded entry (custom domain or the
 *  `/t/<slug>` path); the neutral platform host stays generic Mossa. */
export interface LoginBranding {
  /** Small accent line above the form (default "No passwords, ever"). */
  tagline?: string | null;
  /** Welcome line under the wordmark (default "Welcome back — sign in to continue."). */
  headline?: string | null;
  /** Optional second, quieter line under the headline. */
  subtext?: string | null;
  /** Optional full-bleed background image behind the sign-in card. */
  bgImageUrl?: string | null;
  /** Show the "Sign in with a passkey" shortcut (default true). */
  showPasskey?: boolean | null;
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
  user: { id: string; email: string; name: string | null; image: string | null; units: UnitPrefs; widgets: WidgetPrefs };
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
  /**
   * Access-economy status for the active CLIENT persona (null for staff). When
   * the tenant runs gated access (`required`) and the client has no live
   * plan/package (`!active`), the app locks to the plans screen. `daysRemaining`
   * is the covering budget's remaining days (null when none).
   */
  /**
   * The client persona's standing in the ACTIVE tenancy.
   *
   * `archived` is separate from `active`/`required` on purpose, because it
   * OUTRANKS them: a studio that archived someone has ended the relationship, so
   * asking them to buy a package would be absurd. The app must check archived
   * before it applies the access gate.
   */
  clientAccess: { active: boolean; required: boolean; daysRemaining: number | null; archived: boolean } | null;
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
