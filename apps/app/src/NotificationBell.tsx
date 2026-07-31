/**
 * Notification bell — surface-aware unread badge + dropdown, click-through,
 * mark-all-read.
 *
 * The TRANSPORT is `@4dl/app-kit`'s `useInbox`: a live socket to `InboxDO` with
 * a slow poll behind it, both torn down while offline. What stays here is
 * everything that reads Kova's registry — which notifications belong to which
 * SURFACE (a client sees client notifications; a coach in train mode does too),
 * their icons and tones, and the mode-flip on click-through.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, IconBadge } from "@4dl/ui";
import { notifVisibleInSurface, unreadInSurface, type NotifType, type NotifSurface } from "@kova/domain";
import { useInbox } from "@4dl/app-kit";
import { api } from "./api.js";
import { useSession } from "./session.js";
import { notifCoding } from "./notif-ui.js";

interface Notification { id: string; type: NotifType; tenant_id: string | null; title: string; message: string | null; link: string | null; read: number; created_at: string }

export function NotificationBell() {
  const { ctx, mode, setMode, switchTenant, online } = useSession();
  const nav = useNavigate();
  const { items, failed, patch } = useInbox<Notification>({ online });

  // The surface you're currently in decides which notifications the bell shows:
  // a client (or a coach in train mode) sees client notifications; otherwise staff.
  const surface: NotifSurface = ctx?.active?.role === "client" || mode === "train" ? "client" : "staff";
  const activeTenantId = ctx?.active?.tenantId ?? null;

  // Only the current surface's notifications (train vs coach mode).
  const shown = items.filter((n) => notifVisibleInSurface(n.type, surface));
  const unread = unreadInSurface(items, surface);

  const markRead = async (id: string) => {
    await api.post(`/api/notifications/${id}/read`).catch(() => undefined);
    patch((p) => p.map((n) => (n.id === id ? { ...n, read: 1 } : n)));
  };
  const markAll = async () => {
    await api.post("/api/notifications/read-all", { surface }).catch(() => undefined);
    patch((p) => p.map((n) => (notifVisibleInSurface(n.type, surface) ? { ...n, read: 1 } : n)));
  };
  const open = async (n: Notification) => {
    void markRead(n.id);
    // A notification from another studio: switch to it before navigating.
    if (n.tenant_id && n.tenant_id !== activeTenantId) { try { await switchTenant(n.tenant_id); } catch { /* stay put */ } }
    // Client-surface links need train mode; staff links need coach mode. Since
    // the list is already surface-filtered this rarely flips, but keep it safe.
    if (mode !== "train" && surface === "client") setMode("train");
    if (n.link) nav(n.link);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label="Notifications">
          <Bell className="size-[1.15rem]" />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{unread > 9 ? "9+" : unread}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[28rem] w-80 overflow-y-auto">
        <div className="flex items-center justify-between pr-1">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          {unread > 0 && <button onClick={() => void markAll()} className="text-xs font-medium text-primary hover:underline">Mark all read</button>}
        </div>
        <DropdownMenuSeparator />
        {!online && shown.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">You're offline — notifications will update when you reconnect.</div>
        ) : failed && shown.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-warning">Couldn't load notifications. We'll keep trying.</div>
        ) : shown.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">You're all caught up.</div>
        ) : (
          shown.slice(0, 20).map((n) => {
            const { icon, tone } = notifCoding(n.type);
            return (
              <button key={n.id} onClick={() => void open(n)} className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary ${n.read ? "opacity-60" : ""}`}>
                <IconBadge icon={icon} tone={tone} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{n.title}</div>
                  {n.message && <div className="truncate text-xs text-muted-foreground">{n.message}</div>}
                  <div className="mt-0.5 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</div>
                </div>
                {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
              </button>
            );
          })
        )}
        {shown.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <button onClick={() => nav("/inbox")} className="w-full rounded-xl px-3 py-2 text-center text-sm font-medium text-primary hover:bg-secondary">See all</button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
