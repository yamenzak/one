/**
 * NO HEROUI COMPONENT IS RESTYLED (D7).
 *
 * ⚠️ CONSISTENCY THAT IS MAINTAINED BY CARE LASTS UNTIL THE FIRST HURRIED SCREEN.
 * The library is used as it ships and themed through tokens, so a workspace's
 * brand is a handful of variable values and every component adapts — but only
 * while no screen has quietly overridden a colour, a radius or a border. One
 * that has is a screen a tenant's branding does not reach, and nobody finds out
 * until a customer with a strong brand asks why one page still looks like ours.
 *
 * ⚠️ PLACEMENT IS NOT RESTYLING, AND PRETENDING OTHERWISE MAKES THE RULE
 * UNUSABLE. A component has to be put somewhere: given a width, a column, a
 * gap. What it must not be given is a different appearance. So the check is an
 * allow-list of layout utilities rather than a ban on `className`, and every
 * entry below is about WHERE a thing sits rather than what it looks like.
 *
 * ⚠️ AND THE FORBIDDEN LIST IS NOT THE MECHANISM — the allow-list is. A
 * deny-list is one Tailwind release behind for ever; anything unrecognised is
 * refused here, so a new utility is a decision somebody makes on purpose.
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
      else if (/\.tsx$/.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

/**
 * ⚠️ EVERY DIRECTORY IN THIS TREE THAT DRAWS SOMETHING, and `one-hub` is named
 * here because it is the largest of them: the Hub is the first surface anybody
 * sees, and a guard that covered the shared package and the reference app while
 * leaving the real screens out would be a guard that reports green about the
 * files nobody checked.
 */
const FILES = [
  ...filesIn("web/src"),
  ...filesIn("one-hub/src"),
  ...readdirSync(join(QUAD, "apps"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => filesIn(`apps/${e.name}/src`)),
];

/**
 * ⚠️ WHERE A THING SITS, NOT WHAT IT LOOKS LIKE. Sizing, spacing between
 * siblings, flex and grid placement, and visibility. Deliberately absent:
 * padding (a component's own density), colour, border, radius, shadow, ring,
 * opacity and type — each of those is the library's answer, and a screen with a
 * different one is a screen branding does not reach.
 */
const LAYOUT = [
  /^(w|h|min-w|max-w|min-h|max-h|size)-/,
  /^(m|mt|mr|mb|ml|mx|my)-/,
  /^(flex|grid|inline-flex|inline-grid|block|inline|contents|hidden)$/,
  /^(flex|grid|basis|grow|shrink|order|col|row|justify|items|self|content|place)-/,
  /* ⚠️ Bare `grow` and `shrink` are the same utilities without a value, and the
     pattern above requires a hyphen — so a component asked to take the
     remaining space was refused as a restyle. Placement, not appearance. */
  /^(grow|shrink)$/,
  /^gap(-x|-y)?-/,
  /^(absolute|relative|fixed|sticky|static)$/,
  /^(inset|top|right|bottom|left|z)-/,
  /^(overflow|overscroll)-/,
  /^(sr-only|not-sr-only|truncate|whitespace-nowrap)$/,
  /^(aspect|columns)-/,
];

/**
 * ⚠️ AN INTERPOLATION NAMING A METRIC IS ALLOWED, AND ANYTHING ELSE IS NOT. Once
 * the spacing moved into `metrics.ts`, every placement read `${ROW.pad}` — which
 * this could neither verify nor sensibly refuse. Resolving the names it knows is
 * the honest middle: a metric is layout by construction (its own guard says so),
 * and an interpolation of anything else is a value this check cannot see, which
 * is exactly what it must not wave through.
 */
const METRICS = /^\$\{(?:ROW|SPACE|WIDTH)\.\w+\}$|^\$\{(?:LEAD|HEAD_GAP|GUTTER|BAND_PAD|NAV_SPACE|ACTION_SPACE|SAFE_BOTTOM)\}$/;

/** ⚠️ A responsive or state prefix does not change what the utility IS. */
const bare = (cls) => cls.replace(/^(?:[a-z0-9]+:)+/, "").replace(/^[!-]/, "");

const layoutOnly = (cls) => METRICS.test(cls) || LAYOUT.some((re) => re.test(bare(cls)));

/**
 * ⚠️ HEROUI COMPONENTS ARE FOUND BY WHAT WAS IMPORTED, not by a hardcoded list.
 * A list would silently stop covering the component added next week — which is
 * exactly the one somebody is in a hurry about.
 */
function heroComponents(src) {
  const out = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']@heroui\/react["']/g)) {
    for (const name of m[1].split(",")) {
      const clean = name.trim().split(/\s+as\s+/).pop().trim();
      if (/^[A-Z]/.test(clean)) out.add(clean);
    }
  }
  return out;
}

let checked = 0;
let restyled = 0;

for (const file of FILES) {
  const src = readFileSync(file, "utf8");
  const hero = heroComponents(src);
  if (!hero.size) continue;
  checked++;

  /* Every opening tag, with its attributes, for a component we imported. */
  const tags = src.matchAll(/<([A-Z][\w.]*)\b([^>]*)>/g);
  for (const [, tag, attrs] of tags) {
    const base = tag.split(".")[0];
    if (!hero.has(base)) continue;

    const cls = attrs.match(/className=(?:"([^"]*)"|\{`([^`]*)`\})/);
    if (cls) {
      for (const one of (cls[1] ?? cls[2] ?? "").split(/\s+/).filter(Boolean)) {
        if (!layoutOnly(one)) {
          restyled++;
          fail(`${rel(file)}: <${tag} className="… ${one} …"> restyles a component (D7).\n` +
               `       Theme it through tokens, or place it with a layout utility.`);
        }
      }
    }

    /* ⚠️ AND `style` IS THE SAME THING WITH FEWER LETTERS. It also beats every
       token, so a component carrying one stops responding to branding entirely. */
    if (/\bstyle=\{/.test(attrs)) {
      restyled++;
      fail(`${rel(file)}: <${tag} style={…}> overrides the theme outright (D7).\n` +
           `       An inline style beats every token, so branding no longer reaches it.`);
    }
  }
}

if (!restyled) ok(`restyle: ${checked} file(s) using HeroUI, none override its appearance`);

/**
 * ⚠️ AND NOBODY REACHES PAST THE LIBRARY FOR SOMETHING IT SHIPS. A hand-rolled
 * button is a control that misses the focus ring, the pressed state, the
 * disabled semantics and the keyboard behaviour React Aria gives us — and it
 * looks fine, which is why it survives review.
 */
const HAND_ROLLED = [
  [/<button\b/, "a raw <button> — use Button"],
  [/<select\b/, "a raw <select> — use Select"],
  [/<input\b/, "a raw <input> — use TextField or Input"],
  [/<dialog\b/, "a raw <dialog> — use Modal"],
];
let raw = 0;
for (const file of FILES) {
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [re, why] of HAND_ROLLED) {
    if (re.test(src)) {
      raw++;
      fail(`${rel(file)}: ${why} (D7).\n` +
           `       A hand-rolled control misses the focus, pressed, disabled and keyboard behaviour.`);
    }
  }
}
if (!raw) ok(`library: nothing hand-rolls a control HeroUI ships`);

console.log(bad
  ? `\nheroui: ${bad} finding(s) — a screen branding will not reach.`
  : `\nheroui: components as they ship, themed through tokens.`);
process.exit(bad ? 1 : 0);
