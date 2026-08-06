/**
 * The notification push DO — `@4dl/notify`'s, re-exported (not subclassed).
 *
 * `wrangler.jsonc` binds the migration to the class NAME, and the worker's entry
 * module has to export it, so this is the seam. There is nothing app-specific in
 * it: the DO is a pure fan-out relay whose payload is "refetch", not the
 * notification, which is why a dropped push costs nothing and the client's slow
 * poll remains the backstop.
 */
export { InboxDO, notifyUser } from "@4dl/notify";
