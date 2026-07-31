# @4dl/admin

The operator console every 4DL app puts on its `admin.` door.

| Module | What it is |
|---|---|
| `console.tsx` | The shell: a section registry, rendered as an index and a page per section. Router-free. |
| `deps.ts` | The two things a panel needs from its host — an HTTP client and an error formatter. Both injected. |
| `sections/email.tsx` | Platform email delivery: provider, both senders, and the per-send price. |

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

## Router-free, like `SectionDetail`

`openKey` + `onOpen` are props. A shared package that imports one router cannot
be consumed by an app using a different one, and the binding is four lines in the
app. Kova binds it to a query param with `replace: true` on close, so Back steps
out of a section before it leaves the console.

## What a panel may live here

Only configuration a **shared package already owns**. Email delivery qualifies:
`email.provider`, `email.from`, `email.platform_from` and
`email.credits_per_email` are `@4dl/email`'s keys, read by nothing else, and its
provider fails closed when they are unset. Nothing about them is Kova's.

Kova's own sections — studios, plans, Stripe, promo codes, the starter exercise
library — stay in the app, and always will.

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
