/**
 * A DECLARED FLOW IN, A SCREEN OUT.
 *
 * ⚠️ WHAT IS ASSERTED HERE IS THAT THE DECLARATION REACHES THE CONTROL, which
 * nothing else can see. The kernel checks that a step's field is one the write
 * takes; the guard checks the shapes; neither watches a `FieldSpec` become an
 * input somebody can type into. A renderer that read the wrong half of the
 * declaration composes, mounts and draws a question with nothing under it — which
 * is the exact screen `step_asks_nothing` exists to refuse and would arrive from
 * the other side.
 *
 * ⚠️ AND THE VALUES ARE DISTINCTIVE ON PURPOSE — see `body.test`. "Name" appears
 * in four places; `Casting resin, clear` appears where it was bound.
 *
 * ⚠️ RENDERED STATICALLY, WHICH BOUNDS WHAT THESE CAN ASK. `Story` pushes history
 * entries from an effect and `Screen` hands its action up to the crown, so what a
 * string render sees is one step's question and controls. That is the half this
 * file is for; the walking is `walk`'s own tests and the pixels are the seen lane.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { field, type Fields, type StorySpec } from "@engine/kernel";
import { Create, type Answers, type Asking } from "../src/rendered/create.js";

const TAKES: Fields = {
  name: field.text({ label: "Name", required: true, holds: "none" }),
  brand: field.text({ label: "Brand", holds: "none" }),
  unit: field.text({ label: "Counted in", required: true, holds: "none" }),
  tracking: field.enum({
    label: "Tracked as", required: true, holds: "none",
    values: ["listed", "counted", "batched"],
    labels: { listed: "Listed", counted: "Counted", batched: "Batched" },
  }),
  par: field.number({ label: "Tell me below", holds: "none" }),
  shots: field.json({ label: "Pictures", holds: "none" }),
};

const SAID = {
  listed: "kept as one running total",
  counted: "counted, so a number is a number",
  batched: "kept apart per delivery, so one can be expired",
} as const;

const STORY: StorySpec = {
  writes: "thing.register",
  fills: { by: "thing.see", with: { images: "shots" } },
  asks: [
    { id: "shot", ask: "Can you photograph it?", block: "Shots" },
    {
      id: "named", ask: "What is it?", under: "Called",
      takes: ["name", "brand"], says: { as: "called {name}" },
    },
    /* ⚠️ IT DECLARES BOTH, WHICH IS THE POINT — the sub-line under the question
       and the sentence in the recap read the same and are two different jobs. */
    {
      id: "counted", ask: "What do you count it in?", under: "Counted in",
      takes: ["unit"], says: { as: "counted in {unit}" },
    },
    {
      id: "tracked", ask: "How closely do you follow it?", takes: ["tracking"],
      always: true, says: { lead: "tracked so that it is", per: SAID },
    },
    {
      id: "par", ask: "Tell you when it drops below?", takes: ["par"],
      when: { field: "tracking", is: { literal: "batched" } },
    },
  ],
};

/** ⚠️ A block that ANSWERS — the whole reason a step may not be fields. */
const Shots = ({ asking }: { readonly asking: Asking }) => (
  <button type="button" onClick={() => { asking.onAnswer({ shots: ["a.jpg"] }); }}>
    Take a picture
  </button>
);

const drawn = (at: string, held: Answers = {}, over: Partial<Parameters<typeof Create>[0]> = {}) =>
  renderToStaticMarkup(
    <Create
      story={STORY}
      takes={TAKES}
      at={at}
      onGo={() => undefined}
      title="Add a product"
      does={{ label: "Add it", op: "thing.register", onDo: () => undefined }}
      held={held}
      onSet={() => undefined}
      blocks={{ Shots }}
      {...over}
    />,
  );

describe("the controls come from the write", () => {
  it("draws a step's fields with the operation's own labels", () => {
    const out = drawn("named");
    expect(out).toContain("Name");
    expect(out).toContain("Brand");
  });

  it("puts what has been answered into the control", () => {
    expect(drawn("named", { name: "Casting resin, clear" }))
      .toContain("Casting resin, clear");
  });

  /* ⚠️ A CLOSED SET IS A CHOICE, NOT A TEXT BOX — `Field` decides that off the
     kind, and this asserts the kind reached it. */
  it("draws a closed set as its words rather than its ids", () => {
    const out = drawn("tracked", { tracking: "batched" });
    expect(out).toContain("Batched");
  });

  /* ⚠️ THE REFUSAL BELONGS UNDER THE CONTROL IT IS ABOUT — see `Field.error`. A
     door's `Problem.fields` naming three inputs is three sentences in three
     places, not one toast over a form. */
  it("puts the door's refusal under the field it names", () => {
    expect(drawn("named", { name: "" }, { refused: { name: "Give it a name" } }))
      .toContain("Give it a name");
  });

  /* ⚠️ THE ROWS A `ref` MAY BE ARE HANDED IN — this package fetches nothing. */
  it("draws a question with nothing under it for a field the write does not take", () => {
    const out = renderToStaticMarkup(
      <Create
        story={{ writes: "x", asks: [{ id: "a", ask: "What?", takes: ["nowhere"] }] }}
        takes={TAKES}
        at="a"
        onGo={() => undefined}
        title="X"
        does={{ label: "Do", onDo: () => undefined }}
        held={{}}
        onSet={() => undefined}
      />,
    );
    /* ⚠️ NOTHING RATHER THAN A THROW. `step_takes_unknown` refuses it at
       composition, so arriving here means a manifest that never composed — and a
       white screen is worse than a missing control. */
    expect(out).toContain("What?");
  });
});

describe("a block step", () => {
  it("draws the block the caller resolved", () => {
    expect(drawn("shot")).toContain("Take a picture");
  });
});

describe("the flow asks what applies and skips what arrived", () => {
  /*
    ⚠️ THE PROGRESS IS AGAINST THE LIVE LIST, so a flow that just skipped steps
    jumps forward instead of promising screens no longer coming. Reading the width
    is how a static render can see which steps `Story` counted.
  */
  const along = (html: string) => /width:\s*([\d.]+)%/.exec(html)?.[1];

  /* ⚠️ 5 steps + the review = 6, and the first is 1/6 = 16.67%. */
  it("counts every step that applies", () => {
    expect(along(drawn("shot", { tracking: "batched" }))).toBe("16.67");
  });

  /* ⚠️ ONE FEWER — the par step does not apply when nothing is batched, and it is
     out of the count rather than greyed. */
  it("drops a step that does not apply", () => {
    expect(along(drawn("shot", { tracking: "counted" }))).toBe("20.00");
  });

  /* ⚠️ AND A STEP WHOSE ANSWER ARRIVED IS OUT OF THE QUESTIONS TOO — this is the
     fill, and it is the whole reason the flow confirms rather than asks. */
  it("drops a step whose fields all arrived filled", () => {
    expect(along(drawn("shot", { tracking: "counted", unit: "tin" }, {
      filled: new Set(["unit"]),
    }))).toBe("25.00");
  });

  /* ⚠️ EXCEPT THE ONE SOMEBODY MUST DECIDE RATHER THAN CONFIRM. */
  it("still asks an insistent step that arrived filled", () => {
    expect(along(drawn("shot", { tracking: "counted" }, {
      filled: new Set(["tracking"]),
    }))).toBe("20.00");
  });
});

describe("the review is built out of what the steps say", () => {
  const REVIEWED = { name: "Casting resin, clear", unit: "tin", tracking: "batched" };

  it("reads a closed set back in the product's own sentence", () => {
    expect(drawn("review", REVIEWED)).toContain(SAID.batched);
  });

  it("fills the blanks in a sentence with the answers", () => {
    expect(drawn("review", REVIEWED)).toContain("counted in tin");
  });

  /*
    ⚠️ THE CONNECTIVE COMES FROM THE SENTENCE, NEVER FROM THE STEP'S `under`.
    Borrowed, a step declaring `under: "Counted in"` beside `says: { as: "{unit}" }`
    recapped as "…, Counted in tin" — a heading's capital in the middle of a
    paragraph, and words the app could not choose because the same string was
    also the line under the question. `as` carries its own.
  */
  it("never borrows the step's own sub-line as a clause lead", () => {
    const out = drawn("review", REVIEWED);
    expect(out).toContain("counted in tin");
    /* ⚠️ READ OFF A CLAUSE THAT IS NOT THE FIRST, because the first one's capital
       is the SENTENCE'S and is correct. `under` is "Counted in" and the sentence
       is "counted in {unit}", so borrowed the recap reads "Counted in counted in
       tin" — which a `toContain` on the sentence still passes. The absent capital
       mid-paragraph is the whole assertion. */
    expect(out).not.toContain("Counted in");
  });

  /* ⚠️ EXCEPT ON `per`, WHERE FIVE SENTENCES WOULD OTHERWISE EACH REPEAT IT. */
  it("puts a per-value clause behind its own lead", () => {
    expect(drawn("review", REVIEWED)).toContain("tracked so that it is");
  });

  /*
    ⚠️ AND THE SENTENCE IS A SENTENCE, NOT A HEADLINE. `title` is the page's own
    rank — thirty words at it, bold and balanced, is a paragraph competing with
    the screen's actual title one element above it.
  */
  it("sets the recap to be read rather than scanned", () => {
    expect(drawn("review", REVIEWED)).not.toContain("rank-page");
  });

  /*
    ⚠️ THE SENTENCE STARTS WITH A CAPITAL AND NOTHING ELSE DOES, and this was
    `::first-letter` until a photograph showed it doing nothing. The rule was
    correct, present in the built stylesheet, and inert: the first character sits
    inside a `Link`, which is not `display: inline`, and the pseudo-element skips
    a non-inline first child. A declaration that applies to nothing is the exact
    failure this repository is a catalogue of, and only the screen caught it.
  */
  it("capitalises the sentence and leaves every clause after it alone", () => {
    const out = drawn("review", REVIEWED);
    expect(out).toContain("Called Casting resin, clear");
    expect(out).toContain("counted in tin");
    expect(out).not.toContain("Counted in tin");
  });

  /*
    ⚠️ AN UNANSWERED BLANK STAYS A BLANK IN ITS OWN SENTENCE, and this test used
    to assert the opposite. Withholding the whole clause was right while the
    connective lived OUTSIDE it — `lead: "Low below"` survived and the recap read
    "Low below ……". With the connective inside the sentence, which is what stops
    it being a second place the same words live, withholding takes the words with
    it and leaves a bare "……" floating between two commas: an omission nobody can
    name. The omission is still visible AS one; it now says what is missing.
  */
  it("keeps the sentence of a clause whose blank has no answer", () => {
    const out = drawn("review", { name: "Casting resin, clear" });
    expect(out).toContain("counted in");
    expect(out).toContain("……");
  });

  /* ⚠️ AND IT IS STYLED AS UNFINISHED, because a sentence somebody has not
     completed must not read like a fact they supplied. */
  it("marks an unfilled blank as waiting rather than as an answer", () => {
    /* ⚠️ AND A FULLY ANSWERED ONE IS NOT, which is the half that makes this an
       assertion rather than a spelling check: the attribute is on every clause,
       so only the pair says the flag reached the right one. */
    expect(drawn("review", { name: "Casting resin, clear" }))
      .toContain('data-blank="waiting"');
    expect(drawn("review", REVIEWED)).not.toContain('data-blank="waiting"');
  });

  /* ⚠️ AND A STEP THAT SAYS NOTHING IS STILL IN THE REVIEW — as a row, with its
     question, so a half-filled record cannot hide. */
  it("keeps a step with no sentence as its own row", () => {
    expect(drawn("review", REVIEWED)).toContain("Can you photograph it?");
  });

  /*
    ⚠️ A BLOCK COUNTS, AND THE DEFAULT IT REPLACES WAS A LIE. A row with no clause
    reads "Nothing set" under its question, so six photographs and none looked
    identical on the one screen whose whole job is to show an omission. The count
    is the block's own — a `says` of `"{shots}"` would print a data URI.
  */
  /*
    ⚠️ READ AS A PAIR, BECAUSE THE ROW TURNS OVER — see `Review`. The ANSWER is
    the label and the question is under it, which is the way round somebody scans
    a review; with no answer there is nothing to recognise the row by but the
    question, so the two swap. Asserting one half alone would pass on the swap.
  */
  const rows = (html: string) =>
    [...html.matchAll(/>([^<>]+)<\/span><span [^>]*text-muted[^>]*>([^<>]+)<\/span>/g)]
      .map(([, label, under]) => [label, under] as const);
  const about = (html: string, ask: string) =>
    rows(html).find(([label, under]) => label === ask || under === ask);

  const ASK = "Can you photograph it?";

  it("says how many answers a block is holding", () => {
    const out = drawn("review", { ...REVIEWED, shots: ["a.jpg", "b.jpg"] });
    expect(about(out, ASK)).toEqual(["2 taken", ASK]);
  });

  it("still says nothing is set for a block nobody answered", () => {
    expect(about(drawn("review", REVIEWED), ASK)).toEqual([ASK, "Nothing set"]);
  });

  /*
    ⚠️ A STEP WHOSE ANSWER ARRIVED IS OUT OF THE QUESTIONS AND INTO HERE, and
    that is the whole reason a flow can confirm rather than ask. Collapsed onto
    "does not apply" — one boolean for two facts — the review showed nothing a
    model had answered: every clause missing, on the single screen the entire
    arrangement exists for, while the progress and the walk both looked right.
  */
  it("shows the clause of a step whose answer arrived", () => {
    const out = drawn("review", REVIEWED, {
      filled: new Set(["name", "brand", "unit"]),
    });
    expect(out).toContain("Casting resin, clear");
    expect(out).toContain("counted in tin");
  });
});

describe("what the flow will not let past", () => {
  /* ⚠️ HELD AGAINST THE STEP THAT OWNS THE FIELD, which is what makes the steps
     worth having — one sentence at the foot of a form sends somebody on the last
     screen hunting three screens back. */
  it("says which field is missing, on the step that asks for it", () => {
    expect(drawn("named", {})).toContain("Name is needed before this can be saved");
  });

  /* ⚠️ AND THE DOOR'S OWN WORDS BEAT OURS, because a refusal is about the value
     that was actually sent. */
  it("prefers the door's refusal to the missing-field sentence", () => {
    const out = drawn("named", {}, { refused: { name: "That name is taken" } });
    expect(out).toContain("That name is taken");
    expect(out).not.toContain("Name is needed before this can be saved");
  });
});
