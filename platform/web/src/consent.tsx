/**
 * THE CONSENT SHEET — what an app is asking of your own facts, and your answer.
 *
 * ⚠️ IT IS A DECISION SCREEN, NOT A PERMISSION PROMPT, and the difference is the
 * whole design. A permission prompt has two buttons and a sentence somebody
 * wrote to get past it; the answer it collects is "yes" or "not now", and the
 * only thing a person controls afterwards is uninstalling. Here each row is a
 * separate decision, each has a rung rather than a switch, each says what it
 * would show and what it would hide, and every one of them can be moved again
 * from the account centre without opening this app at all.
 *
 * ⚠️ NOTHING IS PRE-SELECTED. Not "recommended" as a default, not a switch
 * already on with a chance to turn it off. Every fact starts at `self` and the
 * recommendation is shown as an ARGUMENT beside the choice — because a default
 * that applied itself would be a disclosure nobody made, and because the whole
 * value of this sheet is that somebody had to move something.
 *
 * ⚠️ AND IT IS DISMISSIBLE, WITH NO PENALTY. Leaving without deciding leaves
 * everything private, which is where it already was. A sheet that could not be
 * escaped would be a product holding itself hostage over data it said was
 * optional — and `required` on a want changes the COPY, never the exit.
 */

import { useState, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Button } from "./button.js";
import { rungsFor, type Reader } from "@one/kernel";
import { Choose, type Option } from "./choose.js";
import { Onward, Tick } from "./icon.js";
import { Card } from "./list.js";
import { Sheet } from "./sheet.js";

/**
 * ⚠️ THE SAME FOUR RUNGS THE PLATFORM RESOLVES, and they are spelled out here
 * rather than imported so this file stays renderable with no kernel present —
 * `web/test/screens.test.tsx` renders it, and a browser bundle should not carry
 * a resolver to draw a list.
 */
export type Reach = "self" | "compute" | "agent" | "staff";

/** One reading an app would show instead of the value. */
export interface AskedReading {
  readonly id: string;
  readonly label: string;
  /** What a reader would be shown. */
  readonly says: string;
  /** ⚠️ What it cannot reveal. This is the sentence that earns the decision. */
  readonly hides: string;
  readonly reach: Reach;
}

/** One line of what this app is asking for. */
export interface Asked {
  readonly fact: string;
  readonly label: string;
  /** Written by whoever wants the data, in what they will DO with it. */
  readonly why: string;
  readonly need: "compute" | "derived" | "raw";
  /**
   * ⚠️ WHO DOES THE READING, where the app wants the value itself. An app whose
   * assistant is the only reader says so, and the person is never offered the
   * human rung — asking for it to reach a model is the over-asking the ladder
   * exists to prevent.
   */
  readonly by?: Reader;
  /**
   * ⚠️ A STRONG CLAIM, AND THE COPY SAYS SO IN THOSE WORDS. `true` means a
   * refusal takes a feature away rather than degrading it — everything else has
   * to cope, and an app that marked everything required would be a product
   * telling somebody their choices are not real.
   */
  readonly required: boolean;
  /** The rung the platform suggests, shown as an argument rather than applied. */
  readonly recommend: Reach;
  /** Why the suggestion is what it is, in the reader's own interest. */
  readonly because: string | null;
  /** What is currently granted. `self` where nothing is. */
  readonly reach: Reach;
  readonly readings: readonly AskedReading[];
}

export interface ConsentSheetProps {
  readonly open: boolean;
  /** The app doing the asking, in its own name. */
  readonly app: string;
  /** ⚠️ The workspace, where there is one. "Kova" and "Kova · Haddad Strength"
   *  are different asks and a person deciding needs to see which. */
  readonly where?: ReactNode;
  readonly asks: readonly Asked[];
  /**
   * ⚠️ ONE WRITE PER DECISION, APPLIED AS IT IS MADE. A sheet that collected
   * every answer and saved on the way out is one where closing the app halfway
   * through discards choices somebody already made — and where the failure of
   * one write is reported against all of them.
   */
  readonly onShare: (what: string, reach: Reach) => Promise<Problem | null>;
  readonly onClose: () => void;
}

/*
  ⚠️ THE OPTIONS ARE WORDED FROM THE PERSON'S SIDE, and `compute` is the one that
  has to be right. "Used in calculations, never shown" is the sentence that makes
  the rung understandable at all — without it, somebody reading a list of four
  cannot tell it from "agent" and picks the one they recognise.
*/
const RUNGS: readonly Option<Reach>[] = [
  { value: "self", label: "Only me", detail: "Nobody else, and nothing computed from it" },
  { value: "compute", label: "Calculations only", detail: "Used to work things out. Nobody is shown it" },
  { value: "agent", label: "The assistant", detail: "A model answering you may read it. No person" },
  { value: "staff", label: "People here", detail: "Anybody with a role in this workspace" },
];

const NAME: Record<Reach, string> = {
  self: "Only me", compute: "Calculations only", agent: "The assistant", staff: "People here",
};

/**
 * ⚠️ WHAT A ROW SAYS WHEN THE APP CANNOT SHOW IT ANYWAY. An app that only
 * computes with a fact has no use for `staff`, and offering it would be the
 * product asking for more than it can spend — which is the thing that teaches
 * people the rungs are theatre.
 */
/*
  ⚠️ THE RECOMMENDATION'S ARGUMENT BELONGS BESIDE THE RUNG IT ARGUES FOR. In the
  list it was a third grey sentence under every decision — read before anybody had
  a choice in front of them, which is where a paragraph goes unread — and four of
  those turned a sheet with four questions on it into twenty lines of prose. Here
  it is one sentence on one option, at the moment somebody is picking.
*/
export const offered = (
  ask: Pick<Asked, "need" | "by">,
  recommend?: Reach | null,
  because?: string | null,
): readonly Option<Reach>[] => {
  const may = rungsFor(ask);
  return RUNGS.filter((r) => may.includes(r.value)).map((r) =>
    because && r.value === recommend ? { ...r, detail: `${r.detail} ${because}` } : r);
};

export function ConsentSheet({ open, app, where, asks, onShare, onClose }: ConsentSheetProps): ReactNode {
  return (
    <Sheet open={open} onClose={onClose} dismissible label={`What ${app} is asking for`}>
      <ConsentBody app={app} where={where} asks={asks} onShare={onShare} onClose={onClose} />
    </Sheet>
  );
}

/**
 * THE CONTENT, WITHOUT THE PRESENTATION.
 *
 * ⚠️ THE SAME SEAM `center.tsx` DRAWS, AND FOR THE SAME REASON TWICE OVER. A
 * sheet is a focus trap, a scroll lock and a portal — none of which is a fact
 * about a consent decision, and all of which is identical for every sheet. And
 * because a portal renders nothing outside a browser, a body welded to one is a
 * body no test can read: every assertion about the words somebody is being asked
 * to agree to would have to be made against an empty string.
 */
export function ConsentBody({ app, where, asks, onShare, onClose }: Omit<ConsentSheetProps, "open">): ReactNode {
  const [choosing, setChoosing] = useState<string | null>(null);

  return (
    <>
      <div className="sheet-body">
        <header className="sheet-top">
          <h2 className="sheet-title">What {app} would like to see</h2>
          {/*
            ⚠️ THE LEDE SAYS WHERE IT ALL LIVES, ONCE. Repeating "you can change
            this later" on every row is the sentence people stop reading; saying
            it once, at the top, is the sentence they remember.
          */}
          <p className="lede">
            {where ? <>In {where}. </> : null}
            None of this is stored by {app} — it stays yours, and you can change or
            stop any of it from your account at any time.
          </p>
        </header>

        {asks.map((ask) => (
          <Card key={ask.fact}>
            <Ask
              title={ask.label}
              why={ask.why}
              required={ask.required}
              reach={ask.reach}
              onOpen={() => setChoosing(ask.fact)}
            />
            {/*
              ⚠️ A READING IS ITS OWN DECISION AND ITS OWN BLOCK. "My coach may
              see which way my weight is going; my coach may not see my weight"
              is two answers, and nesting the second inside the first would ask
              one question and record two.
            */}
            {ask.readings.map((r) => (
              <Ask
                key={r.id}
                under
                title={r.label}
                why={r.says}
                hides={r.hides}
                reach={r.reach}
                onOpen={() => setChoosing(r.id)}
              />
            ))}
          </Card>
        ))}

        {/* ⚠️ "Done", NEVER "Allow". Nothing here was allowed as a whole — every
            row was answered on its own, and a single button implying otherwise
            would be the permission prompt this sheet exists instead of. */}
        <Button tone="loud" wide onClick={onClose}>Done</Button>
      </div>

      {[...asks.flatMap((a) => [
        {
          id: a.fact, label: a.label, need: a.need, reach: a.reach,
          /* ⚠️ THE ARGUMENT IS OFFERED ONLY WHERE IT ARGUES FOR SOMETHING. A
             recommendation of "only me" recommends the state somebody is already
             in, so the sentence would be an argument for changing nothing. */
          recommend: a.recommend !== "self" ? a.recommend : null, because: a.because,
        },
        ...a.readings.map((r) => ({
          id: r.id, label: r.label, need: "derived" as const, reach: r.reach,
          recommend: null, because: null,
        })),
      ])].map((row) => (
        <Choose
          key={row.id}
          open={choosing === row.id}
          title={row.label}
          options={offered(row, row.recommend, row.because)}
          value={row.reach}
          onPick={(reach) => onShare(row.id, reach)}
          onClose={() => setChoosing(null)}
        />
      ))}
    </>
  );
}

/**
 * ONE DECISION, WITH EVERYTHING NEEDED TO MAKE IT.
 *
 * ⚠️ THE CURRENT ANSWER IS ALWAYS SHOWN, IN WORDS. A chevron alone makes every
 * block look unanswered — so somebody who has already decided cannot see that
 * they have, and the sheet reads as a form they failed to fill in.
 */
const Ask = ({ title, why, hides, required, reach, under, onOpen }: {
  readonly title: string;
  readonly why: string;
  readonly hides?: string;
  readonly required?: boolean;
  readonly reach: Reach;
  readonly under?: boolean;
  readonly onOpen: () => void;
}): ReactNode => (
  <div className="ask" data-under={under ? "" : undefined}>
    <span className="ask-title">{title}</span>
    <span className="ask-why">{why}</span>
    {/* ⚠️ WHAT IT CANNOT REVEAL. The sentence that earns the decision, and the
        reason a reading is a smaller ask rather than a differently-worded one. */}
    {hides ? <span className="ask-hides">{hides}</span> : null}
    {required ? <span className="ask-note">Without this, that part of the app will not work.</span> : null}
    <button
      type="button"
      className="ask-answer press-flat"
      data-open={reach === "staff" ? "" : undefined}
      onClick={onOpen}
    >
      {reach === "self" ? null : <Tick size={16} />}
      <span className="rung-name">{NAME[reach]}</span>
      <Onward className="chevron" size={18} />
    </button>
  </div>
);

/**
 * WHAT AN APP RAISES WHEN IT NEEDS SOMETHING IT HAS NOT BEEN GIVEN.
 *
 * ⚠️ A PROMPT AT THE MOMENT OF USE, NOT AT SIGN-UP. A consent screen shown once
 * during onboarding is answered by somebody who has not seen the feature and
 * cannot weigh it; the same question asked where the blank is, by a screen that
 * says what would fill it, is one somebody can actually answer.
 *
 * ⚠️ AND IT IS NOT AN ERROR. `not_shared` is a decision the person is entitled
 * to, so this is an invitation rather than a failure — no alarm colour, no
 * apology, and it stays out of the way of whatever else the screen shows.
 */
export interface AskForItProps {
  readonly what: string;
  /** One line: what this screen would be able to show. */
  readonly then: string;
  readonly onAsk: () => void;
}

export const AskForIt = ({ what, then, onAsk }: AskForItProps): ReactNode => (
  <div className="card blank">
    <p className="blank-title">{what} is not shared here</p>
    <p className="lede">{then}</p>
    <Button tone="quiet" onClick={onAsk}>Choose what to share</Button>
  </div>
);
