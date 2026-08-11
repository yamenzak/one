/**
 * THE SAMPLE APP COVERS THE LANGUAGE — checked against the MARKUP, not a list.
 *
 * ⚠️ THIS REPLACES A HAND-MAINTAINED COVERAGE LIST, and the difference is the
 * whole reason the sample app could stop being a grid. The old check read an
 * array each specimen declared itself into (`of: "button"`), so it proved
 * somebody had written the word — not that a button was rendered. Here the
 * screens are RENDERED and the `data-one` attributes are read back out, so
 * coverage is a fact about the output.
 *
 * ⚠️ WHICH IS WHAT MAKES A REAL PRODUCT SAFE TO SHOW. A demo screen normally
 * hides every component nobody got round to building: it looks finished, it
 * agrees to nothing, and the gap is invisible. This one fails instead — a
 * registered component that no screen uses is a test failure the day it is
 * registered.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { COMPONENTS, RENDERER_OWNS, navProblems } from "../src/registry.js";
import { SCREENS, OVERLAYS, DESTINATIONS } from "../reference/app.js";

const markup = [...SCREENS.map((s) => s.node), ...OVERLAYS.map((o) => o.node)]
  .map((n) => renderToStaticMarkup(n as never))
  .join("\n");

const drawn = new Set([...markup.matchAll(/data-one="([a-z-]+)"/g)].map((m) => m[1]!));

describe("the sample app is the whole language", () => {
  it("renders every registered component somewhere in the product", () => {
    /*
      ⚠️ THE SHELL AND ITS NAVIGATION ARE THE ARTIFACT'S, NOT A SCREEN'S. A page
      does not render its own shell — that is the boundary — so they are wrapped
      around these screens by whoever is showing them, and the artifact's own
      test covers that. Everything else must be inside a screen.
    */
    const WRAPPED_AROUND_THE_SCREENS = new Set(["shell", "nav"]);
    const missing = COMPONENTS.map((c) => c.id).filter((id) => !drawn.has(id) && !WRAPPED_AROUND_THE_SCREENS.has(id));
    expect(missing, "registered and no screen uses it").toEqual([]);
  });

  /*
    ⚠️ AND EVERY PART BELONGS TO A COMPONENT THAT EXISTS. This is the reverse
    direction, and it is deliberately the WEAKER of the two questions that could
    be asked here. The strong one — "is anything rendered that should have been
    registered as a component" — cannot be answered by a test: whether
    `overlay-header` is a part or a component is a judgement, and the registry is
    where that judgement is recorded. Asking it mechanically means a hand-kept
    list of every bare part name, which grows on every commit, protects nothing,
    and is precisely the false comfort this package keeps finding in its own
    guards. `audit.test.tsx` covers the mechanical half — every part is drawn,
    every rule is reached — and this covers the one structural claim left: a
    FAMILY of parts with no component at its root is an unregistered component
    wearing an established one's clothes.
  */
  it("roots every part in a component the registry declares", () => {
    const declared = COMPONENTS.map((c) => c.id);
    for (const part of drawn) {
      if (!part.includes("-") || declared.includes(part)) continue;
      const rooted = declared.some((id) => part.startsWith(`${id}-`)) || part.startsWith("confirm-");
      expect(rooted, `${part} is a part of nothing the registry declares`).toBe(true);
    }
  });

  /*
    ⚠️ THE REFUSALS ARE IN THE PRODUCT, NOT IN A ROW OF THEMSELVES. `locked`,
    `disabled`, `busy`, `invalid` and a container that failed are what a product
    ships most and reviews least, and they are also the states whose COPY matters
    most — which can only be judged where the state occurs.
  */
  it("shows every state that only appears when something is wrong", () => {
    for (const shape of [
      `data-state="busy"`, `data-state="locked"`, `data-state="disabled"`,
      `data-invalid`, `data-state="unknown"`, `data-state="empty"`,
      `data-state="error"`, `data-state="partial"`,
    ]) {
      expect(markup, `no screen shows ${shape}`).toContain(shape);
    }
  });

  /*
    ⚠️ AND A REFUSAL SAYS WHY, IN THE PRODUCT'S OWN WORDS. A control that refuses
    without a reason is the most common product failure there is; the components
    make the reason mandatory, and this checks the sample app actually WROTE one
    rather than passing the shortest string that satisfies the type.
  */
  it("gives every refusal a reason somebody wrote", () => {
    const reasons = [...markup.matchAll(/data-one="reason"[^>]*>([^<]+)</g)].map((m) => m[1]!);
    expect(reasons.length, "no refusal anywhere in the product").toBeGreaterThan(1);
    for (const r of reasons) expect(r.length, `"${r}" is not an explanation`).toBeGreaterThan(20);
  });

  /* ⚠️ Every surface the boundary FORBIDS an app to build is one the app shows. */
  it("uses every surface an app is forbidden to build for itself", () => {
    const satisfiedBy: Record<string, string> = {
      dialog: "overlay", sheet: "overlay", drawer: "overlay", popover: "overlay",
      confirm: "overlay", tabs: "segmented", shell: "page", nav: "page",
    };
    const missing = RENDERER_OWNS.filter((id) => !drawn.has(satisfiedBy[id] ?? id));
    expect(missing, "forbidden to an app and used by nobody").toEqual([]);
  });

  /*
    ⚠️ AND THE SAMPLE APP OBEYS ITS OWN NAVIGATION RULE. Three to five
    destinations, each with a label. It would be a strange product to hold up as
    the reference while breaking the one check the registry runs on every app.
  */
  it("navigates the way the language says an app must", () => {
    expect(navProblems(DESTINATIONS)).toEqual([]);
    for (const s of SCREENS) {
      expect(DESTINATIONS.map((d) => d.id), `${s.id} answers to no destination`).toContain(s.at);
    }
  });

  /*
    ⚠️ EVERY SCREEN SAYS WHICH ARCHETYPE IT IS AND WHY. A sample app whose
    screens have no stated reason is a picture book: the next person copies by
    appearance, which is exactly the decision the archetypes exist to have made
    already.
  */
  it("states the rule behind every screen", () => {
    const archetypes = new Set([...markup.matchAll(/data-archetype="([a-z-]+)"/g)].map((m) => m[1]!));
    expect([...archetypes].sort(), "an archetype no screen demonstrates").toEqual(["crown", "feed", "identity", "title", "topic"]);
    for (const s of SCREENS) expect(s.note.length, `${s.id} has no stated rule`).toBeGreaterThan(80);
  });
});
