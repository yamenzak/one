/**
 * THE NOTIFICATION VOCABULARY — the half of the inbox a product owns.
 *
 * `@4dl/notify` owns the machinery: a type has a category, a category plus a
 * role decides inbox and email, a stored preference overrides the default, the
 * owner may veto a category's email, and `InboxDO` pushes "refetch" down a
 * hibernating WebSocket. What is the app's is what there is to be notified
 * ABOUT — and it has to be declared before anything can dispatch, because
 * `notifyRoutes` reads this registry to decide what a person may even see.
 *
 * ── Replace the types; keep the SHAPE ───────────────────────────────────────
 *
 * The three categories below are the ones every app on this platform has turned
 * out to need, and each is here for a reason rather than as a placeholder:
 *
 *   staff    somebody joined, somebody's role changed. The owner's business.
 *   billing  the dunning ladder. `@4dl/billing`'s sweep dispatches these, so an
 *            app that bills and does not declare them advances through
 *            past_due → suspended → purged with the tenant told nothing.
 *   system   the catch-all a product's own events live in. Rename it.
 *
 * ⚠️ `audiences.member` is the KEY a tenant's stored `notif_policy_json` is
 * written under (`emailAudience.<member>`), so changing the word on a live
 * deployment orphans every saved policy. Pick it once, before there are tenants.
 *
 * ⚠️ And `customerRole` must name a REAL role, or the sentinel. This app has a
 * customer (`access.ts`'s second role), so it names it. An app whose tenants
 * have no customers at all — Tessa's every member is staff, Scena's audience is
 * a screen in a room — sets `"__none__"`, which matches nobody, and that is
 * exactly what the sentinel is for. Naming a role that does not exist is the
 * failure with no symptom: every customer-addressed type resolves to the member
 * audience and quietly reaches the wrong people.
 */

import { configureNotify } from "@4dl/notify/model";
import type { NotifCategoryMeta as Meta, NotifTypeMeta as TypeMeta } from "@4dl/notify/model";
import { CREATOR_ROLE, CUSTOMER_ROLE, type RoleName } from "./access.js";

/** Everyone who works for the tenant. */
const STAFF: RoleName[] = [CREATOR_ROLE];
/** Everyone, staff and the people they serve. */
const ALL: RoleName[] = [CREATOR_ROLE, CUSTOMER_ROLE];

export const NOTIF_CATEGORIES: Meta[] = [
  { key: "staff", label: "Team", blurb: "Invitations, joins and role changes", roles: STAFF },
  { key: "billing", label: "Subscription", blurb: "Your plan, credits and setup", roles: STAFF },
  { key: "system", label: "Activity", blurb: "What happened in your workspace", roles: ALL },
];

/**
 * The types.
 *
 * `title` is set where the copy is fixed and omitted where it interpolates a
 * name — those arrive from the call site. `link` is a route in the SPA, and it
 * is worth a conformance test: a registry entry pointing at a route the app does
 * not have sends whoever taps the notification to a blank screen. That is not
 * hypothetical — Scena shipped five of them, and they were invisible until
 * something finally rendered a notification.
 */
export const NOTIF_TYPES: Record<string, TypeMeta> = {
  // ── staff ────────────────────────────────────────────────────────────────
  staff_joined: { category: "staff", to: "owner", link: "/team" },
  staff_role_changed: { category: "staff", to: "owner", link: "/team" },

  // ── billing ──────────────────────────────────────────────────────────────
  // The `message` of each is supplied at the call site, because the dunning
  // ladder's copy names a real number of days and a fixed string here would
  // drift from `DUNNING_DAYS`.
  billing_past_due: { category: "billing", to: "owner", title: "Payment failed", link: "/billing" },
  billing_suspended: { category: "billing", to: "owner", title: "Workspace suspended", link: "/billing" },
  billing_deleted: { category: "billing", to: "owner", title: "Workspace data deleted", link: "/billing" },
  credits_low: { category: "billing", to: "owner", link: "/billing" },

  // ── system ───────────────────────────────────────────────────────────────
  /*
    TWO EXAMPLES, and the pair is the point: the same category reaching two
    different audiences. `to` is matched against `audiences.customer`, and
    anything else resolves to the member audience — which is what lets an app
    name a third addressee (Kova has `owner`) without the package growing a case
    for it. Delete both and put the product's own events here.
  */
  record_created: { category: "system", to: "staff", link: "/" },
  record_shared: { category: "system", to: "customer", link: "/" },
};

configureNotify({
  categories: NOTIF_CATEGORIES,
  types: NOTIF_TYPES,
  customerRole: CUSTOMER_ROLE,
  audiences: { customer: "customer", member: "staff" },
  tenantVar: "tenantName",
});
