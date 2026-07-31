# @4dl/core

The floor every 4DL package stands on. Four things, and nothing else will be
added here that any single app could own.

| Module | What it is |
|---|---|
| `ids.ts` | Time-sortable ids (`prefix_<b36 ms><b36 random>`), `nowIso`, `periodKey`. Ids appear in URLs, so the randomness is `crypto.getRandomValues`, not `Math.random`. |
| `json.ts` | `j` / `parseJson` — JSON columns read defensively, never throwing. |
| `bindings.ts` | The **bindings contract**: `HasDb`, `HasCache`, `HasMedia`, `HasAi`, `HasEmail`, `HasEnvironment`, `isDevLane`. |
| `schema.ts` | The **composed schema runner**: `SchemaModule`, `applySchema`, `schemaGate`. |
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
