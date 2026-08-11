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

import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { ACCOUNT_CSS } from "../src/account/home.css.js";
import { FONTS, TYPE_CSS, fontFace } from "../src/brand/type.css.js";
import { SKY_CSS } from "../src/sky.css.js";

const FONT = FONTS.map((f) =>
  fontFace(f, `data:font/woff2;base64,${readFileSync(f.file).toString("base64")}`),
).join("\n");

/*
  ⚠️ THE HOST'S LOOK IS DELIBERATELY NOT THE PRODUCT'S. It is a grey rectangle
  saying what it is, in a monospace nothing in the design uses, because anything
  better would start being judged — and what is being judged is what is laid over
  it. There is nothing else here: the controls that used to float in the corner
  are in the URL now.
*/
const DEV = `
.host { min-block-size: 100dvh; display: grid; place-content: center; gap: 14px; justify-items: center;
  background: #101014; color: #6c6c76;
  font: 400 14px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.host button { appearance: none; border: 1px solid #303038; background: #1b1b21; color: #c9c9d2;
  border-radius: 8px; padding: 9px 14px; font: inherit; cursor: pointer; }
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
  define: { "process.env.NODE_ENV": '"production"' },
});
const script = bundled.outputFiles[0]!.text;

const html = `<!doctype html><html lang="en" data-theme="dark"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Account Center — @one/web</title>
<style>${FONT}</style><style>${TYPE_CSS}</style><style>${ACCOUNT_CSS}</style>
<style>${SKY_CSS}</style><style>${DEV}</style>
</head><body><div id="root"></div>
<script>${script}</script>
</body></html>`;

const out = process.argv[2] ?? "account.html";
writeFileSync(out, html);
process.stdout.write(`wrote ${out} — ${(html.length / 1024).toFixed(0)} kB\n`);
