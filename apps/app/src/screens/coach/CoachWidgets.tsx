/**
 * Coach home widgets — roster analytics for the swipeable Today hero. All values
 * come from data CoachToday already loads (clients, notifications, swaps,
 * retention, roster), so nothing here fetches.
 *
 * ── Colour comes from the registry, not from here ──
 * Four of these tiles count ATTENTION TYPES — the same `attention.totals` the
 * roster feed further down the screen renders row by row. They were picking
 * their own tones, and three of the four disagreed with `ATTENTION_CODING`:
 * "At risk" was sleep-blue in the hero and danger-red in the feed, on one
 * screen, for one number. They now read `attentionCoding()`, which is the SSOT
 * the feed already uses, so the two cannot drift.
 *
 * The remaining four are roster facts with no domain registry behind them
 * (headcount, activity, unread mail). Their coding lives in `ROSTER_CODING`
 * below — one place, named, rather than a literal inline at each call.
 *
 * ── Forms ──
 * Only two of these are ratios — clients and active-today, both out of the
 * roster — and only those offer a ring. The rest are bare counts: "3 pending
 * swaps" is not 3 out of anything, and drawing it as an always-empty ring
 * (which is what `progress={0.001}` did) said otherwise.
 */

import type { FeatureKey, AttentionType } from "@kova/domain";
import { Users, Bell, Flame, Activity, TileCard, TileStat, TileRing, type TileForm, type Tone, type LucideIcon } from "@4dl/ui";
import { attentionCoding } from "../../attention-ui.js";
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

/** Roster facts that are not attention types, so have no domain registry. */
const ROSTER_CODING = {
  clients: { icon: Users, tone: "activity" as Tone },
  activeToday: { icon: Flame, tone: "activity" as Tone },
  logsToday: { icon: Activity, tone: "cardio" as Tone },
  unread: { icon: Bell, tone: "primary" as Tone },
};

export const DEFAULT_COACH_WIDGETS: WidgetItem[] = [
  { id: "clients", form: "ring", page: 0 },
  { id: "swaps", form: "card", page: 0 },
  { id: "checkins", form: "card", page: 0 },
  { id: "atrisk", form: "card", page: 0 },
];

function stat(
  id: string, title: string, blurb: string, coding: { icon: LucideIcon; tone: Tone },
  get: (d: CoachWidgetData) => number,
  opts?: { sub?: (d: CoachWidgetData) => string; progress?: (d: CoachWidgetData) => number; feature?: FeatureKey },
): KitDef<CoachWidgetData> & { feature?: FeatureKey } {
  const { icon, tone } = coding;
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
  };
}

/** Coding for a widget that counts an attention type — straight from the SSOT. */
const att = (t: AttentionType) => attentionCoding(t);

export const COACH_WIDGETS: (KitDef<CoachWidgetData> & { feature?: FeatureKey })[] = [
  stat("clients", "Clients", "How many you coach, and how many are active", ROSTER_CODING.clients, (d) => d.clientsTotal, { sub: (d) => `${d.clientsActive} active`, progress: (d) => (d.clientsTotal ? d.clientsActive / d.clientsTotal : 0) }),
  stat("swaps", "Pending swaps", "Exercise swaps waiting on your answer", att("swap_pending"), (d) => d.swaps),
  stat("checkins", "New check-ins", "Check-ins you have not given feedback on", att("checkin_unanswered"), (d) => d.unreadCheckins),
  stat("atrisk", "At risk", "Clients who have gone quiet", att("client_quiet"), (d) => d.atRisk),
  stat("activeToday", "Active today", "Clients who logged something today", ROSTER_CODING.activeToday, (d) => d.activeToday, { progress: (d) => (d.clientsTotal ? d.activeToday / d.clientsTotal : 0) }),
  stat("logsToday", "Logs today", "Everything your roster logged today", ROSTER_CODING.logsToday, (d) => d.logsToday),
  stat("unread", "Unread", "Unread notifications", ROSTER_CODING.unread, (d) => d.unread),
  // The only entitlement-governed coach widget: without `supplementsLabs` there
  // are no labs to review and `/api/labs` 403s, so it must not be offerable.
  stat("labs", "Labs to review", "Uploaded labs awaiting your review", att("lab_review"), (d) => d.labsToReview, { feature: "supplementsLabs" }),
];

/** Which attention type each attention-backed widget counts — read by the
 *  conformance test that keeps the hero and the roster feed the same colour. */
export const WIDGET_ATTENTION: Record<string, AttentionType> = {
  swaps: "swap_pending",
  checkins: "checkin_unanswered",
  atrisk: "client_quiet",
  labs: "lab_review",
};
