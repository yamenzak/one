/**
 * WHICH PART OF THE BUSINESS A FIGURE BELONGS TO.
 *
 * ⚠️ A CHART OF ACCOUNTS ANSWERS "WHAT", AND NOTHING IN IT ANSWERS "WHERE". Rent
 * is rent whether it was the shop's or the workshop's; wages are wages whichever
 * department earned them. A business with two branches, three departments or a
 * dozen projects needs both figures out of one ledger — what it spent, and which
 * part of itself spent it — and an account per branch is the answer that looks
 * obvious and is wrong: it multiplies the chart by the branches, so a new branch
 * is thirty new accounts and every report has to be re-summed by hand.
 *
 * ⚠️ WHICH IS WHY A BRANCH IS A CENTRE AND NOT A WORKSPACE. One workspace is one
 * company (D127) — one chart, one set of books, one year end — and its branches
 * are a column on the posting. Making each branch its own workspace would give
 * one legal entity several ledgers that can never be added up, and the return it
 * files is about all of them.
 *
 * ⚠️ ONE AXIS, NOT N, AND THE DECISION IS WRITTEN DOWN RATHER THAN ASSUMED. A
 * posting carries one optional centre. A second axis is a join table on the
 * largest table this product holds, and every report would pay for it whether or
 * not anybody had ever used a second one — see D127 for the shape it would take
 * on the day something needs it.
 *
 * ⚠️ AND IT IS A TREE, BECAUSE THAT IS THE QUESTION PEOPLE ASK. "What did retail
 * cost" is not the sum of one row, it is the sum of every shop under it. A flat
 * list makes that a spreadsheet somebody maintains beside the books.
 *
 * Pure. No database, no I/O.
 */

import { DEEPEST_TREE } from "@engine/kernel";

import type { Root } from "./roles.js";

/* ------------------------------------------------------------------ shape --- */

export interface Centre {
  readonly id: string;
  readonly name: string;
  readonly parent: string | null;
  /** ⚠️ Closed means nothing new lands here; last year's figures still are. */
  readonly closed: boolean;
}

/* ------------------------------------------------------------- the walks --- */

const childrenOf = (
  centres: readonly Pick<Centre, "id" | "parent">[],
): ReadonlyMap<string, string[]> => {
  const out = new Map<string, string[]>();
  for (const one of centres) {
    if (!one.parent) continue;
    const held = out.get(one.parent);
    if (held) held.push(one.id);
    else out.set(one.parent, [one.id]);
  }
  return out;
};

/**
 * A CENTRE AND EVERYTHING UNDER IT.
 *
 * ⚠️ THIS IS WHAT "NARROW TO RETAIL" MEANS. Filtering the ledger to the one row
 * called Retail answers with whatever was posted directly to it, which in a
 * business that posts to its shops is nothing at all — a report that is empty
 * and correct, and reads as broken.
 *
 * ⚠️ THE SEEN SET IS NOT SUPERSTITION. The engine refuses a ring on the way IN —
 * a `ref` at its own collection is a tree and `patch` will not close one — but
 * this is the read path, and it also runs over rows written before that rule
 * existed. A report that never answers is the worst way to find out.
 */
export function within(
  centres: readonly Pick<Centre, "id" | "parent">[], root: string,
): readonly string[] {
  const children = childrenOf(centres);
  const seen = new Set<string>([root]);
  const queue = [root];
  while (queue.length) {
    const at = queue.shift() as string;
    for (const child of children.get(at) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      queue.push(child);
    }
  }
  return [...seen];
}

/**
 * WHAT EACH CENTRE COMES TO WITH EVERYTHING UNDER IT ADDED IN.
 *
 * ⚠️ IT WALKS UP RATHER THAN DOWN, which is the same arithmetic and one pass
 * instead of one per centre. Each figure is added to its own row and to every
 * ancestor, so a tree of forty centres costs forty short walks rather than forty
 * whole-tree sweeps.
 *
 * ⚠️ AND A CENTRE WITH NOTHING POSTED TO IT STILL ANSWERS, because a parent is
 * usually exactly that: nothing is posted to Retail, and Retail's figure is the
 * only one anybody wanted.
 */
export function rollUp(
  own: ReadonlyMap<string, number>, centres: readonly Pick<Centre, "id" | "parent">[],
): ReadonlyMap<string, number> {
  const up = new Map(centres.map((c) => [c.id, c.parent] as const));
  const out = new Map<string, number>(centres.map((c) => [c.id, 0] as const));

  for (const [id, amount] of own) {
    let at: string | null = id;
    const seen = new Set<string>();
    for (let step = 0; step <= DEEPEST_TREE && at; step++) {
      if (seen.has(at)) break;
      seen.add(at);
      out.set(at, (out.get(at) ?? 0) + amount);
      at = up.get(at) ?? null;
    }
  }
  return out;
}

/* --------------------------------------------------------- posting to one --- */

export type PlacingRefusal = "centre_unknown" | "centre_closed" | "centre_missing";

/**
 * WHETHER A LINE MAY NAME THIS CENTRE, OR GO WITHOUT ONE.
 *
 * ⚠️ THE REQUIREMENT ONLY BITES ON THE PROFIT AND LOSS, AND THAT IS THE INDUSTRY'S
 * RULE RATHER THAN A CONVENIENCE. Cash is not the shop's cash — it is the
 * company's, sitting in one account — and neither is a debt owed to a supplier.
 * Asking which department a bank balance belongs to is a question with no answer,
 * so a workspace that switched the requirement on would be unable to record a
 * payment.
 *
 * ⚠️ AND A CLOSED CENTRE REFUSES RATHER THAN SILENTLY POSTING. Closing one means
 * the branch shut; a line still landing there is a figure in a report nobody
 * reads any more.
 */
export function refusePlacing(
  at: { readonly centre: string | null; readonly root: Root },
  centres: readonly Pick<Centre, "id" | "closed">[],
  required: boolean,
): PlacingRefusal | null {
  if (!at.centre) {
    return required && earns(at.root) ? "centre_missing" : null;
  }
  const held = centres.find((one) => one.id === at.centre);
  if (!held) return "centre_unknown";
  if (held.closed) return "centre_closed";
  return null;
}

/** ⚠️ The profit and loss, which is the half of the books a centre is about. */
export const earns = (root: Root): boolean => root === "income" || root === "expense";
