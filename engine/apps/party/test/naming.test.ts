/**
 * THE VOCABULARY, AGAINST THE REAL WORLD.
 *
 * ⚠️ THE TAX-NAME CASES ARE THE ONES WORTH HAVING. A product that calls an
 * Emirati company's TRN a "VAT number" is wrong in a way nobody reports as a
 * bug — they just retype it into their accountant's form and think less of the
 * software.
 */

import { describe, expect, it } from "vitest";
import {
  ROLES, TAX_NAME, alreadyThere, narrowed, rolesOf, sameParty, saysRoles, taxNameFor,
  type Party,
} from "../src/naming.js";

const of = (over: Partial<Party> = {}): Party =>
  ({ name: "Acme Ltd", kind: "organisation", ...over });

describe("what a tax identifier is called", () => {
  it("uses the local name where there is one", () => {
    expect(taxNameFor("AE")).toBe("TRN");
    expect(taxNameFor("IN")).toBe("GSTIN");
    expect(taxNameFor("US")).toBe("EIN");
    expect(taxNameFor("AU")).toBe("ABN");
  });

  it("reads a country in any case", () => {
    expect(taxNameFor("ae")).toBe("TRN");
    expect(taxNameFor(" In ")).toBe("GSTIN");
  });

  /* ⚠️ THE FALLBACK IS THE FEATURE. A lookup that refused an unknown country
     would be a product that cannot be sold in one. */
  it("answers for a country it has never heard of", () => {
    expect(taxNameFor("ZZ")).toBe(TAX_NAME);
    expect(taxNameFor(null)).toBe(TAX_NAME);
    expect(taxNameFor(undefined)).toBe(TAX_NAME);
    expect(taxNameFor("")).toBe(TAX_NAME);
  });

  it("says VAT number where most of the world does", () => {
    expect(taxNameFor("DE")).toBe(TAX_NAME);
    expect(taxNameFor("GB")).toBe(TAX_NAME);
    expect(taxNameFor("SA")).toBe(TAX_NAME);
  });
});

describe("the roles a party holds", () => {
  it("reads them in one order however they were set", () => {
    expect(rolesOf(of({ supplier: true, customer: true }))).toEqual(["customer", "supplier"]);
  });

  /* ⚠️ THE WHOLE POINT OF B3: one row, both roles, no second record. */
  it("lets one party be a customer and a supplier at once", () => {
    expect(rolesOf(of({ customer: true, supplier: true, worker: true }))).toEqual([...ROLES]);
  });

  it("says so plainly when a party holds none", () => {
    expect(rolesOf(of())).toEqual([]);
    expect(saysRoles(of())).toBe("No role yet");
  });

  it("names the roles it does hold", () => {
    expect(saysRoles(of({ customer: true, supplier: true }))).toBe("Customer · Supplier");
  });
});

describe("narrowing a company name", () => {
  it("takes off case, spacing and punctuation", () => {
    expect(narrowed("ACME  LTD.")).toBe(narrowed("acme ltd"));
  });

  it("takes off the suffix that says what kind of company it is", () => {
    expect(narrowed("Acme Ltd")).toBe("acme");
    expect(narrowed("Acme GmbH")).toBe("acme");
    expect(narrowed("Acme Pte Ltd")).toBe("acme");
  });

  /* ⚠️ A NAME THAT IS ONLY A SUFFIX NARROWS TO NOTHING, and `sameParty` treats
     that as no name at all rather than as a match with every other empty one. */
  it("narrows a name made only of suffixes to nothing", () => {
    expect(narrowed("Ltd")).toBe("");
  });

  it("keeps a name that is not latin", () => {
    expect(narrowed("شركة الأمل")).toBe("شركة الأمل");
  });
});

describe("whether two rows are one company", () => {
  /* ⚠️ PROOF BEATS RESEMBLANCE, IN BOTH DIRECTIONS. */
  it("calls two rows with one tax number the same, however they are named", () => {
    expect(sameParty(
      of({ name: "Acme Ltd", taxId: "GB123 456 789" }),
      of({ name: "Something Else", taxId: "gb123456789" }),
    )).toBe("same");
  });

  it("calls two rows with different tax numbers different, however alike", () => {
    expect(sameParty(
      of({ name: "Acme Ltd", taxId: "GB1" }),
      of({ name: "Acme Limited", taxId: "GB2" }),
    )).toBe("different");
  });

  /* ⚠️ "MAYBE" IS THE PRODUCT. It is what asks somebody at the moment they are
     typing a name the book has already seen. */
  it("says maybe when the names match and one side has no number", () => {
    expect(sameParty(of({ name: "Acme Ltd" }), of({ name: "acme limited" }))).toBe("maybe");
    expect(sameParty(of({ name: "Acme Ltd", taxId: "GB1" }), of({ name: "ACME" }))).toBe("maybe");
  });

  it("says different when neither the number nor the name matches", () => {
    expect(sameParty(of({ name: "Acme" }), of({ name: "Beta" }))).toBe("different");
  });

  it("never matches two rows that have no usable name", () => {
    expect(sameParty(of({ name: "Ltd" }), of({ name: "GmbH" }))).toBe("different");
  });
});

describe("what the book already holds", () => {
  const book = [
    of({ name: "Beta Ltd", taxId: "GB2" }),
    of({ name: "Acme Limited" }),
    of({ name: "Acme Ltd", taxId: "GB1" }),
  ];

  it("puts a proven match above a resemblance", () => {
    const found = alreadyThere(book, of({ name: "Nothing Like It", taxId: "GB1" }));
    expect(found.map((one) => one.how)).toEqual(["same"]);
    expect(found[0]?.party.name).toBe("Acme Ltd");
  });

  it("offers every resemblance when there is nothing to prove", () => {
    const found = alreadyThere(book, of({ name: "ACME" }));
    expect(found.map((one) => one.party.name)).toEqual(["Acme Limited", "Acme Ltd"]);
    expect(found.every((one) => one.how === "maybe")).toBe(true);
  });

  it("says nothing about a party the book has never seen", () => {
    expect(alreadyThere(book, of({ name: "Gamma" }))).toEqual([]);
  });
});
