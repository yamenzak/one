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
import { readdirSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MARK, Mark, Lockup } from "../src/brand/mark.js";
import { FONTS, TYPE_CSS, fontFace } from "../src/brand/type.css.js";

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

/**
 * ⚠️ A MISSING WEBFONT IS THE QUIETEST FAILURE ON A PAGE. Nothing throws, nothing
 * logs, no request fails visibly — the browser draws the next face in the stack
 * and the page looks like a slightly worse version of itself. Every check here is
 * of something that would otherwise be found by somebody noticing, months later,
 * that the headings stopped looking right.
 */
describe("the faces we ship", () => {
  it("has the file it names, and it is a woff2", () => {
    for (const font of FONTS) {
      const bytes = readFileSync(font.file);
      /* wOF2 — read from the file rather than trusted from the extension. */
      expect(bytes.subarray(0, 4).toString("latin1"), `${font.file} is not a woff2`).toBe("wOF2");
      expect(bytes.byteLength, `${font.file} is large enough to be more than latin`).toBeLessThan(80_000);
    }
  });

  /*
    ⚠️ THE LICENCE TRAVELS WITH THE FILE. A font is somebody's work under terms,
    and the terms of every one of these require the notice to be distributed with
    it. A licence held somewhere else is a licence that is not there when the
    directory is copied into an app.
  */
  it("keeps a licence beside every file", () => {
    const beside = readdirSync("assets/fonts");
    expect(beside.filter((f) => f.endsWith(".woff2")).length).toBe(FONTS.length);
    expect(beside.filter((f) => /^OFL/.test(f)).length, "a font with no notice").toBe(FONTS.length);
  });

  /*
    ⚠️ THE FAMILY NAME IS THE JOIN, and it is written in three places: the
    @font-face, the token, and whatever the file's own name table says. Only the
    first two are ours; getting them out of step is a page set entirely in the
    fallback, silently.
  */
  it("declares every family it asks for", () => {
    for (const font of FONTS) {
      const face = fontFace(font, "x.woff2");
      expect(face).toContain(`font-family: '${font.family}'`);
      expect(face, "a blocking face paints holes where the words go").toContain("swap");
      expect(TYPE_CSS, `${font.family} is shipped and never asked for`).toContain(`'${font.family}'`);
    }
  });
});
