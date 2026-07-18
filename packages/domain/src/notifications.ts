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
