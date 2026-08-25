/**
 * A LIST'S ROW ACTIONS AND ITS SELECTION, ON THE PHONE SHAPE.
 *
 * ⚠️ THE WHOLE ARGUMENT FOR `Listing` IS THAT A LIST AND A TABLE ARE TWO
 * RENDERINGS OF ONE LIST, and the fault that argument exists to prevent is a
 * capability reaching one of them. It is invisible from either side: the phone
 * shape is `md:hidden` and the table is `hidden md:block`, so a screenshot at
 * any width shows one of them looking perfectly correct. Every screen that ever
 * hand-rolled row actions put them in the `aside` and forgot the columns.
 *
 * ⚠️ THIS FILE IS THE PHONE HALF, AND THE TABLE IS A BROWSER'S. The table is
 * behind `React.lazy` — its weight stays out of the entry chunk — so a static
 * render contains the list and the table's SKELETON, and nothing a string can
 * be asked about. `picking.seen.test.tsx` is the other half, at a desk width,
 * where the chunk has arrived.
 *
 * ⚠️ AND THE COUNTS ARE THE POINT RATHER THAN THE PRESENCE. One occurrence would
 * pass on a component that renders the actions for the first row and drops them
 * from the rest, which is exactly what a misplaced `.map` produces.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Listing } from "../src/index.js";

interface Row { readonly id: string; readonly name: string }

const ROWS: readonly Row[] = [
  { id: "a", name: "Priya Raman" },
  { id: "b", name: "Tomas Novak" },
];

const draw = (extra: Record<string, unknown>) => renderToStaticMarkup(
  <Listing<Row>
    label="People"
    of={{ status: "ready", data: ROWS }}
    rowKey={(r) => r.id}
    asRow={(r) => ({ name: r.name })}
    cols={[{ id: "name", label: "Name", cell: (r) => r.name }]}
    {...extra}
  />,
);

/** ⚠️ How many times a string appears — the count is what proves both shapes. */
const times = (of: string, what: string): number => of.split(what).length - 1;

describe("what a row can do", () => {
  it("reaches the list and the table from one declaration", () => {
    const html = draw({
      acts: () => [{ id: "x", label: "Remove", onDo: () => undefined }],
    });
    /* ⚠️ THE TRIGGER'S OWN NAME, once per row. The `Hint` around it renders
       nothing until somebody hovers, which is why this counts the label rather
       than the tooltip's words. */
    expect(times(html, 'aria-label="What can be done here"')).toBe(ROWS.length);
  });

  it("draws nothing at all when a row has no actions", () => {
    /* ⚠️ AN EMPTY LIST OF ACTS IS NOT AN EMPTY MENU. A trigger that opens onto
       nothing is a control that costs a press and answers with a blank sheet —
       and `acts` returning `[]` per row is the ordinary case for a list where
       only some rows can be acted on. */
    const html = draw({ acts: () => [] });
    expect(times(html, 'aria-label="What can be done here"')).toBe(0);
  });
});

describe("choosing rows", () => {
  const picking = {
    chosen: ["a"],
    onChoose: () => undefined,
    bulk: [{ id: "rm", label: "Remove", onDo: () => undefined }],
  };

  it("names every box after its own row", () => {
    const html = draw(picking);
    /* ⚠️ AFTER THE ROW, NOT AFTER ITSELF. Twelve controls all called "Choose
       this one" is twelve identical names and no way to tell which is which —
       and the row already knows what it is called. */
    for (const row of ROWS) expect(html).toContain(`Choose ${row.name}`);
  });

  it("says how many are chosen before it offers anything", () => {
    const html = draw(picking);
    /* ⚠️ THE COUNT, IN WORDS, AND BEFORE THE ACT IN THE DOCUMENT ORDER. A
       destructive control beside a selection somebody scrolled away from is the
       one thing in a list that loses data; the number is what makes it a
       decision. */
    expect(html).toContain("1 chosen");
    expect(html.indexOf("1 chosen")).toBeLessThan(html.indexOf(">Remove<"));
  });

  it("offers nothing while nothing is chosen", () => {
    const html = draw({ ...picking, chosen: [] });
    expect(html).not.toContain("chosen<");
    /* ⚠️ AND THE BOXES STAY, which is the half that is easy to get wrong. A
       column that appears only once something is chosen is a column nobody can
       use to choose the first thing. */
    for (const row of ROWS) expect(html).toContain(`Choose ${row.name}`);
  });

  it("draws no boxes at all unless all three props are given", () => {
    /* ⚠️ CHOOSING WITH NOTHING TO DO ABOUT IT IS A COLUMN OF BOXES THAT DOES
       NOTHING — see `ListingProps`. The partial call is the one somebody writes
       while wiring it up, and it must render the list it had before. */
    expect(draw({ chosen: ["a"] })).not.toContain("Choose Priya");
    expect(draw({ chosen: ["a"], onChoose: () => undefined })).not.toContain("Choose Priya");
  });
});
