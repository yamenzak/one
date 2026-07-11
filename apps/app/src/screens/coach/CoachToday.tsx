/** Coach Today — triage inbox: roster pulse + recent notifications. */

import { useEffect, useState } from "react";
import { Card, Skeleton, ProgressRing, MetricPill, InsightCard, Badge, Page, Stagger, EmptyState, IconBadge, ClipboardList, Bell, ArrowLeftRight, AlertTriangle } from "@mossa/ui";
import { api } from "../../api.js";
import type { ClientSummary } from "./Clients.js";

interface Notification { id: string; type: string; title: string; message: string; created_at: string; read: number }
interface AtRisk { clientId: string; name: string; daysSinceLog: number | null; reason: string }
interface PendingSwap { id: string; client_id: string; day_index: number | null; reason: string | null }

export function CoachToday() {
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [atRisk, setAtRisk] = useState<AtRisk[]>([]);
  const [swaps, setSwaps] = useState<PendingSwap[]>([]);

  useEffect(() => {
    void api.get<{ clients: ClientSummary[] }>("/api/clients").then((r) => setClients(r.clients));
    void api.get<{ notifications: Notification[] }>("/api/notifications").then((r) => setNotifications(r.notifications));
    void api.get<{ atRisk: AtRisk[] }>("/api/reports/retention").then((r) => setAtRisk(r.atRisk)).catch(() => undefined);
    void api.get<{ swaps: PendingSwap[] }>("/api/swaps").then((r) => setSwaps(r.swaps)).catch(() => undefined);
  }, []);

  if (!clients || !notifications) return <div className="space-y-4 p-4"><Skeleton className="h-52" /><Skeleton className="h-36" /></div>;

  const activated = clients.filter((c) => c.hasLogin).length;
  const unread = notifications.filter((n) => !n.read);
  const nameOf = (id: string) => clients.find((c) => c.id === id)?.displayName ?? "A client";

  return (
    <Page className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      <Stagger className="flex items-center gap-4">
        <ProgressRing progress={clients.length > 0 ? activated / clients.length : 0.001} size={188} tone="activity" label="Clients" value={clients.length} sublabel={`${activated} active`} />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <MetricPill icon={ArrowLeftRight} label="Swaps" tone="cardio" value={swaps.length} />
          <MetricPill icon={ClipboardList} label="Check-ins" tone="nutrition" value={unread.filter((n) => n.type === "check_in").length} />
          <MetricPill icon={AlertTriangle} label="At risk" tone="sleep" value={atRisk.length} />
        </div>
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
    </Page>
  );
}
