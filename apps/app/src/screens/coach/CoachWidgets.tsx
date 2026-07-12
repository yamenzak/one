/**
 * Coach home widgets — roster analytics tiles a trainer can pick for their
 * Today dashboard. All values are computed from data CoachToday already loads
 * (clients, notifications, swaps, retention, roster activity).
 */

import { Users, ArrowLeftRight, AlertTriangle, ClipboardList, Bell, Flame, Activity, FlaskConical } from "@mossa/ui";
import { StatTile, type WidgetDef } from "../widget-kit.js";

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

export const DEFAULT_COACH_WIDGETS = ["swaps", "checkins", "atrisk", "activeToday"];

export const COACH_WIDGETS: WidgetDef<CoachWidgetData>[] = [
  { id: "swaps", title: "Pending swaps", icon: ArrowLeftRight, render: (d) => <StatTile icon={ArrowLeftRight} tone="cardio" value={d.swaps} label="Pending swaps" /> },
  { id: "checkins", title: "New check-ins", icon: ClipboardList, render: (d) => <StatTile icon={ClipboardList} tone="nutrition" value={d.unreadCheckins} label="New check-ins" /> },
  { id: "atrisk", title: "At-risk clients", icon: AlertTriangle, render: (d) => <StatTile icon={AlertTriangle} tone="sleep" value={d.atRisk} label="At risk" /> },
  { id: "activeToday", title: "Clients active today", icon: Flame, render: (d) => <StatTile icon={Flame} tone="activity" value={d.activeToday} label="Active today" /> },
  { id: "logsToday", title: "Logs today", icon: Activity, render: (d) => <StatTile icon={Activity} tone="cardio" value={d.logsToday} label="Logs today" /> },
  { id: "clients", title: "Total clients", icon: Users, render: (d) => <StatTile icon={Users} tone="activity" value={d.clientsTotal} label="Clients" sub={`${d.clientsActive} active`} /> },
  { id: "unread", title: "Unread notifications", icon: Bell, render: (d) => <StatTile icon={Bell} tone="primary" value={d.unread} label="Unread" /> },
  { id: "labs", title: "Labs to review", icon: FlaskConical, render: (d) => <StatTile icon={FlaskConical} tone="cardio" value={d.labsToReview} label="Labs to review" /> },
];
