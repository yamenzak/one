/**
 * COMMITTING TO A DOCUMENT, AGAINST A REAL DATABASE.
 *
 * ⚠️ THE LADDER IS PROVED IN THE KERNEL AND THAT IS NOT ENOUGH. What cannot be
 * proved there is the half that needs a table: that the number came out of a
 * counter nobody else could take at the same instant, that a submitted document
 * cannot be edited by a statement rather than by a check somebody remembered,
 * and that an amendment copies the content and not the number.
 *
 * ⚠️ EVERY FAILURE HERE IS SILENT IN PRODUCTION. Two invoices sharing a number
 * is a legal problem that surfaces when an auditor sorts by it. An edit landing
 * on a submitted document is evidence changing after the fact. A counter keyed
 * without its period makes the year in a number decoration. None of the three
 * throws, and none is visible from the code that caused it.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { collection, field, type CollectionSpec } from "@engine/kernel";
import { applySchema, type SchemaModule } from "../src/schema.js";
import type { Db } from "../src/sql.js";
import { statementsFor, columnsFor } from "../src/schema.js";
import {
  NUMBERING_SCHEMA, clearSeries, documentAt, move, numberingIn, seriesFor, setSeries,
  takeNumber,
} from "../src/documents.js";
import { patch, put } from "../src/records.js";

const db = () => env.SHARD_EU_1 as unknown as Db;

const TENANT = "ten_doc";
const NOW = "2026-03-07T11:00:00.000Z";

/* ⚠️ A MINUTE RATHER THAN AN INVOICE — the runtime carries no product
   vocabulary, and what is being proved is that ANY document gets the rail. */
const minute: CollectionSpec = collection({
  id: "minute",
  label: { one: "Minute", many: "Minutes" },
  scope: { of: "tenant" },
  permission: "minute",
  retention: null,
  onClose: { then: "keep", why: "the record of what was agreed" },
  names: "about",
  document: { series: "MIN-{YYYY}-{####}" },
  fields: {
    about: field.text({ label: "About", required: true, holds: "none", max: 200 }),
    agreed: field.long({ label: "Agreed", holds: "none", max: 2_000 }),
  },
});

const MODULE: SchemaModule = {
  id: "doc-test",
  statements: statementsFor(minute),
  columns: { minute: columnsFor(minute) },
};

const draft = async (about = "The Tuesday meeting"): Promise<string> => {
  const done = await put(db(), minute, TENANT, { about }, "acc_x", new Date(NOW));
  if ("why" in done) throw new Error(`could not draft: ${done.why}`);
  return done.id;
};

const at = { now: NOW, by: "acc_x", tenantId: TENANT };

beforeEach(async () => {
  await applySchema(db(), [MODULE, NUMBERING_SCHEMA]);
  await db().exec(`DELETE FROM minute;`);
  await db().exec(`DELETE FROM numbering;`);
  await db().exec(`DELETE FROM series;`);
});

/* ---------------------------------------------------------------- the row --- */

describe("a document before anybody commits to it", () => {
  /*
    ⚠️ NULL IS `draft`, WHICH IS WHAT MAKES THE RAIL SAFE TO ADD TO A LIVE TABLE.
    `put` writes no standing at all — every row that predates the columns reads
    exactly the same way, so a database from last month gains the ladder on its
    next boot with nothing migrated.
  */
  it("reads as a draft with nothing written in the column", async () => {
    const id = await draft();
    const held = await documentAt(db(), minute, TENANT, id);
    expect(held?.stands).toBe("draft");
    expect(held?.number).toBeNull();
    expect(held?.editable).toBe(true);
  });

  it("is not there for another workspace", async () => {
    const id = await draft();
    expect(await documentAt(db(), minute, "ten_other", id)).toBeNull();
  });
});

/* --------------------------------------------------------------- the move --- */

describe("committing to one", () => {
  it("takes a number and closes the record", async () => {
    const id = await draft();
    const done = await move(db(), minute, TENANT, id, "submit", at);
    expect(done).toMatchObject({ stands: "submitted", number: "MIN-2026-0001" });

    const held = await documentAt(db(), minute, TENANT, id);
    expect(held?.stands).toBe("submitted");
    expect(held?.editable).toBe(false);
  });

  /*
    ⚠️ THE EDIT IS REFUSED BY THE STATEMENT, NOT BY A CHECK BEFORE IT. Reading
    the standing and then updating leaves a window a concurrent submit fits
    between — so the edit lands on evidence, having passed a check that was true
    when it was asked.
  */
  it("refuses an edit afterwards, and says which way out there is", async () => {
    const id = await draft();
    await move(db(), minute, TENANT, id, "submit", at);

    const said = await patch(db(), minute, TENANT, id, { about: "Something else" },
      "acc_x", new Date(NOW));
    expect(said).toMatchObject({ why: "not_a_draft", standing: "submitted" });
    if ("why" in said && said.why === "not_a_draft") {
      expect(said.detail).toContain("Cancel it");
    }

    /* ⚠️ And the value really did not move. */
    const row = await db().prepare(`SELECT about FROM minute WHERE id = ?`)
      .bind(id).first<{ about: string }>();
    expect(row?.about).toBe("The Tuesday meeting");
  });

  it("still edits a draft", async () => {
    const id = await draft();
    const said = await patch(db(), minute, TENANT, id, { about: "Renamed" },
      "acc_x", new Date(NOW));
    expect(said).toEqual({ id });
  });

  it("refuses a second submit rather than issuing a second number", async () => {
    const id = await draft();
    await move(db(), minute, TENANT, id, "submit", at);
    const again = await move(db(), minute, TENANT, id, "submit", at);
    expect(again).toMatchObject({ why: "refused", because: "already_submitted" });

    const rows = await db().prepare(`SELECT COUNT(*) AS n FROM numbering`)
      .first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });

  it("refuses a cancel on something nobody committed to", async () => {
    const id = await draft();
    expect(await move(db(), minute, TENANT, id, "cancel", at))
      .toMatchObject({ why: "refused", because: "not_submitted" });
  });

  it("is not movable from another workspace", async () => {
    const id = await draft();
    expect(await move(db(), minute, "ten_other", id, "submit", at))
      .toEqual({ why: "not_found" });
  });
});

/* ------------------------------------------------------------- the number --- */

describe("the counter a number comes from", () => {
  /*
    ⚠️ THE ONE THAT MUST NOT BE RACED. Read-then-write is the shape every
    numbering bug has: two requests read 41, both write 42, and one workspace has
    two documents called MIN-2026-0042 — invisible until somebody sorts by
    number, and unrepairable because both have been sent.
  */
  it("never hands the same number to two documents", async () => {
    const ids = await Promise.all([draft("a"), draft("b"), draft("c"), draft("d")]);
    const done = await Promise.all(
      ids.map((id) => move(db(), minute, TENANT, id, "submit", at)));

    const numbers = done.map((d) => ("number" in d ? d.number : null));
    expect(new Set(numbers).size).toBe(4);
    expect([...numbers].sort()).toEqual(
      ["MIN-2026-0001", "MIN-2026-0002", "MIN-2026-0003", "MIN-2026-0004"]);
  });

  it("counts from one and keeps going", async () => {
    expect(await takeNumber(db(), TENANT, "minute:2026", "X-{####}", NOW)).toBe(1);
    expect(await takeNumber(db(), TENANT, "minute:2026", "X-{####}", NOW)).toBe(2);
    expect(await takeNumber(db(), TENANT, "minute:2026", "X-{####}", NOW)).toBe(3);
  });

  /* ⚠️ ONE WORKSPACE'S NUMBERS MUST NOT SKIP WHERE ANOTHER RAISED ONE — which
     would leak how busy the neighbours are and hand an auditor a gapped run. */
  it("counts separately for each workspace", async () => {
    await takeNumber(db(), TENANT, "minute:2026", "X-{####}", NOW);
    await takeNumber(db(), TENANT, "minute:2026", "X-{####}", NOW);
    expect(await takeNumber(db(), "ten_other", "minute:2026", "X-{####}", NOW)).toBe(1);
  });

  /* ⚠️ A DATED SERIES RESTARTS, WHICH IS WHAT A BUSINESS MEANS BY PUTTING THE
     YEAR IN IT — keyed without the period, the year becomes decoration. */
  it("restarts when the period turns", async () => {
    const id = await draft();
    await move(db(), minute, TENANT, id, "submit", at);
    const next = await draft("next year");
    const done = await move(db(), minute, TENANT, next, "submit",
      { ...at, now: "2027-01-04T09:00:00.000Z" });
    expect(done).toMatchObject({ number: "MIN-2027-0001" });
  });

  /* ⚠️ A WORKSPACE MAY EDIT ITS OWN SERIES — an accountant's format is theirs,
     and changing it must never be a deploy. */
  it("honours a pattern the workspace set over the one declared", async () => {
    const id = await draft();
    const done = await move(db(), minute, TENANT, id, "submit",
      { ...at, series: "AGREED/{YYYY}/{#####}" });
    expect(done).toMatchObject({ number: "AGREED/2026/00001" });
  });

  /* ⚠️ COMPOSITION REFUSES A BAD DECLARED PATTERN, so reaching this means a
     workspace edited its series into something unreadable — a settings problem
     with a person attached, not a deployment fault. */
  it("refuses to number against a pattern nothing can read", async () => {
    const id = await draft();
    expect(await move(db(), minute, TENANT, id, "submit", { ...at, series: "INV-{NOPE}" }))
      .toMatchObject({ why: "unnumbered" });
  });
});

/* ------------------------------------------------------------ withdrawing --- */

describe("withdrawing and correcting one", () => {
  const submitted = async () => {
    const id = await draft();
    await move(db(), minute, TENANT, id, "submit", at);
    return id;
  };

  it("marks it withdrawn and leaves the number on it", async () => {
    const id = await submitted();
    const done = await move(db(), minute, TENANT, id, "cancel", at);
    expect(done).toMatchObject({ stands: "cancelled", number: "MIN-2026-0001" });

    /* ⚠️ THE NUMBER STAYS. A withdrawn document that lost its number is a gap
       in the run with nothing to explain it — the whole reason to keep the row. */
    const held = await documentAt(db(), minute, TENANT, id);
    expect(held?.number).toBe("MIN-2026-0001");
  });

  it("refuses an amendment before the cancellation", async () => {
    const id = await submitted();
    expect(await move(db(), minute, TENANT, id, "amend", at))
      .toMatchObject({ why: "refused", because: "amend_before_cancel" });
  });

  /*
    ⚠️ THE AMENDMENT INHERITS THE CONTENT AND NOTHING ELSE. Carrying the number
    across would give it the withdrawn document's; carrying the standing would
    make it submitted the moment it existed. What anybody wanted to keep is what
    the document SAID.
  */
  it("copies the content into a new draft that points back", async () => {
    const id = await submitted();
    await move(db(), minute, TENANT, id, "cancel", at);
    const done = await move(db(), minute, TENANT, id, "amend", at);

    expect("draft" in done && done.draft).toBeTruthy();
    const made = ("draft" in done ? done.draft : "") as string;

    const fresh = await documentAt(db(), minute, TENANT, made);
    expect(fresh?.stands).toBe("draft");
    expect(fresh?.number).toBeNull();
    expect(fresh?.amends).toBe(id);

    const row = await db().prepare(`SELECT about FROM minute WHERE id = ?`)
      .bind(made).first<{ about: string }>();
    expect(row?.about).toBe("The Tuesday meeting");
  });

  /* ⚠️ AND THE ORIGINAL IS UNTOUCHED — "amended" is a fact about a cancelled
     document that another one points at, never a standing of its own. */
  it("leaves the withdrawn one exactly as it was", async () => {
    const id = await submitted();
    await move(db(), minute, TENANT, id, "cancel", at);
    await move(db(), minute, TENANT, id, "amend", at);

    const held = await documentAt(db(), minute, TENANT, id);
    expect(held?.stands).toBe("cancelled");
    expect(held?.number).toBe("MIN-2026-0001");
    expect(held?.amends).toBeNull();
  });

  it("gives the amendment its own number when it is agreed", async () => {
    const id = await submitted();
    await move(db(), minute, TENANT, id, "cancel", at);
    const done = await move(db(), minute, TENANT, id, "amend", at);
    const made = ("draft" in done ? done.draft : "") as string;

    expect(await move(db(), minute, TENANT, made, "submit", at))
      .toMatchObject({ number: "MIN-2026-0002" });
  });
});

/* --------------------------------------------------------- what they call it --- */

describe("the format a workspace numbers by", () => {
  /*
    ⚠️ ABSENT IS THE COMMON ANSWER AND IT MUST NOT COST A WRITE. Seeding a row at
    founding would mean a deployment that later edits its declared default
    reaches new workspaces and no existing one — the same failure a
    version-stamped catalogue exists to avoid.
  */
  it("is the app's until somebody changes it", async () => {
    expect(await seriesFor(db(), TENANT, "minute")).toBeNull();
    const [one] = await numberingIn(db(), TENANT, [minute], NOW);
    expect(one).toMatchObject({ pattern: "MIN-{YYYY}-{####}", theirs: false });
  });

  it("is theirs once they set one, and the next document takes it", async () => {
    expect(await setSeries(db(), TENANT, "minute", "AGREED/{YYYY}/{###}", NOW, "acc_x"))
      .toEqual({ ok: true });
    expect(await seriesFor(db(), TENANT, "minute")).toBe("AGREED/{YYYY}/{###}");

    const id = await draft();
    const chosen = await seriesFor(db(), TENANT, "minute");
    const done = await move(db(), minute, TENANT, id, "submit",
      { ...at, ...(chosen ? { series: chosen } : {}) });
    expect(done).toMatchObject({ number: "AGREED/2026/001" });
  });

  /*
    ⚠️ CHECKED IN THE STORE AND NOT ONLY ON THE SCREEN. A pattern with no counter
    numbers every document a workspace ever raises the same — which does not
    throw and is found by whoever tries to work out which of forty identical
    invoices was paid.
  */
  it("refuses a pattern that would number everything the same", async () => {
    expect(await setSeries(db(), TENANT, "minute", "MIN-{YYYY}", NOW, "acc_x"))
      .toEqual({ why: "series_without_a_counter" });
    expect(await seriesFor(db(), TENANT, "minute")).toBeNull();
  });

  it("refuses a placeholder nothing fills", async () => {
    expect(await setSeries(db(), TENANT, "minute", "MIN-{YEAR}-{###}", NOW, "acc_x"))
      .toEqual({ why: "series_unknown_token" });
  });

  /* ⚠️ CHANGING THE FORMAT IS NOT RESTARTING THE COUNT. A workspace fourteen
     documents in still has fourteen behind it. */
  it("leaves the count where it was", async () => {
    const first = await draft("one");
    await move(db(), minute, TENANT, first, "submit", at);

    await setSeries(db(), TENANT, "minute", "MIN-{YYYY}-{#####}", NOW, "acc_x");
    const second = await draft("two");
    const chosen = await seriesFor(db(), TENANT, "minute");
    expect(await move(db(), minute, TENANT, second, "submit",
      { ...at, ...(chosen ? { series: chosen } : {}) }))
      .toMatchObject({ number: "MIN-2026-00002" });
  });

  /* ⚠️ THE WAY BACK IS DELETING THE ROW, NEVER WRITING THE DEFAULT INTO IT —
     otherwise the workspace is frozen against a declaration that later moves. */
  it("goes back to the app's by forgetting theirs rather than copying it", async () => {
    await setSeries(db(), TENANT, "minute", "X-{###}", NOW, "acc_x");
    await clearSeries(db(), TENANT, "minute");
    expect(await seriesFor(db(), TENANT, "minute")).toBeNull();
    const [one] = await numberingIn(db(), TENANT, [minute], NOW);
    expect(one).toMatchObject({ pattern: "MIN-{YYYY}-{####}", theirs: false });
  });

  it("is one workspace's own", async () => {
    await setSeries(db(), TENANT, "minute", "X-{###}", NOW, "acc_x");
    expect(await seriesFor(db(), "ten_other", "minute")).toBeNull();
  });

  /*
    ⚠️ THE SCREEN SHOWS WHAT THE NEXT ONE WOULD BE CALLED, NOT THE PATTERN. Nobody
    recognises `MIN-{YYYY}-{####}`; `MIN-2026-0003` is the only form in which a
    wrong answer is obvious before a document goes out carrying it.
  */
  it("says what the next one would be called, from where the count stands", async () => {
    expect((await numberingIn(db(), TENANT, [minute], NOW))[0]?.next).toBe("MIN-2026-0001");

    const id = await draft();
    await move(db(), minute, TENANT, id, "submit", at);
    expect((await numberingIn(db(), TENANT, [minute], NOW))[0]?.next).toBe("MIN-2026-0002");
  });

  it("says nothing about a collection that is not a document", async () => {
    const plain = collection({
      id: "shelf", label: { one: "Shelf", many: "Shelves" },
      scope: { of: "tenant" }, permission: "shelf", retention: null,
      onClose: { then: "purge" },
      fields: { name: field.text({ label: "Name", holds: "none" }) },
    });
    expect(await numberingIn(db(), TENANT, [plain], NOW)).toEqual([]);
  });
});
