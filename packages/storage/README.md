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

## Subjects

`media_assets.subject_id` — the individual a file belongs to, so one person's
erasure can find their objects without walking the bucket. Kova's column said
`client_id` until the last moment before its first deploy; see
`@4dl/commerce`'s README for why that window matters and closes.
