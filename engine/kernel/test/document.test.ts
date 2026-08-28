/**
 * THE DOCUMENT RAIL — the moment a record stops being editable, the number it
 * takes, and what cancelling it is allowed to mean.
 *
 * ⚠️ EVERY FAILURE THIS FILE PINS IS ONE THAT LOOKS LIKE SUCCESS. A series with
 * no counter numbers every invoice the same and throws nothing. A placeholder
 * nobody implements prints itself onto a legal document. A counter keyed without
 * its period makes the year in an invoice number decoration. A cancel offered on
 * a document that may not lawfully be withdrawn is a button that works.
 */

import { describe, expect, it } from "vitest";
import {
  COUNTER_FLOOR, DOCUMENT_COLUMNS, DOCUMENT_MOVES, DOCUMENT_STANDINGS,
  counterKey, documentEditable, mayMoveDocument, readSeries, refuseDocument,
  renderSeries, standingAfter,
  type DocumentSpec, type DocumentStanding, type SeriesPart,
} from "../src/document.js";
import { collection, refuseCollection } from "../src/collection.js";
import { field } from "../src/field.js";

const plain: DocumentSpec = { series: "DOC-{YYYY}-{#####}" };

const parts = (pattern: string): readonly SeriesPart[] => {
  const got = readSeries(pattern);
  if (typeof got === "string") throw new Error(`expected a pattern, got ${got}`);
  return got;
};

/* ---------------------------------------------------------------- ladder --- */

describe("the ladder a document climbs", () => {
  it("commits a draft and nothing else", () => {
    expect(mayMoveDocument("draft", "submit", plain)).toBe(true);
    expect(mayMoveDocument("submitted", "submit", plain)).toBe("already_submitted");
    expect(mayMoveDocument("cancelled", "submit", plain)).toBe("already_cancelled");
  });

  /*
    ⚠️ A DRAFT IS NOT CANCELLED, IT IS BINNED. Cancelling implies there was
    something to withdraw — a number issued, a ledger moved, somebody relying on
    it. Offering Cancel on a draft puts two words on one action and makes the
    trash the thing nobody finds.
  */
  it("refuses a cancel on something nobody committed to", () => {
    expect(mayMoveDocument("draft", "cancel", plain)).toBe("not_submitted");
    expect(mayMoveDocument("submitted", "cancel", plain)).toBe(true);
    expect(mayMoveDocument("cancelled", "cancel", plain)).toBe("already_cancelled");
  });

  it("puts an amendment after a cancellation and never before it", () => {
    expect(mayMoveDocument("cancelled", "amend", plain)).toBe(true);
    expect(mayMoveDocument("submitted", "amend", plain)).toBe("amend_before_cancel");
    expect(mayMoveDocument("draft", "amend", plain)).toBe("amend_before_cancel");
  });

  it("honours a document that may never be corrected", () => {
    const once: DocumentSpec = { ...plain, amendable: false };
    expect(mayMoveDocument("cancelled", "amend", once)).toBe("not_amendable");
    /* ⚠️ And it can still be cancelled — the two are separate promises. */
    expect(mayMoveDocument("submitted", "cancel", once)).toBe(true);
  });

  /*
    ⚠️ THE COMPLIANCE CASE, AND IT IS THE REASON `cancel` IS A DECLARATION RATHER
    THAN A BOOLEAN. Where a tax invoice may not be withdrawn, the lawful
    correction is a credit note — a different document with its own number. A
    refusal here is what lets a screen offer that instead of offering nothing.
  */
  it("refuses to withdraw a document the law will not let anybody withdraw", () => {
    const sealed: DocumentSpec = {
      ...plain,
      amendable: false,
      cancel: { by: "refusing", instead: "credit-note", why: "A tax invoice is corrected, never withdrawn" },
    };
    expect(mayMoveDocument("submitted", "cancel", sealed)).toBe("never_cancellable");
  });

  it("leaves the original alone when it is amended", () => {
    expect(standingAfter("draft", "submit")).toBe("submitted");
    expect(standingAfter("submitted", "cancel")).toBe("cancelled");
    /* ⚠️ An amendment produces a NEW draft; the cancelled one stays cancelled. */
    expect(standingAfter("cancelled", "amend")).toBe("cancelled");
  });

  it("closes a document to editing the moment it is committed to", () => {
    expect(documentEditable("draft")).toBe(true);
    expect(documentEditable("submitted")).toBe(false);
    expect(documentEditable("cancelled")).toBe(false);
  });

  /*
    ⚠️ THREE STANDINGS AND NOT FOUR — see the file's header. "Amended" is a fact
    about a cancelled document, derived from something pointing at it, and a
    fourth standing would be a second place that truth lived.
  */
  it("keeps the standings to three", () => {
    expect(DOCUMENT_STANDINGS).toEqual(["draft", "submitted", "cancelled"]);
    expect(DOCUMENT_STANDINGS).not.toContain("amended");
  });

  it("answers for every standing and move there is", () => {
    for (const from of DOCUMENT_STANDINGS) {
      for (const move of DOCUMENT_MOVES) {
        const said = mayMoveDocument(from, move, plain);
        expect(said === true || typeof said === "string").toBe(true);
      }
    }
  });
});

/* ---------------------------------------------------------------- series --- */

describe("reading a series", () => {
  it("splits literals from placeholders", () => {
    expect(parts("SINV-{YYYY}-{#####}")).toEqual([
      { literal: "SINV-" },
      { token: "year" },
      { literal: "-" },
      { token: "counter", width: 5 },
    ]);
  });

  /*
    ⚠️ THE TYPO THAT SHIPS. A dot-delimited grammar cannot tell a token nobody
    implements from literal text, so `.YEAR.` becomes four characters printed on
    every invoice for the life of the deployment. Braces make it a refusal here,
    which is the whole argument for the syntax.
  */
  it("refuses a placeholder nothing fills", () => {
    expect(readSeries("INV-{YEAR}-{####}")).toBe("series_unknown_token");
    expect(readSeries("INV-{}")).toBe("series_unknown_token");
  });

  it("refuses a brace that does not close, and one that never opened", () => {
    expect(readSeries("INV-{YYYY")).toBe("series_unparseable");
    expect(readSeries("INV-YYYY}")).toBe("series_unparseable");
  });

  /*
    ⚠️ THE SILENT ONE. `INV-{YYYY}` reads as a series, renders without error, and
    gives every invoice of the year the number INV-2026 — found by whoever tries
    to work out which of forty identical invoices was paid.
  */
  it("refuses a pattern that would number every document the same", () => {
    expect(readSeries("INV-{YYYY}")).toBe("series_without_a_counter");
    expect(readSeries("INVOICE")).toBe("series_without_a_counter");
  });

  it("refuses two counters and one number to put in them", () => {
    expect(readSeries("INV-{###}-{###}")).toBe("series_counter_twice");
  });

  it("refuses a counter that collides inside its first year", () => {
    expect(readSeries("INV-{##}")).toBe("series_too_narrow");
    expect(parts(`INV-{${"#".repeat(COUNTER_FLOOR)}}`)).toContainEqual(
      { token: "counter", width: COUNTER_FLOOR });
  });

  it("refuses a blank pattern", () => {
    expect(readSeries("")).toBe("series_empty");
    expect(readSeries("   ")).toBe("series_empty");
  });

  it("reads a reference to the document's own field", () => {
    expect(parts("{field:branch}-{####}")).toEqual([
      { token: "field", field: "branch" },
      { literal: "-" },
      { token: "counter", width: 4 },
    ]);
    expect(readSeries("{field:}-{####}")).toBe("series_unknown_token");
    expect(readSeries("{field:2bad}-{####}")).toBe("series_unknown_token");
  });
});

describe("rendering a number", () => {
  const at = { now: "2026-03-07T11:00:00.000Z", counter: 42 };

  it("fills every placeholder there is", () => {
    expect(renderSeries(parts("SINV-{YYYY}-{#####}"), at)).toBe("SINV-2026-00042");
    expect(renderSeries(parts("{YY}{MM}{DD}-{###}"), at)).toBe("260307-042");
  });

  /*
    ⚠️ A NUMBER THAT REPEATS IS WORSE THAN A NUMBER ONE CHARACTER TOO WIDE, and
    truncation is the silent one of the two. `{###}` at the thousandth document
    prints 1000 rather than 000.
  */
  it("grows the counter past its width rather than wrapping", () => {
    expect(renderSeries(parts("INV-{###}"), { ...at, counter: 1000 })).toBe("INV-1000");
    expect(renderSeries(parts("INV-{###}"), { ...at, counter: 7 })).toBe("INV-007");
  });

  /*
    ⚠️ UTC, BECAUSE THE ALTERNATIVE IS TWO YEARS' NUMBERS IN ONE AFTERNOON. Read
    in local time, the colo answering decides which year an invoice raised near
    midnight belongs to.
  */
  it("reads the date in UTC", () => {
    const newYear = { now: "2026-12-31T23:30:00.000Z", counter: 1 };
    expect(renderSeries(parts("{YYYY}-{###}"), newYear)).toBe("2026-001");
  });

  it("leaves a gap for a field the document has not got, never the word undefined", () => {
    const got = renderSeries(parts("{field:branch}-{###}"), { ...at, fields: {} });
    expect(got).toBe("-042");
    expect(got).not.toContain("undefined");
    expect(renderSeries(parts("{field:branch}-{###}"), { ...at, fields: { branch: "HH" } }))
      .toBe("HH-042");
  });
});

describe("which counter a pattern draws from", () => {
  /*
    ⚠️ THE PERIOD IS PART OF THE KEY, AND WITHOUT IT THE YEAR IN THE NUMBER IS
    DECORATION. A series carrying {YYYY} restarts each year because that is what
    a business means by it; keyed on the collection alone, INV-2026-0412 is
    followed on the first of January by INV-2027-0413.
  */
  it("restarts a dated series and does not restart an undated one", () => {
    const dated = parts("INV-{YYYY}-{####}");
    const a = counterKey("invoice", dated, { now: "2026-12-31T23:59:00.000Z" });
    const b = counterKey("invoice", dated, { now: "2027-01-01T00:01:00.000Z" });
    expect(a).not.toBe(b);

    const flat = parts("INV-{####}");
    expect(counterKey("invoice", flat, { now: "2026-12-31T23:59:00.000Z" }))
      .toBe(counterKey("invoice", flat, { now: "2027-01-01T00:01:00.000Z" }));
  });

  it("keeps two collections' counters apart", () => {
    const p = parts("X-{####}");
    expect(counterKey("invoice", p, { now: "2026-03-07T00:00:00.000Z" }))
      .not.toBe(counterKey("bill", p, { now: "2026-03-07T00:00:00.000Z" }));
  });

  it("does not restart a monthly series until the month turns", () => {
    const monthly = parts("INV-{YYYY}{MM}-{####}");
    const early = counterKey("invoice", monthly, { now: "2026-03-01T00:00:00.000Z" });
    const late = counterKey("invoice", monthly, { now: "2026-03-31T23:00:00.000Z" });
    const next = counterKey("invoice", monthly, { now: "2026-04-01T00:00:00.000Z" });
    expect(early).toBe(late);
    expect(late).not.toBe(next);
  });
});

/* -------------------------------------------------------------- refusals --- */

describe("what a document declaration can get wrong", () => {
  const why = (spec: DocumentSpec) => refuseDocument("thing", spec).map((p) => p.why);

  it("passes an ordinary one", () => {
    expect(why(plain)).toEqual([]);
  });

  it("carries the series refusal through with a sentence on it", () => {
    const [problem] = refuseDocument("thing", { series: "INV-{YYYY}" });
    expect(problem?.why).toBe("series_without_a_counter");
    expect(problem?.detail).toContain("same number");
  });

  /*
    ⚠️ A POSTING WITH NO RULE IS THE ONE THAT BREAKS THE CANCEL. The engine would
    know the document had an effect and not what it was, so the reversal it
    exists to derive could not be worked out — and the failure surfaces as a
    ledger that does not balance rather than as a refusal.
  */
  it("refuses a posting it could never reverse", () => {
    expect(why({ ...plain, posts: [{ to: "book", rule: "" }] }))
      .toEqual(["posts_without_a_rule"]);
    expect(why({ ...plain, posts: [{ to: "", rule: "sale" }] }))
      .toEqual(["posts_nowhere"]);
    expect(why({ ...plain, posts: [{ to: "book", rule: "sale" }] })).toEqual([]);
  });

  it("refuses a cancel it will not allow and cannot replace", () => {
    expect(why({
      ...plain, amendable: false,
      cancel: { by: "refusing", instead: "", why: "" },
    })).toEqual(["refuses_without_an_alternative"]);
  });

  /*
    ⚠️ A CONTROL OFFERED AND REFUSED EVERY TIME IT IS PRESSED. An amendment
    follows a cancellation, so a document that can never reach `cancelled` and
    still advertises `amendable` shows a button that cannot work.
  */
  it("refuses a document that cannot be cancelled and still offers amending", () => {
    expect(why({
      ...plain,
      cancel: { by: "refusing", instead: "credit-note", why: "corrected, never withdrawn" },
    })).toEqual(["refuses_and_amends"]);
  });
});

describe("a collection carrying one", () => {
  const of = (extra: Partial<Parameters<typeof collection>[0]>) => refuseCollection(collection({
    id: "bill", label: { one: "Bill", many: "Bills" },
    scope: { of: "tenant" }, permission: "bill", retention: null,
    onClose: { then: "keep", why: "evidence of what was owed" },
    fields: { total: field.text({ label: "Total", holds: "none" }) },
    ...extra,
  } as Parameters<typeof collection>[0])).map((p) => p.why);

  it("passes a plain document", () => {
    expect(of({ document: plain })).toEqual([]);
  });

  it("reports a bad series as the collection's problem", () => {
    expect(of({ document: { series: "B-{NOPE}-{###}" } })).toContain("document_invalid");
  });

  /*
    ⚠️ A GLOBAL DOCUMENT DRAWS FROM A COUNTER EVERY TENANT INCREMENTS, so one
    business's invoice numbers skip wherever another raised one — which leaks how
    busy the neighbours are and hands an auditor a sequence full of holes.
  */
  it("refuses a document wider than the workspace that commits to it", () => {
    expect(of({ scope: { of: "global" }, document: plain }))
      .toContain("document_beyond_a_tenant");
  });

  it("leaves a collection that is not a document entirely alone", () => {
    expect(of({})).toEqual([]);
  });
});

describe("the columns the engine adds", () => {
  /*
    ⚠️ NULL IS `draft`, WHICH IS WHAT MAKES THIS SAFE ON A LIVE TABLE — the same
    trick `aside` uses. Every row written before the column existed reads as the
    draft it was, and nothing is migrated.
  */
  it("names four and no app declares any of them", () => {
    expect(DOCUMENT_COLUMNS).toEqual(["stands", "stands_at", "number", "amends"]);
  });

  it("keeps them clear of anything SQL means something by", () => {
    const reserved = new Set(["from", "to", "order", "select", "where", "group", "by", "on"]);
    for (const c of DOCUMENT_COLUMNS) expect(reserved.has(c)).toBe(false);
  });
});

/* ⚠️ Compile-time: a standing is one of three, and nothing widens it quietly. */
const _standing: DocumentStanding = "draft";
void _standing;
