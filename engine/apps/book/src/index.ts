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
  area, collection, defineApp, field, job as declareJob, newId, operation, setting,
  type AppSpec,
} from "@engine/kernel";

import { CHARTS, chartById, chartFor } from "./charts.js";
import { ROLES, ROOTS, missing, rowsOf, type Held, type Node, type Role } from "./roles.js";
import {
  RULES, fire, refuseEntry, type Line, type Rule,
} from "./posting.js";

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
    amount: field.money({
      label: "Amount", required: true, holds: "none",
      help: "Positive is a debit, negative is a credit.",
    }),
    memo: field.text({ label: "What it was", required: true, holds: "none", max: 200 }),
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
interface AccountRow { readonly id: string; readonly role: string | null; readonly closed: number }

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
async function writeEntry(
  c: Pick<Ctx, "tenantId" | "now" | "accountId">, db: Db, of: Written,
): Promise<Posted> {
  const id = newId("jnl");
  await db.prepare(
    `INSERT INTO journal (id, tenant_id, day, memo, source, ref, at, by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, c.tenantId, of.day, of.memo, of.source ?? null, of.ref ?? null,
      c.now, c.accountId ?? null)
    .run();

  for (const line of of.lines) {
    await db.prepare(
      `INSERT INTO posting (id, tenant_id, journal, account, amount, memo, at, by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(newId("pst"), c.tenantId, id, line.account, line.amount,
        line.memo ?? of.memo, c.now, c.accountId ?? null)
      .run();
  }
  return { journal: id, lines: of.lines.length };
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
  fails: ["platform.invalid", "book.unbalanced", "book.no_account"],
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
      "SELECT id, role, closed FROM account WHERE tenant_id = ?")
      .bind(c.tenantId).all<AccountRow>();
    const open = new Map(held.results.map((row) => [row.id, !row.closed] as const));
    for (const line of lines) {
      if (!open.has(line.account)) {
        return c.fail("book.no_account", {}, { fields: { lines: "One line names no account" } });
      }
      if (!open.get(line.account)) {
        return c.fail("book.no_account", {}, { fields: { lines: "One account is closed" } });
      }
    }

    return writeEntry(c, db, { day: input.day, memo: input.memo, lines });
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
  Record<string, never>,
  { items: Standing[]; whole: { total: number }[] }
>({
  id: "book.trial",
  kind: "read",
  summary: "What every account comes to",
  input: {},
  output: {
    items: field.json({ label: "Accounts", holds: "none" }),
    whole: field.json({ label: "The whole ledger", holds: "none" }),
  },
  permission: "journal:read",
  idempotency: { mode: "none" },
  fails: [],
  async handler(ctx) {
    const c = ctx as Ctx;
    const rows = await (c.db as Db).prepare(
      `SELECT a.id AS id, a.name AS name, a.code AS code,
              COALESCE(SUM(p.amount), 0) AS balance
         FROM account a LEFT JOIN posting p
           ON p.account = a.id AND p.tenant_id = a.tenant_id
        WHERE a.tenant_id = ?
        GROUP BY a.id
        ORDER BY a.code IS NULL, a.code ASC, a.name ASC`)
      .bind(c.tenantId)
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
      keeper: ["account:read", "account:write", "journal:read", "journal:write"],
      /* ⚠️ Reads the chart — which is what somebody coding an invoice needs and
         all they need. */
      user: ["account:read", "journal:read", "journal:write"],
      viewer: ["account:read", "journal:read"],
    },
    presets: [
      {
        id: "alone", name: "On your own",
        said: "One person keeping the books. Opens them and shapes the chart.",
        permissions: [
      "account:read", "account:write",
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

  collections: [account, journal, posting, rule],

  operations: [start, extend, post, trial, standing],

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

        await writeEntry(
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
    { id: "journal", route: "/journal", label: "Journal", nav: "primary", icon: "note",
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
