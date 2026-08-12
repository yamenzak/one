---
kind: contract
verified: 2026-08-12
---

# The 4° Vault

> What is true about a person, held once, disclosed on purpose.
>
> The types are `kernel/src/vault.ts`; the store and the arithmetic are
> `runtime/src/vault.ts`; the surface is `runtime/src/vault-ops.ts` and
> `web/src/consent.tsx`. This document is the argument. Where it and the code
> disagree, the code is right and this is stale — but every rule below is either
> a refusal at composition or a test, so the disagreement should be loud.

---

## 1. The inversion

A product that asks somebody their height stores that height in its own table.
From that moment the person has no relationship with the fact: they cannot see
who reads it, cannot take it back, cannot carry it to the next product, and
cannot find out it existed once they have stopped using the app. Every product
repeats the collection, so one person's height is in four databases under four
retention policies, and an erasure request reaches whichever ones somebody
remembered.

Here a sensitive fact belongs to the **account** and is stored once. An app does
not hold it; an app is **granted a view** of it, at a rung the person chose, for
as long as they chose. Withdrawing takes effect on the next read and needs
nobody's cooperation.

⚠️ **A grant is a view, never a copy.** A copy is a disclosure that outlives its
grant, and there is no mechanism anywhere that could take it back.

---

## 2. Four things that are constantly conflated

| | |
|---|---|
| **what is held** | a fact — declared once, platform-wide, closed set |
| **who may read it** | a reach — `self`, `compute`, `agent`, `staff` |
| **what is shown** | the value, or a reading derived from it |
| **for how long** | an expiry, resolved on read, never by a sweep |

Keeping the third apart from the first is the whole feature. It is what lets
somebody be shown a weight **trend** and a body-mass index while never being
shown a weight — the value is used and not disclosed, which is the thing a
database column cannot express.

---

## 3. The reach, and why `compute` is a rung

```
self      nowhere. The person, and nothing else.
compute   into arithmetic whose ANSWERS are shown. The value, never.
agent     a model acting for this person, on this request.
staff     a named person with a role in a workspace.
```

⚠️ **`compute` is a rung and not a separate axis, and a first attempt got this
wrong.** "The maths may use my weight; nobody may see it" is the most common
thing anybody actually wants — and modelling it as a property of the app's *ask*
rather than of the person's *grant* meant the person could not express it. The
app declared what it would do and there was no rung to agree to.

⚠️ **`agent` sits below `staff` deliberately.** A model summarising a week does
not remember, does not gossip and does not form an opinion about somebody at the
school gate; a person does. So "the assistant may know my weight, my coach may
not" is coherent and common — and until there was a rung for it, the only way to
have an assistant that knew anything was to expose everything to everyone.

The rung a model reads at is **pinned by the runtime**, not taken from the tool
call. A model that could pass `staff` would be a laundering path.

---

## 4. A reading is granted in its own right

`body.mass.trend` is not `body.mass`. It has its own grant, at its own rung, with
its own expiry — which is what lets a coach watch a direction while the weight
stays private.

⚠️ **And every input must still reach `compute`.** Granting a trend must not open
a side door onto a fact shared with nobody at all: a body-mass index is a mass
and a height, and a grant on the index alone must never permit a read of a weight
that was never shared. `mayDerive` checks the reading's own grant **and** every
input's, and takes the soonest expiry across all of them.

**A derivation discloses less than its input only if somebody checked.** Every
reading declares `hides` in writing, and `registryProblems` refuses an empty one.
That sentence is what a reviewer checks the arithmetic against — a percentage
change over a known start is an equation with one unknown, and a body-mass index
plus a height is a weight.

⚠️ **Coarsening is not privacy where the reader does not know the start.** The
progress reading rounded to five points, turning a real 2.6% into a reported 5%.
That is privacy bought by lying to whoever is planning from it. It rounds to a
whole point now, and the safety comes from the unknown start rather than from the
vagueness.

---

## 5. What the refusals mean, and why there are five

`ungranted` · `expired` · `narrower` · `sealed` · `empty`

Four of these look identical from a caller and want different copy. Collapsing
them into "denied" is how a screen comes to say *"you have not shared this"* to
somebody who shared it last month and whose grant lapsed.

⚠️ **`empty` is checked LAST, and that is a disclosure decision rather than an
ordering preference.** Telling an ungranted reader that the person has recorded
nothing is itself a fact about them, and one nobody granted. So emptiness is only
ever revealed to a reader who was already allowed to see the value.

⚠️ **And the refusal is a 409, not a 403.** `platform.not_shared` is its own
code: this is not a lack of permission, is not something an administrator can
fix, and is not a failure of the app. Answering 403 produces copy that blames the
reader for a decision somebody else made and is entitled to.

---

## 6. Encryption is a later decision, and the shape has to be right now

`seal` is per fact:

- `server` — the platform can read the value, so the platform can derive from it.
- `person` — only a key held by the person's own device can read it.

⚠️ **A `person`-sealed fact may not declare a derivation.** Nothing on a server
can compute one, so a declaration that it does is a promise the arithmetic cannot
keep — worse than absent, because a consent sheet would offer somebody a reading
the platform cannot produce. Refused at the registry.

Today every fact is `server` and the envelope is the identity function. What
matters is that **values are opaque outside `runtime/src/vault.ts`** and
derivations are computed inside it: when a key exists, `seal` and `open` change
and nothing above them does. A design that let handlers read the column directly
would make that day a rewrite of every caller, which is how encryption stays
permanently one quarter away.

The key is a passkey PRF extension when it arrives — this platform is 100%
passkey-based, so the material is already on the device.

---

## 7. Why it is global, and why it is never cached

The identity split — a global store read at sign-in, a regional session read per
request — buys its speed with a **snapshot**. A snapshot of a vault value is a
disclosure that survives its own revocation.

So the vault is global, beside the account, and is read directly every time. That
is affordable because a vault read happens when a screen actually shows a fact,
which is rare beside every request in the platform. Withdrawing a grant takes
effect on the next read because there is nothing to invalidate.

---

## 8. What an app declares, and what that forces

```ts
vault: {
  wants: [
    { fact: "goal.training", need: "raw", recommend: "staff",
      why: "Your coach writes your programme against this." },
    { fact: "body.mass", need: "derived", readings: ["body.mass.trend"],
      why: "So a direction can be shown without a weight." },
    { fact: "body.height", need: "compute",
      why: "Used in a calculation whose answer is shown." },
  ],
}
```

`why` is the consent sheet's copy, written by whoever wants the data. A platform
that generated it would produce *"Kova would like to access your weight"*, which
is the sentence every permission dialog on earth has trained people to dismiss.

**Refused at composition:**

- a fact the platform does not hold
- an ask with no reason
- the same fact asked for twice — one fact is one decision, and a sheet with two
  rows for it is somebody answering the same question twice
- an app recommending **more** exposure than the fact's own registry entry does,
  which would turn the recommendation column into advertising
- `derived` with no reading named, or `raw` with readings named
- **a collection field that shadows a vault fact** — see below

---

## 9. The shadow check, and the two things that make it work

Without it an app declares `height` on its own table, the vault holds a second
height nobody updates, and the person's grants govern a copy no screen reads. The
failure is total and invisible: every consent control works, and none of it is
connected to what is displayed.

**It runs whether or not the app declares a vault.** Making it conditional on
asking would mean the way to avoid it is to not ask.

Two halves, and both were learned the hard way:

1. **Per-fact shadow words, declared.** Deriving them from the fact id gives
   `fat` for `body.fat` — which refused a nutrition library for holding somebody's
   body composition. A check that refuses an honest declaration teaches people to
   weaken it.
2. **Only on collections holding PERSONAL data.** `weight` on a collection about
   a person is a body weight; on a studio's food library it is a portion. Not a
   loophole: `holdingProblems` refuses a collection claiming `none` while carrying
   a body vocabulary, so the two checks compose and an app cannot dodge one
   without tripping the other.

---

## 10. The record of processing

⚠️ **The vault is a processing activity and is invisible to the collection-based
derivation.** A fact the app never stores appears in no collection — so an app
reading somebody's health data through a grant would produce an Article 30 record
saying it holds no health data. True, and completely misleading, which is the
worst kind of compliance document there is.

`ropaOf` takes `disclosed` from `vaultActivities(app.vault)`, and every vault
activity is **`consent` + `explicit_consent`, always**. That is not a choice an
app gets to make: a disclosure that stops when somebody withdraws it is Article 7
whatever a manifest says, and an app claiming `contract` for a fact a person can
revoke with one switch is claiming a basis its own mechanism contradicts.

Retention on those rows is `0` rather than `null` — this app stores none of it,
and `null` means "until the workspace leaves", which is the opposite claim.

---

## 11. The surfaces

| | |
|---|---|
| `vault.mine` | every declared fact, what is held, and who it is shared with |
| `vault.read` / `vault.record` / `vault.forget` | the person's own, subject always from the session |
| `vault.share` / `vault.unshare` | a rung and an expiry, per app, per workspace |
| `vault.disclosures` | who has read what, and when |
| `vault.asked` | what THIS app asked for and what was decided — the consent sheet's data |
| `subject.fact` | the one operation an app uses to see somebody else |

⚠️ **`vault.*` and `subject.*` must never be one operation.** Everything under
`vault.*` answers for the signed-in person about their own facts and takes no
account id at all; `subject.*` is an app asking to see somebody else and goes
through `mayRead`. A single "read a fact" taking an account id would be one
missing comparison between *read my own weight* and *read anybody's weight*.

⚠️ **`vault.mine` is never a tool.** It is the whole of somebody's sensitive data
with the grants over it — handing it to a model as a callable would make every
fact readable at the `agent` rung whatever the person granted, which is the rung
they most deliberately chose.

**`share` accepts a fact id or a reading id**; `self` is written as a revocation
rather than as a grant at the bottom rung, so there is one shape for "not shared"
— no row — and the log still records the decision.

**`unshare` may name another app where `share` may not.** Naming one can only ever
take access away, and the account centre has to reach apps somebody is not inside.

---

## 12. What the person sees, and why the screen is a renderer

`web/src/consent.tsx` is the sheet an app raises; `web/src/account/vault.tsx` is
the review screen on the account centre's own door.

⚠️ **The screen knows what a fact is for exactly nowhere.** Every name, every
reason, every recommendation and every sentence about what a derivation cannot
reveal is copied out of a declaration — the app's manifest for why it wants a
thing, the fact registry for what the thing is. `wantedHere` in
`kernel/src/vault.ts` is what makes that a property rather than a claim: it takes
a `VaultSpec`, the person's grants and what they hold, and returns a `Wanted` per
declared want with everything a screen needs and nothing it has to look up. An app
that declares a thirteenth fact gets a thirteenth row, with its own explanation,
without the account centre being opened.

⚠️ **It is organised by workspace, not by fact.** "Who knows my weight" is
answered by a list of facts; "what does this studio know about me" is the question
people actually have, and it is the one they can act on — a workspace is a
relationship you can end. Every group is one `appId` × one `tenantId`, which is
also the pair a grant is keyed on.

⚠️ **What nobody asked for is still yours.** The screen keeps a section for facts
held that no want names. A vault that listed only what an app wanted would go
empty at exactly the moment it became the only copy — which is the person this
whole thing is built for.

### 12a. Two rungs is a switch; more than two is a choice

`rungsFor(need)` is the one list, and it is in the kernel because **two surfaces
offer it and they must not disagree**. The consent sheet asks for the first time;
the vault changes it later.

| need | rungs offered |
|---|---|
| `compute` | `self`, `compute` |
| `derived` | every rung — the derivation runs server-side, and each reading carries its own |
| `raw` | every rung |

⚠️ **A boolean control silently spends a rung the person chose.** With a copy of
this list in each surface, the vault collapsed a `raw` want to on-or-off: somebody
who had deliberately picked "the assistant, no people" in the sheet saw a switch
reading **on**, and turning it off and on again re-granted at `staff`. Nothing
threw, nothing failed, and the state sentence underneath was still correct — only
the control was a lie about what it would do. A screen that escalates a disclosure
the person narrowed is the worst thing this surface could do.
*Checked: `web/test/screens.test.tsx` — "offers a choice wherever a want has more
than two rungs", mutation-tested.*

⚠️ **And the rung a want asks for is derived, never declared.** `asksFor(need)` —
`raw` asks at `staff`, everything else at `compute`. An app that could name its own
rung could name one its need does not justify, and nothing would catch it: the
sheet would simply ask for more.

### 12b. The rest of the screen's rules

⚠️ **It is a decision screen, not a permission prompt.** A permission prompt has
two buttons and a sentence written to get past it; the only control afterwards is
uninstalling. Here each row is a separate decision, each says what would be shown
and what would be hidden, and every one can be moved again from the account centre
without opening the app.

⚠️ **Nothing is pre-selected.** Not "recommended" as a default, not a switch
already on. Every fact starts at `self` and the recommendation appears as an
**argument** beside the choice — a default that applied itself would be a
disclosure nobody made.

⚠️ **"Done", never "Allow".** Nothing was allowed as a whole.

⚠️ **The state line names the workspace, never a role.** "Not shared with your
coach" is one product's word for the person on the other side; the same screen
stands over a studio, a clinic and a company's staff list. "Nobody at Haddad
Strength can see it" is both true everywhere and more precise — it is the actual
boundary.

⚠️ **The expiry is part of that sentence, not a pill beside it.** As a pill it
competed with the control for one line and truncated the name to an ellipsis, and
it is not a separate fact anyway: "until December" is when the sentence above it
stops being true.

The review screen answers three questions, and every other product answers at
most the first: what is held about me, who can see each part, and **who has
actually looked**. The third is what turns a settings screen into something worth
opening.

### 12c. What the screen is NOT wired to yet

⚠️ **`vault.mine` still answers with the platform's whole fact registry**, not
with any app's declared wants. Grouping by workspace needs every app's `VaultSpec`
at the identity door, and one worker only knows its own manifest — so it needs the
shared-store publication the platform already uses for config and the AI catalog.
The resolver and the screen take the grouped shape today; the transport does not
produce it.

<!-- DEFER(one-186) stage:7 — publish each app's VaultSpec to the shared store so
     the identity door can group the vault by workspace. `wantedHere` and
     `VaultScreen` already take that shape; `vault.mine` still answers with FACTS. -->

---

## 13. What is not built

<!-- DEFER(one-182) stage:7 — a `person` seal with a real key. The type exists,
     the constraint is enforced, and `seal`/`open` are the identity function. -->
<!-- DEFER(one-183) stage:7 — a fact belongs to an ACCOUNT, so somebody a
     workspace records without inviting has no vault. Kova's roster can hold such
     a person; what a coach may record about them before they have an account is
     an open product question, not a gap in this mechanism. -->
<!-- DEFER(one-184) stage:7 — the disclosure log is not yet exported with the
     rest of somebody's data. It is derived-erasable and readable in the account
     centre; it is not in the portability payload. -->
