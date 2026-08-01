# @4dl/app-kit

The browser-side runtime every 4DL app would otherwise rewrite.

| Module | What it is |
|---|---|
| `api.ts` | The typed fetch layer: same-origin cookies, JSON in/out, the 401 re-auth hook, a request interceptor, and the **three-way offline outcome**. |
| `host.ts` | `HostInfo` and the five doors, `tenantUrl`/`adminUrl`, and the `/api/host` read with its one load-bearing fallback. |
| `storage.ts` | Prefixed `localStorage` with a sign-out sweep and a keep-list. |
| `passkey.ts` | The WebAuthn ceremony against Better Auth: enroll, sign in, conditional UI, and error messages that say *why*. |
| `stripe.ts` + `PaymentSheet.tsx` | Stripe.js loaded at runtime (no CDN build dependency) and the inline Payment Element sheet, for both rails. |
| `Turnstile.tsx` | The Cloudflare human check. |
| `ErrorBoundary.tsx` | A real error boundary that clears itself on route change. |
| `hard-refresh.ts` | The escape hatch from a stale precached build. |
| `notices.tsx` | The four runtime notices no screen owns: offline, queued write, **a new build waiting**, an uncaught rejection. |
| `RefreshNote.tsx` | `hardRefresh()` as an affordance, for the screens a signed-out visitor can be stranded on. |

## The update prompt is not blocking, and that is a decision

`PwaUpdatePrompt` announces a waiting build; it does not force one. Two reasons,
and the first is the same one that turned `skipWaiting` off in the app's Workbox
config:

- **A reload discards unsaved input.** These apps are used mid-task — mid-set,
  mid-form. "We shipped something, lose your work now" is not a trade a routine
  deploy earns. The waiting worker activates on its own the next time every tab
  is closed, which is the moment that costs nobody anything.
- **"A newer build exists" is not "your build is broken".** They get conflated
  because the service worker only reports the first. Blocking on it treats every
  deploy as an incident.

So `blocking` is a prop, defaulted off, for the app that genuinely knows the
second fact — an API that refuses the running bundle, a migration that requires
a client change. Passing it renders the same card as an `alertdialog` over a
scrim with no way past.

"Later" is a **snooze, not a dismissal** (20 minutes, and a newer build clears
it). The previous version had a × that set a boolean nothing ever reset, so one
tap parked a user on a stale build for the life of the tab — the opposite of
what the prompt is for.

## The three-way offline outcome

This is the one non-obvious contract in the fetch layer, and getting it backwards
corrupts data.

`fetch` rejects only on a network-level failure — a 4xx/5xx resolves normally. So
a rejection is one of two very different things:

- **`QueuedError`** — the service worker parked this write in its Background-Sync
  queue and it *will* replay. Workbox's `BackgroundSyncPlugin` enqueues in
  `fetchDidFail` and then **re-throws the original error**, so the promise
  rejects even though the write is durable. Report that as a failure and the user
  taps the button again, a second copy queues, both replay, and the record
  double-counts.
- **`OfflineError`** — nothing was written. Retrying is the right advice.

Two things gate the distinction, and both must hold: the path matches the app's
`queuedWrites` pattern, **and** a service worker is actually *controlling* the
page. Without a controller (dev server, first load before activation, SW
disabled) a failed write is simply lost, and saying "saved" would be a lie.

`queuedWrites` is the app's — only the app knows which of its writes its service
worker was configured to queue. It must mirror the `urlPattern` in the app's vite
config; if it drifts, a write the SW did *not* queue gets reported as "saved,
will sync", and it never syncs.

## The gate is imported, not re-declared

`HostInfo.gate` is `@4dl/tenancy`'s own `HostGate`. That is deliberate: the
server spreads the gate whole (`{ ...host.gate }`), and re-typing the shape here
is exactly how `blocked` once reached the model, the resolver and the shell while
the endpoint still sent only `{ readOnly, reason }` — the app read
`gate.blocked` as undefined and rendered the ordinary read-only app for a tenant
whose access was withheld. One type, no drift.

For the same reason `resolveHostInfo` distinguishes a **404 from a network
failure**. A 404 is an *answer*: the route guard returns it for a reserved or
over-nested host, meaning "this door is not one of ours". Collapsing it into the
root fallback renders the platform signpost on a host the deployment
deliberately serves nothing at.

## Storage: two ways to get the sweep wrong

`appStorage(prefix, keep)` namespaces every key and sweeps them on sign-out. Both
failure modes are real and neither is app-specific:

- **too wide** — an early version wiped every prefixed key, so a light-theme user
  signed back in to a dark app and had to re-pick it every single time. Display
  preferences are not account data.
- **too narrow** — anything that could carry one account's data into the next
  session must go. Above all the cached identity payload.

That cache (`CONTEXT_CACHE`) is what makes an offline-first app work at all: the
shell is precached but the endpoint saying *who is signed in* is per-session and
cannot be. Without it a cold start with no signal throws, nulls the session and
renders the sign-in screen — which is the one place the write queue is
unreachable. It is a **UI convenience only**: the session cookie is HttpOnly,
every read and write is still authorized server-side, and a real 401 clears it.

## The session is a FACTORY

`createSession<Ctx, B>({ storage, tenantsOf })` returns `{ SessionProvider,
useSession, useOnline }`. It owns the whole boot sequence and its failure modes:
the host probe, `/api/context`, the offline-degraded fallback, the 401 handler,
connectivity, sign-out, and crossing to another tenant. The app supplies only its
context TYPE and two small readers.

Generic over the payload rather than over a base interface, because an app's
context is its own shape and nothing here reads into it except `tenantsOf` —
which exists solely so `switchTenant` can build the target hostname.

**The router stays out.** `useSearchParams` and friends would couple every 4DL
app to one router, and the one place an app needs it — honouring a `?t=<tenantId>`
hint on an emailed deep link — is ten lines that belong beside that app's own
routes. `switchTenant` is exposed so the app can wire it.

Two things it does that look like details and are not:

- **A network failure is not a sign-out.** A cold start with no signal restores
  the cached payload and renders the app degraded, because the sign-in screen is
  precisely where the offline write queue becomes unreachable. A real 401 clears
  both the state and the cache, so a signed-out user never looks signed in.
- **Sign-out is not swallowed.** The session cookie is HttpOnly, so only the
  server can clear it and the request has to land. A `.catch(() => undefined)`
  plus an in-place reload silently re-authenticates whenever it does not — which
  reads as "sign out does nothing". `finally` still resets and navigates.

## `useInbox` — the transport, not the bell

`@4dl/notify`'s DO pushes "refetch", never the notification, so the client half
is: hold a socket, reload when told, keep a slow poll behind it. `useInbox<N>({
online })` is that, generic in the row shape.

`online` is not optional politeness. While offline the socket can only fail, so
an ungated backoff-reconnect plus a 90-second poll grinds against a dead radio
for an entire session — draining the battery in exactly the scenario the offline
support exists for.

The rendering, the surface filtering and the per-type icons stay in the app: they
are a registry, and a hook that returned JSX would be the design system's job.

## What did NOT move, and why

- **`Shell.tsx`** — role-adaptive nav is a product decision, and the extraction
  plan says so explicitly (§3.2). It is not a candidate.
- **`StudioPausedBanner`** — the mechanism is a coloured strip; everything else
  about it is Kova's words, Kova's roles and Kova's dunning ladder. Remove the
  copy and there is nothing left to share.
- **`NotificationBell`'s rendering, `StudioSwitcher`, `FeatureLock`** — each is
  mostly a registry read (notification surfaces and coding, persona labels and
  tones, the entitlement catalog) wrapped around a few `@4dl/ui` primitives.
  Injecting the registry would leave a component that is a `Card` with a
  parameter, which is worse than the app owning it.

`theme.tsx` DID move, because the one thing tying it to the app was where
branding came from — now a prop. The app resolves it (signed-in tenant wins,
else the host's tenant so a sign-in screen is already branded) and passes it in.

## Boundary

Empty ALLOW list. One exemption was added to the checker for this package:
`clientExtensionResults`, which is WebAuthn's own field name on
`PublicKeyCredential`. That list takes names a **spec or a vendor** chose, never
one the codebase chose — contrast `@4dl/notify`, where the `WebSocketPair` halves
were renamed rather than exempted, because those were ours to name.
