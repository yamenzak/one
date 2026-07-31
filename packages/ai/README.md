# @4dl/ai

The metered generation path. Every call takes the same route:

```
resolve model → RESERVE a worst-case hold → run (Workers AI | Gemini | mock)
              → SETTLE the exact credits from real usage → audit
```

| Module | What it is |
|---|---|
| `generate.ts` | The path above, for text, images and speech. Plus the per-actor daily budget. |
| `pricing.ts` | Provider catalog + price-list parsers, so a model's rate is imported rather than typed. |
| `mock-lane.ts` | The development-only mock decision. |
| `registry.ts` | What the APP declares: its features and its tones. |
| `media.ts` | Where a generated image goes. |
| `schema.ts` | `ai_models`, `ai_generations`, `ai_cache`, `insight_feedback`. |

## The mock lane is development-only, in every mode

`shouldUseMockLane` puts the environment check on the **outside**, so a stored
`ai.mock = "on"` — from an operator console, a hand-edited config row, or a
restored backup — cannot make production fabricate output.

That is not fastidiousness. A fabricated extraction gets written to a real
record, flows into the next prompt as context, and **the tenant is billed credits
for it**. In Kova's case that meant invented clinical lab values pre-filling a
client's chart. Whatever your app extracts, the same shape of failure is
available to it.

## Two things the app supplies

**The feature registry** (`configureAi`). Which features exist, their default
system prompts, and whether the house tone applies. Kova has 21 — "snap a meal",
"extract lab markers". An inventory app will have "read this label", "match this
SKU". They are metered, audited and rate-limited identically; only the prompts
differ, which is why the registry is a parameter and the machinery is not.

**Where images go** (`configureAiMedia`). The package takes `putMedia` and
`storageUsage` as functions rather than importing `@4dl/storage`, because the
storage QUOTA lives in a billing table. Importing directly would make the chain
`ai → storage → billing` — and an app that only reads labels would require a
payment provider.

## Reaching the credit authority

```ts
export interface CreditAuthorityNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): CreditAuthorityStub   // bind/reserve/settle/release
}
```

Deliberately **not** `DurableObjectNamespace<CreditLedgerDO>`. That type is
invariant in its parameter, so an app's subclass — which has strictly *more*
methods — is not assignable to it. Describing only the two calls this package
makes lets any subclass satisfy it structurally, which is the whole point of the
bindings contract.

The stub's methods also return concrete types rather than `unknown`: the Workers
RPC type machinery maps an `unknown` return to `never`, which makes every real
subclass unassignable with an error message that explains none of this.

## Importing this from a browser

Use **`@4dl/ai/model`** — the mock-lane decision and the pricing parsers, both
pure. The root pulls in the generation path, which holds credits against a
Durable Object and writes to R2.

The same rule bit inside this package: `pricing.ts` imported `@4dl/billing`
(root) for one constant, which drags in `credit-do.ts` and therefore
`cloudflare:workers`, and the unit tests died on `Cannot find package`. It now
imports `@4dl/billing/model`, and billing's ledger TYPES live in their own module
so the isomorphic surface can export them — a type-only re-export is not enough,
because TypeScript still typechecks the module it points at.

## Boundary

Empty ALLOW list. Three things left on the way in, and one is worth naming: the
prompt composer said *"The studio has also asked you to follow…"* — a string sent
**to the model**, where an inaccurate noun is an instruction it may repeat back
to an end user. It now says "the operator of this workspace".
