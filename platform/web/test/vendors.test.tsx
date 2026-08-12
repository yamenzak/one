/**
 * THE MARKS, HELD TO THE DECLARATIONS THAT NAME THEM.
 *
 * ⚠️ A DECLARED MARK NOBODY DRAWS IS A LOGO THAT SILENTLY BECOMES A LETTER. The
 * fallback is deliberate and total — an unknown name renders the company's
 * initial, so nothing ever fails — which is exactly why a typo in a manifest
 * would never be noticed: the row looks fine, the wrong thing is in it, and the
 * only way to find out is to have seen the right one.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEPLOYMENT } from "@one/deployment";
import { DRAWN_MARKS, Vendor } from "../src/brand/vendors.js";

describe("somebody else's mark", () => {
  it("draws every mark the deployment declares", () => {
    for (const sub of DEPLOYMENT.subprocessors) {
      if (!sub.mark) continue;
      expect(DRAWN_MARKS, `${sub.id} names a mark nothing draws`).toContain(sub.mark);
    }
  });

  /* ⚠️ AND A COMPANY WITH NO DRAWN MARK STILL HAS A FACE. Never a generic drawn
     office block: beside three real logos that reads as a company nobody could
     identify, where a letter reads as one whose mark we simply do not draw. */
  it("falls back to the initial for a name it does not draw", () => {
    const html = renderToStaticMarkup(<Vendor mark="nobody-draws-this" name="Acme Limited" />);
    expect(html).toContain(">A<");
    expect(html).not.toContain("<svg");
  });

  /* ⚠️ IT IS HIDDEN FROM A READER, ALWAYS. The full legal name is on the row
     beside it, so a reader hearing "logo, Cloudflare, Inc." is told the same
     thing twice — and the mark carries nothing the words do not. */
  it("says nothing to a screen reader", () => {
    expect(renderToStaticMarkup(<Vendor mark="cloudflare" name="Cloudflare, Inc." />))
      .toContain(`aria-hidden="true"`);
  });
});
