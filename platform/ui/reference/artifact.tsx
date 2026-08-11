/**
 * THE LIVE PREVIEW — the five archetypes, in a page somebody can press.
 *
 * ⚠️ NOT SHIPPED CODE, AND NOTHING MAY IMPORT IT. Like `screens.tsx` beside it,
 * this renders `@one/ui`'s real components through `@one/ui`'s real stylesheet.
 * The difference is only that it emits ONE self-contained page with the tenant
 * and the theme as controls, so the thing being reviewed is the switch between
 * them rather than two photographs somebody has to hold up side by side.
 *
 * ⚠️ AND IT BORROWS SIX FILES, NOT THE LIBRARY. `daisyui.css` is 1.1 MB because
 * it carries sixty-one components and every stock theme. We use six objects, so
 * six component files are inlined — about 120 kB — and the boundary is visible in
 * the page's own weight rather than only in a document.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync, readFileSync } from "node:fs";
import {
  daisyTheme, skyVars, tokensFor, CLOCK, SCALE, STRUCTURE, SKY, CHOREOGRAPHY,
  DEFAULT_BRAND, type Brand, type Theme,
} from "../src/index.js";
import { SCREENS } from "./stage.js";

const TENANTS: { readonly name: string; readonly brand: Brand }[] = [
  { name: "Northlight", brand: DEFAULT_BRAND },
  { name: "Pine", brand: { ...DEFAULT_BRAND, accent: "#0b7a5a", ambience: { hue: 155, intensity: 0.045 } } },
  { name: "Ember", brand: { ...DEFAULT_BRAND, accent: "#e8590c", ambience: { hue: 32, intensity: 0.05 } } },
  { name: "Slate", brand: { ...DEFAULT_BRAND, accent: "#6b7280", ambience: { hue: 250, intensity: 0.01 }, radius: 8, edge: "defined", elevation: "flat" } },
];

/*
  ⚠️ SCOPED BY ATTRIBUTE RATHER THAN BY `:root`, and only here. The package emits
  `:root` blocks because a product has one tenant and one theme at a time; a
  preview has four and two, so the same values are re-scoped for the switch. The
  DERIVATION is untouched — this reads the same three functions the sheet does.
*/
const scoped = (brand: Brand, theme: Theme, i: number): string => {
  const decl = (o: Readonly<Record<string, string>>) =>
    Object.entries(o).map(([k, v]) => `  ${k}: ${v};`).join("\n");
  /*
    ⚠️ THE SCALE COMES INSIDE THE SCOPE TOO, AND THE REASON IS A PROPERTY OF CSS
    WORTH KNOWING. `--gap: calc(22px * var(--density))` is substituted where it is
    DECLARED, not where it is used — so leaving it at `:root` while `--density`
    sits on a descendant makes it invalid at computed-value time, and it inherits
    down as EMPTY. Every padding naming it is then dropped, which renders as a
    section header sitting on top of the hero above it. The product ships both at
    `:root` and is unaffected; a preview with four tenants at once is not.
  */
  return [
    `[data-tenant='${i}'][data-theme='${theme}'] {`,
    decl(tokensFor(brand, theme)), decl(daisyTheme(brand, theme)), decl(skyVars(brand, theme)),
    SCALE.replace(/^:root \{/, "").replace(/\}$/, ""),
    `}`,
  ].join("\n");
};

const daisy = ["button", "card", "badge", "alert", "skeleton", "input"]
  .map((c) => readFileSync(`node_modules/daisyui/components/${c}.css`, "utf8"))
  .join("\n");

/*
  ⚠️ THE PAGE'S OWN CHROME IS NOT THE DESIGN SYSTEM, and it is deliberately
  plain: a preview whose frame competes with what it frames is a preview nobody
  can judge. It also carries the three-state theme pattern of its own, because
  the viewer's theme and the tenant's theme are different questions.
*/
const CHROME = `
:root { color-scheme: light dark; --ink: #16181d; --dim: #6b7280; --bg: #f4f5f7; --line: #e3e5ea; --chip: #ffffff; }
@media (prefers-color-scheme: dark) { :root:not([data-page='light']) { --ink: #e8eaef; --dim: #9096a3; --bg: #0e0f12; --line: #24262c; --chip: #191b20; } }
:root[data-page='dark'] { --ink: #e8eaef; --dim: #9096a3; --bg: #0e0f12; --line: #24262c; --chip: #191b20; }
/* ⚠️ THE PACKAGE ASSUMES A RESET, AND ONLY SIX daisyUI FILES ARE INLINED — its
   base layer, which carries one, is not among them. Without this a heading keeps
   its user-agent margin and a padded row is wider than the card it is in. */
*, *::before, *::after { box-sizing: border-box; }
h1, h2, h3, p, figure { margin: 0; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font: 400 15px/1.5 ui-sans-serif, -apple-system, "SF Pro Text", Inter, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased; }
.wrap { max-inline-size: 1400px; margin: 0 auto; padding: 32px 20px 64px; }
h1 { font-size: 22px; font-weight: 650; letter-spacing: -0.02em; margin: 0 0 4px; }
.sub { color: var(--dim); font-size: 14px; margin: 0 0 24px; max-inline-size: 62ch; }
.controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 26px;
  position: sticky; top: 0; z-index: 9; padding: 12px 0; background: var(--bg); }
.group { display: flex; gap: 4px; padding: 4px; border: 1px solid var(--line); border-radius: 999px; background: var(--chip); }
.controls button { appearance: none; border: 0; background: none; color: var(--dim); cursor: pointer;
  font: inherit; font-size: 13px; font-weight: 500; padding: 6px 13px; border-radius: 999px;
  transition: background-color .18s ease, color .18s ease; }
.controls button[aria-pressed='true'] { background: var(--ink); color: var(--bg); }
.controls .swatch { inline-size: 9px; block-size: 9px; border-radius: 999px; display: inline-block;
  margin-inline-end: 7px; vertical-align: -1px; }
/* ⚠️ A CLASS BEATS THE hidden ATTRIBUTE. The user-agent rule for it is the
   lowest specificity there is, so .rail with a display of its own silently
   overrides it and every hidden tenant stays on screen — stacked, with the first
   still at the top, so the switch appears to do nothing at all. */
.rail[hidden] { display: none; }
.rail { display: flex; gap: 26px; overflow-x: auto; padding-block-end: 14px; scrollbar-width: thin; }
.slot { flex: none; }
.cap { color: var(--dim); font: 500 11px/1 ui-monospace, monospace; letter-spacing: .09em;
  text-transform: uppercase; padding: 0 0 9px 3px; }
.phone { inline-size: 390px; block-size: 812px; overflow: hidden; position: relative; border-radius: 30px;
  display: flex; flex-direction: column; border: 1px solid var(--line);
  background: var(--canvas); color: var(--canvas-ink); }
.phone > [data-one='page'] { flex: 1; min-block-size: 0; overflow-y: auto; }
.chrome-clock { flex: none; display: flex; justify-content: space-between; padding: 15px 24px 4px;
  font: 600 14px/1 system-ui; position: relative; z-index: 2; color: var(--canvas-ink); }
.note { margin: 30px 0 0; padding: 15px 17px; border: 1px solid var(--line); border-radius: 12px;
  background: var(--chip); color: var(--dim); font-size: 13.5px; max-inline-size: 74ch; }
.note b { color: var(--ink); font-weight: 600; }
[data-one='scroller-item'] { display: block; }
@media (max-width: 700px) { .wrap { padding: 20px 14px 48px; } .rail { gap: 18px; } }
`;

const body = TENANTS.map((_, i) => `
<div class="rail" data-tenant="${i}" data-theme="dark" ${i ? 'hidden' : ""}>
${SCREENS.map(([cap, node]: readonly [string, React.ReactNode]) =>
  `<div class="slot"><div class="cap">${cap}</div><div class="phone"><div class="chrome-clock"><span>9:41</span><span>5G</span></div>${renderToStaticMarkup(node as never)}</div></div>`).join("\n")}
</div>`).join("\n");

/*
  ⚠️ THE REPLAY BUTTON EXISTS BECAUSE MOTION CANNOT BE REVIEWED FROM A STILL.
  The entrance runs once on load and is then invisible forever, which is how a
  stagger landing on the wrong elements survives every review — it is only ever
  seen by somebody who happened to be looking at the moment the page painted.
*/
const SCRIPT = `
const rails = [...document.querySelectorAll('.rail')];
const show = (i) => rails.forEach((r, n) => { r.hidden = n !== +i; });
const setTheme = (t) => rails.forEach((r) => r.dataset.theme = t);
const replay = () => rails.forEach((r) => {
  const p = r.querySelectorAll("[data-one='page']");
  p.forEach((el) => { const c = el.cloneNode(true); el.replaceWith(c); });
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const group = b.parentElement;
  if (b.dataset.act !== 'replay') {
    [...group.children].forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }
  if (b.dataset.act === 'tenant') show(b.dataset.value);
  if (b.dataset.act === 'theme') setTheme(b.dataset.value);
  if (b.dataset.act === 'replay') replay();
});
`;

const page = `<title>Northlight — the five page archetypes</title>
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
  <h1>Northlight — the five page archetypes</h1>
  <p class="sub">Rendered from the shipped components through the shipped stylesheet. A screen declares
  what it <em>is</em>; the top, the sky, the reach of the light, the rhythm and the timing are computed
  from that. Switch the tenant: nothing below was re-authored.</p>
  <div class="controls">
    <div class="group">
      ${TENANTS.map(({ name, brand }, i) =>
        `<button data-act="tenant" data-value="${i}" aria-pressed="${i === 0}"><span class="swatch" style="background:${brand.accent}"></span>${name}</button>`).join("")}
    </div>
    <div class="group">
      <button data-act="theme" data-value="dark" aria-pressed="true">Dark</button>
      <button data-act="theme" data-value="light" aria-pressed="false">Light</button>
    </div>
    <div class="group"><button data-act="replay">Replay the entrance</button></div>
  </div>
  ${body}
  <p class="note"><b>The wells are empty on purpose.</b> The language names five icon roles and ships
  no set to fill them yet — stated here rather than faked in the preview, because a fix that exists in
  the picture and not in the product is worse than the gap.</p>
</div>
<script>${SCRIPT}</script>`;

writeFileSync(process.argv[2] ?? "northlight.html", page);
console.log(`wrote ${process.argv[2] ?? "northlight.html"} — ${(page.length / 1024).toFixed(0)} kB`);
