# @4dl/notify

The inbox: a notification row, and a live nudge to whoever it is for.

| Module | What it is |
|---|---|
| `inbox-do.ts` | `InboxDO` — one Durable Object per user holding that user's open WebSockets, plus `notifyUser`. |
| `schema.ts` | `notifications`, `user_prefs`, `digest_sent`. |

## The DO is a relay, and that is all

The worker authenticates the WebSocket upgrade and routes it here by user id.
When a notification row is written, `notifyUser` calls `push()` and every open
socket for that user gets a nudge to **refetch** — the payload is not the
notification. That keeps the DO free of any product vocabulary and means a
dropped push costs nothing: the client's slow poll is still the backstop, which
is why `notifyUser` swallows every failure.

WebSocket hibernation is on, so an idle connection costs nothing.

`InboxDO` is re-exported by the app, not subclassed: `wrangler.jsonc` binds the
migration to the class NAME, so the app's export must keep that name.

## Reaching the namespace

```ts
export interface InboxBindings {
  INBOX: {
    idFromName(name: string): DurableObjectId
    get(id: DurableObjectId): { push(payload?: unknown): Promise<void> }
  }
}
```

Structural, not `DurableObjectNamespace<InboxDO>`, for the reason `@4dl/ai`
documents at length: that type is invariant in its parameter, so an app's
subclass — which has strictly *more* methods — is not assignable to it.

## What a tenant purge may and may not sweep

`scoped.tenantTables` is **`["notifications"]` only**. `user_prefs` (units,
widget layout, channel switches) and `digest_sent` (send idempotency) are keyed
on a USER, who is cross-tenant, and neither carries a `tenant_id` to cascade on.
Naming them would issue `WHERE tenant_id = ?` against a column that does not
exist — and the sweep swallows D1's error, so the first symptom would be someone
else's preferences vanishing when a tenant they also belong to closes. Same rule
`@4dl/auth` applies to identity, one layer up.

`NOTIFY_SCHEMA` also adds `notif_policy_json` to `tenant_settings`, which
`@4dl/tenancy` creates — so this module must run after tenancy in
`schemaGate([...])`. See `@4dl/email`'s README for why that ordering is not
optional.

## What the APP supplies

The notification TYPES and their categories. `notifications.type` and
`.category` are free text here on purpose: "check-in submitted" and
"stock below reorder point" are metered, stored, pushed and preference-gated
identically, and only the registry naming them differs.

## Boundary

Empty ALLOW list. One thing left on the way in: Cloudflare's docs name the
`WebSocketPair` halves `client` and `server`. The first is a product noun in one
of the apps this package serves, and the checker cannot tell a coaching client
from a socket end — nor should a rule be weakened for a local variable. They are
`browserSide` / `workerSide` here.
