# @4dl/storage

R2 object storage with per-tenant accounting.

`media_assets` **is** the index. R2 has no queryable metadata, so the ledger is
what knows an object exists, who owns it, how many bytes it costs and whether it
has been deleted. Usage sums LIVE rows (`deleted_at IS NULL`), which is why a
delete must go through `deleteMedia` rather than straight to the bucket — an
object removed behind the ledger's back keeps counting against the tenant's quota
forever.

## The quota is injected, and the default is a trap

```ts
export type StorageQuota = (env: StorageBindings, tenantId: string) => Promise<number>
```

A storage ceiling lives in a **billing** table, and an app that never bills its
tenants still stores files — so this package does not depend on `@4dl/billing`,
and omitting the resolver means **unlimited**.

That default fails OPEN, which is the wrong direction for a quota, so it is
mitigated by convention rather than by types: an app with a ceiling binds it
**once**, in its own `storage.ts` adapter, and every call site imports from
there. `apps/api/src/storage.ts` is the reference.

The trap is real — `putMedia` takes the quota too, not just `storageUsage`.
Passing it to one and not the other silently disables enforcement on the write
path while the usage screen still reports a limit.

## `ledgerKey` — when the object key is shared

`media_assets.r2_key` is UNIQUE, which is right when the key carries the tenant
(`t/<tenant>/…`): one object, one owner, one row, and a re-put updates it.

Scena's keys are the SHA-256 of the bytes, and that is load-bearing three times
over — the compiled manifest references an asset by hash, a screen caches
`/api/assets/<hash>` immutably for months offline, and its track library is one
set of objects every workspace draws from. Two workspaces uploading the same
file therefore land on the same key, and with `r2_key` as the conflict target the
second upload REWRITES the first one's row: the original owner's bytes silently
stop counting against their quota and start counting against a stranger's.

`ledgerKey` qualifies the row instead (`<tenantId>:<hash>`), so the bucket
deduplicates and the accounting does not. That is the right way round — a tenant
pays for what it references, not for what it happened to be first to upload.

`deleteMedia`'s `keepObject` is the other half: it tombstones the row (releasing
the quota) while leaving the bytes for whoever else still points at them. The
package does not answer "does anything else reference this?", because only the
app knows its key space — the ledger is quota accounting, not a reference count.

Both default to the tenant-scoped behaviour, so an app with prefixed keys never
thinks about either.

## Subjects

`media_assets.subject_id` — the individual a file belongs to, so one person's
erasure can find their objects without walking the bucket. Kova's column said
`client_id` until the last moment before its first deploy; see
`@4dl/commerce`'s README for why that window matters and closes.


## `routes.ts` — upload, meter, read

The package owned the R2 put, the ledger and the quota gate; it did not own the
ROUTES, so one app wrote them and the other had a bucket with no user-facing way
to put anything in it. What makes them worth sharing is not the plumbing — it is
that two of the rules are things that went wrong in production.

**`purpose` is a PATH SEGMENT the caller controls**, so it must be a closed set.
Unvalidated, `purpose=brand` put an arbitrary upload under the one
publicly-readable prefix — free hosting of any file on the tenant's white-label
domain — and `purpose=c/<victim>/progress` forged a path into another subject's
key namespace, on the tenant's quota. The public prefix is therefore configured
SEPARATELY (`publicPurpose` + `canWritePublic`) rather than living in the set.

**No `image/svg+xml`, ever.** Served same-origin an SVG can carry `<script>` and
runs in the app's origin: stored XSS with a friendly file picker in front of it.

Two more that are cheap and easy to omit: the size limit is checked on the bytes
actually READ (`file.size` is a client-supplied hint), and every response carries
`nosniff`, a `default-src 'none'; sandbox` CSP, and `content-disposition:
attachment` for anything that is not an inline-safe raster.

`subjectSegment` exists because the key prefix is baked into every object ever
written and into the purge sweep. It defaults to `s`; the app that predates this
package uses `c` and can adopt these routes without migrating a single key.
