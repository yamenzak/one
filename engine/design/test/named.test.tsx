/**
 * A CONTROL IN A ROW THAT NAMED IT DOES NOT NAME ITSELF AGAIN.
 *
 * ⚠️ `ControlRow` EXISTS TO PUT A LABEL BESIDE A CONTROL, and every control in
 * this library renders its own — so the pair reads "Name / Name", "Brand /
 * Brand", "Barcode / Barcode" down a card. On the import screen that was seven
 * fields each named twice, in the one place somebody is deciding what a column
 * means, and nothing failed anywhere.
 *
 * ⚠️ AND THE LABEL IS HIDDEN, NEVER DROPPED. It is what a screen reader
 * announces the control as; removing it leaves a select somebody navigating by
 * keyboard cannot identify — a worse fault than the one this fixes, and an
 * invisible one. So both halves are asserted: seen once, present twice.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Choice, ControlRow, Group, TextInput } from "../src/index.js";

/**
 * ⚠️ BY `data-slot`, NOT BY TAG. The library draws a label as a `<span>` for a
 * select and a `<label>` for a text field, so a check written against one tag
 * passes vacuously on the other — which is the whole set of controls this rule
 * is about, minus the one it was written for.
 */
const LABEL = /<[a-z]+[^>]*data-slot="label"[^>]*>([^<]*)</g;

const labels = (markup: string): readonly { readonly text: string; readonly hidden: boolean }[] =>
  [...markup.matchAll(LABEL)].map((found) => ({
    text: found[1] ?? "",
    hidden: /sr-only/.test(found[0]),
  }));

const all = (markup: string): number => (markup.match(/Which shelf/g) ?? []).length;

describe("a control inside a row that names it", () => {
  const inRow = renderToStaticMarkup(
    <Group>
      <ControlRow label="Which shelf">
        <Choice
          label="Which shelf"
          value="a"
          onChange={() => {}}
          options={[{ id: "a", label: "Rack A" }]}
        />
      </ControlRow>
    </Group>,
  );

  it("draws the name once", () => {
    const drawn = labels(inRow).filter((one) => !one.hidden && one.text.includes("Which shelf"));
    expect(drawn, `"Which shelf" is drawn as a label ${drawn.length} times`).toEqual([]);
    /* ⚠️ The ROW draws it — as a row's body, not as a label. */
    expect(all(inRow)).toBeGreaterThan(1);
  });

  it("still gives the control its own label, hidden", () => {
    expect(labels(inRow).some((one) => one.hidden && one.text.includes("Which shelf")))
      .toBe(true);
  });

  /* ⚠️ AND A CONTROL ON ITS OWN KEEPS ITS VISIBLE LABEL, which is the whole
     reason this is a context rather than a change to the control. */
  it("leaves a control that nothing else named alone", () => {
    const alone = renderToStaticMarkup(
      <TextInput label="Which shelf" value="" onChange={() => {}} name="shelf" />);
    expect(labels(alone)).toContainEqual({ text: "Which shelf", hidden: false });
  });
});
