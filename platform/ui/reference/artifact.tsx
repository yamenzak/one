/**
 * THE LANGUAGE, AS A PAGE — tokens, then every component in every state.
 *
 * ⚠️ NOT SHIPPED CODE, AND NOTHING IN `src` MAY IMPORT IT. It renders `@one/ui`'s
 * real components through `@one/ui`'s real stylesheet, so a defect in the picture
 * is a defect in the product.
 *
 * ⚠️ IT REPLACED FIVE DEMO SCREENS, DELIBERATELY. Demo screens photograph a
 * product that does not exist: they look finished, they agree to nothing, and
 * they hide every component that was never built — which is how nine surfaces
 * the boundary FORBIDS an app to build sat unimplemented for four stages. A
 * gallery driven by the registry cannot hide one, because the conformance test
 * fails on a component with no specimen.
 *
 * ⚠️ AND IT BORROWS FILES, NOT THE LIBRARY. `daisyui.css` is 1.1 MB of sixty-one
 * components and every stock theme; the ones we actually borrow are inlined, so
 * the boundary is visible in the page's own weight.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync, readFileSync } from "node:fs";
import {
  BORROWED_FILES, CLOCK, CHOREOGRAPHY, DEFAULT_BRAND, SCALE, SKY, STRUCTURE,
  daisyTheme, skyVars, tokensFor, type Brand, type Theme,
} from "../src/index.js";
import { GROUPS } from "./specimens.js";

const TENANTS: { readonly name: string; readonly brand: Brand }[] = [
  { name: "Northlight", brand: DEFAULT_BRAND },
  { name: "Pine", brand: { ...DEFAULT_BRAND, accent: "#0b7a5a", ambience: { hue: 155, intensity: 0.045 } } },
  { name: "Ember", brand: { ...DEFAULT_BRAND, accent: "#e8590c", ambience: { hue: 32, intensity: 0.05 } } },
  { name: "Slate", brand: { ...DEFAULT_BRAND, accent: "#6b7280", ambience: { hue: 250, intensity: 0.01 }, radius: 8, edge: "defined" } },
  { name: "Dense", brand: { ...DEFAULT_BRAND, accent: "#7048e8", ambience: { hue: 280, intensity: 0.04 }, radius: 24, density: "compact", elevation: "flat" } },
];

/*
  ⚠️ SCOPED BY ATTRIBUTE RATHER THAN BY `:root`, and only here. A product has one
  tenant and one theme at a time; a gallery has five and two. The DERIVATION is
  untouched — this calls the same three functions the sheet does.

  ⚠️ AND THE SCALE COMES INSIDE THE SCOPE. `--gap: calc(22px * var(--density))`
  is substituted where it is DECLARED, so leaving it at `:root` while `--density`
  sits on a descendant makes it invalid at computed-value time and it inherits
  down as EMPTY — every padding naming it silently dropped.
*/
const scoped = (brand: Brand, theme: Theme, i: number): string => {
  const decl = (o: Readonly<Record<string, string>>) =>
    Object.entries(o).map(([k, v]) => `  ${k}: ${v};`).join("\n");
  return [
    `[data-tenant='${i}'][data-theme='${theme}'] {`,
    decl(tokensFor(brand, theme)), decl(daisyTheme(brand, theme)), decl(skyVars(brand, theme)),
    SCALE.replace(/^:root \{/, "").replace(/\}$/, ""),
    `}`,
  ].join("\n");
};

/*
  ⚠️ BY FILE NAME, FROM THE PACKAGE, AND IT THROWS ON A MISSING ONE. The file
  names are not the class names — daisyUI ships `btn` in `button.css` — and the
  first version guessed from the class and swallowed the miss with a `catch`.
  The result was no button CSS at all: four kinds of button rendered as one grey
  pill in the library's un-themed default, and nothing anywhere failed, because a
  missing file had been read as "no styles needed".
*/
const daisy = [...new Set(Object.values(BORROWED_FILES))]
  .map((f) => readFileSync(`node_modules/daisyui/components/${f}.css`, "utf8"))
  .join("\n");

/* ------------------------------------------------------------ the tokens --- */

/**
 * ⚠️ THE TOKENS ARE PART OF THE LANGUAGE, so they are shown rather than
 * described. A palette nobody has seen at every tenant is a palette that is
 * correct in the one screenshot somebody took.
 */
const tokenBoard = (i: number): string => {
  const swatch = (name: string, label: string) =>
    `<figure class="sw"><span class="chip" style="background:var(${name})"></span><figcaption>${label}<br><code>${name}</code></figcaption></figure>`;
  return `
<section class="group">
  <h2>Tokens</h2>
  <p class="note">Everything below is derived from one accent, one ambience hue and four bounded slots. No value here was picked.</p>
  <div class="board">
    ${["--canvas", "--surface-1", "--surface-2", "--surface-3"].map((n) => swatch(n, n.replace("--", ""))).join("")}
    ${["--canvas-accent", "--surface-1-accent", "--surface-2-accent"].map((n) => swatch(n, "accent, re-lit")).join("")}
    ${["--tone-success", "--tone-warning", "--tone-danger", "--tone-info"].map((n) => swatch(n, n.replace("--tone-", ""))).join("")}
  </div>
  <div class="board">
    <figure class="sw wide"><span class="ramp"></span><figcaption>the type ladder — hero 34 · page 26 · body 14 · sub 12 · meta 10</figcaption></figure>
  </div>
  <p class="note">Ink is measured against the exact surface it lands on, so a tenant cannot pair a colour with text that fails on it. Semantic hues are the platform's and never a brand slot: a tenant who could move <code>danger</code> could make a delete confirmation read as a success. <span class="hidden">${i}</span></p>
</section>`;
};

/* -------------------------------------------------------------- the page --- */

const CHROME = `
:root { color-scheme: light dark; --ink: #16181d; --dim: #6b7280; --bg: #f4f5f7; --line: #e3e5ea; --chip: #ffffff; }
@media (prefers-color-scheme: dark) { :root:not([data-page='light']) { --ink: #e8eaef; --dim: #9096a3; --bg: #0e0f12; --line: #24262c; --chip: #191b20; } }
/* ⚠️ THE PACKAGE ASSUMES A RESET and only the borrowed daisyUI files are
   inlined — its base layer, which carries one, is not among them. */
*, *::before, *::after { box-sizing: border-box; }
h1, h2, h3, p, figure, figcaption, ol, ul { margin: 0; padding: 0; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font: 400 15px/1.55 ui-sans-serif, -apple-system, "SF Pro Text", Inter, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased; }
.wrap { max-inline-size: 1180px; margin: 0 auto; padding: 34px 20px 80px; }
.lede h1 { font-size: 26px; font-weight: 650; letter-spacing: -0.025em; margin-block-end: 6px; }
.lede p { color: var(--dim); max-inline-size: 66ch; }
.controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 24px 0 30px;
  position: sticky; top: 0; z-index: 20; padding: 12px 0; background: var(--bg); }
.pill { display: flex; gap: 4px; padding: 4px; border: 1px solid var(--line); border-radius: 999px; background: var(--chip); }
.controls button { appearance: none; border: 0; background: none; color: var(--dim); cursor: pointer;
  font: inherit; font-size: 13px; font-weight: 500; padding: 6px 13px; border-radius: 999px; }
.controls button[aria-pressed='true'] { background: var(--ink); color: var(--bg); }
.dot { inline-size: 9px; block-size: 9px; border-radius: 999px; display: inline-block; margin-inline-end: 7px; vertical-align: -1px; }
.stage { display: none; }
.stage[data-live] { display: block; }
.group { margin-block-end: 40px; }
.group h2 { font-size: 12px; font-weight: 650; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); margin-block-end: 6px; }
.note { color: var(--dim); font-size: 13.5px; max-inline-size: 74ch; margin-block-end: 16px; }
.board { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 22px;
  padding: 20px; border-radius: 18px; border: 1px solid var(--line);
  background: var(--canvas); color: var(--canvas-ink); }
.sw { display: flex; flex-direction: column; gap: 8px; }
.sw.wide, .sw[data-wide] { grid-column: 1 / -1; }
.sw figcaption { font: 500 11px/1.5 ui-monospace, monospace; color: var(--canvas-ink); opacity: 0.55; }
.sw code { opacity: 0.75; }
.chip { display: block; block-size: 46px; border-radius: 10px; box-shadow: inset 0 0 0 1px rgb(128 128 128 / 0.18); }
.ramp { display: block; block-size: 2px; background: currentColor; opacity: 0.2; }
.hidden { display: none; }
[data-one='scroller-item'] { display: block; }
[data-one='overlay'] { position: static; border-radius: var(--radius-lg); background: var(--surface-2); color: var(--surface-2-ink); padding: var(--row-pad); box-shadow: var(--elevation-3); }
[data-one='shell'] { min-block-size: 0; border-radius: 14px; overflow: hidden; }
/* ⚠️ A shadow needs room to be seen. In light the deeper surfaces are all
   near-white and the elevation IS the difference, so a flush specimen reads as
   three identical rectangles — which is the design being invisible rather than
   absent. */
[data-one='surface'] { display: block; padding: 16px; min-block-size: 74px; }
@media (max-width: 720px) { .wrap { padding: 20px 14px 60px; } .board { padding: 14px; } }
`;

const cell = (caption: string, body: string, wide?: boolean) =>
  `<figure class="sw"${wide ? " data-wide" : ""}>${body}<figcaption>${caption}</figcaption></figure>`;

const groupHtml = (): string =>
  GROUPS.map((g) => `
<section class="group">
  <h2>${g.title}</h2>
  <p class="note">${g.note}</p>
  <div class="board">
    ${g.items.map((i) => cell(i.caption, renderToStaticMarkup(i.node as never), i.wide)).join("\n")}
  </div>
</section>`).join("\n");

const SCRIPT = `
const stages = [...document.querySelectorAll('.stage')];
document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  [...b.parentElement.children].forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  if (b.dataset.act === 'tenant') stages.forEach((s, n) => s.toggleAttribute('data-live', n === +b.dataset.value));
  if (b.dataset.act === 'theme') stages.forEach((s) => { s.dataset.theme = b.dataset.value; });
});
`;

const body = TENANTS.map((_, i) => `
<div class="stage" data-tenant="${i}" data-theme="dark"${i === 0 ? " data-live" : ""}>
${tokenBoard(i)}
${groupHtml()}
</div>`).join("\n");

const page = `<title>Northlight — the interface language</title>
<style>${daisy}</style>
<style>
${TENANTS.flatMap(({ brand }, i) => (["light", "dark"] as Theme[]).map((t) => scoped(brand, t, i))).join("\n")}
${CLOCK}
${STRUCTURE}
${SKY}
${CHOREOGRAPHY}
${CHROME}
</style>
<div class="wrap">
  <div class="lede">
    <h1>Northlight — the interface language</h1>
    <p>Every component the language has, in every state it declares, rendered from the shipped
    package through the shipped stylesheet. Change the tenant: nothing below was re-authored, and
    no value in it was picked. Press anything — the motion is real.</p>
  </div>
  <div class="controls">
    <div class="pill">
      ${TENANTS.map(({ name, brand }, i) => `<button data-act="tenant" data-value="${i}" aria-pressed="${i === 0}"><span class="dot" style="background:${brand.accent}"></span>${name}</button>`).join("")}
    </div>
    <div class="pill">
      <button data-act="theme" data-value="dark" aria-pressed="true">Dark</button>
      <button data-act="theme" data-value="light" aria-pressed="false">Light</button>
    </div>
  </div>
  ${body}
</div>
<script>${SCRIPT}</script>`;

writeFileSync(process.argv[2] ?? "gallery.html", page);
console.log(`wrote ${process.argv[2] ?? "gallery.html"} — ${(page.length / 1024).toFixed(0)} kB`);
