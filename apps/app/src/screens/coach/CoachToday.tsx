/** Coach Today: the triage inbox — roster pulse + recent check-ins. */

import { useEffect, useState } from "react";
import { Card, InsightCard, MetricPill, ProgressRing, Skeleton } from "@mossa/ui";
import { api } from "../../api.js";
import type { ClientSummary } from "./Clients.js";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  created_at: string;
  read: number;
}

export function CoachToday() {
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);

  useEffect(() => {
    void api.get<{ clients: ClientSummary[] }>("/api/clients").then((r) => setClients(r.clients));
    void api.get<{ notifications: Notification[] }>("/api/notifications").then((r) => setNotifications(r.notifications));
  }, []);

  if (!clients || !notifications) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-56" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const activated = clients.filter((c) => c.hasLogin).length;
  const unread = notifications.filter((n) => !n.read);

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      <div className="flex items-center gap-4">
        <ProgressRing
          progress={clients.length > 0 ? activated / clients.length : 0}
          size={190}
          tone="activity"
          value={clients.length}
          arcLabelTop="Clients"
          arcLabelBottom={`${activated} active`}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <MetricPill icon="☀️" label="Check-ins" tone="cardio" value={unread.filter((n) => n.type === "check_in").length} />
          <MetricPill icon="🔔" label="Unread" tone="nutrition" value={unread.length} />
          <MetricPill icon="🤝" label="Invited" tone="sleep" value={clients.length - activated} />
        </div>
      </div>

      <div>
        {unread.length === 0 && (
          <Card className="text-center text-sm text-fg-muted">
            All caught up — check-ins, swap requests, and at-risk clients will land here.
          </Card>
        )}
        {unread.slice(0, 10).map((n) => (
          <InsightCard key={n.id} timestamp={new Date(n.created_at).toLocaleString()} title={n.title}>
            {n.message && <p className="text-sm text-fg-muted">{n.message}</p>}
          </InsightCard>
        ))}
      </div>
    </div>
  );
}
