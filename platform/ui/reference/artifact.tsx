/**
 * THE LANGUAGE, AS A PRODUCT — Ridgeline, running.
 *
 * ⚠️ NOT SHIPPED CODE, AND NOTHING IN `src` MAY IMPORT IT. It renders `@one/ui`'s
 * real components through `@one/ui`'s real stylesheet, so a defect in the picture
 * is a defect in the product.
 *
 * ⚠️ IT IS AN APP AND NOT A BOARD, AND THAT WAS A CORRECTION. A specimen grid
 * answers "does this component exist"; it cannot answer the questions that have
 * actually gone wrong here, every one of which was compositional — a page action
 * landing under its title instead of beside it, a tappable row with no
 * affordance, four kinds of button reading as one. A component photographed
 * alone is composed with nothing.
 *
 * ⚠️ AND IT CANNOT HIDE A COMPONENT, which is the property a demo screen normally
 * destroys. `test/app.test.tsx` renders these screens and reads the `data-one`
 * attributes back out, so a registered component no screen uses is a test
 * failure. The switchers change a tenant, a theme and a WIDTH — the third is not
 * a convenience: the shell is a rail or an island by width, a collection is one
 * pane or two, and half of what this page exists to show is what changes between
 * them.
 *
 * ⚠️ IT BORROWS FILES, NOT THE LIBRARY. `daisyui.css` is 1.1 MB of sixty-one
 * components and every stock theme; the ones we actually borrow are inlined, so
 * the boundary is visible in the page's own weight.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync, readFileSync } from "node:fs";
import {
  BORROWED_FILES, CLOCK, CHOREOGRAPHY, DEFAULT_BRAND, SCALE, SKY, STRUCTURE, SKIES,
  Shell, daisyTheme, maskWeight, skyVars, tokensFor, type Brand, type Theme, type Width,
} from "../src/index.js";
import { SCREENS, OVERLAYS, DESTINATIONS } from "./app.js";

const TENANTS: { readonly name: string; readonly brand: Brand }[] = [
  { name: "Ridgeline", brand: DEFAULT_BRAND },
  { name: "Pine", brand: { ...DEFAULT_BRAND, accent: "#0b7a5a", ambience: { hue: 155, intensity: 0.045 } } },
  { name: "Ember", brand: { ...DEFAULT_BRAND, accent: "#e8590c", ambience: { hue: 32, intensity: 0.05 } } },
  { name: "Slate", brand: { ...DEFAULT_BRAND, accent: "#6b7280", ambience: { hue: 250, intensity: 0.01 }, radius: 8, edge: "defined" } },
  { name: "Dense", brand: { ...DEFAULT_BRAND, accent: "#7048e8", ambience: { hue: 280, intensity: 0.04 }, radius: 24, density: "compact", elevation: "flat" } },
];

const WIDTHS: readonly Width[] = ["phone", "desktop"];

/*
  ⚠️ SCOPED BY ATTRIBUTE RATHER THAN BY `:root`, and only here. A product has one
  tenant and one theme at a time; this page has five and two. The DERIVATION is
  untouched — this calls the same three functions the shipped sheet does.

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

/* --------------------------------------------------------------- the app --- */

/**
 * ⚠️ THE SHELL IS RENDERED PER WIDTH, AND EVERY SCREEN LIVES INSIDE IT. Only one
 * is shown at a time. Rendering per width is not padding: a shell at a phone
 * width and the same shell at a desktop width are different markup — an island
 * against a rail, one pane against two — so a page claiming to show both from one
 * render would be showing one of them wrongly.
 */
const app = (width: Width, live: boolean): string =>
  renderToStaticMarkup(
    <div className="device" data-width={width} {...(live ? { "data-live": "" } : {})}>
      <Shell width={width} at="today" destinations={DESTINATIONS}>
        {SCREENS.map((s) => (
          <div key={s.id} className="screen" data-screen={s.id} data-at={s.at} {...(s.id === "today" ? { "data-live": "" } : {})}>
            {s.node}
          </div>
        ))}
      </Shell>
    </div> as never,
  );

const overlays = (): string =>
  OVERLAYS.map(
    (o) => `<div class="over" data-over="${o.id}">${renderToStaticMarkup(o.node as never)}<p class="cap">${o.caption}</p></div>`,
  ).join("\n");

const skyBoard = (): string =>
  `<div class="skies">${SKIES.map((s) => {
    const w = maskWeight(s);
    return `<figure class="sky"><span data-one="sky-swatch"><span data-one="sky" data-sky="${s}"${w ? ` data-masked="${w}"` : ""} aria-hidden="true"></span></span><figcaption>${s}</figcaption></figure>`;
  }).join("")}</div>`;

/* ------------------------------------------------------------- the chrome --- */

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
.wrap { max-inline-size: 1240px; margin: 0 auto; padding: 30px 20px 70px; }
.lede h1 { font-size: 25px; font-weight: 650; letter-spacing: -0.025em; margin-block-end: 6px; }
.lede p { color: var(--dim); max-inline-size: 68ch; }
.controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 22px 0 20px;
  position: sticky; top: 0; z-index: 30; padding: 12px 0; background: var(--bg); }
.pill { display: flex; gap: 4px; padding: 4px; border: 1px solid var(--line); border-radius: 999px; background: var(--chip); }
.controls button { appearance: none; border: 0; background: none; color: var(--dim); cursor: pointer;
  font: inherit; font-size: 13px; font-weight: 500; padding: 6px 13px; border-radius: 999px; }
.controls button[aria-pressed='true'] { background: var(--ink); color: var(--bg); }
.dot { inline-size: 9px; block-size: 9px; border-radius: 999px; display: inline-block; margin-inline-end: 7px; vertical-align: -1px; }
.caption { color: var(--dim); font-size: 13px; margin: 0 0 14px; max-inline-size: 82ch; }

/* ⚠️ A DEVICE, BECAUSE A PHONE LAYOUT SHOWN AT 1200px IS NOT THE LAYOUT. The
   frame is the viewport the shell was rendered for; without it the island
   stretches across a monitor and every judgement made from the picture is made
   about a screen nobody has. */
.device { display: none; margin: 0 auto; border-radius: 26px; overflow: hidden;
  border: 1px solid var(--line); background: var(--canvas); box-shadow: 0 24px 60px rgb(0 0 0 / 0.14); }
.device[data-live] { display: block; }
.device[data-width='phone'] { inline-size: 402px; block-size: 800px; }
.device[data-width='desktop'] { inline-size: 100%; block-size: 800px; }
/* ⚠️ THE SHELL IS THE VIEWPORT IN A REAL APP, so it stands at 100dvh; inside a
   frame that must be the frame instead, or the island pins itself to the bottom
   of the monitor and is simply not in the picture. */
.device [data-one='shell'] { block-size: 100%; min-block-size: 0; }
.screen { display: none; }
.screen[data-live] { display: contents; }

.skies { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 14px; }
.sky figcaption { font: 500 11px/1.6 ui-monospace, monospace; color: var(--dim); }
[data-one='sky-swatch'] { position: relative; display: block; block-size: 86px; border-radius: 12px;
  overflow: hidden; background: var(--canvas); box-shadow: inset 0 0 0 1px rgb(128 128 128 / 0.18); }
[data-one='sky-swatch'] [data-one='sky'] { --solid: 100%; --reach: 100%; }

/* ⚠️ AN OVERLAY IS SHOWN OVER SOMETHING. Its whole job is its relationship to
   what it covers, and one shown loose reads as a card that happens to contain a
   question — the single thing an overlay must never look like. */
.overlays { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px; }
.over { position: relative; min-block-size: 270px; border-radius: 16px; overflow: hidden;
  background: var(--canvas); color: var(--canvas-ink); box-shadow: inset 0 0 0 1px rgb(128 128 128 / 0.18); }
.over [data-one='overlay'] { position: absolute; inset-inline: 0; inset-block-end: 0; }
.over [data-one='overlay'][data-kind='dialog'] { inset: 50% 14px auto; translate: 0 -50%; }
.over .cap { position: absolute; inset-block-start: 12px; inset-inline: 14px; color: var(--canvas-ink);
  opacity: 0.55; font-size: 12px; line-height: 1.45; }

.section { margin-block-start: 46px; }
.section h2 { font-size: 12px; font-weight: 650; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); margin-block-end: 6px; }
[data-one='scroller-item'] { display: block; }
@media (max-width: 720px) { .wrap { padding: 18px 12px 50px; } .device[data-width='phone'] { inline-size: 100%; } }
`;

/*
  ⚠️ THE NAVIGATION IS REAL. Pressing a rail item changes the screen, because a
  navigation surface that does not navigate is a photograph of one — and what is
  most worth judging about a rail is what it feels like to move through.
*/
const SCRIPT = `
const stage = document.querySelector('.stage');
const screens = [...document.querySelectorAll('.screen')];
const devices = [...document.querySelectorAll('.device')];
const NOTES = ${JSON.stringify(Object.fromEntries(SCREENS.map((s) => [s.id, s.note])))};
const go = (id) => {
  const at = screens.find((s) => s.dataset.screen === id)?.dataset.at;
  screens.forEach((s) => s.toggleAttribute('data-live', s.dataset.screen === id));
  document.querySelectorAll("[data-one='nav-item']").forEach((n) => {
    const label = n.querySelector("[data-one='nav-label']");
    const mine = label && label.textContent.toLowerCase() === at;
    n.toggleAttribute('data-active', Boolean(mine));
    if (mine) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
  });
  document.querySelectorAll('button[data-act="screen"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === id)));
  document.querySelector('.note').textContent = NOTES[id] || '';
};
document.addEventListener('click', (e) => {
  const nav = e.target.closest("[data-one='nav-item']");
  if (nav) {
    const at = nav.querySelector("[data-one='nav-label']").textContent.toLowerCase();
    const first = screens.find((s) => s.dataset.at === at);
    if (first) go(first.dataset.screen);
    return;
  }
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  [...b.parentElement.children].forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  if (b.dataset.act === 'tenant') stage.dataset.tenant = b.dataset.value;
  if (b.dataset.act === 'theme') stage.dataset.theme = b.dataset.value;
  if (b.dataset.act === 'width') devices.forEach((d) => d.toggleAttribute('data-live', d.dataset.width === b.dataset.value));
  if (b.dataset.act === 'screen') go(b.dataset.value);
});
`;

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
    <p>One product, built only from the language, using every component it has. Change the tenant and
    nothing below was re-authored; change the width and the shell becomes a different shell. Press
    anything — the motion is real, and it plays on the press rather than on a hover half the devices
    this ships to do not have.</p>
  </div>
  <div class="controls">
    <div class="pill">
      ${TENANTS.map(({ name, brand }, i) => `<button data-act="tenant" data-value="${i}" aria-pressed="${i === 0}"><span class="dot" style="background:${brand.accent}"></span>${name}</button>`).join("")}
    </div>
    <div class="pill">
      <button data-act="theme" data-value="dark" aria-pressed="true">Dark</button>
      <button data-act="theme" data-value="light" aria-pressed="false">Light</button>
    </div>
    <div class="pill">
      ${WIDTHS.map((w, i) => `<button data-act="width" data-value="${w}" aria-pressed="${i === 0}">${w[0]!.toUpperCase()}${w.slice(1)}</button>`).join("")}
    </div>
    <div class="pill">
      ${SCREENS.map((s, i) => `<button data-act="screen" data-value="${s.id}" aria-pressed="${i === 0}">${s.title}</button>`).join("")}
    </div>
  </div>

  <p class="caption note">${SCREENS[0]!.note}</p>

  <div class="stage" data-tenant="0" data-theme="dark">
    ${WIDTHS.map((w, i) => app(w, i === 0)).join("\n")}

    <section class="section">
      <h2>Overlays</h2>
      <p class="caption">Two depths and no more. A sheet over a sheet is a stack somebody has to unwind, and the way out of the second one is never where it was for the first.</p>
      <div class="overlays">${overlays()}</div>
    </section>

    <section class="section">
      <h2>The sky</h2>
      <p class="caption">One lit layer, masked ten ways. The colour is the tenant's and the mask is the page's — so a pattern is never a colour decision — and every masked one breathes on a period of its own.</p>
      ${skyBoard()}
    </section>
  </div>
</div>
<script>${SCRIPT}</script>`;

writeFileSync(process.argv[2] ?? "gallery.html", page);
console.log(`wrote ${process.argv[2] ?? "gallery.html"} — ${(page.length / 1024).toFixed(0)} kB`);
