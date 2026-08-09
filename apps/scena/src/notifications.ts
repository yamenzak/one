/**
 * SCENA'S NOTIFICATION VOCABULARY — the half of the inbox a product owns.
 *
 * `@4dl/notify` owns the machinery: a type has a category, a category plus a
 * role decides inbox and email, a stored preference overrides the default, the
 * owner may veto a category's email. What is Scena's is what there is to be
 * notified ABOUT.
 *
 * ── What Scena had instead ──────────────────────────────────────────────────
 *
 * Two delivery paths, neither of which reached a person inside the product:
 *
 *   • **Screen alerts** went to a webhook URL or an email address stored on an
 *     `alert_rules` row. Not to a USER — to a string. So the alert log existed
 *     (`GET /api/alerts`) but nothing told anyone to look at it, and an operator
 *     who had not configured a rule learned that a screen went dark by walking
 *     past it.
 *   • **Billing notices** went to `email.admin` or `OPERATOR_EMAIL` — one
 *     address for the whole DEPLOYMENT, not per workspace. A studio's own
 *     suspension warning was sent to the platform operator.
 *
 * Neither is removed. A webhook into a monitoring system is a real requirement
 * for a signage fleet, and it is the only channel that reaches someone who is
 * not a Scena user at all. What changes is that the same events now also land in
 * the inbox of the people the workspace belongs to.
 *
 * ⚠️ **The inbox is UNGATED, deliberately.** `alertsWebhook` is a Pro feature and
 * `alertsEmail` is granted by no plan at all, so a free workspace could not be
 * told a screen had gone dark by any means. Telling somebody their product has
 * stopped working is not a capability to sell — it is the minimum a signage
 * product owes its customer, and the paid feature is still what it was: routing
 * the same event OUT, into a monitoring system somebody else operates.
 *
 * ── Why a screen going dark is its own category ────────────────────────────
 *
 * Digital signage fails silently by nature: the whole product is a screen in a
 * room nobody is watching, and a black one looks exactly like a working one from
 * the dashboard. `screens` is therefore the category that a workspace cannot
 * usefully mute per-user, and the one that carries `force` at the call site for
 * an EMERGENCY takeover — the fire/evacuation path, which is the single
 * capability `FREE_ENTITLEMENTS` grants unconditionally and which the route
 * guard exempts from read-only. Something nobody may opt out of receiving.
 */

import { configureNotify } from "@4dl/notify/model";
import type { NotifCategoryMeta as Meta, NotifTypeMeta as TypeMeta } from "@4dl/notify/model";
import type { RoleName } from "./access.js";

/**
 * Staff roles, in descending power.
 *
 * The two BOARD roles are deliberately absent from every category. A board user
 * is a shared credential at a counter — a station tablet, minted per board — not
 * a person with an inbox, which is the same reason `SEAT_FREE_ROLES` exempts
 * them from the seat count. Sending a queue terminal a billing notice would put
 * the workspace's payment state on a screen in a waiting room.
 */
const ALL: RoleName[] = ["owner", "operator", "receptionist", "viewer"];
/** Who can act on a screen or a channel. */
const OPERATORS: RoleName[] = ["owner", "operator"];

export const NOTIF_CATEGORIES: Meta[] = [
  {
    key: "screens",
    label: "Screens",
    blurb: "A screen that stopped responding, came back, or was taken over",
    roles: ALL,
  },
  { key: "content", label: "Content", blurb: "Publishes, rollbacks and feeds that stopped refreshing", roles: OPERATORS },
  { key: "staff", label: "Team", blurb: "Invitations, joins and role changes", roles: ["owner"] },
  { key: "billing", label: "Subscription", blurb: "Your Scena subscription, credits and setup", roles: ["owner"] },
];

/**
 * The types.
 *
 * `to: "staff"` throughout — the customer/member surface split exists for an app
 * whose users hold two personas at once, and a Scena workspace has one: the
 * people who run the screens. The audience it BUYS from (a customer looking at a
 * menu board) has no account at all.
 */
/**
 * ⚠️ THE SCREEN LIST IS `/`, NOT `/screens`.
 *
 * Four types linked to `/screens`, which is not a route: the dashboard puts the
 * fleet on the index and reserves `/screens/:id` for one screen's detail
 * (`Shell.tsx`'s `go` maps the `screens` tab to `/` for exactly this reason).
 * Nothing caught it because nothing rendered a notification until the bell
 * landed — tapping "a screen went offline" would have dropped somebody on the
 * SPA's catch-all. `notifications.conformance.test.ts` in the dashboard now
 * checks every link in this file against the real route table.
 */
export const NOTIF_TYPES: Record<string, TypeMeta> = {
  // ── screens ──────────────────────────────────────────────────────────────
  /** A paired screen stopped answering. Titles name the screen at the call site. */
  screen_offline: { category: "screens", to: "staff", link: "/" },
  screen_recovered: { category: "screens", to: "staff", link: "/" },
  /** An emergency takeover was broadcast — dispatched with `force`. */
  emergency_active: { category: "screens", to: "staff", title: "Emergency message is live", link: "/" },
  emergency_cleared: { category: "screens", to: "staff", title: "Emergency message cleared", link: "/" },

  // ── content ──────────────────────────────────────────────────────────────
  channel_published: { category: "content", to: "staff", link: "/channels" },
  channel_rolled_back: { category: "content", to: "staff", link: "/channels" },
  // The Sources screen is routed at `/feeds`; "Sources" is only its label.
  feed_stalled: { category: "content", to: "staff", link: "/feeds" },

  // ── staff ────────────────────────────────────────────────────────────────
  staff_joined: { category: "staff", to: "owner", link: "/team" },
  staff_role_changed: { category: "staff", to: "owner", link: "/team" },

  // ── billing ──────────────────────────────────────────────────────────────
  // The `message` of each is supplied at the call site, because the dunning
  // ladder's copy names a real number of days (`billing.delete_days` is an
  // operator setting) and a fixed string here would drift from it.
  billing_past_due: { category: "billing", to: "owner", title: "Payment failed", link: "/billing" },
  billing_suspended: { category: "billing", to: "owner", title: "Workspace suspended", link: "/billing" },
  billing_deleted: { category: "billing", to: "owner", title: "Workspace data deleted", link: "/billing" },
  credits_purchased: { category: "billing", to: "owner", link: "/billing" },
  credits_low: { category: "billing", to: "owner", link: "/billing" },
  /**
   * Money went back, so the credits did too — and the owner has to be told
   * either way. A plan-level refund carries no credit count, so there is
   * nothing to reverse and still something to reconcile.
   */
  payment_refunded: { category: "billing", to: "owner", title: "A payment was refunded", link: "/billing" },
  payment_disputed: { category: "billing", to: "owner", title: "A payment was disputed", link: "/billing" },
};

/**
 * ⚠️ `audiences.member` is `"staff"`, and it is NOT free to rename.
 *
 * It is the key a workspace's stored `notif_policy_json` is written under
 * (`emailAudience.staff`), so changing the word on a live deployment orphans
 * every saved policy. `customer` keeps the package's sentinel: Scena has no
 * customer role — the people who see the screens are not users — so nothing
 * ever resolves to that audience.
 */
configureNotify({
  categories: NOTIF_CATEGORIES,
  types: NOTIF_TYPES,
  // No role BUYS from a Scena workspace, so the sentinel matches nobody, which
  // is exactly what it is for.
  customerRole: "__none__",
  audiences: { customer: "customer", member: "staff" },
  tenantVar: "workspaceName",
  /**
   * `screens` is inbox-only by default.
   *
   * A fleet of sixty screens on a flaky venue network generates offline/recover
   * pairs all day, and an emailed one of each is how a person learns to filter
   * the sender. The inbox absorbs that volume; email stays for the categories
   * where a message is rare and consequential. A user who wants the mail can
   * still turn it on — this is the DEFAULT, not a ceiling.
   */
  defaultChannels: (_role, category) => (category === "screens" ? { inbox: true, email: false } : null),
});
