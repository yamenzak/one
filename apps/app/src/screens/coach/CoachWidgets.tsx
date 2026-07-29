/**
 * Coach home widgets — roster analytics for the swipeable Today hero, each with
 * a big ring (1×3) and small card (1×1) form. All values come from data
 * CoachToday already loads (clients, notifications, swaps, retention, roster).
 */

import type { FeatureKey } from "@kova/domain";
import { Users, ArrowLeftRight, AlertTriangle, ClipboardList, Bell, Flame, Activity, FlaskConical } from "@4dl/ui";
import { RingCard, MiniCard, type WidgetDef, type WidgetItem } from "../widget-kit.js";

export interface CoachWidgetData {
  clientsTotal: number;
  clientsActive: number;
  swaps: number;
  atRisk: number;
  unreadCheckins: number;
  unread: number;
  activeToday: number;
  logsToday: number;
  labsToReview: number;
}

export const DEFAULT_COACH_WIDGETS: WidgetItem[] = [
  { id: "clients", size: "big" },
  { id: "swaps", size: "small" },
  { id: "checkins", size: "small" },
  { id: "atrisk", size: "small" },
];

const stat = (id: string, title: string, icon: typeof Users, tone: Parameters<typeof MiniCard>[0]["tone"], get: (d: CoachWidgetData) => number, opts?: { sub?: (d: CoachWidgetData) => string; progress?: (d: CoachWidgetData) => number; feature?: FeatureKey }): WidgetDef<CoachWidgetData> => ({
  id, title, icon, feature: opts?.feature,
  renderBig: (d) => <RingCard tone={tone} progress={opts?.progress ? opts.progress(d) : 0.001} value={get(d)} label={title} sublabel={opts?.sub ? opts.sub(d) : undefined} />,
  renderSmall: (d) => <MiniCard icon={icon} tone={tone} label={title} value={get(d)} progress={opts?.progress ? opts.progress(d) : undefined} />,
});

export const COACH_WIDGETS: WidgetDef<CoachWidgetData>[] = [
  stat("clients", "Clients", Users, "activity", (d) => d.clientsTotal, { sub: (d) => `${d.clientsActive} active`, progress: (d) => (d.clientsTotal ? d.clientsActive / d.clientsTotal : 0) }),
  stat("swaps", "Pending swaps", ArrowLeftRight, "cardio", (d) => d.swaps),
  stat("checkins", "New check-ins", ClipboardList, "nutrition", (d) => d.unreadCheckins),
  stat("atrisk", "At risk", AlertTriangle, "sleep", (d) => d.atRisk),
  stat("activeToday", "Active today", Flame, "activity", (d) => d.activeToday, { progress: (d) => (d.clientsTotal ? d.activeToday / d.clientsTotal : 0) }),
  stat("logsToday", "Logs today", Activity, "cardio", (d) => d.logsToday),
  stat("unread", "Unread", Bell, "primary", (d) => d.unread),
  // The only entitlement-governed coach widget: without `supplementsLabs` there
  // are no labs to review and `/api/labs` 403s, so it must not be offerable.
  stat("labs", "Labs to review", FlaskConical, "lab", (d) => d.labsToReview, { feature: "supplementsLabs" }),
];
