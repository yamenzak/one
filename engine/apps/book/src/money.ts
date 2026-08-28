/**
 * MONEY IN SOMEBODY ELSE'S CURRENCY.
 *
 * ⚠️ THE BOOKS ARE KEPT IN ONE CURRENCY AND THAT NEVER CHANGES. Every balance,
 * every report and every figure that has to add up is in the workspace's own —
 * so a foreign posting carries THREE numbers: what was actually paid, the rate
 * it was converted at, and what that came to in the books. The third is the only
 * one the ledger adds up, which is why an entry still balances however many
 * currencies it touches.
 *
 * ⚠️ AND THE OTHER TWO ARE NOT DECORATION. Without them a business cannot answer
 * "how many dollars are in the dollar account" — the base figure has moved with
 * every rate since — and cannot revalue, cannot reconcile against a foreign bank
 * statement, and cannot show a supplier what it owes them in their own money.
 *
 * ⚠️ A RATE IS AN INTEGER OF MILLIONTHS, NOT A FLOAT. `0.1 + 0.2` is famously
 * not `0.3`, and a rate multiplied into every line of every entry is the worst
 * possible place for that: the error is small, it is different per line, and it
 * surfaces as a trial balance that is out by pennies with nothing to point at.
 * Six places is what every bank and every central bank publishes.
 *
 * ⚠️ AND THE MULTIPLICATION IS IN `BigInt`, BECAUSE THE BOUNDARY IS NOT WHERE
 * ANYBODY WOULD GUESS. A billion in cents times a rate in millionths is 1e17,
 * past what a double holds exactly — and yet the error is usually absorbed by
 * the division that follows, so most large figures come out right with floats
 * and a few do not. Reasoning about which is a boundary somebody has to re-check
 * every time this is edited, over an arithmetic whose failure is money. Exact is
 * cheaper than correct-if-you-think-about-it; the RESULT is then checked to fit
 * before it leaves.
 *
 * Pure. No database, no I/O.
 */

import { minorDigitsOf } from "@engine/kernel";

import type { Line } from "./posting.js";

/* ------------------------------------------------------------------- rates --- */

/**
 * ⚠️ MILLIONTHS. `3.6725` AED to the dollar is `3_672_500`. Six places is what
 * central banks publish and what a bank statement reconciles against; four is
 * not enough for a currency like the Iranian rial and eight is a precision
 * nobody quotes.
 */
export const RATE_SCALE = 1_000_000;

export type RateRefusal = "rate_missing" | "rate_backwards" | "rate_absurd";

/**
 * ⚠️ THE CEILING AND THE FLOOR ARE FOR TYPOS, NOT FOR ECONOMICS. Real rates span
 * an enormous range — one dollar is about 0.0000003 of a bitcoin and about
 * 1,400 Korean won — so the bounds are wide enough that no real quote meets
 * them. What they catch is a rate typed into the amount box: a "rate" of
 * 250,000 against a currency worth roughly one is an entry that would post a
 * quarter of a million times what anybody meant, and it balances.
 */
const MOST = 1_000_000 * RATE_SCALE;
const LEAST = 1;

export function refuseRate(rate: number): RateRefusal | null {
  if (!Number.isInteger(rate) || rate === 0) return "rate_missing";
  if (rate < 0) return "rate_backwards";
  if (rate < LEAST || rate > MOST) return "rate_absurd";
  return null;
}

/* -------------------------------------------------------------- converting --- */

/**
 * ⚠️ THE ONE THAT CANNOT BE GOT WRONG QUIETLY. A hundred yen and a hundred cents
 * are the same integer and a hundredfold apart, so a conversion that assumed two
 * decimal places is right for most of the world and wrong by 100 for Japan,
 * Korea and Iceland — in a figure that looks entirely plausible on the screen
 * that shows it. `minorDigitsOf` is the kernel's, asked of `Intl`, and it is
 * asked about BOTH currencies here.
 */
export type ConvertRefusal = "amount_too_large";

export function inBase(
  original: number, rate: number, from: string, to: string,
): number | ConvertRefusal {
  const num = BigInt(Math.trunc(original)) * BigInt(Math.trunc(rate))
    * 10n ** BigInt(minorDigitsOf(to));
  const den = BigInt(RATE_SCALE) * 10n ** BigInt(minorDigitsOf(from));

  /* ⚠️ HALF AWAY FROM ZERO, WHICH IS WHAT A BANK DOES AND WHAT A PERSON EXPECTS.
     Banker's rounding is defensible and is not what the statement they are
     reconciling against used, and rounding toward zero loses a cent on every
     conversion in one direction only — which accumulates, in the platform's
     favour, invisibly. */
  const below = num < 0n;
  const size = below ? -num : num;
  const whole = size / den;
  const over = size % den;
  const near = over * 2n >= den ? whole + 1n : whole;
  const out = below ? -near : near;

  /*
    ⚠️ CHECKED BEFORE IT LEAVES, because `field.money` is a JavaScript integer
    and past 2^53 that stops being exact. A figure that quietly rounds itself is
    the failure this whole module is written in `BigInt` to avoid, and it would
    arrive at the last step.
  */
  if (out > BigInt(Number.MAX_SAFE_INTEGER) || out < -BigInt(Number.MAX_SAFE_INTEGER)) {
    return "amount_too_large";
  }
  return Number(out);
}

/**
 * ⚠️ THE RATE A FIGURE IMPLIES, WHICH IS WHAT AN OPERATOR ACTUALLY HAS. Somebody
 * paying a foreign invoice knows what left their account and what arrived; the
 * rate is the thing they would otherwise have to work out on a calculator and
 * type to six places. Derived here, it is exact to the millionth and it is the
 * same arithmetic run backwards, so the two can never disagree.
 */
export function rateFrom(
  original: number, base: number, from: string, to: string,
): number | ConvertRefusal {
  if (!original) return "amount_too_large";
  const num = BigInt(Math.trunc(base)) * BigInt(RATE_SCALE)
    * 10n ** BigInt(minorDigitsOf(from));
  const den = BigInt(Math.trunc(original)) * 10n ** BigInt(minorDigitsOf(to));
  const below = (num < 0n) !== (den < 0n);
  const size = num < 0n ? -num : num;
  const under = den < 0n ? -den : den;
  const whole = size / under;
  const over = size % under;
  const near = over * 2n >= under ? whole + 1n : whole;
  const out = below ? -near : near;
  if (out > BigInt(Number.MAX_SAFE_INTEGER) || out < -BigInt(Number.MAX_SAFE_INTEGER)) {
    return "amount_too_large";
  }
  return Number(out);
}

/* ------------------------------------------------------- a whole entry, over --- */

/**
 * A BALANCED ENTRY, CONVERTED, STILL BALANCED.
 *
 * ⚠️ CONVERTING LINE BY LINE DOES NOT BALANCE, AND THAT IS ARITHMETIC RATHER
 * THAN A BUG. The sum of rounded figures is not the rounded sum: three lines of
 * 33.33 and one of −99.99 add to nothing in dollars and, at almost any rate,
 * come to a penny either side of nothing in dirhams. The entry would be refused
 * by `refuseEntry` — correctly — and the person raising a perfectly ordinary
 * foreign invoice would be told their books do not balance.
 *
 * ⚠️ SO THE REMAINDER IS POSTED RATHER THAN SPREAD. Absorbing it into the
 * largest line makes revenue wrong by a penny with nothing recording that it was
 * moved; putting it on the exchange account says what it is — a difference that
 * arose on conversion — and it is the same account, and the same argument, as a
 * revaluation's. A workspace can read a year's worth of them in one place.
 *
 * ⚠️ AND EVERY LINE KEEPS WHAT IT ACTUALLY WAS. `original` and `rate` travel with
 * each converted line, so a foreign receivable can be shown to the customer in
 * their own money, reconciled against their statement, and revalued later.
 */
export function inBaseLines(
  lines: readonly Line[],
  from: string,
  rate: number,
  to: string,
  exchange: string,
  said: string,
): readonly Line[] | ConvertRefusal {
  const out: Line[] = [];
  let over = 0;
  for (const one of lines) {
    const base = inBase(one.amount, rate, from, to);
    if (typeof base !== "number") return base;
    over += base;
    out.push({ ...one, amount: base, currency: from, original: one.amount, rate });
  }
  /* ⚠️ AND USUALLY THERE IS NONE, so an ordinary foreign invoice carries no
     extra line at all — the account appears when it has something to say. */
  if (over) out.push({ account: exchange, amount: -over, memo: said });
  return out;
}

/* ------------------------------------------------------------- revaluation --- */

/**
 * ONE ACCOUNT THAT HOLDS SOMEBODY ELSE'S MONEY.
 *
 * ⚠️ TWO FIGURES, AND THEY DRIFT APART BY DESIGN. `original` is what is actually
 * in the account — dollars in the dollar account — and it does not move when a
 * rate does. `base` is what the books say that was worth, and it is the sum of
 * what every posting was converted at, on the day it was converted. The gap
 * between them is a real gain or a real loss the business has already made.
 */
export interface Holding {
  readonly account: string;
  readonly currency: string;
  /** ⚠️ Minor units of `currency`. Debit positive, the same as a posting. */
  readonly original: number;
  /** ⚠️ Minor units of the workspace's own currency. */
  readonly base: number;
}

/**
 * WHAT REVALUING THE FOREIGN ACCOUNTS POSTS.
 *
 * ⚠️ A BALANCE SHEET IS AS AT A DATE, AND A FOREIGN BALANCE HAS TO BE SHOWN AT
 * THAT DATE'S RATE. A dollar account filled at 3.67 and reported at 3.67 a year
 * later is a balance sheet stating a number that was true once — every
 * jurisdiction requires it restated, and the difference is a gain or a loss that
 * has already happened whether or not anybody records it.
 *
 * ⚠️ AND IT IS THE ACCOUNT'S OWN CURRENCY THAT DECIDES, NOT THE POSTING'S. An
 * account marked as holding dollars is revalued whole; a stray posting in a
 * third currency into a dollar account is a mistake, and the answer to a mistake
 * is a report somebody reads rather than arithmetic that silently absorbs it.
 *
 * ⚠️ IT BALANCES BY CONSTRUCTION. Each account moves by its own difference and
 * the total goes to the exchange account, so the entry sums to zero however many
 * accounts there are — the same property `closingLines` has, and for the same
 * reason: a check is worse than a shape that cannot be wrong.
 */
export function revalueLines(
  held: readonly Holding[],
  rates: ReadonlyMap<string, number>,
  base: string,
  exchange: string,
  said = "Revaluation",
): readonly Line[] {
  const lines: Line[] = [];
  let total = 0;

  for (const one of held) {
    const rate = rates.get(one.currency);
    /* ⚠️ NO RATE IS SKIPPED, NOT GUESSED AT. An account revalued at a rate
       nobody supplied is a figure invented and posted; the operation above tells
       whoever asked which currency it had no rate for. */
    if (!rate) continue;
    const should = inBase(one.original, rate, one.currency, base);
    if (typeof should !== "number") continue;
    const move = should - one.base;
    if (!move) continue;
    lines.push({ account: one.account, amount: move, memo: said });
    total += move;
  }

  if (!lines.length) return [];
  lines.push({ account: exchange, amount: -total, memo: said });
  return lines;
}

/**
 * ⚠️ WHICH CURRENCIES A REVALUATION HAD NO RATE FOR, SO THE OPERATION CAN SAY SO.
 * Silently leaving an account out is the shape this repository refuses
 * everywhere else: a report that ran, said it succeeded, and left the one
 * account somebody was asking about exactly as wrong as it was.
 */
export const unrated = (
  held: readonly Holding[], rates: ReadonlyMap<string, number>,
): readonly string[] =>
  [...new Set(held.filter((one) => !rates.get(one.currency)).map((one) => one.currency))].sort();
