# @kova/domain

**Kova's**, not the platform's. Two things live here, and the split matters.

**The math** — nutrition and TDEE, body-fat estimation, activity and workout
volume, progress, wellness scoring. Pure functions, no I/O, heavily tested. This
is the product, and it is the reason the next app starts at its own domain size
instead of that plus infrastructure.

**The registries** — `entitlements`, `perms`, `budgets`, `notifications`,
`features`, `clientFlags`, `lapse`, `audit`, `settings`. Each is the KEYS half of
a generic engine that now lives in a `@4dl/*` package: the engine resolves,
merges, clamps and gates; this names what is being resolved. `staffSeats`,
`activeClients`, `snapAMeal` and "check-in submitted" mean nothing to a warehouse
app, which is exactly why they are here and the machinery is not.

If you are adding to this package, ask which half it is. A new coaching
calculation belongs here. A new way to *resolve* a plan does not — that is
`@4dl/billing`, and putting it here means the next app rewrites it.
