/**
 * Notification categories, channels, and per-user preference resolution (pure).
 *
 * Every app notification belongs to a CATEGORY; a user picks, per category, whether
 * it reaches their inbox and/or their email. Defaults are role-aware — a coach gets
 * check-ins and activity as a weekly digest (email off per-event) while a client
 * gets their own coach feedback by email. A small TRANSACTIONAL set (login codes,
 * invites, receipts, disputes) always sends and never consults preferences.
 */

export type NotifRole = "owner" | "trainer" | "assistant" | "client" | "member";

export type NotifCategory =
  | "check-ins"
  | "activity"
  | "body-composition"
  | "plans-goals"
  | "labs"
  | "swaps"
  | "content"
  | "sessions"
  | "commerce"
  | "roster"
  | "sales"
  | "billing"
  | "digest"
  | "system";

export interface ChannelPref {
  inbox: boolean;
  email: boolean;
}

export interface NotifCategoryMeta {
  key: NotifCategory;
  label: string;
  blurb: string;
  /** Which roles this category is even shown to / can receive. */
  roles: NotifRole[];
}

const STAFF: NotifRole[] = ["owner", "trainer", "assistant"];
const CLIENT: NotifRole[] = ["client"];
const ALL: NotifRole[] = ["owner", "trainer", "assistant", "client"];

export const NOTIF_CATEGORIES: NotifCategoryMeta[] = [
  { key: "check-ins", label: "Check-ins & feedback", blurb: "Client check-ins and your coach's feedback", roles: ALL },
  { key: "activity", label: "Client activity", blurb: "Workouts, weigh-ins, PRs and at-risk clients", roles: STAFF },
  { key: "body-composition", label: "Body composition", blurb: "New body scans and body-fat readings from clients", roles: STAFF },
  { key: "plans-goals", label: "Plans & goals", blurb: "New workout/meal plans and goals", roles: ALL },
  { key: "labs", label: "Labs & supplements", blurb: "Lab requests, results and supplements", roles: ALL },
  { key: "swaps", label: "Exercise swaps", blurb: "Swap requests and decisions", roles: ALL },
  { key: "content", label: "Content", blurb: "Articles and resources shared with you", roles: ALL },
  { key: "sessions", label: "Sessions", blurb: "Bookings, reminders and changes", roles: ALL },
  { key: "commerce", label: "Your plan & billing", blurb: "Purchases, renewals and access", roles: CLIENT },
  { key: "roster", label: "Roster & staff", blurb: "New clients, assignments and roles", roles: STAFF },
  { key: "sales", label: "Sales", blurb: "New sales, refunds and disputes", roles: ["owner"] },
  { key: "billing", label: "Studio billing", blurb: "Your Mossa subscription, credits and setup", roles: ["owner"] },
  { key: "digest", label: "Weekly digest", blurb: "Your week, summarised, every Monday", roles: ALL },
  { key: "system", label: "Security", blurb: "New passkeys and sign-ins", roles: ALL },
];

const CATEGORY_KEYS = new Set(NOTIF_CATEGORIES.map((c) => c.key));

/** True when `k` is a known notification category (guards owner-policy writes). */
export function isNotifCategory(k: string): k is NotifCategory {
  return CATEGORY_KEYS.has(k as NotifCategory);
}

// ── Notification TYPES (the atom) ─────────────────────────────────────────────
// Every notification `notify()` emits has a stable TYPE. The type is the SSOT
// key; its CATEGORY (which governs preferences + the owner email policy) derives
// from here, so a call site can never pair a type with the wrong category. Titles
// and links stay at the call site (they interpolate names/ids); the registry owns
// the type→category binding and the audience the type is meant for.

export type NotifType =
  // check-ins & feedback
  | "check_in" | "feedback"
  // body composition
  | "body_fat_logged"
  // plans & goals
  | "plan_published" | "goal_set"
  // labs & supplements
  | "lab_requested" | "lab_uploaded" | "lab_reviewed" | "supplement_added"
  // exercise swaps
  | "swap_request" | "swap_approved" | "swap_rejected"
  // content
  | "content_assigned"
  // sessions
  | "session_booked" | "session_cancelled"
  // roster & staff
  | "client_assigned"
  // client commerce (their plan & billing)
  | "sub_expired" | "sub_expiring" | "sub_payment_failed"
  // studio billing (owner)
  | "billing_suspended" | "billing_canceled" | "billing_past_due"
  // sales (owner)
  | "payment_disputed" | "payment_refunded";

export interface NotifTypeMeta {
  category: NotifCategory;
  /** Who the type is emitted to (documentation + future audience checks). */
  to: "client" | "staff" | "owner";
}

export const NOTIF_TYPES: Record<NotifType, NotifTypeMeta> = {
  check_in: { category: "check-ins", to: "staff" },
  feedback: { category: "check-ins", to: "client" },
  body_fat_logged: { category: "body-composition", to: "staff" },
  plan_published: { category: "plans-goals", to: "client" },
  goal_set: { category: "plans-goals", to: "client" },
  lab_requested: { category: "labs", to: "client" },
  lab_uploaded: { category: "labs", to: "staff" },
  lab_reviewed: { category: "labs", to: "client" },
  supplement_added: { category: "labs", to: "client" },
  swap_request: { category: "swaps", to: "staff" },
  swap_approved: { category: "swaps", to: "client" },
  swap_rejected: { category: "swaps", to: "client" },
  content_assigned: { category: "content", to: "client" },
  session_booked: { category: "sessions", to: "client" },
  session_cancelled: { category: "sessions", to: "client" },
  client_assigned: { category: "roster", to: "staff" },
  sub_expired: { category: "commerce", to: "client" },
  sub_expiring: { category: "commerce", to: "client" },
  sub_payment_failed: { category: "commerce", to: "client" },
  billing_suspended: { category: "billing", to: "owner" },
  billing_canceled: { category: "billing", to: "owner" },
  billing_past_due: { category: "billing", to: "owner" },
  payment_disputed: { category: "sales", to: "owner" },
  payment_refunded: { category: "sales", to: "owner" },
};

/** The category that governs a notification type's delivery preferences. */
export function notifCategoryOf(type: NotifType): NotifCategory {
  return NOTIF_TYPES[type].category;
}

/** Categories a role can see/tune. */
export function categoriesForRole(role: NotifRole): NotifCategoryMeta[] {
  return NOTIF_CATEGORIES.filter((c) => c.roles.includes(role));
}

/** Whether a category even applies to a role (both channels off otherwise). */
export function categoryAppliesTo(category: NotifCategory, role: NotifRole): boolean {
  return NOTIF_CATEGORIES.find((c) => c.key === category)?.roles.includes(role) ?? false;
}

/**
 * The default channel choice for a (role, category). Inbox is on for every
 * applicable category; email is on for actionable ones and off (digest-only) for
 * high-frequency signals — coach check-ins/activity/content/sales, client content.
 */
export function defaultChannels(role: NotifRole, category: NotifCategory): ChannelPref {
  if (!categoryAppliesTo(category, role)) return { inbox: false, email: false };
  if (category === "digest") return { inbox: false, email: true }; // email-only
  const staff = role === "owner" || role === "trainer" || role === "assistant";
  let email = true;
  if (staff && (category === "check-ins" || category === "activity" || category === "content" || category === "sales")) email = false;
  if (role === "client" && category === "content") email = false;
  return { inbox: true, email };
}

/** Stored prefs shape: category → partial channel choice (only what the user changed). */
export type StoredNotifPrefs = Partial<Record<NotifCategory, Partial<ChannelPref>>>;

export function parseNotifPrefs(json: string | null | undefined): StoredNotifPrefs {
  if (!json) return {};
  try {
    const raw = JSON.parse(json);
    if (!raw || typeof raw !== "object") return {};
    const out: StoredNotifPrefs = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!CATEGORY_KEYS.has(k as NotifCategory) || !v || typeof v !== "object") continue;
      const cv = v as Record<string, unknown>;
      const pref: Partial<ChannelPref> = {};
      if (typeof cv.inbox === "boolean") pref.inbox = cv.inbox;
      if (typeof cv.email === "boolean") pref.email = cv.email;
      out[k as NotifCategory] = pref;
    }
    return out;
  } catch {
    return {};
  }
}

/** The user's effective channels for a category = defaults overlaid by their stored choice. */
export function resolveChannels(role: NotifRole, stored: StoredNotifPrefs, category: NotifCategory): ChannelPref {
  const def = defaultChannels(role, category);
  const s = stored[category];
  return { inbox: s?.inbox ?? def.inbox, email: s?.email ?? def.email };
}

/** Full resolved preference matrix for the categories a role can see (for the settings UI). */
export function resolveAllChannels(role: NotifRole, stored: StoredNotifPrefs): Record<string, ChannelPref> {
  const out: Record<string, ChannelPref> = {};
  for (const c of categoriesForRole(role)) out[c.key] = resolveChannels(role, stored, c.key);
  return out;
}

// ── Tenant-level EMAIL policy (owner control) ────────────────────────────────
// A member decides, per category, whether it reaches their inbox and/or email.
// On top of that, the tenant OWNER governs which categories are allowed to be
// EMAILED to their studio's members at all — an opt-out allow-list. The inbox is
// never gated (members always keep in-app delivery); the owner only governs the
// email channel. Effective email = member's email choice AND owner allows it.

/** Owner-set policy: category → whether email is permitted (absent = permitted). */
export interface TenantNotifPolicy {
  emailCategories?: Partial<Record<NotifCategory, boolean>>;
}

export function parseNotifPolicy(json: string | null | undefined): TenantNotifPolicy {
  if (!json) return {};
  try {
    const raw = JSON.parse(json);
    const src = raw && typeof raw === "object" ? (raw as { emailCategories?: unknown }).emailCategories : null;
    if (!src || typeof src !== "object") return {};
    const out: Partial<Record<NotifCategory, boolean>> = {};
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (CATEGORY_KEYS.has(k as NotifCategory) && typeof v === "boolean") out[k as NotifCategory] = v;
    }
    return { emailCategories: out };
  } catch {
    return {};
  }
}

/** Keep only known category → boolean pairs (sanitizes an owner-supplied patch). */
export function sanitizeEmailPolicy(patch: Record<string, unknown>): Partial<Record<NotifCategory, boolean>> {
  const out: Partial<Record<NotifCategory, boolean>> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (CATEGORY_KEYS.has(k as NotifCategory) && typeof v === "boolean") out[k as NotifCategory] = v;
  }
  return out;
}

/** Whether the tenant permits EMAIL for a category (default: yes). */
export function emailAllowedByPolicy(policy: TenantNotifPolicy, category: NotifCategory): boolean {
  return policy.emailCategories?.[category] ?? true;
}

/** The effective email allow-map across every category, for the owner's UI. */
export function resolveEmailPolicy(policy: TenantNotifPolicy): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const c of NOTIF_CATEGORIES) out[c.key] = emailAllowedByPolicy(policy, c.key);
  return out;
}
