# @4dl/notify

The inbox: a notification row, and a live nudge to whoever it is for.

| Module | What it is |
|---|---|
| `model.ts` | The CHANNEL ALGEBRA, pure — role × category → inbox/email, the stored-preference and tenant-policy parsers, the surface filter, the template renderer. `@4dl/notify/model` is browser-safe. |
| `dispatch.ts` | `dispatchNotification` / `dispatchToRole` — the one delivery path. Inbox is the package's; email is a hook. |
| `routes.ts` | `notifyRoutes` — `/notifications`, `/notifications/:id/read`, `/notifications/read-all`, `/inbox/ws`. |
| `inbox-do.ts` | `InboxDO` — one Durable Object per user holding that user's open WebSockets, plus `notifyUser`. |
| `schema.ts` | `notifications`, `user_prefs`, `digest_sent`. |

The surface lives in **`@4dl/app-kit`**: `NotificationBell` and `InboxScreen`,
with the per-type icon, the surface filter and the click-through injected.

## Why the model is here and not in an app

It was in one app's domain package for 441 lines, and roughly two thirds of that
was never about that product. The cost was visible from outside: the second app
exported `InboxDO`, bound it, pinned its class name in a permanent migration,
applied four tables — and had no routes, no dispatch and no UI. Every piece of
plumbing, nothing flowing through it.

A mechanism with no surface reads as done and is not.

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

One `configureNotify` call, at module scope, once:

```ts
configureNotify({
  categories,          // the app's copy: keys, labels, and which roles see each
  types,               // type → { category, to, title?, link?, template?, vars? }
  customerRole,        // the role that BUYS from the tenant; default: a sentinel
  audiences,           // what the two policy audiences are CALLED
  tenantVar,           // the template variable carrying the tenant's name
  defaultChannels,     // optional (role, category) override before the baseline
})
```

`notifications.type` and `.category` are free text in the schema on purpose:
"check-in submitted" and "stock below reorder point" are stored, pushed and
preference-gated identically, and only the registry naming them differs.

**`audiences` is load-bearing, not cosmetic.** Its two names are the keys a
tenant's stored `notif_policy_json` is written under (`emailAudience.<name>`)
and the values a per-surface bell sends as its surface. Renaming them on a live
deployment orphans every tenant's saved policy. Kova's are `client`/`staff`;
Tessa names one audience only, because every member of a sterile-supply
department is staff. The package's own defaults — `customer`/`member` — are
Better Auth's and `@4dl/commerce`'s nouns, not any product's word for a person.

An app that passes no `defaultChannels` gets the baseline: everything reaches
the inbox, email follows, and `digest` is email-only.

`dispatchNotification`'s `sendEmail` hook is **optional**. Omitting it is a
complete configuration — a working inbox — not a degraded one.

## Tests

`test/model.test.ts` runs the whole algebra against a registry that is neither
shipped app's: a library, with `borrower`/`librarian`, audiences named `reader`
and `staff`, and `{{branchName}}`. Kova's 30 notification tests exercise the same
code, but only ever prove it works for the vocabulary it was extracted *from* —
which is the exact failure the extraction exists to prevent.

## Boundary

Empty ALLOW list. One thing left on the way in: Cloudflare's docs name the
`WebSocketPair` halves `client` and `server`. The first is a product noun in one
of the apps this package serves, and the checker cannot tell a coaching client
from a socket end — nor should a rule be weakened for a local variable. They are
`browserSide` / `workerSide` here.
