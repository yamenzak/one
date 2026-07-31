/**
 * Coach-action audit vocabulary (KOVA.md).
 *
 * The registry of AUDITABLE staff actions on a client's record — who did what,
 * so a client (or an owner reviewing a coach) has an accountable history. Each
 * action is an atom that references the permission it exercises and the feature
 * it belongs to, so the audit trail joins the same spine everything else reads
 * from. The API's recordAudit() writes a row keyed by these action ids; a read
 * endpoint renders them with the label here.
 *
 * Only STAFF actions that change a client-facing record are audited — a client's
 * own self-logging isn't (it's theirs). Notifications tell the client something
 * happened; the audit log is the durable, queryable record of it.
 */

import type { FeatureKey } from "./features.js";

export type AuditAction =
  | "goal.set"
  | "plan.publish"
  | "checkin.feedback"
  | "supplement.add"
  | "supplement.update"
  | "lab.request"
  | "lab.review"
  | "swap.decide"
  | "content.assign"
  | "package.assign"
  | "client.archive"
  // Offboarding hand-off: a coach asks, the owner decides. Three entries so the
  // log reads as a conversation rather than one unexplained archive.
  | "client.offboard_request"
  | "client.offboard_approved"
  | "client.offboard_declined"
  | "member.role_change"
  | "variant.create"
  | "variant.update";

export interface AuditActionMeta {
  /** Human phrase for the log line ("set a goal", "published a plan"). */
  label: string;
  /** The permission resource this action exercises (see PERMISSION_CATALOG). */
  permission: string;
  /** The feature this action belongs to (keys into FEATURES), when it maps to one. */
  feature?: FeatureKey;
}

export const AUDIT_ACTIONS: Record<AuditAction, AuditActionMeta> = {
  "goal.set": { label: "set a goal", permission: "goal", feature: "goals" },
  "plan.publish": { label: "published a plan", permission: "plan", feature: "workoutPlan" },
  "checkin.feedback": { label: "left check-in feedback", permission: "tracking", feature: "checkIns" },
  "supplement.add": { label: "added a supplement", permission: "supplement", feature: "supplementsLabs" },
  "supplement.update": { label: "updated a supplement", permission: "supplement", feature: "supplementsLabs" },
  "lab.request": { label: "requested a lab test", permission: "lab", feature: "supplementsLabs" },
  "lab.review": { label: "reviewed a lab result", permission: "lab", feature: "supplementsLabs" },
  "swap.decide": { label: "decided an exercise swap", permission: "tracking", feature: "exerciseSwap" },
  "content.assign": { label: "shared content", permission: "content", feature: "content" },
  "package.assign": { label: "assigned a package", permission: "package", feature: "commerce" },
  "client.archive": { label: "archived the client", permission: "client" },
  "client.offboard_request": { label: "asked the owner to remove the client", permission: "client" },
  "client.offboard_approved": { label: "approved removing the client", permission: "client" },
  "client.offboard_declined": { label: "declined removing the client", permission: "client" },
  "member.role_change": { label: "changed a staff role", permission: "member", feature: "staff" },
  "variant.create": { label: "added a plan lane", permission: "plan", feature: "workoutPlan" },
  "variant.update": { label: "updated a plan lane", permission: "plan", feature: "workoutPlan" },
};

/** True when `a` is a known audit action (guards writes from arbitrary strings). */
export function isAuditAction(a: string): a is AuditAction {
  return a in AUDIT_ACTIONS;
}

/** The human label for an action id (falls back to the raw id). */
export function auditLabel(action: string): string {
  return (AUDIT_ACTIONS as Record<string, AuditActionMeta>)[action]?.label ?? action;
}
