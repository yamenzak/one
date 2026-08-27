/**
 * WHAT A JOB USED, SAID AS A SENTENCE — pure, with no database.
 *
 * ⚠️ THE TRACE IS READ BACKWARDS AND THAT IS THE WHOLE FEATURE. A job records no
 * lines of its own; every take against it already named it in the ledger's
 * `against`, so what it consumed is a QUERY. A job correct on Tuesday acquires a
 * concern on Thursday — a recall lands on a lot it used — and a status written
 * when the job closed can never learn that.
 *
 * ⚠️ AND THE DOUBT IS THE COLUMN SOMEBODY OPENS THIS TO READ. Four facts about
 * one line — how many, which lot, when, and whether that lot is now in question
 * — are one row with three slots, so the arithmetic and the wording happen here
 * rather than being assembled from columns on a screen.
 */

/**
 * WHY A LINE IS IN QUESTION, or nothing.
 *
 * ⚠️ TWO REASONS AND NOT ONE, because they are two different phone calls. A lot
 * somebody froze is a decision that has been taken and can be undone; a lot a
 * run failed to release is a batch that was never fit to use and went out
 * anyway. Collapsing them to "in doubt" leaves whoever is holding the recall
 * notice with no idea which they are looking at.
 */
export const DOUBTS = ["held", "not released"] as const;
export type Doubt = typeof DOUBTS[number] | "";

/** ⚠️ What a doubt is called where a person reads it, never the stored word. */
export const saysDoubt = (doubt: Doubt): string =>
  (doubt === "held" ? "the lot is held"
    : doubt === "not released" ? "the lot was never released"
      : "");

export interface Used {
  readonly quantity: number;
  readonly lot: string;
  readonly doubt: Doubt;
}

/**
 * ONE LINE OF A TRACE AS A SENTENCE.
 *
 * ⚠️ THE LOT IS NAMED WHERE THERE IS ONE AND OMITTED WHERE THERE IS NOT, rather
 * than drawn as an empty column. A blank under a heading reading "Lot" is a
 * product that failed to record one; a product that does not carry lots at all
 * has nothing to say and should say nothing.
 *
 * ⚠️ AND THE DOUBT COMES LAST, AFTER A DASH. It is the only part of the line
 * that is an alarm, and a sentence that opens with one makes every ordinary line
 * read as urgent for the length of two words.
 */
export function saysUsed(used: Used): string {
  const took = `${used.quantity} taken`;
  const of = used.lot ? `${took} · lot ${used.lot}` : took;
  const why = saysDoubt(used.doubt);
  return why ? `${of} — ${why}` : of;
}
