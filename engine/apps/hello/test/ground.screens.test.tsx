/**
 * THE TEST GROUND, HELD TO THE MANIFEST.
 *
 * ⚠️ A DECLARED SCREEN THAT DRAWS NOTHING IS THE FAILURE THIS CATCHES, and it is
 * invisible without a check: `AppSurface` answers an unmounted route with an
 * honest notice, so a screen nobody built looks like a screen somebody has not
 * finished. Rendering every declared route and asserting it produced something
 * is what makes "hello draws all of its screens" a fact rather than a claim.
 *
 * ⚠️ AND THE ROUTES COME FROM THE MANIFEST HERE TOO. A test with its own list is
 * a test that passes while the manifest grows a screen nobody drew.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HELLO } from "../src/index.js";
import { HELLO_ROUTES, HelloScreen } from "../src/screens/index.js";

const html = (route: string) => renderToStaticMarkup(<HelloScreen route={route} />);

describe("hello draws every screen it declares", () => {
  it("names the same routes the manifest does", () => {
    expect([...HELLO_ROUTES].sort()).toEqual((HELLO.screens ?? []).map((s) => s.route).sort());
    expect(HELLO_ROUTES.length).toBeGreaterThan(3);
  });

  /*
    ⚠️ A SCREEN ABOUT ONE THING IS NAMED AFTER THAT THING, NOT AFTER ITSELF. The
    nav calls it "A note" because a nav cannot know which; the page calls it by
    the note's own title, because that is what somebody arriving is looking at.
    So the rule below is "it drew a heading", and these are the routes whose
    heading is their subject — named here, with the word it must carry, rather
    than the check quietly accepting any non-empty render.
  */
  const SUBJECT: Readonly<Record<string, string>> = {
    "/note": "Rewrite the onboarding email",
  };

  it("renders something for every declared route", () => {
    for (const route of HELLO_ROUTES) {
      const out = html(route);
      /* ⚠️ NOT `length > 0` — an empty `<div>` passes that. A heading is what
         proves a screen drew rather than a wrapper. */
      const label = SUBJECT[route]
        ?? (HELLO.screens ?? []).find((s) => s.route === route)?.label
        ?? "";
      expect(out, route).toContain(label);
    }
  });

  /*
    ⚠️ AN UNRECOGNISED ROUTE FALLS TO THE FIRST SCREEN, NEVER TO NOTHING. A blank
    render is the same picture as a page that failed to load, and only one of
    those gets reported.
  */
  it("falls back rather than rendering a blank", () => {
    expect(html("/not-a-route")).toContain("Notes");
  });

  /*
    ⚠️ THE SAMPLE WORLD HAS THE AWKWARD CASES IN IT. A demo where everything is
    present and tidy renders every empty state and every refusal exactly never —
    so the gap in the series and the person who has not accepted are asserted
    here, because they are the reason the sample looks the way it does.
  */
  it("keeps the awkward cases the empty states need", async () => {
    const { WRITTEN, PEOPLE, NOTES } = await import("../src/screens/sample.js");
    expect(WRITTEN.some((p) => p.y === null), "a gap in the run").toBe(true);
    expect(PEOPLE.some((p) => p.pending), "somebody who has not accepted").toBe(true);
    expect(NOTES.some((n) => !n.published), "a note nobody published").toBe(true);
  });
});
