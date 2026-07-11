/** Notification bell — unread badge + dropdown list, polls, marks read. */

import { useCallback, useEffect, useState } from "react";
import { Bell, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, Sparkles } from "@mossa/ui";
import { api } from "./api.js";

interface Notification { id: string; type: string; title: string; message: string | null; link: string | null; read: number; created_at: string }

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);

  const load = useCallback(async () => {
    try { setItems((await api.get<{ notifications: Notification[] }>("/api/notifications")).notifications); } catch { /* ignore */ }
  }, []);

  // Real-time via the per-user InboxDO WebSocket; a slow poll stays as a
  // backstop for missed pushes / dropped sockets (SPEC §8.10).
  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 90000);
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (closed) return;
      try {
        const proto = location.protocol === "https:" ? "wss" : "ws";
        ws = new WebSocket(`${proto}://${location.host}/api/inbox/ws`);
        ws.onopen = () => { retry = 0; };
        ws.onmessage = () => void load();
        ws.onclose = () => {
          ws = null;
          if (closed) return;
          retry = Math.min(retry + 1, 6);
          timer = setTimeout(connect, 1000 * 2 ** retry); // backoff, cap ~64s
        };
        ws.onerror = () => { try { ws?.close(); } catch { /* noop */ } };
      } catch { /* fall back to the poll */ }
    };
    connect();
    return () => { closed = true; clearInterval(poll); if (timer) clearTimeout(timer); try { ws?.close(); } catch { /* noop */ } };
  }, [load]);

  const unread = items.filter((n) => !n.read).length;
  const markRead = async (id: string) => { await api.post(`/api/notifications/${id}/read`).catch(() => undefined); setItems((p) => p.map((n) => (n.id === id ? { ...n, read: 1 } : n))); };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label="Notifications">
          <Bell className="size-[1.15rem]" />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-primary text-[0.6rem] font-bold text-primary-foreground">{unread > 9 ? "9+" : unread}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-96 w-80 overflow-y-auto">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">You're all caught up.</div>
        ) : (
          items.slice(0, 20).map((n) => (
            <button key={n.id} onClick={() => void markRead(n.id)} className={`flex w-full gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary ${n.read ? "opacity-60" : ""}`}>
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{n.title}</div>
                {n.message && <div className="truncate text-xs text-muted-foreground">{n.message}</div>}
                <div className="mt-0.5 text-[0.65rem] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</div>
              </div>
              {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
            </button>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
