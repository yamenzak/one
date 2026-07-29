# @4dl/platform

The multi-tenant SaaS substrate, shared across 4DL apps. Pure — no I/O, no
`Date.now()`, no product vocabulary. Kova is the first consumer, not the owner.

| Module | What it is |
| --- | --- |
| `hosts` | **The host IS the tenancy.** Classifies every hostname into five doors — root signpost, `setup.`, `admin.`, `<slug>.`, a tenant's own domain — and derives the WebAuthn `rpID` and session cookie domain from that. Also owns DNS-label slug validation and `RESERVED_LABELS`, which is a security control: a tenant at `admin.` or `autodiscover.` is a takeover. |
| `dcv` | Turns Cloudflare custom-hostname errors (including the CAA case) into records an owner can actually add. |
| `credits` | AI credit metering. Meters on **neurons**, so gross margin is identical for every model and `markup` is the only lever. |
| `promo` | Website-native discount math — percent or fixed, scoped to a package and/or a customer. We never create Stripe coupon objects. |
| `standing` | What a person may do in ONE tenancy: membership × subscription × studio standing, resolved in one total function, plus the host gate that makes a suspended tenant's whole subdomain read-only. |
| `ai-mock` | The mock-lane decision. The environment gate is the OUTER condition, so no admin toggle can make production fabricate output and bill for it. |

## Why these six and not the ten I'd have guessed

The split test is the same one `@4dl/ui` uses: **a name belongs here if a second
app could plausibly import it.** Applied honestly, that ruled out four modules
that *look* like platform:

| Stayed in `@kova/domain` | Why |
| --- | --- |
| `entitlements` | The three-axis shape (quotas, gates, credits) is portable; the catalog — Solo/Light/Pro/Max, `staffSeats`, `activeClients`, `aiSuite` — is Kova's product. |
| `perms` | `PERMISSION_CATALOG` names Kova's resources. |
| `budgets` | `BUDGET_FEATURES = ["workout", "meal", "all"]`. The queue-don't-sum math is portable; the feature scopes are not. |
| `notifications` | The role-aware preference resolution is portable; `body-composition`, `labs`, `swaps` are not. |

In each case the *machinery* is generic and the *registry* is Kova's, and
separating them means threading a type parameter through every consumer for no
current second consumer. This is the same call `@4dl/ui` made about `Tone`, and
it should be resolved the same way: **when the second app lands, make the
registry per-product config** — the app declares its plans/resources/scopes and
the package accepts them. Do not resolve it by adding the second app's plan
names next to Kova's here.

## The one rule

Dependencies point **one way**: `@kova/domain` may import `@4dl/platform`;
`@4dl/platform` must never import `@kova/domain`. Today it imports nothing at
all — every module here has zero intra-package dependencies, which is most of
why the split was cheap. Keep it that way.
