/**
 * THE COMPONENTS, AND THE STATE MATRIX.
 *
 * ⚠️ THE ASSERTION THAT MATTERS MOST IS THAT TWO STATES DO NOT RENDER THE SAME.
 * A declared state that produces identical output is a state nobody designed —
 * the declaration says it was considered and the render says it was not, and the
 * photograph everybody looks at once will not tell them apart either.
 *
 * Rendered to static markup rather than into a DOM: everything asserted here is
 * structure, tokens and accessibility, all of which survive the trip. The
 * PHOTOGRAPH is a later artifact for review; distinguishability is the property.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Button, Callout, Collection, Confirm, EmptyState, NoData, Overlay, Row, Skeleton, Surface, Text,
  COMPONENTS, RENDERER_OWNS, MAX_DEPTH, navProblems, paneCapable, shapeFor, stackProblem,
  validateStates, matrixFor, groundFor, DEFAULT_BRAND, SEMANTIC,
  type Destination, type Interaction, type Width,
} from "../src/index.js";

const html = (node: React.ReactNode): string => renderToStaticMarkup(node as never);

/* ---------------------------------------------------------------- matrix --- */

describe("every registered component is declared, and every declaration renders", () => {
  it("registers nothing malformed", () => {
    expect(validateStates(COMPONENTS)).toEqual([]);
  });

  /*
    ⚠️ THE MATRIX IS THE DECLARATION, and it is what a screenshot suite walks.
    A component with a state it never renders is one nobody has looked at.
  */
  it("produces a matrix entry for every state of every component", () => {
    const matrix = COMPONENTS.flatMap(matrixFor);
    expect(matrix.length).toBeGreaterThan(COMPONENTS.length);
    expect(new Set(matrix).size).toBe(matrix.length);
  });

  /*
    ⚠️ TWO STATES THAT RENDER IDENTICALLY ARE TWO STATES ONE OF WHICH IS A LIE.
    Declaring `busy` and rendering it exactly like `idle` passes every other
    check in this file — and passes the photograph, because the two images match.
  */
  it("renders each of a button's states differently from the others", () => {
    const states: Interaction[] = ["idle", "hover", "pressed", "focus", "busy", "locked"];
    const rendered = states.map((state) =>
      html(<Button state={state} reason={state === "locked" ? "Not in your plan" : undefined}>Save</Button>));
    expect(new Set(rendered).size).toBe(states.length);
  });

  it("renders each of a collection's data states differently", () => {
    const empty = { title: "Nothing yet" };
    const rendered = [
      html(<Collection items={null} empty={empty}>{() => <span>x</span>}</Collection>),
      html(<Collection items={[]} empty={empty}>{() => <span>x</span>}</Collection>),
      html(<Collection items={[1]} failed empty={empty}>{() => <span>x</span>}</Collection>),
      html(<Collection items={[1]} included={{ a: true, b: false }} empty={empty}>{() => <span>x</span>}</Collection>),
      html(<Collection items={[1]} empty={empty}>{() => <span>x</span>}</Collection>),
    ];
    expect(new Set(rendered).size).toBe(rendered.length);
  });
});

/* ------------------------------------------------------------- no colour --- */

describe("a component names a role and never a colour", () => {
  /*
    ⚠️ ONE ARBITRARY COLOUR IS ALL IT TAKES for the exhaustive sweep to stop
    being a guarantee. Rendering every component and looking for a literal is the
    check that survives somebody adding an inline style in a hurry.
  */
  it("emits no literal colour in any rendered output", () => {
    const rendered = [
      html(<Surface depth={2}><Text>hello</Text></Surface>),
      html(<Button kind="primary">Go</Button>),
      html(<Row title="Something" detail="and more" value={null} />),
      html(<Callout tone="danger" title="Careful" />),
      html(<EmptyState title="Nothing yet" />),
      html(<Skeleton />),
      html(<Overlay kind="sheet" title="Edit" />),
      html(<NoData />),
    ].join("");
    expect(rendered).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(rendered).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch|color-mix)\s*\(/i);
    // Every colour reaches the DOM as a token, or it does not reach it at all.
    for (const value of rendered.matchAll(/(?:background|color)\s*:\s*([^;"']+)/g)) {
      expect(value[1]!.trim(), value[0]).toMatch(/^var\(--/);
    }
  });

  it("emits no duration or easing of its own", () => {
    const rendered = [html(<Button>Go</Button>), html(<Overlay kind="dialog" title="Sure?" />)].join("");
    expect(rendered).not.toMatch(/\b\d+m?s\b/);
    expect(rendered).not.toMatch(/cubic-bezier|transition|animation/i);
  });
});

/* ----------------------------------------------------------- refusal + a11y --- */

describe("a refusal explains itself, and a locked one stays reachable", () => {
  /*
    ⚠️ A REFUSAL WITH NO EXPLANATION IS NOT A DEGRADED BUTTON, IT IS A DEAD END.
    Throwing is deliberate: shipping one silently is how a product accumulates
    controls nobody can get past and nobody can describe.
  */
  it("refuses to render a refusal with no reason", () => {
    expect(() => html(<Button state="disabled">Save</Button>)).toThrow(/reason/);
    expect(() => html(<Button state="locked">Save</Button>)).toThrow(/reason/);
  });

  /*
    ⚠️ LOCKED STAYS FOCUSABLE AND READABLE so it can explain itself and offer the
    way out. A disabled control cannot be focused, cannot be read aloud, and
    cannot sell anything — which is the whole of what a plan gate is for.
  */
  it("keeps a locked control in the tab order and a disabled one out of it", () => {
    const locked = html(<Button state="locked" reason="Not in your plan" resolve="billing.plans">Publish</Button>);
    expect(locked).toContain('data-state="locked"');
    // Not disabled, and not announced as unavailable either: pressing it is how
    // somebody reaches the plan that would unlock it.
    expect(locked).not.toMatch(/\sdisabled[=\s>]/);
    expect(locked).not.toContain("aria-disabled");
    expect(locked).toContain("Not in your plan");
    expect(locked).toContain('data-resolve="billing.plans"');

    const disabled = html(<Button state="disabled" reason="Add a client first">Publish</Button>);
    expect(disabled).toMatch(/\sdisabled[=\s>]/);
    expect(disabled).toContain('aria-disabled="true"');
  });

  /*
    ⚠️ THE REASON IS A CAPTION UNDER THE CONTROL, NOT TEXT INSIDE THE PILL. As a
    child of the button it simply concatenates — "PublishNot in your plan" —
    because a pill is a one-line inline box and nothing in the markup said
    otherwise. EVERY accessibility assertion above still passed: they ask what
    the tree MEANS, and the meaning was right. Only the shape was wrong, and only
    a photograph showed it, which is why this check is about STRUCTURE.
  */
  it("keeps the reason outside the button rather than inside its label", () => {
    const out = html(<Button state="locked" reason="Not in your plan">Publish</Button>);
    const button = out.slice(out.indexOf("<button"), out.indexOf("</button>"));
    expect(button, "the reason is inside the pill and runs into the label").not.toContain("Not in your plan");
    expect(out).toContain("Not in your plan");
    /* And it is still what describes the control, or it is decoration. */
    const said = /aria-describedby="([^"]+)"/.exec(out)![1];
    expect(out).toContain(`id="${said}"`);
  });

  it("marks a busy control busy rather than merely stuck", () => {
    expect(html(<Button state="busy">Saving</Button>)).toContain('aria-busy="true"');
  });

  /*
    ⚠️ NEVER COLOUR ALONE, AT ANY SATURATION. A greyscale screenshot and a person
    with deuteranopia must read the same screen, so every state carries a word.
  */
  it("gives every tone a word and a role, not only a colour", () => {
    const danger = html(<Callout tone="danger" title="Payment failed" />);
    expect(danger).toContain("Payment failed");
    expect(danger).toContain('role="alert"');
    expect(html(<Callout tone="success" title="Saved" />)).toContain('role="status"');
  });

  /*
    ⚠️ THE FORM IS DECIDED, NOT CHOSEN. An author never writes a conditional
    about this and never learns the threshold — which matters because a rule
    that has to be remembered per call site is one that is remembered on the
    screens somebody was thinking about.
  */
  it("contains a tone that would be confusable with its ground", () => {
    const greenGround = groundFor({ ...DEFAULT_BRAND, ambience: { hue: SEMANTIC.success.h, intensity: 0.05 } }, "light");
    const blueGround = groundFor({ ...DEFAULT_BRAND, ambience: { hue: 250, intensity: 0.05 } }, "light");
    expect(html(<Callout tone="success" title="Saved" ground={greenGround.canvas} />)).toContain('data-form="contained"');
    expect(html(<Callout tone="success" title="Saved" ground={blueGround.canvas} />)).toContain('data-form="tone"');
    // With no ground given there is nothing to collide with, and the tone stands.
    expect(html(<Callout tone="success" title="Saved" />)).toContain('data-form="tone"');
  });

  it("keeps the word and the icon whichever form it takes", () => {
    const greenGround = groundFor({ ...DEFAULT_BRAND, ambience: { hue: SEMANTIC.success.h, intensity: 0.05 } }, "light");
    const contained = html(<Callout tone="success" title="Saved" ground={greenGround.canvas} />);
    // Two of the four axes survive; tone is the least load-bearing and goes first.
    expect(contained).toContain("Saved");
    expect(contained).toContain('data-one="callout-icon"');
  });

  it("renders absence as words rather than as a dash", () => {
    const row = html(<Row title="Weight" value={null} />);
    expect(row).toContain("No data yet");
    // An em dash at display size is a horizontal rule, and assistive technology
    // announces "em dash" if it announces anything at all.
    expect(row).not.toContain("—");
  });

  /*
    ⚠️ THE WHOLE ROW IS THE TARGET, not the glyph inside it. A hit area smaller
    than the floor is one people miss on a moving train, which is where most of
    this is used.
  */
  it("makes the whole row the target when it opens something", () => {
    expect(html(<Row title="Marion" onOpen={() => undefined} />)).toMatch(/^<button[^>]*data-one="row"/);
    expect(html(<Row title="Marion" />)).toMatch(/^<div[^>]*data-one="row"/);
  });
});

/* --------------------------------------------------------------- overlay --- */

describe("the overlay ladder", () => {
  it("blocks only for a decision", () => {
    expect(html(<Overlay kind="dialog" title="Delete?" />)).toContain('aria-modal="true"');
    expect(html(<Overlay kind="sheet" title="Edit" />)).not.toContain("aria-modal");
  });

  /*
    ⚠️ A SHEET OPENED FROM A SHEET IS A SCREEN THAT SHOULD HAVE BEEN A ROUTE.
    Refusing at the third layer stops an interface becoming a stack somebody
    unwinds backwards to find out where they were.
  */
  it("caps depth at two, and the second must be a dialog", () => {
    expect(stackProblem(["sheet"])).toBeNull();
    expect(stackProblem(["sheet", "dialog"])).toBeNull();
    expect(stackProblem(["sheet", "sheet"])?.detail).toMatch(/only a dialog/);
    expect(stackProblem(["sheet", "dialog", "dialog"])?.detail).toMatch(`at most ${MAX_DEPTH}`);
    expect(stackProblem(["drawer", "drawer"])?.detail).toMatch(/two drawers/);
  });

  /*
    ⚠️ A DESTRUCTIVE CONFIRM NAMES THE OBJECT. It is the last place a mistake can
    be caught, and a generic verb catches nothing.
  */
  it("names the object in a destructive confirmation", () => {
    const confirm = html(<Confirm verb="Delete" object="the June plan" onConfirm={() => undefined} onCancel={() => undefined} />);
    expect(confirm).toContain("Delete the June plan");
    // Never the bare verb: "Delete" is the last place a mistake can be caught,
    // and a generic one catches nothing.
    expect(confirm).not.toMatch(/>Delete</);
  });

  it("gives a dismissible overlay a way out and a dialog none", () => {
    expect(html(<Overlay kind="sheet" title="Edit" onDismiss={() => undefined} />)).toContain('data-one="overlay-dismiss"');
    expect(html(<Overlay kind="dialog" title="Sure?" onDismiss={() => undefined} />)).not.toContain('data-one="overlay-dismiss"');
  });
});

/* ------------------------------------------------------------ navigation --- */

describe("one navigation surface, three levels", () => {
  const destination = (id: string, kind: Destination["kind"] = "overview"): Destination =>
    ({ id, label: id, icon: "dot", kind });

  it("refuses more than five destinations and fewer than three", () => {
    expect(navProblems(["a", "b", "c"].map((i) => destination(i)))).toEqual([]);
    expect(navProblems(["a", "b"].map((i) => destination(i)))[0]?.detail).toMatch(/fewer than three/);
    expect(navProblems(["a", "b", "c", "d", "e", "f"].map((i) => destination(i)))[0]?.detail).toMatch(/the same place/);
  });

  /*
    ⚠️ AN ICON TRAVELS WITH ITS LABEL. An icon-only rail item is unnamed to voice
    control and ambiguous to everybody else.
  */
  it("refuses a destination with an icon and no label", () => {
    const bad = [destination("a"), destination("b"), { ...destination("c"), label: "  " }];
    expect(navProblems(bad)[0]?.detail).toMatch(/no label/);
  });

  /*
    ⚠️ A COLLECTION SHOWS ITS LIST AND A RECORD AT ONCE from desktop up. Replacing
    the list on open is the single thing that makes a wide viewport read as a
    phone in the middle of a monitor.
  */
  it("picks the shape from the destination's kind, never from the screen", () => {
    const widths: Width[] = ["phone", "tablet", "desktop", "wide"];
    expect(widths.map((w) => shapeFor("collection", w))).toEqual(["column", "focus", "two-pane", "two-pane"]);
    expect(widths.map((w) => shapeFor("overview", w))).toEqual(["column", "focus", "focus", "board"]);
    // A canvas is not a document: a 720 column would make each of them worse.
    expect(widths.map((w) => shapeFor("task", w))).toEqual(["full-bleed", "full-bleed", "full-bleed", "full-bleed"]);
  });

  it("knows which surfaces may appear in a pane, and must size against a container", () => {
    expect(paneCapable("collection")).toBe(true);
    expect(paneCapable("overview")).toBe(true);
    expect(paneCapable("task")).toBe(false);
  });
});

/* -------------------------------------------------------------- boundary --- */

describe("the renderer owns the chrome", () => {
  /*
    ⚠️ THE BOUNDARY IS A LIST, and it is what the guard reads. An app that could
    define its own dialog defines one within a quarter, and the decision to share
    a design system decays into a component library with extra steps.
  */
  it("names what an app may never build for itself", () => {
    for (const owned of ["shell", "dialog", "toast", "empty-state", "button", "input"]) {
      expect(RENDERER_OWNS, owned).toContain(owned);
    }
  });
});
