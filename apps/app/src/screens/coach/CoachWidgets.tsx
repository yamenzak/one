/**
 * Coach home widgets — roster analytics for the swipeable Today hero. All values
 * come from data CoachToday already loads (clients, notifications, swaps,
 * retention, roster), so nothing here fetches.
 *
 * Only two of these are ratios — clients and active-today, both out of the
 * roster — and only those offer a ring. The rest are bare counts: "3 pending
 * swaps" is not 3 out of anything, and drawing it as an always-empty ring (which
 * is what `progress={0.001}` did) said otherwise.
 */

import type { FeatureKey } from "@kova/domain";
import { Users, ArrowLeftRight, AlertTriangle, ClipboardList, Bell, Flame, Activity, FlaskConical, TileCard, TileStat, TileRing, type TileForm, type Tone, type LucideIcon } from "@4dl/ui";
import type { KitDef, WidgetItem } from "../widget-kit.js";

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
  { id: "clients", form: "ring", page: 0 },
  { id: "swaps", form: "card", page: 0 },
  { id: "checkins", form: "card", page: 0 },
  { id: "atrisk", form: "card", page: 0 },
];

function stat(
  id: string, title: string, blurb: string, icon: LucideIcon, tone: Tone,
  get: (d: CoachWidgetData) => number,
  opts?: { sub?: (d: CoachWidgetData) => string; progress?: (d: CoachWidgetData) => number; feature?: FeatureKey },
): KitDef<CoachWidgetData> {
  const ratio = opts?.progress;
  return {
    id, title, blurb, icon, tone,
    // A ring is only offered where there is a genuine whole to fill.
    forms: ratio ? ["ring", "card", "stat"] : ["card", "stat"],
    ...(opts?.feature ? { feature: opts.feature } : {}),
    render: (form: TileForm, d: CoachWidgetData) => {
      if (form === "ring" && ratio) return <TileRing tone={tone} progress={ratio(d) || 0.001} value={get(d)} label={title} sublabel={opts?.sub?.(d)} />;
      if (form === "stat") return <TileStat icon={icon} tone={tone} label={title} value={get(d)} delta={opts?.sub?.(d) ?? null} />;
      return <TileCard icon={icon} tone={tone} label={title} value={get(d)} progress={ratio?.(d)} />;
    },
  } as KitDef<CoachWidgetData> & { feature?: FeatureKey };
}

export const COACH_WIDGETS: (KitDef<CoachWidgetData> & { feature?: FeatureKey })[] = [
  stat("clients", "Clients", "How many you coach, and how many are active", Users, "activity", (d) => d.clientsTotal, { sub: (d) => `${d.clientsActive} active`, progress: (d) => (d.clientsTotal ? d.clientsActive / d.clientsTotal : 0) }),
  stat("swaps", "Pending swaps", "Exercise swaps waiting on your answer", ArrowLeftRight, "cardio", (d) => d.swaps),
  stat("checkins", "New check-ins", "Check-ins you have not given feedback on", ClipboardList, "nutrition", (d) => d.unreadCheckins),
  stat("atrisk", "At risk", "Clients who have gone quiet", AlertTriangle, "sleep", (d) => d.atRisk),
  stat("activeToday", "Active today", "Clients who logged something today", Flame, "activity", (d) => d.activeToday, { progress: (d) => (d.clientsTotal ? d.activeToday / d.clientsTotal : 0) }),
  stat("logsToday", "Logs today", "Everything your roster logged today", Activity, "cardio", (d) => d.logsToday),
  stat("unread", "Unread", "Unread notifications", Bell, "primary", (d) => d.unread),
  // The only entitlement-governed coach widget: without `supplementsLabs` there
  // are no labs to review and `/api/labs` 403s, so it must not be offerable.
  stat("labs", "Labs to review", "Uploaded labs awaiting your review", FlaskConical, "lab", (d) => d.labsToReview, { feature: "supplementsLabs" }),
];
