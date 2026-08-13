/**
 * THE LIVE PAGE — every screen `@one/web` has, bundled from the real source.
 *
 * ⚠️ IT WRITES A COMPLETE DOCUMENT, DOCTYPE INCLUDED. A page served without one
 * renders in quirks mode — percentage heights resolve differently, inheritance
 * changes — and every judgement made from the picture is made about a page nobody
 * will ever see. That happened once and it invalidated a whole review.
 *
 * ⚠️ THE CONTROLS ARE IN A SPEED DIAL, NOT A BAR. A bar across the top is part of
 * the picture: it sets the page down by its own height, it puts a second visual
 * language above the one being judged, and every screenshot taken from it is of a
 * page that has something above it which the product never will. The dial is one
 * small round control in a corner; closed, the page is exactly the page.
 *
 * ⚠️ EVERYTHING IS INLINED — bundle, sheets, fonts. The published page blocks
 * every external host, and a blocked reference there does not fail loudly: the
 * script never runs, the face silently falls back, and the picture is of
 * something else.
 *
 * ⚠️ NOT SHIPPED CODE. Nothing in `src` may import this.
 */

import { Avatar, Style } from "@dicebear/core";
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { HUB_CSS } from "../src/hub/hub.css.js";
import { MARK_CSS } from "../src/brand/mark.css.js";
import { UI_CSS } from "../src/ui.css.js";
import { FONTS, TYPE_CSS, fontFace } from "../src/brand/type.css.js";
import { MOTION_CSS } from "../src/motion.css.js";
import { SKY_CSS } from "../src/sky.css.js";

const FONT = FONTS.map((f) =>
  fontFace(f, `data:font/woff2;base64,${readFileSync(f.file).toString("base64")}`),
).join("\n");

/*
  ⚠️ THE FACES ARE MADE HERE, NOT IN THE BROWSER. DiceBear's generator plus two
  style definitions is about 40 kB gzipped, shipped to every device, to redraw the
  same picture from the same seed every time the page loads. A seed is stable, so
  the picture is stable, so it belongs behind a URL that can be cached forever —
  which is what the API will serve. The preview has no API, so it bakes them.

  ⚠️ `animationVariant` IS THE OPTION, and without it every style renders its
  `none` variant. The other variants carry weight 0, so they are never picked at
  random — asking is the only way to get one. The animation itself is a `<style>`
  element inside the SVG, which is why it survives being used as an image.
*/
const styleOf = (name: string) =>
  new Style(JSON.parse(readFileSync(
    `node_modules/@dicebear/styles/dist/${name}.min.json`, "utf8")));
const SPROUTS = styleOf("sprouts");
const PLANETS = styleOf("planets");
/* ⚠️ SPROUTS IS COMPOSED FOR A SQUARE and a person is drawn in a circle, so the
   pot it stands in is exactly what a circular crop takes off. Scaling it down
   inside its own canvas is the fix; moving the crop is not, because the shape is
   what says person. */
const faceOf = (kind: "person" | "workspace", seed: string, still = false) =>
  new Avatar(kind === "person" ? SPROUTS : PLANETS, {
    seed, size: 128,
    /* ⚠️ THE ANIMATION IS INSIDE THE SVG, so it cannot be turned off by CSS. It is
       a `<style>` element in the picture — which is what makes it survive being
       used as an image, and what means a still one has to be a different picture.
       The API will serve this as a second URL rather than a second file. */
    ...(still ? {} : { animationVariant: ["slow"] as const }),
    ...(kind === "person" ? { scale: 0.82 } : {}),
  }).toDataUri();

/*
  ⚠️ EVERY FACE IS BAKED TWICE, AND THE STILL ONE IS FOR CHIPS. A generated face
  breathes, which reads as alive at 44 pixels beside a name and as a twitch at 22
  inside a sentence — three of them in one paragraph is a page that will not sit
  still while somebody reads it.
*/
const PEOPLE = ["Nadia Haddad", "b.okonkwo@gmail.com", "Shujaa Haddad"];
const PLACES = ["t1", "t2", "t3", "t4"];
const FACES = Object.fromEntries([
  ...PEOPLE.map((s) => [s, faceOf("person", s)]),
  ...PLACES.map((s) => [s, faceOf("workspace", s)]),
  ...PEOPLE.map((s) => [`still:${s}`, faceOf("person", s, true)]),
  ...PLACES.map((s) => [`still:${s}`, faceOf("workspace", s, true)]),
]);

/*
  ⚠️ THE DIAL AND THE HOST LOOK DELIBERATELY UNLIKE THE PRODUCT. They borrow no
  token and share no class with the screens: a control that dresses like the thing
  being reviewed is a control that gets reviewed by mistake. The host is a grey
  rectangle saying what it is, because anything better would start being judged
  instead of what is laid over it.

  ⚠️ THE PANEL SCROLLS. It grew past the height of a phone the moment it carried
  the feedback switches, and a panel whose last two rows are off the bottom of the
  screen is a control surface that silently cannot reach half of what it controls.

  ⚠️ AND IT SURVIVES A MODAL. A modal dialog turns off pointer events on the body
  and dismisses on any pointer down outside itself — correct for a dialog, and it
  makes a floating control unreachable for exactly as long as the thing being
  reviewed is on screen.
*/
const DEV = `
.host { min-block-size: 100dvh; display: grid; place-content: center; gap: 14px; justify-items: center;
  background: #101014; color: #6c6c76;
  font: 400 14px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.host > button { appearance: none; border: 1px solid #303038; background: #1b1b21; color: #c9c9d2;
  border-radius: 8px; padding: 9px 14px; font: inherit; cursor: pointer; }
/* ⚠️ THE DEMO INSIDE THE HOST IS PRODUCT, NOT CHROME. The monospace above says
   "this is scaffolding"; inherited by the app form it would make every judgement
   about that form a judgement about a typeface the product does not use. */
.app-form { inline-size: min(100%, 420px); padding-inline: 16px;
  display: grid; gap: 10px; color: var(--ink);
  font: 400 16px/1.45 var(--font-text); word-spacing: 0.08em; }
.dial { position: fixed; inset-block-end: 16px; inset-inline-start: 16px; z-index: 999;
  pointer-events: auto;
  display: flex; flex-direction: column; align-items: flex-start; gap: 10px;
  font: 500 13px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dial-panel { display: none; flex-direction: column; gap: 13px; padding: 14px;
  border-radius: 16px; background: rgb(24 24 28 / 0.96); color: #f2f2f4;
  box-shadow: 0 10px 40px rgb(0 0 0 / 0.5); backdrop-filter: blur(12px);
  min-inline-size: 178px; max-block-size: min(68dvh, 560px); overflow-y: auto;
  overscroll-behavior: contain; }
.dial[data-open] .dial-panel { display: flex; }
.dial-group { display: flex; flex-direction: column; gap: 5px; flex: none; }
.dial-group > span { color: #82828c; font-size: 10.5px; letter-spacing: 0.09em; text-transform: uppercase; }
.dial-panel button { appearance: none; text-align: start; border: 0; border-radius: 9px;
  padding: 7px 10px; background: rgb(255 255 255 / 0.07); color: inherit; font: inherit; cursor: pointer; }
.dial-panel button[aria-pressed='true'] { background: #f2f2f4; color: #16161a; }
.dial-toggle { inline-size: 46px; block-size: 46px; border-radius: 999px; border: 0; cursor: pointer;
  background: rgb(24 24 28 / 0.96); color: #f2f2f4; font-size: 19px;
  box-shadow: 0 6px 22px rgb(0 0 0 / 0.4); backdrop-filter: blur(12px); }
.dial[data-open] .dial-toggle { background: #f2f2f4; color: #16161a; }
/* IT STANDS ASIDE FOR A SHEET. A sheet is full-width and rises from the same
   corner, so the toggle sat on top of the last option in every picker — which is
   a preview artefact that reads exactly like a layout bug in the product. */
body:has(.sheet) .dial { opacity: 0; pointer-events: none; }
.dial { transition: opacity 200ms ease; }
@media print { .dial { display: none; } }
`;

const bundled = await build({
  entryPoints: ["dev/mount.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  minify: true,
  /* ⚠️ PRODUCTION, OR REACT SHIPS ITS DEVELOPMENT BUILD — which is several times
     the size and prints warnings into a console nobody has open on a phone. */
  define: {
    "process.env.NODE_ENV": '"production"',
    /* The preview's stand-in for the route that will serve these. */
    __FACES__: JSON.stringify(FACES),
  },
});
const script = bundled.outputFiles[0]!.text;

const html = `<!doctype html><html lang="en" data-theme="dark"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Account Center — @one/web</title>
<style>${FONT}</style><style>${TYPE_CSS}</style><style>${MOTION_CSS}</style><style>${UI_CSS}</style>
<style>${MARK_CSS}</style><style>${HUB_CSS}</style>
<style>${SKY_CSS}</style><style>${DEV}</style>
</head><body><div id="root"></div>
<script>${script}</script>
</body></html>`;

const out = process.argv[2] ?? "account.html";
writeFileSync(out, html);
process.stdout.write(`wrote ${out} — ${(html.length / 1024).toFixed(0)} kB\n`);
