/**
 * ONE TYPE LADDER, AND NOTHING ELSE SETS A SIZE (D7).
 *
 * @design every size is a rung of one ladder, and only `type.ts` writes one.
 *
 * ⚠️ NAMING THE ROLE WAS HALF OF IT AND THE FILE ITSELF WAS THE OTHER HALF.
 * `TYPE` moved the decision to one place — and then held ten hand-picked sizes
 * in six mechanisms: `text-sm`, `text-base`, `text-xl`, `text-2xl`, `text-6xl`
 * and four bracketed rems. Each was right where it was written and none was in a
 * relationship with any other, so `section` at 20 and `group` at 16 read as one
 * rank while `title` at 32 sat two steps above `section` with nothing between.
 * A system whose values are individually defensible and collectively arbitrary
 * is the exact failure this repository is a catalogue of.
 *
 * ⚠️ SO THE CHECK IS ARITHMETIC, NOT A LIST. It reads `BASE` and `RATIO` out of
 * `type.ts`, computes the ladder, and refuses any size in the file that is not
 * on it. A rung nobody named is still a rung; a number nobody can derive is a
 * literal wearing a token's clothes.
 *
 * ⚠️ AND THE SECOND HALF IS THAT NOTHING ELSE MAY WRITE ONE. A component that
 * picks its own `text-sm` is a component outside the ladder, and it will look
 * correct on the screen it was built for. The exemptions are held BY NAME with a
 * reason each, because a pattern is an exemption a new file can wander into.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appDirs } from "./lib/trees.mjs";
import { RANKS } from "./lib/ladder.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

const TYPE_FILE = "design/src/tokens/type.ts";
/*
  ⚠️ COMMENTS OUT FIRST, AND THIS FILE IS THE REASON THE RULE EXISTS. Every
  paragraph here explains the sizes it replaced BY NAMING THEM — "`text-2xl`",
  "2.75rem" — so a check reading the raw text finds the argument for the ladder
  and reports it as a breach of the ladder. Every guard in this repo that matched
  a file's prose has had this bug once.
*/
const withoutComments = (of) => of
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const src = withoutComments(readFileSync(join(ENGINE, TYPE_FILE), "utf8"));

/* ------------------------------------------------------------- the ladder --- */

/**
 * ⚠️ READ, NEVER RESTATED. A guard holding its own copy of the ratio is a guard
 * that passes a file which changed it.
 */
const number = (name) => {
  const m = src.match(new RegExp(`const ${name} = ([\\d.]+);`));
  if (!m) throw new Error(`${TYPE_FILE} no longer declares \`${name}\``);
  return Number(m[1]);
};
const BASE = number("BASE");
const RATIO = number("RATIO");

/** ⚠️ Wider than any rank names, so a size just off the ladder is still caught. */
const RUNGS = new Set(
  Array.from({ length: 16 }, (_, i) => (BASE * RATIO ** (i - 4)).toFixed(3)));

/** ⚠️ Every role, as `[name, value]`, with the value's interpolations intact. */
const ROLES = (() => {
  /* ⚠️ THE CLOSE IS FOUND FROM THE OPEN, NOT FROM THE TOP OF THE FILE. `RANK` is
     also `} as const;` and it is declared FIRST, so a search from zero found the
     wrong brace, sliced backwards and returned an empty block — a guard reporting
     "all 0 roles pass", which is the failure shape this whole script is about. */
  const from = src.indexOf("export const TYPE = {");
  const to = src.indexOf("\n} as const;", from);
  return [...src.slice(from, to).matchAll(/^ {2}(\w+): ([`"][^\n]*[`"]),$/gm)]
    .map((m) => [m[1], m[2]]);
})();

{
  if (!ROLES.length) fail(`${TYPE_FILE}: no roles found — has \`TYPE\` moved?`);

  /*
    ⚠️ THE SIZE IS ASKED FOR BY RANK, NEVER WRITTEN. A role is allowed exactly
    two shapes — `${at("rank")}` and `${atWide("rank")}` — and TypeScript refuses
    a rank that is not on the ladder, so a size that compiles is a size that is
    on it. What this catches is the OTHER door: a literal typed back in.
  */
  const typed = ROLES.filter(([, value]) =>
    /text-\[[\d.]+rem\]|\btext-(?:xs|sm|base|lg|\d?xl)\b/.test(value));
  if (typed.length) {
    fail(`${TYPE_FILE}: ${typed.length} role(s) type a size rather than ask for a rank `
      + `— ${typed.map((r) => r[0]).join(", ")}.\n`
      + `       Every size is \`at(rank)\`. A literal here cannot be derived from `
      + `BASE ${BASE} and RATIO ${RATIO}, so it is not on the ladder at all.`);
  } else {
    ok(`ladder: all ${ROLES.length} role(s) take a rank of ${BASE} × ${RATIO}ⁿ`);
  }

  /* ⚠️ …and every role that draws words asks for one. A role with no size is a
     role that inherits whatever it landed in. */
  /* ⚠️ A FIT IS NOT A ROLE. `lockupFamily` and `lockupMember` are the two halves
     of a drawn lockup and carry weight and tracking only, because a lockup is
     set at four scales from a nav row to a door and the CALLER sets which — see
     the note beside them. `figures`, `strong` and `minor` are modifiers riding
     on text that already has a size. */
  const RANKLESS = new Set([
    "figures", "strong", "minor", "lockupFamily", "lockupMember",
  ]);
  const sizeless = ROLES.filter(([name, value]) =>
    !RANKLESS.has(name) && !/\bat(?:Wide)?\(/.test(value));
  if (sizeless.length) {
    fail(`${TYPE_FILE}: ${sizeless.length} role(s) name no size — `
      + `${sizeless.map((r) => r[0]).join(", ")}.\n`
      + `       A role that inherits its size is a role whose rank depends on where `
      + `somebody dropped it.`);
  } else {
    ok(`ladder: every role that sets words asks for a rung`);
  }

  /* ⚠️ AND `step` IS THE ONLY THING THAT PRODUCES A REM. A second producer is a
     second ladder, which is the state this file exists to leave. `step`'s own is
     computed — `…toFixed(3)}rem` — so a rem with digits in front of it is
     somebody typing a size back in. */
  const typedRems = [...src.matchAll(/[\d.]+rem/g)].map((m) => m[0]);
  if (typedRems.length) {
    fail(`${TYPE_FILE}: ${typedRems.length} typed rem(s) — ${[...new Set(typedRems)].join(", ")}.\n`
      + `       \`step\` is the only thing here that produces a size.`);
  } else if (!/RATIO \*\* n\)\.toFixed\(3\)}rem/.test(src)) {
    fail(`${TYPE_FILE}: \`step\` no longer computes the rung — has the ladder moved?`);
  } else {
    ok("ladder: `step` is the only thing in the file that produces a size");
  }

  /*
    ⚠️ AND THE RUNG HAS TO SURVIVE THE SCANNER, WHICH IS WHERE IT DIED TWICE.
    `at()` returns a Tailwind class and Tailwind reads SOURCE text: a class built
    at runtime is never emitted, and `text-[var(--x)]` IS emitted — as an INK,
    because a bare variable could be either and colour is the default. Both
    drafts were arithmetically perfect, both compiled, and under both every role
    on every screen inherited its size. So the shape is asserted, once, here:
    one literal per rank, naming its own rank, with the `length:` hint that makes
    it a size. Neither failure is visible in TypeScript and neither shows up in a
    diff as anything but a string.
  */
  const ranks = [...RANKS.keys()];
  const wrong = [];
  for (const map of ["AT", "AT_WIDE"]) {
    const wide = map === "AT_WIDE" ? "md:" : "";
    const from = src.indexOf(`const ${map}: Readonly<Record<Rank, string>> = {`);
    const decl = from < 0 ? "" : src.slice(from, src.indexOf("\n};", from));
    for (const rank of ranks) {
      const want = `${rank}: "${wide}text-[length:var(--rank-${rank})]`
        + ` ${wide}leading-[var(--lead-${rank})]"`;
      if (!decl.includes(want)) wrong.push(`${map}.${rank}`);
    }
  }
  if (!ranks.length) {
    fail(`${TYPE_FILE}: \`RANK\` declares no rungs — has the ladder moved?`);
  } else if (wrong.length) {
    fail(`${TYPE_FILE}: ${wrong.length} rung(s) do not reach the page — ${wrong.join(", ")}.\n`
      + `       Each is the literal \`text-[length:var(--rank-<rank>)]\`, written out `
      + `in full. Built at runtime the scanner never sees it; without \`length:\` `
      + `Tailwind emits it as a COLOUR and the size silently never applies.`);
  } else {
    ok(`ladder: all ${ranks.length} rung(s) reach the page as a size, at both widths`);
  }

  /* ⚠️ AND THE LEADING IS THE RUNG'S, NEVER THE ROLE'S. A named Tailwind size
     carries a line-height and an arbitrary one carries none, so the roles moving
     onto the ladder silently made every one of them inherit its leading from
     whatever it was dropped into — the same `label` measured 22.86px in a
     pressable row and 24px in one that was not. A hand-picked `leading-[1.1]`
     here is the ladder's own argument, refused in the property nobody watches. */
  const led = ROLES.filter(([, value]) =>
    /\bleading-(?!\[var\(--lead-)[\w[]/.test(value));
  if (led.length) {
    fail(`${TYPE_FILE}: ${led.length} role(s) pick their own leading — `
      + `${led.map((r) => r[0]).join(", ")}.\n`
      + `       A rung carries its own — \`lead(n)\` — so two roles at one size `
      + `cannot sit at two line heights.`);
  } else if (!/LEAD_TIGHTEN \* n/.test(src)) {
    fail(`${TYPE_FILE}: \`lead\` no longer computes the leading — has the ramp moved?`);
  } else {
    ok("ladder: leading comes with the rung, and no role names its own");
  }
}

/* ----------------------------------------------------------------- the ink --- */

/**
 * ⚠️ A ROLE THAT INHERITS ITS INK IS A ROLE WHOSE COLOUR DEPENDS ON WHERE IT WAS
 * DROPPED. Half of them stated one and half did not — so the same `group`
 * heading was full contrast on a card and the muted grey of a note inside a row
 * that had set its own colour, and neither call site was wrong.
 */
{
  /* ⚠️ THE THREE THAT DELIBERATELY CARRY NO INK, and each is a MODIFIER rather
     than a role: `figures` is a numeral variant, `strong` a weight inside a
     sentence, `minor` the fraction of an amount. All three ride on text that has
     already stated its colour, and stating a second one would override it. */
  const INKLESS = new Set([
    "figures", "strong", "minor", "lockupFamily", "lockupMember",
    /* ⚠️ AND THE OPENING INHERITS ON PURPOSE. It is set on the CURTAIN, which is
       the one surface in the product that is not on the elevation ladder and
       carries its own ink; a role stating `--foreground` there would be the
       page's colour on a ground the page never has. */
    "opening",
  ]);
  const bare = ROLES.filter(([name, value]) =>
    !INKLESS.has(name) && !/text-(?:foreground|muted)\b/.test(value));
  if (bare.length) {
    fail(`${TYPE_FILE}: ${bare.length} role(s) name no ink — ${bare.map((r) => r[0]).join(", ")}.\n`
      + `       A role that inherits is a role whose colour is decided by wherever `
      + `it was dropped.`);
  } else {
    ok(`ink: all ${ROLES.length - INKLESS.size} role(s) that colour words state their own`);
  }
}

/* --------------------------------------------------------- nowhere else --- */

/**
 * ⚠️ THE EXEMPTIONS ARE BY NAME AND EACH ONE IS A SENTENCE. A wildcard — "tests
 * may", "anything under tokens may" — is a door a new file walks through without
 * anybody deciding.
 */
const ALLOWED = new Map([
  ["design/src/tokens/type.ts", "the ladder itself"],
  /* ⚠️ A `Face`'s letter is sized WITH its plate by the library's own variant —
     see `VARIANT` there — so the size is the avatar's, not the text ladder's. */
  ["design/src/parts/face.tsx", "the library sizes an avatar's fallback letter with its plate"],
  /* ⚠️ The mark is drawn geometry, not set text: its weight is the wordmark's
     and its size is the lockup's. */
  ["design/src/parts/logo.tsx", "a drawn mark, sized by the lockup rather than by the ladder"],
  /* ⚠️ `TILE.panel`/`TILE.chip` size a plate AND the letter in it together, for
     the same reason `face.tsx` is here. */
  ["design/src/tokens/metrics.ts", "a plate and the letter inside it are one size"],
  /* ⚠️ The harness reports what a screen SET; it draws nothing that ships. */
  ["design/src/measure/index.tsx", "the harness that measures type, and draws none"],
]);

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

/**
 * ⚠️ SIZES AND WEIGHTS, NEVER ALIGNMENT OR INK. `text-center`, `text-balance`
 * and `text-danger` are placement and tone — the first two are the caller's and
 * the third is `data-ink`'s. What is refused is a component deciding how big its
 * words are and how heavy.
 */
const OWN_TYPE = /\b(?:text-(?:xs|sm|base|lg|\d?xl|\[[\d.]+rem\])|font-(?:thin|light|normal|medium|semibold|bold|extrabold|black))\b/g;

{
  const files = [
    ...filesIn("design/src"),
    ...filesIn("one-space/src"),
    ...filesIn("ground/src"),
    ...appDirs().flatMap((d) => filesIn(`${d}/src`)),
  ];
  let loose = 0;
  let checked = 0;
  for (const file of files) {
    const where = rel(file);
    if (ALLOWED.has(where)) continue;
    checked++;
    const body = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const found = [...new Set([...body.matchAll(OWN_TYPE)].map((m) => m[0]))];
    if (!found.length) continue;
    loose++;
    fail(`${where}: sets its own type — ${found.join(", ")}.\n`
      + `       A size or a weight comes from \`TYPE\`. A file that picks its own `
      + `is a file outside the ladder, and it looks right on the screen it was `
      + `built for.`);
  }
  if (!loose) ok(`one place: ${checked} file(s) draw, and only the ladder sets a size`);
}

/* --------------------------------------------------------------- the icons --- */

/**
 * ⚠️ AN ICON IS A MARK AT A TEXT'S WEIGHT, SO ITS SIZE IS A RUNG. `ICON` held
 * 20, 20, 22, 24, 26 and 28 — six numbers, none derivable, each right on the
 * screen it was chosen on. A ladder that stops at the edge of the DOM has a
 * second undeclared ladder beside it.
 */
{
  const metrics = readFileSync(join(ENGINE, "design/src/tokens/metrics.ts"), "utf8");
  const block = metrics.slice(metrics.indexOf("export const ICON = {"));
  const decl = block.slice(0, block.indexOf("} as const;"));
  const literal = [...decl.matchAll(/^\s{2}\w+:\s*(\d+)/gm)].map((m) => m[1]);
  if (literal.length) {
    fail(`design/src/tokens/metrics.ts: ${literal.length} icon size(s) typed rather than derived `
      + `— ${literal.join(", ")}.\n       Every one is \`pixels(RANK.…)\`.`);
  } else {
    const rungs = [...decl.matchAll(/pixels\(RANK\.(\w+)\)/g)].map((m) => m[1]);
    ok(`icons: ${rungs.length} size(s), all rungs — ${[...new Set(rungs)].join(", ")}`);
  }
}

console.log(bad
  ? `\ntype: ${bad} finding(s) — the ladder is not the only one.`
  : "\ntype: one ladder, derived, and nothing else sets a size.");
process.exit(bad ? 1 : 0);
