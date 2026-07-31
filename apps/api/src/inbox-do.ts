/**
 * Kova's binding of `@4dl/notify` (SPEC §3, §8.10).
 *
 * `InboxDO` is the platform's — one Durable Object per user holding that user's
 * live WebSocket connections, a pure fan-out relay with nothing coaching-shaped
 * in it. It is re-exported (not subclassed) because `wrangler.jsonc` binds the
 * migration to the class NAME, and `index.ts` must keep exporting `InboxDO`.
 *
 * `notifyUser` is re-exported for the ~20 call sites that write a notification
 * row and then nudge the sockets.
 */

export { InboxDO, notifyUser } from "@4dl/notify";
export type { InboxBindings } from "@4dl/notify";
