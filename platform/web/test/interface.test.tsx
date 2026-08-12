/**
 * THE DESIGN LANGUAGE, ENFORCED — the rules that no rendering test can see.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE FIVE CAREFUL SCREENS ADDED UP TO AN INCOHERENT ONE.
 * Every avatar in the account centre was individually defensible and there were
 * five of them: a circle at 44 and another at 62, an 11-pixel radius beside a
 * 14-pixel one, two badge offsets, an icon well that was a sixth. Every link was a
 * bare anchor in browser blue on a surface where every control has a spring. Every
 * capsule was a chip, a pill or a tag, and none of the three meant anything the
 * others did not. Nothing failed, because nothing here is a behaviour — a screen
 * with the wrong radius renders, passes, and ships.
 *
 * ⚠️ SO THE RULES ARE STRUCTURAL AND THEY READ THE SOURCE. A component test can
 * only prove that the component somebody used behaves; what goes wrong at this
 * scale is somebody NOT using it — a hand-written tile, a hand-drawn logo, a bare
 * anchor, a colour typed at the point of use. Those are visible in the text of the
 * files and nowhere else.
 *
 * ⚠️ AND EVERY RULE BELOW HAS A DEFECT BEHIND IT. Not one is a guess about what
 * might go wrong: each names the thing that already shipped. A guard with no defect
 * behind it is a guess, and the last attempt at this had ninety of those.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Away } from "../src/away.js";
import { LOGOS } from "../src/brand/logos.js";
import { UI_CSS } from "../src/ui.css.js";
import { ACCOUNT_CSS } from "../src/account/account.css.js";

/** Every source file in this package, by the path it is reached at. */
const sources = readdirSync("src", { recursive: true, encoding: "utf8" })
  .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
  .map((f) => [f, readFileSync(`src/${f}`, "utf8")] as const);

/** The same, with comments removed — a rule's own paragraph would match it. */
const code = sources.map(([f, src]) => [f, src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")] as const);

/** The shared vocabulary, and the one screen-local sheet beside it. */
const sheets: readonly (readonly [string, string])[] = [
  ["ui.css.ts", UI_CSS], ["account/account.css.ts", ACCOUNT_CSS],
].map(([f, css]) => [f!, css!.replace(/\/\*[\s\S]*?\*\//g, "")] as const);
const declarations = sheets[0]![1];

it("has sources to read", () => {
  expect(sources.length).toBeGreaterThan(12);
});

/* ------------------------------------------------------------------ marks --- */

describe("one tile draws every face, logo and symbol", () => {
  /*
    ⚠️ THE PICTURE COMPONENT IS REACHED FROM ONE FILE. Radix's avatar is what
    holds the letter until the image decodes; a second screen importing it is a
    second screen deciding how big a face is and what shape it has, which is
    exactly how there came to be five.
  */
  it("imports the picture primitive in one place", () => {
    const importers = code.filter(([, src]) => src.includes("react-avatar")).map(([f]) => f);
    expect(importers, "a face is a Mark — see mark.tsx for why there is only one")
      .toEqual(["mark.tsx"]);
  });

  /*
    ⚠️ AND DRAWING HAPPENS WHERE DRAWING LIVES. A path written at a screen is a
    glyph nobody chose the stroke weight of — and, on this surface, it is worse
    than that: four company logos were drawn from memory, which is a trademark
    reproduced wrongly on the one screen that names the company it belongs to.
  */
  it("draws a path only in the icon set, the brand mark and the tile", () => {
    const drawing = code.filter(([, src]) => /<path\b/.test(src)).map(([f]) => f).sort();
    expect(drawing, "a hand-drawn path outside the three files that draw")
      .toEqual(["brand/mark.tsx", "icon.tsx", "mark.tsx"]);
  });

  /*
    ⚠️ A MARK'S GEOMETRY IS DERIVED FROM ITS SIZE AND NEVER WRITTEN. The size is
    one number on the element; the radius, the letter, the glyph, the badge and
    its ring all come out of it. Written in pixels it drifts the first time
    somebody adds a size, which is what an 11-pixel radius on one 44-pixel tile
    and a 14 on another already were.
  */
  it("writes no pixel length into a mark", () => {
    for (const [selector, body] of rulesOf(declarations)) {
      if (!/^\.mark\b|^\.mark-/.test(selector.trim())) continue;
      for (const [length] of body.matchAll(/(?<![\w-])\d+(?:\.\d+)?px\b/g)) {
        expect.fail(`${selector.trim()} writes ${length} — derive it from var(--mark)`);
      }
    }
  });

  /*
    ⚠️ AND THE SIZE IS SET IN ONE PLACE. `--mark` is the component's own contract
    with the sheet; a screen setting it is a screen with a fourth size in it.
  */
  it("sets the size only from the component", () => {
    const setters = code.filter(([, src]) => src.includes('"--mark"')).map(([f]) => f);
    expect(setters, "a screen sizing a mark by hand — the scale is sm, md, lg")
      .toEqual(["mark.tsx"]);
  });
});

/* ------------------------------------------------------------------ logos --- */

describe("a logo is the company's own, and only where one is declared", () => {
  /** Every `mark:` a manifest anywhere in the platform declares. */
  const declared = new Set(
    readdirSync("..", { recursive: true, encoding: "utf8" })
      .filter((f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.includes("node_modules") && !f.includes("/dist/"))
      .flatMap((f) => [...readFileSync(`../${f}`, "utf8").matchAll(/\bmark:\s*"([a-z0-9-]+)"/g)])
      .map((m) => m[1]!),
  );

  it("finds the declarations", () => {
    expect(declared.size).toBeGreaterThan(1);
  });

  /*
    ⚠️ A NAME NOTHING DRAWS IS A ROW THAT LOOKS FINE WITH THE WRONG THING IN IT.
    The fallback is total by design — an unknown name renders the company's
    initial — so a typo is invisible unless somebody has seen the right one.
  */
  it("draws every mark a deployment declares", () => {
    for (const name of declared) {
      expect(Object.keys(LOGOS), `${name} is declared and nothing draws it`).toContain(name);
    }
  });

  /*
    ⚠️ AND THE OTHER DIRECTION, WHICH IS WEIGHT RATHER THAN A DEFECT. Every path
    here is committed source shipped to a browser; one nothing declares is a
    company we drew for a screen that does not exist.
  */
  it("draws nothing nobody declares", () => {
    for (const name of Object.keys(LOGOS)) {
      expect([...declared], `${name} is drawn and nothing declares it — remove it from dev/logos.mjs`)
        .toContain(name);
    }
  });
});

/* ------------------------------------------------------------------ links --- */

describe("a link out is a component, and it says it leaves", () => {
  /*
    ⚠️ AN ANCHOR IS THE ONE ELEMENT THAT LOOKS FINISHED WITH NO STYLING AT ALL,
    which is why every link in the account centre was browser blue with a browser
    underline, no press and no motion, on a surface where every other control has
    a tone and a spring.
  */
  it("writes a bare anchor nowhere", () => {
    const anchors = code.filter(([, src]) => /<a\s/.test(src)).map(([f]) => f).sort();
    expect(anchors, "use Away for prose and Item's away for a row").toEqual(["away.tsx", "list.tsx"]);
  });

  /*
    ⚠️ AND IT NEVER LEAVES WITHOUT SAYING SO. Rendering an operative document's
    address as more of this page is how somebody agrees to a summary believing
    they read the contract, so the glyph is not decoration — it is the difference
    between a link and a heading.
  */
  it("carries the outward mark and hands nothing to the destination", () => {
    const html = renderToStaticMarkup(<Away href="https://example.test">Their terms</Away> as never);
    expect(html).toContain(`data-icon="outward"`);
    expect(html).toContain(`rel="noreferrer"`);
    expect(html).toContain(`target="_blank"`);
  });

  /*
    ⚠️ AND AN ADDRESS IS NOT A NEW TAB. A mailto opens somebody's mail client;
    through the web treatment it promised a page that never arrives — and the
    outward mark, whose entire value is that it is honest, was the part that lied.
  */
  it("promises mail rather than a page when the address is one", () => {
    const html = renderToStaticMarkup(<Away href="mailto:legal@example.test">legal@example.test</Away> as never);
    expect(html).toContain(`data-icon="letter"`);
    expect(html).not.toContain("_blank");
  });
});

/* --------------------------------------------------------------- capsules --- */

describe("there are two capsules and a colour is never chosen at a screen", () => {
  /*
    ⚠️ THE TAG IS GONE AND MUST STAY GONE. It was a data category rendered as a
    capsule — seventeen possible values, three or four to a row, in a colour
    picked per row. A set of things is a sentence or a count; a reader parsing a
    stack of grey lozenges is doing the work the screen was supposed to do.
  */
  it("declares no third capsule", () => {
    for (const name of ["tag", "badge-", "lozenge", "label-pill"]) {
      expect(declarations, `${name} is a capsule that is not a chip or a pill`)
        .not.toMatch(new RegExp(`\\.${name}[a-z-]*\\s*[,{]`));
    }
  });

  /*
    ⚠️ A PILL TAKES THE TONE SCALE AND NOTHING ELSE. Four states, named for what
    they mean — which is the rule that was missing when a column of capsules came
    to look arbitrary: not too many colours, no answer to "what does this one
    mean".
  */
  it("colours a pill only by tone", () => {
    const tones = new Set(
      [...declarations.matchAll(/\.pill\[data-tone='([a-z]+)'\]/g)].map((m) => m[1]!),
    );
    expect([...tones].sort()).toEqual(["alarm", "ok", "warn"]);
    for (const [selector, body] of rulesOf(declarations)) {
      if (!/^\.pill\b/.test(selector.trim())) continue;
      expect(body, `${selector.trim()} paints itself — take --warn, --alarm or --ok`)
        .not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
    }
  });

  /*
    ⚠️ AND A PILL IS NOT A CONTROL. No border, no press, no shadow: it is a fact
    about the row, and anything more makes a list of facts look like a row of
    buttons — which is what a bordered capsule beside a real button did.
  */
  it("keeps a pill from looking pressable", () => {
    for (const [selector, body] of rulesOf(declarations)) {
      if (!/^\.pill\b/.test(selector.trim())) continue;
      expect(body, `${selector.trim()} looks like a control`).not.toMatch(/box-shadow|border:|cursor:/);
    }
  });
});

/* ------------------------------------------------------------------- rows --- */

describe("a row is one line of words, whatever it is about", () => {
  /*
    ⚠️ A ROW'S DETAIL IS ONE LINE, AND IT IS THE SHEET THAT GUARANTEES IT. A
    company's declared role is a sentence written for a record; rendered as a
    row's second line it wrapped to five and clipped the name above it. The
    declaration says four words, and this is the other half — because a payload
    somebody else composes will eventually arrive longer than it promised.
  */
  it("holds a marked row's detail to one line", () => {
    const rule = rulesOf(declarations).find(([s]) => s.includes(".item-detail") && s.includes(".mark"));
    expect(rule?.[1], "a marked row's detail may wrap — a paragraph in a list").toMatch(/text-overflow:\s*ellipsis/);
    expect(rule?.[1]).toMatch(/white-space:\s*nowrap/);
  });

  /*
    ⚠️ AND THERE IS ONE LABEL STYLE. Small tracked capitals is the device an
    interface reaches for when a label has to LOOK like something — and this one
    already has a label: quiet ink, sentence case, smaller. Two of them had
    appeared, one of them in amber on the screen somebody is asked to read most
    carefully.
  */
  it("sets no label in small capitals", () => {
    for (const [file, css] of sheets) {
      expect(css, `${file} tracks a label into capitals — the label style is quiet ink, sentence case`)
        .not.toMatch(/text-transform:\s*uppercase/);
    }
  });
});

/* ------------------------------------------------------------------ focus --- */

describe("there is one focus ring", () => {
  /*
    ⚠️ IT WAS WRITTEN OUT FOURTEEN TIMES. Two pixels of accent, by hand, on every
    control — which is the same failure as fourteen durations: not a ring anybody
    chose, just the absence of a decision, and the first person to want a softer
    one has fourteen places to change. What stays per control is the OFFSET,
    because a ring inside a row and a ring around a pill are different shapes.
  */
  it("declares the ring once and never writes another", () => {
    for (const [file, css] of sheets) {
      for (const [decl] of css.matchAll(/outline:[^;]+;/g)) {
        if (/var\(--ring\)|outline:\s*none/.test(decl)) continue;
        expect.fail(`${file} draws a focus ring of its own: ${decl.trim()}`);
      }
    }
  });

  /*
    ⚠️ AND EVERY CONTROL HAS ONE. A control that cannot be seen when it is focused
    is one somebody navigating by keyboard has lost — and it is invisible to
    everybody testing with a pointer, which is everybody.
  */
  it("gives every pressable thing a ring", () => {
    const pressable = new Set(
      [...declarations.matchAll(/\.([a-z][a-z0-9-]*)[^{}]*\{[^{}]*cursor:\s*pointer/g)].map((m) => m[1]!),
    );
    const rung = new Set(
      [...declarations.matchAll(/\.([a-z][a-z0-9-]*)[^{}]*:focus(?:-visible|-within)?[^{}]*\{[^{}]*outline/g)]
        .map((m) => m[1]!),
    );
    /* A label wrapping a control, and a row that is a target for the control
       inside it — the ring belongs to the thing that takes focus. */
    const bearer: Readonly<Record<string, string>> = {
      "switch-row": "switch", "check": "check-box", "portrait": "portrait",
      "field-box": "field-box", "ask": "share-rung",
    };
    for (const c of pressable) {
      if (rung.has(c) || rung.has(bearer[c] ?? "")) continue;
      expect.fail(`.${c} is pressable and has no focus ring`);
    }
  });
});

/* ------------------------------------------------------------------ words --- */

describe("a control is set in the same words as the page", () => {
  /*
    ⚠️ THE FONT SHORTHAND RESETS THE WORD SPACE, AND EVERY ROW IS A CONTROL. The
    text face sets wide letters against a narrow word space, so the platform
    corrects it once on the body — and every `font: inherit` on a button, a field
    or a row silently undid that correction inside a more specific block. Measured
    before the fix: 1.28px on a paragraph, 0 on every row title and every row
    detail, which is most of the words in the account centre. Nothing renders
    wrongly; it just reads as bad rendering, on every screen, forever.
  */
  it("restates the word space wherever it takes the page's font", () => {
    for (const [selector, body] of rulesOf(declarations)) {
      if (!/font:\s*inherit/.test(body)) continue;
      expect(body, `${selector.trim()} takes the font and loses the word space`)
        .toMatch(/word-spacing:/);
    }
  });
});

/* ------------------------------------------------------------------ scale --- */

/**
 * ⚠️ SPLIT ON THE BRACE RATHER THAN PARSED. Everything in these sheets is one
 * level deep except the keyframes and the media query, and both are dropped —
 * a rule inside them is timing or a theme, and neither is what is being read here.
 */
function rulesOf(css: string): readonly (readonly [string, string])[] {
  const flat = css
    .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, "")
    .replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, "");
  return [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1]!, m[2]!] as const);
}
