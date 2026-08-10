/**
 * THE SHELF, AND THE ARITHMETIC A PRICE LIST GETS WRONG.
 *
 * ⚠️ A PRICE LIST WRITTEN BY HAND DRIFTS FROM WHAT IS ENFORCED, and the drift is
 * discovered by somebody who bought a thing the product then refuses. Every
 * function here is a projection of the same declarations the gate reads, so
 * there is nowhere to put a second copy.
 */

import { describe, expect, it } from "vitest";
import {
  UNLIMITED, compare, marketProblems, offerOf, packageLines, strains,
  type Currency, type EntitlementDef, type FlagDef, type PlanSpec,
} from "../src/index.js";

const declared: Record<string, EntitlementDef> = {
  notes: { label: "Notes", parked: true, enforcement: "gate" },
  receipts: { label: "Receipts kept", parked: 5, enforcement: "quota" },
  storedBytes: { label: "Storage", unit: "bytes", parked: 2_000_000, enforcement: "quota" },
  chat: { label: "Messaging", parked: false, enforcement: { unenforced: "no plan enables it yet" } },
};

const plan = (id: string, entitlements: PlanSpec["entitlements"]): PlanSpec => ({
  id, name: id, price: { minor: 0, currency: "EUR" as Currency }, period: "month", trialDays: 0, entitlements,
});

const free = plan("free", { notes: true, receipts: 5 });
const keeper = plan("keeper", { notes: true, receipts: UNLIMITED, storedBytes: 50_000_000 });

/* -------------------------------------------------------------- the card --- */

describe("a plan, as a card", () => {
  /*
    ⚠️ EVERY DECLARED KEY, NOT EVERY KEY THE PLAN MENTIONS. A plan omitting one
    is a plan on which the parking value applies — so walking the plan's own map
    gives ragged columns, and the cheap plan looks like it has fewer FEATURES
    rather than smaller NUMBERS, which is the opposite of true.
  */
  it("carries a row for everything declared, whether the plan mentions it or not", () => {
    expect(offerOf(free, declared).includes.map((l) => l.key)).toEqual(Object.keys(declared));
  });

  it("falls back to the parking value for a key the plan omits", () => {
    const line = offerOf(free, declared).includes.find((l) => l.key === "storedBytes")!;
    expect(line.value).toBe(2_000_000);
  });

  /*
    ⚠️ `-1` IS READ ONCE, HERE. A renderer that had to know is one that prints
    "-1 receipts" the first time somebody forgets.
  */
  it("says unlimited rather than handing out a negative one", () => {
    const line = offerOf(keeper, declared).includes.find((l) => l.key === "receipts")!;
    expect(line).toMatchObject({ value: UNLIMITED, unlimited: true, unit: "count" });
  });

  it("carries the label from the declaration, and no copy of its own", () => {
    expect(offerOf(free, declared).includes.map((l) => l.label)).toContain("Receipts kept");
  });

  it("marks a switch as a switch and bytes as bytes", () => {
    const lines = new Map(offerOf(keeper, declared).includes.map((l) => [l.key, l]));
    expect(lines.get("notes")!.unit).toBe("switch");
    expect(lines.get("storedBytes")!.unit).toBe("bytes");
  });
});

/* ----------------------------------------------------------- the compare --- */

describe("what moving between two plans changes", () => {
  /*
    ⚠️ UNLIMITED IS THE TOP, NOT THE BOTTOM. `-1` sorts below zero as a number
    and above everything as an allowance — a comparison that forgets it reports
    every upgrade to an unlimited plan as a loss of everything.
  */
  it("reads unlimited as more, not as less than five", () => {
    const { gains, losses } = compare(free, keeper, declared);
    expect(gains.map((g) => g.key)).toContain("receipts");
    expect(losses).toEqual([]);
  });

  it("names what a downgrade takes away", () => {
    const { gains, losses } = compare(keeper, free, declared);
    expect(losses.map((l) => l.key).sort()).toEqual(["receipts", "storedBytes"]);
    expect(gains).toEqual([]);
  });

  /*
    ⚠️ NO PLAN IS THE PARKING STATE, NOT ZERO. Treating it as nothing advertises
    every plan as pure gain — including the ones that take something away from
    what a workspace already had without paying.
  */
  it("compares against the parking values when there is no plan yet", () => {
    const meaner = plan("mean", { notes: false, receipts: 5 });
    expect(compare(null, meaner, declared).losses.map((l) => l.key)).toEqual(["notes"]);
    expect(compare(null, free, declared).losses).toEqual([]);
  });

  it("says nothing about a key that did not move", () => {
    expect(compare(free, keeper, declared).gains.some((g) => g.key === "notes")).toBe(false);
  });
});

/* ------------------------------------------------------------ the strain --- */

describe("ceilings a workspace is already past", () => {
  it("names the ones the usage exceeds, with both numbers", () => {
    expect(strains(free, declared, { receipts: 40 })).toEqual([
      { key: "receipts", label: "Receipts kept", have: 40, allows: 5 },
    ]);
  });

  it("says nothing when the usage fits", () => {
    expect(strains(free, declared, { receipts: 5 })).toEqual([]);
  });

  /* ⚠️ Unlimited strains against nothing, however much is stored. */
  it("never strains against an unlimited ceiling", () => {
    expect(strains(keeper, declared, { receipts: 9_000 })).toEqual([]);
  });

  it("ignores a switch, which has no ceiling to be past", () => {
    expect(strains(free, declared, { notes: 3 })).toEqual([]);
  });

  it("ignores usage for a key nobody declared", () => {
    expect(strains(free, declared, { ghosts: 99 })).toEqual([]);
  });
});

/* ----------------------------------------------------------- the package --- */

describe("a package, as a card", () => {
  const flags: Record<string, FlagDef> = {
    digest: { label: "Rolled-up notes", parked: false, enforcement: "gate", scope: "reading" },
    export: { label: "Downloads", parked: false, enforcement: "gate" },
  };

  /*
    ⚠️ EVERY SELLABLE FLAG, for the same reason as the other rail. A package that
    turns two things on is not a package with two features — it is a package with
    two of eight on, and a customer comparing packages has to see the six.
  */
  it("carries a row for every flag, on or off", () => {
    const lines = packageLines({ digest: true }, flags);
    expect(lines.map((l) => l.key)).toEqual(["digest", "export"]);
    expect(lines.find((l) => l.key === "export")).toMatchObject({ on: false, label: "Downloads" });
  });

  it("carries the budget scope where one gates it", () => {
    expect(packageLines({}, flags).find((l) => l.key === "digest")!.scope).toBe("reading");
    expect(packageLines({}, flags).find((l) => l.key === "export")!.scope).toBeUndefined();
  });
});

/* ------------------------------------------------------------- the check --- */

describe("what a manifest may not put on a price list", () => {
  /*
    ⚠️ A PLAN NAMING A KEY NOBODY DECLARED IS SOLD, PAID FOR, AND ENFORCED BY
    NOTHING — and it looks exactly like a capability that happens to be generous.
  */
  it("refuses a plan selling a key this app does not declare", () => {
    const problems = marketProblems([plan("odd", { ghosts: true })], declared);
    expect(problems.map((p) => p.why).join()).toMatch(/ghosts/);
  });

  it("refuses a plan with nothing to call it", () => {
    expect(marketProblems([{ ...free, name: "  " }], declared).map((p) => p.why).join()).toMatch(/no name/);
  });

  it("accepts a catalogue that only sells what is declared", () => {
    expect(marketProblems([free, keeper], declared)).toEqual([]);
  });
});
