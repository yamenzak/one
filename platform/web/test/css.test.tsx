/**
 * THE STYLESHEET, HELD TO THE MARKUP — and to itself.
 *
 * ⚠️ EVERY CHECK IN HERE EXISTS BECAUSE A DEFECT HAPPENED, and none of them was
 * written in advance. That is the whole method: a rule with no defect behind it
 * is a guess about what will go wrong, and the last attempt at this had ninety
 * such guesses and still shipped a card with no padding.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ACCOUNT_CSS } from "../src/account/home.css.js";
import { AccountHome, type AccountHomeProps } from "../src/account/home.js";

const props: AccountHomeProps = {
  person: { name: "Nadia Haddad", email: "nadia@example.com" },
  workspaces: [
    { tenantId: "t1", slug: "a", name: "A", product: "kova", role: "Owner" },
    { tenantId: "t2", slug: "b", name: "B", product: "scena", role: "Coach", standing: { label: "Payment failed", urgent: true } },
  ],
  onGo: () => undefined,
  onClose: () => undefined,
};

const markupFor = (over: Partial<AccountHomeProps> = {}) =>
  renderToStaticMarkup(<AccountHome {...props} {...over} /> as never);

/** Every class the markup actually puts on an element, across every state. */
const used = new Set(
  [markupFor(), markupFor({ workspaces: null }), markupFor({ workspaces: [] }), markupFor({ person: { email: "x@y.com" } })]
    .flatMap((html) => [...html.matchAll(/class="([^"]+)"/g)])
    .flatMap((m) => m[1]!.split(/\s+/))
    .filter(Boolean),
);

/* Comments state the rules and would match them. Only declarations are read. */
const rules = ACCOUNT_CSS.replace(/\/\*[\s\S]*?\*\//g, "");

describe("the stylesheet and the markup are the same set of names", () => {
  /*
    ⚠️ THIS IS THE ONE THAT ALREADY BIT. `.ghost` was the quiet button AND the
    loading placeholder — two unrelated things, one flat namespace, and the
    rules simply merged: every placeholder bar inherited a 40px minimum height, a
    border and a pill radius, so the loading state rendered as a stack of empty
    outlined capsules. Nothing failed. Nothing could have: both rules were valid
    CSS and the markup was valid HTML.

    ⚠️ A BASE RULE IS THE ONE THAT MAY NOT REPEAT. `.x:hover`, `.x.y` and
    `.a .x` are the same thing being refined; a second bare `.x { … }` is a
    second thing wearing its name.
  */
  it("declares no class twice", () => {
    const bases = [...rules.matchAll(/(?:^|\})\s*\.([a-z][a-z0-9-]*)\s*\{/g)].map((m) => m[1]!);
    const seen = new Set<string>();
    const twice = bases.filter((c) => (seen.has(c) ? true : (seen.add(c), false)));
    expect(twice, "declared twice — two things sharing one name, silently merged").toEqual([]);
  });

  /*
    ⚠️ AND THE TWO SETS MATCH. A class in the markup that the sheet never
    mentions renders as a bare box; a class in the sheet that nothing wears is an
    affordance somebody designed, wrote and believed shipped. Both are invisible
    to a test that only asks what the markup MEANS.
  */
  it("styles every class the markup wears", () => {
    for (const c of used) {
      expect(rules, `${c} is worn and never styled`).toMatch(new RegExp(`\\.${c}\\b`));
    }
  });

  it("wears every class the sheet styles", () => {
    const styled = new Set([...rules.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]!));
    for (const c of styled) {
      expect(used, `${c} is styled and nothing wears it`).toContain(c);
    }
  });

  /*
    ⚠️ BOTH THEMES, IN ALL THREE SCOPINGS. The viewer has three states: an
    explicit `data-theme`, and the default setting which stamps nothing — so a
    colour defined only inside the media query does not apply when the root
    carries an explicit choice, and one defined only under the attribute does not
    apply to the default. Getting this wrong renders one theme's text on the
    other theme's ground, and it is the single most common way a page ships
    unreadable.
  */
  it("defines every colour in all three theme scopings", () => {
    const block = (selector: string) => rules.split(selector)[1]?.split("}")[0] ?? "";
    const light = [...block(":root {").matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]!);
    expect(light.length).toBeGreaterThan(8);
    const media = block(":root:not([data-theme='light']) {");
    const explicit = block(":root[data-theme='dark'] {");
    /* Only the colours invert. A radius and a gap are the same in both. */
    const colours = light.filter((n) => !/radius|gap|pad/.test(n));
    for (const name of colours) {
      expect(media, `${name} has no dark value under prefers-color-scheme`).toContain(`${name}:`);
      expect(explicit, `${name} has no dark value under an explicit choice`).toContain(`${name}:`);
    }
  });
});
