/**
 * THE FORM.
 *
 * ⚠️ EVERY DEFECT HERE IS INVISIBLE TO SIGHT AND FATAL TO EVERYTHING ELSE. A
 * label that is not attached, a fault that is not announced, a placeholder doing
 * a label's job: each renders a form that looks completely finished and is
 * unusable by voice control, by a screen reader, and by anybody whose first
 * attempt failed validation.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BulkActions, Check, Choose, Dial, Field, Form, Input, SaveBar, Select, Switch, Textarea,
  type BoundControl, type Choice,
} from "../src/index.js";

const html = (node: React.ReactNode): string => renderToStaticMarkup(node as never);
const bound: BoundControl = { id: "x", describedBy: undefined, invalid: false };
const options: Choice[] = [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }];

describe("a field is a label, a control, a hint and a fault", () => {
  /*
    ⚠️ THE LABEL IS ATTACHED, NOT ADJACENT. `htmlFor` pointing at the control's
    id is what makes the label clickable, what voice control reads to find the
    box, and what a screen reader announces on focus. Text sitting above an
    input is none of those things and looks identical.
  */
  it("attaches the label to the control it names", () => {
    const out = html(<Field label="Studio name">{(b) => <Input bound={b} />}</Field>);
    const forId = /for="([^"]+)"/.exec(out)![1];
    expect(out).toContain(`id="${forId}"`);
    expect(out).toContain("Studio name");
  });

  /*
    ⚠️ BOTH, NOT WHICHEVER. A field with a hint and a fault must announce the
    fault AND still say what the box was for — dropping the hint on failure tells
    somebody they are wrong and not what right looks like.
  */
  it("describes the control by its hint and its fault together", () => {
    const out = html(
      <Field label="Slug" hint="Letters and dashes" fault="Already taken">{(b) => <Input bound={b} />}</Field>,
    );
    const described = /aria-describedby="([^"]+)"/.exec(out)![1]!.split(" ");
    expect(described).toHaveLength(2);
    for (const id of described) expect(out).toContain(`id="${id}"`);
  });

  /* ⚠️ A fault is announced the moment it appears, or it is a message nobody hears. */
  it("marks an invalid control and announces the reason", () => {
    const out = html(<Field label="Email" fault="That address bounced">{(b) => <Input bound={b} kind="email" />}</Field>);
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('role="alert"');
    expect(out).toContain("That address bounced");
    expect(out).toContain('data-invalid=""');
  });

  /* ⚠️ Two fields on one screen must not share an id, or each describes the first. */
  it("gives every field its own ids", () => {
    const out = html(
      <Form title="Studio">
        <Field label="One" fault="a">{(b) => <Input bound={b} />}</Field>
        <Field label="Two" fault="b">{(b) => <Input bound={b} />}</Field>
      </Form>,
    );
    const ids = [...out.matchAll(/for="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /*
    ⚠️ OPTIONAL IS MARKED, NOT REQUIRED. On a form where most things are needed,
    marking the exceptions is one badge instead of nine.
  */
  it("marks the optional field rather than the required ones", () => {
    expect(html(<Field label="Nickname" optional>{(b) => <Input bound={b} />}</Field>)).toContain("Optional");
    expect(html(<Field label="Name">{(b) => <Input bound={b} />}</Field>)).not.toContain("Required");
  });

  /*
    ⚠️ A PLACEHOLDER IS AN EXAMPLE, NEVER THE LABEL. It disappears the moment
    somebody types — which is when they most need to know what the box was for —
    and it is invisible to voice control at all times.
  */
  it("keeps the example out of the label's job", () => {
    const out = html(<Field label="Website">{(b) => <Input bound={b} kind="url" example="https://" />}</Field>);
    expect(out).toContain('placeholder="https://"');
    expect(out).toContain("Website");
  });
});

describe("the controls", () => {
  it("renders every control through the library's object", () => {
    expect(html(<Input bound={bound} />)).toContain("input");
    expect(html(<Textarea bound={bound} />)).toContain("textarea");
    expect(html(<Select bound={bound} options={options} />)).toContain("select");
    expect(html(<Check label="Remember" checked />)).toContain("checkbox");
    expect(html(<Choose name="Plan" options={options} value="a" />)).toContain("radio");
    expect(html(<Dial bound={bound} min={0} max={10} value="5" />)).toContain("range");
  });

  /*
    ⚠️ A SWITCH IS A SWITCH TO ASSISTIVE TECHNOLOGY. A checkbox announces
    "checked"; a switch announces "on", which is the difference between a thing
    that will be saved and a thing that already happened.
  */
  it("announces a switch as a switch", () => {
    expect(html(<Switch label="Email me" on />)).toContain('role="switch"');
  });

  /* ⚠️ A control that refuses says why — the same rule as `Button`'s. */
  it("refuses a disabled switch with no reason", () => {
    expect(() => html(<Switch label="Email me" on disabled />)).toThrow(/reason/);
    expect(html(<Switch label="Email me" on disabled reason="Your plan does not include email" />))
      .toContain("Your plan does not include email");
  });

  /*
    ⚠️ A DIAL WITHOUT A READ-OUT CANNOT BE SET PRECISELY. Somebody dragging for a
    specific number is guessing, and the number is the whole reason they came.
  */
  it("shows the value beside the track", () => {
    expect(html(<Dial bound={bound} min={0} max={100} value="40" format={(v) => `${v} kg`} />)).toContain("40 kg");
  });

  /* ⚠️ One of a few, all visible — and exactly one is marked chosen. */
  it("marks one choice as chosen", () => {
    const out = html(<Choose name="Plan" options={options} value="b" />);
    expect([...out.matchAll(/data-chosen=""/g)]).toHaveLength(1);
    expect(out).toContain('role="radiogroup"');
  });
});

describe("the bars appear only when there is something to say", () => {
  /*
    ⚠️ A SAVE BAR THAT IS ALWAYS THERE IS A PERMANENT CLAIM THAT WORK IS
    OUTSTANDING, and people stop reading it — which is exactly when the one time
    it mattered goes unread.
  */
  it("renders nothing until something is unsaved", () => {
    expect(html(<SaveBar dirty={false} />)).toBe("");
    expect(html(<SaveBar dirty />)).toContain("Unsaved changes");
    expect(html(<SaveBar dirty count={3} />)).toContain("3 unsaved changes");
    expect(html(<SaveBar dirty busy />)).toContain('aria-busy="true"');
  });

  /*
    ⚠️ IT NAMES THE COUNT. "Delete" over an unstated selection is the most
    expensive control in any product, and the count is the last place the mistake
    can be caught.
  */
  it("names how many are selected, and marks the destructive one", () => {
    expect(html(<BulkActions selected={0} actions={[]} />)).toBe("");
    const out = html(<BulkActions selected={4} actions={[{ id: "d", label: "Delete", destructive: true }]} />);
    expect(out).toContain("4 selected");
    expect(out).toContain('data-tone="error"');
    expect(html(<BulkActions selected={1} actions={[]} />)).toContain("1 selected");
  });
});

describe("the form names no colour and no timing", () => {
  const every = [
    html(<Form title="All"><Field label="A" fault="bad">{(b) => <Input bound={b} />}</Field></Form>),
    html(<Switch label="On" on />), html(<Check label="C" checked />),
    html(<Dial bound={bound} min={0} max={1} value="1" />), html(<SaveBar dirty />),
    html(<BulkActions selected={2} actions={[{ id: "x", label: "Archive" }]} />),
  ].join("");

  it("emits no literal colour, duration or curve", () => {
    expect(every).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(every).not.toMatch(/\b(rgb|rgba|hsl|oklch)\s*\(/i);
    expect(every).not.toMatch(/cubic-bezier|\b\d+m?s\b/);
  });
});
