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
// from here, so a call site can never pair a type with the wrong category. The
// record also owns the DEFAULT title + link for types whose copy is fixed, so
// notify() renders them from here and the call site passes only what varies
// (the message, and for staff notifications the client-scoped link). Types whose
// title genuinely interpolates a name (`Alex checked in`) carry no default title
// and provide it at the call site.

export type NotifType =
  // check-ins & feedback
  | "check_in" | "feedback"
  // body composition
  | "body_fat_logged"
  // client activity (staff-facing)
  | "pr_achieved"
  // plans & goals
  | "plan_published" | "goal_set"
  // labs & supplements
  | "lab_requested" | "lab_uploaded" | "lab_reviewed" | "supplement_added" | "supplement_updated"
  // exercise swaps
  | "swap_request" | "swap_approved" | "swap_rejected"
  // content
  | "content_assigned"
  // sessions
  | "session_booked" | "session_cancelled"
  // roster & staff
  | "client_assigned"
  // client commerce (their plan & billing)
  | "access_granted" | "sub_expired" | "sub_expiring" | "sub_payment_failed"
  // studio billing (owner)
  | "billing_suspended" | "billing_canceled" | "billing_past_due" | "billing_trial_ending"
  // sales (owner)
  | "payment_disputed" | "payment_refunded";

/** A default email template for a type. `subject` + `body` are plain strings
 *  with `{{variable}}` placeholders; `body` is inner HTML wrapped by the branded
 *  email shell at send time. A tenant can override these (see the email-template
 *  store); `vars` documents which placeholders the type exposes to the editor. */
export interface NotifTemplate {
  subject: string;
  body: string;
}

export interface NotifTypeMeta {
  category: NotifCategory;
  /** Who the type is emitted to — drives per-surface (mode) in-app filtering. */
  to: "client" | "staff" | "owner";
  /** Default title, when the type's copy is fixed (no name interpolation).
   *  Omitted for types whose title interpolates a name — those pass it in. */
  title?: string;
  /** Default in-app / email deep link, when it's fixed for this type.
   *  Staff notifications that link to a specific client (`/clients/:id/…`)
   *  omit it and pass the client-scoped link in. */
  link?: string;
  /** Default branded email template ({{variables}}). Present for the
   *  client-facing + studio-billing types; others fall back to the generic card. */
  template?: NotifTemplate;
  /** The variable names this type's template exposes (for the editor + docs). */
  vars?: readonly string[];
}

/**
 * Variables EVERY template can use, because `notify()` always has them.
 *
 * This is what makes every type customizable without inventing variables its
 * callers never pass: `renderTemplate` blanks an unknown key, so a template
 * built on a variable nobody supplies ships a sentence with a hole in it. A
 * template restricted to these three is always complete, whatever the caller
 * did or did not provide.
 *
 *   studioName — the tenant's brand name
 *   title      — the notification's own headline (interpolated per type; for
 *                staff types this is where the client's name already appears)
 *   message    — the one-line detail the caller passed, if any
 */
export const UNIVERSAL_NOTIF_VARS = ["studioName", "title", "message"] as const;

export const NOTIF_TYPES: Record<NotifType, NotifTypeMeta> = {
  check_in: { category: "check-ins", to: "staff", // title interpolates client name
    template: { subject: "{{title}}", body: "<p>{{title}}.</p><p>{{message}}</p><p>Open {{studioName}} to read it and reply.</p>" }, vars: ["title", "message", "studioName"] },
  feedback: { category: "check-ins", to: "client", title: "Coach feedback on your check-in", link: "/wellness",
    template: { subject: "{{coachName}} left you feedback", body: "<p>{{coachName}} reviewed your latest check-in and left feedback. Open {{studioName}} to read it and keep your momentum going.</p>" }, vars: ["coachName", "studioName"] },
  body_fat_logged: { category: "body-composition", to: "staff", // title interpolates client name
    template: { subject: "{{title}}", body: "<p>{{title}}.</p><p>{{message}}</p><p>Open {{studioName}} to see the full body-composition history.</p>" }, vars: ["title", "message", "studioName"] },
  pr_achieved: { category: "activity", to: "staff", // title interpolates client + lift name
    template: { subject: "{{title}}", body: "<p><strong>{{title}}</strong></p><p>{{message}}</p><p>Worth a word of congratulations next session.</p>" }, vars: ["title", "message"] },
  plan_published: { category: "plans-goals", to: "client",
    template: { subject: "Your new {{planName}} is ready", body: "<p>{{coachName}} just published <strong>{{planName}}</strong> for you. Take a look and get started.</p>" }, vars: ["coachName", "planName"] }, // title + link vary by plan kind
  goal_set: { category: "plans-goals", to: "client", title: "Your coach set a new goal", link: "/progress?tab=body",
    template: { subject: "A new goal from {{coachName}}", body: "<p>{{coachName}} set a new goal for you: <strong>{{goalLabel}}</strong>. Open {{studioName}} to see the details.</p>" }, vars: ["coachName", "goalLabel", "studioName"] },
  lab_requested: { category: "labs", to: "client", title: "New lab test requested", link: "/wellness",
    template: { subject: "{{studioName}} requested a lab test", body: "<p>Your coach has requested a lab test: <strong>{{message}}</strong>.</p><p>Open {{studioName}} to see what is needed and upload your results when you have them.</p>" }, vars: ["message", "studioName"] },
  lab_uploaded: { category: "labs", to: "staff", // title interpolates client name
    template: { subject: "{{title}}", body: "<p>{{title}}.</p><p>{{message}}</p><p>Open {{studioName}} to review the results.</p>" }, vars: ["title", "message", "studioName"] },
  lab_reviewed: { category: "labs", to: "client", title: "Your coach reviewed your lab results", link: "/wellness",
    template: { subject: "Your lab results have been reviewed", body: "<p>Your coach has gone through your latest lab results.</p><p>{{message}}</p><p>Open {{studioName}} to read the notes.</p>" }, vars: ["message", "studioName"] },
  supplement_added: { category: "labs", to: "client", title: "New supplement added", link: "/wellness",
    template: { subject: "A new supplement from {{studioName}}", body: "<p>Your coach added <strong>{{message}}</strong> to your plan.</p><p>Open {{studioName}} for the dose and timing.</p>" }, vars: ["message", "studioName"] },
  supplement_updated: { category: "labs", to: "client", title: "A supplement was updated", link: "/wellness",
    template: { subject: "{{coachName}} updated a supplement", body: "<p>{{coachName}} updated <strong>{{supplementName}}</strong> in your plan. Open {{studioName}} to see what changed.</p>" }, vars: ["coachName", "supplementName", "studioName"] },
  swap_request: { category: "swaps", to: "staff", // title interpolates client name
    template: { subject: "{{title}}", body: "<p>{{title}}.</p><p>{{message}}</p><p>Open {{studioName}} to approve or decline it.</p>" }, vars: ["title", "message", "studioName"] },
  swap_approved: { category: "swaps", to: "client", title: "Your exercise swap was applied", link: "/train",
    template: { subject: "Your swap was approved", body: "<p>Your coach approved your exercise swap.</p><p>{{message}}</p><p>It is already in your plan — open {{studioName}} to see it.</p>" }, vars: ["message", "studioName"] },
  swap_rejected: { category: "swaps", to: "client", title: "Your coach kept the original exercise", link: "/train",
    template: { subject: "Your coach kept the original exercise", body: "<p>Your coach looked at your swap request and decided to keep the original movement.</p><p>{{message}}</p><p>Open {{studioName}} to see the plan as it stands.</p>" }, vars: ["message", "studioName"] },
  content_assigned: { category: "content", to: "client", title: "Your coach shared something with you", link: "/explore",
    template: { subject: "{{studioName}} shared something with you", body: "<p>Your coach shared <strong>{{message}}</strong> with you.</p><p>Open {{studioName}} to read it.</p>" }, vars: ["message", "studioName"] },
  session_booked: { category: "sessions", to: "client", title: "Session booked", link: "/wellness",
    template: { subject: "Session booked — {{sessionTime}}", body: "<p>Your session with {{studioName}} is booked for <strong>{{sessionTime}}</strong>. See you there!</p>" }, vars: ["sessionTime", "studioName"] },
  session_cancelled: { category: "sessions", to: "client", title: "Your session was cancelled", link: "/wellness",
    template: { subject: "Your session was cancelled", body: "<p>Your session on <strong>{{sessionTime}}</strong> was cancelled. Book another time with {{studioName}} whenever you're ready.</p>" }, vars: ["sessionTime", "studioName"] },
  client_assigned: { category: "roster", to: "staff", title: "You've been assigned a client", // link is client-scoped
    template: { subject: "A new client for you at {{studioName}}", body: "<p>You have been assigned a new client: <strong>{{message}}</strong>.</p><p>Open {{studioName}} to see their profile and start building their plan.</p>" }, vars: ["message", "studioName"] },
  access_granted: { category: "commerce", to: "client", title: "You've got new access", link: "/shop",
    template: { subject: "New access at {{studioName}}", body: "<p>{{coachName}} gave you access to <strong>{{packageName}}</strong>. Open {{studioName}} to jump back in.</p>" }, vars: ["coachName", "packageName", "studioName"] },
  sub_expired: { category: "commerce", to: "client", title: "Your access has expired", link: "/shop",
    template: { subject: "Your access has expired", body: "<p>Your access at {{studioName}} has expired. Renew to pick up right where you left off.</p>" }, vars: ["studioName"] },
  sub_expiring: { category: "commerce", to: "client", title: "Your plan is expiring soon", link: "/shop",
    template: { subject: "Your plan expires in {{daysLeft}} days", body: "<p>Your access at {{studioName}} expires in <strong>{{daysLeft}} days</strong>. Renew now to keep training without interruption.</p>" }, vars: ["studioName", "daysLeft"] },
  sub_payment_failed: { category: "commerce", to: "client", title: "Renewal payment failed", link: "/shop",
    template: { subject: "Payment issue on your plan", body: "<p>We couldn't process your latest payment for {{studioName}}. Update your card to keep your access active.</p>" }, vars: ["studioName"] },
  billing_suspended: { category: "billing", to: "owner", title: "Your studio is suspended", link: "/business",
    template: { subject: "Your studio is suspended", body: "<p>Your Mossa subscription lapsed, so paid features are paused for you and your clients. Update your payment method to restore everything instantly.</p>" }, vars: [] },
  billing_canceled: { category: "billing", to: "owner", title: "Subscription canceled", link: "/business",
    template: { subject: "Your subscription was canceled", body: "<p>Your Mossa subscription was canceled and your studio is on the free plan. Resubscribe anytime to bring back paid features for you and your clients.</p>" }, vars: [] },
  billing_trial_ending: { category: "billing", to: "owner", title: "Your free trial ends soon", link: "/business",
    template: { subject: "Your Mossa trial ends in {{daysLeft}} days", body: "<p>Your free trial of the {{planName}} plan ends in {{daysLeft}} days, and your card will be charged then. Nothing to do if you're happy — change or cancel your plan any time from Business.</p>" }, vars: ["planName", "daysLeft"] },
  billing_past_due: { category: "billing", to: "owner", title: "Payment failed", link: "/business",
    template: { subject: "Payment failed — action needed", body: "<p>We couldn't charge your card for your Mossa subscription. Update your payment method to keep your studio running — you have a short grace period before features pause.</p>" }, vars: [] },
  payment_disputed: { category: "sales", to: "owner", title: "A client payment was disputed", link: "/clients",
    template: { subject: "A payment was disputed", body: "<p>A client payment has been disputed and the funds are on hold.</p><p>{{message}}</p><p>Respond through your Stripe dashboard — disputes have a deadline.</p>" }, vars: ["message"] },
  payment_refunded: { category: "sales", to: "owner", title: "A client payment was refunded", link: "/clients",
    template: { subject: "A payment was refunded", body: "<p>A client payment has been refunded.</p><p>{{message}}</p><p>Their access has been adjusted to match — open {{studioName}} to check.</p>" }, vars: ["message", "studioName"] },
};

/** The category that governs a notification type's delivery preferences. */
export function notifCategoryOf(type: NotifType): NotifCategory {
  return NOTIF_TYPES[type].category;
}

// ── Audience + surface (persona / mode-aware in-app filtering) ────────────────
// A user can be BOTH staff and a client (a coach who trains themselves). The app
// switches between two surfaces — the client surface ("train" mode) and the staff
// surface ("coach" mode) — and the notification bell should show only what belongs
// to the surface you're currently in. Audience is the type's `to` field; the
// surface→audience mapping is: the client surface shows `client` notifications,
// the staff surface shows `staff` + `owner` notifications. This is the single
// source the bell/inbox filter on (pure — the app supplies the current surface).

export type NotifSurface = "client" | "staff";

/** Who a type is addressed to. Unknown types fall back to `staff` (never hidden
 *  by accident from staff, who can act on anything). */
export function notifAudienceOf(type: NotifType): NotifTypeMeta["to"] {
  return NOTIF_TYPES[type]?.to ?? "staff";
}

/** Whether a notification of `type` belongs in the given surface. An unknown
 *  type is shown everywhere rather than silently dropped. */
export function notifVisibleInSurface(type: NotifType, surface: NotifSurface): boolean {
  const meta = NOTIF_TYPES[type];
  if (!meta) return true;
  return surface === "client" ? meta.to === "client" : meta.to === "staff" || meta.to === "owner";
}

/** Count unread notifications visible in a surface — the bell's per-surface badge. */
export function unreadInSurface(items: { type: NotifType; read: boolean | number }[], surface: NotifSurface): number {
  return items.filter((n) => !n.read && notifVisibleInSurface(n.type, surface)).length;
}

/** The default title for a type (from the registry), or null if it must be
 *  supplied at the call site (name-interpolating titles). */
export function notifTitleOf(type: NotifType): string | null {
  return NOTIF_TYPES[type].title ?? null;
}

/** The default link for a type (from the registry), or null when the link is
 *  contextual (client-scoped) and supplied at the call site. */
export function notifLinkOf(type: NotifType): string | null {
  return NOTIF_TYPES[type].link ?? null;
}

/** The default email template for a type, or null (falls back to the generic card). */
export function notifTemplateOf(type: NotifType): NotifTemplate | null {
  return NOTIF_TYPES[type]?.template ?? null;
}

/** The variable names a type's template exposes (for the tenant editor). */
export function notifVarsOf(type: NotifType): readonly string[] {
  return NOTIF_TYPES[type]?.vars ?? [];
}

/**
 * Substitute `{{variable}}` placeholders in a template string. Unknown or
 * missing variables render as empty (never a stray `{{x}}`). Pure — presentation
 * agnostic: the caller pre-escapes VALUES when substituting into HTML, and passes
 * raw values for plain-text subjects.
 */
export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
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

/**
 * The user's effective channels for a category = defaults overlaid by their
 * stored choice — EXCEPT that a category the role cannot receive stays off no
 * matter what is stored. A stored preference is a preference, not a grant: a
 * client who once had `roster` written into their row (or who was a coach and
 * was demoted) must not carry the old value forward into a role that shouldn't
 * have it. Role is re-checked here, at read time, every time.
 */
export function resolveChannels(role: NotifRole, stored: StoredNotifPrefs, category: NotifCategory): ChannelPref {
  if (!categoryAppliesTo(category, role)) return { inbox: false, email: false };
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

/** The two audiences an owner's email policy can target separately: clients vs
 *  the studio's own staff (owner/trainer/assistant). */
export type NotifAudience = "client" | "staff";

/** Owner-set policy: whether email is permitted, per category, and now per
 *  AUDIENCE (email clients about X separately from emailing staff). Backward
 *  compatible: `emailCategories` is the legacy all-audiences map; `emailAudience`
 *  overrides it for a specific audience when present. Absent everywhere = allowed. */
export interface TenantNotifPolicy {
  emailCategories?: Partial<Record<NotifCategory, boolean>>;
  emailAudience?: Partial<Record<NotifAudience, Partial<Record<NotifCategory, boolean>>>>;
}

function parseCatBoolMap(src: unknown): Partial<Record<NotifCategory, boolean>> {
  const out: Partial<Record<NotifCategory, boolean>> = {};
  if (src && typeof src === "object") {
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (CATEGORY_KEYS.has(k as NotifCategory) && typeof v === "boolean") out[k as NotifCategory] = v;
    }
  }
  return out;
}

export function parseNotifPolicy(json: string | null | undefined): TenantNotifPolicy {
  if (!json) return {};
  try {
    const raw = JSON.parse(json) as { emailCategories?: unknown; emailAudience?: unknown };
    const out: TenantNotifPolicy = {};
    const legacy = parseCatBoolMap(raw?.emailCategories);
    if (Object.keys(legacy).length) out.emailCategories = legacy;
    const aud = raw?.emailAudience;
    if (aud && typeof aud === "object") {
      const parsed: TenantNotifPolicy["emailAudience"] = {};
      for (const a of ["client", "staff"] as NotifAudience[]) {
        const m = parseCatBoolMap((aud as Record<string, unknown>)[a]);
        if (Object.keys(m).length) parsed[a] = m;
      }
      if (Object.keys(parsed).length) out.emailAudience = parsed;
    }
    return out;
  } catch {
    return {};
  }
}

/** Keep only known category → boolean pairs (sanitizes an owner-supplied patch). */
export function sanitizeEmailPolicy(patch: Record<string, unknown>): Partial<Record<NotifCategory, boolean>> {
  return parseCatBoolMap(patch);
}

/** Which audience a role belongs to for policy purposes (owner/assistant = staff). */
export function audienceForRole(role: NotifRole): NotifAudience {
  return role === "client" ? "client" : "staff";
}

/** Whether the tenant permits EMAIL for a category (default: yes). When an
 *  `audience` is given, an audience-specific setting wins over the legacy
 *  all-audiences map. */
export function emailAllowedByPolicy(policy: TenantNotifPolicy, category: NotifCategory, audience?: NotifAudience): boolean {
  if (audience) {
    const a = policy.emailAudience?.[audience];
    if (a && category in a) return a[category]!;
  }
  return policy.emailCategories?.[category] ?? true;
}

/** The effective email allow-map across every category, for the owner's UI.
 *  With no audience it returns the legacy single map; with one it returns that
 *  audience's effective map. */
export function resolveEmailPolicy(policy: TenantNotifPolicy, audience?: NotifAudience): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const c of NOTIF_CATEGORIES) out[c.key] = emailAllowedByPolicy(policy, c.key, audience);
  return out;
}
