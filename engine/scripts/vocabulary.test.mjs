/**
 * WHAT A SCREEN MAY DECLARE, AND WHETHER IT IS STILL THERE.
 *
 * @design a screen composes the vocabulary; it does not re-derive it.
 *
 * ⚠️ THE REGISTRY IS THE ONE PLACE A DECLARED SCREEN AND A DRAWN COMPONENT
 * MEET, AND NOTHING ELSE CHECKS THE JOIN. `kernel/src/blocks.ts` names forty
 * components by string; the kernel cannot import the design package (React in a
 * Worker, and the layering runs the other way), so a renamed export leaves the
 * entry pointing at nothing — and the failure is a manifest refused for naming a
 * block that plainly exists, or worse, a blank region where a card was.
 *
 * ⚠️ AND IT REFUSES IN BOTH DIRECTIONS, which is the half that stops the
 * vocabulary rotting. An entry naming a component that is gone is loud. A
 * component that COULD be a block and is in no registry is silent: it exists, it
 * works, every guard is green, and no screen can ever ask for it — so the next
 * app hand-rolls the thing that was already built. That is the exact shape this
 * whole arc exists to remove, one level up.
 *
 * ⚠️ SO EVERY CANDIDATE IS CLASSIFIED AND THE LIST CAN ONLY SHRINK. A candidate
 * is an exported component that takes no `children`, because `children` means
 * "the caller composes" and a declaration cannot compose. Each one is a block or
 * is named below with a reason. A name in neither list fails, by name, with what
 * to do about it.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/* -------------------------------------------------------------- the source --- */

/** Where a block could come from. `rendered/` is a whole surface, not a block. */
const HOMES = ["parts", "frame", "chart"];

const files = [];
for (const home of HOMES) {
  const at = join(ENGINE, "design/src", home);
  for (const f of readdirSync(at)) {
    if (/\.tsx?$/.test(f)) files.push({ at: `design/src/${home}/${f}`, text: readFileSync(join(at, f), "utf8") });
  }
}

/**
 * ⚠️ THE ARGUMENT LIST IS READ BY SCANNING BRACKETS, NOT BY A REGEX, and the
 * first draft's regex is the reason this is written out. A lazy `\(…\)` stops
 * at the first `)` inside a destructured default or a generic, so five real
 * components — every row that spreads `RowBase`, and `Listing`, which is
 * generic — were reported as "not exported by the design package". A guard
 * whose parser is wrong reports the tree as broken and is believed.
 */
const balanced = (text, from) => {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (!depth) return text.slice(from + 1, i); }
  }
  return "";
};

/** ⚠️ A component, never a constant: PascalCase has a lower-case letter in it. */
const isComponent = (name) => /^[A-Z]/.test(name) && /[a-z]/.test(name) && !name.includes("_");

/** Every exported component, and whether it takes `children`. */
const exported = new Map();
for (const { at, text } of files) {
  for (const m of text.matchAll(/^export function ([A-Z]\w*)\s*(?:<[^>]*>)?\s*\(/gm)) {
    if (!isComponent(m[1])) continue;
    const args = balanced(text, m.index + m[0].length - 1);
    exported.set(m[1], { at, composes: /\bchildren\b/.test(args) });
  }
  for (const m of text.matchAll(/^export const ([A-Z]\w*)\s*[:=]/gm)) {
    if (!isComponent(m[1]) || exported.has(m[1])) continue;
    exported.set(m[1], { at, composes: false });
  }
}

/* ------------------------------------------------------------ the registry --- */

const registry = readFileSync(join(ENGINE, "kernel/src/blocks.ts"), "utf8");
const declared = new Set();
for (const m of registry.matchAll(/block\("(\w+)"/g)) declared.add(m[1]);
/* ⚠️ The charts are made by one helper over a list, so the list is where they are. */
const charts = registry.match(/\[\s*\n?\s*"LineChart"[\s\S]*?\]\.map/);
if (!charts) {
  fail("kernel/src/blocks.ts: the chart list is gone, so this guard is checking a smaller set than it thinks");
} else {
  for (const m of charts[0].matchAll(/"(\w+)"/g)) declared.add(m[1]);
}

/* ---------------------------------------------------- every entry is real --- */

{
  let missing = 0;
  for (const id of declared) {
    if (!exported.has(id)) {
      missing++;
      fail(`kernel/src/blocks.ts declares "${id}", which @engine/design does not export.\n`
        + `       A screen naming it composes and then draws nothing.`);
    }
  }
  if (!missing) ok(`registry: ${declared.size} block(s), every one a real export`);
}

/* --------------------------------------------- and every candidate is placed --- */

/**
 * ⚠️ FOUR CATEGORIES AND A SENTENCE EACH, NEVER A FLAG. "Not a block" as a
 * boolean is a box somebody ticks to make a guard quiet; a category has to be
 * argued for, and the wrong one is visible in review.
 *
 * ⚠️ AND THE LISTS CAN ONLY SHRINK. A name that becomes a block is a name this
 * guard fails on until it is deleted from here — so an exemption cannot rot into
 * a permanent one.
 */
const WHY = {
  /* Named in `Format`. A binding picks one; it is not placed on its own. */
  formatter: ["Num", "Money", "When", "Size", "Unit", "Tally", "Dated", "Clock", "Amount", "Code"],
  /*
    What the frame draws AROUND a block. Never placed by a declaration.

    ⚠️ `Region` IS THE FRAME ITSELF, which is why it belongs here rather than in
    the registry. It draws the four outcomes around whichever block it is given,
    using the skeleton that block declares — so a screen that could place a
    `Region` would be placing the thing that places blocks.
  */
  state: [
    "Region",
    "Trouble", "Nothing", "Working", "RowsWaiting", "HeroWaiting", "FigureWaiting",
    "ChartWaiting", "TilesWaiting", "TableWaiting", "FormWaiting", "TextWaiting",
    "ShapeWaiting", "Waiting",
  ],
  /* The shell draws it. A body cannot place its own crown. */
  chrome: [
    "Shell", "Crown", "PageCrown", "Glyph", "Island", "LeaveChip", "Menu", "NoticeHost",
    "Mark", "AsideRoute", "LegalLine", "Renewal", "Story", "Lockup", "Opening", "Beep",
  ],
  /*
    A CONTROL — it holds an answer somebody has not saved yet. That is a story's
    business and never a body's (D-surface: a screen is a body or a story), so
    these are the components a story's own code reaches for.
  */
  control: [
    "TextInput", "SecretInput", "LongText", "SearchInput", "NumberInput", "MoneyInput",
    "Dial", "Choice", "Lookup", "Agree", "Picks", "OneOf", "Segmented", "Tags", "Words",
    "DateInput", "TimeInput", "CodeEntry", "PeriodInput", "Colour", "DayPicker", "DayField",
    "Ranged", "PickFile", "FileRow", "Viewfinder", "SettledSwitch", "Filters", "Found",
    "ToggleRow", "PermissionRow", "Paged", "PlainTable", "Written",
  ],
  /*
    A PIECE OF ANOTHER BLOCK. It is drawn by something in the registry rather
    than placed beside it — a face inside a row, a swatch inside a brand tile.
  */
  inside: [
    "Orb", "Faces", "Swatch", "BrandTile", "Identity", "Place", "Glass", "Money",
    "OfferRow", "Credits", "Banner", "Figure", "Balance", "LabelText", "Diamond",
    "Hotkey", "Compare", "Rings", "Ring", "Arc", "StatRow", "ChartPanel",
    "Agenda", "PageTabs", "ListingTable", "Tail",
  ],
  /*
    A DRAWN MARK. `marks.tsx` is the bespoke half of the icon set — a shape with
    its own moving parts, reached through `glyphOf` by name. A body places the
    BLOCK that wears one; it never places a glyph on its own, which would be a
    picture with no sentence beside it.
  */
  mark: [
    "BellMark", "CalendarMark", "LeaveMark", "ShareMark", "InboxMark", "ShieldMark",
    "CheckMark", "SearchMark", "KeyMark", "LayersMark", "AgreedMark", "RefreshMark",
    "FlagMark", "ScanMark", "TallyMark",
  ],
  /*
    PLUMBING. It arranges, provides or chooses — it draws nothing of its own, so
    there is nothing for a declaration to place or bind.
  */
  plumbing: ["Spacer", "Await", "ReadingProvider", "Whichever"],
};

const placed = new Map();
for (const [why, names] of Object.entries(WHY)) {
  for (const name of names) placed.set(name, why);
}

{
  let loose = 0;
  let stale = 0;
  for (const [name, { at, composes }] of exported) {
    if (composes) continue;
    const why = placed.get(name);
    if (declared.has(name)) {
      if (why) {
        stale++;
        fail(`${name} is a block AND is exempted as "${why}" in scripts/vocabulary.test.mjs.\n`
          + `       Delete the exemption — it can only shrink.`);
      }
      continue;
    }
    if (why) continue;
    loose++;
    fail(`${at}: ${name} takes no children and is neither a block nor classified.\n`
      + `       Add it to kernel/src/blocks.ts, or say why it is not one `
      + `(formatter | state | chrome | control | inside | mark | plumbing).`);
  }
  if (!loose && !stale) {
    ok(`candidates: ${exported.size} export(s), every childless one placed or classified`);
  }
}

/* ------------------------------------------------------- and it can be drawn --- */

/**
 * ⚠️ A SLOT NAMING A KIND OF SOURCE THAT IS NOT ONE IS A REFUSAL THAT NEVER
 * FIRES. `refuseSurface` asks whether a binding's source is in the slot's
 * `takes`; a typo there does not fail — it just never matches, so every binding
 * to that slot is refused as the wrong kind, on a screen that is correct.
 */
{
  const KINDS = new Set(["field", "subject", "view", "count", "words"]);
  let wrong = 0;
  for (const m of registry.matchAll(/takes:\s*\[([^\]]*)\]|slot\([^,]+,\s*\[([^\]]*)\]/g)) {
    for (const k of (m[1] ?? m[2] ?? "").matchAll(/"(\w+)"/g)) {
      if (!KINDS.has(k[1])) {
        wrong++;
        fail(`kernel/src/blocks.ts: a slot takes "${k[1]}", which is not a kind of source.\n`
          + `       Every binding to it will be refused as the wrong kind.`);
      }
    }
  }
  if (!wrong) ok("slots: every declared kind is one a binding can actually be");
}

console.log(bad
  ? "\nvocabulary: the registry and the design package disagree."
  : "\nvocabulary: every block is real, and everything that could be one is placed.");
process.exit(bad ? 1 : 0);
