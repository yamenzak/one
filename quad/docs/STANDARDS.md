# Standards

kind: standards

**How work is done in `quad/`. These rules govern this tree and nothing outside
it.**

---

## 1. A comment states the invariant, never the incident

⚠️ **"The reserve is a ceiling on revenue" stays true forever. "Scena's copy
under-counted four ways" describes a codebase that will not exist, and reads to a
future reader as a live warning about an impossible problem.**

Write what must always be so and what breaks if it is not. If a past defect is
worth preventing, that is a **test**, not a paragraph.

Comments carry weight where the code cannot: a rule that is invisible at the call
site, a refusal that looks like an oversight, an ordering that matters. They are
not narration.

---

## 2. A deferral is a marker, never a sentence

```ts
// DEFER(quad-14) stage:5 — the sky's motion is still a single gradient.
```

Found by `scripts/defer.mjs`, not by memory. **A stage cannot be marked shipped
while anything defers to it** — that is the mechanism that makes "shipped" mean
something, and it is the only reason the stage table in PLAN.md can be trusted.

Prose that says "we will do this later" is a deferral nobody can enumerate. It is
refused by the docs guard.

---

## 3. Every guard names the decision it protects

`docs/guards.json` is the registry. Each entry:

```json
{
  "id": "a-tenant-is-never-keyed-by-its-app",
  "protects": "D1",
  "impl": "kernel/test/tenancy.test.ts",
  "proves": "a literal string that implementation contains",
  "fails": "what goes wrong in the world when this breaks"
}
```

Three properties make this more than a list:

1. **`proves` must appear in the implementation.** Rename the assertion and the
   registry fails — a guard cannot quietly stop existing.
2. **A live guard must actually run**, reached by `pnpm quad:gate`,
   `quad:test` or `quad:typecheck`. A check nobody invokes is no check.
3. **`protects` must name a real decision.** A guard defending nothing recorded
   is a guard whose reason will be forgotten and then removed as noise.

`fails` is written as a **consequence in the world**, never as a restatement of
the assertion. "A tenant's records unreachable after its second app is enabled",
not "the key is wrong".

---

## 4. An inventory is generated or it does not exist

Any table counting things — guards, stages, deferrals, tests — lives in a
generated block:

```md
<!-- generated: node scripts/guards.mjs table -->
...
<!-- /generated -->
```

Verified by the docs guard. **A hand-typed count is wrong within a week**, and a
document that is wrong in a checkable way stops being read for the parts that are
right.

---

## 5. Every document declares a kind

`kind: plan | decisions | standards | progress | guide` on the second line. The
docs guard refuses one without it and refuses one nothing links to — an orphan
document is a document that drifts unread.

---

## 6. The dependency arrow points one way

`apps → web → runtime → kernel`. Enforced by the boundary guard.

- **kernel** imports nothing of ours and touches no binding, no I/O, no React.
- **runtime** is the only place a binding is touched. If a `env.DB` appears
  anywhere else, that is the guard's failure to catch it, not a new pattern.
- **web** is router-free. An app brings its own router; screens hand back a
  destination.
- **apps** hold product vocabulary. `@quad/*` holds none — the vocabulary guard
  refuses product nouns in shared code, with a stated per-file exemption for
  another API's own names.

---

## 7. Tests prove behaviour; guards prove shape

A test asserts what the code does. A guard asserts what the code *is* — that
every write declares its audit, that every entitlement is named by a gate, that
every screen's destination resolves.

⚠️ **THE GUARDS ARE THE ASSET.** They are what makes a mistake fail at build time
rather than in production six weeks later, and they are why anything here can be
changed confidently. Any proposal that moves a check from build time to runtime
is trading the most valuable property this tree has, and must say so out loud.

---

## 8. Before writing UI, ask HeroUI

Decide what is being built → `list_components` / `get_component_docs` → build
with what it ships. Never a hand-built control the library already has, never a
restyled one (D7).

---

## 9. The six-minute checklist, before a commit

1. `pnpm quad:typecheck`
2. `pnpm quad:test`
3. `pnpm quad:gate`
4. New behaviour has a guard, and the guard names its decision.
5. New decisions are in DECISIONS.md with what they forbid.
6. Anything unfinished carries a `DEFER(quad-N)` marker.
