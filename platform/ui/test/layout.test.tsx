/**
 * THE ARCHETYPES, AND THE PATTERNS THEY ARE ASSEMBLED FROM.
 *
 * ⚠️ EVERY DEFECT THIS FILE IS AGAINST RENDERS PERFECTLY WELL. A crown on a list
 * page, a section header inside a card that is not a feed, five quick actions, a
 * scroller that stays inside the page inset — none of them throws, none looks
 * broken in isolation, and every one of them is only visible next to the four
 * screens it was supposed to match. That is the whole reason they are refusals in
 * code rather than sentences in a document.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Amount, AppBar, ARCHETYPES, Badge, Crown, Glyph, Identity, LIMIT, Medallion, Page, PageTitle,
  CHOREOGRAPHY, PATTERNS, pageProblems, Promo, QuickActions, Scroller, Section, Segmented, SHAPE,
  SKIES, STRUCTURE, TileGrid, Topic,
} from "../src/index.js";

const html = (node: React.ReactNode): string => renderToStaticMarkup(node as never);
const action = (id: string) => ({ id, icon: "dot", label: id });

/* ------------------------------------------------------------ the shapes --- */

describe("five page shapes, and a screen picks one", () => {
  it("gives every archetype a shape, and no two the same top", () => {
    for (const a of ARCHETYPES) expect(SHAPE[a], a).toBeTruthy();
    const tops = ARCHETYPES.map((a) => SHAPE[a].top);
    expect(new Set(tops).size, "two archetypes with the same top are one archetype").toBe(tops.length);
  });

  /*
    ⚠️ THE HEADER SITS INSIDE THE CARD ONLY ON A FEED, because there the card IS
    the section rather than a list the section contains. This is the one shape
    property that differs on exactly one archetype, so a mistake here reads as
    "the design is inconsistent" rather than as a rule.
  */
  it("puts the section header inside the card on the feed alone", () => {
    const inside = ARCHETYPES.filter((a) => SHAPE[a].headerInside);
    expect(inside).toEqual(["feed"]);
  });

  /*
    ⚠️ THE LIGHT REACHES FURTHEST ON THE SCREEN THAT IS ABOUT ONE NUMBER, and
    least on the one that is a stack of independent sections. A photograph carries
    a whole screen; a pattern gives out just past the hero.
  */
  it("reaches furthest on a crown and least on a feed", () => {
    expect(SHAPE.crown.reach).toBeGreaterThan(SHAPE.topic.reach);
    expect(SHAPE.feed.reach).toBeLessThan(SHAPE.title.reach);
    for (const a of ARCHETYPES) {
      expect(SHAPE[a].solid, `${a}: the light must be solid before it fades`).toBeLessThan(SHAPE[a].reach);
    }
  });
});

/* ------------------------------------------------------- the declaration --- */

describe("what a page may declare", () => {
  it("accepts a page that says only what it is", () => {
    expect(pageProblems({ archetype: "crown" })).toEqual([]);
    expect(pageProblems({ archetype: "topic", sky: "waves" })).toEqual([]);
  });

  /*
    ⚠️ A PAGE MAY CHOOSE A MASK, NEVER A GROUND. A list page on a photograph is a
    list page whose top third is unreadable, and the author who set it has no way
    to see that from the call site.
  */
  it("refuses a ground a page is not entitled to choose", () => {
    expect(pageProblems({ archetype: "title", sky: "photo" })[0]?.at).toBe("sky");
    expect(pageProblems({ archetype: "title", sky: "aurora" })[0]?.at).toBe("sky");
    /* Every masked sky is a page's to name, on any archetype. */
    for (const sky of ["dots", "waves", "grid", "rings"] as const) {
      expect(pageProblems({ archetype: "title", sky }), sky).toEqual([]);
    }
  });

  it("refuses a header inside the card anywhere but a feed", () => {
    expect(pageProblems({ archetype: "feed", patterns: ["header-inside"] })).toEqual([]);
    for (const a of ARCHETYPES.filter((x) => x !== "feed")) {
      const problems = pageProblems({ archetype: a, patterns: ["header-inside"] });
      expect(problems[0]?.at, a).toBe("header-inside");
    }
  });

  it("names every limit that would otherwise be a sentence nobody read", () => {
    expect(pageProblems({ archetype: "crown", quickActions: LIMIT.quickActions })).toEqual([]);
    expect(pageProblems({ archetype: "crown", quickActions: LIMIT.quickActions + 1 })[0]?.at).toBe("quickActions");
    expect(pageProblems({ archetype: "feed", tabs: LIMIT.tabs + 1 })[0]?.at).toBe("tabs");
    expect(pageProblems({ archetype: "feed", tilesAcross: LIMIT.tilesAcross + 1 })[0]?.at).toBe("tilesAcross");
  });

  /* ⚠️ Every mistake at once: this runs over a manifest, not over one call. */
  it("reports every problem rather than the first", () => {
    const problems = pageProblems({ archetype: "title", sky: "photo", quickActions: 9, tabs: 9 });
    expect(problems.map((p) => p.at).sort()).toEqual(["quickActions", "sky", "tabs"]);
  });
});

/* -------------------------------------------------------------- the page --- */

describe("the page draws what the screen IS", () => {
  it("takes its sky, its reach and its top from the archetype", () => {
    const out = html(<Page archetype="crown" top={<Crown amount={<Amount whole="1,240" fraction=".50" />} />} />);
    expect(out).toContain('data-archetype="crown"');
    expect(out).toContain('data-sky="photo"');
    expect(out).toContain(`--solid:${SHAPE.crown.solid}%`);
    expect(out).toContain('data-top="photo-hero"');
  });

  /*
    ⚠️ A WRONG TOP RENDERS PERFECTLY WELL. A crown on a list page is a screen
    about one number that has no number — plausible alone, wrong beside the other
    four. So it is thrown, the way a reasonless refusal is.
  */
  it("refuses a top that belongs to another archetype", () => {
    expect(() => html(<Page archetype="title" top={<Crown amount={<Amount whole="1" />} />} />))
      .toThrow(/crown top on a title page/);
    expect(() => html(<Page archetype="crown" top={<PageTitle title="Clients" />} />))
      .toThrow(/title top on a crown page/);
    /* And the right one is accepted, or the check is only ever refusing. */
    expect(html(<Page archetype="title" top={<PageTitle title="Clients" />} />)).toContain("Clients");
  });

  /*
    ⚠️ A FEED HAS AN APP BAR AND NO HERO, and the distinction is the whole
    archetype: refusing every top made the one screen shape whose top IS an app
    bar unable to have one, which is the mistake in the direction that matters.
  */
  it("refuses a hero on a feed, and keeps its app bar", () => {
    expect(() => html(<Page archetype="feed" top={<Topic title="Anything" />} />)).toThrow(/independent sections/);
    expect(html(<Page archetype="feed" top={<AppBar title="Home" />} />)).toContain('data-one="app-bar"');
  });

  /* ⚠️ Only a masked sky is marked as masked: the correction is what needs it. */
  it("marks a masked sky and leaves a ground unmarked", () => {
    expect(html(<Page archetype="topic" top={<Topic title="Health" />} />)).toContain("data-masked");
    expect(html(<Page archetype="crown" top={<Crown amount={<Amount whole="1" />} />} />)).not.toContain("data-masked");
  });

  /*
    ⚠️ `body` IS THE STAGGER'S PARENT, and the delays are counted by nth-CHILD of
    it. A wrapper between them lands every delay on one element, which renders as
    "the animation is too subtle" — the wrong diagnosis, leading to the wrong fix.
  */
  it("puts the sections directly inside the body", () => {
    const out = html(
      <Page archetype="feed">
        <Section title="One">a</Section>
        <Section title="Two">b</Section>
      </Page>,
    );
    const body = out.split('data-one="body"')[1] ?? "";
    expect(body.slice(0, 40)).toContain('<section data-one="section"');
  });
});

/* ---------------------------------------------------------- the patterns --- */

describe("the section patterns", () => {
  it("puts the header outside the card by default, and inside on a feed", () => {
    const outside = html(<Page archetype="title" top={<PageTitle title="Clients" />}><Section title="June">x</Section></Page>);
    expect(outside).toMatch(/data-one="section-header" data-placement="outside"[\s\S]*data-one="section-card"/);

    const inside = html(<Page archetype="feed"><Section title="June" inside>x</Section></Page>);
    expect(inside).toMatch(/data-one="section-card"[\s\S]*data-placement="inside"/);
  });

  /*
    ⚠️ THE COMPONENT CANNOT SEE WHAT PAGE IT IS ON, which is exactly why this
    rule kept being broken — so the archetype travels down and the section reads
    it rather than being told.
  */
  it("refuses a header inside the card on a page that is not a feed", () => {
    expect(() => html(<Page archetype="title" top={<PageTitle title="Clients" />}><Section title="June" inside>x</Section></Page>))
      .toThrow(/feed pattern/);
  });

  it("refuses a fifth quick action and a fifth tile across", () => {
    expect(() => html(<QuickActions actions={["a", "b", "c", "d", "e"].map(action)} />)).toThrow(/toolbar/);
    expect(html(<QuickActions actions={["a", "b", "c", "d"].map(action)} />)).toContain('data-count="4"');

    const tiles = ["a", "b", "c", "d"].map((id) => ({ id, icon: "dot", label: id }));
    expect(() => html(<TileGrid tiles={tiles} across={LIMIT.tilesAcross + 1} />)).toThrow(/hit-area floor/);
    /* ⚠️ And the label is BELOW the tile, never inside it: a tile is a
       destination, and a destination people cannot name is one they avoid. */
    expect(html(<TileGrid tiles={tiles} />)).toMatch(/data-one="tile-face"[\s\S]*?data-one="text"/);
  });

  /* ⚠️ A quick action's label is never optional: a bare glyph is unnamed to voice control. */
  it("gives every quick action a label", () => {
    const out = html(<QuickActions actions={[action("Send"), action("Add")]} />);
    expect(out).toContain("Send");
    expect(out).toContain("Add");
  });

  /*
    ⚠️ ONE INDICATOR THAT TRAVELS. The index is a variable on the track, so the
    movement is continuous — two pills cross-fading reads as two things happening
    rather than one thing moving.
  */
  it("positions the segmented indicator by index rather than moving the tabs", () => {
    const out = html(<Segmented options={[{ id: "a", label: "A" }, { id: "b", label: "B" }]} at="b" />);
    expect(out).toContain("--at:1");
    expect(out).toContain("--of:2");
    expect(out).toContain('aria-selected="true"');
  });

  /* ⚠️ A scroller is the one thing that leaves the page inset. */
  it("marks the one section allowed outside the page inset", () => {
    const out = html(<Page archetype="feed"><Section title="Coaches" bleed><Scroller label="Coaches">x</Scroller></Section></Page>);
    expect(out).toContain('data-bleed=""');
    expect(out).toContain('data-one="scroller"');
  });

  it("names the two row leads separately, because the row's job decides", () => {
    expect(html(<Glyph icon="gear" />)).toContain('data-one="glyph"');
    expect(html(<Medallion initials="MK" />)).toContain('data-one="medallion"');
  });

  it("draws a badge in our tone vocabulary rather than the library's", () => {
    /* `danger` is ours; `error` is theirs, and only `borrowed.ts` knows both. */
    expect(html(<Badge tone="danger">3</Badge>)).toContain("badge-error");
    expect(html(<Badge>3</Badge>)).not.toContain("badge-error");
  });

  /* ⚠️ The cents are smaller, and the figures are tabular. A balance is a magnitude. */
  it("renders an amount as one number rather than two", () => {
    const out = html(<Amount prefix="$" whole="1,240" fraction=".50" />);
    expect(out).toContain('data-one="amount-fraction"');
    expect(out).toContain("data-numeric");
  });
});

/* --------------------------------------------------------------- no look --- */

describe("the layout names roles and never a look", () => {
  const every = [
    html(<Page archetype="crown" top={<Crown eyebrow="Balance" amount={<Amount whole="1,240" />} actions={[action("Send")]} bar={<AppBar leading="back" />} />}>
      <Section title="June" total="4">x</Section>
    </Page>),
    html(<Page archetype="identity" top={<Identity initials="MK" name="Marion" detail="Coach" />} />),
    html(<Promo title="Refer a friend" />),
    html(<Segmented options={[{ id: "a", label: "A" }]} at="a" />),
  ].join("");

  it("emits no literal colour anywhere in a full screen", () => {
    expect(every).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(every).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch|color-mix)\s*\(/i);
  });

  /* ⚠️ And no duration: motion arrives as a role in a scene, never as a prop. */
  it("emits no duration or easing of its own", () => {
    expect(every).not.toMatch(/cubic-bezier|transition:|animation:/i);
  });

  it("assembles every archetype from the declared patterns and nothing else", () => {
    expect(PATTERNS.length).toBeGreaterThan(0);
    expect(new Set(PATTERNS).size).toBe(PATTERNS.length);
    expect(new Set(SKIES).size).toBe(SKIES.length);
  });
});

/* ---------------------------------------------------------------- rhythm --- */

describe("the body's rhythm", () => {
  /*
    Comments state the rules and would match them. Only declarations are judged.

    ⚠️ THE SUBJECT IS THE CHOREOGRAPHER, NOT THE STRUCTURAL SHEET. Every timing
    in the product lives in `motion.ts`; `styles.ts` held a copy of the clock for
    one increment, which was already a second definition of durations that file
    defines — and two definitions of one clock is how two things moving at once
    come to disagree.
  */
  const declarations = (CHOREOGRAPHY + STRUCTURE).replace(/\/\*[\s\S]*?\*\//g, "");

  /*
    ⚠️ nth-CHILD ON THE BODY, NEVER nth-of-type ON THE CARD. A section may be a
    `<section>` wrapping a `<div>`, so counting by TYPE lands every delay on the
    wrong element and the stagger silently does nothing at all. It renders as
    "the animation is too subtle" — which is the wrong diagnosis, and leads to
    making the distance bigger rather than to the selector that is wrong.
  */
  it("staggers by position in the body rather than by element type", () => {
    expect(declarations).toMatch(/\[data-one='body'\] > \*:nth-child\(1\)/);
    expect(declarations, "nth-of-type counts every element of that tag, not every section").not.toContain("nth-of-type");
  });

  /*
    ⚠️ CAPPED. Past about five, a stagger stops reading as choreography and starts
    reading as the list being slow to arrive — so the delays stop growing rather
    than the list being allowed to animate for a second and a half.
  */
  it("caps the stagger rather than letting a long list animate forever", () => {
    expect(declarations).toMatch(/nth-child\(n\+\d\)[^}]*animation-delay/);
  });

  /* ⚠️ The hero leads: it is what the screen is about, and it comes from further. */
  it("gives the hero its own arrival, and everything else the shared one", () => {
    expect(declarations).toMatch(/\[data-one='hero'\] \{ animation: one-lift/);
    expect(declarations).toMatch(/\[data-one='body'\] > \* \{ animation: one-rise/);
  });

  /*
    ⚠️ NO DURATION IS WRITTEN WHERE IT IS USED. Every one is a token, so two
    things moving at once physically cannot disagree — which is the whole
    difference between an interface that feels built and one that feels
    assembled. The clock is the one place a millisecond may be spelled.
  */
  it("spells no duration outside the clock", () => {
    expect(STRUCTURE.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/(transition|animation)[^;]*\b\d+m?s\b/);
  });
});
