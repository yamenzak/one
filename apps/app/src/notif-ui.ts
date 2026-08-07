/**
 * Notification visual coding — maps each notification TYPE to its icon + tone,
 * so the bell and the Inbox render a distinct, on-brand glyph per type instead of
 * one grey sparkle. This is the UI-layer twin of the pure `@kova/domain`
 * registry (mirrors `metric-coding.ts`): domain owns audience/category/copy, the
 * app owns the visual identity. Unknown types fall back to a neutral default.
 */

import type { NotifType } from "@kova/domain";
import {
  ClipboardList, BadgeCheck, Scale, Target, FlaskConical, Pill, ArrowLeftRight,
  BookOpen, Calendar, CreditCard, AlertTriangle, Archive, Bell, Trophy, type LucideIcon, type Tone,
} from "@4dl/ui";

/*
  The platform's, not a copy of it. `@4dl/app-kit` declares exactly this shape
  — `{ icon: LucideIcon; tone: Tone }` — because its bell and inbox consume it,
  and a byte-identical second declaration is a type that stops agreeing the
  moment either side gains a field. Re-exported under the same name so Kova's
  registry keeps reading as Kova's.
*/
export type { NotifCoding } from "@4dl/app-kit";
import type { NotifCoding } from "@4dl/app-kit";

const CODING: Record<NotifType, NotifCoding> = {
  check_in: { icon: ClipboardList, tone: "activity" },
  feedback: { icon: BadgeCheck, tone: "nutrition" },
  body_fat_logged: { icon: Scale, tone: "sleep" },
  pr_achieved: { icon: Trophy, tone: "activity" },
  plan_published: { icon: ClipboardList, tone: "cardio" },
  goal_set: { icon: Target, tone: "activity" },
  lab_requested: { icon: FlaskConical, tone: "nutrition" },
  lab_uploaded: { icon: FlaskConical, tone: "nutrition" },
  lab_reviewed: { icon: FlaskConical, tone: "success" },
  supplement_added: { icon: Pill, tone: "nutrition" },
  supplement_updated: { icon: Pill, tone: "warning" },
  swap_request: { icon: ArrowLeftRight, tone: "activity" },
  swap_approved: { icon: ArrowLeftRight, tone: "success" },
  swap_rejected: { icon: ArrowLeftRight, tone: "warning" },
  content_assigned: { icon: BookOpen, tone: "nutrition" },
  session_booked: { icon: Calendar, tone: "cardio" },
  session_cancelled: { icon: Calendar, tone: "warning" },
  client_assigned: { icon: BadgeCheck, tone: "cardio" },
  // A decision waiting on the owner reads as a warning; the answer that comes
  // back is neutral — it may be an approval or a refusal.
  offboard_requested: { icon: AlertTriangle, tone: "warning" },
  offboard_decided: { icon: Archive, tone: "neutral" },
  access_granted: { icon: BadgeCheck, tone: "success" },
  sub_expired: { icon: CreditCard, tone: "danger" },
  sub_expiring: { icon: CreditCard, tone: "warning" },
  sub_payment_failed: { icon: CreditCard, tone: "danger" },
  billing_suspended: { icon: AlertTriangle, tone: "danger" },
  billing_canceled: { icon: AlertTriangle, tone: "danger" },
  billing_past_due: { icon: CreditCard, tone: "warning" },
  billing_trial_ending: { icon: CreditCard, tone: "warning" },
  payment_disputed: { icon: AlertTriangle, tone: "danger" },
  payment_refunded: { icon: CreditCard, tone: "warning" },
  // Warning, not danger: the client's access started normally and no money was
  // lost — the studio's payment link and package price just disagree.
  payment_mismatch: { icon: CreditCard, tone: "warning" },
};

// An unknown type is still a notification — say that, rather than decorating it.
const DEFAULT: NotifCoding = { icon: Bell, tone: "primary" };

/** Icon + tone for a notification type; a neutral default for unknown types. */
export function notifCoding(type: string): NotifCoding {
  return CODING[type as NotifType] ?? DEFAULT;
}
