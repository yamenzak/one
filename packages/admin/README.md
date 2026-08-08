# @4dl/admin

The operator console every 4DL app puts on its `admin.` door.

| Module | What it is |
|---|---|
| `console.tsx` | The shell: a section registry, rendered as an index and a page per section. Router-free. |
| `use-section.ts` | `useConsoleSection` / `useUrlKey` — the open section, in the URL, over the History API. |
| `split.tsx` | `ConsoleSplit` — a panel with sub-pages, same mechanism, one query param each. |
| `deps.ts` | The three things a panel needs from its host — `get`/`post`/`patch` and an error formatter. Injected. |
| `conformance.ts` | `sharedPanelViolations(dir)` — fails an app that reaches a shared admin endpoint directly. |
| `sections/email.tsx` | Platform email delivery: provider, both senders, and the per-send price. |
| `sections/maintenance.tsx` | The deployment-wide switch: `off` / `readonly` / `full`. |
| `sections/stripe.tsx` | The platform rail: two lanes, the flip, write-only keys, catalog sync and price rebuild. |
| `sections/domains.tsx` | Cloudflare for SaaS: token, zone, CNAME target, worker-name override. |
| `sections/turnstile.tsx` | The bot check on sign-in — including the one combination that locks everybody out. |
| `sections/ai.tsx` | Provider key, mock lane, credit markup, catalog sync, and the per-lane default-model picker. |
| `sections/shared-config.tsx` | **The shared platform store** — the keys every 4DL app reads, set once instead of once per product. |
| `sections/rail.tsx` | **Unattributed payments** — Stripe events the rail could not match to any app. Money in, nothing granted. |
| `sections/plans.tsx` | **The plan catalog** — price, limits, features, the credit grant and the free TRIAL. |

## The sections are the app's; the frame is not

This is the whole design. A console section is named after something an
operator manages — "Studios", "Warehouses", "Venues" — and that is product
vocabulary by definition. So the app owns `ConsoleSection[]` and this package
owns the frame around it.

The frame is not nothing. Kova's console proved the shape the expensive way: its
first tab measured **61,541px** on a seeded install — every studio ever created,
in one scroll, with no chunking — and the other six tabs were invisible behind
it. The index-and-a-page-per-section pattern is the fix, and it is the same one
`@4dl/ui` already ships for settings, because a console *is* a settings surface
whose subject happens to be the platform.

## Router-free, but not binding-free

`openKey` + `onOpen` are props. A shared package that imports one router cannot
be consumed by an app using a different one.

That was the whole story until a second app shipped, and it turned out to be half
a design. "It takes props" is not a binding, and the obvious binding is wrong:

```tsx
const [open, setOpen] = useState<string | null>(null)   // ← Tessa's console did this
```

It compiles, it looks right, and it means every section lives at the same
address. Back leaves the console from three levels deep, no section can be linked
or bookmarked, and a reload always lands on the index. Kova bound the same shell
to a query param and got all three for free — so the difference between the two
consoles was four lines nobody wrote.

`useConsoleSection()` is now the default, over the History API rather than a
router, so it works with no router and alongside any. It dispatches `popstate`
after `pushState` deliberately: routers subscribe to `popstate` and `pushState`
fires no event, so without it a mounted router's `location` goes stale the moment
a section opens.

## The shared-config panel is the one that saves to every app

Every other panel here writes THIS app's `app_config`. `sections/shared-config.tsx`
writes `@4dl/core`'s shared KV namespace, which every 4DL worker binds by the
same id — so a save on `admin.kova.4dl.app` is a save for Tessa too.

That is the feature (one Google account should not need configuring twice) and
it is also the risk, so this is the only settings surface in the console that
**confirms before saving**, and the dialog names the blast radius rather than
burying it in a tooltip.

Two things the panel exists to make visible, because neither is inferable from
any other screen:

- **This app's own value still wins.** Each row carries `overriddenHere`, so
  "I set it centrally and this app still uses the old one" has a visible cause.
  Without it the override is a database row nobody is looking at. The badge
  comes with a **Use shared** button, and that button is what makes the feature
  reach the apps that already exist rather than only the next one: every live
  app holds a local row for every credential it uses, and most per-app panels
  cannot clear their own field (the AI panel only writes a non-empty key; the
  email panel validates its sender against a regex a blank fails). The screen
  that knows a key is overridden is the only one that can un-override it.
- **The per-app panels are literal.** A key set in the shared store and not
  overridden reads as *unset* on the AI / Email / Stripe / Turnstile panels,
  because those report only what the app holds of its own.

That second one looks like a bug to fix by making those panels show the merged
value. It is not: they **save every field they display**, so a merged read plus
one save would silently copy the shared value into this app as a permanent local
override — turning a display fix into the exact drift the shared store exists to
remove.

Labels and grouping live in the panel, not in core. Which keys are safe to share
is a fact about the platform's architecture; what to call them is copy. A key
that reaches the API with no label here still renders, under "Other", spelled as
its raw key — an unlabelled setting is a nuisance, an invisible one is a setting
nobody knows is set.


## What a panel may live here

Only configuration a **shared package already owns**. Eight qualify today:

- **Email delivery** — `email.provider`, `email.from`, `email.platform_from` and
  `email.credits_per_email` are `@4dl/email`'s keys, read by nothing else, and
  its provider fails closed when they are unset. Nothing about them is Kova's.
- **Maintenance** — `@4dl/tenancy`'s deployment-wide switch (`off` / `readonly` /
  `full`). Closing a deployment for a migration is not something one app does
  differently from another, and the panel's real job is the same everywhere:
  spell out what the selected level does *before* it is pressed, say out loud
  which doors stay open, and make the step that ends every session take a second
  press.

- **Stripe** — `/admin/stripe/{status,config,sync}` are `@4dl/billing`'s, and
  identical in every app that has them. Two lanes, the mismatch alarm and the
  price rebuild are facts about Stripe, not about any product.
- **Unattributed payments** — `@4dl/billing-rail` owns `rail_parked_events`.
  One Stripe account serves every app, so an event that matched no product is
  the platform's problem by definition; an app-owned screen would mean N of
  them, each blind to the others.
- **Shared platform config** — `@4dl/core` owns the store, the allow-list and
  `sharedConfigRoutes`. Which credentials the whole platform has in common is a
  fact about the platform, and no product has an opinion about it.
- **Custom domains** — `@4dl/tenancy` has owned `domainAdminRoutes` since Stage
  10a, so every app that mounts it (the template included) had a working
  custom-domain feature and no way to configure it.
- **Turnstile** — `@4dl/auth`'s. A secret stored with no site key locks *every*
  4DL app out of its own sign-in, so the warning belongs with the package that
  owns the check, not with whoever remembers to write it.
- **The plan catalog** — over `@4dl/billing`'s `planAdminRoutes`. The three
  rules it carries are the argument for it being here rather than in each app,
  because each is invisible until it costs something: a price change must NULL
  the plan's Stripe id pair (or `syncCatalog` skips the row and every subscriber
  keeps paying the old amount), lowering a limit must GRANDFATHER whoever is
  already on the tier, and an omitted `trialDays` means "leave it alone" rather
  than "no trial". Written three times, this went: all three in one app, none in
  a second that had no plan editor at all, and the middle one missing in a third
  — whose help text described stripping live tenants as the design.

  What the app supplies is the CONTENTS (`DEFAULT_PLANS`) and the key LABELS.
  The key LIST comes off the bound entitlement engine, so a limit added
  server-side appears in the editor with no client release.

  ⚠️ The conformance entry is `/api/admin/plans/` **with the trailing slash** —
  the EDIT. The bare list read stays allowed, because a promo dialog needs the
  plan names for a dropdown and refusing that would push an app into inventing a
  second endpoint over the same rows.
- **AI** — over `@4dl/ai`'s `aiCatalogAdminRoutes`. An app's own pieces ride in
  as slots: `extraSub` for a live self-test (which needs the product's prompts)
  and `extraBelowCatalog` for whatever it does with user feedback. `extraSub`'s
  `render` is *handed* the loaded catalog rather than fetching it — an app asking
  `/api/admin/ai/models` for itself is exactly what the conformance check below
  refuses, and it caught that during this extraction.

Kova's own sections — studios, plans, promo codes, the starter exercise library,
the platform reset — stay in the app, and always will. Two of those ride along as
slots rather than features: `PlatformTurnstileSection` takes an `extra` node,
which is where Kova's nuclear reset lives. Wiping a deployment is not something a
shared package should know how to do.

## The rule is enforced, not documented

`@4dl/admin/conformance` exports `sharedPanelViolations(srcDir)`, and both apps
assert it is empty. An app that calls `/api/admin/stripe/…` itself fails its own
test suite, naming the section it should have used.

This exists because the honour system failed exactly once and that was enough.
Kova built good surfaces over three shared endpoints; Tessa, facing the same
three, shipped `<pre>{JSON.stringify(data, null, 2)}</pre>` plus three text boxes
over one and nothing at all over the other two. Neither app could see the problem
from the inside — it only became visible with a second app to compare against,
which is precisely what a conformance test is for.

**If a shared section is missing something you need, add it to the section.** The
tempting alternative — one more local copy, just for this app — is how the two
consoles diverged in the first place.

## Why the email panel exists at all

`GET /admin/email` and `POST /admin/email` had shipped and worked for months
**with no caller anywhere in the app**. The consequence was a line in Kova's
deploy guide: a fresh deployment cannot send a single email — including the
sign-in code, which on a passwordless platform is the only way in — until
somebody opens D1 and writes two rows by hand.

A value the product refuses to run without, and offers no way to supply, is not
configuration. It is a broken install with a runbook.

**It does not remove the bootstrap deadlock**, and no UI could: the screen needs
a platform-admin session, which needs an OTP, which needs email. The first seed
is still manual (DEPLOY.md §6). What it removes is every change *after* that one
— switching provider, correcting a bounced sender, repricing the shared lane —
and it makes the current state visible instead of implied.

The routes moved with it, into `@4dl/email/admin-routes`, for the same reason:
an app that takes the mailer and not a route module gets a mailer it cannot
configure. They gained validation on the way — the old handler accepted any
string up to 200 characters as a sender, which D1 stores happily and the MIME
builder then rejects on every send. A deployment that looks configured and
delivers nothing.

## Boundary

Empty ALLOW list, and it matters more here than in most packages: a console is
exactly where product vocabulary collects. The moment the shared shell "just
knows" about studios, the second app inherits a console describing the first
app's business.
