/**
 * THE FIVE ARCHETYPES, PHOTOGRAPHED FROM THE SHIPPED CODE.
 *
 * ⚠️ NOT SHIPPED CODE, AND NOTHING MAY IMPORT IT. This is the review harness:
 * it renders `@one/ui`'s real components through `@one/ui`'s real stylesheet and
 * writes an HTML file to photograph. Everything it adds of its own is the frame
 * around the screens — a phone-sized box and a caption — because a screenshot of
 * a 390pt design at browser width proves nothing about a 390pt design.
 *
 * ⚠️ AND IT RENDERS THE PACKAGE, NOT A COPY OF IT. `build.mjs` beside this file
 * is the PROTOTYPE the numbers were measured from, and a prototype that keeps
 * being photographed is a prototype the shipped code is free to drift from. This
 * one imports `../src`, so a defect in the photograph is a defect in the product.
 *
 * Run: `pnpm dlx tsx screens.tsx` from this directory, then photograph
 * `shipped.html` at 2× in both themes.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { DEFAULT_BRAND, sheetFor, type Brand } from "../src/index.js";
import { SCREENS } from "./stage.js";

/* ⚠️ Three tenants chosen to be AWKWARD rather than pretty — a blue, a green
   whose hue collides with the success tone, and a mid-lightness saturated
   orange, which is the case a hand-tuned palette fails. */
const TENANTS: Brand[] = [
  DEFAULT_BRAND,
  { ...DEFAULT_BRAND, accent: "#0b7a5a", ambience: { hue: 155, intensity: 0.045 } },
  { ...DEFAULT_BRAND, accent: "#e8590c", ambience: { hue: 32, intensity: 0.05 } },
];



/*
  ⚠️ THE FRAME IS THE HARNESS'S, AND IT IS THE ONLY CSS HERE. A 390 × 844 box, a
  caption, and a scroll clip — everything inside it is the package's own sheet.
  Anything else added here would be a fix that exists in the photograph and not
  in the product.
*/
const FRAME = `
  body { margin: 0; background: #0e0e10; font-family: -apple-system, "SF Pro Text", Inter, system-ui, sans-serif; }
  .stage { display: flex; gap: 28px; padding: 28px; align-items: flex-start; }
  .cap { color: #8b8d95; font: 500 12px/1 ui-monospace, monospace; padding: 0 0 10px 2px; letter-spacing: .06em; text-transform: uppercase; }
  .phone { inline-size: 390px; block-size: 844px; overflow: hidden; position: relative; border-radius: 22px;
           display: flex; flex-direction: column; background: var(--canvas); color: var(--canvas-ink); }
  .phone > [data-one='page'] { flex: 1; min-block-size: 0; overflow-y: auto; }
  .chrome-clock { flex: none; display: flex; justify-content: space-between; padding: 14px 22px 4px;
            font: 600 15px/1 system-ui; position: relative; z-index: 2; color: var(--canvas-ink); }
  [data-one='scroller-item'] { display: block; }
`;

const page = (brand: Brand, theme: "light" | "dark"): string => `<!doctype html>
<meta charset="utf8">
<html data-theme="${theme}"><head><style>
${existsSync("node_modules/daisyui/daisyui.css") ? readFileSync("node_modules/daisyui/daisyui.css", "utf8") : "/* daisyUI absent — the objects fall back to our own sheet */"}
${sheetFor(brand)}
${FRAME}
</style></head>
<body><div class="stage">
${SCREENS.map(([cap, node]) => `<div><div class="cap">${cap}</div><div class="phone"><div class="chrome-clock"><span>9:41</span><span>5G</span></div>${renderToStaticMarkup(node as never)}</div></div>`).join("\n")}
</div></body></html>`;

for (const [i, brand] of TENANTS.entries()) {
  for (const theme of ["dark", "light"] as const) {
    const name = `shipped-${i}-${theme}.html`;
    writeFileSync(new URL(name, import.meta.url), page(brand, theme));
    console.log(`wrote ${name}`);
  }
}
