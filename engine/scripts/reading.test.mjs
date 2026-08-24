#!/usr/bin/env node
/**
 * WHAT RUNS EVERY FRAME, AND WHAT IT LEAVES FOR EVERYTHING ELSE.
 *
 * @design a decode is paced; the thread that answers a tap is not spent reading.
 *
 * ⚠️ THE SCANNER READ AS FAST AS THE PHONE COULD MANAGE, FOR AS LONG AS THE
 * SCREEN WAS OPEN. The loop awaited its previous decode — which is what stopped
 * it queueing up, and is why it read as careful — and then asked for the next
 * animation frame immediately. A decode of a full-resolution frame is tens of
 * milliseconds on a phone, so back to back that is the main thread.
 *
 * ⚠️ AND THE SYMPTOM WAS NOT A SLOW SCANNER. It was that everything else queued
 * behind it: a tap on the nav painted its ripple from the compositor and then
 * sat there, because the handler that would answer it could not run. Reported as
 * navigation needing several presses and the app going stubborn — measured on a
 * recording at four and a half seconds and five presses to leave the screen.
 *
 * ⚠️ THE SAME FAULT AS THE ICON, ONE THREAD OVER (D60): drawing is what spends a
 * worker's only thread, and decoding is what spends a phone's. That one was
 * found because the CPU figure was in a log. This one had nowhere to show up at
 * all, which is why the rule is now a guard rather than a paragraph.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const walk = (dir) => {
  let out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const at = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(at));
    else if (/\.tsx?$/.test(at) && !/\.test\./.test(at)) out.push(at);
  }
  return out;
};

const files = ["design/src", "one-space/src", "apps"].flatMap((r) => walk(join(ENGINE, r)));

/*
  ⚠️ CODE, NOT PROSE, AND THIS GUARD READ BOTH. It selected every file whose
  TEXT contained `getUserMedia` — so the pure module that holds the reader's
  decision, whose header explains that the bug was never in `getUserMedia`, was
  selected as a file that opens a camera and failed for not asking one for a
  size. A guard that fires on documentation teaches people not to write any.
*/
const withoutWords = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

if (!files.length) {
  fail("no source files were read at all — a check over an empty corpus is green\n"
    + "       for the same reason a check over a clean one is.");
}

/* ------------------------------------------------------------ the pacing --- */

/**
 * ⚠️ EVERY LOOP THAT DECODES, NOT THE ONE THAT WAS WRONG. A second scanner —
 * a document reader, a label reader, an app's own — is the same thread and the
 * same failure, and naming one file is how the next one gets it back.
 */
const decoders = files.filter((f) => /\.detect\s*\(/.test(readFileSync(f, "utf8")));
if (!decoders.length) {
  fail("nothing decodes a frame any more, so this guard passes over nothing.\n"
    + "       Either the scanner moved or it is reading for a call that has changed.");
}

for (const f of decoders) {
  const at = f.slice(ENGINE.length + 1);
  const text = withoutWords(readFileSync(f, "utf8"));
  /* ⚠️ A CADENCE, DECLARED AS A NUMBER SOMEBODY CHOSE. The old loop had none —
     not a wrong one, none — which is why nobody could point at it. */
  if (!/READS_PER_SECOND/.test(text)) {
    fail(`${at}: decodes frames with no declared cadence.\n`
      + "       Unpaced it reads as fast as the device allows, which is the whole\n"
      + "       main thread — and every tap then waits behind a decode.");
    continue;
  }
  /* ⚠️ AND THE CADENCE IS APPLIED, not merely present. A constant nothing
     compares against is a comment with a type. */
  if (!/Date\.now\(\)\s*-\s*\w+\s*>=\s*GAP/.test(text)) {
    fail(`${at}: declares a cadence and never checks it before decoding.`);
    continue;
  }
  const rate = Number(/READS_PER_SECOND\s*=\s*(\d+)/.exec(text)?.[1] ?? 0);
  if (!(rate > 0 && rate <= 15)) {
    fail(`${at}: reads ${rate} times a second. Above about fifteen there is no\n`
      + "       reading gained — a code is in frame for a second at least — and the\n"
      + "       thread it costs is the one that answers a person.");
  }
}
if (!bad && decoders.length) {
  ok(`pacing: ${decoders.length} decode loop(s), each at a cadence somebody chose`);
}

/* -------------------------------------------------------- what it is given --- */

/**
 * ⚠️ AND THE FRAME HANDED TO THE DECODER HAS A SIZE. Unasked, a phone gives the
 * sensor's full picture — four times the pixels and four times the work per
 * read, for a barcode legible at a fraction of it. The cadence caps how OFTEN;
 * this caps how MUCH, and a decode that overruns its gap makes the cadence a
 * wish.
 */
const cameras = files.filter((f) => /getUserMedia/.test(withoutWords(readFileSync(f, "utf8"))));
if (!cameras.length) {
  fail("nothing opens a camera — this half of the guard passes over nothing.");
}
for (const f of cameras) {
  const at = f.slice(ENGINE.length + 1);
  const text = withoutWords(readFileSync(f, "utf8"));
  if (!/width:\s*\{\s*ideal:/.test(text)) {
    fail(`${at}: opens a camera without asking for a size, so the decoder is handed\n`
      + "       whatever the sensor produces — and the cost per read is set by the\n"
      + "       phone rather than by anybody here.");
  }
}
if (!bad && cameras.length) {
  ok(`frames: ${cameras.length} camera(s), each asking for a size it can decode`);
}

console.log(bad
  ? `\nreading: ${bad} finding(s) — something reads with the thread a person is waiting on.`
  : "\nreading: a decode is paced and sized, so a tap is never queued behind one.");
process.exit(bad ? 1 : 0);
