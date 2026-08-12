/**
 * THE WIRE, TURNED INTO WHAT A SCREEN TAKES.
 *
 * ⚠️ THIS IS WHERE THE TWO HALVES MEET, so it is where they disagree. Every check
 * here is of something the screens cannot see and the operations do not care
 * about: a raw instant reaching a row, a date read in the wrong zone, a locale
 * the runtime does not have. None of them throws.
 */

import { describe, expect, it } from "vitest";
import type { Instant } from "@one/kernel";
import { day, legalFrom, looksFrom, vaultFrom, type Reading, type VaultReply } from "../src/account/wire.js";

const at = (iso: string) => iso as Instant;
const read: Reading = { locale: "en-GB", zone: "UTC", now: at("2026-08-12T10:00:00.000Z") };

describe("a day is written the way somebody would say it", () => {
  /* ⚠️ NO YEAR INSIDE THE CURRENT ONE. "1 December 2026" reads as a form field
     when it is four months away; the year matters the moment it is not this one. */
  it("leaves the year off this year and puts it on for another", () => {
    expect(day(at("2026-12-01T00:00:00.000Z"), read)).toBe("1 December");
    expect(day(at("2027-12-01T00:00:00.000Z"), read)).toBe("1 December 2027");
  });

  /* ⚠️ NULL IS "UNTIL I CHANGE IT", which is a real answer rather than absence. */
  it("keeps nothing as nothing", () => {
    expect(day(null, read)).toBe(null);
  });

  /*
    ⚠️ AN UNPARSEABLE INSTANT IS NOTHING, NEVER "Invalid Date". A row naming an
    expiry it cannot read is one nobody can act on; with none it reads as "until I
    change it", which understates what is shared rather than promising an end that
    is not there.
  */
  it("comes back with nothing rather than a broken date", () => {
    expect(day("not a date" as Instant, read)).toBe(null);
  });

  /* ⚠️ THE READER'S ZONE, NOT THE MACHINE'S. An instant near midnight is a
     different day in two places, and the one that matters is theirs. */
  it("reads the day in the reader's own zone", () => {
    const midnight = at("2026-12-01T02:00:00.000Z");
    expect(day(midnight, { ...read, zone: "UTC" })).toBe("1 December");
    expect(day(midnight, { ...read, zone: "America/Los_Angeles" })).toBe("30 November");
  });

  /* ⚠️ A LOCALE THE RUNTIME DOES NOT HAVE IS NOT AN OUTAGE on a screen about
     disclosure. The ISO day is worse to read and still true. */
  it("falls back to the plain day rather than throwing", () => {
    expect(day(at("2026-12-01T00:00:00.000Z"), { ...read, zone: "Mars/Olympus" }))
      .toBe("2026-12-01");
  });
});

describe("what a screen is handed", () => {
  const reading = {
    id: "body.mass.trend", label: "Weight trend", from: ["body.mass"],
    says: "Which way it is going.", hides: "Every absolute weight.",
    asks: "staff" as const, rungs: ["self", "compute", "agent", "staff"] as const,
    reach: "staff" as const, granted: true, expiresAt: at("2026-12-01T00:00:00.000Z"),
  };
  const reply: VaultReply = {
    wheres: [{
      appId: "kova", appName: "Kova", tenantId: "t1", name: "Haddad Strength",
      items: [{
        fact: "body.mass", label: "Weight", why: "A direction.", need: "derived",
        required: false, asks: "compute", rungs: ["self", "compute"],
        reach: "self", granted: false, expiresAt: at("2027-01-04T00:00:00.000Z"),
        held: true, categories: [], readings: [reading],
      }],
    }],
    kept: [{ fact: "body.girths", label: "Measurements" }],
  };

  /*
    ⚠️ THE READINGS ARE FORMATTED TOO, and this is the check that exists because
    the type did not force it. A reading carries its OWN grant and its own expiry,
    so a binding that mapped only the top level put a raw instant into the one row
    somebody had set an end date on — and it typechecked.
  */
  it("speaks every date, including the ones inside a reading", () => {
    const out = vaultFrom(reply, read);
    expect(out.wheres[0]!.items[0]!.expiresAt).toBe("4 January 2027");
    expect(out.wheres[0]!.items[0]!.readings[0]!.expiresAt).toBe("1 December");
  });

  /* ⚠️ IT NEVER INVENTS A FIELD. A binding that supplied a missing value would
     hide a route that had stopped sending one. */
  it("copies the declaration through untouched", () => {
    const item = vaultFrom(reply, read).wheres[0]!.items[0]!;
    expect(item.why).toBe("A direction.");
    expect(item.rungs).toEqual(["self", "compute"]);
    expect(item.readings[0]!.hides).toBe("Every absolute weight.");
  });

  it("passes what nothing is asking for straight through", () => {
    expect(vaultFrom(reply, read).kept).toEqual([{ fact: "body.girths", label: "Measurements" }]);
  });

  it("speaks the day somebody looked", () => {
    const looks = looksFrom({ looks: [{
      fact: "body.mass", label: "Weight", where: "Haddad Strength", times: 4,
      on: at("2026-08-11T09:00:00.000Z"),
    }] }, read);
    expect(looks[0]!.on).toBe("11 August");
  });
});


describe("what somebody agreed to, and when", () => {
  const doc = (id: string, version: string) => ({ id, version, title: id, mustAccept: ["member"], body: "x" });
  const reply = {
    documents: [doc("terms", "4"), doc("privacy", "3"), doc("cookies", "1")],
    outstanding: [doc("privacy", "3"), doc("cookies", "1")],
    accepted: [
      { document: "terms", version: "4", at: at("2026-03-02T09:00:00.000Z") },
      /* Two versions of the same document, out of order on purpose. */
      { document: "privacy", version: "1", at: at("2025-01-04T09:00:00.000Z") },
      { document: "privacy", version: "2", at: at("2026-03-02T09:00:00.000Z") },
    ],
  };

  it("matches an acceptance on the version, not just the document", () => {
    /*
      ⚠️ MATCHING ON THE DOCUMENT ALONE WOULD SHOW "Accepted 2 March" AGAINST
      TERMS PUBLISHED IN JUNE — a screen quietly claiming somebody agreed to
      something they have never been shown. The ledger is keyed by version for
      exactly this, and reading it by document throws that away.
    */
    const docs = legalFrom(reply, read);
    expect(docs.find((d) => d.doc.id === "terms")).toMatchObject({ acceptedOn: "2 March", outstanding: false });
    expect(docs.find((d) => d.doc.id === "privacy")!.outstanding).toBe(true);
  });

  it("keeps the date of the version they DID accept", () => {
    /* ⚠️ THE MOST RECENT ONE, which is why the fixture is out of order: falling
       to whichever row came back first reports 2025 for somebody who re-accepted
       in 2026 — older than the truth, on the screen that exists to state it. */
    expect(legalFrom(reply, read).find((d) => d.doc.id === "privacy")!.acceptedOn).toBe("2 March");
  });

  it("reports a document they have never accepted as having no date at all", () => {
    /* ⚠️ Null, never a guess. An empty string renders as a blank where a date
       goes, which reads as a date that failed to load. */
    expect(legalFrom(reply, read).find((d) => d.doc.id === "cookies")!.acceptedOn).toBe(null);
  });
});
