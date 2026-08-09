# apps/_template — a new 4DL app

Every shared package wired up AND MOUNTED, and nothing product-specific. Copy
the two directories, rename them, and start adding routes.

```
cp -r apps/_template      apps/inventory        # the worker
cp -r apps/_template-app  apps/inventory-app    # the browser half — take BOTH
# then: package.json names, wrangler.jsonc name + ids + ROOT_DOMAIN + assets dir,
#       src/access.ts roles, src/entitlements.ts plan keys,
#       src/host-context.ts DEFAULT_ROOT + reserved labels,
#       src/mailer.ts brand + sender, src/db.ts your tables,
#       src/notifications.ts types, and the SPA's theme storage key (3 places)
# finally: an entry in apps.json, which is what wires CI, deploy and provisioning
pnpm install && pnpm --filter @<scope>/inventory test
```

It typechecks and its tests pass **in this workspace**, which is deliberate: a
template that is not built is a template that rots.

## What each file is for

| File | Yours to change | Why it exists at all |
|---|---|---|
| `env.ts` | the vars | The binding NAMES are fixed by `@4dl/core`'s contract. Rename one and packages stop matching, silently, at the type level. |
| `access.ts` | **yes** — roles + permissions | `@4dl/auth` owns the grant algebra; who counts as an owner is a product decision. |
| `entitlements.ts` | **yes** — quota + feature keys | `@4dl/billing` owns resolution; `staffSeats` means nothing to it. |
| `db.ts` | **yes** — your tables | The composed schema runner, in dependency order, app last. |
| `host-context.ts` | root + reserved labels | The three things `@4dl/tenancy` refuses to guess. |
| `auth.ts` | brand, seat rule, two emails | The passwordless factory. |
| `auth-context.ts` | rarely | The request identity. The ORDER inside it is the security model. |
| `route-guard.ts` | **yes** — the route table | The five gates, and which routes fall where. |
| `billing-do.ts` | the class name (once) | The credit authority. |
| `inbox-do.ts` | no | Re-export only; wrangler needs the entry export. |
| `storage.ts` `ai.ts` `mailer.ts` `email-provider.ts` | the registries | Where each package learns which app it is. |
| `org-guard.ts` | the noun in the copy | A tenant's slug becomes an ORIGIN, so the DNS-label + reserved-label check is a security control, not validation. |
| `domain-routes.ts` | the feature key gating it | Custom-domain binding: `@4dl/tenancy`'s routes, with authorization passed in. |
| `purge.ts` | the non-D1 side effects | The D1 cascade is DERIVED. Do not add a table list. |
| `billing-store.ts` | **yes** — the plans | `bindBillingStore`: seeding, the reads, and the parking row's status (which is a decision — see the file). |
| `notifications.ts` | **yes** — the types | The inbox's vocabulary. `notifyRoutes` reads this registry, so nothing dispatches until it exists. |
| `otp-guard.ts` | the eligibility rule | The one gate in front of the emailed sign-in code. **Two apps out of three shipped without it.** |
| `staff-routes.ts` | role copy, the invite email | Invite, revoke, re-role, remove — with pending invitations folded into the roster. |
| `media-routes.ts` | the `purpose` set | Upload, the storage meter, the authed read. A purpose is a path segment. |
| `exit-routes.ts` | the copy | Leaving. The route guard exempts these at every rung, so their absence is a trap. |
| `action-otp.ts` | the email | Step-up codes, for the two actions that cannot be undone. |
| `index.ts` | **yes** — your routes | The worker. |
| `test/conformance.test.ts` | **keep** | See below. |
| `test/integration.test.ts` | **keep, and grow it** | See below. |

## Six things that will bite you

Each has cost a real debugging session, and every one fails **silently**.

**1. Adding DDL means bumping `version`.** The marker row short-circuits the
whole module, so a new `CREATE TABLE IF NOT EXISTS` without a bump is invisible
on a fresh database and fatal on every existing one — the table is never created
and every route touching it 500s.

**2. `ENVIRONMENT` must never reach `wrangler.jsonc`'s `vars`.** That block is
the *deployed* config. The dev lane puts sign-in codes in retained logs, accepts
the repo-public auth-secret fallback (forgeable sessions), and turns on the AI
mock — which fabricates output and still bills the tenant credits for it.

**3. Do not declare `routes`.** `wrangler dev` then rewrites the incoming Host,
collapsing every door onto the root, and no tenant subdomain can be tested. The
header comment in `wrangler.jsonc` has the second reason, which is worse.

**4. Do not re-declare a shape a package already owns.** Spread it
(`{ ...host.gate }`). Hand-picking fields is how a new gate rung reached the
model, the resolver and the server while the client still read the old shape and
rendered the wrong state for a tenant whose access was withheld.

**5. Row-level scope is the route's job, not the guard's.** The guard proves the
caller is a member of *this host's* tenant with the right grant. It cannot know
that row 47 belongs to them. Every app needs one function every scoped route
goes through, and it must never be bypassed — Kova's is `requireClientAccess`.

**6. Reads are never gated.** The standing ladder withholds the *product*; it
does not hold a customer's data hostage over their tenant's invoice. Paying must
be a way out, not the only one — which is why the account-close and export paths
survive every rung, and why provider webhooks are exempt (blocking those makes
suspension unrecoverable).

## Keep the conformance tests

`test/conformance.test.ts` runs in plain Node — no database, no fixtures, no
Workers pool — so it works from the first commit. Every check in it catches
something invisible at runtime, which is the entire selection criterion:

- DDL that is not idempotent, or that fuses/swallows the rest of its batch
- an ALTER shape the runner cannot tolerate
- two modules claiming the same table
- a module ordered before the one whose table it extends
- **a table carrying a scope column that no erasure cascade clears**
- **a cascade step naming a column the table does not have**

The last two are why `@4dl/purge` exists. Kova maintained three table lists by
hand and accumulated three real defects: a table in none of them, and two
renamed columns that stayed. A purge swallows every delete error — it has to,
since an old database may legitimately lack a table — so all three read as a
clean erasure.

## Keep the integration suite too

`test/integration.test.ts` drives the real worker through Miniflare — the same
Hono app, the same Better Auth, the same D1. The conformance tests read
declarations; this one exercises the wiring, and that is a different class of
bug. Every one of these **typechecks perfectly**:

- a middleware in the wrong ORDER, so the guard runs before the identity
- a route mounted on the wrong PREFIX, so it 404s on the door it needs
- a schema module missing from the composed list, so a table never exists
- an auth callback that throws, which Better Auth **swallows** while still
  returning `200 {"success":true}` — the slug guard lives there

The five it ships with are the golden path: the host probe answers with its door;
an unowned hostname serves the probe and nothing else; sign-up → workspace create
→ subdomain row → tenant door resolves → a scoped write lands and reads back; a
slug that would take over `admin`/`setup`/`autodiscover` is refused; and an
unauthenticated caller reaches the public lane only.

Two things about the environment, both real rather than simulated:

- **The host IS the tenancy, in tests too.** Miniflare preserves the Host header
  and `*.localhost` resolves to loopback, so sign-in happens on
  `setup.localhost` and tenant behaviour is asserted on `<slug>.localhost` —
  the shipped topology. `vitest.config.ts` overrides `ROOT_DOMAIN` to
  `localhost` for exactly this reason.
- **Every test user is a platform admin** (`ADMIN_EMAILS: ""` +
  `ENVIRONMENT: "development"`), so a route-guard action gate cannot be observed
  failing there. Assert authorization through something that does not consult
  platform-admin status: row-level scope, or an in-handler check.

Read the sign-in code out of the `verification` table, never out of a log. The
mock mailer prints it, but a test that scrapes stdout passes for the wrong reason
the moment the provider changes.

## Every shared capability is MOUNTED, and a guard says so

The worker mounts a route tree for every schema module it applies:
`otpSendGuard`, `staffRoutes`, `mediaRoutes`, `notifyRoutes`, the two exit
routes, the plan catalog and the AI catalog, alongside the domain, email, shared
config and maintenance consoles it already had.

That is not a checklist somebody has to remember.
`scripts/capability-reachable.test.mjs` (in `pnpm gate`) fails on any app —
**this one included** — that applies a package's `SchemaModule` and never mounts
its routes, and `test/integration.test.ts` probes every surface for a 404.

⚠️ **Why both.** A shared package ships a schema, sometimes a Durable Object, and
a route tree. An app that adopts the first two and forgets the third has tables,
a bound DO, dispatch sites writing rows — and no way for a person to reach any of
it. Nothing fails: typecheck passes, the package's tests pass, the app's tests
pass. Scena carried `@4dl/notify` in exactly that state for three stages. This
template shipped in it too, which is why the mounts are here now rather than
described as an exercise.

## The browser half is `apps/_template-app`

**Copy both directories.** The SPA carries the parts every 4DL app needs and
that were, until it existed, copied by hand from whichever product the author
happened to open — which is where every UI divergence in this repo came from.

| File | What it is |
|---|---|
| `screen.ts` | `pickScreen` — the whole client-side gate as one PURE function: the doors, the maintenance switch, the standing ladder. Unit-tested, which it cannot be while it lives inside `main.tsx`. |
| `session.ts` | `createSession` — the host probe, the context cache, the 401 handler, the tenant switch that NAVIGATES. |
| `theme.tsx` | `ThemeProvider` **with a branding actually passed to it**, plus the remembered boot brand that stops a branded tenant flashing the platform's colour on every visit. |
| `Shell.tsx` | The chrome: bottom tabs AND the desktop rail, the maintenance strip, the standing chip, the bell, the hop to the operator door. |
| `Notifications.tsx` | The bell and the inbox screen, with the per-type icon map. |
| `screens/Doors.tsx` | Root signpost, no-tenant, wrong-door. |
| `screens/Login.tsx` | The OTP form — with the Turnstile widget and the cooldown countdown. |
| `screens/Blocked.tsx` | Rung two of the ladder, with both exits. |
| `screens/Admin.tsx` | The operator console: nine shared panels, mounted. |
| `screens/Settings.tsx` | Passkeys, and the two ways OUT. |
| `tones.ts` + `tokens.accents.css` | The accent registry, and why an unregistered tone renders grey. |
| five conformance tests | The UI rules, Tailwind's `@source` list, the shared admin panels, the accent tokens, and `pickScreen`. |

Every one of those files carries, in its header, the bug it exists to prevent.
Read them before deleting anything.

## What this template does NOT include

- **The Stripe CHECKOUT routes and the webhook.** The two halves have separated
  since this was written, and only one is still the app's.

  The OPERATOR half moved: `@4dl/billing`'s `stripeAdminRoutes` answers
  `/admin/stripe/status|config|sync` under `@4dl/admin`'s
  `PlatformStripeSection`, with both lanes stored at once, the mode-flip catalog
  swap and the price rebuild. Mount it — with `syncCatalog` and
  `clearCatalogIds` injected, because the catalog TABLES are yours — the day the
  app starts charging. Three apps carried three copies of those handlers before
  it moved, and one of them turned its own console's **live** switch into a
  payments outage.

  What is still the app's is the customer-facing tree: checkout, the portal, and
  the webhook LISTENER. Their handlers are woven through the notification
  registry, the entitlement gates and the row-level scope function. The
  reconciliation inside them is not: `@4dl/billing/webhook.ts` owns event
  idempotency, subscription-status sync with the `LADDER_OWNED` clamp, and the
  refund→credit reversal. Copy the shape from `apps/tessa/src/billing-routes.ts`
  (the smaller of the two) and take the packages rather than re-deriving what
  they already hold.
