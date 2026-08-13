/**
 * METERING — reserve, run, settle, and the one asymmetry that decides the shape.
 *
 * Layer 1. Imports primitives only.
 *
 * ⚠️ A RESERVE IS A CEILING ON REVENUE, NOT AN ESTIMATE.
 *
 * Settlement charges the lesser of what was held and what was reported, because
 * charging more than was held would let a runaway call empty a balance that was
 * never authorised. That cap is correct and it is also the whole problem: every
 * unit a reserve fails to anticipate is a unit the platform pays for and the
 * workspace does not — silently, on every call, with nothing to observe.
 *
 * So estimating high is a rounding error and estimating low is a transfer, and
 * every default in this file leans the safe way.
 */

/* ------------------------------------------------------------- the shape --- */

/**
 * ⚠️ ONE CALL RETURNS BOTH HALVES, AND THAT IS THE FIX.
 *
 * The defect this prevents is not an arithmetic slip, it is a SHAPE: two
 * functions, one producing the text that will be sent and one producing the
 * reserve that will be held, and a caller free to hand a different text to each.
 * A production path once budgeted eight thousand output units for a request that
 * asked for thirty-two thousand, padded a six-thousand-character system text by
 * a flat two hundred, and used the English character ratio on Arabic. Unit tests
 * over each half separately were green throughout, and stayed green under a
 * mutation that restored the original defect — which is what the defect WAS.
 *
 * Returning them together makes the two impossible to disagree, so there is no
 * arithmetic to keep in step.
 */
export interface Run {
  /** Exactly the text that will be sent. */
  readonly system: string;
  /**
   * ⚠️ AND EXACTLY THE PROMPT THAT WILL BE SENT, for the same reason.
   *
   * A workspace may put its own words in front of what the caller asks — that is
   * the whole of the per-workspace prompt — and a caller free to send its own
   * string while this one was measured is the two-document defect above with a
   * second author. Both halves of what goes over the wire come back from one
   * call, so there is nothing to keep in step.
   */
  readonly prompt: string;
  /** What must be held before it is. */
  readonly reserve: number;
}

/* ------------------------------------------------------------ estimation --- */

/**
 * ⚠️ CHARACTERS PER UNIT IS NOT A CONSTANT, AND FOUR IS THE ENGLISH ANSWER.
 *
 * Scripts outside the Latin range run closer to two, so a fixed four halves the
 * reserve for a workspace operating in Arabic — a systematic under-charge on
 * exactly the customers a fixed constant was never measured against. Detected
 * from the text rather than from a locale setting, because the text is what is
 * actually tokenised and a workspace's locale says nothing about what somebody
 * typed into it.
 */
export function charsPerUnit(text: string): number {
  if (text.length === 0) return LATIN_RATIO;
  let latin = 0;
  for (const ch of text) if (ch.codePointAt(0)! < 0x0250) latin++;
  return latin / text.length > 0.6 ? LATIN_RATIO : DENSE_RATIO;
}

const LATIN_RATIO = 4;
const DENSE_RATIO = 2;

/** A model that reasons before answering spends units nothing in the request shows. */
const THINKING_WIDENING = 1.5;

export interface Estimate {
  readonly system: string;
  readonly prompt: string;
  /** What the request will ASK FOR, not what a typical answer is. */
  readonly maxOutput: number;
  readonly thinking: boolean;
  /** Units per input unit and per output unit, from the catalogue. */
  readonly rate: { readonly input: number; readonly output: number };
  /**
   * ⚠️ INPUT UNITS ONE ATTACHED IMAGE COSTS, and it is nowhere in the text.
   *
   * Providers bill a picture as a flat block of input units — hundreds to
   * thousands of them, more than most prompts — and none of that is visible to
   * a reserve computed from characters. A vision call metered on its text alone
   * holds almost nothing, so the cap settles at almost nothing, and every
   * photograph anybody sends is one the platform pays for in full.
   *
   * ⚠️ AND THE FAILURE SCALES WITH USE. Photographing a meal is the feature
   * people use most, so the cheapest-looking line in the catalogue is the one
   * running up the largest invoice.
   */
  readonly imageUnits?: number;
}

/**
 * The reserve, and the text it was computed from, from one call.
 *
 * ⚠️ THE OUTPUT SIDE IS THE CEILING THE REQUEST ASKS FOR. Budgeting a typical
 * answer means every long one is partly free, and long answers are not rare —
 * they are what the expensive requests produce.
 */
export function planRun(e: Estimate): Run {
  const text = Math.ceil((e.system.length + e.prompt.length) / charsPerUnit(e.system + e.prompt));
  const input = text + (e.imageUnits ?? 0);
  const output = e.thinking ? Math.ceil(e.maxOutput * THINKING_WIDENING) : e.maxOutput;
  return { system: e.system, prompt: e.prompt, reserve: Math.ceil(input * e.rate.input + output * e.rate.output) };
}

/* ------------------------------------------------------------- pictures --- */

/**
 * What one generated image holds.
 *
 * ⚠️ A PICTURE IS PRICED PER PICTURE, NOT PER UNIT, and forcing it through the
 * token arithmetic is how a shipping product came to bill an image at the cost
 * of the sentence that asked for it. There is no input side worth counting and
 * no output ceiling that means anything — the request either produces an image
 * or it does not.
 *
 * ⚠️ AND THE COUNT IS PART OF THE RESERVE. A request for four images that held
 * the price of one is three images the platform pays for, and asking for several
 * at once is the ordinary case rather than the exotic one.
 */
export function planImages(e: { readonly perImage: number; readonly count: number; readonly system?: string; readonly prompt?: string }): Run {
  return { system: e.system ?? "", prompt: e.prompt ?? "", reserve: Math.ceil(e.perImage * Math.max(1, e.count)) };
}

/* ------------------------------------------------------------- settlement --- */

/**
 * What to charge.
 *
 * ⚠️ A MISSING REPORT SETTLES AT THE RESERVE, NEVER AT A RECOUNT.
 *
 * When a provider returns no usage the tempting fallback is to measure the text
 * that came back. That guess can only ever be low — the cap already catches the
 * other direction — so it converts every unreported call into a discount. The
 * reserve was computed to be an upper bound; charging it is the one answer that
 * is never wrong in the expensive direction.
 */
export function settle(held: number, reported: number | null): number {
  if (reported === null) return held;
  return Math.min(held, Math.max(0, reported));
}

/* ------------------------------------------------------------- the ledger --- */

/**
 * ⚠️ A BALANCE IS SUMMED FROM ENTRIES, NEVER STORED AND UPDATED.
 *
 * A stored total is a second source of truth that a lost write, a retried
 * webhook or a partially applied refund puts out of step with the entries that
 * produced it — and the entries are the ones anybody can audit, so the total is
 * always the copy that is wrong. Summing is cheap up to volumes far past where a
 * periodic checkpoint entry becomes the answer.
 */
export interface Entry {
  readonly delta: number;
  readonly reason: string;
}

export const balanceOf = (entries: readonly Entry[]): number => entries.reduce((sum, e) => sum + e.delta, 0);

/**
 * ⚠️ A REVERSAL IS PROPORTIONAL, CLAMPED, AND INCREMENTAL.
 *
 * A refund of part of a payment reverses that part of what the payment granted.
 * Two things make the naive version wrong in ways that only show up in money:
 * the provider reports a CUMULATIVE refunded amount, so reversing the reported
 * figure each time reverses the first refund again on the second; and rounding a
 * proportion can exceed what was granted, which turns a partial refund into a
 * negative balance the workspace has to pay off before it can buy anything.
 */
export function reversal(input: {
  readonly granted: number;
  readonly paidMinor: number;
  readonly refundedMinorTotal: number;
  readonly alreadyReversed: number;
}): number {
  if (input.paidMinor <= 0) return 0;
  const owed = Math.floor((input.granted * input.refundedMinorTotal) / input.paidMinor);
  return Math.max(0, Math.min(input.granted, owed) - input.alreadyReversed);
}
