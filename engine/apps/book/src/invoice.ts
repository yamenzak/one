/**
 * WHAT AN INVOICE COMES TO, AND WHAT IT POSTS.
 *
 * ⚠️ AN INVOICE IS A DOCUMENT AND AN ENTRY, AND THE DOCUMENT IS THE ORIGINAL.
 * What a customer holds is a numbered piece of paper with lines on it; what the
 * books hold is a balanced entry derived from it. Storing the entry alone loses
 * every reason a figure is what it is — which quantity, at which price, taxed at
 * which rate — and that is the half an auditor asks about.
 *
 * ⚠️ TAX IS ROUNDED ONCE PER TAX CODE, NOT PER LINE. Rounding each line's tax and
 * adding them up gives a figure that can differ by a penny from the tax on the
 * total, and the tax return wants ONE number per rate. Doing it per line also
 * makes the invoice disagree with itself: the customer adds up the tax column
 * and gets something else. Jurisdictions differ on this and the difference is
 * pennies; what is not optional is picking one and being consistent.
 *
 * ⚠️ AND A QUANTITY IS THOUSANDTHS, BECAUSE HALF AN HOUR IS A REAL INVOICE LINE.
 * Two and a half hours, 1.75 kilos, a third of a day — an integer count cannot
 * hold any of them, and a float here is the same rounding problem as a float
 * rate, one column over. Three places is what every timesheet and every scale
 * produces.
 *
 * Pure. No database, no I/O.
 */

import type { Line } from "./posting.js";

/* ------------------------------------------------------------------ shapes --- */

/** ⚠️ Thousandths. Two and a half is `2500`. */
export const QUANTITY_SCALE = 1_000;

/** ⚠️ Basis points. Five per cent is `500`, and 7.5% is `750`. */
export const RATE_BASIS = 10_000;

export interface Item {
  /** ⚠️ WHAT IT IS FOR, WHICH IS AN ACCOUNT — see the note in `entryFor`. */
  readonly account: string;
  readonly said: string;
  /** ⚠️ Thousandths. */
  readonly quantity: number;
  /** ⚠️ Minor units, per whole unit. */
  readonly price: number;
  /** ⚠️ Which tax code, or none. The RATE is the code's, never the line's. */
  readonly tax?: string | null;
  readonly centre?: string | null;
}

/* -------------------------------------------------------------- the totals --- */

/**
 * ⚠️ HALF AWAY FROM ZERO, THE SAME AS A CONVERSION. A line is a quantity times a
 * price and the product is almost never whole — three items at 33.33 is 99.99,
 * and 2.5 hours at 90.00 is 225.00 exactly. Rounding toward zero would lose a
 * penny in one direction on every line that has a fraction, which accumulates in
 * one party's favour and is invisible.
 */
export function netOf(item: Pick<Item, "quantity" | "price">): number {
  const size = Math.abs(item.quantity * item.price);
  const whole = Math.floor(size / QUANTITY_SCALE);
  const over = size % QUANTITY_SCALE;
  const near = over * 2 >= QUANTITY_SCALE ? whole + 1 : whole;
  return item.quantity * item.price < 0 ? -near : near;
}

export function taxOf(net: number, basis: number): number {
  const size = Math.abs(net * basis);
  const whole = Math.floor(size / RATE_BASIS);
  const over = size % RATE_BASIS;
  const near = over * 2 >= RATE_BASIS ? whole + 1 : whole;
  return net * basis < 0 ? -near : near;
}

/**
 * WHAT THE WHOLE INVOICE COMES TO.
 *
 * ⚠️ `byTax` IS THE HALF THAT MATTERS FOR FILING. A total is what the customer
 * pays; what a tax return needs is the amount charged at each rate, separately,
 * so a workspace can report standard-rated and zero-rated sales apart. An
 * invoice that only knows its total is one whose return has to be rebuilt by
 * reading every line again.
 *
 * ⚠️ AND A LINE WITH NO TAX CODE IS NOT ZERO-RATED, IT IS UNTAXED. The two look
 * the same on the total and are different on a return in most of the world — so
 * an untaxed line contributes to `net` and appears in no tax group, and a
 * workspace that means zero-rated makes a code with a rate of nothing.
 */
export interface Charged {
  readonly net: number;
  readonly tax: number;
  readonly gross: number;
  /** ⚠️ Tax code → the amount charged at it. Rounded once, over the whole group. */
  readonly byTax: ReadonlyMap<string, { readonly net: number; readonly tax: number }>;
}

export function chargeOf(
  items: readonly Item[], rates: ReadonlyMap<string, number>,
): Charged {
  let net = 0;
  /* ⚠️ NETS GATHERED FIRST AND TAXED ONCE — see the header. Rounding per line
     and adding up makes the invoice disagree with its own tax column. */
  const nets = new Map<string, number>();
  for (const item of items) {
    const line = netOf(item);
    net += line;
    if (!item.tax) continue;
    nets.set(item.tax, (nets.get(item.tax) ?? 0) + line);
  }

  const byTax = new Map<string, { net: number; tax: number }>();
  let tax = 0;
  for (const [code, over] of nets) {
    const charged = taxOf(over, rates.get(code) ?? 0);
    byTax.set(code, { net: over, tax: charged });
    tax += charged;
  }
  return { net, tax, gross: net + tax, byTax };
}

/* ------------------------------------------------------------- what is wrong --- */

export type ItemRefusal =
  | "no_items" | "no_account" | "not_whole" | "nothing_charged";

/**
 * ⚠️ `nothing_charged` IS THE ONE THAT PASSES EVERY OTHER CHECK. An invoice whose
 * lines come to nothing is a numbered document, sent to a customer, recorded
 * against them, that asks for no money and posts an entry of zeroes — and every
 * arithmetic rule here is satisfied by it. A credit note is how a workspace says
 * "nothing is owed"; a nil invoice is a mistake somebody will chase.
 *
 * ⚠️ AND A NEGATIVE LINE IS ALLOWED, DELIBERATELY. A discount, a returned item
 * or a rebate on the same invoice is one negative line, and refusing it would
 * make every real discount a second document.
 */
export function refuseItems(items: readonly Item[]): ItemRefusal | null {
  if (!items.length) return "no_items";
  if (items.some((one) => !one.account)) return "no_account";
  if (items.some((one) =>
    !Number.isInteger(one.quantity) || !Number.isInteger(one.price))) return "not_whole";
  if (items.every((one) => netOf(one) === 0)) return "nothing_charged";
  return null;
}

/* --------------------------------------------------------------- the entry --- */

/**
 * WHICH WAY THE MONEY GOES.
 *
 * ⚠️ ONE ARITHMETIC, MIRRORED BY A SIGN. A sale debits what the customer owes
 * and credits income; a purchase credits what is owed to a supplier and debits
 * expense. Every figure is the same and every side is the other one — so writing
 * them as two functions would be writing the same rounding twice and having one
 * of them drift.
 */
export type Way = "out" | "in";

export interface Homes {
  /** Receivable for a sale, payable for a purchase. */
  readonly party: string;
  /** ⚠️ Tax code → the account its tax lands in. Output for a sale, input for a
      purchase — which is the app's lookup, because the ROLE differs by way. */
  readonly taxTo: (code: string) => string;
}

/**
 * WHAT A SUBMITTED INVOICE POSTS.
 *
 * ⚠️ THE LINE NAMES AN ACCOUNT RATHER THAN A PRODUCT, AND THAT IS THE SEAM. What
 * was sold is OneInventory's or OneTrade's to know; what the books need is which
 * income or expense account it lands in. An invoice line here therefore says
 * "consulting, 2.5 hours at 90" against the consulting income account — which is
 * a complete invoice for a business with no stock at all, and the field a
 * product-shaped document fills in when there is one.
 *
 * ⚠️ IT BALANCES BY CONSTRUCTION. One side is the gross against the party; the
 * other is every line's net against its own account plus every tax group against
 * its own. The two are the same sum by definition of `gross`, so nothing here
 * can produce an entry `refuseEntry` would reject.
 */
export function entryFor(
  items: readonly Item[], charge: Charged, homes: Homes, way: Way, said: string,
): readonly Line[] {
  /* ⚠️ A SALE DEBITS THE CUSTOMER, A PURCHASE CREDITS THE SUPPLIER. */
  const towards = way === "out" ? 1 : -1;
  const lines: Line[] = [
    { account: homes.party, amount: towards * charge.gross, memo: said },
  ];

  /*
    ⚠️ GATHERED PER ACCOUNT, NOT ONE LINE PER ITEM. An invoice with forty lines
    against one income account is forty postings that a report has to add up and
    a person has to scroll past; the document keeps the detail and the ledger
    keeps the movement.
  */
  /* ⚠️ A MAP OF MAPS RATHER THAN A JOINED KEY, and the reason is not style. Any
     separator is a character an id could one day contain, and the failure would
     be two departments' figures silently merged — found by somebody reading a
     column that is too big, months later. Nesting cannot be split wrongly. */
  const perAccount = new Map<string, Map<string, number>>();
  for (const item of items) {
    const net = netOf(item);
    if (!net) continue;
    /* ⚠️ THE CENTRE TRAVELS WITH THE LINE, so a department's income and expense
       land in its own column — which is the whole of what a centre is for. */
    const here = perAccount.get(item.account) ?? new Map<string, number>();
    const at = item.centre ?? "";
    here.set(at, (here.get(at) ?? 0) + net);
    perAccount.set(item.account, here);
  }
  for (const [account, centres] of perAccount) {
    for (const [centre, net] of centres) {
      lines.push({
        account,
        amount: -towards * net,
        memo: said,
        ...(centre ? { centre } : {}),
      });
    }
  }

  for (const [code, group] of charge.byTax) {
    if (!group.tax) continue;
    lines.push({ account: homes.taxTo(code), amount: -towards * group.tax, memo: said });
  }
  return lines;
}
