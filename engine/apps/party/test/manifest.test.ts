/**
 * THE MANIFEST COMPOSES, AND THE THINGS THAT MAKE IT A SHARED RECORD ARE STILL
 * DECLARED.
 *
 * ⚠️ `defineApp` RUNS EVERY REFUSAL, so the first test here is the whole
 * composition suite — the collections walk, reachability, the roles walk and the
 * ladder — asserted by the fact that building it does not throw.
 *
 * ⚠️ THE REST ARE THE DECLARATIONS ANOTHER APP DEPENDS ON. `shared` on `party`
 * is what lets OneInventory borrow it; losing it would not fail anything here,
 * it would fail the day something else asked.
 */

import { describe, expect, it } from "vitest";
import { oneParty } from "../src/index.js";

const app = oneParty();
const of = (id: string) => app.collections.find((one) => one.id === id);

describe("OneParty's manifest", () => {
  it("composes", () => {
    expect(app.id).toBe("party");
    expect(app.name).toBe("OneParty");
  });

  /* ⚠️ THE ONE DECLARATION THE WHOLE PRODUCT EXISTS FOR (D120). */
  it("shares the party record, so another app may borrow it", () => {
    expect(of("party")?.shared).toBe(true);
  });

  it("keeps the phone numbers behind their own permission", () => {
    expect(of("contact")?.permission).toBe("contact");
    expect(of("party")?.permission).toBe("party");
  });

  /* ⚠️ THE ROLES ARE INDEPENDENT, WHICH IS B3. Three booleans rather than one
     choice: the row holding two of them is the row this product was built for. */
  it("lets one record hold every role at once", () => {
    const fields = of("party")?.fields ?? {};
    for (const role of ["customer", "supplier", "worker"]) {
      expect(fields[role]?.kind).toBe("bool");
    }
  });

  /* ⚠️ ONE COLUMN, MANY NAMES — see `naming.ts`. A second tax field would be the
     first of one per country. */
  it("holds one tax number and one country", () => {
    const fields = of("party")?.fields ?? {};
    expect(fields.taxId?.kind).toBe("text");
    expect(fields.country?.max).toBe(2);
    expect(Object.keys(fields).filter((name) => /vat|gst|tin|ein/i.test(name))).toEqual([]);
  });

  /*
    ⚠️ AN ADDRESS IS LINES AND A COUNTRY, NOT A FORM. `state`, `street` and `zip`
    are one country's postal shape imposed on every other — see the collection's
    own header — and this is what stops the first of them being added.
  */
  it("asks for an address the way the post office there wants it", () => {
    const fields = of("address")?.fields ?? {};
    expect(fields.lines?.kind).toBe("long");
    expect(fields.country?.max).toBe(2);
    for (const wrong of ["state", "street", "zip", "county", "province"]) {
      expect(fields[wrong]).toBeUndefined();
    }
  });

  /* ⚠️ THE PARKING ROW IS WHY THERE IS A CEILING AT ALL — see the manifest. */
  it("counts parties, and meters nothing that hangs off one", () => {
    expect(app.entitlements.parties?.withheld).toBe("quota");
    expect(of("party")?.quota).toBe("parties");
    expect(of("contact")?.quota).toBeUndefined();
    expect(of("address")?.quota).toBeUndefined();
  });
});

/*
  ⚠️ THE FLOW IS WHAT MAKES THE SETTINGS LIVE, and both halves are asserted here
  because either can be removed without anything else failing. A `starts` entry
  naming a setting that was deleted is a prefill that silently stops arriving; a
  setting nothing names is caught by the gate, but only after somebody has looked.
*/
describe("adding a party", () => {
  const flow = app.screens.find((one) => one.id === "add-a-party");
  const story = (flow as { story?: {
    writes?: string;
    starts?: Record<string, string>;
    asks?: readonly { id: string }[];
  } })?.story;

  it("writes through the operation that checks for a duplicate", () => {
    expect(story?.writes).toBe("party.register");
  });

  /* ⚠️ THE WORKSPACE'S OWN ANSWERS, NOT THIS FILE'S. */
  it("starts every step the workspace has already answered", () => {
    expect(story?.starts).toEqual({
      country: "party.home_country",
      paysWithin: "party.they_pay_within",
      paidWithin: "party.we_pay_within",
    });
  });

  /* ⚠️ THE COUNTRY BEFORE THE NUMBER — what a tax identifier is CALLED depends
     on where the party is registered, so the reverse order asks somebody to fill
     a box the product cannot yet name. */
  it("asks where they are registered before it asks for the number", () => {
    const asked = (story?.asks ?? []).map((step) => step.id);
    expect(asked).toEqual(["named", "roles", "registered", "reached"]);
  });
});

describe("the duplicate check", () => {
  const op = app.operations.find((one) => one.id === "party.register");

  /*
    ⚠️ TWO REFUSALS, AND COLLAPSING THEM WOULD BE THE BUG. Proof cannot be
    overridden and a resemblance must be — one sentence for both would either
    let two rows share a tax number or refuse two companies genuinely called the
    same thing.
  */
  it("refuses proof and resemblance differently", () => {
    expect(op?.fails).toContain("party.already");
    expect(op?.fails).toContain("party.resembles");
    expect(app.problems?.["party.resembles"]?.title).toContain("{name}");
  });

  /* ⚠️ `anyway` IS THE PERSON OVERRIDING A RESEMBLANCE. Without it the check is
     a refusal somebody cannot get past, which is how a safety feature becomes a
     second book kept in a spreadsheet. */
  it("lets somebody who knows better press on", () => {
    expect(op?.input.anyway?.kind).toBe("bool");
  });
});
