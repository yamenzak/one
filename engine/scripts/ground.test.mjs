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
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

const filesIn = (dir) => {
  const at = join(ENGINE, dir);
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
  ...filesIn("design/src"),
  ...filesIn("one-hub/src"),
  ...readdirSync(join(ENGINE, "apps"), { withFileTypes: true })
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
const DEFINES = new Set(["design/src/tokens/ground.ts"]);

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

  /*
    ⚠️ AND THE SAME PROPERTY IN A STYLE OBJECT, WHICH THIS DID NOT SEE. A
    utility class is how an edge is USUALLY drawn and it is not how an edge is
    drawn in an SVG-adjacent component — a composition bar reached for
    `borderInlineStart: "2px solid …"` in an inline style and passed a guard
    whose whole subject it was. Every narrow check gets around eventually; the
    fix is to ask the question about the property rather than about the syntax.
  */
  for (const [, prop] of src.matchAll(/\b(border[A-Za-z]*|boxShadow|outline[A-Za-z]*)\s*:/g)) {
    /* ⚠️ Turning one OFF is the point of this file's rule, so it is allowed. */
    const after = src.slice(src.indexOf(`${prop}:`)).slice(0, 80);
    if (/:\s*(?:"none"|"0"|0\b|undefined|"transparent")/.test(after)) continue;
    edges++;
    fail(`${name}: draws an edge in a style object — \`${prop}\` (D7).\n` +
         `       Same rule, different syntax. Separate two fills with a GAP that lets the\n` +
         `       ground through, the way the stacked marks already do.`);
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
const GROUND_SRC = readFileSync(join(ENGINE, "design/src/tokens/ground.ts"), "utf8");
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
  return {
    background: read("background"), surface: read("surface"),
    raised: read("raised"), control: read("control"),
  };
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
  /*
    ⚠️ EVERY PAIR, GENERATED — because the last version SAID "every pair" and
    then wrote five of the six by hand. The one it left out, background→control,
    is exactly the one that shipped: a hero's quick actions sit directly on the
    page, the control tier was 0.025 from it in light, and four chips on the
    ground read as smudges while the guard reported the palette sound. A pair
    list is a claim about where things sit, and where things sit is decided by
    screens this file never sees — so no pair is exempt, and an exemption
    somebody genuinely needs gets argued in here as code.
  */
  const names = Object.keys(t);
  const pairs = names.flatMap((a, i) => names.slice(i + 1).map((b) => [a, b]));
  for (const [a, b] of pairs) {
    const delta = Math.abs(t[b] - t[a]);
    if (delta < floor) {
      gaps++;
      fail(`ground.ts: ${mode} ${a}→${b} is ${delta.toFixed(3)}, under the ${floor} floor.\n` +
           `       With no border and no shadow, that boundary is not findable — the card\n` +
           `       does not read as a card, in one theme, and nothing else says so.`);
    }
  }
}
if (!gaps) ok(`tiers: every pair of surfaces clears ${floor} in both themes`);

/**
 * ⚠️ A CONTROL IS NEVER GREYER THAN THE GROUND UNDER IT. Value separation is
 * only half of visibility on a TINTED ground: a chip that is less saturated
 * than the field it sits on reads as a grey wash over colour — grime, not a
 * surface — however correct its lightness is. The control tier must carry at
 * least the richest ground's share of the brand, per theme.
 */
const share = (name) => {
  const m = new RegExp(`export const ${name} = \\{ light: (\\d+), dark: (\\d+) \\}`).exec(GROUND_SRC);
  return m ? { light: Number(m[1]), dark: Number(m[2]) } : null;
};
const groundShare = share("GROUND_TINT");
const controlShare = share("CONTROL_TINT");
if (!groundShare || !controlShare) {
  fail(`ground.ts: cannot read GROUND_TINT/CONTROL_TINT — the parity guard is blind.`);
} else {
  let dirty = 0;
  for (const mode of ["light", "dark"]) {
    if (controlShare[mode] < groundShare[mode]) {
      dirty++;
      fail(`ground.ts: ${mode} control carries ${controlShare[mode]}% of the brand against the ground's ${groundShare[mode]}%.
` +
           `       A chip greyer than the coloured field it sits on reads as grime, not a
` +
           `       surface — the dusty look, whatever its lightness is.`);
    }
  }
  if (!dirty) ok(`kin: the control tier is never greyer than the ground it sits on`);
}

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

/* ------------------------------------------------------------------ mono --- */

/**
 * THE INTERFACE IS MONOCHROME AND THE DATA IS COLOURED (D7).
 *
 * ⚠️ WHILE THE ACCENT WAS A HUE IT WAS ALSO EVERYTHING — the primary button, the
 * link, the nav pill, the switch, the sequential ramp. Present on every screen,
 * meaning nothing, and requiring a SECOND colour before anything could stand
 * out. At zero chroma the one coloured thing on a screen is, by construction,
 * the thing that matters.
 *
 * ⚠️ AND IT IS CHECKED RATHER THAN INTENDED, because the way this comes back is
 * not somebody arguing against it. It is one screen that needs "a bit more life"
 * and a two-character edit to a token, which nothing else in the tree would
 * notice.
 */
const chromaOf = (decl) => {
  const m = /oklch\(\s*[\d.]+\s+([\d.]+)/.exec(decl);
  return m ? Number(m[1]) : null;
};

let mono = 0;
const accents = [...GROUND_SRC.matchAll(/`--accent(?:-foreground)?: \$\{grey\(([^)]*)\)\};`/g)];
if (accents.length < 2) {
  mono++;
  fail(`ground.ts: \`--accent\` is not built from \`grey()\` in both themes.\n` +
       `       It is what the library paints every control with, so a hue there is a\n` +
       `       coloured interface — and then nothing on a screen can stand out by being\n` +
       `       the only coloured thing, which is the whole design.`);
}
for (const [, decl] of GROUND_SRC.matchAll(/`--(?:accent|default|surface[\w-]*|background): ([^`]*)`/g)) {
  const c = chromaOf(decl);
  if (c !== null && c > 0 && !/var\(--brand\)/.test(decl)) {
    mono++;
    fail(`ground.ts: a control token carries chroma — \`${decl.slice(0, 50)}\`.\n` +
         `       A tint mixed FROM \`--brand\` is the ground and is fine; a hue written here\n` +
         `       is an interface that is coloured on purpose.`);
  }
}

/**
 * ⚠️ THE HAIRLINE IS THE LIBRARY'S LITERAL, AND IT WAS INVISIBLE IN DARK — which
 * is not a matter of taste and was measured rather than noticed. HeroUI paints
 * `.separator` a fixed `oklch(0.25 0.006 286)`; our dark card is
 * `oklch(0.243 0 0)`. Seven thousandths of lightness apart, so every divider in
 * the product rendered, occupied a pixel and separated nothing. Light happened
 * to work, which is why it survived every review: the person looking was in
 * light.
 *
 * ⚠️ A FIXED COLOUR CANNOT DO THIS JOB. A hairline has to separate on the page,
 * on a card, on the raised tier and inside a sheet, in two themes — and only a
 * veil of the FOREGROUND is right on all of them at once, because it gets
 * brighter exactly where the ground gets darker. The literal also carried
 * chroma at hue 286 on a product whose whole interface is a value.
 */
if (!/`\.separator \{ background-color: color-mix\(in oklab, var\(--foreground\)/.test(GROUND_SRC)) {
  mono++;
  fail(`ground.ts: the separator is left as the library's literal.\n` +
       `       It is a fixed colour a hair away from our dark card, so every divider\n` +
       `       in the product is a pixel that separates nothing — and it is only ever\n` +
       `       looked at in light, where it happens to work.`);
}

/**
 * ⚠️ A FULL-SCREEN DIALOG WITH ITS OWN INSET IS A THIRD LAYER OF PADDING, and
 * on a phone it is measured in the width of the words. `.modal__dialog` is `p-6`
 * — correct for a CENTRED dialog, which floats and needs an edge — and the
 * library's `--full` variant overrides width, height, shadow and radius while
 * leaving that padding alone. Its own `.modal__container--full` zeroes padding
 * for exactly this reason; the dialog inside it was missed.
 *
 * ⚠️ THE HUB IS PRESENTED OVER A PRODUCT, so the same card was NARROWER inside
 * the hub than outside it on the same phone: 24 of dialog + 16 of gutter + 16 of
 * card, against the product's 16 + 16. A 390px screen gave 112px to nesting.
 */
if (!/`\.modal__dialog--full \{ padding: 0; \}`/.test(GROUND_SRC)) {
  mono++;
  fail(`ground.ts: the full-screen dialog keeps the library's centred inset.\n` +
       `       It is a third layer of horizontal padding under the band's gutter and\n` +
       `       the card's own, so every presented screen is narrower than the same\n` +
       `       screen outside the overlay — on the size where it matters most.`);
}

/**
 * ⚠️ FOCUS IS THE ONE THING THAT MUST NOT FOLLOW, and it is the half that gets
 * forgotten because it is the library's default rather than anything we wrote:
 * HeroUI ships `--focus: var(--accent)`. Left alone, going monochrome makes the
 * focus ring monochrome too — on an interface that is otherwise all values,
 * which is exactly where it is least findable. Somebody navigating by keyboard
 * loses the only thing telling them where they are.
 */
if (!/`--focus: \$\{FOCUS\};`/.test(GROUND_SRC)) {
  mono++;
  fail(`ground.ts: \`--focus\` is not pinned, so it inherits the accent.\n` +
       `       A monochrome focus ring on a monochrome interface is the one somebody\n` +
       `       navigating by keyboard cannot find.`);
} else if ((chromaOf(/export const FOCUS = "([^"]*)"/.exec(GROUND_SRC)?.[1] ?? "") ?? 0) <= 0.05) {
  mono++;
  fail(`ground.ts: \`FOCUS\` has no chroma to speak of — it has to be a HUE.`);
}

/**
 * ⚠️ AND A WORKSPACE SETS `--brand`, NEVER `--accent`. The moment a tenant can
 * write the accent the interface is coloured again, by somebody who has not read
 * any of this — and it is a one-word change in a file about branding, which is
 * the last place anybody would look for it.
 */
const THEME_SRC = readFileSync(join(ENGINE, "design/src/tokens/theme.ts"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");
if (/put\(TOKENS\.accent/.test(THEME_SRC) || /accent: "--accent"/.test(THEME_SRC)) {
  mono++;
  fail(`design/src/tokens/theme.ts: a workspace can still write \`--accent\`.\n` +
       `       Their colour is \`--brand\` — the ground, the surfaces and the ambience.\n` +
       `       The accent is the interface, and the interface is ours and monochrome.`);
}

/**
 * ⚠️ AND NO CHART MARK READS THE ACCENT, because a mark that MEASURES would then
 * be grey — and grey already means de-emphasis on a plot here. "More of it" and
 * "not the subject" would be the same language, on the same chart.
 */
for (const file of FILES.filter((f) => rel(f).startsWith("design/src/chart/"))) {
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  if (/var\(--accent\)/.test(src)) {
    mono++;
    fail(`${rel(file)}: a chart mark reads \`--accent\`, which is monochrome now.\n` +
         `       Data uses \`DATA\` (\`--data\`) — the interface is mono, the data is coloured,\n` +
         `       and the data's colours are the platform's.`);
  }
}

if (!mono) ok(`mono: the interface is values, the data is hues, and focus is neither`);

console.log(bad
  ? `\nground: ${bad} finding(s) — an edge, or a boundary that needs one.`
  : `\nground: no borders, no shadows, one monochrome interface, one coloured data.`);
process.exit(bad ? 1 : 0);
