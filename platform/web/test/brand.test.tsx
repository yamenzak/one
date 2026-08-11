/**
 * THE MARK — one geometry, wherever it appears.
 *
 * ⚠️ A LOGO EXISTS TWICE BY NECESSITY: as a component, for everything React
 * renders, and as a FILE, for everything it cannot reach — a favicon, an email,
 * an app manifest, a marketing page. Two copies of a shape drift, and a logo
 * that is subtly different in the email from the one in the app is the kind of
 * thing nobody reports and everybody notices. So the two are compared.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MARK, Mark, Lockup } from "../src/brand/mark.js";

const file = readFileSync("assets/mark.svg", "utf8");
const rendered = renderToStaticMarkup(<Mark label="4DL" /> as never);

describe("the mark is one shape in two places", () => {
  it("draws the same geometry in the file and in the component", () => {
    for (const d of [MARK.rise, MARK.base, MARK.star]) {
      expect(file, "the file has drifted from the component").toContain(d);
      expect(rendered, "the component has drifted from its own source").toContain(d);
    }
    expect(file).toContain(`viewBox="${MARK.viewBox}"`);
    expect(rendered).toContain(`viewBox="${MARK.viewBox}"`);
    expect(file).toContain(`r="${MARK.degree.r}"`);
  });

  /*
    ⚠️ FLAT, AND CHECKED. The version this came from carried seven gradient
    definitions and a drop-shadow filter, none of which the rendered group even
    referenced — dead defs travelling with the mark into every consumer. A
    gradient in a logo is also the reason a logo cannot be USED: it cannot be one
    colour on a dark ground and another on a light one, it cannot be a favicon,
    and it cannot be printed in one ink.
  */
  it("carries no gradient, no filter and no colour of its own", () => {
    for (const source of [file, rendered]) {
      for (const banned of ["Gradient", "filter", "feDropShadow", "<defs"]) {
        expect(source, `${banned} in a mark that must work in one ink`).not.toContain(banned);
      }
      expect(source, "a literal colour is a mark that cannot follow its host").not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(source).toContain("currentColor");
    }
  });

  /*
    ⚠️ THE VIEWBOX IS THE TIGHT BOUNDING BOX, strokes included. Built-in padding
    is a logo that cannot be aligned to anything — every consumer removes it by
    eye, and no two remove the same amount.
  */
  it("is bounded tightly enough to be aligned against", () => {
    const [x, y, w, h] = MARK.viewBox.split(" ").map(Number) as [number, number, number, number];
    /* The rising stroke's own extent, plus its round cap. */
    expect(x).toBeLessThanOrEqual(94.85 - 32 / 2);
    expect(x + w).toBeGreaterThanOrEqual(MARK.degree.cx + MARK.degree.r + MARK.degree.width / 2);
    expect(y).toBeLessThanOrEqual(59.33 - 32 / 2);
    expect(y + h).toBeGreaterThanOrEqual(362 + 16 / 2);
  });

  /*
    ⚠️ A MARK WITH NO LABEL IS DECORATION, and a lockup's words are its label.
    Announcing the mark separately inside a lockup reads the brand twice.
  */
  it("names itself only when it stands alone", () => {
    expect(renderToStaticMarkup(<Mark /> as never)).toContain('aria-hidden="true"');
    expect(rendered).toContain('aria-label="4DL"');
    const lockup = renderToStaticMarkup(<Lockup word="ID" /> as never);
    expect(lockup).toContain('aria-label="4DL ID"');
    expect(lockup.split('aria-label').length - 1, "the brand is announced twice").toBe(1);
  });
});
