/**
 * Rasterise Kova's install icons from one SVG source, in Chromium.
 *
 * The SVG is the source of truth (`apps/app/public/icon.svg`); everything else
 * is a size of it. iOS ignores manifest icons for Add-to-Home-Screen and
 * rejects SVG touch icons, and Android's adaptive launcher masks a circle out
 * of the middle — hence the two full-bleed variants below.
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Resolved from THIS FILE, not from an absolute path.
 *
 * It was hardcoded to `/home/user/mossa/apps/app/public` — the checkout
 * directory of the machine it was written on. That is wrong on every other
 * machine, and it became wrong here the moment the repository was renamed: a
 * fresh clone lands somewhere else, `writeFileSync` throws ENOENT, and the
 * failure names a directory nobody recognises.
 */
const OUT = fileURLToPath(new URL("../app/public", import.meta.url));
const BG = "#0b0c0e";
const RING = "#262a30";
const ACCENT = "#25c891"; // Kova's --primary in dark, oklch(0.74 0.15 164)
const LETTER = "#e8eaed";

/** The mark, at a given corner radius and content scale (for the safe zone). */
const svg = ({ radius, scale }) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="${radius}" fill="${BG}"/>
  <g transform="translate(64 64) scale(${scale}) translate(-64 -64)">
    <circle cx="64" cy="64" r="40" fill="none" stroke="${RING}" stroke-width="12"/>
    <path d="M 64 24 A 40 40 0 1 1 30.6 44" fill="none" stroke="${ACCENT}" stroke-width="12" stroke-linecap="round"/>
    <text x="64" y="76" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="34" font-weight="800" fill="${LETTER}" text-anchor="middle">K</text>
  </g>
</svg>`;

const FILES = [
  // The app's own icons: the same rounded square the SVG draws.
  { name: "icon-192.png", size: 192, radius: 32, scale: 1 },
  { name: "icon-512.png", size: 512, radius: 32, scale: 1 },
  // iOS applies its own squircle over the whole square, so ours must be
  // full-bleed — rounded corners here would be visibly double-rounded.
  { name: "apple-touch-icon.png", size: 180, radius: 0, scale: 1 },
  // Android adaptive: anything outside the centre 80% circle can be cropped,
  // so the mark shrinks and the background fills the bleed.
  { name: "icon-maskable-512.png", size: 512, radius: 0, scale: 0.68 },
];

const browser = await chromium.launch();
for (const f of FILES) {
  const page = await browser.newPage({ viewport: { width: f.size, height: f.size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:${f.size}px;height:${f.size}px}</style>${svg(f)}`,
  );
  const buf = await page.screenshot({ omitBackground: true, type: "png" });
  writeFileSync(`${OUT}/${f.name}`, buf);
  console.log(`${f.name}  ${f.size}px  ${buf.length} bytes`);
  await page.close();
}
await browser.close();
