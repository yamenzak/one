/**
 * THE MANIFEST COMPOSES, AND THE DECISIONS THAT MAKE IT INTERNATIONAL SURVIVE.
 *
 * ⚠️ `defineApp` RUNS EVERY REFUSAL, so the first test is the whole composition
 * suite asserted by the fact that building it does not throw.
 *
 * ⚠️ THE REST GUARD THE THREE THINGS THAT COULD BE UNDONE WITHOUT ANYTHING ELSE
 * FAILING: the role field staying editable, the type field staying settled, and
 * the seed staying refusable a second time.
 */

import { describe, expect, it } from "vitest";
import { oneBook } from "../src/index.js";
import { CHARTS } from "../src/charts.js";
import { ROLES, ROOTS } from "../src/roles.js";
import { RULES, refuseRule } from "../src/posting.js";

const app = oneBook();
const of = (id: string) => app.collections.find((one) => one.id === id);
const fields = of("account")?.fields ?? {};

describe("OneBook's manifest", () => {
  it("composes", () => {
    expect(app.id).toBe("book");
    expect(app.name).toBe("OneBook");
  });

  /*
    ⚠️ THE ROLE MOVES AND THE KIND DOES NOT, AND THAT PAIR IS THE WHOLE DESIGN.
    Moving a role is the lever a workspace uses to make the books post where it
    wants; moving an account from asset to expense after anything has posted
    moves money between two statements with no write near a figure.
  */
  it("lets the role move and pins the kind", () => {
    expect(fields.role?.settled).toBeUndefined();
    expect(fields.type?.settled).toBe(true);
  });

  it("offers every root and every role on the record", () => {
    expect(fields.type?.values).toEqual([...ROOTS]);
    expect(fields.role?.values).toEqual([...ROLES]);
  });

  /* ⚠️ CLOSED RATHER THAN DELETED — last year's figures were made of it. */
  it("can close an account rather than only delete one", () => {
    expect(fields.closed?.kind).toBe("bool");
  });

  /*
    ⚠️ NOT SHARED, AND THAT IS DELIBERATE. Nothing outside OneBook names an
    account — a posting rule names a role — so sharing it would be a promise to
    keep a shape stable for nobody.
  */
  it("keeps the account table to itself", () => {
    expect(of("account")?.shared).toBeUndefined();
  });

  /* ⚠️ A CHART IS THIRTY ROWS. A ceiling on it would be a workspace that cannot
     describe its own money — see the manifest's own note. */
  it("meters nothing", () => {
    expect(app.entitlements).toEqual({});
    expect(of("account")?.quota).toBeUndefined();
  });
});

describe("opening the books", () => {
  const start = app.operations.find((one) => one.id === "book.start");

  it("offers every shipped chart, by name", () => {
    expect(start?.input.chart?.values).toEqual(CHARTS.map((one) => one.id));
    expect(start?.input.chart?.labels?.universal).toBe("Plain");
  });

  /*
    ⚠️ THE REFUSAL THAT PROTECTS TWO YEARS OF POSTINGS. A template that can be
    applied twice can be applied over a chart somebody has been using, and the
    second application would look like a successful setup.
  */
  it("can refuse a second seed", () => {
    expect(start?.fails).toContain("book.already_open");
    expect(app.problems?.["book.already_open"]?.title).toContain("already open");
  });

  it("is reached by a flow rather than a settings screen", () => {
    const flow = app.screens.find((one) => one.id === "start-the-book");
    const story = (flow as { story?: { writes?: string; lands?: string } })?.story;
    expect(story?.writes).toBe("book.start");
    expect(story?.lands).toBe("accounts");
  });
});

describe("topping the chart up", () => {
  const extend = app.operations.find((one) => one.id === "book.extend");

  /*
    ⚠️ ADDITIVE ONLY, AND THE INPUT BEING EMPTY IS HALF OF WHY. There is nothing
    to pass it: no account to name, no field to overwrite, no template to force.
    An operation that took a chart id could be pointed at somebody else's country
    a year into posting.
  */
  it("takes nothing, so there is nothing to point it at", () => {
    expect(extend?.input).toEqual({});
  });

  it("reads which chart the workspace actually started from", () => {
    expect(app.settings?.["book.chart"]).toBeTruthy();
  });

  it("refuses on a workspace whose books were never opened", () => {
    expect(extend?.fails).toContain("book.not_open");
  });
});

/* --------------------------------------------------------------- the ledger --- */

describe("the journal", () => {
  /*
    ⚠️ ONE SIGNED COLUMN — see `posting.ts`. Two stored columns can disagree with
    themselves (a row with both filled is a real defect in real systems and needs
    a check nobody writes); one cannot. The screens draw two columns from the sign.
  */
  it("stores one signed amount rather than a debit and a credit", () => {
    const line = of("posting")?.fields ?? {};
    expect(line.amount?.kind).toBe("money");
    expect(line.debit).toBeUndefined();
    expect(line.credit).toBeUndefined();
  });

  /* ⚠️ NO STORED BALANCE ANYWHERE (B2, and D119 one domain over). A total that
     can disagree with the lines under it is what grows a repair subsystem. */
  it("stores no balance on an account", () => {
    const fields = of("account")?.fields ?? {};
    for (const wrong of ["balance", "total", "debits", "credits", "opening"]) {
      expect(fields[wrong]).toBeUndefined();
    }
  });

  /*
    ⚠️ THE DAY IT BELONGS TO IS NOT THE DAY IT WAS TYPED. A bookkeeper posts
    Friday's invoice on Monday and the reports are about Friday; the platform's
    own `at` records the second thing.
  */
  it("dates an entry by the day it belongs to", () => {
    expect(of("journal")?.fields.day?.kind).toBe("day");
  });

  /* ⚠️ B1: OneBook may not point at another product's tables, so what it keeps
     is the identifier it was told — enough to look up, not enough to couple. */
  it("keeps another product's reference as a string, never a ref", () => {
    expect(of("journal")?.fields.ref?.kind).toBe("text");
    expect(of("journal")?.fields.source?.kind).toBe("text");
  });

  it("refuses an entry that does not balance, by its own name", () => {
    const op = app.operations.find((one) => one.id === "journal.post");
    expect(op?.fails).toContain("book.unbalanced");
    expect(op?.fails).toContain("book.no_account");
  });

  /*
    ⚠️ SHAPING THE CHART AND POSTING TO IT ARE DIFFERENT GRANTS. Somebody entering
    the week's invoices posts all day and must never be able to move what an
    account is FOR.
  */
  it("separates posting from shaping the chart", () => {
    expect(app.access.permissions).toContain("journal:write");
    expect(app.access.permissions).toContain("account:write");
    expect(app.access.roles.user).toContain("journal:write");
    expect(app.access.roles.user).not.toContain("account:write");
  });
});

describe("what OneBook hears", () => {
  /*
    ⚠️ ONEINVENTORY KNOWS NOTHING ABOUT ANY OF THIS. It raises the event it always
    raised; this app declares it listens. A workspace without OneBook leaves the
    event unheard, which is the ordinary case rather than a fault.
  */
  it("listens for the delivery, and says why in a sentence", () => {
    expect(Object.keys(app.hears ?? {})).toEqual(["buying.received"]);
    expect(app.hears?.["buying.received"]?.why).toContain("delivery");
  });

  /* ⚠️ NO IMPORT ANYWHERE — the seam is three declarations (D120). The guard
     that enforces it is `apps.test.mjs`; this is the app's own statement. */
  it("names the event it hears and nothing else of the other product", () => {
    expect(app.hears?.["buying.received"]).toBeTruthy();
    expect(app.collections.map((one) => one.id)).not.toContain("buying");
  });
});

describe("the posting rules", () => {
  it("ships rules that would pass their own check", () => {
    for (const one of RULES) expect(refuseRule(one)).toBeNull();
  });

  /*
    ⚠️ ONE RULE, AND THE COUNT IS HONEST. It is the only event in this deployment
    whose ANSWER carries money — see `RULES` for what is absent and why each
    absence would be WRONG rather than merely missing.
  */
  it("ships only rules for events that carry a figure", () => {
    expect(RULES.map((one) => one.event)).toEqual(["buying.received"]);
  });

  it("names roles rather than accounts, so the chart is the lever", () => {
    for (const one of RULES) {
      for (const side of one.sides) expect(ROLES).toContain(side.role);
    }
  });

  /* ⚠️ OFF IS A FIRST-CLASS ANSWER — a workspace whose accountant posts
     purchases by hand turns it off and nothing else changes. */
  it("can be turned off", () => {
    expect(of("posting-rule")?.fields.enabled?.kind).toBe("bool");
  });
});

/* ---------------------------------------------------------- what it comes to --- */

describe("the trial balance", () => {
  /*
    ⚠️ ASKED RATHER THAN NARROWED, AND THAT IS THE WHOLE OF B2'S CLAIM SURVIVING
    CONTACT WITH A SCREEN. A balance is a SUM and will never be a column, so a
    view that could only match rows could list the postings and never say what
    they come to.
  */
  it("asks an operation rather than matching rows", () => {
    const asked = app.views?.filter((one) => one.asked) ?? [];
    expect(asked.map((one) => one.id).sort())
      .toEqual(["centre-totals", "standing-here", "trial-lines", "trial-total"]);
  });

  /* ⚠️ ONE SUM, ASKED TWO WAYS — never a second answer computed in a browser.
     Two narrowings of one question drift the first time either is edited. */
  it("uses one operation for the whole ledger and one for a single account", () => {
    expect(app.operations.find((one) => one.id === "book.trial")).toBeTruthy();
    expect(app.operations.find((one) => one.id === "book.standing")).toBeTruthy();
  });

  it("is a destination, because it is the check somebody comes to make", () => {
    const screen = app.screens.find((one) => one.id === "trial");
    expect(screen?.nav).toBe("primary");
    expect(screen?.permission).toBe("journal:read");
  });
});

describe("the nightly sweep", () => {
  /*
    ⚠️ IT EXISTS BECAUSE `hears` CANNOT SPEAK. A posting raised by an event has no
    session, no screen and no notification seam — so money landing in suspense
    leaves a row nobody is looking at, on books that balance, with every screen
    green. That is the one genuinely dangerous silence in this product.
  */
  it("is the voice the hears seam does not have", () => {
    expect(app.jobs?.["book.suspense"]).toBeTruthy();
    expect(app.jobs?.["book.suspense"]?.emits).toEqual(["book.suspended"]);
  });

  it("tells somebody, with the figure in the line", () => {
    const told = app.notifications?.["book.suspended"];
    expect(told?.on).toBe("book.suspended");
    expect(told?.summary).toContain("{amount}");
    expect(told?.variables).toContain("amount");
  });

  /* ⚠️ THE AUDIENCE IS A PERMISSION, NEVER A ROLE — a workspace that invents a
     role of its own must still be told. */
  it("addresses a permission rather than a role", () => {
    expect(app.notifications?.["book.suspended"]?.needs).toBe("journal:read");
  });

  /* ⚠️ AND THE LINK IS A DECLARED ROUTE. A notification that outlived its screen
     is a row in an inbox that leads nowhere, on a day something happened. */
  it("leads somewhere that exists", () => {
    const where = app.notifications?.["book.suspended"]?.link;
    expect(app.screens.map((one) => one.route)).toContain(where);
  });
});

/**
 * THE TWO DOCUMENTS, AND THE ONE DIFFERENCE BETWEEN THEM.
 *
 * ⚠️ EVERY ASSERTION HERE IS A DECLARATION THAT WOULD BE UNDONE SILENTLY. Giving
 * an invoice a cancel makes a document a customer holds withdrawable; taking a
 * bill's away makes a wrong record permanent; and dropping either `undo` leaves
 * the ledger holding a purchase the workspace decided never happened. None of
 * the three fails anything else — the app still composes, every screen draws,
 * and the fault surfaces in a figure somebody cannot explain.
 */
describe("the invoice and the bill", () => {
  const sale = of("sale");
  const bill = of("bill");

  /* ⚠️ THE CUSTOMER HOLDS IT AND THE NUMBER IS SPENT, so the way out is a credit
     note and the kernel is told which. */
  it("refuses to cancel an invoice, and names the way out", () => {
    const cancel = sale?.document?.cancel;
    if (cancel?.by !== "refusing") throw new Error("an invoice must refuse cancellation");
    expect(cancel.instead).toContain("credit note");
    /* ⚠️ AND AMENDING FOLLOWS, because an amendment is a cancellation and a
       fresh draft — a document refusing the first cannot offer the second. */
    expect(sale?.document?.amendable).toBe(false);
  });

  /* ⚠️ NOBODY OUTSIDE THIS WORKSPACE HAS SEEN A BILL, so getting it wrong is a
     mistake to withdraw rather than a fact to correct with a second document. */
  it("lets a bill be withdrawn", () => {
    expect(bill?.document?.cancel?.by).toBeUndefined();
  });

  /* ⚠️ AND THE ASYMMETRY REACHES THE HANDLERS, which is the half that moves
     money. An invoice needs no reversal and a bill cannot ship without one. */
  it("gives the reversal to the document that can be withdrawn, and only that one", () => {
    expect(app.postings?.["sale.posted"]?.undo).toBeUndefined();
    expect(app.postings?.["bill.posted"]?.undo).toBeTypeOf("function");
  });

  it("posts both through a rule that is declared", () => {
    for (const one of [sale, bill]) {
      for (const p of one?.document?.posts ?? []) {
        expect(app.postings?.[p.rule]?.post).toBeTypeOf("function");
        expect(app.postings?.[p.rule]?.may).toBeTypeOf("function");
      }
    }
  });

  /* ⚠️ THEIR NUMBER IS SEARCHABLE, because that is what a supplier quotes on a
     statement and in every chasing email. Ours orders our own records. */
  it("finds a bill by the supplier's own number", () => {
    expect(bill?.searchable).toContain("theirs");
  });

  /* ⚠️ AND NOT UNIQUE: two suppliers may both call something INV-1, and refusing
     that would refuse a real bill over a coincidence in somebody else's
     numbering. */
  it("does not make the supplier's number required", () => {
    expect(bill?.fields.theirs?.required).toBeUndefined();
  });
});
