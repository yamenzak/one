/**
 * THE ARTIFACT, WRAPPED THE WAY IT IS SERVED — for looking at locally.
 *
 * ⚠️ WITHOUT THIS THE PREVIEW RENDERS IN QUIRKS MODE, AND THAT IS NOT A DETAIL.
 * The published page is wrapped in a doctype and a head by the host, so
 * `artifact.tsx` must not emit one — which means the file on disk has no
 * doctype, and a browser opening it directly switches to quirks mode. In quirks
 * mode a table does not inherit colour from its ancestors: every cell resolves
 * to the initial black. So the review copy showed an unreadable table on a dark
 * card while the shipped page was fine, and — far worse — every OTHER judgement
 * made from that preview was made in a rendering mode the product never uses.
 *
 * ⚠️ SO THE PREVIEW IS BUILT, NEVER OPENED DIRECTLY. This wraps the artifact
 * exactly as the host does and writes it beside the original. Screenshot THIS
 * file; the unwrapped one is for publishing.
 */

import { readFileSync, writeFileSync } from "node:fs";

const [, , src, out] = process.argv;
if (!src || !out) {
  process.stderr.write("usage: preview.mjs <artifact.html> <preview.html>\n");
  process.exit(1);
}

const body = readFileSync(src, "utf8");
/* ⚠️ The same skeleton the host uses: a doctype, a charset and a viewport. A
   missing viewport is the second quirk — a phone frame laid out at 980px. */
writeFileSync(
  out,
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `</head><body>${body}</body></html>`,
);
process.stdout.write(`wrapped ${src} -> ${out}\n`);
