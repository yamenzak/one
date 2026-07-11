/** Coach Today — triage inbox: roster pulse + recent notifications. */

import { useEffect, useState } from "react";
import { Card, Skeleton, ProgressRing, MetricPill, InsightCard, Page, Stagger, EmptyState, ClipboardList, Bell, Users } from "@mossa/ui";
import { api } from "../../api.js";
import type { ClientSummary } from "./Clients.js";

interface Notification { id: string; type: string; title: string; message: string; created_at: string; read: number }

export function CoachToday() {
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);

  useEffect(() => {
    void api.get<{ clients: ClientSummary[] }>("/api/clients").then((r) => setClients(r.clients));
    void api.get<{ notifications: Notification[] }>("/api/notifications").then((r) => setNotifications(r.notifications));
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
          <MetricPill icon={Users} label="Invited" tone="sleep" value={clients.length - activated} />
        </div>
      </Stagger>

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
