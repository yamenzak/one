/**
 * HOW THE PRODUCT TALKS, AS RULES A SCRIPT CAN APPLY.
 *
 * ⚠️ A STYLE GUIDE NOBODY CAN RUN IS A STYLE GUIDE NOBODY FOLLOWS. Every
 * "principle" here is a check with a consequence, because the alternative — a
 * page of good advice in a document — lasts until the first hurried screen and
 * then reads as something somebody used to care about.
 *
 * ⚠️ AND IT IS IN THE KERNEL BECAUSE DECLARATIONS CARRY COPY. A collection's
 * label, an operation's summary, a setting's help text and a notification's
 * sentence are all strings an app writes, all of which reach a screen — so the
 * rules apply where the strings are, rather than where they are rendered.
 *
 * ⚠️ WHAT THIS DELIBERATELY DOES NOT DO: judge whether a sentence is good. It
 * catches the specific, mechanical faults that make a product feel like it is
 * apologising or padding — and leaves everything else to a person.
 */

export type Voice =
  /** What a screen or a thing IS. A noun phrase. "Privacy", "Your workspaces". */
  | "title"
  /**
   * ⚠️ WHAT A ROW IS, WHICH IS NOT WHAT A SCREEN IS. "Add money to their
   * account" is a good row label and a bad screen title, and holding both to
   * four words would force one of them to be worse. A row has its neighbours for
   * context; a title has to survive alone in a back button.
   */
  | "name"
  /** One line under a label. Says the consequence, not the mechanism. */
  | "under"
  /** What a control DOES, on the control. Verb first. "Send me a code". */
  | "action"
  /** What is true when there is nothing here. */
  | "empty"
  /**
   * ⚠️ A PARAGRAPH INSIDE A CARD, AND THE ONE VOICE THAT HAD NO RULE — which is
   * why the account-deletion card carried forty-five words in three sentences
   * on a screen whose whole design language is "as short as it can be and still
   * be true". Every other voice here is capped; a prose block with no cap is
   * where the words a screen could not fit anywhere else collect.
   *
   * ⚠️ AND THE CAP IS TWO SENTENCES RATHER THAN A WORD COUNT ALONE, because
   * that is the fault: not one long sentence but a THIRD one, which is where a
   * card stops being read and starts being skipped. Detail past that belongs in
   * the two-step the action opens, where somebody is already reading carefully.
   */
  | "body"
  /**
   * ⚠️ A SENTENCE THE PRODUCT SAYS ABOUT SOMETHING THAT HAPPENED — a refusal, a
   * notification. It is not a `title`: "We could not reach One" is the right
   * shape for a problem and the wrong shape for a screen, and holding both to
   * the four-word noun-phrase rule would force one of them to be bad.
   */
  | "notice";

export interface CopyRefusal {
  readonly rule: string;
  readonly why: string;
}

/**
 * ⚠️ EACH OF THESE COSTS THE READER SOMETHING AND BUYS NOTHING. `please` on a
 * control makes the product sound like it is asking permission for its own
 * behaviour; `simply` and `just` tell somebody that what they are struggling
 * with is easy; `oops` turns a real failure into a joke at the expense of
 * whoever hit it.
 */
const PADDING = [
  "please", "simply", "just ", "kindly", "obviously", "of course",
  "oops", "whoops", "uh oh", "sorry",
  "in order to", "be able to", "at this time", "as you can see",
];

/** ⚠️ A control that is a noun is a control nobody knows the outcome of. */
const NOT_A_VERB = ["ok", "yes", "no", "submit", "here", "click here", "more", "info"];

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);

/**
 * Whether a string is allowed to be shown, and why not.
 *
 * ⚠️ RETURNS EVERY BREACH, NOT THE FIRST. A checker that stops at one makes
 * somebody fix a sentence four times.
 */
export function refuseCopy(voice: Voice, text: string): readonly CopyRefusal[] {
  const out: CopyRefusal[] = [];
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const n = words(trimmed).length;

  if (!trimmed) return [{ rule: "empty", why: "there is no text" }];

  for (const pad of PADDING) {
    if (lower.includes(pad)) {
      out.push({ rule: "padding", why: `"${pad.trim()}" costs the reader a word and buys nothing` });
    }
  }

  /* ⚠️ An exclamation mark is the product being pleased with itself. The one
     place enthusiasm belongs is somebody else's achievement, and a declaration
     is not that. */
  if (trimmed.includes("!")) {
    out.push({ rule: "shouting", why: "an exclamation mark is the product congratulating itself" });
  }

  /*
    ⚠️ THERE IS NO RULE AGAINST CAPITALS, AND THAT IS A DECISION RATHER THAN AN
    OMISSION. One was written and removed the same hour: real product copy is
    full of brands, acronyms, bank codes and IBANs — REWE, REVODEB2, SEPA — and
    the check flagged every one. The fault it targeted (SHOUTING for emphasis) is
    rare and obvious in review; the false positives were constant. A guard people
    waive is worse than no guard, because it teaches everybody that a red line
    from this file is probably nothing.
  */

  switch (voice) {
    case "name":
      if (n > 6) out.push({ rule: "length", why: `${n} words; a row label is six or fewer` });
      if (/[.:]$/.test(trimmed)) out.push({ rule: "punctuation", why: "a row label is not a sentence" });
      break;

    case "title":
      /* ⚠️ A title is what you are looking at, and it has to survive being read
         in a back button, a tab and a breadcrumb. */
      if (n > 4) out.push({ rule: "length", why: `${n} words; a title is four or fewer` });
      if (/[.:]$/.test(trimmed)) out.push({ rule: "punctuation", why: "a title is not a sentence" });
      break;

    case "under":
      /*
        ⚠️ NO TERMINAL FULL STOP, AND THIS IS THE RULE MOST OFTEN GOT WRONG. A
        one-line description under a label is a caption, not prose; a full stop
        on some and not others is the visible edge of a product with no house
        style, and it is exactly what a reader notices without being able to say
        why.
      */
      if (/\.$/.test(trimmed)) {
        out.push({ rule: "punctuation", why: "a one-line description takes no full stop" });
      }
      if (n > 14) out.push({ rule: "length", why: `${n} words; a description is fourteen or fewer` });
      break;

    case "action":
      if (n > 4) out.push({ rule: "length", why: `${n} words; a control is four or fewer` });
      if (/[.!?]$/.test(trimmed)) out.push({ rule: "punctuation", why: "a control is not a sentence" });
      if (NOT_A_VERB.includes(lower)) {
        out.push({ rule: "vague", why: `"${trimmed}" does not say what will happen` });
      }
      /* ⚠️ Verb first: "Send me a code", never "Code sending". A control named
         after its noun is a control whose outcome you learn by pressing it. */
      if (/^(?:the|a|an|your|my)\b/i.test(trimmed)) {
        out.push({ rule: "not-a-verb", why: "a control starts with the verb, not an article" });
      }
      break;

    case "notice":
      if (n > 9) out.push({ rule: "length", why: `${n} words; a notice is nine or fewer` });
      /* ⚠️ Still no terminal stop: it sits in a card beside four others that
         have none, and the inconsistency is what a reader notices. */
      if (/\.$/.test(trimmed)) out.push({ rule: "punctuation", why: "a notice takes no full stop" });
      break;

    case "body":
      if (n > 24) out.push({ rule: "length", why: `${n} words; a paragraph in a card is twenty-four or fewer` });
      /* ⚠️ COUNTED ON THE STOPS, and an abbreviation is not one — `e.g.` has no
         space after its full stop, so the split ignores it rather than reporting
         a sentence that is not there. */
      {
        const stops = trimmed.split(/[.?!](?:\s|$)/).filter((part) => part.trim()).length;
        if (stops > 2) {
          out.push({ rule: "length", why: `${stops} sentences; a card says two, and the rest belongs where the action is confirmed` });
        }
      }
      break;

    case "empty":
      if (n > 12) out.push({ rule: "length", why: `${n} words; an empty state is twelve or fewer` });
      /* ⚠️ "0 results" is the machine's answer. A person's is "Nothing here
         yet", which says the same thing and adds that it is a beginning. */
      if (/^\s*(?:0|no)\s+(?:results?|items?|records?|rows?)\b/i.test(trimmed)) {
        out.push({ rule: "system-voice", why: "say what is not there in the reader's words, not the query's" });
      }
      break;
  }

  return out;
}


