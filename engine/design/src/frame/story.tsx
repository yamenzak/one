/**
 * A FLOW THAT NARRATES: ONE QUESTION A SCREEN, AND WHAT YOU ANSWERED STAYS SAID.
 *
 * ⚠️ THE COST THIS EXISTS TO REMOVE IS TRAINING. A form of twenty fields is a
 * form somebody has to be TAUGHT — what "Tracked as: batched" means, why "Pack"
 * is on the barcode and not on the product, which four of the twenty are
 * actually required. Every product that ships one grows a wiki, an induction
 * video and a person who knows. None of those are the fix; they are what a
 * screen costs when it asks a database's question instead of a person's.
 *
 * ⚠️ SO AN ASK IS A QUESTION AND ITS ANSWER IN THE SAME WORDS. "How closely do
 * you follow it?" — and the moment somebody chooses, the screen says back
 * *"Each delivery is kept apart, so you can expire one or recall one"*. That
 * sentence is not help text. Help text sits under a field explaining a word;
 * this is the app repeating the decision in the language the decision was made
 * in, which is the only form of explanation nobody has to be told to read.
 *
 * ⚠️ AND THE SENTENCE IS WRITTEN ONCE, ON THE STEP, WHICH IS THE WHOLE
 * MECHANISM. `says` is the step's own account of its answer, and the review at
 * the end is built out of them. Written a second time in the summary they would
 * drift the first time somebody edited one — and a summary that disagrees with
 * the screen it summarises is worse than none, because it is the half people
 * trust.
 *
 * ⚠️ IT IS NOT DRAWN UNDER THE CONTROL, AND IT WAS. A ticked line restating the
 * answer an inch below the control still showing it is a screen talking about
 * itself: on a step with one field the restatement is longer than the answer,
 * and the tick beside it reads as a verdict on something nobody has finished.
 * A clause reads back to somebody who has LEFT the step, which is the review.
 *
 * ⚠️ THE SUMMARY IS A STEP, NOT A BAND ON EVERY SCREEN. A recap riding along
 * above each question was tried and was wrong both ways round: closed it showed
 * one clause and a count, which is a fragment with a number after it; open it
 * was eight lines of context between somebody and the one thing being asked.
 * Every screen is the question and nothing else now, and the whole story is the
 * LAST step — where a summary is actually read, immediately above the button
 * that commits it, with every line one press from the step that wrote it.
 *
 * ⚠️ THAT IS ALSO WHAT MAKES A MODEL'S ANSWER CHECKABLE. Six photographs come
 * back as a name, a brand, a unit, a rung, a shelf life and four filing words —
 * twenty fields over eight screens, which nobody audits. As one screen of short
 * sentences, checking becomes reading.
 *
 * ⚠️ A STEP THAT DOES NOT APPLY IS SKIPPED, NEVER DISABLED. `when: false` takes
 * the ask out of the flow entirely — out of the count, out of the progress, out
 * of the review. A greyed-out step is a question somebody has to work out they
 * are not being asked, and a flow that eliminates four of its ten steps because
 * of one answer is the difference between a wizard and an interrogation.
 *
 * ⚠️ AND THE FLOW OWNS THE PHONE'S BACK GESTURE, ONCE, HERE. Every wizard that
 * hand-rolls its steps writes this and most of them write it wrong: forward
 * pushes an entry, `popstate` steps back, the FIRST step pushes nothing so the
 * last Back leaves the screen. Written per app it is four subtle rules times
 * however many flows exist; written here it is the flow.
 *
 * ⚠️ THE ENTRIES CARRY A MARKER RATHER THAN A URL, because the steps are ONE
 * screen. A URL per step would make each one shareable, bookmarkable and
 * reloadable into a form with nothing in it.
 */

import * as React from "react";
import { Link } from "@heroui/react";
import { Screen, type Act } from "./screen.js";
import { travel } from "./travel.js";
import { DURATION, EASE } from "../tokens/motion.js";
import { TYPE } from "../tokens/type.js";
import { glyphOf } from "./shell.js";
import { Section } from "../parts/heads.js";
import { ActionRow, NoteRow } from "../parts/surfaces.js";
import { Stack } from "../parts/arrange.js";

/* ------------------------------------------------------------------- ask --- */

/** ONE QUESTION, ITS CONTROLS, AND THE CLAUSE IT ADDS TO THE STORY. */
export interface Ask {
  readonly id: string;
  /**
   * THE QUESTION, IN THE SECOND PERSON — "How do you count it?".
   *
   * ⚠️ A QUESTION RATHER THAN A NOUN, AND THE DIFFERENCE IS WHO HAS TO KNOW
   * SOMETHING. "Counting" is a heading over a group of fields: it names the
   * area of the database being written and leaves the person to work out what
   * is being asked of them. A question has an answer, and somebody who can
   * answer it needs no training to.
   */
  readonly ask: string;
  /** ⚠️ One fact, where one is needed. Not a description of the screen. */
  readonly under?: string;
  /**
   * WHAT THIS STEP ADDS TO THE STORY — a clause in the person's own words,
   * recomputed live as they answer.
   *
   * ⚠️ NULL WHILE UNANSWERED, AND NOT AN EMPTY STRING. An unanswered step takes
   * no line in the recap; a blank line in a recap reads as a step that went
   * wrong.
   */
  readonly says?: string | null;
  /**
   * WHY THIS STEP CANNOT GO ON YET, IN A SENTENCE THAT SAYS WHAT TO DO.
   *
   * ⚠️ HELD AGAINST THE STEP THAT OWNS THE FIELD, which is what makes the steps
   * worth having. One sentence at the foot of a whole form tells somebody on the
   * last screen that something three screens back is missing and leaves them to
   * find it — see how the last step reports an earlier step's debt below.
   */
  readonly short?: string;
  /**
   * THE SAME ANSWER AS A CLAUSE INSIDE ONE SENTENCE — `{ lead: "counted in",
   * said: "boxes" }` reads as *…counted in **boxes**…*.
   *
   * ⚠️ A LIST OF SENTENCES IS A FORM WITH THE FIELDS REMOVED; A PARAGRAPH IS
   * SOMETHING SOMEBODY READS. Eight rows each stating one fact is a review that
   * gets scrolled past — every line the same shape, no line more important than
   * the next. The same eight facts as one sentence about the thing being made is
   * read in one pass, and a wrong word STANDS OUT, which is the whole job of the
   * screen before the button that commits it.
   *
   * ⚠️ THE CONNECTIVES ARE THE APP'S BECAUSE THEY ARE PRODUCT WORDING. "It is
   * measured in" belongs to a thing on a shelf; the frame has no nouns and could
   * only supply commas. What the frame owns is the shape — a paragraph, the
   * blanks pressable, an unanswered one visibly a gap.
   *
   * ⚠️ AND A STEP WITHOUT ONE STILL GETS A ROW. Prose is right for the facts that
   * make a sentence and wrong for a list of barcodes, so the review is the
   * paragraph followed by rows for everything that is not in it.
   */
  readonly part?: { readonly lead: string; readonly said: string | null };
  /** ⚠️ Skipped where false. A step that does not apply is not a step. */
  readonly when?: boolean;
  /**
   * ITS ANSWER ARRIVED RATHER THAN BEING ASKED — see `StorySpec.fills`.
   *
   * ⚠️ NOT THE SAME AS `when: false`, AND THE DIFFERENCE IS THE WHOLE REASON A
   * FLOW CAN CONFIRM RATHER THAN ASK. A step that does not APPLY leaves the flow
   * entirely — out of the walk, out of the count, out of the review. A settled
   * one is out of the QUESTIONS and INTO the review, where its clause is what
   * somebody checks and a press on it opens the step to change.
   *
   * ⚠️ COLLAPSED ONTO `when`, THE REVIEW SHOWS NOTHING A MODEL ANSWERED — which
   * is every clause on the one screen the whole arrangement exists for.
   */
  readonly settled?: boolean;
  readonly children: React.ReactNode;
}

export interface StoryProps {
  /** ⚠️ Declared in order. Skipping is `when`, never a reordering. */
  readonly asks: readonly Ask[];
  readonly at: string;
  readonly onGo: (id: string) => void;
  /**
   * OUT OF THE FLOW ENTIRELY — where Back goes from the first step.
   *
   * ⚠️ ABSENT LEAVES THE CHROME'S OWN ARROW TO WHATEVER ROUTED THE SCREEN,
   * which is right for a flow that IS the page.
   */
  readonly leave?: () => void;
  readonly title?: string;
  /**
   * WHAT THE LAST STEP DOES — the one write the whole flow exists to reach.
   *
   * ⚠️ AND EVERY STEP NAMES ITS OPERATION, INCLUDING THE ONES THAT ONLY GO
   * FORWARD. `Next` calls nothing, so it is tempting to leave `op` off it — and
   * that is one offer-and-refuse failure spread over every screen in the flow.
   * Somebody without the permission would photograph a box, name it, scan three
   * barcodes and be refused by the last button. Naming the operation the flow
   * exists to reach means the gate answers on step one, where it costs nobody
   * anything.
   */
  readonly does: Act;
  /** ⚠️ The word on the way forward, where "Next" is wrong for this flow. */
  readonly next?: string;
  /**
   * THE LAST STEP, WHICH IS THE WHOLE STORY WITH EVERY LINE PRESSABLE.
   *
   * ⚠️ APPENDED HERE RATHER THAN DECLARED BY EACH FLOW, because a review is not
   * a question — it is the same list of clauses the flow already has, and a flow
   * that wrote its own would be re-deriving `says` in its own words. It is also
   * the step people forget, and the one that catches a half-filled record.
   *
   * ⚠️ `false` IS FOR A FLOW TOO SHORT TO NEED ONE. Two questions and a review is
   * three screens to say one thing, and the review restates what is still on the
   * screen behind it.
   */
  readonly review?: boolean | {
    readonly ask?: string;
    readonly under?: string;
    /**
     * ⚠️ WHAT THE THING LOOKS LIKE, ABOVE WHAT IT IS. A picture is the fastest
     * check available: somebody who has answered ten questions about a box
     * recognises the wrong box in one glance and reads no words at all.
     */
    readonly lead?: React.ReactNode;
  };
  /**
   * ONE LINE OVER THE QUESTION, SAID ONCE — not per field. See DESIGN.md §1.
   *
   * ⚠️ THE WHOLE ROW, MARK INCLUDED, RATHER THAN JUST THE WORDS. A flow with a
   * note has a reason for it, and the reason decides the mark: "a model filled
   * this in" wears the model's, "this is a draft somebody else started" does
   * not. Chosen here it would be one mark for every reason, which is how a
   * reserved mark comes to mean nothing (`glyphs`).
   */
  readonly note?: React.ReactNode;
}

/* ----------------------------------------------------------------- along --- */

/**
 * HOW FAR IN, AS A LENGTH RATHER THAN A NUMBER.
 *
 * ⚠️ THIS REPLACED NUMBERED DOTS AND THE COUNT IS WHY. Nine circles joined by
 * rules is a row of things to read across the top of every screen in the flow,
 * and the fact they carry is the least useful one available: somebody answering
 * question four does not need to be told it is question four. What they want to
 * know is whether this is nearly over.
 *
 * ⚠️ AND A LENGTH SURVIVES A FLOW THAT SKIPS. Dots have to disappear when three
 * steps are eliminated, which is a row of chrome rearranging itself under the
 * heading; a line just moves further along.
 *
 * ⚠️ IT IS NOT A `ProgressBar`. That is the mark for work being done TO
 * somebody — an upload, a sync, a job — and it comes with a label, a percentage
 * and a role that announces itself as busy. This is where they are in something
 * they are doing, so it is `presentation` and it says nothing aloud: the heading
 * under it is what a screen reader should be reading.
 */
function Along({ at, of }: { readonly at: number; readonly of: number }) {
  if (of < 2) return null;
  const through = Math.max(0, Math.min(1, at / of));
  return (
    <div aria-hidden className="h-0.5 w-full overflow-hidden rounded-full bg-[var(--line)]">
      <div
        className="h-full rounded-full bg-[var(--brand)]"
        style={{
          width: `${(through * 100).toFixed(2)}%`,
          /* ⚠️ IT MOVES BECAUSE THE DISTANCE IS THE MESSAGE — a bar that jumps
             has told somebody nothing about how far the jump was, and a flow
             that just eliminated three steps jumps a long way on purpose.
             `travel` is the curve for something covering ground; `moderate` is
             the pace, because this happens on every press and `stately` is for
             the moment somebody sees once. */
          transition: `width ${DURATION.moderate} ${EASE.travel}`,
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- review --- */

/**
 * ⚠️ THE ID IS RESERVED, so a flow declaring a step of its own by this name gets
 * one review rather than two that disagree.
 */
export const REVIEW = "review";

/**
 * THE LAST STEP IS THE WHOLE STORY, AND IT REPLACED A DISCLOSURE.
 *
 * ⚠️ THE RECAP USED TO RIDE ALONG ON EVERY SCREEN, closed, above the question —
 * and closed it showed one clause and a count, which is not a summary, it is a
 * fragment with a number after it. Open it was eight lines of context between
 * somebody and the one thing the screen was asking. Neither state was worth the
 * room, and both were on nine screens.
 *
 * ⚠️ SO IT IS A STEP. Every intermediate screen is now the question and nothing
 * else, and the summary happens once, at the end, where a summary is actually
 * read — immediately above the button that commits it.
 *
 * ⚠️ AND IT SHOWS WHAT IS *NOT* SET AS WELL. A review listing only the answered
 * steps is a review that cannot show an omission, which is the commonest thing
 * wrong with a half-filled record. An unanswered step reads as its own question
 * with "Nothing set" under it, and is pressable like every other line.
 */
function Review({ shown, onGo, lead }: {
  /* ⚠️ EVERYTHING THAT APPLIES, SETTLED OR NOT — not the walk. A step whose
     answer arrived is out of the questions and into HERE; reading the walk
     instead shows a review with every model-filled clause missing. */
  readonly shown: readonly Ask[];
  readonly onGo: (id: string) => void;
  readonly lead?: React.ReactNode;
}) {
  const steps = shown.filter((one) => one.id !== REVIEW);
  const prose = steps.filter((one) => one.part);
  const rows = steps.filter((one) => !one.part);
  return (
    <Stack space="tight">
      {lead}

      {/*
        ⚠️ ONE PARAGRAPH, AND EVERY ANSWER IN IT IS A BUTTON. Pressing the wrong
        word goes to the step that wrote it, which is what makes reading the
        sentence the same act as correcting it — a review somebody has to
        translate back into "which screen was that" is a review they skip.
      */}
      {prose.length
        ? (
          <p className={`${TYPE.title} text-pretty`}>
            {prose.map((one, at) => (
              <React.Fragment key={one.id}>
                {at ? ", " : null}
                {one.part?.lead}{" "}
                {/* ⚠️ A LINK RATHER THAN A BUTTON, and the difference is not the
                    guard — it is the reading. A word inside a sentence that
                    takes you somewhere IS a link; a button in a paragraph is a
                    control somebody has to step around to finish the line. */}
                <Link
                  onPress={() => { onGo(one.id); }}
                  /* ⚠️ THE BLANK IS UNDERLINED WHETHER OR NOT IT IS FILLED — the
                     same rule `Fills` draws, because it is the same blank read
                     back. */
                  className={"underline decoration-[var(--brand)] decoration-2 underline-offset-4 "
                    + "data-[blank=waiting]:text-muted data-[blank=waiting]:decoration-[var(--line)]"}
                  data-blank={one.part?.said ? "said" : "waiting"}
                >
                  {one.part?.said ?? "……"}
                </Link>
              </React.Fragment>
            ))}
            .
          </p>
        )
        : null}

      {rows
        .map((one) => (
          /* ⚠️ THE ANSWER IS THE LABEL AND THE QUESTION IS UNDER IT, which is
             the way round somebody scans a review: they are hunting for the
             ANSWER that is wrong, and the question is how they confirm they
             found it. Reversed where there is no answer — then the question is
             the only thing to recognise the row by. */
          <ActionRow
            key={one.id}
            label={one.says ?? one.ask}
            under={one.says ? one.ask : "Nothing set"}
            tone={one.short ? "warning" : "neutral"}
            onDo={() => { onGo(one.id); }}
          />
        ))}
    </Stack>
  );
}

/* ------------------------------------------------------------------ walk --- */

/** Where a flow is, worked out from what it declares and where somebody stands. */
export interface Walk {
  /** ⚠️ The flow, skipped steps removed. Every index below is against THIS. */
  readonly live: readonly Ask[];
  /**
   * ⚠️ EVERY STEP THAT APPLIES, SETTLED ONES INCLUDED — what the review shows
   * and what a debt is searched in. `live` is what somebody WALKS; this is what
   * the flow is ABOUT, and a settled step belongs to the second and not the
   * first.
   */
  readonly applies: readonly Ask[];
  readonly at: number;
  readonly here: Ask | undefined;
  readonly last: boolean;
  /** Why it cannot go on — this step's, or on the last step anybody's. */
  readonly short: string | undefined;
  /** ⚠️ Set only where the debt belongs to a step this is not — see below. */
  readonly owed: Ask | null;
  /** Every answered step before this one, in order. */
  readonly told: readonly { readonly id: string; readonly ask: string; readonly says: string }[];
}

/**
 * THE WHOLE OF A FLOW'S ARITHMETIC, AS A FUNCTION.
 *
 * ⚠️ PURE BECAUSE THE FAILURES HERE ARE ARITHMETIC ONES AND ARITHMETIC IS
 * TESTABLE. "The last step reports an earlier step's debt", "a skipped step is
 * out of the count", "the current step's clause is not in the recap" — each is
 * an off-by-one nobody can see by looking at a screen, and each is one
 * assertion here.
 */
export function walk(asks: readonly Ask[], on: string): Walk {
  /* ⚠️ THE LIVE LIST IS THE FLOW, so a skipped step cannot be reached by
     arithmetic — not by Next, not by Back, not by the dots. */
  const applies = asks.filter((one) => one.when !== false);
  /* ⚠️ AND THE WALK IS WHAT IS LEFT TO ASK. A settled step is not a screen
     anybody is taken to, so it is out of the count and out of Next — but it is
     still part of the record, which is why the two lists are not one. */
  const live = applies.filter((one) => !one.settled);
  const found = live.findIndex((one) => one.id === on);
  /* ⚠️ A STEP THAT SKIPPED ITSELF WHILE SOMEBODY STOOD ON IT LANDS THEM AT THE
     START RATHER THAN NOWHERE. It should not happen — `when` is decided by an
     EARLIER answer, so the person is never on the step it removes — but a flow
     that renders nothing is a white screen with no way out of it. */
  const at = found < 0 ? 0 : found;
  const here = live[at];
  const last = live.length > 0 && at === live.length - 1;

  /* ⚠️ THE LAST STEP ANSWERS FOR THE WHOLE FLOW, because it holds the button
     that writes. A step somebody pressed past is still a missing name — and the
     sentence cannot appear where the fix is, so it TAKES them there instead. */
  /* ⚠️ SEARCHED ACROSS EVERYTHING THAT APPLIES, because a required field a fill
     left empty is a debt on a step nobody was asked — and read off the walk it
     would be a write refused with no sentence anywhere saying why. */
  const owing = applies.find((one) => one.short);
  /* ⚠️ THIS STEP'S OWN COMES FIRST, AND THE WAY-THERE MUST FOLLOW THE SAME
     BRANCH. Taken from `owing` regardless, the last step's own refusal would be
     drawn as a row that navigates to a DIFFERENT step — the sentence describing
     the field in front of somebody, with a press that takes them away from it. */
  const mine = here?.short;
  const short = mine ?? (last ? owing?.short : undefined);

  /* ⚠️ EVERY ANSWERED STEP BEFORE THIS ONE, for a caller that wants the story so
     far. The current step is absent because it is the question being asked: a
     screen that stated its own answer above the control setting it would be
     reading back to somebody who is looking at it. */
  const told = live
    .slice(0, at)
    .flatMap((one) => (one.says ? [{ id: one.id, ask: one.ask, says: one.says }] : []));

  return {
    live,
    applies,
    at,
    here,
    last,
    short,
    owed: !mine && short && owing && owing.id !== here?.id ? owing : null,
    told,
  };
}

/* ----------------------------------------------------------------- story --- */

export function Story({
  asks, at, onGo, leave, title, does, next = "Next", review = true, note,
}: StoryProps) {
  /* ⚠️ APPENDED BEFORE THE WALK, so the review is a step like any other — in the
     count, in the progress, in the history, and holding the flow's whole debt
     because it is the last one. Bolted on afterwards it would be a screen
     outside every rule the frame enforces. */
  const said = typeof review === "object" ? review : {};
  const whole: readonly Ask[] = review === false ? asks : [
    ...asks.filter((one) => one.id !== REVIEW),
    {
      id: REVIEW,
      ask: said.ask ?? "Does this look right?",
      under: said.under ?? "Press any line to change it",
      children: null,
    },
  ];
  const { live, applies, at: i, here, last, short, owed: owedElsewhere } = walk(whole, at);

  /* ⚠️ A STEP IS A MOVE, SO IT TRAVELS. The same engine that carries one screen
     to the next carries one question to the next, which is what stops a flow
     feeling like a form redrawing itself in place. */
  const go = (to: number) => {
    const step = live[Math.min(live.length - 1, Math.max(0, to))];
    if (!step || step.id === at) return;
    travel(to > i ? "forward" : "back", () => { onGo(step.id); });
  };

  /* ⚠️ THE RECAP AND THE REFUSAL JUMP THROUGH `go` TOO, AND THE FIRST DRAFT DID
     NOT. Calling `onGo` straight swapped the step with no transition at all — so
     pressing a line of the story looked like the screen glitching, while Next
     and Back beside it travelled. A named step is an index here like any other,
     and travelling is what says which way the flow just moved. */
  /* ⚠️ FOUND IN WHAT APPLIES, NOT IN THE WALK. A settled step is in the review
     and not in `live`, so an index taken there is -1 — which `go` clamps to the
     first step, and the press that was meant to open the name sends somebody
     back to the beginning. */
  const jump = (id: string) => {
    const to = live.findIndex((one) => one.id === id);
    if (to >= 0) { go(to); return; }
    if (!applies.some((one) => one.id === id)) return;
    /* ⚠️ BACKWARD, BECAUSE THE REVIEW IS LAST and every settled step is before
       it. The caller un-settles what was opened, so the step is in the walk by
       the time it draws. */
    travel("back", () => { onGo(id); });
  };

  /*
    ⚠️ FORWARD PUSHES AN ENTRY; GOING BACK IS WHAT CONSUMES ONE. Pushing on a
    backward move would make the next Back land on the step just left, which is
    the gesture doing nothing — read as the app being stuck.

    ⚠️ AND THE FIRST STEP PUSHES NOTHING, so the Nth Back leaves the flow, which
    is what the gesture means to somebody who has taken N steps.
  */
  /* ⚠️ THE FLOW IS READ THROUGH A REF EVERYWHERE BELOW, and assigning it in the
     render body is the point rather than a shortcut: both effects have to see
     the CURRENT list, and `live` is a fresh array every render — named as a
     dependency it would re-run the push effect on every keystroke and re-attach
     a global listener with it. */
  const flow = React.useRef({ live, at });
  flow.current = { live, at };

  const was = React.useRef(at);
  React.useEffect(() => {
    if (was.current === at) return;
    const from = flow.current.live.findIndex((one) => one.id === was.current);
    was.current = at;
    /* ⚠️ `from` IS −1 FOR A STEP THAT HAS SINCE BEEN SKIPPED, and `i > -1` is
       true — which is right: coming from a step that no longer exists is a move
       forward into the flow, and it needs an entry like any other. */
    if (i > from) globalThis.history.pushState({ step: at }, "");
  }, [at, i]);

  /* ⚠️ AND THE LISTENER IS REGISTERED ONCE. Re-registering it on every answer is
     a new closure per keystroke over a global event, and the step it steps back
     to is whichever render happened to win. */
  React.useEffect(() => {
    const back = () => {
      const { live: now, at: on } = flow.current;
      const stood = now.findIndex((one) => one.id === on);
      /* ⚠️ AT THE FIRST STEP THERE IS NOTHING OF OURS LEFT ON THE STACK, so the
         entry belongs to whatever came before the flow and the browser's own
         behaviour is correct. */
      if (stood > 0) onGo((now[stood - 1] as Ask).id);
    };
    globalThis.addEventListener("popstate", back);
    return () => { globalThis.removeEventListener("popstate", back); };
  }, [onGo]);

  if (!here) return null;

  return (
    <Screen
      shape="form"
      title={title}
      under={here.under}
      /* ⚠️ THE ARROW AND THE DOCK'S BACK ARE THE SAME MOVE. An arrow that left
         the whole flow from step five would throw away five screens of answers
         on the press that means "undo the last one". */
      back={i === 0 ? leave : () => { go(i - 1); }}
      does={last
        ? { ...does, disabled: does.disabled === true || Boolean(short) }
        : {
          op: does.op,
          label: next,
          onDo: () => { go(i + 1); },
          disabled: does.disabled === true || Boolean(short),
        }}
      /* ⚠️ NO BACK ON THE FIRST STEP — see `ScreenProps.step`. Nothing is behind
         it, and a control that is present and refuses reads as broken. */
      step={{ back: i === 0 ? undefined : () => { go(i - 1); } }}
    >
      <Stack>
        {/*
          ⚠️ A LINE, NOT NUMBERED DOTS, AND THE COUNT IS THE PROBLEM WITH DOTS.
          Nine circles with rules between them is a row of things to READ across
          the top of every screen in the flow — and the number they show is the
          least useful fact available, because a person answering question four
          does not need to know it is question four. What they want is whether
          this is nearly over, which is a length rather than a figure.

          ⚠️ AND IT IS AGAINST THE LIVE LIST, so a flow that just skipped three
          steps jumps forward instead of quietly promising screens that are no
          longer coming.
        */}
        <Along at={i + 1} of={live.length} />
        {note}

        {/*
          ⚠️ NO ECHO UNDER THE CONTROLS, AND `says` IS STILL DECLARED. It was
          drawn here as a ticked line under every step — the answer, restated, an
          inch below the control still showing it. Two things made that worse
          than redundant: on a screen with one field the sentence is longer than
          the answer it repeats, and a tick beside it reads as a verdict on
          something nobody has finished doing.

          ⚠️ THE CLAUSE'S JOB IS THE REVIEW, WHICH IS THE ONE PLACE THE ANSWER IS
          NOT ALREADY ON SCREEN. A step reads back to somebody who has left it;
          under the control it read back to somebody looking at it.
        */}
        <Section label={here.ask}>
          {here.id === REVIEW
            ? <Review shown={applies} onGo={jump} lead={said.lead} />
            : here.children}
        </Section>

        {/* ⚠️ AND WHERE THE DEBT IS SOMEBODY ELSE'S STEP, THE SENTENCE IS THE WAY
            THERE. A refusal naming a field on a screen the person is not looking
            at is a refusal they have to go hunting for. */}
        {short
          ? owedElsewhere
            ? (
              <ActionRow
                icon={glyphOf("alert")}
                tone="warning"
                label={short}
                under={owedElsewhere.ask}
                onDo={() => { jump(owedElsewhere.id); }}
              />
            )
            : <NoteRow icon={glyphOf("alert")}>{short}</NoteRow>
          : null}
      </Stack>
    </Screen>
  );
}
