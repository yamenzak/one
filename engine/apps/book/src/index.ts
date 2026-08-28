/**
 * ONEBOOK — THE BOOKS, IN ANY COUNTRY.
 *
 * ⚠️ A POSTING RULE NAMES A ROLE, NEVER AN ACCOUNT, AND THAT IS THE WHOLE
 * INTERNATIONAL DESIGN. `roles.ts` holds the sixteen; `charts.ts` holds the
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
  area, collection, defineApp, field, newId, operation, setting,
  type AppSpec,
} from "@engine/kernel";

import { CHARTS, chartById, chartFor } from "./charts.js";
import { ROLES, ROOTS, missing, rowsOf, type Held, type Node } from "./roles.js";

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
    permissions: ["account:read", "account:write"],
    roles: {
      /* ⚠️ Opens the books, shapes the chart, closes an account. */
      keeper: ["account:read", "account:write"],
      /* ⚠️ Reads the chart — which is what somebody coding an invoice needs and
         all they need. */
      user: ["account:read"],
      viewer: ["account:read"],
    },
    presets: [
      {
        id: "alone", name: "On your own",
        said: "One person keeping the books. Opens them and shapes the chart.",
        permissions: ["account:read", "account:write"],
      },
      {
        id: "bookkeeper", name: "Keeps the books",
        said: "Shapes the chart and closes what is no longer used.",
        permissions: ["account:read", "account:write"],
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

  collections: [account],

  operations: [start, extend],

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
  },

  views: [
    { id: "chart", of: "account", limit: 100 },
    /* ⚠️ NARROWED TO THE RECORD THE SCREEN IS ABOUT — see `Value.here`. */
    { id: "under-this", of: "account", where: [{ field: "parent", is: { here: "record" } }] },
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
