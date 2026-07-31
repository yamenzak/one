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
import type { HasDb } from "@4dl/core";

/** Bindings the push path reads. The namespace is described structurally for the
 *  same reason `@4dl/ai` describes the credit DO's — `DurableObjectNamespace<T>`
 *  is invariant, so an app's subclass would not be assignable. */
export interface InboxBindings {
  INBOX: {
    idFromName(name: string): DurableObjectId;
    get(id: DurableObjectId): { push(payload?: unknown): Promise<void> };
  };
}

export class InboxDO extends DurableObject<HasDb> {
  /** WS upgrade handshake — accept the socket into the hibernatable set. */
  override async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    // Cloudflare's docs name these halves `client`/`server`. Renamed locally
    // because `client` is a PRODUCT noun in one of the apps this package serves,
    // and the boundary checker cannot tell a coaching client from a socket end —
    // nor should it have to weaken a rule for a variable name.
    const [browserSide, workerSide] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(workerSide);
    return new Response(null, { status: 101, webSocket: browserSide });
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

  /** Drop all durable state + close any open sockets — called when the user is
   *  erased (account delete / tenant purge / nuclear reset). */
  async wipe(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) { try { ws.close(1000, "account closed"); } catch { /* already gone */ } }
    await this.ctx.storage.deleteAll();
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
export async function notifyUser(env: InboxBindings, userId: string | null | undefined, payload?: unknown): Promise<void> {
  if (!userId) return;
  try {
    const stub = env.INBOX.get(env.INBOX.idFromName(userId));
    await stub.push(payload ?? { type: "refresh" });
  } catch {
    /* polling covers it */
  }
}
// Owner fan-out with preferences + email now lives in notify.ts (notifyOwners).
