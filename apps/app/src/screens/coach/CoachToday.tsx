/** Coach Today — triage inbox: roster pulse + recent notifications. */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fmtWeight } from "@mossa/domain";
import { Card, Skeleton, InsightCard, Badge, Button, Page, Stagger, EmptyState, IconBadge, ClipboardList, Bell, ArrowLeftRight, AlertTriangle, Dumbbell, Weight, Footprints, FlaskConical, Activity, Sliders, ChevronRight, type Tone, type LucideIcon } from "@mossa/ui";
import type { WidgetItem } from "@mossa/protocol";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";
import { useSession } from "../../session.js";
import type { UnitPrefs } from "@mossa/domain";
import type { ClientSummary } from "./Clients.js";
import { WidgetCarousel, WidgetCustomizeSheet } from "../widget-kit.js";
import { COACH_WIDGETS, DEFAULT_COACH_WIDGETS, type CoachWidgetData } from "./CoachWidgets.js";

interface Notification { id: string; type: string; title: string; message: string; created_at: string; read: number }
interface AtRisk { clientId: string; name: string; daysSinceLog: number | null; reason: string }
interface PendingSwap { id: string; client_id: string; day_index: number | null; reason: string | null }
interface RosterEvent { id: string; clientId: string; clientName: string; kind: string; date: string; at: string; title: string; subtitle: string | null; metric?: { unit: "weight"; value: number } }

const ROSTER_META: Record<string, { icon: LucideIcon; tone: Tone }> = {
  workout: { icon: Dumbbell, tone: "activity" },
  checkin: { icon: ClipboardList, tone: "nutrition" },
  measurement: { icon: Weight, tone: "cardio" },
  activity: { icon: Footprints, tone: "cardio" },
  swap: { icon: ArrowLeftRight, tone: "cardio" },
  lab: { icon: FlaskConical, tone: "cardio" },
};

export function CoachToday() {
  const nav = useNavigate();
  const units = useUnits();
  const { ctx, refresh } = useSession();
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [atRisk, setAtRisk] = useState<AtRisk[]>([]);
  const [swaps, setSwaps] = useState<PendingSwap[]>([]);
  const [activity, setActivity] = useState<RosterEvent[]>([]);
  const [widgetsOpen, setWidgetsOpen] = useState(false);
  const [widgetItems, setWidgetItems] = useState<WidgetItem[] | null>(ctx?.user.widgets?.coachHome ?? null);
  const saveWidgets = async (items: WidgetItem[]) => {
    setWidgetItems(items);
    await api.patch("/api/me/widgets", { surface: "coachHome", items }).catch(() => undefined);
    void refresh();
  };

  useEffect(() => {
    void api.get<{ clients: ClientSummary[] }>("/api/clients").then((r) => setClients(r.clients));
    void api.get<{ notifications: Notification[] }>("/api/notifications").then((r) => setNotifications(r.notifications));
    void api.get<{ atRisk: AtRisk[] }>("/api/reports/retention").then((r) => setAtRisk(r.atRisk)).catch(() => undefined);
    void api.get<{ swaps: PendingSwap[] }>("/api/swaps").then((r) => setSwaps(r.swaps)).catch(() => undefined);
    void api.get<{ events: RosterEvent[] }>("/api/reports/roster-activity").then((r) => setActivity(r.events)).catch(() => undefined);
  }, []);

  if (!clients || !notifications) return <div className="space-y-4 p-4"><Skeleton className="h-52" /><Skeleton className="h-36" /></div>;

  const activated = clients.filter((c) => c.hasLogin).length;
  const unread = notifications.filter((n) => !n.read);
  const nameOf = (id: string) => clients.find((c) => c.id === id)?.displayName ?? "A client";
  const today = todayLocal();
  const widgetData: CoachWidgetData = {
    clientsTotal: clients.length,
    clientsActive: activated,
    swaps: swaps.length,
    atRisk: atRisk.length,
    unreadCheckins: unread.filter((n) => n.type === "check_in").length,
    unread: unread.length,
    activeToday: new Set(activity.filter((e) => e.date === today).map((e) => e.clientId)).size,
    logsToday: activity.filter((e) => e.date === today).length,
    labsToReview: unread.filter((n) => n.type === "lab_uploaded").length,
  };
  return (
    <Page className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      <div className="flex items-center justify-between px-1">
        <h1 className="text-2xl font-bold tracking-tight">Today</h1>
        <Button size="sm" variant="secondary" onClick={() => setWidgetsOpen(true)}><Sliders /> Customize</Button>
      </div>
      <Stagger>
        <WidgetCarousel catalog={COACH_WIDGETS} items={widgetItems} defaults={DEFAULT_COACH_WIDGETS} data={widgetData} onCustomize={() => setWidgetsOpen(true)} />
      </Stagger>

      {swaps.length > 0 && (
        <Stagger>
          <Card className="space-y-3">
            <div className="flex items-center gap-2.5"><IconBadge icon={ArrowLeftRight} tone="cardio" size="sm" /><h2 className="font-semibold">Swap requests</h2><Badge tone="cardio">{swaps.length}</Badge></div>
            {swaps.slice(0, 8).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{nameOf(s.client_id)}</span>
                <span className="shrink-0 text-sm text-muted-foreground">{s.reason ? `“${s.reason}”` : "Exercise swap"}{typeof s.day_index === "number" ? ` · Day ${s.day_index + 1}` : ""}</span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Open the client → Manage to choose the replacement.</p>
          </Card>
        </Stagger>
      )}

      {atRisk.length > 0 && (
        <Stagger>
          <Card className="space-y-3">
            <div className="flex items-center gap-2.5"><IconBadge icon={AlertTriangle} tone="cardio" size="sm" /><h2 className="font-semibold">Retention radar</h2></div>
            {atRisk.slice(0, 8).map((r) => (
              <div key={r.clientId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{r.name}</span>
                <Badge tone={r.daysSinceLog === null || r.daysSinceLog >= 10 ? "danger" : "warning"}>{r.reason}</Badge>
              </div>
            ))}
          </Card>
        </Stagger>
      )}

      {activity.length > 0 && (
        <Stagger className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent client activity</h3>
          {groupByDay(activity).map(([day, evs]) => (
            <div key={day}>
              <div className="px-1 pb-1 pt-2 text-xs font-semibold text-muted-foreground">{dayLabel(day)}</div>
              <Card className="divide-y divide-border/40 py-0.5">
                {evs.map((ev) => <RosterRow key={ev.id} ev={ev} units={units} onOpen={() => nav(`/clients/${ev.clientId}/today`)} />)}
              </Card>
            </div>
          ))}
        </Stagger>
      )}

      <Stagger>
        {unread.length === 0 && swaps.length === 0 ? (
          <EmptyState icon={Bell} title="All caught up" description="Check-ins, swap requests, and at-risk clients land here." />
        ) : (
          unread.slice(0, 10).map((n) => (
            <InsightCard key={n.id} timestamp={new Date(n.created_at).toLocaleString()} title={n.title}>
              {n.message && <Card className="text-sm text-muted-foreground">{n.message}</Card>}
            </InsightCard>
          ))
        )}
      </Stagger>

      {widgetsOpen && <WidgetCustomizeSheet catalog={COACH_WIDGETS} items={widgetItems} defaults={DEFAULT_COACH_WIDGETS} onClose={() => setWidgetsOpen(false)} onSave={saveWidgets} />}
    </Page>
  );
}

const shiftDay = (date: string, delta: number): string => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};
function groupByDay(events: RosterEvent[]): [string, RosterEvent[]][] {
  const out: [string, RosterEvent[]][] = [];
  for (const ev of events) {
    const last = out[out.length - 1];
    if (last && last[0] === ev.date) last[1].push(ev);
    else out.push([ev.date, [ev]]);
  }
  return out;
}
function dayLabel(day: string): string {
  const today = todayLocal();
  if (day === today) return "Today";
  if (day === shiftDay(today, -1)) return "Yesterday";
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function RosterRow({ ev, units, onOpen }: { ev: RosterEvent; units: UnitPrefs; onOpen: () => void }) {
  const meta = ROSTER_META[ev.kind] ?? { icon: Activity, tone: "neutral" as Tone };
  const metric = ev.metric ? fmtWeight(ev.metric.value, units) : null;
  const sub = [ev.subtitle, metric].filter(Boolean).join(" · ");
  const time = new Date(ev.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 py-2.5 text-left transition-opacity active:opacity-60">
      <IconBadge icon={meta.icon} tone={meta.tone} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm"><span className="font-semibold">{ev.clientName}</span> <span className="text-muted-foreground">· {ev.title}</span></div>
        {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
      </div>
      <span className="shrink-0 text-[0.7rem] tabular-nums text-muted-foreground">{time}</span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/40" />
    </button>
  );
}
