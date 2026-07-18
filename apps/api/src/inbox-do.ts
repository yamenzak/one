/**
 * InboxDO (SPEC §3, §8.10) — one Durable Object per user, holding that user's
 * live WebSocket connections for real-time notification push. Replaces the
 * 30-second polling bell (which stays as a backstop client-side).
 *
 * The DO is a pure fan-out relay: the worker authenticates the WS upgrade and
 * routes it here by user id; when a notification row is written, `notifyUser`
 * calls `push()` and every open socket for that user gets a nudge to refetch.
 * Uses WebSocket hibernation so idle connections cost nothing.
 */

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env.js";

export class InboxDO extends DurableObject<Env> {
  /** WS upgrade handshake — accept the socket into the hibernatable set. */
  override async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Broadcast a payload to every open socket for this user (best-effort). */
  async push(payload: unknown): Promise<void> {
    const msg = JSON.stringify(payload ?? { type: "refresh" });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg);
      } catch {
        /* socket gone — hibernation reaps it */
      }
    }
  }

  /** Client keepalive; we only ever push server→client otherwise. */
  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message === "ping") {
      try {
        ws.send("pong");
      } catch {
        /* ignore */
      }
    }
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code);
    } catch {
      /* already closed */
    }
  }
}

/**
 * Nudge a user's open sockets to refetch. Best-effort: any failure is swallowed
 * because the client's fallback poll still delivers the notification.
 */
export async function notifyUser(env: Env, userId: string | null | undefined, payload?: unknown): Promise<void> {
  if (!userId) return;
  try {
    const stub = env.INBOX.get(env.INBOX.idFromName(userId));
    await stub.push(payload ?? { type: "refresh" });
  } catch {
    /* polling covers it */
  }
}
// Owner fan-out with preferences + email now lives in notify.ts (notifyOwners).
