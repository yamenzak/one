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
