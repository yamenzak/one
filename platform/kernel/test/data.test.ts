/**
 * THE MANIFEST GENERATING REAL ARTIFACTS.
 *
 * ⚠️ The assertion that matters most is that the DERIVED DDL SATISFIES THE
 * RUNNER'S OWN RULES. That is where stage 3 and stage 1 meet: the generator
 * cannot emit a statement the runner would swallow, because the runner's
 * validator is run against the generator's output rather than trusted alongside
 * it.
 */

import { describe, expect, it } from "vitest";
import { collection, field, type CollectionSpec } from "../src/collection.js";
import { columnName, columnsFor, deriveSchema, relocationPlan, systemColumns, tableNameFor } from "../src/ddl.js";
import { applyWrite, DOCSTATUS, deletionFor, formatName, frozenFields, refusesChange, seriesKey, transition } from "../src/document.js";
import { tenantCascade, unscopedTables, validateComposition, validateModule } from "../src/schema.js";
import { libraryTracks, screens, slides } from "./proof.scena.js";
import type { Instant, PlainDate } from "../src/primitives.js";

const invoices = collection({
  id: "invoice",
  label: { one: "Invoice", many: "Invoices" },
  scope: { of: "subject", subject: "client" },
  version: true,
  holding: { kind: "none" as const, why: "A fixture. It exists to be a shape, not to hold anybody's data." },
  retention: { days: 2555, onTenantClose: "export-then-purge" },
  onDelete: { on: "archive" },
  naming: { series: "INV-.YYYY.-.####" },
  docStatus: { amendable: true, immutableAfterSubmit: ["total", "issuedOn"] },
  activity: true,
  fields: {
    total: field.money({ required: true }),
    issuedOn: field.plainDate({ required: true }),
    note: field.text({ multiline: true }),
    weight: field.quantity("mass"),
    paid: field.bool(),
  },
});

/* --------------------------------------------------------------- columns --- */

describe("a field becomes columns", () => {
  it("converts a camelCase field to a snake_case column", () => {
    expect(columnName("playlistId")).toBe("playlist_id");
    expect(columnName("lastSeen")).toBe("last_seen");
    expect(columnName("id")).toBe("id");
  });

  /*
    ⚠️ MONEY BECOMES TWO COLUMNS, which is the whole of `Money` being real rather
    than aspirational. An amount without its currency is a number somebody will
    eventually add to a different currency's number.
  */
  it("splits money into minor units and a currency", () => {
    expect(columnsFor("total", field.money()).map((c) => c.sql)).toEqual(["total_minor INTEGER", "total_currency TEXT"]);
  });

  it("stores a quantity as one number in its canonical unit", () => {
    expect(columnsFor("weight", field.quantity("mass")).map((c) => c.sql)).toEqual(["weight REAL"]);
  });

  it("gives every collection its system columns, version included", () => {
    const names = systemColumns(invoices).map((c) => c.name);
    expect(names).toContain("version");
    expect(names).toContain("created_at");
    // Subject-scoped, so it carries both the tenant and the subject.
    expect(names).toContain("tenant_id");
    expect(names).toContain("client_id");
    // Archived rather than purged, named, and a document — so all three appear.
    expect(names).toContain("deleted_at");
    expect(names).toContain("name");
    expect(names).toContain("docstatus");
    expect(names).toContain("amended_from");
  });

  it("adds no deleted_at to a collection that purges", () => {
    expect(systemColumns(screens).map((c) => c.name)).not.toContain("deleted_at");
  });
});

/* ---------------------------------------------------------------- derive --- */

describe("collections derive a schema module", () => {
  const { module, problems } = deriveSchema("kova", [invoices, slides, screens, libraryTracks]);

  it("derives without problems", () => {
    expect(problems).toEqual([]);
  });

  /*
    ⚠️ THE ASSERTION WHERE TWO STAGES MEET. The runner's rules exist because each
    one fails SILENTLY — a missing terminator concatenates statements, a `--`
    swallows the batch, a non-idempotent CREATE breaks the second run. A
    generator is exactly the thing that could violate them at scale, so its
    output is put through the same validator rather than trusted.
  */
  it("emits DDL the runner itself accepts", () => {
    expect(validateModule(module)).toEqual([]);
    expect(validateComposition([module])).toEqual([]);
  });

  it("names tables from the collection id", () => {
    expect(tableNameFor(invoices)).toBe("invoices");
    expect(tableNameFor(libraryTracks)).toBe("library_tracks");
  });

  /*
    ⚠️ ERASURE IS DERIVED FROM THE SAME DECLARATION, so a collection cannot be
    added without its cascade. A hand-written delete list drifts silently: a
    purge steps over the missing table forever while reporting success, because a
    purge swallows delete errors by construction.
  */
  it("derives the tenant cascade from the collections' own scopes", () => {
    const cascade = tenantCascade([module]).map((s) => s.table).sort();
    expect(cascade).toEqual(["invoices", "screens", "slides"]);
  });

  it("leaves the platform-wide catalogue OUT of the cascade", () => {
    // A licensed library shared by every workspace. In a tenant cascade, the
    // first erasure would delete it for everybody.
    expect(tenantCascade([module]).map((s) => s.table)).not.toContain("library_tracks");
    expect(unscopedTables([module])).toEqual(["library_tracks"]);
  });

  it("indexes what a tenant query will actually filter on", () => {
    expect(module.ddl.some((s) => s.includes("idx_slides_tenant"))).toBe(true);
    expect(module.ddl.some((s) => s.includes("idx_invoices_subject"))).toBe(true);
  });
});

describe("a column collision is caught, not left to SQLite", () => {
  /*
    `lastSeen` and `last_seen` both become `last_seen`. SQLite would reject the
    CREATE naming the column but not the two declarations that produced it — and
    a field colliding with a SYSTEM column would shadow machinery the platform
    depends on.
  */
  const clashing: CollectionSpec = {
    id: "thing", label: { one: "Thing", many: "Things" }, scope: { of: "tenant" },
    version: true, retention: { days: null, onTenantClose: "purge" }, onDelete: { on: "purge" },
    holding: { kind: "none", why: "A fixture. It exists to be a shape, not to hold anybody's data." },
    fields: { lastSeen: field.instant(), last_seen: field.text() },
  };

  it("reports two fields colliding on one column", () => {
    const { problems } = deriveSchema("x", [clashing]);
    expect(problems.map((p) => p.rule)).toContain("column");
    expect(problems[0]?.detail).toMatch(/last_seen/);
  });

  it("reports a field shadowing a system column", () => {
    const shadow: CollectionSpec = { ...clashing, fields: { version: field.number({ integer: true }) } };
    expect(deriveSchema("x", [shadow]).problems.map((p) => p.rule)).toContain("column");
  });
});

/* ------------------------------------------------------------- docstatus --- */

describe("a document asserts something happened", () => {
  it("moves draft → submitted → cancelled", () => {
    expect(transition("draft", "submit", invoices)).toEqual({ ok: true, to: "submitted", newDocument: false });
    expect(transition("submitted", "cancel", invoices)).toEqual({ ok: true, to: "cancelled", newDocument: false });
  });

  it("refuses a transition that would skip a step", () => {
    expect(transition("draft", "cancel", invoices).ok).toBe(false);
    expect(transition("cancelled", "submit", invoices).ok).toBe(false);
  });

  /*
    ⚠️ AN AMENDMENT IS A NEW DOCUMENT. A cancelled record corrected in place
    would let the correction and the original share an identity, so a reference
    to it means one thing before the edit and another after — and any audit trail
    pointing at it describes something that no longer exists.
  */
  it("amends by creating a new document, never by editing", () => {
    const r = transition("cancelled", "amend", invoices);
    expect(r).toEqual({ ok: true, to: "draft", newDocument: true });
  });

  it("refuses to amend a live document, which would be an edit in disguise", () => {
    expect(transition("submitted", "amend", invoices).ok).toBe(false);
  });

  it("refuses any of it for a collection with no lifecycle", () => {
    // Opt-in per collection: right for a cycle record, wrong for a profile.
    expect(transition("draft", "submit", slides).ok).toBe(false);
  });

  it("freezes the declared fields once submitted, and nothing while draft", () => {
    expect(frozenFields("draft", invoices)).toEqual([]);
    expect(frozenFields("submitted", invoices)).toEqual(["total", "issuedOn"]);
    // A typo in a note is not a reason to force an amendment.
    expect(refusesChange("submitted", invoices, ["note"])).toEqual([]);
    expect(refusesChange("submitted", invoices, ["note", "total"])).toEqual(["total"]);
  });

  it("stores the state as an integer with the meaning in one place", () => {
    expect(DOCSTATUS).toEqual({ draft: 0, submitted: 1, cancelled: 2 });
  });
});

/* ---------------------------------------------------------------- naming --- */

describe("a name a person can quote", () => {
  const day = "2026-08-09" as PlainDate;

  it("fills the series from the date and the counter", () => {
    expect(formatName("INV-.YYYY.-.####", 1, day)).toBe("INV-2026-0001");
    expect(formatName("CL-.YYYY.-.MM.-.###", 42, day)).toBe("CL-2026-08-042");
  });

  it("counts per period, so the sequence restarts when the period does", () => {
    expect(seriesKey("INV-.YYYY.-.####", day)).toBe("INV-2026-");
    expect(seriesKey("INV-.YYYY.-.####", "2027-01-01" as PlainDate)).toBe("INV-2027-");
  });

  it("pads to the width the series asked for", () => {
    expect(formatName("INV-.####", 7, day)).toBe("INV-0007");
    expect(formatName("INV-.##.", 7, day)).toBe("INV-07");
  });
});

/* --------------------------------------------------------------- version --- */

describe("optimistic concurrency", () => {
  const row = { version: 3, title: "before" };

  it("bumps the version on a write that expected the current one", () => {
    const r = applyWrite(row, 3, { title: "after" });
    expect(r.ok && r.next).toEqual({ version: 4, title: "after" });
  });

  /*
    ⚠️ Two humans is the case everybody pictures. The one that bites is a TOOL
    racing a person — the assistant reads, the person saves, the assistant writes
    back what it read, and the person's change is gone with no error anywhere.
  */
  it("refuses a write based on a stale read", () => {
    expect(applyWrite(row, 2, { title: "clobbered" })).toEqual({ ok: false, why: "conflict" });
  });
});

/* ------------------------------------------------------------ relocation --- */

describe("relocation is the erasure declaration, copying instead of deleting", () => {
  const plan = relocationPlan([invoices, slides, screens, libraryTracks]);

  it("moves every tenant-scoped table and no platform-wide one", () => {
    expect(plan.tables.map((t) => t.table).sort()).toEqual(["invoices", "screens", "slides"]);
  });

  /*
    ⚠️ MEDIA IS COPIED, NEVER MOVED. A content-addressed object is referenced by
    every tenant whose content hashed the same; moving it breaks all of them, and
    the breakage surfaces weeks later on a device replaying a cached manifest
    offline. The bucket deduplicates; the accounting does not.
  */
  it("marks every media field copy-only", () => {
    expect(plan.objects.length).toBeGreaterThan(0);
    expect(plan.objects.every((o) => o.copyOnly)).toBe(true);
  });
});

/* ----------------------------------------------------------- soft delete --- */

describe("deleting means what the collection said it means", () => {
  const at = "2026-08-09T12:00:00.000Z" as Instant;
  it("archives where retention requires the row kept", () => {
    expect(deletionFor(invoices, at)).toEqual({ kind: "archive", at });
  });
  it("purges where an archived row would be a liability", () => {
    // An archived screen still holding a pairing claim is a television somebody
    // else could adopt.
    expect(deletionFor(screens, at)).toEqual({ kind: "purge" });
  });
});
