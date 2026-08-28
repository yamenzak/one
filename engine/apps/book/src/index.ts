/**
 * ONEBOOK — THE BOOKS, IN ANY COUNTRY.
 *
 * ⚠️ A POSTING RULE NAMES A ROLE, NEVER AN ACCOUNT, AND THAT IS THE WHOLE
 * INTERNATIONAL DESIGN. `roles.ts` holds them; `charts.ts` holds the
 * templates that tag them. A German workspace tags `1400 Forderungen aus L+L`
 * `receivable`, a British one tags `Trade debtors`, and a workspace that threw
 * the template away tags whatever it built — and the posting code is identical.
 *
 * ⚠️ WHICH IS WHY AN UNVERIFIED TEMPLATE IS SAFE TO SHIP AND STILL HAS TO SAY SO.
 * A template we got wrong gives a workspace unconventional names and CORRECT
 * BOOKS — an afternoon of renaming rather than a migration. What would not be
 * safe is implying an accountant in that country signed it off, so `verified`
 * is on every chart and the screen that offers them reads it.
 *
 * ⚠️ THE CHART IS THE EASY FIFTH OF INTERNATIONALISATION. Eighty rows of data is
 * not what makes a business system need a code branch per country; tax is. That
 * is a rule keyed by what, to whom, from where, to where and when — and it is
 * not this file. See `docs/BUSINESS.md`.
 *
 * ⚠️ AND NOTHING HERE POSTS ANYTHING YET. This stage builds the chart and the
 * two operations that fill it. The journal, the posting rules and the reports
 * arrive over the `hears` seam in the stage after — which is the right order,
 * because a posting rule with no chart to name has nothing to be right about.
 */

import {
  area, collection, defineApp, field, job as declareJob, newId, operation, setting,
  type AppSpec, type DocumentMove,
} from "@engine/kernel";

import { CHARTS, chartById, chartFor } from "./charts.js";
import { ROLES, ROOTS, missing, rowsOf, type Held, type Node, type Role } from "./roles.js";
import {
  RULES, fire, refuseEntry, type Line, type Rule,
} from "./posting.js";
import {
  closingLines, monthsIn, refusePeriod, refusePostingOn, refuseYear,
  type Period, type PostRefusal, type Standing as AccountStanding, type Year,
} from "./periods.js";
import { refusePlacing, rollUp, within, type Centre } from "./dimensions.js";
import {
  RATE_SCALE, inBase, inBaseLines, refuseRate, revalueLines, unrated, type Holding,
} from "./money.js";
import {
  RATE_BASIS, chargeOf, entryFor, refuseItems, type Item, type Way,
} from "./invoice.js";

/* ------------------------------------------------------------------ shapes --- */

interface Db {
  prepare(q: string): {
    bind(...v: unknown[]): {
      run(): Promise<{ meta?: { changes?: number } }>;
      first<T = unknown>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
    };
  };
}

interface Ctx {
  readonly db: unknown;
  readonly tenantId: string;
  /** ⚠️ What this workspace's money is in — see `Ctx.currency` in the runtime. */
  readonly currency: string;
  readonly accountId?: string;
  readonly now: string;
  fail(
    code: string,
    values?: Record<string, string>,
    extra?: { fields?: Record<string, string>; ref?: string },
  ): never;
  setting(id: string): Promise<unknown>;
}

/* ------------------------------------------------------------ collections --- */

/**
 * ONE ACCOUNT.
 *
 * ⚠️ NOT `shared`, DELIBERATELY. Nothing outside OneBook ever needs to name an
 * account: a posting rule names a role and the rule is OneBook's own. Marking it
 * shared would publish a table no other product has any business pointing at,
 * and `shared` is a promise to keep a shape stable for somebody — a promise with
 * no one on the other end is a constraint bought for nothing.
 *
 * ⚠️ AND NO QUOTA. A chart is thirty rows. Metering it would price the one thing
 * a business must be allowed to shape freely, and a workspace that hit the
 * ceiling would be a workspace that cannot describe its own money.
 */
const account = collection({
  id: "account",
  label: { one: "Account", many: "Accounts" },
  scope: { of: "tenant" },
  permission: "account",
  retention: null,
  onClose: { then: "purge" },
  /* ⚠️ FOUND BY NAME AND BY NUMBER, because half the world's bookkeepers think
     in numbers and the other half have never seen one. */
  searchable: ["name", "code"],
  names: "name",
  fields: {
    name: field.text({ label: "Name", required: true, holds: "none", max: 160 }),
    /*
      ⚠️ OPTIONAL, AND NEVER READ BY A POSTING RULE. France's Plan Comptable
      Général prescribes account numbers by law; Germany's SKR conventions are
      followed by everybody; the United Kingdom and the United States prescribe
      nothing. Shipping the numbers where they exist is help — depending on them
      would make the two halves of the world different code.
    */
    code: field.text({
      label: "Number", holds: "none", max: 24,
      help: "Optional. Some countries prescribe them, most do not.",
    }),
    /*
      ⚠️ `settled`, AND IT IS THE SHARPEST RULE ON THIS RECORD. Moving an account
      from asset to expense after anything has posted to it moves money from the
      balance sheet to the profit-and-loss — silently, with no write anywhere near
      a figure, and every statement afterwards balancing perfectly and being
      wrong. An account on the wrong side is closed and a new one opened.
    */
    type: field.enum({
      label: "Kind", required: true, holds: "none", settled: true,
      values: [...ROOTS],
      help: "Where it appears: the balance sheet, or the profit and loss.",
    }),
    /*
      ⚠️ THE ROLE IS THE ONE FIELD A POSTING RULE READS, AND IT MOVES. That is
      the lever the whole design rests on: a workspace that decides sales should
      land somewhere else changes this on one row and every future posting
      follows. It is deliberately NOT `settled` for exactly that reason.
    */
    role: field.enum({
      label: "Used for", holds: "none",
      values: [...ROLES],
      help: "What the books post here automatically. One account per job.",
    }),
    /*
      ⚠️ WHOSE MONEY THIS ACCOUNT HOLDS, AND EMPTY IS THE WORKSPACE'S OWN. A
      dollar bank account in a dirham business is one row with `USD` here — and
      what makes that meaningful is `posting.original`, which keeps what is
      actually IN it beside what the books say it was worth.

      ⚠️ `settled`, FOR `type`'s REASON ONE STEP OVER. Changing the currency of an
      account that has anything in it reinterprets every posting already against
      it: the same integers now mean dollars instead of dirhams, every balance is
      out by the rate, and nothing was written anywhere near a figure. An account
      in the wrong currency is closed and a new one opened.
    */
    currency: field.text({
      label: "Currency", holds: "none", max: 3, settled: true,
      help: "Three letters. Leave empty for the workspace's own.",
    }),
    parent: field.ref({ label: "Under", holds: "none", to: "account" }),
    /*
      ⚠️ CLOSED RATHER THAN DELETED, AND THE DIFFERENCE IS A REPORT WITH A HOLE
      IN IT. An account with postings against it can never go away — last year's
      figures were made of it — so what "we do not use this any more" means is
      that nothing new may land here.
    */
    closed: field.bool({ label: "Closed to new postings", holds: "none" }),
    note: field.long({ label: "Note", holds: "none", max: 1_000 }),
  },
});

/**
 * THE YEAR THE BOOKS ARE KEPT IN.
 *
 * ⚠️ NOT JANUARY TO DECEMBER — see `periods.ts`. The United Kingdom's companies
 * commonly run to March or April, Australia's to June, Japan's to March, and a
 * business may pick its own. A calendar year assumed here would put a chunk of
 * every profit-and-loss in the wrong one, for most of the world.
 *
 * ⚠️ AND CLOSING IT POSTS SOMETHING. A year that is only a flag is hidden rather
 * than closed: what makes the next year's report start at zero is that income
 * and expense were emptied into reserves in one entry. `closingLines` is that
 * entry and `year.close` writes it.
 */
const year = collection({
  id: "year",
  label: { one: "Year", many: "Years" },
  scope: { of: "tenant" },
  permission: "year",
  retention: null,
  /* ⚠️ KEPT PAST THE WORKSPACE, like every other part of the record of what was
     filed. A closed year is the shape of a return somebody sent to a tax
     authority, and that does not stop having happened. */
  onClose: { then: "keep", why: "the shape of what was filed, which outlives the business" },
  names: "name",
  fields: {
    name: field.text({ label: "Name", required: true, holds: "none", max: 60 }),
    /* ⚠️ `settled`, BOTH OF THEM. Moving the boundary of a year that has anything
       posted in it moves entries between two profit-and-loss statements — one of
       which may already have been filed — with no write anywhere near a figure
       and every report afterwards balancing perfectly and being wrong. */
    opens: field.day({ label: "First day", required: true, holds: "none", settled: true }),
    closes: field.day({ label: "Last day", required: true, holds: "none", settled: true }),
    closed: field.bool({ label: "Closed", holds: "none" }),
  },
});

/**
 * A PERIOD INSIDE A YEAR — usually a month.
 *
 * ⚠️ OPTIONAL, AND THAT IS THE POINT. A business whose accountant does the books
 * once a year never makes one; a business closing every month makes twelve.
 * Requiring them would put eleven rows of ceremony in front of somebody who
 * wanted to record a sale.
 */
const period = collection({
  id: "period",
  label: { one: "Period", many: "Periods" },
  scope: { of: "tenant" },
  permission: "year",
  retention: null,
  onClose: { then: "keep", why: "which months were signed off, and when" },
  names: "name",
  fields: {
    year: field.ref({ label: "Year", required: true, holds: "none", to: "year", settled: true }),
    name: field.text({ label: "Name", required: true, holds: "none", max: 60 }),
    opens: field.day({ label: "First day", required: true, holds: "none", settled: true }),
    closes: field.day({ label: "Last day", required: true, holds: "none", settled: true }),
    /* ⚠️ SHUT RATHER THAN CLOSED, so the word is not the year's. A shut period
       refuses new postings and nothing else; a closed year has had its profit
       moved and cannot be reopened without reversing that. */
    shut: field.bool({ label: "Shut", holds: "none" }),
  },
});

/**
 * WHICH PART OF THE BUSINESS A FIGURE BELONGS TO.
 *
 * ⚠️ THE CHART ANSWERS "WHAT" AND NOTHING IN IT ANSWERS "WHERE" — see
 * `dimensions.ts`. Rent is rent whether it was the shop's or the workshop's, so
 * a business with two branches needs both figures out of one ledger. An account
 * per branch is the answer that looks obvious and multiplies the chart by the
 * branches.
 *
 * ⚠️ AND THIS IS WHY A BRANCH IS NOT A SECOND WORKSPACE (D127). One workspace is
 * one company: one chart, one year end, one return. Branches of that company are
 * a column on the posting, and giving each one its own workspace would give one
 * legal entity several ledgers that can never be added up.
 *
 * ⚠️ IT IS ALSO A DEPARTMENT, A PROJECT OR A VAN, and the label says "Cost
 * centre" because that is what an accountant will look for. What a workspace
 * actually puts in it is theirs.
 */
const centre = collection({
  id: "centre",
  label: { one: "Cost centre", many: "Cost centres" },
  scope: { of: "tenant" },
  /* ⚠️ THE CHART'S OWN GRANT, BECAUSE THIS IS THE SAME KIND OF DECISION. Which
     centres exist is how the business is measured, like which accounts do —
     and somebody entering the week's invoices names one all day without ever
     being able to invent one. */
  permission: "account",
  retention: null,
  onClose: { then: "purge" },
  searchable: ["name", "code"],
  names: "name",
  fields: {
    name: field.text({ label: "Name", required: true, holds: "none", max: 120 }),
    code: field.text({ label: "Code", holds: "none", max: 24 }),
    /* ⚠️ A NODE POINTS AT ITS PARENT AND A ROOT IS THE ROW WITH NONE. The engine
       refuses a ring here (`treeFieldsOf`), so nothing in this app has to. */
    parent: field.ref({ label: "Under", holds: "none", to: "centre" }),
    /* ⚠️ CLOSED RATHER THAN DELETED, for the account's reason one axis over: a
       branch that shut is still in last year's figures, and what "we do not use
       this any more" means is that nothing new may land here. */
    closed: field.bool({ label: "Closed to new postings", holds: "none" }),
    note: field.long({ label: "Note", holds: "none", max: 1_000 }),
  },
});

/**
 * ONE ENTRY IN THE JOURNAL — the header, and its lines are below.
 *
 * ⚠️ THE JOURNAL IS THE PRIMITIVE, NOT A BALANCE (B2). A wallet holds a figure;
 * accounting holds balanced entries and DERIVES every figure from them by adding
 * lines up. Storing a running total means storing a number that can disagree with
 * what it is made of, and every system that stores one grows a subsystem to
 * repair it. It is D119's rule one domain over: derived, never accumulated.
 */
const journal = collection({
  id: "journal",
  label: { one: "Entry", many: "Journal" },
  scope: { of: "tenant" },
  permission: "journal",
  retention: null,
  onClose: { then: "purge" },
  searchable: ["memo"],
  names: "memo",
  fields: {
    /* ⚠️ THE DAY IT BELONGS TO, WHICH IS NOT THE DAY IT WAS TYPED. A bookkeeper
       posts Friday's invoice on Monday, and the reports are about Friday. The
       platform's own `at` records when the row was written. */
    day: field.day({ label: "Date", required: true, holds: "none" }),
    memo: field.text({ label: "What it was", required: true, holds: "none", max: 200 }),
    /*
      ⚠️ WHICH EVENT RAISED IT, OR NOTHING FOR AN ENTRY SOMEBODY TYPED. This is
      the field that answers "why is this account moving" — the question B2 says
      a person should be able to ask on a screen rather than by reading somebody
      else's source.
    */
    source: field.text({ label: "Raised by", holds: "none", max: 80 }),
    /* ⚠️ THE RECORD IN THE OTHER PRODUCT, AS A STRING RATHER THAN A REF. OneBook
       may not point at OneInventory's tables — that is the whole of B1 — so what
       it keeps is the identifier it was told, which is enough to look up and not
       enough to couple. */
    ref: field.text({ label: "Reference", holds: "none", max: 120 }),
  },
});

/**
 * ONE LINE OF ONE ENTRY.
 *
 * ⚠️ ONE SIGNED COLUMN — see `posting.ts`. Debit is positive, credit is negative,
 * and the screens draw two columns from the sign. Two stored columns can disagree
 * with themselves; one cannot.
 */
const posting = collection({
  id: "posting",
  label: { one: "Line", many: "Lines" },
  scope: { of: "tenant" },
  permission: "journal",
  retention: null,
  onClose: { then: "purge" },
  names: "memo",
  fields: {
    journal: field.ref({ label: "Entry", required: true, holds: "none", to: "journal" }),
    account: field.ref({ label: "Account", required: true, holds: "none", to: "account" }),
    /*
      ⚠️ ONE AXIS, ON THE LINE RATHER THAN ON THE ENTRY. A purchase covering two
      departments is one entry with two lines, and putting the centre on the
      header would make that impossible to record without splitting the invoice.

      ⚠️ AND IT IS A COLUMN RATHER THAN A JOIN TABLE, WHICH IS THE DECISION
      (D127). `posting` is the largest table this product holds; a second axis
      means a row per posting per dimension, and every report would pay for it
      whether or not anybody had ever used a second one.
    */
    centre: field.ref({
      label: "Cost centre", holds: "none", to: "centre",
      help: "Optional. Which branch, department or project this belongs to.",
    }),
    amount: field.money({
      label: "Amount", required: true, holds: "none",
      help: "Positive is a debit, negative is a credit.",
    }),
    /*
      ⚠️ THE THREE COLUMNS THAT MAKE A FOREIGN POSTING READABLE, AND `amount` IS
      STILL THE ONE THAT BALANCES. What was actually paid, in what, and at what
      rate — see `money.ts`. Without them the base figure has moved with every
      rate since, so nobody can say how many dollars are in the dollar account,
      reconcile against a foreign statement, or revalue anything.

      ⚠️ AND THEY ARE ALL EMPTY FOR AN ORDINARY POSTING, which is almost every
      posting. A business with one currency never fills one in and pays nothing
      for them but three nulls.
    */
    currency: field.text({ label: "Paid in", holds: "none", max: 3 }),
    original: field.money({
      label: "In that currency", holds: "none",
      help: "What actually moved. The amount beside it is what the books say.",
    }),
    /* ⚠️ MILLIONTHS, NOT A FLOAT — see `RATE_SCALE`. A rate held as a float is
       out by a fraction of a cent per line, differently each time, and surfaces
       as a trial balance that will not close. */
    rate: field.number({ label: "Rate", holds: "none", min: 0 }),
    memo: field.text({ label: "What it was", required: true, holds: "none", max: 200 }),
  },
});

/**
 * A TAX CODE — A RATE WITH A NAME AND A RETURN LINE BEHIND IT.
 *
 * ⚠️ A RATE IS A ROW, NOT A NUMBER ON A LINE. Rates change, by statute, on a
 * date — and every invoice already raised has to keep the rate it was raised at
 * while every new one gets the new figure. A number typed on a line makes that
 * impossible to report on: "how much did we charge at the standard rate" becomes
 * a query over distinct values, and a mistyped 4% is a rate that quietly exists.
 *
 * ⚠️ AND THE ACCOUNT IS THE ROLE'S, NOT THE CODE'S. Tax charged is a liability
 * and tax paid is an asset, and the SAME code appears on both sides of a
 * business — 5% VAT on what it sells and 5% on what it buys. So the code carries
 * the rate and the books decide the account from which way the document faces
 * (`tax_output` or `tax_input`), which is why there is no account column here.
 */
const tax = collection({
  id: "tax",
  label: { one: "Tax code", many: "Tax codes" },
  scope: { of: "tenant" },
  permission: "account",
  retention: null,
  onClose: { then: "keep", why: "the rate a filed return was made of" },
  searchable: ["name"],
  names: "name",
  fields: {
    name: field.text({ label: "Name", required: true, holds: "none", max: 60 }),
    /*
      ⚠️ BASIS POINTS. Five per cent is 500 and seven and a half is 750 — a whole
      number, because a rate held as a float multiplies into every line of every
      invoice and the error is pennies that differ per document.
    */
    basis: field.number({
      label: "Hundredths of a per cent", required: true, holds: "none",
      min: 0, max: RATE_BASIS,
      help: "5% is 500. 7.5% is 750.",
    }),
    /* ⚠️ CLOSED RATHER THAN DELETED, for the account's reason: last quarter's
       return was made of it. */
    closed: field.bool({ label: "No longer charged", holds: "none" }),
  },
});

/**
 * WHAT A CURRENCY WAS WORTH ON A DAY.
 *
 * ⚠️ TYPED, NOT FETCHED, AND THAT IS DELIBERATE FOR NOW. A rate a business
 * files a return on is one they can point at a source for — a central bank's
 * published figure, or the rate their own bank actually gave them — and those
 * two differ. Pulling a third number off an API and posting it would be
 * inventing a figure the business cannot defend.
 *
 * ⚠️ AND IT IS DATED, BECAUSE A RATE IS ONLY EVER TRUE ON A DAY. `rateOn` reads
 * the latest one on or before the day being asked about, which is what an
 * accountant does: yesterday's rate is the answer for a day nobody quoted.
 */
const rate = collection({
  id: "rate",
  label: { one: "Rate", many: "Rates" },
  scope: { of: "tenant" },
  /* ⚠️ THE JOURNAL'S GRANT. A rate is what a posting is converted at, so whoever
     may post may record the rate they posted at — and a separate key would put
     a bookkeeper's ordinary Tuesday behind somebody else's permission. */
  permission: "journal",
  retention: null,
  onClose: { then: "keep", why: "what a figure was converted at, which outlives the business" },
  searchable: ["currency"],
  names: "currency",
  fields: {
    currency: field.text({
      label: "Currency", required: true, holds: "none", max: 3, settled: true,
      help: "Three letters, against this workspace's own.",
    }),
    day: field.day({ label: "On", required: true, holds: "none", settled: true }),
    /* ⚠️ MILLIONTHS. One unit of that currency, in this workspace's own — so
       3.6725 dirhams to the dollar is 3672500. */
    rate: field.number({
      label: "Millionths", required: true, holds: "none", min: 1,
      help: "One unit, in your currency, times a million.",
    }),
    said: field.text({ label: "From", holds: "none", max: 120,
      help: "Where it came from. A central bank, or your own bank's advice." }),
  },
});

/**
 * AN INVOICE SENT TO A CUSTOMER.
 *
 * ⚠️ IT IS A DOCUMENT, WHICH IS THE WHOLE OF WHY THE RAIL EXISTS (D124). It is a
 * draft while somebody builds it, it takes a number when they commit to it, and
 * from that instant it is evidence: a customer holds a copy, a tax return is made
 * of it, and editing it is changing a fact after the fact.
 *
 * ⚠️ AND IT CANNOT BE CANCELLED, WHICH IS THE SHARPEST THING HERE. A tax invoice
 * that can be withdrawn is a compliance problem wearing a convenience feature —
 * the customer has the paper, the number is issued, and the correction the law
 * wants is a SECOND document that says what changed. `cancel: { by: "refusing" }`
 * is the kernel's word for that, and it names the credit note as the way out so
 * nobody is left holding a wrong invoice with no route at all.
 */
const sale = collection({
  id: "sale",
  label: { one: "Invoice", many: "Invoices" },
  scope: { of: "tenant" },
  permission: "journal",
  retention: null,
  /* ⚠️ KEPT PAST THE WORKSPACE. What was invoiced to whom is the shape of a
     return somebody filed, and that does not stop having happened. */
  onClose: { then: "keep", why: "what was invoiced, which a tax authority may ask about" },
  searchable: ["memo"],
  names: "memo",
  document: {
    /* ⚠️ THE DEFAULT, NOT THE SETTING — a workspace edits its own (D125). */
    series: "INV-{YYYY}-{####}",
    /* ⚠️ AND NOT AMENDABLE, WHICH FOLLOWS RATHER THAN BEING A SECOND DECISION.
       An amendment is a cancellation and a fresh draft, so a document that
       refuses the first cannot offer the second — the kernel refuses the pair,
       which is how this comment came to be written rather than the bug. */
    amendable: false,
    cancel: {
      by: "refusing",
      instead: "credit note",
      why: "the customer holds this invoice and a return may be made of it",
    },
    posts: [{ to: "book", rule: "sale.posted" }],
  },
  fields: {
    /*
      ⚠️ THE CUSTOMER IS ONEPARTY'S AND ONLY THEIR NAME CROSSES (D122). One
      address book for every product is the whole of B1 — an invoice pointing at
      a party OneInventory already buys from is the same person, and OneBook
      holds none of who they are.
    */
    party: field.ref({ label: "Customer", required: true, holds: "none", to: "party" }),
    memo: field.text({ label: "What it is for", required: true, holds: "none", max: 200 }),
    /* ⚠️ THE DAY IT BELONGS TO, which is not the day it was typed — the same
       rule the journal keeps, and the day the tax point falls on. */
    day: field.day({ label: "Date", required: true, holds: "none" }),
    due: field.day({ label: "Due", holds: "none",
      help: "When it is payable. Blank means on receipt." }),
    /*
      ⚠️ A FOREIGN INVOICE CARRIES ITS RATE — see `money.ts`. What the customer
      owes is in THEIR currency and what the books record is in the workspace's,
      and the rate is what ties them together on a document that will be paid
      months later at a different one.
    */
    currency: field.text({ label: "Billed in", holds: "none", max: 3 }),
    rate: field.number({ label: "Rate", holds: "none", min: 0 }),
    note: field.long({ label: "Note", holds: "none", max: 2_000 }),
  },
});

/**
 * ONE LINE OF AN INVOICE.
 *
 * ⚠️ IT NAMES AN ACCOUNT RATHER THAN A PRODUCT, AND THAT IS THE SEAM (B1). What
 * was sold is OneInventory's or OneTrade's to know; what the books need is which
 * income account it lands in. "Consulting, 2.5 hours at 90" against the
 * consulting account is a complete invoice for a business with no stock at all,
 * and the field a product-shaped document fills in when there is one.
 */
const saleLine = collection({
  id: "sale-line",
  label: { one: "Line", many: "Lines" },
  scope: { of: "tenant" },
  permission: "journal",
  retention: null,
  onClose: { then: "keep", why: "what an invoice was made of" },
  names: "said",
  fields: {
    sale: field.ref({ label: "Invoice", required: true, holds: "none", to: "sale" }),
    said: field.text({ label: "What it is", required: true, holds: "none", max: 200 }),
    /* ⚠️ THOUSANDTHS, because half an hour is a real invoice line — see
       `QUANTITY_SCALE`. */
    quantity: field.number({
      label: "How many (thousandths)", required: true, holds: "none",
      help: "2.5 hours is 2500.",
    }),
    price: field.money({ label: "Each", required: true, holds: "none" }),
    account: field.ref({ label: "Goes to", required: true, holds: "none", to: "account" }),
    tax: field.ref({ label: "Tax", holds: "none", to: "tax" }),
    centre: field.ref({ label: "Cost centre", holds: "none", to: "centre" }),
  },
});

/**
 * A BILL SOMEBODY SENT US.
 *
 * ⚠️ IT CAN BE CANCELLED AND AN INVOICE CANNOT, AND THE ASYMMETRY IS THE WHOLE
 * DIFFERENCE BETWEEN THEM. A sales invoice is a document we ISSUED — a customer
 * holds it, its number is spent, and the lawful correction is a credit note. A
 * bill is our own RECORD of what a supplier sent; nobody outside this workspace
 * has ever seen it, so getting it wrong is a mistake to withdraw rather than a
 * fact to correct with a second document.
 *
 * ⚠️ AND WITHDRAWING IT REVERSES WHAT IT POSTED — see `unpostBill`. A bill
 * cancelled without that leaves the books owing a supplier for something the
 * workspace decided never happened, with the document saying cancelled and the
 * ledger saying nothing.
 *
 * ⚠️ IT CARRIES THEIR NUMBER, NOT ONLY OURS. Ours orders our own records; theirs
 * is what a supplier quotes on a statement and on every chasing email, and a
 * payables ledger that cannot be searched by it is one somebody reconciles by
 * hand.
 */
const bill = collection({
  id: "bill",
  label: { one: "Bill", many: "Bills" },
  scope: { of: "tenant" },
  permission: "journal",
  retention: null,
  onClose: { then: "keep", why: "what was billed to this business, and by whom" },
  searchable: ["memo", "theirs"],
  names: "memo",
  document: {
    series: "BILL-{YYYY}-{####}",
    posts: [{ to: "book", rule: "bill.posted" }],
  },
  fields: {
    party: field.ref({ label: "Supplier", required: true, holds: "none", to: "party" }),
    memo: field.text({ label: "What it is for", required: true, holds: "none", max: 200 }),
    /* ⚠️ THEIR NUMBER, WHICH IS WHAT A SUPPLIER QUOTES. Not unique here on
       purpose: two suppliers may both call something "INV-1", and refusing that
       would refuse a real bill over a coincidence in somebody else's numbering. */
    theirs: field.text({ label: "Their number", holds: "none", max: 60 }),
    day: field.day({ label: "Date", required: true, holds: "none" }),
    due: field.day({ label: "Due", holds: "none",
      help: "When it is payable. Blank means on receipt." }),
    currency: field.text({ label: "Billed in", holds: "none", max: 3 }),
    rate: field.number({ label: "Rate", holds: "none", min: 0 }),
    note: field.long({ label: "Note", holds: "none", max: 2_000 }),
  },
});

/** ⚠️ The same line as an invoice's, against expense rather than income. */
const billLine = collection({
  id: "bill-line",
  label: { one: "Line", many: "Lines" },
  scope: { of: "tenant" },
  permission: "journal",
  retention: null,
  onClose: { then: "keep", why: "what a bill was made of" },
  names: "said",
  fields: {
    bill: field.ref({ label: "Bill", required: true, holds: "none", to: "bill" }),
    said: field.text({ label: "What it is", required: true, holds: "none", max: 200 }),
    quantity: field.number({
      label: "How many (thousandths)", required: true, holds: "none",
      help: "2.5 hours is 2500.",
    }),
    price: field.money({ label: "Each", required: true, holds: "none" }),
    account: field.ref({ label: "Goes to", required: true, holds: "none", to: "account" }),
    tax: field.ref({ label: "Tax", holds: "none", to: "tax" }),
    centre: field.ref({ label: "Cost centre", holds: "none", to: "centre" }),
  },
});

/**
 * A POSTING RULE — workspace data, and the answer to "why is this moving" (B2).
 *
 * ⚠️ IT IS A ROW RATHER THAN A BRANCH IN A HANDLER, and that is the whole point.
 * ERPNext answers the same question with `make_gl_entries` across twenty-eight
 * files; this answers it with a list somebody can read on a screen, turn off, and
 * point at a different account.
 *
 * ⚠️ THE SIDES NAME ROLES AND THE WORKSPACE OWNS THE CHART, so the lever that
 * matters most is not this table at all — it is which account carries which role.
 * A workspace that wants purchases landing somewhere else moves a tag.
 */
const rule = collection({
  id: "posting-rule",
  label: { one: "Posting rule", many: "Posting rules" },
  scope: { of: "tenant" },
  permission: "journal",
  retention: null,
  onClose: { then: "purge" },
  names: "memo",
  fields: {
    /* ⚠️ THE EVENT IT LISTENS FOR, AND OneBook HAS TO KNOW WHAT IT MEANS. A rule
       for an event nothing declares would never fire; a rule for one whose answer
       OneBook cannot read would post the wrong number. Both are why the shipped
       set is short and honest rather than long and hopeful. */
    event: field.text({ label: "When", required: true, holds: "none", max: 80 }),
    memo: field.text({ label: "Posts", required: true, holds: "none", max: 200 }),
    /* ⚠️ OFF IS A FIRST-CLASS ANSWER. A workspace whose accountant posts
       purchases by hand turns this off and nothing else changes. */
    enabled: field.bool({ label: "On", holds: "none" }),
    sides: field.json({ label: "Sides", holds: "none" }),
  },
});

/* ------------------------------------------------------------- operations --- */

interface Starting { readonly chart: string }
interface Started { readonly chart: string; readonly accounts: number }
interface Extended { readonly added: number }
interface Row { readonly id: string; readonly name: string; readonly code: string | null; readonly role: string | null }

/**
 * ⚠️ ONE WALK, USED BY BOTH WRITES, so a seeded account and a topped-up one are
 * the same row. Two insert paths for one shape is how a chart comes to hold two
 * kinds of account that differ in a column nobody meant to leave out.
 */
async function put(
  c: Ctx, db: Db, nodes: readonly Node[], parent: string | null,
): Promise<number> {
  let made = 0;
  for (const node of nodes) {
    const id = newId("acc");
    await db.prepare(
      `INSERT INTO account (id, tenant_id, name, code, type, role, parent, closed, at, by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
      .bind(id, c.tenantId, node.name, node.code ?? null, node.type, node.role ?? null,
        parent, c.now, c.accountId ?? null)
      .run();
    made += 1;
    if (node.children?.length) made += await put(c, db, node.children, id);
  }
  return made;
}

/**
 * STARTING THE BOOKS.
 *
 * ⚠️ IT REFUSES A SECOND TIME, AND THAT IS THE WHOLE SAFETY OF THE SEED. A
 * template that can be applied twice is a template that can be applied over a
 * chart somebody has been posting to for two years — and the second application
 * would look like a successful setup.
 */
const start = operation<Starting, Started>({
  id: "book.start",
  kind: "write",
  summary: "Start the books from a chart of accounts",
  input: {
    /*
      ⚠️ THE COUNTRY IS A DEFAULT AND NOT A CONSTRAINT. A freezone company in the
      Emirates whose accountant thinks in a British chart picks the British one,
      and nothing objects — which is why this is a choice with a good default
      rather than a fact read off the workspace.
    */
    chart: field.enum({
      label: "Start from", required: true, holds: "none",
      values: CHARTS.map((one) => one.id),
      labels: Object.fromEntries(CHARTS.map((one) => [one.id, one.name])),
      help: "Rename anything afterwards. Nothing here is fixed.",
    }),
  },
  output: {
    chart: field.text({ label: "Chart", holds: "none" }),
    accounts: field.number({ label: "Accounts", holds: "none" }),
  },
  permission: "account:write",
  idempotency: { mode: "key" },
  emits: ["book.started"],
  outcome: {
    message: "The books are open.", tone: "success", invalidates: ["account.list"],
  },
  fails: ["platform.invalid", "book.already_open"],
  audit: (input) => ({ subject: input.chart, verb: "started the books" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;

    const chart = chartById(input.chart);
    if (!chart) {
      return c.fail("platform.invalid", {}, { fields: { chart: "Choose one of the charts" } });
    }

    const held = await db.prepare(
      "SELECT id FROM account WHERE tenant_id = ? LIMIT 1").bind(c.tenantId).first<Row>();
    if (held) return c.fail("book.already_open");

    const made = await put(c, db, chart.accounts, null);

    /*
      ⚠️ THE RULES ARE SEEDED WITH THE CHART, BECAUSE THEY ARE USELESS APART FROM
      IT. A rule names roles and a role is a tag on an account, so seeding rules
      into a workspace with no chart would be seeding rows that can only ever
      post to suspense.
    */
    for (const one of RULES) {
      await db.prepare(
        `INSERT INTO posting_rule (id, tenant_id, event, memo, enabled, sides, at, by)
          VALUES (?, ?, ?, ?, 1, ?, ?, ?)`)
        .bind(newId("rul"), c.tenantId, one.event, one.memo,
          JSON.stringify(one.sides), c.now, c.accountId ?? null)
        .run();
    }

    return { chart: chart.id, accounts: made };
  },
});

/**
 * TOPPING UP FROM A TEMPLATE THAT HAS SINCE GROWN.
 *
 * ⚠️ ADDITIVE ONLY, AND THAT IS WHAT MAKES IT SAFE ON A LIVE CHART. It renames
 * nothing, moves nothing, closes nothing and deletes nothing — the only thing it
 * can do is add. That is what lets a workspace seeded from a thin early template
 * pick up the accounts we later learned its country needs, a year into posting,
 * without anybody having to weigh a risk.
 *
 * ⚠️ AND IT ADDS AT THE TOP RATHER THAN GUESSING A PARENT. The template's nesting
 * is a suggestion the workspace has already accepted or rearranged; dropping a
 * new account into a group somebody may have renamed, moved or closed is the one
 * way this could still surprise them. It lands where it can be seen, and moving
 * it is one edit.
 */
const extend = operation<Record<string, never>, Extended>({
  id: "book.extend",
  kind: "write",
  summary: "Add accounts the template has gained",
  input: {},
  output: { added: field.number({ label: "Added", holds: "none" }) },
  permission: "account:write",
  idempotency: { mode: "key" },
  emits: ["book.extended"],
  outcome: {
    message: "Added.", tone: "success", invalidates: ["account.list"],
  },
  fails: ["book.not_open"],
  audit: () => ({ subject: "chart", verb: "extended" }),
  async handler(ctx) {
    const c = ctx as Ctx;
    const db = c.db as Db;

    const rows = await db.prepare(
      "SELECT id, name, code, role FROM account WHERE tenant_id = ?")
      .bind(c.tenantId).all<Row>();
    if (!rows.results.length) return c.fail("book.not_open");

    /* ⚠️ THE CHART THEY STARTED FROM, NOT THE ONE THEIR COUNTRY WOULD PICK. A
       workspace that deliberately chose another country's chart must not be
       topped up from the one it declined. */
    const chart = chartById(String(await c.setting("book.chart")))
      ?? chartFor(String(await c.setting("book.chart")));

    const held: readonly Held[] = rows.results.map((row) => ({
      name: row.name, code: row.code, role: row.role,
    }));
    const want = missing(chart, held);
    /* ⚠️ FLAT, AND WITHOUT THEIR CHILDREN — see the header. `missing` already
       walked the tree, so every node it returns is its own row. */
    const added = await put(c, db, want.map((node) => ({ ...node, children: undefined }) as Node), null);

    return { added };
  },
});

/* ------------------------------------------------------------- the ledger --- */

interface Posting { readonly day: string; readonly memo: string; readonly lines: unknown }
interface Posted { readonly journal: string; readonly lines: number }
interface AccountRow {
  readonly id: string;
  readonly type?: string;
  readonly role: string | null;
  readonly closed: number;
}

/** ⚠️ Only what the writer below needs — see `writeEntry`. */
interface Written {
  readonly day: string;
  readonly memo: string;
  readonly source?: string | null;
  readonly ref?: string | null;
  readonly lines: readonly Line[];
}

/**
 * THE ONE PLACE A JOURNAL ENTRY IS WRITTEN.
 *
 * ⚠️ ONE WRITER, BECAUSE THE INVARIANT IS ONE. A hand-typed entry and one raised
 * by an event are the same rows under the same rule, and two write paths would be
 * two places for "does it balance" to be asked — with the second one, written
 * later, in a hurry, by somebody who assumed the first had already asked.
 */
/**
 * ⚠️ THE TWO READS THE CHOKEPOINT MAKES BEFORE IT WRITES ANYTHING. Both are
 * bounded by how a business keeps its books rather than by how much it has done
 * — a handful of years and at most a year's worth of months — so this does not
 * grow with the ledger, which is the property that makes asking on every entry
 * affordable.
 */
async function calendarOf(
  db: Db, tenantId: string,
): Promise<{ years: readonly Year[]; periods: readonly Period[] }> {
  const [years, periods] = await Promise.all([
    db.prepare(`SELECT id, opens, closes, closed FROM year WHERE tenant_id = ?`)
      .bind(tenantId).all<{ id: string; opens: string; closes: string; closed: number | null }>(),
    db.prepare(
      `SELECT id, year, name, opens, closes, shut FROM period WHERE tenant_id = ? AND shut = 1`)
      .bind(tenantId).all<{
        id: string; year: string; name: string; opens: string; closes: string; shut: number | null;
      }>(),
  ]);
  return {
    years: years.results.map((r) => ({ ...r, closed: !!r.closed })),
    periods: periods.results.map((r) => ({ ...r, shut: !!r.shut })),
  };
}

/**
 * ⚠️ WHAT A SHUT PERIOD REFUSES, IN THE WORDS OF WHAT HAPPENED. "no_year" is
 * what the rule answers; what a person needs is which year is missing and that
 * they can open one — because the commonest cause of it is a workspace that has
 * not set its year up yet, and the second commonest is a typo in a date.
 */
function refuseCalendar(c: Pick<Ctx, "fail">, said: PostRefusal): never {
  if (said.why === "no_year") {
    return c.fail("book.outside_a_year", { day: said.day });
  }
  if (said.why === "year_closed") return c.fail("book.year_closed");
  return c.fail("book.period_shut", { period: said.name });
}

/**
 * EVERY COLUMN A POSTING LINE CARRIES, AND ADDING ONE IS A BUILD FAILURE.
 *
 * ⚠️ THREE OF THESE WERE VALIDATED AT THE DOOR AND DROPPED HERE. `journal.post`
 * checks a foreign line's currency, figure and rate against each other with some
 * care, and the insert below named neither `currency`, `original` nor `rate` —
 * so `original` was NULL on every posting ever written, and the revaluation SUMS
 * that column. A foreign account therefore held nothing according to the books,
 * and restating it moved its entire balance to the exchange account, on an entry
 * that balanced and a screen that said "Restated."
 *
 * ⚠️ SO THE LIST IS A SHAPE RATHER THAN A HABIT. `satisfies` makes it exhaustive
 * over `Line`: the next field somebody adds does not compile until it is written
 * down here, which is the only mechanism that would have caught the last three.
 */
const KEPT = {
  account: (line: Line) => line.account,
  amount: (line: Line) => line.amount,
  centre: (line: Line) => line.centre ?? null,
  currency: (line: Line) => line.currency ?? null,
  original: (line: Line) => line.original ?? null,
  rate: (line: Line) => line.rate ?? null,
  /* ⚠️ THE ENTRY'S OWN WORDS WHERE THE LINE HAS NONE, so a posting is never
     nameless on a ledger somebody is reading down. */
  memo: (line: Line, said: string) => line.memo ?? said,
} satisfies Record<keyof Required<Line>, (line: Line, said: string) => unknown>;

const OF_A_LINE = Object.keys(KEPT) as (keyof typeof KEPT)[];

/**
 * ⚠️ IT ANSWERS WITH THE REFUSAL RATHER THAN THROWING, because its two callers
 * want different things from one. A person typing an entry is told which month
 * is shut and can reopen it; an EVENT arriving from another product has nobody
 * to tell — so that path throws, `heard()` logs which app heard what and threw,
 * and the goods stay on the shelf while an operator is told the accounting
 * behind them has stopped. Deciding here would have picked one of those for
 * both.
 */
async function writeEntry(
  c: Pick<Ctx, "tenantId" | "now" | "accountId">, db: Db, of: Written,
): Promise<Posted | PostRefusal> {
  /*
    ⚠️ ASKED HERE AND NOWHERE ELSE, WHICH IS WHY THE ONE WRITER MATTERS. A
    hand-typed entry and one an event raised are the same rows under the same
    rule; a second write path would be a second place to ask, and the automatic
    one is the path that would quietly go on posting into a month somebody has
    already filed a return for.
  */
  const { years, periods } = await calendarOf(db, c.tenantId);
  const shut = refusePostingOn(of.day, years, periods);
  if (shut) return shut;

  const id = newId("jnl");
  await db.prepare(
    `INSERT INTO journal (id, tenant_id, day, memo, source, ref, at, by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, c.tenantId, of.day, of.memo, of.source ?? null, of.ref ?? null,
      c.now, c.accountId ?? null)
    .run();

  for (const line of of.lines) {
    await db.prepare(
      `INSERT INTO posting
        (id, tenant_id, journal, ${OF_A_LINE.join(", ")}, at, by)
        VALUES (?, ?, ?, ${OF_A_LINE.map(() => "?").join(", ")}, ?, ?)`)
      .bind(newId("pst"), c.tenantId, id,
        ...OF_A_LINE.map((name) => KEPT[name](line, of.memo)),
        c.now, c.accountId ?? null)
      .run();
  }
  return { journal: id, lines: of.lines.length };
}

/**
 * ⚠️ EVERY CENTRE IN ONE READ, AND IT IS BOUNDED BY THE SHAPE OF THE BUSINESS
 * rather than by how much it has done. A workspace has a handful of branches and
 * departments; this does not grow with the ledger, which is the property that
 * makes asking on every entry affordable.
 */
async function centresOf(db: Db, tenantId: string): Promise<readonly Centre[]> {
  const got = await db.prepare(
    `SELECT id, name, parent, closed FROM centre WHERE tenant_id = ?`)
    .bind(tenantId)
    .all<{ id: string; name: string; parent: string | null; closed: number | null }>();
  return got.results.map((r) => ({ ...r, closed: !!r.closed }));
}

/**
 * WHAT EVERY CURRENCY WAS WORTH ON A DAY, IN ONE READ.
 *
 * ⚠️ THE LATEST ROW ON OR BEFORE THE DAY, WHICH IS WHAT AN ACCOUNTANT DOES.
 * Nobody quotes a rate for every day, and yesterday's is the answer for a day
 * nobody quoted — so a lookup demanding an exact match would refuse most days of
 * the year for a workspace keeping perfectly good records.
 *
 * ⚠️ AND IT IS ONE STATEMENT, NOT ONE PER CURRENCY. A business holds a handful
 * of currencies and years of rates; asking per currency would be a fan-out
 * growing with how long it has been trading.
 */
async function ratesOn(
  db: Db, tenantId: string, day: string,
): Promise<ReadonlyMap<string, number>> {
  const got = await db.prepare(
    `SELECT currency, rate FROM rate
      WHERE tenant_id = ? AND day <= ?
      ORDER BY currency ASC, day ASC`)
    .bind(tenantId, day).all<{ currency: string; rate: number }>();
  /* ⚠️ OLDEST FIRST AND OVERWRITTEN, so the last row for a currency wins — the
     newest on or before the day, which is the one that is true. */
  const out = new Map<string, number>();
  for (const row of got.results) out.set(row.currency, row.rate);
  return out;
}

/** ⚠️ Every role-tagged account in one read, rather than one query per side. */
async function rolesOf(db: Db, tenantId: string): Promise<Map<string, string>> {
  const rows = await db.prepare(
    "SELECT id, role, closed FROM account WHERE tenant_id = ? AND role IS NOT NULL")
    .bind(tenantId).all<AccountRow>();
  const out = new Map<string, string>();
  /* ⚠️ A CLOSED ACCOUNT IS NOT A HOME. Closing one means nothing new lands
     there, and a role still pointing at it would post to it anyway — so the role
     reads as unhomed and `fire` sends the side to suspense, where somebody will
     find it. */
  for (const row of rows.results) {
    if (row.role && !row.closed) out.set(row.role, row.id);
  }
  return out;
}

/**
 * AN ENTRY SOMEBODY TYPED.
 *
 * ⚠️ THE BOOKS HAVE TO BE USABLE BY A BOOKKEEPER ON DAY ONE, whatever any other
 * product emits. Every accounting system is ultimately a person and a journal;
 * the rules are what save them typing the ordinary ones.
 */
const post = operation<Posting, Posted>({
  id: "journal.post",
  kind: "write",
  summary: "Write an entry into the journal",
  input: {
    day: field.day({ label: "Date", required: true, holds: "none" }),
    memo: field.text({ label: "What it was", required: true, holds: "none", max: 200 }),
    /* ⚠️ A LIST, BECAUSE AN ENTRY IS ITS LINES. Two, three or ten; a receipt with
       tax on it is three, and any shape that assumed two would be wrong on the
       first invoice. */
    lines: field.json({ label: "Lines", holds: "none" }),
  },
  output: {
    journal: field.text({ label: "Entry", holds: "none" }),
    lines: field.number({ label: "Lines", holds: "none" }),
  },
  permission: "journal:write",
  idempotency: { mode: "key" },
  emits: ["journal.posted"],
  outcome: { message: "Posted.", tone: "success", invalidates: ["journal.list"] },
  fails: [
    "platform.invalid", "book.unbalanced", "book.no_account",
    "book.centre_needed", "book.no_centre",
    "book.no_currency", "book.bad_rate", "book.rate_disagrees",
  ],
  audit: (input) => ({ subject: input.memo, verb: "posted" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;

    const raw = Array.isArray(input.lines) ? input.lines : [];
    const lines: Line[] = raw.map((one) => {
      const row = (one ?? {}) as Record<string, unknown>;
      return {
        account: String(row.account ?? ""),
        amount: Number(row.amount ?? 0),
        ...(row.memo ? { memo: String(row.memo) } : {}),
        ...(row.centre ? { centre: String(row.centre) } : {}),
        ...(row.currency ? { currency: String(row.currency) } : {}),
        ...(row.original ? { original: Number(row.original) } : {}),
        ...(row.rate ? { rate: Number(row.rate) } : {}),
      };
    });

    /*
      ⚠️ THE REFUSAL NAMES WHICH MISTAKE IT WAS. "One side typed" and "the two
      sides differ" are different things to be told, and reporting both as
      "unbalanced" tells the first person something true and useless.
    */
    const wrong = refuseEntry(lines);
    if (wrong === "unbalanced") {
      return c.fail("book.unbalanced", {}, { fields: { lines: "The two sides differ" } });
    }
    if (wrong) {
      return c.fail("platform.invalid", {}, { fields: { lines: SAYS[wrong] ?? "Check the lines" } });
    }

    /* ⚠️ EVERY ACCOUNT CHECKED BEFORE ANYTHING IS WRITTEN. Half an entry is
       worse than none: it balances to nothing and can never be found by the
       report that would have shown it. */
    const held = await db.prepare(
      "SELECT id, type, role, closed FROM account WHERE tenant_id = ?")
      .bind(c.tenantId).all<AccountRow>();
    const open = new Map(held.results.map((row) => [row.id, row] as const));
    for (const line of lines) {
      const account = open.get(line.account);
      if (!account) {
        return c.fail("book.no_account", {}, { fields: { lines: "One line names no account" } });
      }
      if (account.closed) {
        return c.fail("book.no_account", {}, { fields: { lines: "One account is closed" } });
      }
    }

    /*
      ⚠️ AND EVERY CENTRE, IN THE SAME PASS, BEFORE ANYTHING IS WRITTEN — see
      `refusePlacing`. The requirement bites on the profit and loss only, which
      is the industry's rule rather than a convenience: cash is the company's and
      not the shop's, so a workspace that switched it on would otherwise be
      unable to record a payment.
    */
    const centres = await centresOf(db, c.tenantId);
    const wanted = String(await c.setting("book.centre_required")) === "true";
    for (const line of lines) {
      const root = (open.get(line.account)?.type ?? "asset") as AccountStanding["root"];
      const said = refusePlacing({ centre: line.centre ?? null, root }, centres, wanted);
      if (said === "centre_missing") {
        return c.fail("book.centre_needed", {},
          { fields: { lines: "Every income and expense line names a cost centre" } });
      }
      if (said === "centre_unknown") {
        return c.fail("book.no_centre", {},
          { fields: { lines: "One line names no cost centre" } });
      }
      if (said === "centre_closed") {
        return c.fail("book.no_centre", {},
          { fields: { lines: "One cost centre is closed" } });
      }
    }

    /*
      ⚠️ A FOREIGN LINE CARRIES ITS OWN RATE AND ITS OWN FIGURE, AND `amount` IS
      STILL WHAT BALANCES. What is checked here is that the three agree: a rate
      that is not a rate, or a base figure that is not what the rate produces,
      would make the ledger and the foreign column disagree — and the foreign
      column is the one a bank statement is reconciled against.

      ⚠️ AND THE BASE FIGURE IS RECOMPUTED RATHER THAN TRUSTED. A caller sending
      both is a caller who can send two numbers that do not match; recomputing
      makes the pair impossible to disagree, which is the same shape as `planRun`
      returning its prompt and its reserve from one call.
    */
    for (const line of lines) {
      if (!line.currency) continue;
      if (!c.currency) return c.fail("book.no_currency");
      const wrong = refuseRate(line.rate ?? 0);
      if (wrong) {
        return c.fail("book.bad_rate", {},
          { fields: { lines: wrong === "rate_absurd" ? "That rate is not a rate" : "Every foreign line needs a rate" } });
      }
      const should = inBase(line.original ?? 0, line.rate ?? 0, line.currency, c.currency);
      if (typeof should !== "number") {
        return c.fail("platform.invalid", {}, { fields: { lines: "That figure is too large" } });
      }
      if (should !== line.amount) {
        return c.fail("book.rate_disagrees", {},
          { fields: { lines: "The amount is not what that rate gives" } });
      }
    }

    const posted = await writeEntry(c, db, { day: input.day, memo: input.memo, lines });
    /* ⚠️ THE PERSON PATH TELLS THEM WHICH MONTH IS SHUT — see `writeEntry`. They
       can reopen it, or move the date; both are things they can do, which is
       what separates this from the event path's throw. */
    if ("why" in posted) refuseCalendar(c, posted);
    return posted;
  },
});

/** ⚠️ One sentence per refusal, so the field says which mistake it was. */
const SAYS: Readonly<Record<string, string>> = {
  no_lines: "An entry needs lines",
  one_line: "An entry needs both sides",
  not_whole: "Amounts are whole units",
  nothing_moves: "Nothing moves in this entry",
};

/* -------------------------------------------------------------- the totals --- */

interface Standing { readonly id: string; readonly name: string; readonly code: string | null; readonly balance: number }

/**
 * WHAT EVERY ACCOUNT COMES TO — the trial balance, and the oldest check in
 * accounting.
 *
 * ⚠️ IT IS A `SUM`, AND B2's CLAIM IS ONLY TRUE IF NOTHING ELSE IS. Every figure
 * here is added up from the lines at the moment it is asked for; there is no
 * stored total anywhere for it to disagree with, which is why this cannot drift
 * and why no repair subsystem is needed for it to be believed.
 *
 * ⚠️ AND THE WHOLE LEDGER SUMS TO NOTHING, WHICH IS THE POINT OF THE SCREEN. A
 * trial balance is not a report about the business, it is a report about the
 * BOOKS: if the total is anything but zero, something wrote a line outside an
 * entry and every other figure is suspect.
 */
const trial = operation<
  { centre?: string },
  { items: Standing[]; whole: { total: number }[] }
>({
  id: "book.trial",
  kind: "read",
  summary: "What every account comes to",
  /*
    ⚠️ NARROWED TO A CENTRE AND EVERYTHING UNDER IT — see `within`. Narrowing to
    the one row called Retail would answer with whatever was posted directly to
    it, which in a business that posts to its shops is nothing at all: a report
    that is empty, correct, and reads as broken.
  */
  input: {
    centre: field.ref({ label: "Cost centre", holds: "none", to: "centre" }),
  },
  output: {
    items: field.json({ label: "Accounts", holds: "none" }),
    whole: field.json({ label: "The whole ledger", holds: "none" }),
  },
  permission: "journal:read",
  idempotency: { mode: "none" },
  fails: [],
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const under = input.centre
      ? within(await centresOf(c.db as Db, c.tenantId), String(input.centre))
      : null;
    /* ⚠️ A NARROWED TRIAL BALANCE DOES NOT HAVE TO COME TO ZERO, and nothing
       here pretends it does — see the screen. One department's half of an entry
       whose other half was the bank is a real figure and a real imbalance. */
    const narrow = under
      ? ` AND p.centre IN (${under.map(() => "?").join(", ")})`
      : "";
    const rows = await (c.db as Db).prepare(
      `SELECT a.id AS id, a.name AS name, a.code AS code,
              COALESCE(SUM(p.amount), 0) AS balance
         FROM account a LEFT JOIN posting p
           ON p.account = a.id AND p.tenant_id = a.tenant_id${narrow}
        WHERE a.tenant_id = ?
        GROUP BY a.id
        ORDER BY a.code IS NULL, a.code ASC, a.name ASC`)
      .bind(...(under ?? []), c.tenantId)
      .all<Standing>();

    /* ⚠️ ONLY THE ACCOUNTS THAT HOLD SOMETHING. A trial balance listing thirty
       zeroes is a screen somebody has to read past to find the four figures
       that matter; the chart is where every account is listed. */
    const items = (rows.results ?? []).filter((row) => row.balance !== 0);
    const total = items.reduce((sum, row) => sum + row.balance, 0);
    /*
      ⚠️ THE FIGURE AND NO SENTENCE BESIDE IT, AND THAT IS THE SLOT'S DOING RATHER
      THAN A PREFERENCE. A hero's label takes words or a field, never a computed
      answer — so a conditional sentence here would have been a string no screen
      could reach. The screen names the figure "Out by" instead, which makes zero
      read as the good answer without anything having to say so.
    */
    return { items, whole: [{ total }] };
  },
});

/**
 * WHAT EACH PART OF THE BUSINESS COST, OR EARNED.
 *
 * ⚠️ IT ROLLS UP, AND THAT IS THE WHOLE REPORT. Nothing is posted to Retail —
 * everything is posted to the two shops under it — so a figure that did not add
 * the children in would show a zero beside the one row somebody opened this to
 * read. `rollUp` in `dimensions.ts` is that arithmetic and it is pure.
 *
 * ⚠️ AND IT IS THE PROFIT AND LOSS ONLY. The balance sheet has no department: the
 * company holds the cash and owes the debts, so putting an asset in a centre's
 * column would answer a question nobody asked with a figure nobody can act on.
 */
const centres = operation<
  Record<string, never>,
  { items: { id: string; name: string; code: string | null; own: number; whole: number }[] }
>({
  id: "book.centres",
  kind: "read",
  summary: "What each part of the business came to",
  input: {},
  output: { items: field.json({ label: "Centres", holds: "none" }) },
  permission: "journal:read",
  idempotency: { mode: "none" },
  fails: [],
  async handler(ctx) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const held = await centresOf(db, c.tenantId);

    /* ⚠️ SUMMED IN ONE STATEMENT OVER THE LEDGER. Reading every posting into the
       worker to add it up is the shape that works in a demo and times out in a
       business. */
    const sums = await db.prepare(
      `SELECT p.centre AS centre, COALESCE(SUM(p.amount), 0) AS amount
         FROM posting p JOIN account a ON a.id = p.account
        WHERE p.tenant_id = ? AND p.centre IS NOT NULL
          AND a.type IN ('income', 'expense')
        GROUP BY p.centre`)
      .bind(c.tenantId).all<{ centre: string; amount: number }>();

    const own = new Map(sums.results.map((r) => [r.centre, r.amount] as const));
    const whole = rollUp(own, held);
    const codes = await db.prepare(
      `SELECT id, code FROM centre WHERE tenant_id = ?`)
      .bind(c.tenantId).all<{ id: string; code: string | null }>();
    const code = new Map(codes.results.map((r) => [r.id, r.code] as const));

    return {
      items: held.map((one) => ({
        id: one.id,
        name: one.name,
        code: code.get(one.id) ?? null,
        /*
          ⚠️ SIGNED THE WAY A POSTING IS AND THEN TURNED OVER, because what a
          person reads on this screen is "what did this cost" — and an expense is
          a debit, which is positive. A department that spent a thousand and
          earned nothing reads as a thousand rather than as minus one.
        */
        own: own.get(one.id) ?? 0,
        whole: whole.get(one.id) ?? 0,
      })),
    };
  },
});

/* ---------------------------------------------------- what an invoice posts --- */

interface SaleRow {
  readonly id: string;
  readonly day: string;
  readonly memo: string;
  readonly party: string;
  readonly currency: string | null;
  readonly rate: number | null;
}

interface ItemRow {
  readonly account: string;
  readonly said: string;
  readonly quantity: number;
  readonly price: number;
  readonly tax: string | null;
  readonly centre: string | null;
}

/**
 * THE NAME OF A PARTY THIS APP DOES NOT OWN.
 *
 * ⚠️ ONE STATEMENT, IN THE OPEN, AND THAT IS THE WHOLE OF D122. What crosses the
 * seam is a record's NAME and nothing else — so this reads two columns rather
 * than `SELECT *`, which would put another product's tax numbers, terms and
 * contact rows in this one's memory with nothing in the manifest to say so.
 *
 * ⚠️ AND WITHOUT IT AN INVOICE DRAWS AN IDENTIFIER. A document naming
 * `pty_0m7…` instead of a customer is a document nobody can check, and the
 * borrowed guard fails on the statement rather than on the screen — which is
 * where it is cheap to notice.
 */
async function namesOf(db: Db, tenantId: string): Promise<ReadonlyMap<string, string>> {
  const said = await db.prepare(`SELECT id, name FROM party WHERE tenant_id = ?`)
    .bind(tenantId).all<{ id: string; name: string }>();
  return new Map(said.results.map((row) => [String(row.id), String(row.name)] as const));
}

/**
 * ⚠️ ONE READ FOR THE WHOLE DOCUMENT, AND IT IS ASKED TWICE ON PURPOSE — once by
 * `may` before a number is taken and once by `post` after. The alternative is
 * carrying state between the two halves of a seam whose whole point is that the
 * first half can refuse; a second read of a handful of rows is cheaper than a
 * cache that can be stale between them.
 */
async function invoiceAt(
  db: Db, tenantId: string, id: string, way: Way,
): Promise<{ sale: SaleRow; items: readonly ItemRow[]; rates: ReadonlyMap<string, number> } | null> {
  /*
    ⚠️ THE TWO STATEMENTS ARE SPELLED OUT RATHER THAN BUILT FROM `way`, and that
    is `sql.ts`'s rule rather than a preference: a table name interpolated from a
    variable is the one thing the generated schema layer refuses outright. Two
    literals cost four lines and cannot be anything but names.
  */
  const sale = way === "out"
    ? await db.prepare(
      `SELECT id, day, memo, party, currency, rate FROM sale WHERE id = ? AND tenant_id = ?`)
      .bind(id, tenantId).first<SaleRow>()
    : await db.prepare(
      `SELECT id, day, memo, party, currency, rate FROM bill WHERE id = ? AND tenant_id = ?`)
      .bind(id, tenantId).first<SaleRow>();
  if (!sale) return null;

  const [lines, codes] = await Promise.all([
    way === "out"
      ? db.prepare(
        `SELECT account, said, quantity, price, tax, centre FROM sale_line
          WHERE sale = ? AND tenant_id = ?`).bind(id, tenantId).all<ItemRow>()
      : db.prepare(
        `SELECT account, said, quantity, price, tax, centre FROM bill_line
          WHERE bill = ? AND tenant_id = ?`).bind(id, tenantId).all<ItemRow>(),
    db.prepare(`SELECT id, basis FROM tax WHERE tenant_id = ?`)
      .bind(tenantId).all<{ id: string; basis: number }>(),
  ]);
  return {
    sale,
    items: lines.results ?? [],
    rates: new Map((codes.results ?? []).map((r) => [r.id, r.basis] as const)),
  };
}

/** ⚠️ The two lines an invoice's own arithmetic needs, gathered from the rows. */
const itemsOf = (rows: readonly ItemRow[]): readonly Item[] =>
  rows.map((r) => ({
    account: r.account, said: r.said, quantity: r.quantity, price: r.price,
    ...(r.tax ? { tax: r.tax } : {}),
    ...(r.centre ? { centre: r.centre } : {}),
  }));

/**
 * WHERE AN INVOICE'S SIDES LAND.
 *
 * ⚠️ THE ROLE DECIDES, NOT THE DOCUMENT, WHICH IS THE WHOLE INTERNATIONAL DESIGN.
 * A sale debits whatever account the workspace tagged `receivable` and credits
 * whatever it tagged `tax_output`; a German chart and a British one differ in
 * every name and in nothing this function reads.
 */
async function homesFor(
  c: Ctx, db: Db, way: Way,
): Promise<
  { party: string; taxTo: (code: string) => string; exchange: string | undefined } | null
> {
  const roles = await rolesOf(db, c.tenantId);
  const party = roles.get(way === "out" ? "receivable" : "payable");
  const taxes = roles.get(way === "out" ? "tax_output" : "tax_input");
  if (!party || !taxes) return null;
  /* ⚠️ ONE TAX ACCOUNT PER SIDE, WHICH IS THE HONEST SHIPPING SHAPE. A workspace
     filing several taxes separately wants an account each, and that is a column
     on the code — deliberately not built until a workspace has two, because the
     role already answers it for everyone who has one. */
  /* ⚠️ AND THE EXCHANGE ACCOUNT IS OPTIONAL HERE ON PURPOSE, because a workspace
     billing in its own money never needs one. It is refused where a foreign
     document actually asks for it, not at the door of every invoice. */
  return { party, taxTo: () => taxes, exchange: roles.get("exchange") };
}

/**
 * WHAT CURRENCY A DOCUMENT IS IN, AND WHETHER THAT NEEDS CONVERTING.
 *
 * ⚠️ BLANK MEANS THE WORKSPACE'S OWN, AND SO DOES NAMING IT. Almost every
 * document is in the currency the books are kept in, and neither spelling of
 * that should cost a conversion, a rate, an exchange account or a refusal.
 */
const foreignTo = (said: string | null, base: string): string | null =>
  said && said !== base ? said : null;

/**
 * ⚠️ EVERY REFUSAL AN INVOICE HAS, ASKED BEFORE ITS NUMBER IS ISSUED. That order
 * is the whole of `AppSpec.postings`: a number cannot be given back, so a
 * document that took one and then found the month shut is evidence with no entry
 * behind it and no way to undo either half.
 */
function mayBill(way: Way) {
  return async (ctx: unknown, id: string, what: DocumentMove): Promise<void> => {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const held = await invoiceAt(db, c.tenantId, id, way);
    if (!held) return c.fail("platform.not_found");

    /*
      ⚠️ THE CALENDAR IS ASKED ON BOTH MOVES AND THE CONTENTS ON ONLY ONE. A
      cancellation writes a reversing entry, so a shut month refuses it for
      exactly the reason it refuses the original — but the lines are already what
      they were, and re-checking them would refuse a withdrawal of a document
      somebody is withdrawing BECAUSE it is wrong.
    */
    if (what === "submit") {
      const wrong = refuseItems(itemsOf(held.items));
      if (wrong === "no_items") return c.fail("book.empty_invoice");
      if (wrong === "nothing_charged") return c.fail("book.nil_invoice");
      if (wrong) return c.fail("platform.invalid", {}, { fields: { lines: "Check the lines" } });
    }

    const homes = await homesFor(c, db, way);
    if (!homes) {
      return c.fail("book.no_account", {}, { fields: { party: way === "out"
        ? "No account is marked for what customers owe"
        : "No account is marked for what this business owes" } });
    }

    /*
      ⚠️ A FOREIGN DOCUMENT NEEDS THREE THINGS AND EVERY ONE OF THEM IS ASKED FOR
      HERE. Without a workspace currency there is nothing to convert INTO; without
      a rate the conversion is a guess; and without an exchange account the
      remainder that line-by-line rounding leaves has nowhere to go, so an entry
      that is a penny out reaches `writeEntry` and is refused there — after the
      number is issued.
    */
    const foreign = foreignTo(held.sale.currency, c.currency);
    if (foreign) {
      if (!c.currency) return c.fail("book.no_currency");
      if (refuseRate(held.sale.rate ?? 0)) {
        return c.fail("book.bad_rate", {},
          { fields: { rate: `What one ${foreign} is worth, in millionths` } });
      }
      if (!homes.exchange) return c.fail("book.no_exchange");
    }

    /* ⚠️ THE CALENDAR, ASKED HERE RATHER THAN BY THE WRITE. `writeEntry` would
       refuse it too — and by then the number is issued, or the document is
       already withdrawn. */
    const { years, periods } = await calendarOf(db, c.tenantId);
    const shut = refusePostingOn(held.sale.day, years, periods);
    if (shut) refuseCalendar(c, shut);
  };
}

/**
 * ⚠️ AND NOW IT STANDS, SO THIS HALF ONLY WRITES. The entry is filed under the
 * number the customer's copy carries, which is what makes a figure in the ledger
 * traceable to a piece of paper somebody holds.
 */
function postBill(way: Way) {
  return async (ctx: unknown, at: { id: string; number: string }): Promise<void> => {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const held = await invoiceAt(db, c.tenantId, at.id, way);
    if (!held) return;
    const homes = await homesFor(c, db, way);
    if (!homes) return;

    const items = itemsOf(held.items);
    const charged = entryFor(items, chargeOf(items, held.rates), homes, way, at.number);

    /*
      ⚠️ THE DOCUMENT'S FIGURES ARE IN THE CURRENCY IT WAS BILLED IN, AND THE
      LEDGER'S ARE NOT. Everything above is the customer's copy — their prices,
      their tax, their total — and the entry is that converted at the rate the
      document carries, with what actually moved kept on every line. `mayBill`
      asked for the rate and the exchange account, so neither is missing here.
    */
    const foreign = foreignTo(held.sale.currency, c.currency);
    const lines = foreign
      ? inBaseLines(charged, foreign, held.sale.rate ?? 0, c.currency,
        homes.exchange ?? "", at.number)
      : charged;
    if (typeof lines === "string") {
      throw new Error(`${at.number} could not be converted: ${lines}`);
    }

    /* ⚠️ THE PARTY BY NAME, because a journal entry reading `pty_0m7…` is a
       figure nobody can check against the document it came from. */
    const called = (await namesOf(db, c.tenantId)).get(held.sale.party) ?? "";
    const posted = await writeEntry(c, db, {
      day: held.sale.day,
      memo: called ? `${at.number} · ${called}` : `${at.number} · ${held.sale.memo}`,
      source: way === "out" ? "sale.posted" : "bill.posted",
      /* ⚠️ THE DOCUMENT'S OWN ID, so the entry and the document can be read from
         each other — which is B2's "why is this account moving", answered by a
         row rather than by reading source, AND what the reversal below finds. */
      ref: at.id,
      lines,
    });
    /* ⚠️ IT CANNOT REFUSE HERE, because `mayBill` asked. If it somehow does, the
       throw is loud and the operation fails rather than answering success over a
       document with no entry. */
    if ("why" in posted) throw new Error(`${at.number} could not post: ${posted.why}`);
  };
}

/**
 * WITHDRAWING A BILL REVERSES WHAT IT POSTED.
 *
 * ⚠️ IT REVERSES WHAT IS THERE RATHER THAN RE-DERIVING IT, and that is the whole
 * reason the entry carries the document's id. Recomputing the lines from the
 * document would be the same arithmetic twice — and the second copy would be run
 * against rows somebody may have edited while the bill was a draft again, so a
 * withdrawal could reverse a figure that was never posted.
 *
 * ⚠️ AND IT IS A NEW ENTRY, NOT A DELETED ONE. What happened is that a bill was
 * recorded and then withdrawn, and both are facts — the same rule `year.reopen`
 * follows. A ledger that forgets is a ledger nobody can audit.
 */
function unpostBill(way: Way) {
  return async (ctx: unknown, at: { id: string; number: string }): Promise<void> => {
    const c = ctx as Ctx;
    const db = c.db as Db;
    /* ⚠️ THE FOREIGN THREE COME BACK WITH IT, because what a withdrawal has to
       undo is the HOLDING as well as the figure: leaving `original` behind would
       reverse the base amount and leave the account still holding somebody
       else's money, which the next revaluation would then restate. */
    const was = await db.prepare(
      `SELECT p.account AS account, p.centre AS centre, p.amount AS amount,
              p.currency AS currency, p.original AS original, p.rate AS rate,
              j.day AS day
         FROM posting p JOIN journal j ON j.id = p.journal
        WHERE p.tenant_id = ? AND j.ref = ? AND j.source = ?`)
      .bind(c.tenantId, at.id, way === "out" ? "sale.posted" : "bill.posted")
      .all<{
        account: string; centre: string | null; amount: number;
        currency: string | null; original: number | null; rate: number | null; day: string;
      }>();

    const rows = was.results ?? [];
    /* ⚠️ NOTHING POSTED IS NOT A FAULT. A document cancelled before it was ever
       submitted never reached this half; one whose entry is missing is a
       workspace that predates the rail, and refusing would trap it. */
    if (!rows.length) return;

    const posted = await writeEntry(c, db, {
      day: rows[0]?.day ?? c.now.slice(0, 10),
      memo: `${at.number} withdrawn`,
      source: way === "out" ? "sale.unposted" : "bill.unposted",
      ref: at.id,
      lines: rows.map((r) => ({
        account: r.account,
        amount: -r.amount,
        memo: `${at.number} withdrawn`,
        ...(r.centre ? { centre: r.centre } : {}),
        /* ⚠️ AT THE RATE IT WAS POSTED AT, NEVER AT TODAY'S. A withdrawal undoes
           what happened; converting it afresh would post the difference between
           two rates as an exchange gain the business never made. */
        ...(r.currency
          ? { currency: r.currency, original: -(r.original ?? 0), rate: r.rate }
          : {}),
      })),
    });
    if ("why" in posted) throw new Error(`${at.number} could not be withdrawn: ${posted.why}`);
  };
}

/**
 * RESTATING WHAT THE FOREIGN ACCOUNTS ARE WORTH TODAY.
 *
 * ⚠️ A BALANCE SHEET IS AS AT A DATE, AND A FOREIGN BALANCE HAS TO BE SHOWN AT
 * THAT DATE'S RATE. A dollar account filled when a dollar was 3.60 and still
 * reported at 3.60 a year later states a figure that was true once — every
 * jurisdiction requires it restated, and the difference is a gain or a loss the
 * business has already made whether or not anybody writes it down.
 *
 * ⚠️ IT POSTS AN ENTRY RATHER THAN SHOWING A NUMBER, which is the same argument
 * `year.close` makes. A revaluation nobody posted is a figure on a screen that
 * the next report disagrees with; posted, it is in the ledger and every report
 * derives from it.
 *
 * ⚠️ AND AN ACCOUNT IT HAS NO RATE FOR IS LEFT OUT AND NAMED. Guessing a rate is
 * inventing a figure and posting it; skipping silently would be a report that
 * ran, said it succeeded, and left the one account somebody was asking about
 * exactly as wrong as it was.
 */
const revalue = operation<{ day: string }, { journal: string; moved: number; missing: string }>({
  id: "book.revalue",
  kind: "write",
  summary: "Restate the foreign accounts at today's rates",
  input: { day: field.day({ label: "As at", required: true, holds: "none" }) },
  output: {
    journal: field.text({ label: "Entry", holds: "none" }),
    moved: field.money({ label: "Gain or loss", holds: "none" }),
    missing: field.text({ label: "No rate for", holds: "none" }),
  },
  permission: "journal:write",
  idempotency: { mode: "key" },
  emits: ["book.revalued"],
  outcome: { message: "Restated.", tone: "success", invalidates: ["journal.list"] },
  fails: ["book.no_currency", "book.no_exchange"],
  audit: (input) => ({ subject: String(input.day), verb: "revalued the foreign accounts" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    if (!c.currency) return c.fail("book.no_currency");

    const home = await db.prepare(
      `SELECT id FROM account WHERE tenant_id = ? AND role = 'exchange' AND closed = 0 LIMIT 1`)
      .bind(c.tenantId).first<Row>();
    if (!home) return c.fail("book.no_exchange");

    /*
      ⚠️ SUMMED IN ONE STATEMENT, AND THE ACCOUNT'S OWN CURRENCY DECIDES. What is
      IN the account is the sum of `original`; what the books say it was worth is
      the sum of `amount`, converted on the day each posting landed. The gap
      between them is the whole report.
    */
    const sums = await db.prepare(
      `SELECT p.account AS account, a.currency AS currency,
              COALESCE(SUM(p.original), 0) AS original, COALESCE(SUM(p.amount), 0) AS base
         FROM posting p JOIN journal j ON j.id = p.journal
         JOIN account a ON a.id = p.account
        WHERE p.tenant_id = ? AND j.day <= ?
          AND a.currency IS NOT NULL AND a.currency <> '' AND a.currency <> ?
        GROUP BY p.account, a.currency`)
      .bind(c.tenantId, String(input.day), c.currency)
      .all<Holding>();

    const held = sums.results ?? [];
    const rates = await ratesOn(db, c.tenantId, String(input.day));
    const lines = revalueLines(held, rates, c.currency, String(home.id),
      `Revalued ${String(input.day)}`);
    const missing = unrated(held, rates).join(", ");

    /* ⚠️ NOTHING TO POST IS A SUCCESS, not a refusal. A workspace whose rates
       have not moved is a workspace whose books are already right. */
    if (!lines.length) return { journal: "", moved: 0, missing };

    const posted = await writeEntry(c, db, {
      day: String(input.day),
      memo: `Revalued ${String(input.day)}`,
      source: "book.revalue",
      lines,
    });
    if ("why" in posted) refuseCalendar(c, posted);
    return {
      journal: posted.journal,
      moved: -(lines[lines.length - 1]?.amount ?? 0),
      missing,
    };
  },
});

/**
 * WHAT ONE ACCOUNT COMES TO.
 *
 * ⚠️ THE SAME SUM, ASKED OF ONE ROW, RATHER THAN A SECOND ANSWER. It would have
 * been cheaper to have the account page add its own lines up in the browser, and
 * that is exactly how a screen comes to disagree with a report — two narrowings
 * of one question, written apart, drifting the first time either is edited.
 */
const standing = operation<{ account: string }, { standing: { balance: number }[] }>({
  id: "book.standing",
  kind: "read",
  summary: "What one account comes to",
  input: { account: field.text({ label: "Account", required: true, holds: "none" }) },
  output: { standing: field.json({ label: "Standing", holds: "none" }) },
  permission: "journal:read",
  idempotency: { mode: "none" },
  fails: [],
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const row = await (c.db as Db).prepare(
      `SELECT COALESCE(SUM(amount), 0) AS balance
         FROM posting WHERE tenant_id = ? AND account = ?`)
      .bind(c.tenantId, input.account)
      .first<{ balance: number }>();
    return { standing: [{ balance: row?.balance ?? 0 }] };
  },
});

/* ------------------------------------------------------------- the sweep --- */

/**
 * WHAT THE BOOKS COULD NOT PLACE, TOLD TO SOMEBODY.
 *
 * ⚠️ THIS EXISTS BECAUSE `hears` CANNOT SPEAK. A posting raised by an event is
 * delivered after the write, with no session, no screen and no notification seam
 * — so when a role has no home and the money lands in suspense, the only trace is
 * a row nobody is looking at. That is the one genuinely dangerous silence in this
 * product: the books balance, every screen is green, and money is sitting
 * somewhere it does not belong.
 *
 * ⚠️ SO THE JOB IS THE VOICE THE SEAM DOES NOT HAVE. It asks one question a night
 * — is anything in suspense — and tells whoever keeps the books. Nothing else
 * about it is clever, and it should not become clever: a sweep that started
 * checking six things is a sweep whose failure means six unasked questions.
 */
const suspenseSweep = declareJob({
  id: "book.suspense",
  label: "Money the books could not place",
  why: "Tells whoever keeps the books if anything has landed in suspense, which is money sitting somewhere it does not belong.",
  /* ⚠️ EARLY MORNING UTC, AND IT IS A COMPROMISE SAID TO BE ONE — the same one
     OneInventory's sweep makes. A workspace's day starts wherever it is standing
     and the platform has no per-workspace timezone to run against. */
  schedule: "0 6 * * *",
  scope: "per-tenant",
  /* ⚠️ RETRY IS SAFE BECAUSE THE ANSWER IS A SUM. A second attempt reads the same
     rows and reaches the same figure; the only cost is a repeated note in the
     narrow case where the first attempt failed after telling somebody. */
  onFail: { then: "retry", times: 3 },
  rerunnable: true,
  emits: ["book.suspended"],
  budgetSeconds: 15,
  async work(ctx) {
    const db = ctx.db as Db;
    const row = await db.prepare(
      `SELECT COALESCE(SUM(p.amount), 0) AS held
         FROM posting p JOIN account a ON a.id = p.account AND a.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND a.role = 'suspense'`)
      .bind(ctx.tenantId)
      .first<{ held: number }>();

    const held = row?.held ?? 0;
    /* ⚠️ NOTHING IN SUSPENSE IS THE ORDINARY NIGHT, AND IT SAYS SO RATHER THAN
       reporting nothing at all — a run that touched nothing and a run that did
       not happen look identical in the console otherwise. */
    if (held === 0) return { touched: 0, detail: "nothing in suspense" };

    await ctx.tell?.("book.suspended", { amount: String(held) });
    return { touched: 1, detail: "money is sitting in suspense" };
  },
});

/* ------------------------------------------------------------------ years --- */

interface YearRow {
  readonly id: string;
  readonly opens: string;
  readonly closes: string;
  readonly closed: number | null;
}

interface OpeningYear {
  readonly name: string;
  readonly opens: string;
  readonly closes: string;
  readonly months?: boolean;
}
interface OpenedYear { readonly year: string; readonly periods: number }
interface OneYear { readonly year: string }
interface ClosedYear { readonly moved: number; readonly journal: string }
interface Reopened { readonly journal: string }
interface Shutting { readonly period: string; readonly shut?: boolean }
interface Shut { readonly shut: boolean }

/** ⚠️ One read, and it is what both the refusals and the closing entry need. */
const yearsOf = async (db: Db, tenantId: string): Promise<readonly Year[]> => {
  const got = await db.prepare(
    `SELECT id, opens, closes, closed FROM year WHERE tenant_id = ? ORDER BY opens`)
    .bind(tenantId).all<YearRow>();
  return got.results.map((r) => ({ ...r, closed: !!r.closed }));
};

/**
 * OPEN A FINANCIAL YEAR, AND OFFER ITS MONTHS.
 *
 * ⚠️ THE MONTHS ARE MADE HERE RATHER THAN TYPED. A workspace closing monthly
 * would otherwise enter twelve date ranges, and every one of them is a chance to
 * leave a gap — a week belonging to no period, which nothing refuses because a
 * period is optional. `monthsIn` cannot leave one.
 */
const openYear = operation<OpeningYear, OpenedYear>({
  id: "year.open",
  kind: "write",
  summary: "Open a financial year",
  input: {
    name: field.text({ label: "Name", required: true, holds: "none", max: 60 }),
    opens: field.day({ label: "First day", required: true, holds: "none" }),
    closes: field.day({ label: "Last day", required: true, holds: "none" }),
    months: field.bool({
      label: "Make its months",
      holds: "none",
      help: "For books that are closed off every month rather than once a year.",
    }),
  },
  output: {
    year: field.text({ label: "Year", holds: "none" }),
    periods: field.number({ label: "Periods", holds: "none" }),
  },
  permission: "year:write",
  idempotency: { mode: "key" },
  emits: ["year.opened"],
  outcome: { message: "The year is open.", tone: "success", invalidates: ["year.list"] },
  fails: ["book.year_overlaps", "book.year_backwards", "book.year_too_long"],
  audit: (input) => ({ subject: String(input.name), verb: "opened a financial year" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const opens = String(input.opens);
    const closes = String(input.closes);

    const said = refuseYear({ opens, closes }, await yearsOf(db, c.tenantId));
    if (said === "year_overlaps") return c.fail("book.year_overlaps");
    if (said === "year_backwards") return c.fail("book.year_backwards");
    if (said === "year_too_long") return c.fail("book.year_too_long");

    const id = newId("yer");
    await db.prepare(
      `INSERT INTO year (id, tenant_id, name, opens, closes, closed, at, by)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)`)
      .bind(id, c.tenantId, String(input.name), opens, closes, c.now, c.accountId ?? null)
      .run();

    let periods = 0;
    if (input.months) {
      for (const one of monthsIn({ opens, closes })) {
        await db.prepare(
          `INSERT INTO period (id, tenant_id, year, name, opens, closes, shut, at, by)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`)
          .bind(newId("prd"), c.tenantId, id, one.name, one.opens, one.closes,
            c.now, c.accountId ?? null)
          .run();
        periods++;
      }
    }
    return { year: id, periods };
  },
});

/**
 * CLOSE A YEAR, WHICH POSTS SOMETHING.
 *
 * ⚠️ A YEAR THAT IS ONLY A FLAG IS HIDDEN RATHER THAN CLOSED — see
 * `closingLines`. What makes next year's profit-and-loss start at zero is that
 * this year's income and expense were emptied into reserves in one entry.
 * Without it every "this year" figure is really "since the books began", and it
 * is wrong by more every year.
 *
 * ⚠️ AND THE ENTRY IS DATED THE LAST DAY OF THE YEAR IT CLOSES, which is the one
 * day it can be. Dated today it would land in the NEXT year and take the profit
 * with it; dated the first of the new year it would do the same thing while
 * looking deliberate.
 */
const closeYear = operation<OneYear, ClosedYear>({
  id: "year.close",
  kind: "write",
  summary: "Close a year and move its profit to reserves",
  input: { year: field.ref({ label: "Year", required: true, holds: "none", to: "year" }) },
  output: {
    moved: field.money({ label: "Moved to reserves", holds: "none" }),
    journal: field.text({ label: "Entry", holds: "none" }),
  },
  permission: "year:write",
  idempotency: { mode: "key" },
  emits: ["year.closed"],
  outcome: { message: "The year is closed.", tone: "success", invalidates: ["year.list"] },
  fails: ["platform.not_found", "book.year_closed", "book.no_reserves"],
  audit: (input) => ({ subject: String(input.year), verb: "closed a financial year" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;

    const held = (await yearsOf(db, c.tenantId)).find((one) => one.id === String(input.year));
    if (!held) return c.fail("platform.not_found");
    if (held.closed) return c.fail("book.year_closed");

    const reserves = await db.prepare(
      `SELECT id FROM account WHERE tenant_id = ? AND role = 'retained' LIMIT 1`)
      .bind(c.tenantId).first<Row>();
    if (!reserves) return c.fail("book.no_reserves");

    /*
      ⚠️ SUMMED IN ONE STATEMENT OVER THE YEAR'S POSTINGS, and that is not a
      micro-optimisation. A year's ledger is the largest thing this product
      holds, and reading every line into the worker to add it up is the shape
      that works in a demo and times out in a business.
    */
    const sums = await db.prepare(
      `SELECT p.account AS account, a.type AS root, SUM(p.amount) AS amount
         FROM posting p JOIN journal j ON j.id = p.journal
         JOIN account a ON a.id = p.account
        WHERE p.tenant_id = ? AND j.day >= ? AND j.day <= ?
          AND a.type IN ('income', 'expense')
        GROUP BY p.account, a.type`)
      .bind(c.tenantId, held.opens, held.closes)
      .all<{ account: string; root: string; amount: number }>();

    const lines = closingLines(
      sums.results.map((r) => ({
        account: r.account,
        root: r.root as AccountStanding["root"],
        amount: r.amount,
      })),
      String(reserves.id),
      `Year end ${held.closes}`);

    /*
      ⚠️ A YEAR WITH NOTHING IN IT STILL CLOSES. `closingLines` answers with no
      lines, no entry is written, and the flag is set — because a business that
      traded in none of a year still has to be able to say that year is finished,
      and refusing would leave it permanently open and in the way.
    */
    let journal = "";
    let moved = 0;
    if (lines.length) {
      const posted = await writeEntry(c, db, {
        day: held.closes,
        memo: `Year end ${held.closes}`,
        source: "year.close",
        lines,
      });
      if ("why" in posted) refuseCalendar(c, posted);
      journal = posted.journal;
      moved = lines[lines.length - 1]?.amount ?? 0;
    }

    /* ⚠️ THE FLAG LAST, AFTER THE ENTRY LANDED. Set first, the closing entry
       would be refused by the check it had just turned on. */
    await db.prepare(
      `UPDATE year SET closed = 1, edited_at = ?, edited_by = ? WHERE id = ? AND tenant_id = ?`)
      .bind(c.now, c.accountId ?? null, held.id, c.tenantId).run();

    return { moved, journal };
  },
});

/**
 * ⚠️ REOPENING REVERSES THE CLOSING ENTRY RATHER THAN DELETING IT. A ledger that
 * forgets is a ledger nobody can audit: what happened is that the year was
 * closed and then reopened, and both are facts. The reversal is a new entry, so
 * the trail reads in the order it happened.
 */
const reopenYear = operation<OneYear, Reopened>({
  id: "year.reopen",
  kind: "write",
  summary: "Reopen a closed year",
  input: { year: field.ref({ label: "Year", required: true, holds: "none", to: "year" }) },
  output: { journal: field.text({ label: "Entry", holds: "none" }) },
  permission: "year:write",
  idempotency: { mode: "key" },
  emits: ["year.reopened"],
  outcome: { message: "The year is open again.", tone: "success", invalidates: ["year.list"] },
  fails: ["platform.not_found", "book.year_not_closed"],
  audit: (input) => ({ subject: String(input.year), verb: "reopened a financial year" }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;

    const held = (await yearsOf(db, c.tenantId)).find((one) => one.id === String(input.year));
    if (!held) return c.fail("platform.not_found");
    if (!held.closed) return c.fail("book.year_not_closed");

    /* ⚠️ THE FLAG FIRST THIS TIME, so the reversing entry may be written into the
       year it is about — the mirror of the order `year.close` uses, and for the
       same reason. */
    await db.prepare(
      `UPDATE year SET closed = 0, edited_at = ?, edited_by = ? WHERE id = ? AND tenant_id = ?`)
      .bind(c.now, c.accountId ?? null, held.id, c.tenantId).run();

    const was = await db.prepare(
      `SELECT p.account AS account, p.amount AS amount
         FROM posting p JOIN journal j ON j.id = p.journal
        WHERE p.tenant_id = ? AND j.source = 'year.close' AND j.day = ?`)
      .bind(c.tenantId, held.closes)
      .all<{ account: string; amount: number }>();

    if (!was.results.length) return { journal: "" };

    const posted = await writeEntry(c, db, {
      day: held.closes,
      memo: `Year end ${held.closes} reversed`,
      source: "year.reopen",
      lines: was.results.map((r) => ({
        account: r.account, amount: -r.amount, memo: "Reopened",
      })),
    });
    if ("why" in posted) refuseCalendar(c, posted);
    return { journal: posted.journal };
  },
});

/**
 * ⚠️ SHUTTING A MONTH IS THE SMALL, REVERSIBLE HALF OF THE SAME IDEA. It posts
 * nothing and moves nothing — it says an accountant has finished with those
 * weeks — so it is a switch rather than an operation with an entry behind it,
 * and undoing one costs nothing.
 */
const shutPeriod = operation<Shutting, Shut>({
  id: "period.shut",
  kind: "write",
  summary: "Shut a period, or open it again",
  input: {
    period: field.ref({ label: "Period", required: true, holds: "none", to: "period" }),
    shut: field.bool({ label: "Shut", holds: "none" }),
  },
  output: { shut: field.bool({ label: "Shut", holds: "none" }) },
  permission: "year:write",
  idempotency: { mode: "key" },
  emits: ["period.shut"],
  outcome: { message: "Saved.", tone: "success", invalidates: ["period.list"] },
  fails: ["platform.not_found"],
  audit: (input) => ({
    subject: String(input.period),
    verb: input.shut ? "shut a period" : "reopened a period",
  }),
  async handler(ctx, input) {
    const c = ctx as Ctx;
    const db = c.db as Db;
    const shut = input.shut ? 1 : 0;
    const done = await db.prepare(
      `UPDATE period SET shut = ?, edited_at = ?, edited_by = ?
        WHERE id = ? AND tenant_id = ?`)
      .bind(shut, c.now, c.accountId ?? null, String(input.period), c.tenantId).run();
    if (!done.meta?.changes) return c.fail("platform.not_found");
    return { shut: !!shut };
  },
});

/* --------------------------------------------------------------- the app --- */

const manifest = (): AppSpec => defineApp({
  id: "book",
  name: "OneBook",
  /*
    ⚠️ A PAGE DIVIDED INTO TWO COLUMNS, WHICH IS LITERALLY WHAT DOUBLE-ENTRY IS.
    Debit on one side, credit on the other, and the mark is the one idea the whole
    product rests on drawn in a single character. It is also deliberately not a
    ruled page: OneInventory's mark is already a set of bars, and two products
    distinguished only by the direction of their lines is a navigation bar nobody
    can read at a glance.
  */
  mark: "◫",
  /*
    ⚠️ GREEN, AND IT IS THE ONE COLOUR THIS SUBJECT HAS EVER HAD. Ledger paper,
    an accountant's eyeshade, the column rules on a bought book — accounting is
    the rare business subject with a real inherited colour, and reaching past it
    for something more fashionable would be reaching for nothing.
  */
  hue: "oklch(0.74 0.13 155)",

  access: {
    permissions: [
      "account:read", "account:write",
      /*
        ⚠️ CLOSING A YEAR IS NOT POSTING TO IT, AND IT IS NOT SHAPING THE CHART
        EITHER. It moves a year's profit into reserves and stops anybody adding
        to what was filed — the one act in this product that reaches backwards
        over everything already recorded. Whoever does the week's invoices
        should not be able to do it by accident, so it is its own key.
      */
      "year:read", "year:write",
      /*
        ⚠️ SHAPING THE CHART AND POSTING TO IT ARE DIFFERENT GRANTS. Somebody
        entering the week's invoices posts all day and must never be able to move
        what an account is FOR — that is the difference between a bookkeeper and
        whoever decides how the business is measured, and it is the same rule
        OneInventory draws between taking stock and correcting it.
      */
      "journal:read", "journal:write",
    ],
    roles: {
      /* ⚠️ Opens the books, shapes the chart, closes an account. */
      keeper: [
        "account:read", "account:write", "journal:read", "journal:write",
        "year:read", "year:write",
      ],
      /* ⚠️ Reads the chart — which is what somebody coding an invoice needs and
         all they need. */
      /* ⚠️ A user SEES which months are shut and cannot shut one — otherwise the
         refusal they meet when posting has no explanation on any screen they
         can reach. */
      user: ["account:read", "journal:read", "journal:write", "year:read"],
      viewer: ["account:read", "journal:read", "year:read"],
    },
    presets: [
      {
        id: "alone", name: "On your own",
        said: "One person keeping the books. Opens them and shapes the chart.",
        permissions: [
      "account:read", "account:write",
      /*
        ⚠️ CLOSING A YEAR IS NOT POSTING TO IT, AND IT IS NOT SHAPING THE CHART
        EITHER. It moves a year's profit into reserves and stops anybody adding
        to what was filed — the one act in this product that reaches backwards
        over everything already recorded. Whoever does the week's invoices
        should not be able to do it by accident, so it is its own key.
      */
      "year:read", "year:write",
      /*
        ⚠️ SHAPING THE CHART AND POSTING TO IT ARE DIFFERENT GRANTS. Somebody
        entering the week's invoices posts all day and must never be able to move
        what an account is FOR — that is the difference between a bookkeeper and
        whoever decides how the business is measured, and it is the same rule
        OneInventory draws between taking stock and correcting it.
      */
      "journal:read", "journal:write",
    ],
      },
      {
        id: "bookkeeper", name: "Keeps the books",
        said: "Shapes the chart and closes what is no longer used.",
        permissions: [
      "account:read", "account:write",
      /*
        ⚠️ CLOSING A YEAR IS NOT POSTING TO IT, AND IT IS NOT SHAPING THE CHART
        EITHER. It moves a year's profit into reserves and stops anybody adding
        to what was filed — the one act in this product that reaches backwards
        over everything already recorded. Whoever does the week's invoices
        should not be able to do it by accident, so it is its own key.
      */
      "year:read", "year:write",
      /*
        ⚠️ SHAPING THE CHART AND POSTING TO IT ARE DIFFERENT GRANTS. Somebody
        entering the week's invoices posts all day and must never be able to move
        what an account is FOR — that is the difference between a bookkeeper and
        whoever decides how the business is measured, and it is the same rule
        OneInventory draws between taking stock and correcting it.
      */
      "journal:read", "journal:write",
    ],
      },
      {
        id: "reads", name: "Reads them",
        said: "Sees the chart. Changes nothing.",
        permissions: ["account:read"],
      },
    ],
    founding: "keeper",
    seats: { counts: ["owner", "manager", "staff"], entitlement: "seats" },
  },

  /*
    ⚠️ NO ENTITLEMENT KEY AT ALL, AND THAT IS A DECISION RATHER THAN AN OMISSION.
    One membership buys every product (D121), so the question is not whether to
    sell accounting — it is whether anything here is a SIZE worth metering. A
    chart is thirty rows; a workspace that hit a ceiling on it would be a
    workspace that cannot describe its own money.

    ⚠️ THE JOURNAL IS WHERE THAT QUESTION COMES BACK, and it is a real one: a
    ledger grows with every transaction for ever. It is answered when there is a
    journal to answer it about, not guessed at now.
  */
  entitlements: {},

  /*
    ⚠️ THE ADDRESS BOOK IS ONEPARTY'S AND THIS IS THE WHOLE OF THE SEAM (D120).
    An invoice names a customer; who that customer IS lives in one place for
    every product, so a party OneInventory buys from and a party OneBook invoices
    are the same row. What crosses is the record's name and nothing else (D122).
  */
  borrows: ["party"],

  /*
    ⚠️ WHAT A SUBMITTED INVOICE ACTUALLY DOES — see `AppSpec.postings`. The rail
    sets a standing and issues a number, and neither of those is what an invoice
    is FOR. `may` is asked before the number is taken and holds every refusal;
    `post` writes the entry once the document stands.
  */
  postings: {
    /* ⚠️ AN INVOICE HAS NO `undo` AND A BILL DOES, which is the asymmetry in one
       line: a document a customer holds is corrected by a credit note, and one
       nobody outside this workspace has seen is withdrawn. The kernel refuses
       either half being wrong. */
    "sale.posted": { may: mayBill("out"), post: postBill("out") },
    "bill.posted": { may: mayBill("in"), post: postBill("in"), undo: unpostBill("in") },
  },

  collections: [account, bill, billLine, centre, journal, posting, rate, rule,
    sale, saleLine, tax, year, period],

  operations: [start, extend, post, trial, standing, centres, revalue,
    openYear, closeYear, reopenYear, shutPeriod],

  /*
    ⚠️ ONE EVENT, AND THE COUNT IS HONEST RATHER THAN A START. `buying.received`
    is B2's own example and the only event in this deployment whose ANSWER
    currently carries money — see `RULES` in `posting.ts` for what is absent and
    why each absence would be WRONG rather than merely missing.

    ⚠️ ONEINVENTORY KNOWS NOTHING ABOUT ANY OF THIS. It raises the event it always
    raised; this app declares that it listens. A workspace without OneBook leaves
    the event simply unheard, which is the ordinary case and not a fault.

    ⚠️ AND IT CANNOT REFUSE THE RECEIPT. `hears` is delivered after the write and
    swallows its own failures (D120) — an accounting entry is a CONSEQUENCE of a
    goods receipt, and refusing the receipt because a chart of accounts is
    misconfigured would make one product's setup another product's outage.
  */
  hears: {
    "buying.received": {
      why: "A delivery arrives: the stock is worth something and nobody has invoiced for it yet.",
      async handler(ctx, raised) {
        const db = ctx.db as Db;
        const held = await db.prepare(
          "SELECT id, event, memo, enabled, sides FROM posting_rule WHERE tenant_id = ? AND event = ?")
          .bind(ctx.tenantId, raised.event)
          .first<{ memo: string; enabled: number; sides: string }>();
        /* ⚠️ NO RULE OR A RULE TURNED OFF IS SILENCE, NOT A FAILURE. A workspace
           whose accountant posts purchases by hand turned it off on purpose. */
        if (!held || !held.enabled) return;

        let sides: Rule["sides"] = [];
        try { sides = JSON.parse(held.sides) as Rule["sides"]; } catch { return; }

        const roles = await rolesOf(db, ctx.tenantId);
        const out = fire({ event: raised.event, sides }, {
          answer: raised.answer,
          accountFor: (role: Role) => roles.get(role) ?? null,
        });
        /*
          ⚠️ TWO KINDS OF NOT-POSTING, AND ONLY ONE OF THEM IS ORDINARY. A receipt
          with no price on it has nothing to post — `landed` is `money | null` on
          the operation that raised this — and a rule whose figure is zero is a
          day when nothing happened. Both are silence, correctly.

          ⚠️ EVERYTHING ELSE IS A WORKSPACE WHOSE BOOKS HAVE QUIETLY STOPPED
          POSTING, and it throws so that somebody sees it. `heard()` catches,
          logs which app heard what and threw, and lets the receipt stand — which
          is the whole design of the seam: the goods are on the shelf either way,
          and the operator gets told the accounting behind them is broken.
        */
        if (!out.ok) {
          if (out.why === "no_amount" || out.why === "nothing_moves") return;
          throw new Error(`posting rule for ${raised.event} could not fire: ${out.why}`);
        }

        const posted = await writeEntry(
          { tenantId: ctx.tenantId, now: ctx.now, accountId: ctx.by ?? undefined },
          db,
          {
            day: String(raised.input.day ?? ctx.now.slice(0, 10)),
            memo: held.memo,
            source: raised.event,
            /* ⚠️ THE ORDER'S OWN IDENTIFIER, AS A STRING. OneBook may not point
               at OneInventory's tables (B1), so what it keeps is what it was
               told — enough to look up, not enough to couple. */
            ref: String(raised.input.buying ?? ""),
            lines: out.lines,
          },
        );
        /*
          ⚠️ A SHUT MONTH ON THE EVENT PATH THROWS, WHICH IS THE SAME ANSWER AS A
          BROKEN RULE ONE LINE UP. There is nobody to tell: the goods are on the
          shelf whatever the books say, and the alternative — dropping the entry
          — is a workspace whose ledger silently stops matching its stock. The
          `hears` seam catches this, logs which app heard what, and lets the
          receipt stand.
        */
        if ("why" in posted) {
          throw new Error(
            `${raised.event} could not post on ${String(raised.input.day ?? "")}: ${posted.why}`);
        }
      },
    },
  },

  jobs: { "book.suspense": suspenseSweep },

  /*
    ⚠️ ONE NOTIFICATION, AND IT IS THE ONE THE `hears` SEAM CANNOT RAISE ITSELF.
    Everything else this product does is a person pressing something and being
    told on the spot; the only thing that happens while nobody is looking is a
    posting landing somewhere it does not belong.

    ⚠️ THE AUDIENCE IS A PERMISSION, NEVER A ROLE. A workspace that makes a role
    of its own must still be told, and a book addressed to `keeper` stops
    reaching anybody the moment somebody does that — silently, with the dispatch
    reporting success over an empty audience.
  */
  notifications: {
    "book.suspended": {
      id: "book.suspended",
      label: "Money the books could not place",
      /* ⚠️ THE FIGURE IS IN THE LINE, because "something is in suspense" is a
         sentence somebody has to open the app to act on, and £4.20 and £42,000
         are two different mornings. */
      summary: "{amount} is sitting in suspense",
      category: "action",
      author: "theirs",
      tone: "warning",
      icon: "money",
      needs: "journal:read",
      on: "book.suspended",
      link: "/trial",
      variables: ["amount"],
      channels: ["inbox", "email"],
    },
  },

  settingAreas: {
    books: area({
      id: "books", label: "Books", icon: "money", order: 0,
      said: "Which chart of accounts this workspace started from",
    }),
  },

  /*
    ⚠️ ONE SETTING, AND IT IS A FACT WITH A CONSEQUENCE RATHER THAN A PREFERENCE.
    It records which template the books were opened from, and `book.extend` reads
    it — so a workspace that deliberately chose another country's chart is topped
    up from the one it chose rather than the one its address implies.

    ⚠️ WHAT IS NOT HERE YET: the fiscal year start and the rounding rule. Both are
    real and both are read by nothing until there is a journal to close and a
    total to round, and a setting nothing reads is a screen offering somebody a
    decision that does not take effect.
  */
  settings: {
    "book.chart": setting({
      id: "book.chart", level: "tenant", area: "books",
      field: field.enum({
        label: "Started from", holds: "none",
        values: CHARTS.map((one) => one.id),
        labels: Object.fromEntries(CHARTS.map((one) => [one.id, one.name])),
      }),
      fallback: "universal", needs: "tenant:manage",
      help: "Only decides what a top-up would add. Your accounts are yours.",
    }),
    /*
      ⚠️ OFF BY DEFAULT, AND THAT IS NOT TIMIDITY. Most businesses have one place
      and no departments; requiring a cost centre on a workspace with one centre
      is a compulsory field with one answer in front of every entry. It is on for
      the workspace that has branches and wants none of them missed, which is a
      decision somebody makes once and means.

      ⚠️ AND IT ONLY BITES ON THE PROFIT AND LOSS — see `refusePlacing`. Asking
      which department a bank balance belongs to is a question with no answer, so
      a rule that covered the balance sheet would make a payment unrecordable.
    */
    "book.centre_required": setting({
      id: "book.centre_required", level: "tenant", area: "books",
      field: field.bool({ label: "Ask for one on every line", holds: "none" }),
      fallback: false, needs: "tenant:manage",
      help: "For a business with branches, where a figure with no home is a figure lost.",
    }),
  },

  problems: {
    /*
      ⚠️ THE REFUSAL THAT PROTECTS TWO YEARS OF POSTINGS. Somebody pressing this
      a second time is almost always somebody who thinks the first press failed —
      so the sentence says the books are already open rather than reporting an
      error about a duplicate.
    */
    "book.already_open": {
      status: 409, retryable: false, tone: "warning",
      title: "The books are already open",
      detail: "Add or rename accounts instead — a chart is only started once.",
    },
    "book.not_open": {
      status: 409, retryable: false, tone: "warning",
      title: "The books are not open yet",
      detail: "Start them from a chart of accounts first.",
    },
    /*
      ⚠️ THE ONE REFUSAL THE WHOLE PRODUCT RESTS ON, and it says the figures
      rather than the rule. Somebody looking at an entry that will not post wants
      to know by how much and on which side, which is what they will fix.
    */
    "book.unbalanced": {
      status: 409, retryable: false, tone: "warning",
      title: "The two sides do not agree",
      detail: "Every entry adds up to nothing. Check the amounts.",
    },
    "book.no_account": {
      status: 409, retryable: false, tone: "warning",
      title: "One line has nowhere to go",
      detail: "Every line names an account that is open. Check the lines.",
    },
    /*
      ⚠️ THE COMMONEST CAUSE IS A WORKSPACE THAT HAS NOT SET ITS YEAR UP, and the
      second is a typo in a date — so the sentence names the day rather than the
      rule, because the day is what tells the two apart at a glance.
    */
    "book.outside_a_year": {
      status: 409, retryable: false, tone: "warning",
      title: "{day} is in no financial year",
      plain: "That date is in no financial year",
      detail: "Open the year it falls in, or check the date.",
    },
    "book.year_closed": {
      status: 409, retryable: false, tone: "warning",
      title: "That year is closed",
      detail: "Its profit has been moved to reserves. Post to the current year.",
    },
    "book.period_shut": {
      status: 409, retryable: false, tone: "warning",
      title: "{period} is shut",
      plain: "That month is shut",
      detail: "Somebody signed that month off. Post to an open one, or reopen it.",
    },
    "book.year_overlaps": {
      status: 409, retryable: false, tone: "warning",
      title: "That overlaps a year you already have",
      detail: "A day in two years appears in two profit-and-loss statements.",
    },
    "book.year_backwards": {
      status: 409, retryable: false, tone: "warning",
      title: "That year ends before it starts",
      detail: "Check the two dates.",
    },
    "book.year_too_long": {
      status: 409, retryable: false, tone: "warning",
      title: "That year is longer than two years",
      detail: "Check the last day — this is usually a mistyped year.",
    },
    "book.year_not_closed": {
      status: 409, retryable: false, tone: "warning",
      title: "That year is already open",
      detail: "Nothing to reopen.",
    },
    /*
      ⚠️ THE SENTENCE SAYS WHERE THE RULE COMES FROM, because somebody meeting it
      for the first time did not switch it on and has no idea why an entry that
      balances is refused.
    */
    "book.centre_needed": {
      status: 409, retryable: false, tone: "warning",
      title: "Every income and expense line needs a cost centre",
      detail: "This workspace asks for one. Change it in the books settings.",
    },
    "book.no_centre": {
      status: 409, retryable: false, tone: "warning",
      title: "One line names a closed cost centre",
      detail: "Every centre a line names is open. Check the lines.",
    },
    /*
      ⚠️ A DEPLOYMENT THAT NEVER SET A CURRENCY CANNOT CONVERT ANYTHING, and a
      guessed one is a figure wrong by a factor nobody can see. It is a real
      configuration gap rather than a mistake this person made, so the sentence
      says where to fix it.
    */
    "book.empty_invoice": {
      status: 409, retryable: false, tone: "warning",
      title: "This invoice has no lines",
      detail: "Add what it is for before sending it.",
    },
    /*
      ⚠️ THE ONE THAT PASSES EVERY OTHER CHECK. An invoice coming to nothing is a
      numbered document, sent to a customer, asking for no money — and every
      arithmetic rule is satisfied by it.
    */
    "book.nil_invoice": {
      status: 409, retryable: false, tone: "warning",
      title: "This invoice asks for nothing",
      detail: "Every line comes to zero. A credit note is how to say nothing is owed.",
    },
    "book.no_currency": {
      status: 409, retryable: false, tone: "warning",
      title: "This workspace has no currency",
      detail: "Set one before recording anything in another.",
    },
    "book.bad_rate": {
      status: 409, retryable: false, tone: "warning",
      title: "That rate is not a rate",
      detail: "A rate is a whole number of millionths. Check the line.",
    },
    /*
      ⚠️ THE FIGURE AND THE RATE HAVE TO AGREE, because the ledger adds up one of
      them and a bank statement reconciles against the other. Two numbers that
      disagree is a set of books that balances and cannot be reconciled.
    */
    "book.rate_disagrees": {
      status: 409, retryable: false, tone: "warning",
      title: "The amount and the rate do not agree",
      detail: "The amount is what the rate gives. Check the line.",
    },
    "book.no_exchange": {
      status: 409, retryable: false, tone: "warning",
      title: "There is nowhere to put the difference",
      detail: "One account has to be marked for exchange gain or loss.",
    },
    "book.no_reserves": {
      status: 409, retryable: false, tone: "warning",
      title: "There is nowhere to put the profit",
      detail: "One account has to be marked as reserves before a year can close.",
    },
  },

  views: [
    { id: "chart", of: "account", limit: 100 },
    /* ⚠️ NARROWED TO THE RECORD THE SCREEN IS ABOUT — see `Value.here`. */
    { id: "under-this", of: "account", where: [{ field: "parent", is: { here: "record" } }] },
    { id: "entries", of: "journal", limit: 50 },
    { id: "lines-of-this", of: "posting", where: [{ field: "journal", is: { here: "record" } }] },
    /* ⚠️ EVERY POSTING THAT LANDED HERE, which is the answer to the only
       question anybody opens an account to ask. The BALANCE is a sum of these
       and is never stored (B2) — see `balanceOf` in `posting.ts`. */
    { id: "landed-here", of: "posting", where: [{ field: "account", is: { here: "record" } }] },
    { id: "rules", of: "posting-rule", limit: 50 },
    /* ⚠️ NARROWED TO THE RECORD THE SCREEN IS ABOUT — the tree, one level. */
    { id: "inside-this", of: "centre", where: [{ field: "parent", is: { here: "record" } }] },
    /* ⚠️ EVERY POSTING THAT NAMED THIS CENTRE, which is what somebody opens one
       to read — and the FIGURE beside it is a roll-up, which a `Match` cannot
       do, so it is asked rather than narrowed. */
    { id: "landed-in-this", of: "posting",
      where: [{ field: "centre", is: { here: "record" } }] },
    { id: "centre-totals", of: "centre",
      asked: { operation: "book.centres", take: "items" } },
    /* ⚠️ NEWEST FIRST, because "what is it worth today" is the question, and the
       history under it is what somebody checks afterwards. */
    { id: "rates", of: "rate", limit: 100 },
    { id: "invoices", of: "sale", limit: 50 },
    { id: "lines-of-invoice", of: "sale-line",
      where: [{ field: "sale", is: { here: "record" } }] },
    /* ⚠️ WHAT SENDING IT DID, ON THE DOCUMENT THAT DID IT. Without this the
       rail's whole effect is invisible to whoever caused it: they press Send,
       the ledger moves, and no screen connects the two. */
    { id: "entry-of-invoice", of: "journal",
      where: [{ field: "ref", is: { here: "record" } }] },
    { id: "taxes", of: "tax", limit: 50 },
    { id: "bills", of: "bill", limit: 50 },
    { id: "lines-of-bill", of: "bill-line",
      where: [{ field: "bill", is: { here: "record" } }] },
    /* ⚠️ THE SAME QUESTION AS AN INVOICE'S, asked of a bill — what withdrawing it
       did is in here too, which is why it is not narrowed to one source. */
    { id: "entry-of-bill", of: "journal",
      where: [{ field: "ref", is: { here: "record" } }] },
    /* ⚠️ NEWEST FIRST IS WRONG FOR A YEAR. The books are read forwards — 2025,
       then 2026 — because "which year am I in" is answered by the last row, and
       a reversed list makes somebody read up the screen to find it. */
    { id: "years", of: "year", limit: 50, sort: { by: "opens", dir: "up" } },
    { id: "months", of: "period", limit: 50, sort: { by: "opens", dir: "up" } },
    /*
      ⚠️ ASKED, BECAUSE THIS SCREEN'S SUBJECT IS ARITHMETIC AND A `Match` IS
      EQUALITY — see `ViewSpec.asked`. A balance is a SUM over lines and will
      never be a column, which is the whole of B2's claim; a view that could only
      narrow rows could list the postings and never say what they come to.
    */
    { id: "trial-lines", of: "posting", asked: { operation: "book.trial", take: "items" } },
    { id: "trial-total", of: "posting", asked: { operation: "book.trial", take: "whole" } },
    /* ⚠️ THE SAME SUM ASKED OF ONE ROW, not a second answer computed in the
       browser — two narrowings of one question drift the first time either is
       edited, and then a screen disagrees with a report. */
    { id: "standing-here", of: "posting",
      asked: { operation: "book.standing", take: "standing", fills: { account: "record" } } },
  ],

  screens: [
    /*
      THE CHART — every account, and the first screen this product has.

      ⚠️ NO HERO. A figure here would be a count of accounts, which is a number
      nobody has ever wanted. What somebody opens this screen to do is find a row.
    */
    { id: "accounts", route: "/", label: "Accounts", nav: "primary", icon: "money",
      permission: "account:read", tone: "neutral",
      body: {
        shape: "list",
        layout: { as: "stack" },
        blocks: [
          /*
            ⚠️ THE FOUR THAT SHAPE THE BOOKS, REACHED FROM THE CHART. Years,
            centres, tax codes and rates are all answers to "how are these books
            arranged" rather than things somebody does — and the bar holds five
            (D10), which it now spends on the five things somebody DOES: read the
            chart, check it balances, keep the journal, send an invoice, record a
            bill. Centres lost its seat last round and Years lost one this round,
            both to a document; that trade is the right way round every time.
          */
          {
            group: null,
            of: [{ block: "QuickActions", leads: ["years", "centres", "taxes", "rates"] }],
          },
          /*
            ⚠️ OPENING THE BOOKS WAS UNREACHABLE, AND THIS IS THE CONTROL THAT
            FIXES IT. `start-the-book` is `nav: "none"` and nothing linked to it,
            so a workspace that installed OneBook landed here, read "the books
            are not open yet", and had no way to open them — the one control on
            the screen being `book.extend`, which refuses with `book.not_open`.
            The empty state carries copy and cannot carry an action (see
            `Region.nothing`), so the action is a row of its own above the list.

            ⚠️ AND IT IS SHOWN ONLY WHILE THERE IS NOTHING, because a chart that
            exists must never offer to be seeded again — `book.start` refuses
            with `book.already_open` precisely to protect two years of postings,
            and a button that exists to be refused is a button somebody presses.
          */
          {
            group: null,
            when: { empty: { of: "view", view: "chart" } },
            of: [{
              block: "ActionRow",
              goes: "start-the-book",
              bind: {
                icon: { from: { of: "words", says: "add" } },
                label: { from: { of: "words", says: "Open the books" } },
                under: { from: { of: "words",
                  says: "Start from a chart of accounts — you can rename all of it" } },
              },
            }],
          },
          {
            group: null,
            of: [{
          block: "Listing",
          /* ⚠️ THE NUMBER LEADS WHERE THERE IS ONE, because half the world's
             bookkeepers scan a chart by number and would otherwise be reading
             thirty names to find `1400`. */
          shows: [
            { field: "code", label: "Number" },
            { field: "name", label: "Name" },
            { field: "role", label: "Used for" },
          ],
          goes: "account",
          /*
            ⚠️ THE EMPTY STATE IS THE FIRST RUN, and it is the only place the
            books can be opened from. A product whose setup is reachable from a
            settings screen is a product people ask us how to start.
          */
          nothing: {
            says: "The books are not open yet",
            under: "Start from a chart of accounts — you can rename all of it",
          },
          bind: {
            label: { from: { of: "words", says: "Accounts" } },
            of: { from: { of: "view", view: "chart" } },
          },
            }],
          },
          /*
            ⚠️ UNDER THE LIST, BECAUSE IT IS ABOUT THE LIST AND IS RARELY WANTED.
            A chart of accounts is a desk screen a bookkeeper reads, not a phone
            screen with one job — and "add what the template has gained since you
            started" is a sentence that only means anything to somebody already
            looking at their chart. Above the list it would be a control offered
            before the thing it changes.

            ⚠️ AND IT IS THE ONLY PLACE IT IS OFFERED. A settings screen would be
            the obvious alternative and would be wrong: settings are what a
            workspace decides, and this is a thing it DOES, once in a while, to
            the records on the screen it is standing on.
          */
          {
            group: "Keeping up with the template",
            /* ⚠️ AND NOT BEFORE THERE IS A TEMPLATE TO KEEP UP WITH. `book.extend`
               refuses with `book.not_open`, so on a workspace whose books have
               never been opened this was the only control on the screen and its
               whole job was to fail. */
            when: { not: { empty: { of: "view", view: "chart" } } },
            of: [{
              block: "ActionRow",
              does: [{ op: "book.extend", fills: {} }],
              bind: {
                icon: { from: { of: "words", says: "add" } },
                label: { from: { of: "words", says: "Add what the template has gained" } },
                under: { from: { of: "words",
                  says: "Adds only. Nothing you have renamed or closed is touched" } },
              },
            }],
          },
        ],
      } },

    { id: "account", route: "/account", label: "Account", nav: "none", icon: "money",
      permission: "account:read", of: "account",
      body: {
        shape: "detail",
        layout: { as: "stack" },
        blocks: [
          {
            group: "What it is",
            of: [
              { block: "FieldRow",
                bind: {
                  label: { from: { of: "words", says: "Kind" } },
                  value: { from: { of: "field", field: "type" } },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "code" } },
                bind: {
                  label: { from: { of: "words", says: "Number" } },
                  value: { from: { of: "field", field: "code" } },
                } },
              /* ⚠️ THE ONE ROW THAT EXPLAINS THE PRODUCT. Everything else on this
                 page is a label; this is what the books actually do with it. */
              { block: "FieldRow",
                when: { has: { of: "field", field: "role" } },
                bind: {
                  label: { from: { of: "words", says: "Used for" } },
                  value: { from: { of: "field", field: "role" } },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "closed" } },
                bind: {
                  label: { from: { of: "words", says: "Closed to new postings" } },
                  value: { from: { of: "field", field: "closed" } },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "note" } },
                bind: {
                  label: { from: { of: "words", says: "Note" } },
                  value: { from: { of: "field", field: "note" } },
                } },
            ],
          },
          /*
            ⚠️ WHAT IT COMES TO, ABOVE THE LINES IT IS MADE OF. The figure is the
            answer; the lines are the working. A page that led with the working
            would be a page somebody scrolls to find the one number they came for.
          */
          {
            group: null,
            of: [{
              block: "Stat",
              bind: {
                value: { from: { of: "first", view: "standing-here", field: "balance" }, as: "money" },
                label: { from: { of: "words", says: "Balance" } },
                mark: { from: { of: "words", says: "money" } },
              },
            }],
          },
          /*
            ⚠️ WHAT LANDED HERE, AND IT IS THE WORKING BEHIND THE FIGURE ABOVE. A chart row on its own says what an account is FOR;
            this says what it has been used for, which is what somebody is
            looking at when they wonder whether the books are right.
          */
          {
            group: "What landed here",
            of: [{
              block: "Listing",
              shows: [
                { field: "memo", label: "What it was" },
                { field: "amount", label: "Amount", as: "money" },
              ],
              goes: { to: "entry", by: "journal" },
              nothing: {
                says: "Nothing has posted here",
                under: "It will fill as the books are kept",
              },
              bind: {
                label: { from: { of: "words", says: "What landed here" } },
                of: { from: { of: "view", view: "landed-here" } },
              },
            }],
          },
          {
            group: "Under it",
            of: [{
              block: "Listing",
              shows: [
                { field: "code", label: "Number" },
                { field: "name", label: "Name" },
                { field: "role", label: "Used for" },
              ],
              goes: "account",
              nothing: {
                says: "Nothing under it",
                under: "Add an account here to break this one down",
              },
              bind: {
                label: { from: { of: "words", says: "Under it" } },
                of: { from: { of: "view", view: "under-this" } },
              },
            }],
          },
        ],
      } },

    /*
      THE TRIAL BALANCE — the oldest check in accounting, and the one report that
      is about the BOOKS rather than about the business.

      ⚠️ THE HERO IS THE WHOLE LEDGER'S TOTAL, AND ZERO IS THE GOOD ANSWER. If it
      is anything else, a line was written outside an entry and every other figure
      on every other screen is suspect — so it leads, rather than sitting at the
      bottom of a column somebody has to add up themselves.

      ⚠️ AND THE FIGURE CARRIES ITS OWN SENTENCE, because a bare `0` on a financial
      screen reads as something that failed to load. `book.trial` answers with the
      words beside the number for exactly that reason.
    */
    { id: "trial", route: "/trial", label: "Trial balance", nav: "primary", icon: "chart",
      permission: "journal:read", tone: "neutral",
      body: {
        shape: "list",
        layout: { as: "stack" },
        hero: {
          as: "figure",
          nothing: {
            says: "Nothing to balance yet",
            under: "It fills as the books are kept",
          },
          bind: {
            value: { from: { of: "first", view: "trial-total", field: "total" }, as: "money" },
            /* ⚠️ "OUT BY", SO ZERO READS AS THE GOOD ANSWER. A figure of zero
               labelled "Total" looks like something that failed to load; the same
               zero labelled "Out by" is the books saying they are right. */
            of: { from: { of: "words", says: "Out by" } },
            mark: { from: { of: "words", says: "check" } },
          },
        },
        blocks: [{
          block: "Listing",
          /* ⚠️ ONLY THE ACCOUNTS HOLDING SOMETHING — see `book.trial`. A column
             of thirty zeroes is a screen somebody reads past to find the four
             figures that matter, and the chart is where every account lives. */
          shows: [
            { field: "name", label: "Account" },
            { field: "code", label: "Number" },
            { field: "balance", label: "Balance", as: "money" },
          ],
          goes: { to: "account", by: "id" },
          nothing: {
            says: "Every account is empty",
            under: "Post an entry and it will appear here",
          },
          bind: {
            label: { from: { of: "words", says: "Trial balance" } },
            of: { from: { of: "view", view: "trial-lines" } },
          },
        }],
      } },

    /*
      THE JOURNAL — every entry, newest first.

      ⚠️ IT IS A DESTINATION RATHER THAN A REPORT, because a journal is what a
      bookkeeper LIVES in. The reports are groupings of these lines and arrive
      later; this is the thing they are groupings of.
    */
    /*
      ⚠️ ITS OWN DESTINATION RATHER THAN A SETTING, because closing a year is
      not configuration — it posts an entry, it stops anybody adding to what was
      filed, and it is the one act in this product that reaches backwards over
      everything already recorded. A switch buried in settings would make it look
      like a preference.
    */
    { id: "years", route: "/years", label: "Years", nav: "none", icon: "calendar",
      permission: "year:read", tone: "neutral",
      body: {
        shape: "list",
        layout: { as: "stack" },
        blocks: [
          {
            block: "ActionRow",
            goes: "open-a-year",
            bind: {
              icon: { from: { of: "words", says: "add" } },
              label: { from: { of: "words", says: "Open a year" } },
              under: { from: { of: "words",
                says: "Yours may not be January to December" } },
            },
          },
          { group: "Years", of: [{
            block: "Listing",
            shows: [
              { field: "name", label: "Year" },
              { field: "opens", label: "First day", as: "when" },
              { field: "closes", label: "Last day", as: "when" },
              { field: "closed", label: "Closed" },
            ],
            nothing: {
              says: "No years yet",
              under: "Open one and the books have somewhere to put a date",
            },
            bind: {
              label: { from: { of: "words", says: "Years" } },
              of: { from: { of: "view", view: "years" } },
            },
          }] },
          /* ⚠️ THE MONTHS BESIDE THE YEARS, because "which months are shut" is
             the question somebody asks the moment a posting is refused — and a
             refusal whose explanation is on another screen is a refusal that
             reads as a fault. */
          { group: "Months", of: [{
            block: "Listing",
            shows: [
              { field: "name", label: "Period" },
              { field: "opens", label: "From", as: "when" },
              { field: "closes", label: "To", as: "when" },
              { field: "shut", label: "Shut" },
            ],
            nothing: {
              says: "No months",
              under: "Books closed off once a year need none",
            },
            bind: {
              label: { from: { of: "words", says: "Months" } },
              of: { from: { of: "view", view: "months" } },
            },
          }] },
        ],
      } },
    /* ⚠️ A STORY RATHER THAN A FORM, because the two dates are the whole
       decision and getting them wrong is expensive — see `refuseYear`. */
    { id: "open-a-year", route: "/years/open", label: "Open a year",
      nav: "none", icon: "add", permission: "year:write", tone: "neutral",
      story: {
        writes: "year.open",
        lands: "years",
        asks: [
          { id: "name", ask: "What is this year called?",
            under: "Most people use the year it ends in",
            takes: ["name"], always: true,
            says: { as: "{name}" } },
          /* ⚠️ THE TWO DATES TOGETHER, because they are one decision and asking
             them apart invites a year that ends before it starts. */
          { id: "when", ask: "When does it run?",
            under: "The last day is the one inside it, which is what you file",
            takes: ["opens", "closes"], always: true,
            says: { as: "{opens} to {closes}" } },
          { id: "months", ask: "Do you close the books every month?",
            under: "If you do, the twelve periods are made for you",
            takes: ["months"], always: true,
            says: { as: "with its months" } },
        ],
      } },
    /*
      COST CENTRES — what each part of the business cost, and the tree it is
      shaped as.

      ⚠️ THE FIGURE LEADS AND IT IS THE ROLLED-UP ONE. Nothing is posted to
      Retail; everything is posted to the two shops under it. A column of the
      rows' own figures would show a zero beside the one line somebody opened
      this screen to read.
    */
    { id: "centres", route: "/centres", label: "Cost centres", nav: "none", icon: "tag",
      permission: "account:read", tone: "neutral",
      body: {
        shape: "list",
        layout: { as: "stack" },
        blocks: [
          { group: null, of: [{
            block: "Listing",
            shows: [
              { field: "name", label: "Centre" },
              { field: "code", label: "Code" },
              /* ⚠️ BOTH FIGURES, BECAUSE THE DIFFERENCE IS THE ANSWER. A parent
                 with a large total and nothing of its own is working correctly;
                 one with a figure of its own is a centre somebody has been
                 posting to directly, which is usually a mistake. */
              { field: "own", label: "Its own", as: "money" },
              { field: "whole", label: "With everything under it", as: "money" },
            ],
            goes: { to: "centre", by: "id" },
            nothing: {
              says: "No cost centres yet",
              under: "Add one for each branch, department or project you measure",
            },
            bind: {
              label: { from: { of: "words", says: "Cost centres" } },
              of: { from: { of: "view", view: "centre-totals" } },
            },
          }] },
        ],
      } },

    /* ⚠️ ONE CENTRE — what it is, what is under it, and every line that named
       it. The last is the answer to the only question anybody opens one to ask. */
    { id: "centre", route: "/centre", label: "Cost centre", nav: "none", icon: "tag",
      permission: "account:read", of: "centre",
      body: {
        shape: "detail",
        layout: { as: "stack" },
        blocks: [
          {
            group: "What it is",
            of: [
              { block: "FieldRow",
                when: { has: { of: "field", field: "code" } },
                bind: {
                  label: { from: { of: "words", says: "Code" } },
                  value: { from: { of: "field", field: "code" } },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "closed" } },
                bind: {
                  label: { from: { of: "words", says: "Closed to new postings" } },
                  value: { from: { of: "field", field: "closed" } },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "note" } },
                bind: {
                  label: { from: { of: "words", says: "Note" } },
                  value: { from: { of: "field", field: "note" } },
                } },
            ],
          },
          {
            group: "Inside it",
            of: [{
              block: "Listing",
              shows: [
                { field: "name", label: "Centre" },
                { field: "code", label: "Code" },
              ],
              goes: "centre",
              nothing: {
                says: "Nothing under it",
                under: "A centre that stands alone is the ordinary case",
              },
              bind: {
                label: { from: { of: "words", says: "Inside it" } },
                of: { from: { of: "view", view: "inside-this" } },
              },
            }],
          },
          {
            group: "What landed here",
            of: [{
              block: "Listing",
              shows: [
                { field: "memo", label: "What it was" },
                { field: "amount", label: "Amount", as: "money" },
              ],
              nothing: {
                says: "Nothing posted here yet",
                under: "Lines that name this centre appear here",
              },
              bind: {
                label: { from: { of: "words", says: "What landed here" } },
                of: { from: { of: "view", view: "landed-in-this" } },
              },
            }],
          },
        ],
      } },

    /*
      RATES — what a currency was worth on a day, and the button that restates
      the books at today's.

      ⚠️ IT IS ITS OWN DESTINATION RATHER THAN A SETTING, for `year.close`'s
      reason: revaluing posts an entry. A switch buried in settings would make an
      act that moves money look like a preference.
    */
    { id: "rates", route: "/rates", label: "Rates", nav: "none", icon: "money",
      permission: "journal:read", tone: "neutral",
      body: {
        shape: "list",
        layout: { as: "stack" },
        blocks: [
          {
            group: null,
            of: [{
              block: "ActionRow",
              does: ["book.revalue"],
              bind: {
                icon: { from: { of: "words", says: "chart" } },
                label: { from: { of: "words", says: "Restate at today's rates" } },
                under: { from: { of: "words",
                  says: "A original balance is shown at the date's rate" } },
              },
            }],
          },
          { group: "Rates", of: [{
            block: "Listing",
            shows: [
              { field: "currency", label: "Currency" },
              { field: "day", label: "On", as: "when" },
              { field: "rate", label: "Millionths" },
              { field: "said", label: "From" },
            ],
            nothing: {
              says: "No rates yet",
              under: "Add one for each currency you hold or are owed in",
            },
            bind: {
              label: { from: { of: "words", says: "Rates" } },
              of: { from: { of: "view", view: "rates" } },
            },
          }] },
        ],
      } },

    /*
      INVOICES — the document a customer holds, and the only screen in this
      product whose subject is a piece of paper rather than a figure.

      ⚠️ IT IS A DESTINATION AND THE JOURNAL IS ONE TOO, and that is not a
      duplicate. An invoice is what was agreed; the journal is what it did. A
      bookkeeper lives in the second and everybody else lives in the first.
    */
    { id: "invoices", route: "/invoices", label: "Invoices", nav: "primary", icon: "note",
      permission: "journal:read", tone: "neutral",
      body: {
        shape: "list",
        layout: { as: "stack" },
        blocks: [{
          group: null,
          of: [{
            block: "Listing",
            shows: [
              /* ⚠️ THE NUMBER LEADS ONCE THERE IS ONE, and a draft has none —
                 which is exactly the difference a person is looking for. */
              { field: "number", label: "Number" },
              { field: "memo", label: "What it is for" },
              { field: "day", label: "Date", as: "when" },
              { field: "stands", label: "Standing" },
            ],
            goes: "invoice",
            nothing: {
              says: "No invoices yet",
              under: "Raise one and it takes its number when you send it",
            },
            bind: {
              label: { from: { of: "words", says: "Invoices" } },
              of: { from: { of: "view", view: "invoices" } },
            },
          }],
        }],
      } },

    /* ⚠️ ONE INVOICE — what it says, what it is made of, and the one control
       that turns it from a draft into evidence. */
    { id: "invoice", route: "/invoice", label: "Invoice", nav: "none", icon: "note",
      permission: "journal:read", of: "sale",
      body: {
        shape: "detail",
        layout: { as: "stack" },
        blocks: [
          {
            group: null,
            of: [{
              block: "ActionRow",
              does: ["sale.submit"],
              /* ⚠️ OFFERED ONLY WHILE IT IS A DRAFT. A control that exists to be
                 refused is a control somebody presses — and this one cannot be
                 undone, so it must never be offered on something already sent. */
              when: { is: { of: "field", field: "stands" }, one: ["draft"] },
              bind: {
                icon: { from: { of: "words", says: "check" } },
                label: { from: { of: "words", says: "Send it" } },
                under: { from: { of: "words",
                  says: "It takes its number and cannot be withdrawn" } },
              },
            }],
          },
          {
            group: "What it says",
            of: [
              { block: "FieldRow",
                when: { has: { of: "field", field: "number" } },
                bind: {
                  label: { from: { of: "words", says: "Number" } },
                  value: { from: { of: "field", field: "number" } },
                } },
              { block: "FieldRow",
                bind: {
                  label: { from: { of: "words", says: "Date" } },
                  value: { from: { of: "field", field: "day" }, as: "when" },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "due" } },
                bind: {
                  label: { from: { of: "words", says: "Due" } },
                  value: { from: { of: "field", field: "due" }, as: "when" },
                } },
              { block: "FieldRow",
                bind: {
                  label: { from: { of: "words", says: "Standing" } },
                  value: { from: { of: "field", field: "stands" } },
                } },
            ],
          },
          {
            group: "What it did",
            /* ⚠️ EMPTY UNTIL IT IS SENT, which is the honest reading: a draft has
               done nothing to the books and saying so is the point. */
            of: [{
              block: "Listing",
              shows: [
                { field: "memo", label: "Entry" },
                { field: "day", label: "Date", as: "when" },
              ],
              goes: "entry",
              nothing: {
                says: "Nothing posted yet",
                under: "Sending it writes the entry behind it",
              },
              bind: {
                label: { from: { of: "words", says: "In the books" } },
                of: { from: { of: "view", view: "entry-of-invoice" } },
              },
            }],
          },
          {
            group: "What it is made of",
            of: [{
              block: "Listing",
              shows: [
                { field: "said", label: "What it is" },
                { field: "quantity", label: "How many" },
                { field: "price", label: "Each", as: "money" },
              ],
              nothing: {
                says: "Nothing on it yet",
                under: "Add a line for each thing being charged for",
              },
              bind: {
                label: { from: { of: "words", says: "Lines" } },
                of: { from: { of: "view", view: "lines-of-invoice" } },
              },
            }],
          },
        ],
      } },

    /*
      BILLS — what suppliers sent us, which is the mirror of Invoices and is a
      destination of its own rather than a tab on it.

      ⚠️ TWO LISTS ON ONE SCREEN WOULD BE THE WRONG ECONOMY. Money in and money
      out are asked about at different moments by different people, and a screen
      that answers both leads with neither.
    */
    { id: "bills", route: "/bills", label: "Bills", nav: "primary", icon: "inbox",
      permission: "journal:read", tone: "neutral",
      body: {
        shape: "list",
        layout: { as: "stack" },
        blocks: [{
          group: null,
          of: [{
            block: "Listing",
            shows: [
              /* ⚠️ THEIR NUMBER LEADS, because that is what a supplier quotes on
                 a statement — ours orders our own records and theirs is what a
                 chasing email is about. */
              { field: "theirs", label: "Their number" },
              { field: "memo", label: "What it is for" },
              { field: "day", label: "Date", as: "when" },
              { field: "stands", label: "Standing" },
            ],
            goes: "bill",
            nothing: {
              says: "No bills yet",
              under: "Record one and it posts what you owe when you accept it",
            },
            bind: {
              label: { from: { of: "words", says: "Bills" } },
              of: { from: { of: "view", view: "bills" } },
            },
          }],
        }],
      } },

    /* ⚠️ ONE BILL, AND IT OFFERS BOTH MOVES — which an invoice does not. Nobody
       outside this workspace has seen it, so getting it wrong is a mistake to
       withdraw rather than a fact to correct with a second document. */
    { id: "bill", route: "/bill", label: "Bill", nav: "none", icon: "inbox",
      permission: "journal:read", of: "bill",
      body: {
        shape: "detail",
        layout: { as: "stack" },
        blocks: [
          {
            group: null,
            of: [
              {
                block: "ActionRow",
                does: ["bill.submit"],
                when: { is: { of: "field", field: "stands" }, one: ["draft"] },
                bind: {
                  icon: { from: { of: "words", says: "check" } },
                  label: { from: { of: "words", says: "Accept it" } },
                  under: { from: { of: "words",
                    says: "It takes its number and posts what you owe" } },
                },
              },
              {
                block: "ActionRow",
                does: ["bill.cancel"],
                when: { is: { of: "field", field: "stands" }, one: ["submitted"] },
                bind: {
                  icon: { from: { of: "words", says: "leave" } },
                  label: { from: { of: "words", says: "Withdraw it" } },
                  under: { from: { of: "words",
                    says: "The entry behind it is reversed" } },
                },
              },
            ],
          },
          {
            group: "What it says",
            of: [
              { block: "FieldRow",
                when: { has: { of: "field", field: "number" } },
                bind: {
                  label: { from: { of: "words", says: "Our number" } },
                  value: { from: { of: "field", field: "number" } },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "theirs" } },
                bind: {
                  label: { from: { of: "words", says: "Their number" } },
                  value: { from: { of: "field", field: "theirs" } },
                } },
              { block: "FieldRow",
                bind: {
                  label: { from: { of: "words", says: "Date" } },
                  value: { from: { of: "field", field: "day" }, as: "when" },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "due" } },
                bind: {
                  label: { from: { of: "words", says: "Due" } },
                  value: { from: { of: "field", field: "due" }, as: "when" },
                } },
              { block: "FieldRow",
                bind: {
                  label: { from: { of: "words", says: "Standing" } },
                  value: { from: { of: "field", field: "stands" } },
                } },
            ],
          },
          {
            group: "What it did",
            of: [{
              block: "Listing",
              shows: [
                { field: "memo", label: "Entry" },
                { field: "day", label: "Date", as: "when" },
              ],
              goes: "entry",
              nothing: {
                says: "Nothing posted yet",
                under: "Accepting it writes the entry behind it",
              },
              bind: {
                label: { from: { of: "words", says: "In the books" } },
                of: { from: { of: "view", view: "entry-of-bill" } },
              },
            }],
          },
          {
            group: "What it is made of",
            of: [{
              block: "Listing",
              shows: [
                { field: "said", label: "What it is" },
                { field: "quantity", label: "How many" },
                { field: "price", label: "Each", as: "money" },
              ],
              nothing: {
                says: "Nothing on it yet",
                under: "Add a line for each thing being charged for",
              },
              bind: {
                label: { from: { of: "words", says: "Lines" } },
                of: { from: { of: "view", view: "lines-of-bill" } },
              },
            }],
          },
        ],
      } },

    /* ⚠️ TAX CODES SIT UNDER THE CHART, not in settings — a rate is a row a
       return is made of, and it is closed rather than edited when it changes. */
    { id: "taxes", route: "/taxes", label: "Tax codes", nav: "none", icon: "tag",
      permission: "account:read", tone: "neutral",
      body: {
        shape: "list",
        layout: { as: "stack" },
        blocks: [{
          group: null,
          of: [{
            block: "Listing",
            shows: [
              { field: "name", label: "Name" },
              { field: "basis", label: "Hundredths of a per cent" },
              { field: "closed", label: "No longer charged" },
            ],
            nothing: {
              says: "No tax codes yet",
              under: "Add one for each rate you charge or are charged",
            },
            bind: {
              label: { from: { of: "words", says: "Tax codes" } },
              of: { from: { of: "view", view: "taxes" } },
            },
          }],
        }],
      } },

    /* ⚠️ THE JOURNAL WEARS `tally` AND THE INVOICES WEAR `note`, and the swap is
       the reading rather than a tie-break. A journal is a running count of
       entries; an invoice is a piece of paper. Two identical marks in one bar
       cannot say which is which, which is what the glyph guard caught. */
    { id: "journal", route: "/journal", label: "Journal", nav: "primary", icon: "tally",
      permission: "journal:read", tone: "neutral",
      body: {
        shape: "list",
        layout: { as: "stack" },
        blocks: [
          {
            group: null,
            of: [{ block: "QuickActions", leads: ["write-an-entry", "rules"] }],
          },
          {
            group: null,
            of: [{
              block: "Listing",
              /* ⚠️ THE MEMO LEADS BECAUSE THE LEADING COLUMN IS THE ROW'S NAME
                 WHEN THE LIST FOLDS ONTO A PHONE, and a date is not a name.
                 Somebody scanning a journal is looking for what an entry WAS. */
              shows: [
                { field: "memo", label: "What it was" },
                { field: "day", label: "Date", as: "when" },
                /* ⚠️ WHICH EVENT RAISED IT, OR BLANK FOR ONE SOMEBODY TYPED —
                   which is B2's "why is this account moving", answered in a
                   column rather than by reading somebody else's source. */
                { field: "source", label: "Raised by" },
              ],
              goes: "entry",
              nothing: {
                says: "Nothing posted yet",
                under: "Write an entry, or let a delivery post one for you",
              },
              bind: {
                label: { from: { of: "words", says: "Journal" } },
                of: { from: { of: "view", view: "entries" } },
              },
            }],
          },
        ],
      } },

    { id: "entry", route: "/entry", label: "Entry", nav: "none", icon: "note",
      permission: "journal:read", of: "journal",
      body: {
        shape: "detail",
        layout: { as: "stack" },
        blocks: [
          {
            group: "What it was",
            of: [
              { block: "FieldRow",
                bind: {
                  label: { from: { of: "words", says: "Date" } },
                  value: { from: { of: "field", field: "day" }, as: "when" },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "source" } },
                bind: {
                  label: { from: { of: "words", says: "Raised by" } },
                  value: { from: { of: "field", field: "source" } },
                } },
              { block: "FieldRow",
                when: { has: { of: "field", field: "ref" } },
                bind: {
                  label: { from: { of: "words", says: "Reference" } },
                  value: { from: { of: "field", field: "ref" } },
                } },
            ],
          },
          /* ⚠️ THE LINES ARE THE ENTRY. Everything above is a label on them. */
          {
            group: "The lines",
            of: [{
              block: "Listing",
              shows: [
                { field: "account.name", label: "Account" },
                { field: "memo", label: "What it was" },
                { field: "amount", label: "Amount", as: "money" },
              ],
              goes: { to: "account", by: "account" },
              nothing: {
                says: "No lines",
                under: "An entry always has lines. Tell us if you see this",
              },
              bind: {
                label: { from: { of: "words", says: "The lines" } },
                of: { from: { of: "view", view: "lines-of-this" } },
              },
            }],
          },
        ],
      } },

    /*
      THE POSTING RULES — B2's "why is this account moving", as a list.

      ⚠️ THE WHOLE POINT IS THAT IT IS A SCREEN. ERPNext answers the same question
      with `make_gl_entries` across twenty-eight files; this answers it with rows
      somebody can read, turn off, and point at a different account by moving a
      tag on the chart.
    */
    { id: "rules", route: "/rules", label: "Posting rules", nav: "none", icon: "settings",
      permission: "journal:read", tone: "neutral",
      body: {
        shape: "list",
        layout: { as: "stack" },
        blocks: [{
          block: "Listing",
          shows: [
            { field: "memo", label: "Posts" },
            { field: "event", label: "When" },
            { field: "enabled", label: "On" },
          ],
          nothing: {
            says: "No rules yet",
            under: "They arrive with the chart when the books are opened",
          },
          bind: {
            label: { from: { of: "words", says: "Posting rules" } },
            of: { from: { of: "view", view: "rules" } },
          },
        }],
      } },

    /*
      WRITING ONE BY HAND.

      ⚠️ EVERY ACCOUNTING SYSTEM IS ULTIMATELY A PERSON AND A JOURNAL. The rules
      save somebody typing the ordinary entries; they never remove the need to be
      able to type one — a correction, an opening balance, a thing no product in
      the workspace knows about.
    */
    { id: "write-an-entry", route: "/write", label: "Write an entry",
      nav: "none", icon: "add",
      permission: "journal:write", tone: "neutral",
      story: {
        writes: "journal.post",
        lands: "journal",
        asks: [
          { id: "when", ask: "What date does it belong to?",
            under: "Dated", takes: ["day"],
            says: { as: "dated {day}" } },
          { id: "what", ask: "What was it?",
            under: "For", takes: ["memo"],
            says: { as: "for {memo}" } },
          /*
            ⚠️ THE LINES ARE ONE STEP BECAUSE THEY ARE ONE THOUGHT. An entry is
            not a sequence of questions — it is a set of amounts that have to add
            up to nothing, and asking for them one at a time would let somebody
            complete four steps and be refused on the fifth for a reason that was
            about all five.
          */
          { id: "lines", ask: "Which accounts move, and by how much?",
            under: "Moving", takes: ["lines"], always: true,
            says: { as: "across {lines} lines" } },
        ],
      } },

    /*
      OPENING THE BOOKS — one question, asked once.

      ⚠️ ONE STEP, WHICH IS THE HONEST LENGTH. Everything else a chart of accounts
      needs — the fiscal year, the rounding rule, the tax rates — is either read
      by nothing yet or is a decision somebody makes with their accountant rather
      than in a wizard. Asking for them here would be a flow that looks thorough
      and collects answers nothing uses.

      ⚠️ AND THE STEP SAYS WHETHER THE TEMPLATE HAS BEEN CHECKED. Most have not.
      A product that quietly implies a local accountant signed one off is a
      product somebody files a return from.
    */
    { id: "start-the-book", route: "/start", label: "Open the books",
      nav: "none", icon: "add",
      permission: "account:write", tone: "neutral",
      story: {
        writes: "book.start",
        /* ⚠️ ON THE CHART IT JUST MADE, which is the one thing worth seeing: it
           is what somebody has to recognise before they trust any of it. */
        lands: "accounts",
        asks: [
          { id: "chart", ask: "Which chart of accounts?",
            under: "Starting from",
            takes: ["chart"], always: true,
            says: { as: "starting from {chart}" } },
        ],
      } },
  ],
});

/* ⚠️ A THUNK, BECAUSE COMPOSITION IS LAZY (D4). Exporting the composed surface
   would put every app's route table in the startup budget of every request. */
export const oneBook = manifest;

export { CHARTS, ROLES, ROOTS, rowsOf };
