/**
 * THE HUB'S THREE RULES, EACH GUARDING A FAILURE THAT LOOKS LIKE SUCCESS.
 *
 * ⚠️ ONE DOOR TO THE API. A previous product had 167 bare `fetch` calls and no
 * hook for an expired session, so a dead cookie did not LOOK dead: the shell
 * stayed mounted, every screen rendered whatever empty state its failed load
 * produced, and every save failed into a toast. An expired session was
 * indistinguishable from a deleted workspace.
 *
 * ⚠️ THE PAGE DOES NOT CLASSIFY ITS OWN HOSTNAME. The runtime already decides
 * which door a host is, with the reserved labels, the one-label rule and the
 * custom-domain test. A second classifier in the browser is a second copy of all
 * three, and when they disagree the page offers a control the runtime refuses —
 * which arrives as a 404 with nothing to read.
 *
 * ⚠️ EVERY SCREEN THE PICKER CAN NAME IS DRAWN. A name with no branch renders
 * nothing at all, and a blank page and a page that failed to load are the same
 * picture — so the person reloads for a minute and then gives up.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");
const HUB = join(ENGINE, "one-hub", "src");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

if (!existsSync(HUB)) {
  console.error("BAD  engine/one-hub/src is missing — the Hub is what this checks.");
  process.exit(1);
}

const walk = (at) => readdirSync(at, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(at, e.name))
    : /\.tsx?$/.test(e.name) ? [join(at, e.name)] : []);

const FILES = walk(HUB);
/** ⚠️ Comments describe the rule; matching them would report the rule as a
    breach of itself. */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ------------------------------------------------------------ one API door --- */

/**
 * ⚠️ NAMED, WITH A REASON, AND THE LIST CAN ONLY SHRINK. `api.ts` IS the door;
 * anything else added here is a decision somebody makes in review rather than a
 * line that slipped in.
 */
const MAY_FETCH = new Map([
  ["api.ts", "the door itself — session credentials, refusal shape and the expiry hook"],
]);

let bare = 0;
for (const file of FILES) {
  const name = rel(file).slice("one-hub/src/".length);
  if (MAY_FETCH.has(name)) continue;
  const src = strip(readFileSync(file, "utf8"));
  if (/(?<![.\w])fetch\s*\(/.test(src)) {
    bare++;
    fail(`${rel(file)}: calls fetch() directly.\n` +
         `       Go through \`api\` — an expired session must not be indistinguishable\n` +
         `       from an empty one, and that decision is made in exactly one place.`);
  }
}
if (!bare) ok(`one API door: ${FILES.length} file(s), and only ${[...MAY_FETCH.keys()].join(", ")} calls fetch`);

/* ------------------------------------------------- nobody reads the host --- */

let classified = 0;
for (const file of FILES) {
  const src = strip(readFileSync(file, "utf8"));
  /* ⚠️ THE PROPERTY, NOT `location.` BEFORE IT. Matching the receiver only
     catches a variable that happens to be called `location` — a parameter named
     anything else walks straight past, which is what the first version of this
     check did. */
  for (const m of src.matchAll(/\.\s*(hostname|host)\b/g)) {
    classified++;
    fail(`${rel(file)}: reads .${m[1]} off a location.\n` +
         `       The door is reported by /health — see \`door.ts\`. A second classifier\n` +
         `       here drifts from the runtime's, and the page then offers what the\n` +
         `       runtime refuses.`);
  }
}
if (!classified) ok(`doors: the Hub never classifies its own hostname`);

/* --------------------------------------------------- every screen is drawn --- */

const app = readFileSync(join(HUB, "App.tsx"), "utf8");
const declared = app.match(/export type Screen\s*=([^;]+);/);
if (!declared) {
  fail(`one-hub/src/App.tsx: no \`Screen\` union — the picker's answers are what this checks.`);
} else {
  const names = [...declared[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  const missing = names.filter((n) => !new RegExp(`screen === "${n}"`).test(app));
  if (missing.length) {
    fail(`one-hub/src/App.tsx: ${missing.map((n) => `"${n}"`).join(", ")} can be picked and is\n` +
         `       never drawn. React renders nothing, which looks exactly like a page\n` +
         `       that failed to load.`);
  } else {
    ok(`screens: every one the picker can name has a branch (${names.length})`);
  }
}

console.log(bad
  ? `\nhub: ${bad} finding(s) — each one fails as something other than itself.`
  : `\nhub: one API door, one door classifier, no screen that is never drawn.`);
process.exit(bad ? 1 : 0);
