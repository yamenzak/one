/** Notifications inbox — the full, grouped-by-day list behind the bell's
 *  "See all". Surface-aware (client vs coach mode), click-through, mark-all. */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Page, Stagger, SectionHeader, IconBadge, EmptyState, Reveal, SkeletonList, AlertTriangle, Bell, CheckCheck, ArrowLeft } from "@kova/ui";
import { notifVisibleInSurface, unreadInSurface, type NotifType, type NotifSurface } from "@kova/domain";
import { api } from "../api.js";
import { useSession } from "../session.js";
import { notifCoding } from "../notif-ui.js";

interface Notification { id: string; type: NotifType; tenant_id: string | null; title: string; message: string | null; link: string | null; read: number; created_at: string }

/** "Today" / "Yesterday" / a localized date, for day grouping. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function Inbox({ onBack }: { onBack: () => void }) {
  const { ctx, mode, setMode, switchTenant } = useSession();
  const nav = useNavigate();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const surface: NotifSurface = ctx?.active?.role === "client" || mode === "train" ? "client" : "staff";
  const activeTenantId = ctx?.active?.tenantId ?? null;

  // A failed read used to fall back to an empty list, which rendered the
  // "You're all caught up" empty state — indistinguishable from actually having
  // no notifications, so a user could miss real messages and never know. Now it
  // surfaces as an error with a retry; `alive` drops a response that lands after
  // a remount/retry has superseded it.
  useEffect(() => {
    let alive = true;
    setError(false);
    api.get<{ notifications: Notification[] }>("/api/notifications")
      .then((r) => { if (alive) setItems(r.notifications); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [reloadKey]);

  const shown = (items ?? []).filter((n) => notifVisibleInSurface(n.type, surface));
  const unread = unreadInSurface(items ?? [], surface);
  const markAll = async () => {
    await api.post("/api/notifications/read-all", { surface }).catch(() => undefined);
    setItems((p) => (p ?? []).map((n) => (notifVisibleInSurface(n.type, surface) ? { ...n, read: 1 } : n)));
  };
  const open = async (n: Notification) => {
    api.post(`/api/notifications/${n.id}/read`).catch(() => undefined);
    setItems((p) => (p ?? []).map((x) => (x.id === n.id ? { ...x, read: 1 } : x)));
    if (n.tenant_id && n.tenant_id !== activeTenantId) { try { await switchTenant(n.tenant_id); } catch { /* stay */ } }
    if (mode !== "train" && surface === "client") setMode("train");
    if (n.link) nav(n.link);
  };

  // Group consecutive items by day (already sorted newest-first by the API).
  const groups: { label: string; items: Notification[] }[] = [];
  for (const n of shown) {
    const label = dayLabel(n.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }

  return (
    <Page className="column space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack} aria-label="Back"><ArrowLeft /></Button>
        <h1 className="flex-1 text-title-3">Notifications</h1>
        {unread > 0 && <Button size="sm" variant="ghost" onClick={() => void markAll()}><CheckCheck /> Mark all read</Button>}
      </div>

      {error && items === null ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load notifications" description="Something went wrong fetching your inbox. Check your connection and try again." action={<Button onClick={() => setReloadKey((k) => k + 1)}>Try again</Button>} />
      ) : (
      <Reveal loading={items === null} className="space-y-5" skeleton={<SkeletonList card rows={6} thumb={36} />}>
        {items !== null && (shown.length === 0 ? (
          <EmptyState icon={Bell} title="You're all caught up" description="New notifications for this view will show up here." />
        ) : (
          groups.map((g) => (
            <div key={g.label} className="space-y-2">
              <div className="px-1 text-micro uppercase text-muted-foreground">{g.label}</div>
              <Stagger className="space-y-2">
                {g.items.map((n) => {
                  const { icon, tone } = notifCoding(n.type);
                  return (
                    // A notification with no destination is not tappable. It
                    // still marked itself read on click and then sat there, which
                    // reads as the app ignoring you.
                    <Card
                      key={n.id}
                      onClick={n.link ? () => void open(n) : undefined}
                      role={n.link ? "button" : undefined}
                      tabIndex={n.link ? 0 : undefined}
                      onKeyDown={n.link ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void open(n); } } : undefined}
                      className={`flex items-start gap-3 transition-colors ${n.link ? "cursor-pointer hover:bg-secondary" : ""} ${n.read ? "opacity-60" : ""}`}
                    >
                      <IconBadge icon={icon} tone={tone} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{n.title}</div>
                        {n.message && <div className="mt-0.5 text-sm text-muted-foreground">{n.message}</div>}
                        <div className="mt-1 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</div>
                      </div>
                      {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                    </Card>
                  );
                })}
              </Stagger>
            </div>
          ))
        ))}
      </Reveal>
      )}
    </Page>
  );
}
