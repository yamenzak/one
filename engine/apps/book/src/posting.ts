/**
 * THE ONE INVARIANT, AND THE ARITHMETIC AROUND IT.
 *
 * ⚠️ EVERY ENTRY SUMS TO ZERO. That is the whole of what accounting hard-codes,
 * it is true in every jurisdiction that has ever kept books, and it is the reason
 * a ledger can be trusted at all: a balance is derived by adding up lines, so a
 * line that does not belong to a balanced entry is a figure that will never
 * reconcile with anything and will be found a year later by somebody else.
 *
 * ⚠️ ONE SIGNED COLUMN, NOT A DEBIT COLUMN AND A CREDIT COLUMN. Two columns can
 * disagree with themselves — a row with both filled is a real defect in real
 * systems, and it needs a check nobody writes — while one signed integer cannot.
 * Debit is positive, credit is negative, said once here, and the SCREENS draw two
 * columns from the sign. The display is where the convention belongs; the storage
 * is where the arithmetic does.
 *
 * ⚠️ AND MINOR UNITS THROUGHOUT — `field.money` is an integer of the workspace's
 * currency's smallest unit (D117). There is no rounding here because there is no
 * division: a posting is money that already exists somewhere else.
 */

import { ROLES, type Role } from "./roles.js";

/* ------------------------------------------------------------------ a line --- */

export interface Line {
  /** The account this lands on. */
  readonly account: string;
  /** ⚠️ Minor units. Positive is a debit, negative is a credit. */
  readonly amount: number;
  readonly memo?: string;
  /**
   * ⚠️ WHICH PART OF THE BUSINESS, ON THE LINE RATHER THAN ON THE ENTRY — see
   * `dimensions.ts`. A purchase covering two departments is one entry with two
   * lines, and a centre on the header would make that impossible to record
   * without splitting the invoice.
   */
  readonly centre?: string | null;
  /**
   * ⚠️ WHAT ACTUALLY MOVED, IF IT WAS NOT THE WORKSPACE'S OWN MONEY — see
   * `money.ts`. `amount` above is still the only figure the ledger adds up,
   * which is why an entry balances however many currencies it touches; these
   * three are what make it reconcilable against a foreign bank statement, and
   * what a revaluation is computed from.
   */
  readonly currency?: string | null;
  /** ⚠️ Minor units of `currency`, signed the way `amount` is. */
  readonly original?: number | null;
  /** ⚠️ Millionths — see `RATE_SCALE`. Never a float. */
  readonly rate?: number | null;
}

export const debits = (lines: readonly Line[]): number =>
  lines.reduce((sum, one) => sum + Math.max(one.amount, 0), 0);

export const credits = (lines: readonly Line[]): number =>
  lines.reduce((sum, one) => sum - Math.min(one.amount, 0), 0);

/** ⚠️ The one question. Everything else here is about saying WHY it is no. */
export const balanced = (lines: readonly Line[]): boolean =>
  lines.reduce((sum, one) => sum + one.amount, 0) === 0;

/* ----------------------------------------------------------------- refusing --- */

export type EntryRefusal =
  | "no_lines" | "one_line" | "not_whole" | "nothing_moves" | "unbalanced";

/**
 * WHAT AN ENTRY CAN GET WRONG, IN THE ORDER A PERSON WOULD WANT TO HEAR IT.
 *
 * ⚠️ `one_line` IS SEPARATE FROM `unbalanced` BECAUSE THEY ARE DIFFERENT
 * MISTAKES. A single line summing to zero is an entry that moves nothing and
 * balances perfectly; a single line with a figure on it is somebody who has not
 * finished. Reporting both as "does not balance" would tell the second person
 * something true and useless.
 *
 * ⚠️ AND `nothing_moves` CATCHES THE ENTRY THAT PASSES EVERY OTHER CHECK. All
 * zeroes balances. It is also a row in a ledger that will be read, dated, filed
 * and reconciled by somebody, and it says nothing at all.
 */
export function refuseEntry(lines: readonly Line[]): EntryRefusal | null {
  if (!lines.length) return "no_lines";
  if (lines.length < 2) return "one_line";
  if (lines.some((one) => !Number.isInteger(one.amount))) return "not_whole";
  if (lines.every((one) => one.amount === 0)) return "nothing_moves";
  if (!balanced(lines)) return "unbalanced";
  return null;
}

/* ------------------------------------------------------------------- a rule --- */

/**
 * ONE SIDE OF A POSTING RULE.
 *
 * ⚠️ IT NAMES A ROLE AND A DIRECTION, NEVER AN ACCOUNT AND NEVER A FIGURE. The
 * account comes from whichever row the workspace tagged with that role, and the
 * figure comes from the event — so the same rule is correct in a German chart, a
 * French one and a chart somebody built from nothing.
 */
export interface Side {
  readonly role: Role;
  /** ⚠️ `debit` adds, `credit` subtracts. See the header on the signed column. */
  readonly as: "debit" | "credit";
  /**
   * ⚠️ WHICH FIELD OF THE EVENT'S ANSWER CARRIES THE MONEY. Named rather than
   * assumed, because an event answers with several numbers and only one of them
   * is what moved — `buying.received` reports how many arrived, how many are
   * still to come, and what it was valued at, and posting the wrong one would be
   * a ledger of quantities in a money column.
   */
  readonly of: string;
}

export interface Rule {
  readonly event: string;
  readonly sides: readonly Side[];
}

export type RuleRefusal =
  | "no_sides" | "one_side" | "unknown_role" | "one_direction" | "no_field";

/**
 * ⚠️ A RULE IS REFUSED BEFORE IT CAN POST, BECAUSE A BAD RULE IS WORSE THAN NO
 * RULE. A rule with two debits and no credit produces an entry that cannot
 * balance, every time it fires, silently — the write refuses and the event was
 * only ever a consequence, so nothing anywhere goes red. The place to catch it is
 * the rule, once, rather than the entry, for ever.
 */
export function refuseRule(rule: Rule): RuleRefusal | null {
  const sides = rule.sides ?? [];
  if (!sides.length) return "no_sides";
  if (sides.length < 2) return "one_side";
  if (sides.some((one) => !(ROLES as readonly string[]).includes(one.role))) return "unknown_role";
  if (sides.some((one) => !one.of?.trim())) return "no_field";
  if (!sides.some((one) => one.as === "debit") || !sides.some((one) => one.as === "credit")) {
    return "one_direction";
  }
  return null;
}

/* ------------------------------------------------------------------ firing --- */

/** What a rule needs from the world to become lines. */
export interface Firing {
  /** ⚠️ The event's answer — where the figures are. */
  readonly answer: Readonly<Record<string, unknown>>;
  /** ⚠️ Which account carries a role, and the suspense account for one that has
     no home. See `roles.ts` on why the fallback is not an admission of defeat. */
  readonly accountFor: (role: Role) => string | null;
}

export type Fired =
  | { readonly ok: true; readonly lines: readonly Line[] }
  | { readonly ok: false; readonly why: RuleRefusal | "no_amount" | "nothing_moves" | "no_suspense" };

/**
 * A RULE AND AN EVENT, TURNED INTO LINES.
 *
 * ⚠️ AN AMOUNT THAT IS NOT A WHOLE NUMBER OF MINOR UNITS IS REFUSED RATHER THAN
 * ROUNDED. Every figure reaching here was money somewhere else already; a
 * fraction means the event carried something that was not money — a quantity, a
 * rate, a null read as zero — and rounding it would file that mistake as a fact.
 *
 * ⚠️ AND ZERO IS NOT AN ERROR, IT IS A DAY WHEN NOTHING HAPPENED. A receipt with
 * no price on it has nothing to post, and an entry of two zero lines is a row in
 * a ledger that says nothing. `nothing_moves` is the caller's cue to do nothing,
 * not to report a failure.
 */
export function fire(rule: Rule, at: Firing): Fired {
  const wrong = refuseRule(rule);
  if (wrong) return { ok: false, why: wrong };

  const lines: Line[] = [];
  for (const side of rule.sides) {
    const raw = at.answer[side.of];
    if (raw === null || raw === undefined) return { ok: false, why: "no_amount" };
    const amount = Number(raw);
    if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
      return { ok: false, why: "no_amount" };
    }
    /* ⚠️ THE SUSPENSE ACCOUNT IS WHAT KEEPS THE ENTRY BALANCED WHEN A ROLE HAS
       NO HOME. Dropping the side instead would produce a one-sided entry, which
       is the failure this whole file exists to make impossible. */
    const account = at.accountFor(side.role) ?? at.accountFor("suspense");
    if (!account) return { ok: false, why: "no_suspense" };
    lines.push({ account, amount: side.as === "debit" ? amount : -amount });
  }

  if (lines.every((one) => one.amount === 0)) return { ok: false, why: "nothing_moves" };
  return { ok: true, lines };
}

/* ------------------------------------------------------------- what is there --- */

/**
 * ⚠️ A BALANCE IS A SUM AND IS NEVER STORED (B2, D119 one domain over). Holding
 * a running total means holding a number that can disagree with the lines under
 * it, and every accounting system that stores one grows a subsystem to repair it.
 * This is here so the one place that adds figures up is a function with tests
 * rather than a `SELECT` somebody wrote twice.
 */
export const balanceOf = (lines: readonly Line[], account: string): number =>
  lines.filter((one) => one.account === account)
    .reduce((sum, one) => sum + one.amount, 0);

/* --------------------------------------------------------------- what ships --- */

/**
 * THE POSTING RULES A WORKSPACE STARTS WITH.
 *
 * ⚠️ ONE, AND THAT IS AN HONEST COUNT RATHER THAN A STARTING POINT. It is B2's
 * own example — a delivery arrives, the stock is worth something and nobody has
 * invoiced for it yet — and it is the only event in this deployment whose ANSWER
 * currently carries money. A rule can only post what the event tells it.
 *
 * ⚠️ WHAT IS DELIBERATELY ABSENT, AND WHY IT WOULD BE WRONG RATHER THAN MISSING:
 *
 * - **Cost of goods sold.** The obvious candidate is `stock.taken`, and posting
 *   it would be incorrect: taking stock off a shelf is not selling it. A scrap, a
 *   transfer and an internal issue all raise the same event, and COGS belongs to
 *   a SALE — which needs the document rail, not another rule here.
 * - **Adjustments and write-offs.** Correct in principle and blocked in fact:
 *   `stock.adjusted` answers with a quantity and no value, so a rule for it would
 *   have nothing to post. Making it postable is a change to the app that owns the
 *   fact, made deliberately in its own manifest — which is the seam working
 *   rather than a gap in it.
 */
export const RULES: readonly (Rule & { readonly memo: string })[] = [
  {
    event: "buying.received",
    memo: "Stock arrived, not yet invoiced",
    sides: [
      { role: "stock", as: "debit", of: "landed" },
      { role: "stock_pending", as: "credit", of: "landed" },
    ],
  },
];
