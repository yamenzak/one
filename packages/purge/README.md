# @4dl/purge

Erasure, derived from the schema.

A purge has to name every table holding a row that belongs to the thing being
erased. That list used to be written by hand — three of them, in Kova's
`purge.ts`, each with a comment asking the next reader to keep it in step with
the DDL. This package deletes the lists: a module already declares `scoped` next
to the DDL that creates the table, and the cascade is computed from that.

```ts
const TENANT  = tenantCascade(SCHEMA_MODULES)    // one step per declared table
const SUBJECT = subjectCascade(SCHEMA_MODULES)   // …each carrying ITS OWN column

await applyCascade(SUBJECT, clientId, (sql, id) => run(db, sql, id))
```

## Why the column travels with the step

The old loops interpolated the TABLE and hard-coded the COLUMN:

```ts
for (const t of CLIENT_TABLES) await run(db, `DELETE FROM ${t} WHERE client_id = ?`, id)
```

Kova's own tables key an individual as `client_id`; commerce, AI and storage
renamed theirs to `subject_id` when those packages stopped knowing what a client
was. A `CascadeStep` carries `{ table, column, module }`, so both live in one
cascade and a rename cannot desynchronise them.

## The two checks, and the three things they found

Both failures below are **invisible at runtime**. A purge swallows every delete
error, and it has to: an old database may legitimately be missing a table. So a
wrong column and a forgotten table both read as a clean erasure.

`undeclaredScopes(modules, { exempt })` — a table carrying a scope column that no
`scoped` declaration clears. It found `offboard_requests`, which was added to the
schema and to **none** of the three hand-written inventories, so it survived a
client purge, a tenant purge and the platform nuclear reset.

`impossibleSteps(modules)` — a step whose column the table does not have. It
found `ai_generations` and `media_assets`, still being deleted `WHERE client_id`
months after both had moved to `subject_id`: "no such column", swallowed, and a
purged client's AI history and media-ledger rows quietly stayed behind.

The scope columns to check are **derived** (`scopeColumns`), not a constant. A
hard-coded list would have to name the app's word for an individual —
`client_id`, `patient_id`, `employee_id` — which a shared package may not know,
and it would keep checking a column after a rename rather than following it.

`exempt` is a ratchet, the same shape the boundary checker uses: an entry is a
decision somebody wrote down. Pair it with a test asserting every exemption still
corresponds to a real column, so the list can only shrink. Kova's is **empty** —
the first draft named seven platform tables and the ratchet refused all seven,
because none of them carries a scope column at all.

## What stays in the app

Everything with a side effect outside D1: the R2 sweep, the credit DO wipe, the
Stripe cancellations on both rails, the custom-hostname deregistration, the
decision about whether a user's identity outlives the tenant. This package
computes *what to delete*; the app owns *what else deleting means*.

It also does not decide what a tenant purge should NOT touch. A module leaves its
platform-wide rows out of `tenantTables` — a plan catalog, a model list — which is
exactly why the declaration lives beside the DDL rather than being inferred from
the presence of a `tenant_id` column.

## Interpolation

`applyCascade` interpolates the table and column into the SQL. That is safe here
and only here: both come from a `SchemaModule` declared in code, never from a
request. The id is bound. Both identifiers are quoted anyway — Better Auth quotes
its tables throughout its own DDL, and a package cannot know which identifiers a
future app will pick.

## Boundary

Empty ALLOW list. One thing left on the way in: an early draft exported a
`DEFAULT_SCOPE_COLUMNS` constant containing `client_id`. The boundary checker
refused it, which is how `scopeColumns()` came to be derived — a better design
arrived at by being told the shortcut was product vocabulary.
