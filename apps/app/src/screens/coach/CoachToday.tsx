/** Coach Today — triage inbox: roster pulse + recent notifications. */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fmtWeight, type AttentionType } from "@kova/domain";
import { Card, InsightCard, Badge, Button, Page, Stagger, EmptyState, Reveal, SkeletonHero, SkeletonChart, SkeletonStatGrid, SkeletonList, IconBadge, ChartCard, BarChart, StatCard, SectionHeader, Avatar, toneVar, ClipboardList, Bell, ArrowLeftRight, AlertTriangle, Dumbbell, Weight, Footprints, FlaskConical, Activity, Trophy, Sliders, ChevronRight, Percent, CountUp, TierAnchor, ActionCluster, UserPlus, cn, type Tone, type LucideIcon, NoData } from "@kova/ui";
import { attentionCoding, SEVERITY_TONE } from "../../attention-ui.js";
import type { WidgetItem } from "@kova/protocol";
import { api, todayLocal, shiftDay } from "../../api.js";
import { useUnits } from "../../units.js";
import { useSession } from "../../session.js";
import type { UnitPrefs } from "@kova/domain";
import type { ClientSummary } from "./Clients.js";
import { WidgetCarousel, WidgetCustomizeSheet } from "../widget-kit.js";
import { COACH_WIDGETS, DEFAULT_COACH_WIDGETS, type CoachWidgetData } from "./CoachWidgets.js";
import { featureEnabled } from "@kova/domain";

interface Notification { id: string; type: string; title: string; message: string; created_at: string; read: number }
interface AttentionItem { type: AttentionType; severity: "info" | "warn" | "urgent"; label: string; actionLabel: string; detail: string | null; link: string }
interface AttentionRow { clientId: string; name: string; avatarUrl: string | null; items: AttentionItem[] }
interface AttentionData { clients: AttentionRow[]; totals: Record<string, number>; total: number }
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
  // Mirror client/Today.tsx: a widget whose capability the studio doesn't hold
  // must not reach the carousel OR the customise picker (the picker was the leak
  // — a coach could add "Labs to review" on a plan without supplementsLabs).
  const features = ctx?.entitlements?.features;
  const widgetCatalog = useMemo(
    () => (features ? COACH_WIDGETS.filter((w) => !w.feature || featureEnabled(w.feature, { features, clientFlags: null })) : []),
    [features],
  );
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [attention, setAttention] = useState<AttentionData>({ clients: [], totals: {}, total: 0 });
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
        const [c, n, att, ev, an] = await Promise.all([
          api.get<{ clients: ClientSummary[] }>("/api/clients"),
          api.get<{ notifications: Notification[] }>("/api/notifications"),
          api.get<AttentionData>("/api/coach/attention").catch(() => ({ clients: [], totals: {}, total: 0 })),
          api.get<{ events: RosterEvent[] }>("/api/reports/roster-activity").catch(() => ({ events: [] as RosterEvent[] })),
          api.get<RosterAnalytics>(`/api/reports/roster-analytics?days=14&today=${todayLocal()}`).catch(() => null),
        ]);
        setAttention(att); setActivity(ev.events); setAnalytics(an);
        setClients(c.clients); setNotifications(n.notifications);
      } catch { /* clients/notifications failed — stay in the skeleton */ }
    })();
  }, []);

  return (
    <Page className="column space-y-5 p-4 pb-28">

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
          // Real roster attention totals (not notification-feed proxies).
          swaps: attention.totals.swap_pending ?? 0,
          atRisk: attention.totals.client_quiet ?? 0,
          unreadCheckins: attention.totals.checkin_unanswered ?? 0,
          unread: unread.length,
          activeToday: new Set(activity.filter((e) => e.date === today).map((e) => e.clientId)).size,
          logsToday: activity.filter((e) => e.date === today).length,
          labsToReview: attention.totals.lab_review ?? 0,
        };
        // The one number this screen is about (§1). A coach's Today is a TRIAGE
        // surface, not a dashboard: the question on arrival is "does anything
        // need me", and it deserves an answer in one glance rather than four
        // tiles that each hold part of it. Zero is a real and good answer, so it
        // gets its own wording instead of a bare "0".
        const needsMe = widgetData.swaps + widgetData.atRisk + widgetData.unreadCheckins + widgetData.labsToReview;
        return (
          <>
            <TierAnchor className="flex flex-col items-center gap-1 pb-1 pt-2 text-center">
              <p className="text-caption text-muted-foreground">
                {clients.length === 0 ? "Your roster" : needsMe > 0 ? "Needs you today" : "Your roster"}
              </p>
              <p className="numeral text-display">
                <CountUp value={needsMe > 0 ? needsMe : clients.length} />
              </p>
              <p className="text-caption text-muted-foreground">
                {needsMe > 0
                  ? `${needsMe === 1 ? "thing" : "things"} to look at`
                  : clients.length === 0
                    ? "No clients yet"
                    : `${clients.length === 1 ? "client" : "clients"} · all clear`}
              </p>
            </TierAnchor>

            <ActionCluster
              items={[
                { icon: UserPlus, label: "Add client", onClick: () => nav("/clients?new=1") },
                { icon: Dumbbell, label: "New plan", onClick: () => nav("/library") },
                { icon: Bell, label: "Inbox", onClick: () => nav("/inbox") },
                { icon: Sliders, label: "Customise", onClick: () => setWidgetsOpen(true) },
              ]}
            />

            <Stagger>
              <WidgetCarousel catalog={widgetCatalog} items={widgetItems} defaults={DEFAULT_COACH_WIDGETS} data={widgetData} onCustomize={() => setWidgetsOpen(true)} />
            </Stagger>

      {analytics && analytics.roster.total > 0 && (
        <Stagger className="space-y-3">
          <h3 className="px-1 text-micro uppercase text-muted-foreground">Roster analytics</h3>
          <ChartCard title="Active clients" icon={Activity} tone="cardio" value={analytics.engagement.avgActivePerDay} unit={`/ day · of ${analytics.roster.total}`} delta={<Badge tone="neutral">{analytics.daily.length}-day trend</Badge>}>
            <BarChart values={analytics.daily.map((d) => d.active)} labels={analytics.daily.map((d) => dm(d.date))} tone="cardio" target={analytics.roster.total} format={(v) => `${v} active`} />
          </ChartCard>
          <div className="grid grid-cols-2 gap-3">
            <StatCard stack label="Check-in rate" value={analytics.engagement.checkInRate} unit="%" icon={ClipboardList} tone="nutrition" badge={<Badge tone="neutral">7-day</Badge>} />
            <StatCard stack label="Workout rate" value={analytics.engagement.workoutRate} unit="%" icon={Dumbbell} tone="activity" badge={<Badge tone="neutral">7-day</Badge>} />
          </div>
          {/* A leaderboard needs somebody to lead. With one client it was a
              full-width bar at 100% under the word "Most active" — a ranking of
              one, which says nothing and looks like a result. */}
          {analytics.topClients.length > 1 && (
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
                  <div className={analytics.composition.avgDeltaPct != null ? "numeral text-2xl font-bold" : ""}>{analytics.composition.avgDeltaPct != null ? <CountUp value={analytics.composition.avgDeltaPct} decimals={1} prefix={analytics.composition.avgDeltaPct > 0 ? "+" : ""} suffix="%" /> : <NoData className="text-xs">No scans yet</NoData>}</div>
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

      {attention.total > 0 && (
        <Stagger>
          <Card className="space-y-3">
            <SectionHeader icon={Bell} tone="danger" title="Needs attention" action={<Badge tone="danger">{attention.total}</Badge>} />
            {attention.clients.slice(0, 12).map((row) => (
              <div key={row.clientId} className="space-y-1.5 border-t border-border/40 pt-3 first:border-0 first:pt-0">
                <button onClick={() => nav(row.items[0]!.link)} className="flex items-center gap-2 text-left hover:underline">
                  <Avatar name={row.name} src={row.avatarUrl} seed={row.clientId} className="size-7" />
                  <span className="truncate text-sm font-semibold">{row.name}</span>
                </button>
                <div className="flex flex-wrap gap-1.5">
                  {row.items.map((it) => {
                    const cd = attentionCoding(it.type);
                    return (
                      <button key={it.type} onClick={() => nav(it.link)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors hover:opacity-80" style={{ background: `color-mix(in oklch, ${toneVar[cd.tone]} 14%, transparent)`, color: toneVar[cd.tone] }}>
                        <cd.icon className="size-3.5" />{it.label}{it.detail ? ` · ${it.detail}` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </Card>
        </Stagger>
      )}

      {activity.length > 0 && (
        <Stagger className="space-y-2">
          <h3 className="px-1 text-micro uppercase text-muted-foreground">Recent client activity</h3>
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
        {unread.length === 0 ? (
          <EmptyState icon={Bell} title="All caught up" description={attention.total > 0 ? "Your notifications will appear here." : "Anything that needs your attention will appear here."} />
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

      {widgetsOpen && <WidgetCustomizeSheet catalog={widgetCatalog} items={widgetItems} defaults={DEFAULT_COACH_WIDGETS} onClose={() => setWidgetsOpen(false)} onSave={saveWidgets} />}
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
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{time}</span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/40" />
    </button>
  );
}
