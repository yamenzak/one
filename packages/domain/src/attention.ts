/**
 * Coach attention registry (SSOT) — the catalog of things across a coach's
 * roster that need their attention: a stale goal, a client gone quiet, a
 * check-in awaiting feedback, a lab to review, a pending swap, lapsing access,
 * an incomplete profile. Mirrors the `NOTIF_TYPES` / `AUDIT_ACTIONS` pattern:
 * presentation-agnostic atoms here (severity, permission, feature, copy);
 * icon + tone live in the app's `attention-ui.ts` twin.
 *
 * One registry + one roster query (`GET /api/coach/attention`) means a new
 * attention kind is: add an entry here, a query branch server-side, and a
 * coding entry in the UI twin.
 */

import type { FeatureKey } from "./features.js";

export type AttentionSeverity = "info" | "warn" | "urgent";

export type AttentionType =
  | "goal_stale"
  | "client_quiet"
  | "checkin_unanswered"
  | "lab_review"
  | "swap_pending"
  | "access_expiring"
  | "access_expired"
  | "profile_incomplete";

export interface AttentionMeta {
  /** Short human label for the chip / list. */
  label: string;
  /** Default urgency — drives ranking + tone. */
  severity: AttentionSeverity;
  /** Permission resource a viewer needs (all are coach-facing). */
  permission: string;
  /** Optional feature gate — hidden when the tenant lacks the feature. */
  feature?: FeatureKey;
  /** The call to action ("Update goal", "Reply", …). */
  actionLabel: string;
  /** Which client-detail section resolves it (the app builds the route). */
  clientTab: string;
}

export const ATTENTION_TYPES: Record<AttentionType, AttentionMeta> = {
  goal_stale: { label: "Stale goal", severity: "warn", permission: "goal", feature: "goals", actionLabel: "Update goal", clientTab: "goals" },
  client_quiet: { label: "Gone quiet", severity: "urgent", permission: "tracking", actionLabel: "Reach out", clientTab: "activity" },
  checkin_unanswered: { label: "Check-in to answer", severity: "warn", permission: "tracking", feature: "checkIns", actionLabel: "Reply", clientTab: "activity" },
  lab_review: { label: "Lab to review", severity: "warn", permission: "lab", feature: "supplementsLabs", actionLabel: "Review", clientTab: "labs" },
  swap_pending: { label: "Swap request", severity: "warn", permission: "tracking", feature: "exerciseSwap", actionLabel: "Decide", clientTab: "manage" },
  access_expiring: { label: "Access expiring", severity: "warn", permission: "package", feature: "commerce", actionLabel: "Renew", clientTab: "manage" },
  access_expired: { label: "Access expired", severity: "urgent", permission: "package", feature: "commerce", actionLabel: "Renew", clientTab: "manage" },
  profile_incomplete: { label: "Profile incomplete", severity: "info", permission: "client", actionLabel: "Complete", clientTab: "manage" },
};

export const SEVERITY_RANK: Record<AttentionSeverity, number> = { urgent: 3, warn: 2, info: 1 };

export function isAttentionType(x: string): x is AttentionType {
  return x in ATTENTION_TYPES;
}

export function attentionLabelOf(type: string): string {
  return (ATTENTION_TYPES as Record<string, AttentionMeta>)[type]?.label ?? type;
}

export function attentionSeverityOf(type: AttentionType): AttentionSeverity {
  return ATTENTION_TYPES[type].severity;
}

/** Worst severity in a set (for ranking a client row). */
export function topSeverity(items: { severity: AttentionSeverity }[]): AttentionSeverity | null {
  let best: AttentionSeverity | null = null;
  for (const it of items) if (best == null || SEVERITY_RANK[it.severity] > SEVERITY_RANK[best]) best = it.severity;
  return best;
}

/** Rank clients by worst severity, then by how many items they carry. */
export function rankByAttention<T extends { items: { severity: AttentionSeverity }[] }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const sa = SEVERITY_RANK[topSeverity(a.items) ?? "info"], sb = SEVERITY_RANK[topSeverity(b.items) ?? "info"];
    return sb - sa || b.items.length - a.items.length;
  });
}
