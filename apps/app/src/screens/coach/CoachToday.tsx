/** Coach Today — triage inbox: roster pulse + recent notifications. */

import { useEffect, useState } from "react";
import { Card, Skeleton, ProgressRing, MetricPill, InsightCard, Badge, Page, Stagger, EmptyState, IconBadge, ClipboardList, Bell, Users, AlertTriangle } from "@mossa/ui";
import { api } from "../../api.js";
import type { ClientSummary } from "./Clients.js";

interface Notification { id: string; type: string; title: string; message: string; created_at: string; read: number }
interface AtRisk { clientId: string; name: string; daysSinceLog: number | null; reason: string }

export function CoachToday() {
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [atRisk, setAtRisk] = useState<AtRisk[]>([]);

  useEffect(() => {
    void api.get<{ clients: ClientSummary[] }>("/api/clients").then((r) => setClients(r.clients));
    void api.get<{ notifications: Notification[] }>("/api/notifications").then((r) => setNotifications(r.notifications));
    void api.get<{ atRisk: AtRisk[] }>("/api/reports/retention").then((r) => setAtRisk(r.atRisk)).catch(() => undefined);
  }, []);

  if (!clients || !notifications) return <div className="space-y-4 p-4"><Skeleton className="h-52" /><Skeleton className="h-36" /></div>;

  const activated = clients.filter((c) => c.hasLogin).length;
  const unread = notifications.filter((n) => !n.read);

  return (
    <Page className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      <Stagger className="flex items-center gap-4">
        <ProgressRing progress={clients.length > 0 ? activated / clients.length : 0.001} size={188} tone="activity" label="Clients" value={clients.length} sublabel={`${activated} active`} />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <MetricPill icon={ClipboardList} label="Check-ins" tone="cardio" value={unread.filter((n) => n.type === "check_in").length} />
          <MetricPill icon={Bell} label="Unread" tone="nutrition" value={unread.length} />
          <MetricPill icon={AlertTriangle} label="At risk" tone="sleep" value={atRisk.length} />
        </div>
      </Stagger>

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
        {unread.length === 0 ? (
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
