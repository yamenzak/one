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
  fills: "thing.see",
  asks: [
    { id: "shot", ask: "Can you photograph it?", block: "Shots" },
    {
      id: "named", ask: "What is it?", under: "Called",
      takes: ["name", "brand"], says: { as: "{name}" },
    },
    { id: "counted", ask: "What do you count it in?", takes: ["unit"], says: { as: "counted in {unit}" } },
    {
      id: "tracked", ask: "How closely do you follow it?", takes: ["tracking"],
      always: true, says: { per: SAID },
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
    ⚠️ AN UNANSWERED BLANK MAKES THE WHOLE CLAUSE ABSENT, and that is the point
    rather than tidiness. "counted in ……" reads as an answer somebody gave; the
    recap's job is to make an omission visible AS one, which `Story` draws its own
    way when the clause is null.
  */
  it("withholds a clause whose blank has no answer", () => {
    expect(drawn("review", { name: "Casting resin, clear" })).not.toContain("counted in");
  });

  /* ⚠️ AND A STEP THAT SAYS NOTHING IS STILL IN THE REVIEW — as a row, with its
     question, so a half-filled record cannot hide. */
  it("keeps a step with no sentence as its own row", () => {
    expect(drawn("review", REVIEWED)).toContain("Can you photograph it?");
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
