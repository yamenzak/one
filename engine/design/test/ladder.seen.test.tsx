/**
 * THE TYPE LADDER, MEASURED IN A BROWSER, BECAUSE IT HAS DIED TWICE IN SILENCE.
 *
 * ⚠️ THE STATIC GUARD CANNOT SEE WHAT SHIPPED, AND THAT IS NOT A GAP TO WRITE A
 * BIGGER STATIC GUARD OVER. `scripts/type.test.mjs` reads `type.ts` and answers
 * "is every size a rung of one ladder" — which it was, both times the product
 * rendered at ONE size. The first draft built the class at runtime
 * (`text-[${step(n)}]`) and Tailwind, which reads source text and never runs it,
 * emitted nothing. The second wrote `text-[var(--rank-page)]` in full and
 * Tailwind emitted it as an INK, because a bare variable could be either and
 * colour is what it guesses. Arithmetic correct, TypeScript green, every guard
 * green, every heading inheriting.
 *
 * ⚠️ SO THE QUESTION HERE IS THE ONLY ONE THAT WOULD HAVE CAUGHT EITHER: what
 * size did the browser actually use. It is asked of the ROLES, which is where a
 * screen gets its type from, and the answer is compared against `step` — the
 * same arithmetic the roles are built out of, so the check has no second ladder
 * in it and survives the ratio moving.
 *
 * ⚠️ AND THE NEGATIVE CONTROL IS THE BUG ITSELF, spelled out. A geometry check
 * that has only ever seen correct layout is a check nobody knows is looking —
 * see `rhythm.seen.test.tsx` — so the missing `length:` is rendered beside the
 * real thing and asserted NOT to size anything.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RANK, ROOT, ROLES, TYPE, glyphOf, step, type Rank, type Role } from "../src/index.js";
/* ⚠️ `ICON` IS NOT PUBLISHED, and that is the point of it — a caller picking an
   icon size is the second ladder this file exists about. Read from the source. */
import { ICON } from "../src/tokens/metrics.js";
import { PHONE, html, pageFor, stylesheet } from "../src/measure/index.js";

let browser: Browser;
let css: string;
beforeAll(async () => { css = stylesheet(); browser = await chromium.launch(); }, 120_000);
afterAll(async () => { await browser?.close(); });

/** ⚠️ `step` and nothing else — a table here would be the second ladder. */
const pxAt = (rank: Rank): number => Number((parseFloat(step(RANK[rank])) * ROOT).toFixed(2));

/**
 * ⚠️ WHICH RANK A ROLE ASKED FOR, READ OFF THE CLASS IT SHIPS. `at()` is private
 * to `type.ts` on purpose, so the class string is the only public evidence of
 * what a role wanted — which is also exactly what the browser sees.
 */
const rankOf = (role: Role): Rank | null => {
  const m = /(?:^|\s)text-\[length:var\(--rank-(\w+)\)\]/.exec(TYPE[role]);
  return m ? (m[1] as Rank) : null;
};

const sized = ROLES.filter((role) => rankOf(role) !== null);

const measure = async (
  node: React.ReactNode,
  /** ⚠️ What to read — the marked element itself, or a mark inside it. */
  within = "",
): Promise<Record<string, number>> => {
  const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
  try {
    await page.setContent(pageFor(html(node), css));
    return await page.evaluate((inner) => {
      const out: Record<string, number> = {};
      for (const el of Array.from(document.querySelectorAll("[data-role]"))) {
        const found = inner ? el.querySelector(inner) : null;
        out[el.getAttribute("data-role")!] = found
          ? Math.round(found.getBoundingClientRect().width)
          : parseFloat(getComputedStyle(el).fontSize);
      }
      return out;
    }, within);
  } finally { await page.close(); }
};

/* -------------------------------------------------------------- specimen --- */

/**
 * ⚠️ ON A BARE ELEMENT, NEVER INSIDE A COMPONENT. What is being asked is whether
 * the ROLE carries a size to the page; a card or a row would bring its own, and
 * a pass would then mean "something on the way set one".
 */
const roles = (
  <div>
    {sized.map((role) => (
      <p key={role} data-role={role} className={TYPE[role]}>Ag</p>
    ))}
  </div>
);

/* ---------------------------------------------------------------- it does --- */

describe("the ladder reaches the page", () => {
  it("every role computes to the rung it asked for", async () => {
    const seen = await measure(roles);
    const wrong = sized
      .map((role) => ({ role, want: pxAt(rankOf(role)!), got: seen[role] }))
      .filter(({ want, got }) => got === undefined || Math.abs(got - want) > 0.5);
    expect(wrong).toEqual([]);
  });

  it("no two ranks land on the same size", async () => {
    const seen = await measure(roles);
    /* ⚠️ THE SYMPTOM OF BOTH FAILURES, STATED WITHOUT REFERENCE TO A NUMBER.
       When nothing applied, every role measured 16 and this collapses to one. */
    const ranks = new Set(sized.map((role) => rankOf(role)!));
    const sizes = new Set([...ranks].map((rank) =>
      sized.filter((role) => rankOf(role) === rank).map((role) => seen[role])[0]));
    expect(sizes.size).toBe(ranks.size);
  });

  it("the roles descend exactly as their ranks do", async () => {
    const seen = await measure(roles);
    const byRank = [...sized].sort((a, b) => RANK[rankOf(a)!] - RANK[rankOf(b)!]);
    const sizes = byRank.map((role) => seen[role]!);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });
});

/* ------------------------------------------------------- and it does bite --- */

describe("the negative controls", () => {
  it("sees the hint dropped — a bare variable is an ink, not a size", async () => {
    const seen = await measure(
      <div>
        <p data-role="right" className="text-[length:var(--rank-page)]">Ag</p>
        {/* ⚠️ THE SECOND DRAFT, VERBATIM. It compiles, it is emitted, and what it
            sets is `color: 1.953rem` — which every browser discards in silence. */}
        <p data-role="wrong" className="text-[var(--rank-page)]">Ag</p>
      </div>,
    );
    expect(seen.right).toBeCloseTo(pxAt("page"), 1);
    expect(seen.wrong).not.toBeCloseTo(pxAt("page"), 1);
  });

  it("sees a class built at runtime — the first draft, which is emitted nowhere", async () => {
    const rank: Rank = "page";
    const seen = await measure(
      /* ⚠️ THE STRING IS CORRECT AND THE SCANNER NEVER READ IT, so there is no
         rule behind it at all and the paragraph inherits. */
      <p data-role="built" className={`text-[${step(RANK[rank])}]`}>Ag</p>,
    );
    expect(seen.built).not.toBeCloseTo(pxAt("page"), 1);
  });
});

/* ------------------------------------------------------------- the marks --- */

/**
 * AND A GLYPH IS ON THE SAME LADDER, WHICH IS THE HALF THAT WAS INERT.
 *
 * ⚠️ `ICON` PUBLISHES SIX SIZES AND FOR AS LONG AS IT HAS EXISTED EVERY ONE OF
 * THEM REACHED NOTHING. The rule was `[style*="--icon"] > svg` and `glyphOf`
 * returns its mark inside a span, so the child combinator matched no element in
 * the product — every glyph drew at HeroUI's own 20px, on every screen, while
 * the boxes around them carried correct values from a derived ladder. Nothing
 * static can see it: the variable is set, the number is a rung, and only a
 * rendered mark knows how wide it came out.
 */
describe("a mark takes the rung its box asks for", () => {
  const asked = [ICON.row, ICON.quick, ICON.poster];

  it("draws at the size on the box", async () => {
    const seen = await measure(
      <div>
        {asked.map((px) => (
          <span key={px} data-role={`icon-${px}`} style={{ ["--icon" as string]: `${px}px` }}>
            {glyphOf("note")}
          </span>
        ))}
      </div>,
      "svg",
    );
    expect(asked.map((px) => seen[`icon-${px}`])).toEqual(asked);
  });

  it("sees the child combinator that made the whole ladder inert", async () => {
    const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
    /* ⚠️ THE RULE AS IT WAS, OVER THE TREE `glyphOf` ACTUALLY PRODUCES. */
    await page.setContent(pageFor(
      `<span style="--icon:39px"><span><svg width="20" height="20"></svg></span></span>`,
      `[style*="--icon"] > svg { width: var(--icon); height: var(--icon); }`));
    const wide = await page.evaluate(() =>
      Math.round(document.querySelector("svg")!.getBoundingClientRect().width));
    await page.close();
    expect(wide).not.toBe(39);
  });
});
