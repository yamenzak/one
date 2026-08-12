/**
 * THE WIRE, TURNED INTO WHAT A SCREEN TAKES.
 *
 * ⚠️ THE SCREENS TAKE PROPS, NOT RESPONSES, and this is the one place the two
 * meet. A component that fetched would be a component that could not be looked at
 * without a server, and every state it has — waiting, empty, failed — would be
 * reachable only by breaking something. So the screens are pure and this module
 * is the only thing in the package that knows what an operation answers with.
 *
 * ⚠️ ITS WHOLE JOB IS THE THINGS A RENDERER MUST NOT DO. An operation answers
 * with instants, because that is what a comparison against "now" needs; a person
 * reads "1 December", because that is what somebody deciding whether to extend
 * needs. Formatting it in the component would mean telling every list a locale
 * and a time zone, and a list that was told neither would quietly render one
 * machine's idea of a date to everybody.
 *
 * ⚠️ AND IT NEVER INVENTS A FIELD. Everything here is copied or formatted —
 * nothing is defaulted, inferred or filled in — because a binding that supplies a
 * missing value is a binding that hides a route which stopped sending one.
 */

import type { Instant, Wanted } from "@one/kernel";
import type { Item, Kept, Looked, Where } from "./vault.js";
import type { Doc } from "./legal.js";

/** Exactly what `vault.mine` answers with. */
export interface VaultReply {
  readonly wheres: readonly (Omit<Where, "items"> & { readonly items: readonly Wanted[] })[];
  readonly kept: readonly Kept[];
}

/**
 * ⚠️ THE READER'S OWN CLOCK AND LANGUAGE, PASSED IN. A module that read the
 * browser's would be a module that cannot be tested twice with the same answer,
 * and the preference screen already lets somebody choose a language the device
 * disagrees with — so the choice travels rather than being sampled.
 */
export interface Reading {
  readonly locale: string;
  readonly zone: string;
  /** ⚠️ The reader's now, so "this year" is decided rather than assumed. */
  readonly now: Instant;
}

/**
 * A DAY, WRITTEN THE WAY SOMEBODY WOULD SAY IT.
 *
 * ⚠️ NO YEAR INSIDE THE CURRENT ONE, and the year the moment it leaves. "1
 * December" is how a date within a few months is spoken; "1 December 2027" reads
 * as a form field until it is genuinely a different year, and then it is the only
 * part that matters.
 *
 * ⚠️ AN UNPARSEABLE INSTANT COMES BACK AS NOTHING, never as "Invalid Date". A row
 * saying an expiry it cannot name is a row somebody cannot act on; a row with no
 * expiry is one that reads as "until I change it", which is the safe direction —
 * it understates what is shared rather than promising an end that is not there.
 */
export function day(at: Instant | null, read: Reading): string | null {
  if (at === null) return null;
  const on = new Date(at);
  if (Number.isNaN(on.getTime())) return null;
  const sameYear = new Date(read.now).getUTCFullYear() === on.getUTCFullYear();
  try {
    return new Intl.DateTimeFormat(read.locale, {
      day: "numeric", month: "long", timeZone: read.zone,
      ...(sameYear ? {} : { year: "numeric" }),
    }).format(on);
  } catch {
    /* A locale or zone the runtime does not have is not worth an outage on a
       screen about disclosure — the ISO day is worse to read and still true. */
    return at.slice(0, 10);
  }
}

/** One want, as the screen takes it: the declaration, with its dates spoken. */
const item = (w: Wanted, read: Reading): Item => ({
  ...w,
  expiresAt: day(w.expiresAt, read),
  readings: w.readings.map((r) => ({ ...r, expiresAt: day(r.expiresAt, read) })),
});

/**
 * ⚠️ THE READINGS ARE FORMATTED TOO, and forgetting them is the shape this
 * function exists to make impossible. A reading carries its own grant and its own
 * expiry — resolved separately by the kernel — so a binding that mapped only the
 * top level would put a raw instant into a row that renders it verbatim, and the
 * one row where that shows is the one somebody set an end date on.
 */
export const vaultFrom = (reply: VaultReply, read: Reading): {
  readonly wheres: readonly Where[];
  readonly kept: readonly Kept[];
} => ({
  wheres: reply.wheres.map((w) => ({ ...w, items: w.items.map((i) => item(i, read)) })),
  kept: reply.kept,
});

/** Exactly what `vault.disclosures` answers with, before its days are spoken. */
export interface LookReply {
  readonly looks: readonly (Omit<Looked, "on"> & { readonly on: Instant })[];
}

export const looksFrom = (reply: LookReply, read: Reading): readonly Looked[] =>
  reply.looks.map((l) => ({ ...l, on: day(l.on, read) ?? l.on.slice(0, 10) }));

/* ---------------------------------------------------------------- legal --- */

/** Exactly what `legal.list` answers with, before its days are spoken. */
export interface LegalReply {
  readonly documents: readonly {
    readonly id: string; readonly version: string; readonly title: string;
    readonly body?: string; readonly url?: string;
  }[];
  /** The ones this person still has to accept, resolved from their ROLE. */
  readonly outstanding: readonly { readonly id: string }[];
  /** Every acceptance, every version — agreeing to v3 does not unsay v1. */
  readonly accepted: readonly { readonly document: string; readonly version: string; readonly at: Instant }[];
}

/**
 * ⚠️ THE ACCEPTANCE IS MATCHED ON DOCUMENT **AND** VERSION, which is the whole
 * reason the ledger is keyed that way. Matching on the document alone would show
 * "Accepted 2 March" against terms published in June — a screen quietly claiming
 * somebody agreed to something they have never been shown.
 */
export const legalFrom = (reply: LegalReply, read: Reading): readonly Doc[] => {
  const owed = new Set(reply.outstanding.map((d) => d.id));
  return reply.documents.map((d) => {
    const held = reply.accepted.find((a) => a.document === d.id && a.version === d.version)
      /* ⚠️ FALLING BACK TO ANY VERSION IS WHAT MAKES "New version" POSSIBLE. A
         person who accepted v2 of a document now at v3 has a date worth showing;
         reporting them as never having agreed loses the distinction the screen
         exists to draw. */
      ?? [...reply.accepted].filter((a) => a.document === d.id).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
    return {
      id: d.id, version: d.version, title: d.title,
      ...(d.body ? { body: d.body } : {}),
      ...(d.url ? { url: d.url } : {}),
      acceptedOn: held ? day(held.at, read) : null,
      outstanding: owed.has(d.id),
    };
  });
};
