/**
 * THE INBOX TRANSPORT — a live socket with a poll behind it.
 *
 * `@4dl/notify`'s `InboxDO` pushes "refetch", never the notification itself, so
 * the client half is: hold a WebSocket, reload the list when it says to, and
 * keep a slow poll as a backstop for a push that was missed or a socket that
 * dropped. That is identical in every 4DL app, and it is the part with the
 * non-obvious behaviour.
 *
 * What is NOT here is the rendering, the surface filtering and the per-type
 * icons and tones. Those are a registry, they differ per product, and a hook
 * that returned JSX would be the design system's job anyway. The app keeps its
 * bell; this hands it a list and a refresh.
 *
 * ── Gated on connectivity, which is the whole reason this is worth sharing ───
 *
 * While offline the socket can only fail, so an ungated backoff-reconnect plus a
 * 90-second poll grinds against a dead radio for an entire session — draining
 * the battery in precisely the scenario the offline support exists for. Passing
 * `online: false` tears everything down; passing it back re-runs the effect,
 * which reconnects and reloads immediately.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

/** How often to reload when the socket has said nothing. */
const POLL_MS = 90_000;
/** Backoff cap — 2^6 seconds, about a minute between attempts. */
const MAX_RETRY = 6;

export interface InboxOptions {
  /** Live connectivity. `false` tears the socket and the poll down. */
  online: boolean;
  /** Where the list is read from. */
  path?: string;
  /** Where the socket connects. */
  wsPath?: string;
}

export interface Inbox<N> {
  items: N[];
  /** True when the last load failed — the bell can say so rather than show zero. */
  failed: boolean;
  reload: () => Promise<void>;
  /** Patch the local list without a round-trip, for optimistic mark-read. */
  patch: (fn: (items: N[]) => N[]) => void;
}

/**
 * Generic in the notification shape: an app's rows carry its own `type` union
 * and whatever else its registry needs, and none of that concerns the transport.
 */
export function useInbox<N>({ online, path = "/api/notifications", wsPath = "/api/inbox/ws" }: InboxOptions): Inbox<N> {
  const [items, setItems] = useState<N[]>([]);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      setItems((await api.get<{ notifications: N[] }>(path)).notifications);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [path]);

  useEffect(() => {
    if (!online) return;
    void reload();
    const poll = setInterval(() => void reload(), POLL_MS);
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (closed) return;
      try {
        const proto = location.protocol === "https:" ? "wss" : "ws";
        ws = new WebSocket(`${proto}://${location.host}${wsPath}`);
        ws.onopen = () => { retry = 0; };
        ws.onmessage = () => void reload();
        ws.onclose = () => {
          ws = null;
          if (closed) return;
          retry = Math.min(retry + 1, MAX_RETRY);
          timer = setTimeout(connect, 1000 * 2 ** retry);
        };
        ws.onerror = () => { try { ws?.close(); } catch { /* noop */ } };
      } catch { /* fall back to the poll */ }
    };
    connect();
    return () => {
      closed = true;
      clearInterval(poll);
      if (timer) clearTimeout(timer);
      try { ws?.close(); } catch { /* noop */ }
    };
  }, [reload, online, wsPath]);

  const patch = useCallback((fn: (items: N[]) => N[]) => setItems(fn), []);

  return { items, failed, reload, patch };
}
