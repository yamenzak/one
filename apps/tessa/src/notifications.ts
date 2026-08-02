/**
 * TESSA'S NOTIFICATION VOCABULARY — the half of the inbox a product owns.
 *
 * `@4dl/notify` owns the machinery: a type has a category, a category plus a
 * role decides inbox and email, a stored preference overrides the default, the
 * owner may veto a category's email. What is Tessa's is what there is to be
 * notified ABOUT, and in a sterile-supply department that is a short and
 * unusually consequential list.
 *
 * ── Why so few types ────────────────────────────────────────────────────────
 *
 * A CSSD is a room where people are already looking at the thing they are doing.
 * Notifying somebody that a tray was packed would be telling them what they just
 * did. The types below are the events that reach a person who is NOT standing at
 * the bench: a load that failed, a recall that froze stock they may already have
 * taken, trays waiting on a release that nobody has given, and the centre's own
 * subscription. Everything else is a screen, not a notification.
 *
 * ── `quarantine` is its own category, and never optional ────────────────────
 *
 * A late biological failure means instruments that were released as sterile may
 * already have been used. Someone has to be told, on every channel, whether or
 * not they have opted out of anything — so those types are dispatched with
 * `force`, which is exactly the escape hatch the shared dispatcher documents as
 * "for the genuinely transactional only". A recall qualifies.
 */

import { configureNotify } from "@4dl/notify/model";
import type { NotifCategoryMeta as Meta, NotifTypeMeta as TypeMeta } from "@4dl/notify/model";
import type { RoleName } from "./access.js";

/** Every Tessa member is staff — there is no customer-facing surface here. */
const ALL: RoleName[] = ["owner", "stockKeeper", "cssd", "clinical", "auditor"];
/** Who can act on a load: run it, release it, or answer for it. */
const STERILE: RoleName[] = ["owner", "cssd"];
const STOCK: RoleName[] = ["owner", "stockKeeper"];

export const NOTIF_CATEGORIES: Meta[] = [
  {
    key: "quarantine",
    label: "Recalls & failed loads",
    blurb: "A load that failed its evidence, and the instruments frozen with it",
    roles: ALL,
  },
  { key: "sterilisation", label: "Sterilisation", blurb: "Loads waiting on a release, and releases given", roles: STERILE },
  { key: "stock", label: "Stock", blurb: "Reorder levels and expiring sterile stock", roles: STOCK },
  { key: "staff", label: "Staff", blurb: "Invitations, joins and role changes", roles: ["owner"] },
  { key: "billing", label: "Subscription", blurb: "Your Tessa subscription, credits and setup", roles: ["owner"] },
];

/**
 * The types. `to: "staff"` throughout — the surface split exists for an app
 * whose users hold two personas at once, and nobody in a CSSD does.
 *
 * Titles that name a machine or a load number are passed at the call site; the
 * fixed ones live here so the copy is in one place.
 */
export const NOTIF_TYPES: Record<string, TypeMeta> = {
  // ── quarantine ───────────────────────────────────────────────────────────
  /** Physical or chemical indicator failed at the door. Nothing has been used. */
  cycle_failed: { category: "quarantine", to: "staff", link: "/cycles" },
  /** The biological came back late and negative. Instruments may be in a patient. */
  recall_issued: { category: "quarantine", to: "staff", link: "/cycles" },

  // ── sterilisation ────────────────────────────────────────────────────────
  /** A load ended clean and is sitting in `awaiting_release`. */
  release_pending: { category: "sterilisation", to: "staff", link: "/cycles" },
  load_released: { category: "sterilisation", to: "staff", link: "/cycles" },

  // ── stock ────────────────────────────────────────────────────────────────
  stock_low: { category: "stock", to: "staff", link: "/stock" },
  stock_expiring: { category: "stock", to: "staff", link: "/stock" },

  // ── staff ────────────────────────────────────────────────────────────────
  staff_joined: { category: "staff", to: "owner", link: "/settings/staff" },
  staff_role_changed: { category: "staff", to: "owner", link: "/settings/staff" },

  // ── billing ──────────────────────────────────────────────────────────────
  billing_past_due: {
    category: "billing",
    to: "owner",
    title: "A payment didn't go through",
    link: "/settings/billing",
  },
  billing_suspended: {
    category: "billing",
    to: "owner",
    title: "Tessa is read-only until the invoice is settled",
    link: "/settings/billing",
  },
  billing_canceled: { category: "billing", to: "owner", title: "Your subscription was cancelled", link: "/settings/billing" },
  billing_trial_ending: { category: "billing", to: "owner", title: "Your trial ends soon", link: "/settings/billing" },
};

configureNotify({
  categories: NOTIF_CATEGORIES,
  types: NOTIF_TYPES,
  // Tessa has no customer role — every member is staff. The sentinel keeps the
  // package from treating anybody as one. Same value, same reason, as access.ts.
  customerRole: "__no_customer_role__",
  // One audience, so the bell never scopes itself and the tenant email policy
  // has a single key. `customer` still has to be NAMED — it is what a `to` field
  // is matched against — but no role and no type ever resolves to it.
  audiences: { customer: "__no_audience__", member: "staff" },
  /** `{{centreName}}` — a Tessa tenant is a medical centre, not a studio. */
  tenantVar: "centreName",
  /**
   * The one departure from the baseline: `stock` is in-app only.
   *
   * A reorder level is crossed several times a week in a busy centre and the
   * person who cares is already in the app. Emailing it is how somebody turns
   * the whole channel off and then misses a recall.
   */
  defaultChannels: (_role, category) => (category === "stock" ? { inbox: true, email: false } : null),
});
