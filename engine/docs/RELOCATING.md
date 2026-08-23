# Moving a database to where it should have been made

kind: guide

**Read this before running the relocation workflow.** It moves live data on a
deployment with real workspaces on it, and the order of the steps is the whole
safety of it.

---

## 1. Why this exists

A D1 database's place is fixed when it is created. Cloudflare offers no edit, no
migration and no support ticket — so "put the directory in Europe" is a new
database, a copy, and a rebind, for ever, not until somebody builds the setting.

The seed databases were made by a bare `wrangler d1 create` in a CI runner, so
they are wherever that runner was. Measured on this deployment: every operation
is four to six **sequential** round trips at roughly 260 ms each, against a
worker spending nine milliseconds of CPU. Nothing computes. It is distance.

Provisioning no longer does that — `bind-ids.mjs --place` answers with the flags
from the deployment's own declaration and both paths that create a database read
it (DECISIONS.md D64). This document is about the databases that already exist.

---

## 2. A shard has two routes, and the deployment's size picks one

**`op.tenant.move` carries ONE workspace to a correctly-placed shard**, holding
only that workspace read-only, deriving the table list from the erasure ledger
rather than a list somebody wrote, and deleting nothing until a later drain.
Nobody else is affected and there is no window at all.

1. Add a correctly-placed shard to `SHARDS` in `engine/one/src/index.ts`.
2. Push. Provisioning creates it — with `--jurisdiction eu` where the residency
   says so, because the workflow asks rather than deciding.
3. Move workspaces onto it from the console, one at a time.
4. Retire the old shard once it is empty.

**This workflow relocates the shard itself**, in a window, and keeps its id: the
shard stays `eu-1`, the binding stays `SHARD_EU_1`, and no workspace's
`shard_id` changes — so the directory is untouched.

Take the move when the deployment is busy enough that a window costs something,
or when only some workspaces need to travel. Take the relocation when you are
already holding a window and the whole shard is in the wrong place — which is
the case a bare `d1 create` leaves behind, and the reason both exist.

---

## 3. The directory is the one that needs a window

The directory is not a shard. There is one, everything depends on it, and
nothing can move a workspace off it — so the copy has to happen while nothing is
writing to it.

**A copy taken from a live database loses every row written after each table was
read.** Silently. With no error. Discovered weeks later as records that went
missing. The maintenance switch is what closes that window, and the workflow
refuses to proceed without it by *reading the switch* rather than trusting an
input.

### You name the BINDING, never the database

`DIRECTORY` and `SHARD_EU_1` are what the worker reads and they never change; a
database's NAME changes every time it is relocated. So the workflow takes
bindings, reads the id each one is bound to, and derives the new name itself —
`one-directory-g2`, `one-shard-eu-1-g2`.

**That is not tidiness.** A name typed by a person claims something: the first
one chosen here was `one-directory-eu`, which reads as a jurisdiction the
directory deliberately does not have. Cloudflare is explicit that a location hint
"does not set a jurisdiction" — so the name asserted a regime the database was
never created under, and the dashboard correctly said `Jurisdiction: None`. `-g2`
says the one true thing: which copy this is.

Several bindings can go in one window, comma-separated. Every copy is verified
before any of them is bound, and there is one deploy at the end.

### Rehearse first — no maintenance, nothing bound

Actions → **Relocate a database** → `phase: rehearse`, and the bindings.

It exports each live database **by the id the worker is bound to**, creates the
new one in the declared place, imports, and compares every table's row count. It
binds nothing.

What the rehearsal is for is **the number at the end**: how long the export and
import actually took on your data. That is the length of the window in step 2,
and it is the only honest way to know it before the deployment is down. It also
proves the export, the import and the comparison work at all — which are the
three things that could fail while everybody is waiting.

Measured on this deployment: the copy and its verification take **15 seconds**;
the whole relocation, maintenance switch to boot check, took **100 seconds**, and
most of that is the build and the deploy rather than the data. The window is
short enough that the slow part is a person clicking Maintenance twice.

The copy it leaves behind is a real, verified database in the right place. Delete
it, or keep it and reuse the name.

### Then relocate — maintenance on, and it is checked

1. **Operator console → Maintenance → `readonly`** (or `full`). Reads are still
   served; writes are refused. Nobody is signed out.
2. Actions → **Relocate a database** → `phase: relocate`, same bindings.
   It reads the maintenance switch out of the live directory and stops if the
   deployment is still accepting writes.
3. It exports, creates, imports, and **compares every table row for row**. A
   difference stops it before anything is bound. `d1 execute --file` reports the
   statements it ran, not the rows that landed — a truncated file, a failed
   `CREATE` and the silent `INSERT`s after it all exit 0, which is why the
   comparison exists and why `copied.test.mjs` proves it still refuses.
4. It writes the new **name and id** into each binding, deploys once, and probes
   `/health`. Both together: a rebind that wrote only the id would leave the
   config naming a database that is no longer the live one, and `wrangler d1`
   resolves a name against the account — so every command typed from that config,
   this workflow's own next copy included, would reach the superseded one.
5. It commits the id **only after the deploy answered**. Committing first would
   make the next ordinary push re-point the deployment at a database nobody has
   verified.
6. **You** turn maintenance off.

### If it goes wrong

**The old database is untouched and is the way back.** Revert the commit that
changed the binding, or run `wrangler rollback` in `engine/one`, and the
deployment is on the original database with every row it ever had. That is the
whole reason nothing is deleted.

Delete the old database only when you are satisfied — days later, not minutes.

---

## 4. What to look for afterwards

`wallTimeMs` in the logs, against `cpuTimeMs`. The CPU figure will not move; the
wall figure should fall by roughly the round-trip count per request, which
`engine/one/test/request-cost.test.ts` reports per operation. If it does not
move at all, the new database is not where the declaration says it is — check
what `wrangler d1 info` reports before assuming anything about the code.
