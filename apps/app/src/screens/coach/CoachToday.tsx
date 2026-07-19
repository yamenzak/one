/** Coach Today — triage inbox: roster pulse + recent notifications. */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fmtWeight } from "@mossa/domain";
import { Card, InsightCard, Badge, Button, Page, Stagger, EmptyState, Reveal, SkeletonHero, SkeletonChart, SkeletonStatGrid, SkeletonList, IconBadge, ChartCard, BarChart, StatCard, SectionHeader, toneVar, ClipboardList, Bell, ArrowLeftRight, AlertTriangle, Dumbbell, Weight, Footprints, FlaskConical, Activity, Trophy, Sliders, ChevronRight, Percent, CountUp, type Tone, type LucideIcon } from "@mossa/ui";
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
interface RosterAnalytics {
  roster: { total: number; active7: number; atRisk: number };
  daily: { date: string; active: number; logs: number }[];
  engagement: { checkInRate: number; workoutRate: number; avgActivePerDay: number };
  topClients: { clientId: string; name: string; logs: number }[];
  composition: { tracked: number; withTrend: number; improving: number; avgDeltaPct: number | null; mostImproved: { clientId: string; name: string; delta: number } | null };
}
const dm = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "numeric", day: "numeric" });

const ROSTER_META: Record<string, { icon: LucideIcon; tone: Tone }> = {
  workout: { icon: Dumbbell, tone: "activity" },
  checkin: { icon: ClipboardList, tone: "nutrition" },
  measurement: { icon: Weight, tone: "cardio" },
  activity: { icon: Footprints, tone: "cardio" },
  swap: { icon: ArrowLeftRight, tone: "cardio" },
  lab: { icon: FlaskConical, tone: "lab" },
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
  const [analytics, setAnalytics] = useState<RosterAnalytics | null>(null);
  const [widgetsOpen, setWidgetsOpen] = useState(false);
  const [widgetItems, setWidgetItems] = useState<WidgetItem[] | null>(ctx?.user.widgets?.coachHome ?? null);
  const saveWidgets = async (items: WidgetItem[]) => {
    setWidgetItems(items);
    await api.patch("/api/me/widgets", { surface: "coachHome", items }).catch(() => undefined);
    void refresh();
  };

  // Load everything the page renders in one shot, then commit together — so the
  // page mounts complete and animates as one, with no mid-page section popping
  // in late (which would shift the sections below it during the entrance).
  useEffect(() => {
    void (async () => {
      try {
        const [c, n, ar, sw, ev, an] = await Promise.all([
          api.get<{ clients: ClientSummary[] }>("/api/clients"),
          api.get<{ notifications: Notification[] }>("/api/notifications"),
          api.get<{ atRisk: AtRisk[] }>("/api/reports/retention").catch(() => ({ atRisk: [] as AtRisk[] })),
          api.get<{ swaps: PendingSwap[] }>("/api/swaps").catch(() => ({ swaps: [] as PendingSwap[] })),
          api.get<{ events: RosterEvent[] }>("/api/reports/roster-activity").catch(() => ({ events: [] as RosterEvent[] })),
          api.get<RosterAnalytics>(`/api/reports/roster-analytics?days=14&today=${todayLocal()}`).catch(() => null),
        ]);
        setAtRisk(ar.atRisk); setSwaps(sw.swaps); setActivity(ev.events); setAnalytics(an);
        setClients(c.clients); setNotifications(n.notifications);
      } catch { /* clients/notifications failed — stay in the skeleton */ }
    })();
  }, []);

  return (
    <Page className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      <div className="flex items-center justify-between px-1">
        <h1 className="text-2xl font-bold tracking-tight">Today</h1>
        <Button size="sm" variant="secondary" onClick={() => setWidgetsOpen(true)}><Sliders /> Customize</Button>
      </div>
      <Reveal loading={!clients || !notifications} className="space-y-5" skeleton={
        <>
          <SkeletonHero height={150} />
          <SkeletonChart height={160} />
          <SkeletonStatGrid count={2} />
          <SkeletonList card rows={4} />
        </>
      }>
      {clients && notifications && (() => {
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
          <>
            <Stagger>
              <WidgetCarousel catalog={COACH_WIDGETS} items={widgetItems} defaults={DEFAULT_COACH_WIDGETS} data={widgetData} onCustomize={() => setWidgetsOpen(true)} />
            </Stagger>

      {analytics && analytics.roster.total > 0 && (
        <Stagger className="space-y-3">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Roster analytics</h3>
          <ChartCard title="Active clients" icon={Activity} tone="cardio" value={analytics.engagement.avgActivePerDay} unit={`/ day · of ${analytics.roster.total}`} delta={<Badge tone="neutral">{analytics.daily.length}-day trend</Badge>}>
            <BarChart values={analytics.daily.map((d) => d.active)} labels={analytics.daily.map((d) => dm(d.date))} tone="cardio" target={analytics.roster.total} format={(v) => `${v} active`} />
          </ChartCard>
          <div className="grid grid-cols-2 gap-3">
            <StatCard stack label="Check-in rate" value={analytics.engagement.checkInRate} unit="%" icon={ClipboardList} tone="nutrition" badge={<Badge tone="neutral">7-day</Badge>} />
            <StatCard stack label="Workout rate" value={analytics.engagement.workoutRate} unit="%" icon={Dumbbell} tone="activity" badge={<Badge tone="neutral">7-day</Badge>} />
          </div>
          {analytics.topClients.length > 0 && (
            <Card className="space-y-3">
              <SectionHeader icon={Trophy} tone="activity" title="Most active" />
              <div className="space-y-2.5">
                {analytics.topClients.map((t) => {
                  const max = analytics.topClients[0]!.logs || 1;
                  return (
                    <button key={t.clientId} onClick={() => nav(`/clients/${t.clientId}/today`)} className="block w-full text-left">
                      <div className="flex items-center justify-between gap-2 text-sm"><span className="truncate font-medium">{t.name}</span><span className="numeral shrink-0 text-muted-foreground">{t.logs} logs</span></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(6, (t.logs / max) * 100)}%`, backgroundColor: toneVar.activity }} /></div>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
          {analytics.composition && analytics.composition.tracked > 0 && (
            <Card className="space-y-3">
              <SectionHeader icon={Percent} tone="sleep" title="Body composition" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Trending down</div>
                  <div className="numeral text-2xl font-bold"><CountUp value={analytics.composition.improving} /><span className="text-sm font-medium text-muted-foreground"> / {analytics.composition.withTrend}</span></div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Avg body-fat Δ · 90d</div>
                  <div className="numeral text-2xl font-bold">{analytics.composition.avgDeltaPct != null ? <CountUp value={analytics.composition.avgDeltaPct} decimals={1} prefix={analytics.composition.avgDeltaPct > 0 ? "+" : ""} suffix="%" /> : "—"}</div>
                </div>
              </div>
              {analytics.composition.mostImproved && (
                <button onClick={() => nav(`/clients/${analytics.composition.mostImproved!.clientId}/progress`)} className="flex w-full items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-left">
                  <span className="min-w-0 truncate text-sm"><span className="text-muted-foreground">Most improved · </span><span className="font-medium">{analytics.composition.mostImproved.name}</span></span>
                  <Badge tone="success">{analytics.composition.mostImproved.delta}%</Badge>
                </button>
              )}
              <p className="text-xs text-muted-foreground">{analytics.composition.tracked} client{analytics.composition.tracked === 1 ? "" : "s"} with a body-fat reading in the last 90 days.</p>
            </Card>
          )}
        </Stagger>
      )}

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
                {evs.map((ev) => <RosterRow key={ev.id} ev={ev} units={units} onOpen={() => nav(`/clients/${ev.clientId}/${rosterSubtab(ev.kind)}`)} />)}
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
          </>
        );
      })()}
      </Reveal>

      {widgetsOpen && <WidgetCustomizeSheet catalog={COACH_WIDGETS} items={widgetItems} defaults={DEFAULT_COACH_WIDGETS} onClose={() => setWidgetsOpen(false)} onSave={saveWidgets} />}
    </Page>
  );
}

/** Client-detail subtab a roster event drills into (check-ins, labs, swaps all
 *  live under Manage; body metrics under Progress; training under Today). */
function rosterSubtab(kind: string): string {
  if (kind === "checkin" || kind === "lab" || kind === "swap") return "manage";
  if (kind === "measurement") return "progress";
  return "today";
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
