# @4dl/email

Transactional mail, and the HTML kit that makes it look like the product.

| Module | What it is |
|---|---|
| `mailer.ts` | The provider decision, the MIME builder, and the component kit (shell, button, bars, rings, sparklines, stat rows). |
| `provider.ts` | The PER-TENANT lane: the platform sender, or `off`. A bring-your-own-provider lane was removed — a second processor, a second set of terms, and one no sub-processor list disclosed. |
| `schema.ts` | `email_templates` — a tenant's white-label overrides. |

## `email.provider` is on the shared allow-list, so the send path must MERGE

`getEmailConfig` used to read `app_config` with a raw
`SELECT … WHERE key IN ('email.provider','email.from')`. That is this app's
table and only this app's table — which was fine until `email.provider` became
shareable, and then quietly wrong in the worst direction.

An operator who set the provider once for the platform and cleared this app's
own row — which the shared-config panel offers, as **Use shared** — would have
had the send path fall through to the `"mock"` default and stop delivering
mail, while every screen reported a configured provider. On a passwordless
platform that is not "email is degraded", it is "nobody can sign in".

So it reads through `getConfig`, and `sendEmail`/`emailDeliverable` take a
`ConfigSource`: pass the ENV wherever one is to hand. A bare `D1Database` still
works and sees app-local config only, which is the right answer for a caller
that genuinely has nothing else.

`email.from` is unaffected either way — it is app-local by design (it carries
the product's display name) and a local row always wins.


## Two things the app supplies

**Its identity** (`configureEmailBrand`). The name, accent and logo the platform's
OWN mail wears — sign-in codes, receipts, dunning — plus the address it sends
from. Deliberately separate from a tenant's brand: those messages come from the
platform, and wearing a tenant's colours on a "your subscription lapsed" notice
would be a small lie.

**The meter, if it sells sending** (the `EmailMeter` parameter). See below.

## Every brand asset must be ABSOLUTE and PUBLIC

A mail client fetches an image over the open internet: no session, no cookies, no
notion of the app's origin. So a `BrandKit`'s `logoUrl`/`iconUrl` are absolute
urls to something a stranger can `GET`, and an app that stores its brand assets
behind an authed media proxy has to resolve them to a public url before they get
here. Kova's `tenantBrandKit` does exactly that — it absolutises the studio's
`/api/media/t/<id>/brand/…` key against the studio's own hostname, and refuses
any other media key, because a private one would 401 into a broken box.

The two are different SHAPES and the shell treats them as such: a `logoUrl` is a
wordmark and is drawn ALONE (it already contains the name), while an `iconUrl` is
square and is drawn as a rounded chip beside the name. Passing a wordmark as the
icon gets you its middle third; passing an icon as the logo gets you a blur.
Neither is an error — with both absent the shell sets the name cleanly, which is
a complete email, so an app with no assets should pass none rather than point at
one that does not exist.

## The default sender cannot send, on purpose

`PLATFORM_FROM_DEFAULT` is `noreply@invalid.local`. A plausible-looking default
would let a fresh deploy appear to work while every message bounced at the
provider; an obviously broken one fails where somebody will see it. Bind a real
one with `configureEmailBrand`, and set `email.platform_from` in config.

The same fail-loud instinct governs the `mock` provider: it logs the message body
— **including sign-in OTPs** — so it delivers only on the development lane
(`isDevLane`). In production it returns an error rather than a silent success,
because a deploy left on `mock` would otherwise write the sole authentication
factor to retained Workers logs and tell the user their code was on its way.

`emailDeliverable()` exists for the same reason at a different layer. Better Auth
invokes `sendVerificationOTP` inside `runInBackgroundOrAwait`, whose body is
`try { await promise } catch { logger.error }` — it swallows the throw and still
returns `200 {"success":true}`. A failure raised inside that callback can never
reach the client. Pre-flighting is the only way to return a real error.

## The meter is a parameter, not module state

```ts
export interface EmailMeter {
  charge: (tenantId: string, credits: number) => Promise<boolean>  // false ⇒ skip
  refund: (tenantId: string, credits: number) => Promise<void>
}

sendTenantEmail(env, tenantId, msg, meter?)
```

Pass nothing and every send is free — the right default for an app that mails its
users but does not resell the sender. Nothing in the platform may require a
payment provider, which is why this is injected rather than an import of
`@4dl/billing` (the same rule that keeps `@4dl/storage` off the billing tables).

Unlike the brand, it is a **parameter**. The brand is known at module load; a
meter needs per-request bindings to reach the credit authority, and a lazily
armed global would make "did anyone remember to arm it?" the difference between
a metered send and a free one.

## Composing onto someone else's table

`EMAIL_SCHEMA` adds `email_config_json` to `tenant_settings`, which
`@4dl/tenancy` creates. That is the intended shape — one settings row per tenant
with columns from several packages, not a settings table per package — and it
costs one ordering rule: **this module must run after tenancy** in
`schemaGate([...])`. An `ADD COLUMN` ahead of its `CREATE TABLE` raises
"no such table", which the runner does not tolerate (it swallows only
"duplicate column").

## Importing this from a browser

Use **`@4dl/email/model`** — the component kit and the escaping helpers, all
pure, so a preview screen renders exactly the markup a mail client will get. The
root reaches D1 and the send binding.

## Boundary

Empty ALLOW list.
