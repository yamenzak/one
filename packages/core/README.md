# @4dl/core

The floor every 4DL package stands on. Five things, and nothing else will be
added here that any single app could own.

| Module | What it is |
|---|---|
| `ids.ts` | Time-sortable ids (`prefix_<b36 ms><b36 random>`), `nowIso`, `periodKey`. Ids appear in URLs, so the randomness is `crypto.getRandomValues`, not `Math.random`. |
| `json.ts` | `j` / `parseJson` — JSON columns read defensively, never throwing. |
| `bindings.ts` | The **bindings contract**: `HasDb`, `HasCache`, `HasMedia`, `HasAi`, `HasEmail`, `HasEnvironment`, `isDevLane`. |
| `schema.ts` | The **composed schema runner**: `SchemaModule`, `applySchema`, `schemaGate`. |
| `config.ts` | `app_config` — the operator-tunable settings table — **and the shared platform-config store underneath it**. |
| `admin-routes.ts` | The operator routes over that shared store, exported from `@4dl/core/admin-routes`. |
| `boundary.ts` | The **package boundary checker**. Node-only, exported from `@4dl/core/boundary` so it can never reach a Worker bundle. |

## The bindings contract

A shared package must not import an app's `Env`. It declares the slice it needs:

```ts
export type StorageBindings = HasDb & HasMedia
export async function putMedia<E extends StorageBindings>(env: E, …)
```

An app's `Env` satisfies that structurally — no import, no registration. The
price is one convention: **every 4DL app binds the same things to the same
names** — `DB`, `CACHE`, `MEDIA`, `AI`, `EMAIL`. A second bucket or KV gets a
different name and is passed explicitly.

The payoff beyond portability is least privilege: a function typed `HasDb`
cannot reach R2 even by accident.

## The composed schema

Packages own tables. They do not run migrations — they export a `SchemaModule`,
and the app composes them:

```ts
const gate = schemaGate([authSchema, tenancySchema, billingSchema, MY_APP_SCHEMA])
export const ensureSchema = (db: D1Database) => gate({ DB: db })
```

Each module carries its own `version` and gets its own `schema:<id>` marker row,
so a billing DDL change re-runs billing's statements and nothing else.

**Rules a module must respect** — all of these fail *silently* if broken, which
is why `apps/api/test/schema-module.test.ts` asserts them:

- Every `ddl` statement is `CREATE … IF NOT EXISTS` (or `DROP INDEX IF EXISTS`)
  and **ends with `;`**. The batch is joined with a space; an unterminated
  statement fuses with the next and D1 rejects all of them at once.
- No `--` comment and no embedded newline in a `ddl` statement — the first
  swallows the rest of the batch, the second splits a statement in half.
- `alters` are `ALTER TABLE … ADD COLUMN` only. That is the one error shape the
  runner tolerates (`duplicate column`); anything else aborts the module, on
  purpose — a half-applied module must never be marked done.
- `backfills` are best-effort repairs with their own `WHERE` guard. A failing one
  is logged and does not block the module.
- **Bump `version` when any of that changes.** Nothing can detect intent, and a
  missed bump means the new table is never created.

Declare `scoped` next to the DDL so erasure can be derived rather than
hand-maintained (Stage 7).

## Config: two layers, and the app's own wins

`getConfig` reads `app_config` whole and hands back one object. That much is
unchanged. What is new is a second, **optional** store underneath it: a single
KV namespace (`PLATFORM_CONFIG`) bound with the **same id into every 4DL
worker**, holding one JSON object.

```
app_config row (non-empty)  →  wins, always
shared blob                 →  the fallback
neither                     →  unset, exactly as before
```

The problem it solves is arithmetic. There is one Google account, one Stripe
account, one Cloudflare account and one Turnstile widget behind every product
here — and before this, one copy of each credential *per app*, typed in by hand
on each app's `admin.` door. Every new product multiplied the configuration
instead of inheriting it, and a rotated key had to be re-pasted N times or one
app silently kept using the old one.

### Why a shared STORE and not a central config API

The obvious design is a central admin worker that pushes config into each app's
D1. It cannot be built the way it sounds: a worker cannot write another worker's
database, so "pushes config" means **a privileged config-write HTTP endpoint in
every app**, authenticated by a machine token, accepting Stripe secret keys.
That is strictly worse than the passkey-and-OTP human session guarding the doors
today — it adds a second, weaker way in, to every product, for the most valuable
data any of them holds.

Sharing the store instead has three properties that design does not: no worker
writes another worker's database, existing rows keep winning so nothing migrates,
and an unbound namespace changes nothing at all.

### "Non-empty wins", not "present wins"

Every consumer already treats `""` as unconfigured — `if (!apiToken)`, `.trim()`
then a falsy check, `Boolean(cfg["turnstile.secret"])`. If a present-but-empty
row won, clearing a key on one app's console would mask the shared value with
nothing anywhere naming why: the panel shows a configured key and the app
reports "not configured".

So an empty local row falls through. The cost is real and worth stating — you
cannot switch a shared key off for one app by blanking it. Give that app its own
value, or do not share the key.

### The allow-list is the blast radius

`SHARED_CONFIG_KEYS` is explicit, and the write path refuses anything else.
A shared store that accepted `schema:kova` or `platform.maintenance` would let
one console's typo take out every product at once — and blast radius is the
whole argument against the cross-worker design in the first place.

Four keys look shareable and are not, each for a specific reason:

| key | why it stays app-local |
|---|---|
| `email.from` | carries the app's display **name**. The address is shared; the sender line is the product's. |
| `stripe.*.webhook_secret` | a signing secret per Stripe **endpoint**, and each app has its own webhook URL. Shared, every event fails verification. |
| `cf.saas.worker_name` | the script a custom hostname's route points at. The zone, the token and the CNAME target are all shared — every 4DL app is under one apex — but this one is per-app, and it is the value whose wrong setting fails **silently**. |
| `platform.maintenance*` | closing one product is not closing the others. |
| `ai.markup` | looks perfectly shareable and would have been inert: the credit math meters against `ai_models.markup`, a per-row column, and the config row is only what the AI panel displays. A shared control that changes a screen and not a charge is worse than none. |

`schema:*`, `plans.catalog_version` and `stripe.catalog_stash.*` are absent for a
harder reason: sharing any of the three corrupts state rather than merely
misconfiguring it.

### Threading it

`getConfig` takes a `ConfigSource` — either a bare `D1Database` (app-local only,
which is right for the schema runner's markers and Stripe's parked catalog ids)
or an env carrying `DB` and an optional `PLATFORM_CONFIG`. Pass the env from any
consumer that should see the shared layer; pass the database from anything that
should not. `setConfig` deliberately takes only a `D1Database`: it writes the
layer that OVERRIDES the shared one, and a writer accepting either store would
eventually be handed the wrong one.

### Adopting it on an app that is already configured

A local row wins, and a live app has one for every credential it uses — so
setting a key centrally changes nothing until the local one goes. Most per-app
panels cannot clear their own field, so `DELETE /admin/shared-config/local/:key`
exists and the console's shared panel puts a **Use shared** button on every row
it reports as overridden. Confined to the allow-list: it is a config-row delete
reachable over HTTP, and the set of rows it can touch is the security boundary.

### Provisioning

The namespace is **absent from every `wrangler.jsonc` until it is real**. A
placeholder would be worse than nothing: `apps.mjs ready` reads every id in the
file, so a fake one marks the app un-provisioned and `deploy.yml` skips it.
Actions → *Provision an app on Cloudflare* finds-or-creates the namespace by
title and writes the binding in the same run. Until then every app reads its own
`app_config` exactly as before.


## The boundary checker

`@4dl/*` packages carry no product vocabulary. That rule was written down before
`@4dl/ui` acquired a `Tone` union containing `nutrition`, and before
`@4dl/platform` named a tenant a "studio" in its type names — so it is now a test
in every shared package:

```ts
const ALLOW = ["src/hosts.ts:studio"]   // frozen debt, only ever gets shorter
findBoundaryViolations({ dir, allow: ALLOW })
```

Two checks. **No app imports** (`@kova/*` and friends) — no allowance, ever.
**No product nouns** in identifiers, type names or shipped strings — ratcheted,
because a check that cannot land green is a check that gets deleted.

Comments are exempt: explaining a boundary means naming what is on the other side
of it, and this package's own headers would fail otherwise. Identifiers are split
on case and underscore first, so `clientId`, `client_id` and `StudioStanding` are
all visible. Web-platform names that collide (`clientWidth`, `getBoundingClientRect`,
Stripe's `client_secret`) are exempt by name.

Current frozen debt: 8 keys in `@4dl/platform`'s neighbourhood (`hosts.ts`,
`promo.ts`, `standing.ts`) and 13 in `@4dl/ui` (`primitives.tsx`, `icons.tsx`,
`theme.ts`). See `PLATFORM.md` §1.4 for what each one is and
which stage retires it.
