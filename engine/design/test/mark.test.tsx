/**
 * THE LOGO, AND THE TWO WAYS IT HAS FAILED SILENTLY.
 *
 * ⚠️ NEITHER DEFECT THREW, TYPECHECKED WRONG, OR CHANGED A TEST. A mark is a
 * picture: it is correct only in the sense that somebody looked at it, and both
 * of these shipped in a form that renders — one as a mark 36% shorter than the
 * size it was handed, the other as a beak and two dots with the stem cut away.
 * Both were found by photographing a screen, which is not a thing that happens
 * on every commit.
 *
 * ⚠️ SO WHAT IS ASSERTED IS THE GEOMETRY, NOT THE APPEARANCE. A snapshot of the
 * markup would fail on every deliberate redraw and prove nothing about either
 * failure; these two facts stay true through any redraw and are exactly what
 * went wrong.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Mark } from "../src/frame/arrival.js";
import { Lockup } from "../src/parts/logo.js";
import * as MARKS from "../src/parts/marks.js";

const svgOf = (node: React.ReactElement) => renderToStaticMarkup(node);

const box = (svg: string) => {
  const view = svg.match(/viewBox="([\d.\s-]+)"/)?.[1]?.trim().split(/\s+/).map(Number);
  if (!view || view.length !== 4) throw new Error("the mark has no viewBox");
  return {
    x: view[0]!, y: view[1]!, w: view[2]!, h: view[3]!,
    height: Number(svg.match(/height="([\d.]+)"/)?.[1]),
    width: Number(svg.match(/width="([\d.]+)"/)?.[1]),
  };
};

describe("the mark", () => {
  /*
    ⚠️ A SIZE IS A PROMISE ABOUT THE INK. The drawing came off a 100-unit square
    it fills neither dimension of, so a square viewBox renders every declared
    size short and floats the numeral in a gutter wider than itself — which is
    why a mark asked to span two lines of a stacked lockup came out one line
    tall, sitting off the left edge every other element in the column shared.
  */
  it("crops to the drawing, so a declared size is the height of the ink", () => {
    const at = box(svgOf(<Mark size="door" />));
    expect(at.h).toBeLessThan(100);
    expect(at.w).toBeLessThan(at.h);
    /* The box is the drawing's proportion, so nothing is stretched. */
    expect(at.width / at.height).toBeCloseTo(at.w / at.h, 2);
  });

  it("keeps that proportion at every size", () => {
    const sizes = (["nav", "row", "crown", "door"] as const).map((s) => box(svgOf(<Mark size={s} />)));
    const ratios = sizes.map((s) => s.width / s.height);
    for (const r of ratios) expect(r).toBeCloseTo(ratios[0]!, 1);
    /* ⚠️ And they are genuinely different sizes — a scale that collapsed to one
       number is a mark that ignores the slot it was put in. */
    expect(new Set(sizes.map((s) => s.height)).size).toBe(sizes.length);
  });

  /*
    ⚠️ THE MASK KEEPS THE DRAWING, AND `100%` DOES NOT. A percentage in a mask
    resolves against the VIEWPORT while the shapes under it are in user space,
    so the moment the viewBox was cropped the keep-rect slid off the artwork and
    the stencil cut most of the stem away. It still rendered: a beak, two dots,
    and no numeral.
  */
  it("masks in the drawing's own coordinates, never in percentages", () => {
    for (const of of ["one", "space"] as const) {
      const svg = svgOf(<Mark of={of} />);
      const keep = svg.match(/<rect\b[^>]*fill="#fff"[^>]*>/)?.[0];
      expect(keep, `${of}: the stencil has no keep-rect`).toBeTruthy();
      expect(keep, `${of}: a percentage keep-rect cuts the drawing once the viewBox moves`)
        .not.toMatch(/%/);

      /* It has to COVER the drawing, not merely be absolute. */
      const at = box(svg);
      const num = (name: string) => Number(keep!.match(new RegExp(`${name}="([\\d.-]+)"`))?.[1]);
      expect(num("x")).toBeLessThanOrEqual(at.x);
      expect(num("y")).toBeLessThanOrEqual(at.y);
      expect(num("x") + num("width")).toBeGreaterThanOrEqual(at.x + at.w);
      expect(num("y") + num("height")).toBeGreaterThanOrEqual(at.y + at.h);
    }
  });

  /* ⚠️ INK, NEVER A LITERAL COLOUR. The drawings this came from filled #ffffff,
     which is a logo that is invisible on every light surface — and fails as an
     empty space where the brand was rather than as an error. */
  it("is drawn in the ink it inherits", () => {
    expect(svgOf(<Mark />)).toContain('fill="currentColor"');
    expect(svgOf(<Mark />)).not.toMatch(/fill="#(fff|ffffff)"\s*(viewBox|height|width|role)/);
  });

  /* ⚠️ ONE MASK ID PER INSTANCE. An SVG id is DOCUMENT-global, so two marks on
     one page — a crown and a sign-in card, which is the ordinary case — resolve
     the same `url(#…)` to whichever rendered last. */
  it("gives every instance its own mask id", () => {
    const pair = renderToStaticMarkup(<><Mark of="one" /><Mark of="space" /></>);
    const ids = [...pair.matchAll(/mask id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("the lockup", () => {
  /* ⚠️ THE WEIGHT SPLIT IS THE WHOLE WORDMARK — which family this belongs to,
     and which member it is. Set the same, every product name is one long word. */
  it("sets the family and the member differently", () => {
    const html = renderToStaticMarkup(<Lockup name={["One", "Space"]} />);
    expect(html).toContain("One");
    expect(html).toContain("Space");
    const family = html.match(/<span class="([^"]*)">One</)?.[1] ?? "";
    const member = html.match(/<span class="([^"]*)">Space</)?.[1] ?? "";
    expect(family).not.toBe(member);
  });

  /* ⚠️ ONE LABEL FOR THE WHOLE THING — the mark is hidden from the reader
     above, so this is the only announcement and it is the name. */
  it("announces itself once, as the name", () => {
    const html = renderToStaticMarkup(<Lockup name={["One", "Space"]} />);
    expect(html).toContain('aria-label="OneSpace"');
    expect([...html.matchAll(/aria-label=/g)]).toHaveLength(1);
  });

  /*
    ⚠️ STACKED, THE MARK SPANS BOTH LINES. That is what makes the numeral read
    as a numeral rather than as a bracket beside the first line, and it is the
    thing the cropped viewBox exists to make possible — before it, the stacked
    mark was shorter than one line of the wordmark it was set against.
  */
  it("gives the stacked arrangement a taller mark than the row", () => {
    const stacked = box(renderToStaticMarkup(<Lockup stack size="crown" />));
    const row = box(renderToStaticMarkup(<Lockup size="crown" />));
    expect(stacked.height).toBeGreaterThan(row.height);
  });
});

/* -------------------------------------------------------------- the wallet --- */

/**
 * THE CURRENCY MARK, AND THE ONE THING THAT MAKES IT ONE.
 *
 * ⚠️ ITS BARS LEAVE THE NUMERAL, and that overhang IS the mark. Cropped to the
 * numeral's box it renders as a plain `1` beside every credit figure in the
 * product — which is worse than no currency mark at all, because it reads as the
 * platform's own logo standing in for a unit.
 */
describe("the wallet's mark", () => {
  it("is drawn wider than the numeral, so its bars are not clipped", () => {
    const one = box(svgOf(<Mark of="one" size="crown" />));
    const wallet = box(svgOf(<Mark of="wallet" size="crown" />));
    expect(wallet.w).toBeGreaterThan(one.w);
    /* ⚠️ Same height: it is the same numeral with something added, never a
       different shape — see `partsOf`. */
    expect(wallet.h).toBe(one.h);
  });

  /*
    ⚠️ AND THE BARS ARE DRAWN OUTSIDE THE MASK. Inside it they would be COUNTERS
    — light cut out of the stem — rather than cards crossing it, which is the
    same picture only while the wallet's stem has no counters of its own.
  */
  it("adds the bars rather than cutting them out", () => {
    const svg = svgOf(<Mark of="wallet" size="crown" />);
    const masked = svg.slice(svg.indexOf("<mask"), svg.indexOf("</mask>"));
    /* Two bar paths in the drawing, none of them inside the stencil. */
    expect(svg.match(/<path/g)?.length).toBe(4);
    expect(masked).not.toContain("<path");
  });

  /*
    ⚠️ AND THE INLINE SIZE IS MEASURED IN `em`. A currency mark pinned to a pixel
    height is the right size in exactly one of the six places a credit figure
    appears and visibly wrong in the other five.
  */
  it("takes its size from the text it sits beside", () => {
    const svg = svgOf(<Mark of="wallet" size="inline" />);
    expect(svg).toContain('height="1em"');
    expect(svg).toMatch(/width="[\d.]+em"/);
  });
});

/*
  ⚠️ A MARK WITH NO SIZE IS NOT A SMALL MARK, IT IS NO MARK. An SVG carrying only
  a `viewBox` has no intrinsic size, so it lays out at 0×0 wherever nothing sets
  one — and every host in this product that is a ROW sets one, which is why the
  marks we draw ourselves worked for weeks and then simply were not there inside
  a text field's prefix. Measured before the fix: 0 by 0, no error, no gap.

  ⚠️ AND IT IS A FLOOR RATHER THAN A SCALE. A class beats a presentational
  attribute, so `[&>svg]:size-5` still wins wherever a host has an opinion.
*/
describe("the marks we draw ourselves", () => {
  it("each carries a size, so it is visible where nothing sets one", () => {
    const drawn = Object.entries(MARKS).filter(([name]) => name.endsWith("Mark"));
    expect(drawn.length).toBeGreaterThan(6);
    for (const [name, Drawn] of drawn) {
      const svg = svgOf(<Drawn />);
      expect(svg, `${name} has no width`).toMatch(/width="\d+"/);
      expect(svg, `${name} has no height`).toMatch(/height="\d+"/);
    }
  });
});

/**
 * ONEINVENTORY'S MARK — the same numeral, its counters cut as a code.
 *
 * ⚠️ A PRODUCT'S MARK IS THE FAMILY'S SILHOUETTE WITH DIFFERENT LIGHT THROUGH
 * IT. That is the rule the wallet breaks deliberately and every product must
 * not: a product with its own outline makes a shelf of products read as a
 * folder of logos, and the moment there are three of them nobody can tell they
 * are one company.
 */
describe("a product's mark", () => {
  it("is the platform's numeral, at the platform's proportion", () => {
    const one = box(svgOf(<Mark of="one" size="crown" />));
    const inventory = box(svgOf(<Mark of="inventory" size="crown" />));
    expect(inventory.w).toBe(one.w);
    expect(inventory.h).toBe(one.h);
  });

  /*
    ⚠️ SIX COUNTERS OF SIX WIDTHS, AND THE UNEVENNESS IS THE DRAWING. Matched
    widths are a grating; these are a bar pattern — a numeral read as a code,
    which is what this product does to everything it is pointed at.
  */
  it("cuts six counters of six widths, all inside the stem", () => {
    const svg = svgOf(<Mark of="inventory" size="crown" />);
    const masked = svg.slice(svg.indexOf("<mask"), svg.indexOf("</mask>"));
    const widths = [...masked.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(widths).toHaveLength(6);
    expect(new Set(widths).size).toBe(6);
    /* ⚠️ Cut rather than added — a counter outside the mask is a bar drawn ON
       the stem, which is the wallet's shape and not a product's. */
    expect(masked).toContain("<line");
  });

  /*
    ⚠️ THE BEAK IS THE ONE PLACE A PRODUCT CARRIES A HUE, and the stem is never
    one. A coloured stem is a second brand; the beak is the family's own
    asymmetry, so colouring it names the product and leaves the numeral the
    platform's.
  */
  it("colours the beak and nothing else", () => {
    const svg = svgOf(<Mark of="inventory" size="crown" />);
    const fills = [...svg.matchAll(/<path[^>]*fill="(oklch[^"]*)"/g)].map((m) => m[1]);
    expect(fills).toHaveLength(1);
    /* ⚠️ And the platform's own mark keeps none of it, which is what stops a
       hue added for one product leaking into the family. */
    expect(svgOf(<Mark of="one" size="crown" />)).not.toContain("oklch");
  });
});
