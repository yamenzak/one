/**
 * A DECLARED FLOW, DRAWN — the questions from the manifest, the controls from the
 * operation's own input, and no file in between.
 *
 * ⚠️ THIS IS THE JOIN THAT WAS MISSING, AND ITS ABSENCE IS WHY THE WIZARD WAS
 * ORPHANED. `Story` is the frame and it works; `StorySpec` declares the shape and
 * it composes. What no code did was turn one into the other, so every flow needed
 * a React file to supply the controls — and a file inside one product is what a
 * surface rewrite deletes. What survived was a declaration nothing could draw and
 * a frame nothing imported.
 *
 * ⚠️ THE CONTROLS COME FROM THE WRITE, NOT FROM THE STEP. An operation declares
 * its input as `FieldSpec`s — kind, label, whether it is required, the closed set
 * and the words for it, the bounds, the collection a reference points at — which
 * is everything `Field` needs. A step names which of them it asks for; the engine
 * draws them. So the shape of the question is the product's decision and the
 * shape of the control is not a decision at all.
 *
 * ⚠️ AND IT FETCHES NOTHING, WHICH IS THE PACKAGE'S WHOLE BOUNDARY. The rows a
 * `ref` may be, the per-field refusals, the run itself — all handed in. A design
 * component with a data layer under it is a design package that can only be used
 * one way.
 *
 * ⚠️ THE ANSWERS ARE THE CALLER'S TOO, AND THAT IS NOT TIDINESS. A refusal comes
 * back from the door naming three fields; a flow holding its own answers would
 * have to be told to keep them, and the shape that forgets is the one where
 * somebody loses eight screens of typing to a validation error.
 */

import * as React from "react";
import type { Fields, Match, SaysSpec, StepSpec, StorySpec } from "@engine/kernel";
import { ASKS, askedOf, stepApplies } from "@engine/kernel";
import { Story, type Ask } from "../frame/story.js";
import type { Act } from "../frame/screen.js";
import { Field } from "./field.js";
import { ASKING } from "./asking.js";
import { Stack } from "../parts/arrange.js";

/** What has been answered, by the write's own input names. */
export type Answers = Readonly<Record<string, unknown>>;

/**
 * WHAT A STEP'S BLOCK IS HANDED.
 *
 * ⚠️ IT IS ASKED, NOT FED, WHICH IS WHY THIS IS NOT A BODY BLOCK'S CONTRACT — see
 * `ASKS`. A body block takes bindings and draws what it is given; this one is
 * handed what the flow holds and hands answers BACK, which is how a camera
 * reaches the record.
 */
export interface Asking {
  /** ⚠️ Everything so far, including what arrived rather than being typed. */
  readonly held: Answers;
  /** ⚠️ Several at once, because one press may answer more than one field. */
  readonly onAnswer: (values: Answers) => void;
  /** ⚠️ Per-field refusals from the door, for the fields this block writes. */
  readonly refused: Readonly<Record<string, string>>;
}

export interface CreateProps {
  readonly story: StorySpec;
  /**
   * ⚠️ THE WRITE'S OWN DECLARED INPUT. Not the collection's fields: an operation
   * takes what it needs to DO the thing, which is a different set — five of
   * OneInventory's twenty-one are lists that become rows in other tables, and
   * none of those is a column on a product.
   */
  readonly takes: Fields;
  readonly at: string;
  readonly onGo: (step: string) => void;
  readonly title: string;
  /** ⚠️ What the last press does, and every step names it — see `StoryProps.does`. */
  readonly does: Act;
  readonly leave?: () => void;
  readonly held: Answers;
  readonly onSet: (name: string, value: unknown) => void;
  /**
   * WHICH ANSWERS ARRIVED FROM OUTSIDE THE QUESTIONS — see `StorySpec.fills`.
   *
   * ⚠️ IT IS A SET OF NAMES RATHER THAN A COMPARISON OF VALUES, and the
   * difference is what somebody typed. "This field is not empty" is true the
   * moment they answer it, so a flow deriving filled-ness from the answers would
   * remove each step the instant it was completed and march itself to the end.
   */
  readonly filled?: ReadonlySet<string>;
  /** ⚠️ Per input, from `Problem.fields` — see `Field.error`. */
  readonly refused?: Readonly<Record<string, string>>;
  /** ⚠️ What a `ref` may be, by field name — see `Field.choices`. */
  readonly choices?: Readonly<Record<string, readonly { readonly id: string; readonly label: string }[]>>;
  /**
   * THE COMPONENTS FOR THE BLOCK STEPS, BY BLOCK ID — and it defaults to the
   * registry, so a product mounts none of them by hand.
   *
   * ⚠️ THE REGISTRY'S ENTRIES ARE LAZY, WHICH IS WHY THIS CAN DEFAULT AT ALL.
   * A camera and a viewfinder are the heaviest things in the product; imported
   * eagerly here they would be in the module graph of every screen that can draw
   * a flow, which is the fault `field.tsx` names about a calendar and a colour
   * picker. `ASKING` holds `React.lazy` wrappers, so naming one costs a chunk
   * only where a step draws it.
   *
   * ⚠️ AND OVERRIDING IT IS FOR A TEST, NOT FOR A PRODUCT. A product supplying
   * its own component for a registered id is a block whose declaration and whose
   * drawing have stopped being the same thing.
   */
  readonly blocks?: Readonly<Record<string, React.ComponentType<{ readonly asking: Asking }>>>;
  /**
   * A FILL IS RUNNING — see `StorySpec.fills`.
   *
   * ⚠️ THE GAP BETWEEN THE LAST PHOTOGRAPH AND THE MODEL'S ANSWER IS SECONDS,
   * and a flow that goes quiet through it is a screen somebody presses again.
   * The dock is held, so the second press cannot skip past a step that is about
   * to stop applying.
   */
  readonly filling?: boolean;
  /**
   * THE FILL SPENDS CREDITS — see `meteredIds`.
   *
   * ⚠️ THE STEP THAT FEEDS IT IS THE STEP THAT SAYS SO, AND IT IS WORKED OUT
   * HERE. A fill runs by itself the moment what it is handed is complete, so
   * the press that spends the money is on whichever step answers `fills.with`
   * — never on a button called anything. Told to the flow as a whole this
   * would be a sentence on every screen in it, which is how a warning becomes
   * furniture; told to the wrong step it warns about a press that costs
   * nothing while the one that costs says nothing.
   *
   * ⚠️ AND IT IS A BOOLEAN RATHER THAN A FIGURE. What a run costs is known
   * after the tokens are counted, and a number before the press would be a
   * guess printed as a price.
   */
  readonly spends?: boolean;
  /** ⚠️ What the review leads with — a picture is the fastest check available. */
  readonly lead?: React.ReactNode;
  readonly note?: React.ReactNode;
}

/* ------------------------------------------------------------- the words --- */

/**
 * ⚠️ AN ANSWER AS A PERSON READS IT, WHICH IS NOT `String(value)`. A boolean
 * rendered raw is "true" in the middle of a sentence about a box; a closed set is
 * its wire value, and `batched` is a word the product chose for a database rather
 * than for a review somebody signs off.
 */
const said = (value: unknown, spec: Fields[string] | undefined): string | null => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (spec?.kind === "enum") return spec.labels?.[String(value)] ?? String(value);
  return String(value);
};

/**
 * ⚠️ THE BLANKS FILLED, AND AN UNANSWERED ONE STAYS A BLANK IN THE SENTENCE.
 * This used to answer `null` for the whole clause, which was right while the
 * connective lived OUTSIDE it: `lead: "Low below"` survived and the review read
 * "Low below ……". With the connective inside the sentence — which is what stops
 * it being a second place the same words live — returning null takes the words
 * with it, and the recap shows a bare "……" floating between two commas.
 *
 * ⚠️ SO THE OMISSION IS STILL VISIBLE AS ONE, and now it says what is missing.
 * `waiting` is what carries the styling, because a sentence somebody has not
 * finished must not read like a fact they supplied.
 */
const BLANK = "……";
const fill = (
  as: string, takes: Fields, held: Answers,
): { readonly text: string; readonly waiting: boolean } => {
  let waiting = false;
  const text = as.replace(/\{(\w+)\}/g, (_, name: string) => {
    const word = said(held[name], takes[name]);
    if (word === null) { waiting = true; return BLANK; }
    return word;
  });
  return { text, waiting };
};

/**
 * WHAT A STEP ADDS TO THE STORY.
 *
 * ⚠️ THE PRODUCT'S WORDS, EVERY TIME. `per` is a sentence the app wrote for each
 * value of a closed set; `as` is one sentence with the answers in it. Neither is
 * derived from a label, because a label is what goes over a control and a clause
 * is what somebody reads back — "Tracked as: batched" is the first, and "kept
 * apart per delivery, so one can be expired" is the second.
 */
const clauseOf = (
  says: SaysSpec | undefined, takes: readonly string[], fields: Fields, held: Answers,
): { readonly text: string | null; readonly waiting: boolean } => {
  if (!says) return { text: null, waiting: false };
  if ("per" in says) {
    /* ⚠️ A CLOSED SET HAS NO BLANK TO LEAVE — it is answered or it is not, and
       an unanswered one has no sentence at all because the app wrote one per
       VALUE. Its lead is what keeps it legible in the paragraph. */
    const only = takes[0];
    const value = only === undefined ? undefined : held[only];
    const chosen = value === undefined || value === null || value === ""
      ? null
      : says.per[String(value)] ?? null;
    return { text: chosen, waiting: chosen === null };
  }
  return fill(says.as, fields, held);
};

/**
 * HOW MANY ANSWERS A BLOCK IS HOLDING.
 *
 * ⚠️ A LIST COUNTS ITS ITEMS AND A VALUE COUNTS AS ONE, because a block answers
 * whichever its field is: `shots` is `json` holding six pictures, and a viewfinder
 * would answer one code. Counting entries rather than fields is what makes "6
 * taken" true of one field.
 */
const heldCount = (answers: readonly string[], held: Answers): number => {
  let n = 0;
  for (const name of answers) {
    const value = held[name];
    if (Array.isArray(value)) n += value.length;
    else if (value !== undefined && value !== null && value !== "") n += 1;
  }
  return n;
};

/**
 * ⚠️ WHY THIS STEP CANNOT GO ON, IN A SENTENCE THAT SAYS WHAT TO DO — see
 * `Ask.short`. Held against the step that owns the field, which is what makes the
 * steps worth having at all: one sentence at the foot of a form tells somebody on
 * the last screen that something three screens back is missing.
 *
 * ⚠️ AND THE REFUSAL FROM THE DOOR COMES FIRST. A field the server rejected is a
 * better sentence than "give it a name", because it is about the value that was
 * actually sent.
 */
const shortOf = (
  takes: readonly string[], fields: Fields, held: Answers,
  refused: Readonly<Record<string, string>>,
): string | undefined => {
  for (const name of takes) {
    const why = refused[name];
    if (why) return why;
  }
  for (const name of takes) {
    const spec = fields[name];
    if (!spec?.required) continue;
    const value = held[name];
    if (value === undefined || value === null || value === "") {
      return `${spec.label} is needed before this can be saved`;
    }
  }
  return undefined;
};

/**
 * ⚠️ THE KIND'S OWN EMPTY, BECAUSE `undefined` MEANS "STILL ARRIVING" IN EVERY
 * CONTROL THE FIELD RENDERER DRAWS. A switch handed `undefined` is disabled and
 * shows a skeleton — correct for a settings row waiting on a fetch, and wrong for
 * a question nobody has answered yet, where the control has to be usable.
 */
const emptyFor = (kind: Fields[string]["kind"]): unknown => {
  switch (kind) {
    case "bool": return false;
    case "number": case "money": return "";
    default: return "";
  }
};

/* ------------------------------------------------------------- the flow --- */

export function Create({
  story, takes, at, onGo, title, does, leave, held, onSet,
  filled, refused = {}, choices = {}, blocks = ASKING, filling, spends, lead, note,
}: CreateProps) {
  const arrived = filled ?? new Set<string>();

  /**
   * WHICH SETTLED STEPS SOMEBODY HAS OPENED FROM THE REVIEW.
   *
   * ⚠️ HERE RATHER THAN IN THE CALLER, BECAUSE IT IS ABOUT THE WALK AND NOTHING
   * ELSE. A press on a clause means "I am answering this now"; the fields did
   * still arrive, so subtracting them from `filled` would tell every other step
   * something untrue about what the model answered.
   */
  const [opened, setOpened] = React.useState<ReadonlySet<string>>(new Set());

  /*
    ⚠️ EVERY DECLARED STEP BECOMES AN `Ask`, INCLUDING THE ONES NOT ASKED — and
    `when: false` is how a step leaves the flow rather than being dropped from
    this list. `Story` takes the whole declaration and does the skipping itself,
    which is what keeps the progress, the history and the review agreeing about
    how long the flow is: a list pre-filtered here would leave the frame counting
    a different number of steps from the one the declaration describes.
  */
  const asked = React.useMemo(
    () => new Set(askedOf(story.asks, held, arrived).map((s) => s.id)),
    [story.asks, held, arrived],
  );

  /**
   * WHICH STEP'S ANSWER SETS THE FILL RUNNING — see `spends`.
   *
   * ⚠️ THE SOURCES, NOT THE FILL'S OWN INPUT NAMES. `fills.with` reads
   * `{ images: "shots" }` — what the READER calls it on the left, what the FLOW
   * holds on the right — and the step that answers is the one holding `shots`.
   * Matched on the left it would find nothing and the warning would appear on no
   * step at all, silently, which is the shape of every bug in this file's history.
   *
   * ⚠️ AND A STEP ANSWERS THROUGH ITS BLOCK AS WELL AS ITS FIELDS. A camera is
   * the commonest thing a fill is fed, and it is never in `takes`.
   */
  const feeds = React.useMemo(() => {
    const wants = new Set(Object.values(story.fills?.with ?? {}));
    if (!wants.size) return null;
    return story.asks.find((step) => [
      ...(step.takes ?? []),
      ...(step.block ? ASKS[step.block]?.answers ?? [] : []),
    ].some((name) => wants.has(name)))?.id ?? null;
  }, [story.fills, story.asks]);

  /* ⚠️ AND A STEP GOES TO THE FRAME AS TWO SEPARATE FACTS — see `Ask.settled`.
     Folded into one, "its answer arrived" reads as "it does not apply", and the
     review shows nothing a model filled: every clause missing, on the one screen
     the whole arrangement exists for. */
  const go = (id: string) => {
    setOpened((was) => (was.has(id) ? was : new Set([...was, id])));
    onGo(id);
  };

  const asks: readonly Ask[] = story.asks.map((step: StepSpec) => {
    /* ⚠️ WHAT THE STEP PUTS INTO THE WRITE, HOWEVER IT DOES IT. A block ANSWERS
       — that is what makes it a step rather than decoration — so a refusal about
       the pictures belongs to the step that took them. Read off `takes` alone,
       a block step had no fields, so the door's complaint about its answer
       appeared nowhere at all and the dock simply refused. */
    const entry = step.block ? ASKS[step.block] : undefined;
    const answers = entry?.answers ?? [];
    const names = step.takes ?? [];
    /*
      ⚠️ A BLOCK COUNTS ITS ANSWERS WHERE A FIELD STEP SAYS ITS SENTENCE, and the
      default this replaces was a lie. A step with no clause is a ROW in the
      review, and a row with no clause reads "Nothing set" under its question —
      so six photographs and none looked identical on the one screen whose whole
      job is to show an omission. A `says` cannot cover it: `"{shots}"` prints a
      data URI, because a block's answer is a count rather than a value read back.
    */
    const clause = entry && !step.says
      ? (() => {
        const n = heldCount(answers, held);
        return { text: n === 0 ? null : entry.said.replace("{n}", String(n)), waiting: n === 0 };
      })()
      : clauseOf(step.says, names, takes, held);
    const short = shortOf([...names, ...answers], takes, held, refused);
    const Block = step.block ? blocks[step.block] : undefined;

    return {
      id: step.id,
      ask: step.ask,
      ...(step.under ? { under: step.under } : {}),
      when: stepApplies(step.when, held),
      /* ⚠️ ON THE STEP THAT FEEDS THE FILL, AND ONLY WHILE IT IS STILL THE
         DECISION. Once the answers are in, the money is spent and a sentence
         saying it will be is a warning about the past. */
      ...(spends && feeds === step.id && !filling && !arrived.size ? { spends: true } : {}),
      ...(asked.has(step.id) || opened.has(step.id) ? {} : { settled: true }),
      says: clause.text,
      ...(short ? { short } : {}),
      /*
        ⚠️ A CLAUSE IN THE PARAGRAPH ONLY WHERE THE STEP SAYS ONE, and a row
        otherwise — see `Ask.part`. Prose is right for the facts that make a
        sentence about a thing and wrong for a list of barcodes, so the review is
        a paragraph followed by rows for everything not in it.
      */
      /*
        ⚠️ THE LEAD IS THE `says`'S OWN, NEVER THE STEP'S `under`. They read as
        the same string and they are two different jobs: `under` is the line
        beneath the question, where a capital is correct, and a lead lands
        mid-sentence, where it is not. Borrowed, a step declaring
        `under: "Counted in"` and `says: { as: "{unit}" }` recapped as
        "…, Counted in tin" — the connective twice over if the app had written
        it into the sentence, and a heading's capital in the middle either way.
        `as` carries its own connective; only `per` needs one, because its five
        sentences would otherwise each repeat it.
      */
      ...(step.says
        ? {
          part: {
            ...(step.says && "per" in step.says && step.says.lead
              ? { lead: step.says.lead }
              : {}),
            said: clause.text,
            ...(clause.waiting ? { waiting: true } : {}),
          },
        }
        : {}),
      children: Block
        ? (
          <Block
            asking={{
              held,
              onAnswer: (values: Answers) => {
                for (const [name, value] of Object.entries(values)) onSet(name, value);
              },
              refused,
            }}
          />
        )
        : (
          <Stack space="tight">
            {names.map((name) => {
              const spec = takes[name];
              /* ⚠️ A NAME THE WRITE DOES NOT TAKE DRAWS NOTHING RATHER THAN
                 THROWING. `step_takes_unknown` refuses it at composition, so
                 reaching here means a manifest that never composed — and a flow
                 that renders a white screen is worse than one missing a control. */
              if (!spec) return null;
              return (
                <Field
                  key={name}
                  name={name}
                  spec={spec}
                  /* ⚠️ `undefined` IS PENDING AND EVERY CONTROL DRAWS IT AS SUCH
                     — see `Field`. An unanswered field is not the same as one
                     still arriving, so it starts at the kind's own empty rather
                     than at nothing. */
                  value={held[name] ?? emptyFor(spec.kind)}
                  onChange={(value) => { onSet(name, value); }}
                  {...(refused[name] ? { error: refused[name] } : {})}
                  {...(choices[name] ? { choices: choices[name] } : {})}
                />
              );
            })}
          </Stack>
        ),
    };
  });

  return (
    <Story
      asks={asks}
      at={at}
      onGo={go}
      title={title}
      /* ⚠️ HELD WHILE A FILL RUNS — see `filling`. Next during the run would
         carry somebody past the very steps the answers are about to remove. */
      does={filling ? { ...does, disabled: true } : does}
      {...(leave ? { leave } : {})}
      {...(note ? { note } : {})}
      review={lead ? { lead } : true}
    />
  );
}

/**
 * ⚠️ RE-EXPORTED SO A CALLER NEED NOT REACH INTO THE KERNEL FOR THE ONE RULE THE
 * RENDERER ALSO USES. Which steps apply is asked in three places — here, by the
 * guard, and by whoever decides the flow is finished — and one implementation is
 * what stops them disagreeing.
 */
export { askedOf } from "@engine/kernel";
export type { Match, StepSpec, StorySpec };
