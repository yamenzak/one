/**
 * NO BORDERS, NO SHADOWS, AND A GROUND THAT MAKES THAT POSSIBLE (D7).
 *
 * ⚠️ THE BAN AND THE PALETTE ARE ONE RULE, WHICH IS WHY THEY ARE ONE GUARD. A
 * border and a shadow are both ways of saying "this is a separate thing", and a
 * design needs one way — using both, or either on some surfaces and not others,
 * is where inconsistency comes from. But dropping them only works if the
 * surfaces differ in VALUE, and the library's light theme separates a card from
 * the page by three percent of lightness with a shadow holding it apart. Ban the
 * shadow without widening that and every light card disappears — silently, in
 * one theme, looking like a rendering fault rather than a decision.
 *
 * ⚠️ SO THIS CHECKS BOTH HALVES: that nothing draws an edge, and that nothing
 * needs to.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const QUAD = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(QUAD.length + 1);

const filesIn = (dir) => {
  const at = join(QUAD, dir);
  if (!existsSync(at)) return [];
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

const FILES = [
  ...filesIn("web/src"),
  ...filesIn("one-hub/src"),
  ...readdirSync(join(QUAD, "apps"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => filesIn(`apps/${e.name}/src`)),
];

/* -------------------------------------------------------------- the ban --- */

/**
 * ⚠️ `rounded-*` IS NOT A BORDER AND IS NOT BANNED — a radius is a shape, not an
 * edge. What is banned is anything that DRAWS a line around a box or a shadow
 * under it: `border`, `border-2`, `border-t`, `shadow`, `shadow-lg`, `ring-2`.
 * `ring` is included because a focus ring is the library's (`status-focused`),
 * and a hand-written one is the same "separate thing" claim in a third notation.
 */
const EDGE = [
  /^border(-(?:[xytrbles]|\d+|solid|dashed|dotted))?$/,
  /^(?:border-[xytrbles]?-?\d+)$/,
  /^shadow(-.*)?$/,
  /^ring(-.*)?$/,
  /^drop-shadow(-.*)?$/,
];

/** ⚠️ A responsive or state prefix does not change what the utility IS. */
const bare = (cls) => cls.replace(/^(?:[a-z0-9]+:)+/, "").replace(/^[!-]/, "");

/**
 * ⚠️ `ground.ts` IS EXEMPT BECAUSE IT IS THE FILE THAT TURNS THEM OFF. It names
 * every token this rule is about; matching its own text would make the guard
 * fail on its own fix.
 */
const DEFINES = new Set(["web/src/ground.ts"]);

let edges = 0;
for (const file of FILES) {
  const name = rel(file);
  if (DEFINES.has(name)) continue;
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, cls] of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    for (const one of (cls ?? "").split(/\s+/).filter(Boolean)) {
      if (EDGE.some((re) => re.test(bare(one)))) {
        edges++;
        fail(`${name}: draws an edge — "${one}" (D7).\n` +
             `       A border and a shadow both say "this is a separate thing", and the\n` +
             `       design says it with VALUE. See \`ground.ts\`.`);
      }
    }
  }
}
if (!edges) ok(`edges: ${FILES.length} file(s), none draws a border or a shadow`);

/* ------------------------------------------------------------ the ground --- */

/**
 * ⚠️ AND NOTHING NEEDS TO, WHICH IS THE HALF THAT CANNOT BE LEFT TO CARE. Each
 * tier must clear the next by `MIN_DELTA` in BOTH themes — the light theme is
 * the one that was three percent apart, and it is also the one nobody renders
 * first.
 */
const GROUND_SRC = readFileSync(join(QUAD, "web/src/ground.ts"), "utf8");
const num = (re) => {
  const m = re.exec(GROUND_SRC);
  return m ? Number(m[1]) : null;
};
const floor = num(/export const MIN_DELTA = ([\d.]+)/);

const tiers = (mode) => {
  const block = new RegExp(`${mode}: \\{([\\s\\S]*?)\\}`).exec(GROUND_SRC)?.[1] ?? "";
  const read = (k) => {
    const m = new RegExp(`${k}: ([\\d.]+)`).exec(block);
    return m ? Number(m[1]) : null;
  };
  return { background: read("background"), surface: read("surface"), raised: read("raised") };
};

let gaps = 0;
for (const mode of ["light", "dark"]) {
  const t = tiers(mode);
  const unread = Object.entries(t).filter(([, v]) => v === null).map(([k]) => k);
  if (unread.length || floor === null) {
    gaps++;
    fail(`ground.ts: cannot read ${unread.join(", ") || "MIN_DELTA"} for ${mode} — the guard is blind.`);
    continue;
  }
  /* ⚠️ EVERY PAIR, NOT A LADDER. The first version of this checked
     background→surface→raised in order, which quietly assumed `raised` is the
     brightest — true in dark and false in light, where the ladder ends at white
     and a floating surface has to go the other way. An ordered check would have
     forced the island BETWEEN the page and a card, which is the one value it
     must not have. What matters is that no two tiers are confusable. */
  for (const [a, b] of [["background", "surface"], ["background", "raised"], ["surface", "raised"]]) {
    const delta = Math.abs(t[b] - t[a]);
    if (delta < floor) {
      gaps++;
      fail(`ground.ts: ${mode} ${a}→${b} is ${delta.toFixed(3)}, under the ${floor} floor.\n` +
           `       With no border and no shadow, that boundary is not findable — the card\n` +
           `       does not read as a card, in one theme, and nothing else says so.`);
    }
  }
}
if (!gaps) ok(`tiers: every surface clears the next by ${floor} in both themes`);

/**
 * ⚠️ AND THE TOKENS ARE ACTUALLY SET TO NONE. The ban above covers what WE
 * write; the library ships its own `--surface-shadow`, and a palette that
 * forbids shadows in our files while the components draw their own is a rule
 * that reads as kept and is not.
 */
const OFF = ["--surface-shadow", "--overlay-shadow", "--field-shadow", "--border"];
const unset = OFF.filter((k) => !new RegExp(`${k}: (?:none|transparent);`).test(GROUND_SRC));
if (unset.length) {
  fail(`ground.ts: ${unset.join(", ")} is not turned off, so the library still draws it.`);
} else {
  ok(`tokens: the library's own edges are off (${OFF.length})`);
}

/**
 * ⚠️ AND SOMETHING PAINTS THE GROUND, WHICH FOR A WHILE NOTHING DID. `html`,
 * `body`, the mount point and the `Page` were all transparent, so the page's
 * colour was the USER AGENT's canvas — dark only because a `color-scheme` meta
 * makes the browser paint a dark one. Every token in this file was correct and
 * reached nothing, and the tell was that light cards came out DARKER than the
 * page they sat on, which is a card that reads as a grey panel on white rather
 * than a surface raised off a ground.
 */
if (/html \{ background-color: var\(--background\)/.test(GROUND_SRC)) {
  ok(`painted: the page's ground is ours, not the user agent's canvas`);
} else {
  fail(`ground.ts: nothing paints \`--background\`, so the page is the browser's canvas.\n` +
       `       Every value above is then correct and reaches nothing — and a card comes\n` +
       `       out darker than the page in light, which is the whole dusty look.`);
}

console.log(bad
  ? `\nground: ${bad} finding(s) — an edge, or a boundary that needs one.`
  : `\nground: no borders, no shadows, and surfaces that carry themselves.`);
process.exit(bad ? 1 : 0);
