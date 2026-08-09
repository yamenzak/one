/**
 * THE NEGATIVE PROOF — the mistakes that must not compile.
 *
 * ⚠️ A type that accepts every correct declaration has proved nothing. What
 * matters is what it REFUSES, and `@ts-expect-error` is the only assertion that
 * can say so: it fails the build when the error it expects stops happening. So
 * this file goes red both when a guard breaks AND when a guard becomes
 * unnecessary, which is exactly the behaviour a mutation test has.
 *
 * Every case below is a defect this repository has actually paid for, moved from
 * review to the compiler — level 1 of the ranking in STANDARDS.md rather than
 * level 5.
 */

import type { Instant, Money, PlainDate, Id, RegionId } from "../src/primitives.js";
import { defineBindings, sql } from "../src/bindings.js";
import { regionalBindings } from "../src/resolve.js";
import type { DirectoryEntry } from "../src/directory.js";
import type { CacheStore } from "../src/bindings.js";
import { collection, field } from "../src/collection.js";
import { operation } from "../src/operation.js";
import { z } from "./z.js";

/* ---------------------------------------------------------------- time --- */

// Epoch milliseconds cannot reach a column that holds an instant. SQLite would
// have accepted it, `past_due_at + grace` would have become string
// concatenation, and a workspace would simply never have been suspended.
// @ts-expect-error — a number is not an Instant
export const badInstant: Instant = 1_754_000_000_000;

// Nor can a wall-calendar date be used as a point on a timeline. Converting one
// to UTC and back moves it across a midnight for half the planet.
declare const someDate: PlainDate;
// @ts-expect-error — a PlainDate is not an Instant
export const badDate: Instant = someDate;

/* --------------------------------------------------------------- money --- */

// A price is never a float. `19.99` has no exact binary representation, and a
// total assembled from floats disagrees with what the card is charged.
// @ts-expect-error — Money is minor units plus a currency
export const badMoney: Money = 19.99;

// And an amount never travels without the currency that gives it meaning.
// @ts-expect-error — currency is required
export const currencylessMoney: Money = { minor: 1999 };

/* ------------------------------------------------------------------ ids --- */

declare const clientId: Id<"client">;
// @ts-expect-error — a client id is not a plan id, however identical at runtime
export const badId: Id<"plan"> = clientId;

/* ---------------------------------------------------------------- cache --- */

// ⚠️ A cache is replicated to every point of presence on earth and has no
// jurisdiction. Declaring one that holds personal data must not be sayable, or
// "this tenant's data is in the EU" quietly stops being true.
// @ts-expect-error — `personal` is typed `false`, not `boolean`
export const leakyCache: CacheStore = { kind: "cache", regional: false, personal: true };

/* ----------------------------------------------------------- collection --- */

// Optimistic concurrency is not optional. Without it two people editing one
// record silently overwrite each other — and so does a tool call racing a human,
// which is the same defect with worse timing and no witness.
// ⚠️ The directive sits on the CALL, not on a property. A MISSING required
// field is reported against the argument as a whole, while a WRONG value is
// reported on its own line — so the two cases are annotated differently, and
// getting it backwards produces an "unused directive" error that reads exactly
// like the guard having failed.
// @ts-expect-error — `version: true` is required
export const unversioned = collection({
  id: "note",
  label: { one: "Note", many: "Notes" },
  scope: { of: "tenant" },
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "archive" },
  fields: { body: field.text() },
});

// A collection outside tenancy must say WHY. Silence here is how a shared
// catalogue ends up in a tenant cascade and is deleted on the first erasure.
export const unexplainedPlatformScope = collection({
  id: "catalogue",
  label: { one: "Item", many: "Catalogue" },
  // @ts-expect-error — `why` is required on a platform scope
  scope: { of: "platform" },
  version: true,
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "archive" },
  fields: { title: field.text() },
});

/* ------------------------------------------------------------ operation --- */

// Whether a call may be retried is a decision, not a default. A payment webhook
// without one grants the same package on every redelivery.
// @ts-expect-error — `idempotency` is required (missing field ⇒ annotate the call)
export const nonIdempotent = operation({
  id: "x.y",
  kind: "write",
  summary: "…",
  input: z<{ a: string }>(),
  output: z<{ b: string }>(),
  permission: "x:y",
  async handler() {
    return { b: "" };
  },
});

// An operation hidden from the assistant must say why. An opt-in list is one
// somebody forgets to extend; an unexplained opt-out is one nobody can review.
export const unexplainedHide = operation({
  id: "x.z",
  kind: "write",
  summary: "…",
  input: z<{ a: string }>(),
  output: z<{ b: string }>(),
  permission: "x:z",
  idempotency: { mode: "none" },
  // @ts-expect-error — `{ why }` is required when hiding from the tool surface
  tool: { },
  async handler() {
    return { b: "" };
  },
});

/* --------------------------------------------------------------- regions --- */

// ⚠️ THE ASSERTION BEHIND "no handler ever sees a raw binding".
//
// A regional store can only be reached with a region that came from a directory
// lookup. A handler cannot guess one, cannot default to one, and cannot read one
// from a header — the brand on `ResolvedRegion` has exactly one producer.
//
// In the legacy tree this rule is a lint over source text. Here it is the type
// system, which is a level better on the ranking and costs a `unique symbol`.
const someSpec = defineBindings({ db: sql() });
// @ts-expect-error — "eu" is a RegionId, not a ResolvedRegion
regionalBindings(someSpec).for("eu");

// Nor can one be minted by asserting the string type.
declare const plainRegion: RegionId;
// @ts-expect-error — RegionId is not assignable to ResolvedRegion
regionalBindings(someSpec).for(plainRegion);

// ⚠️ And the directory may not grow a personal field. It is replicated to every
// region precisely because nothing in it is governed by residency.
export const leakyEntry: DirectoryEntry = {
  tenantId: "t" as never, slug: "gym", region: "eu", domains: [],
  standing: { standing: "active", reason: "ok" },
  // @ts-expect-error — `ownerEmail` is not part of a directory entry (EXCESS
  // property ⇒ annotate the property, as with a wrong value)
  ownerEmail: "someone@example.com",
};
