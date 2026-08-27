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

/**
 * ⚠️ THE DESTRUCTURED NAMES, WHICH IS WHAT A SLOT HAS TO MATCH. Reading the
 * TYPE would be reading what the component says it accepts; reading the
 * destructuring is reading what it actually pulls out and uses, and those differ
 * exactly where a prop was renamed and one of the two was missed.
 */
const propsIn = (args) => {
  const brace = args.indexOf("{");
  if (brace < 0) return [];
  let depth = 0, end = brace;
  for (let i = brace; i < args.length; i++) {
    if (args[i] === "{") depth++;
    else if (args[i] === "}") { depth--; if (!depth) { end = i; break; } }
  }
  return args.slice(brace + 1, end).split(",")
    .map((x) => x.trim().split(/[:=]/)[0].trim())
    .filter((x) => /^[a-z]\w*$/.test(x));
};

/** Every exported component, whether it takes `children`, and what it destructures. */
const exported = new Map();
for (const { at, text } of files) {
  for (const m of text.matchAll(/^export function ([A-Z]\w*)\s*(?:<[^>]*>)?\s*\(/gm)) {
    if (!isComponent(m[1])) continue;
    const args = balanced(text, m.index + m[0].length - 1);
    exported.set(m[1], { at, composes: /\bchildren\b/.test(args), props: propsIn(args) });
  }
  for (const m of text.matchAll(/^export const ([A-Z]\w*)\s*[:=]/gm)) {
    if (!isComponent(m[1]) || exported.has(m[1])) continue;
    exported.set(m[1], { at, composes: false, props: [] });
  }
}

/* ------------------------------------------------------------ the registry --- */

const whole = readFileSync(join(ENGINE, "kernel/src/blocks.ts"), "utf8");

/*
  ⚠️ TWO REGISTRIES IN ONE FILE, AND ONLY THE FIRST IS DRAWN BY A COMPONENT OF
  ITS OWN NAME. A block names an export of the design package and is placed by
  looking it up; a HERO KIND is drawn by a BRANCH in the renderer, on purpose —
  "a lookup table keyed on the kind would be the shape that invites registering
  six of them; a branch is a place somebody has to write the drawing code, which
  is the point at which 'does a screen want this' gets asked". So the questions
  are different and both are asked, below and further down.
*/
const cut = whole.indexOf("export const HEROES");
const registry = cut === -1 ? whole : whole.slice(0, cut);
const heroes = cut === -1 ? "" : whole.slice(cut);

const declared = new Set();
for (const m of registry.matchAll(/block\("(\w+)"/g)) declared.add(m[1]);

/*
  ⚠️ A FLOOR, BECAUSE A PARSER THAT STOPS MATCHING REPORTS A SMALLER VOCABULARY
  RATHER THAN A BROKEN READ. The charts used to be built by one helper over a
  list of thirteen names, and this guard had a special case for it; when that
  list went, the special case was the thing that noticed. What replaces it has
  to notice the same class of change without knowing how the file is written.
*/
const FEWEST = 20;
if (declared.size < FEWEST) {
  fail(`kernel/src/blocks.ts: only ${declared.size} block(s) parsed, under the ${FEWEST} floor.\n`
    + `       Either the vocabulary has been gutted or this guard has stopped reading it,\n`
    + `       and from a smaller number alone the two are the same.`);
}

/**
 * ⚠️ WHICH ENTRIES LEAD SOMEWHERE, AND IN WHICH SHAPE — see `BlockEntry.leads`.
 * `true` is a row of shortcuts and fills `actions`; `"one"` is a single
 * destination and fills `onOpen`. They are two different PROPS, so an entry
 * carrying the wrong one is a press that never arrives.
 */
const leadsOf = new Map();
{
  /* ⚠️ BRACE-BALANCED PER ENTRY, NOT A LAZY SPAN ACROSS THE FILE. The first
     draft matched `block("X" … leads:` with a bounded `[\s\S]*?`, which happily
     ran from one entry's `block(` to a LATER entry's `leads:` — reporting `Hero`
     as leading somewhere it does not. A parser that is wrong reports the tree as
     broken and is believed. */
  for (const m of registry.matchAll(/^ {2}(\w+): /gm)) {
    let depth = 0, end = m.index;
    for (let i = m.index; i < registry.length; i++) {
      const c = registry[i];
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (!depth) { end = i; break; } }
    }
    const entry = registry.slice(m.index, end + 1);
    const how = /leads:\s*"one"/.test(entry) ? "one"
      : /leads:\s*true/.test(entry) ? "many" : null;
    if (how) leadsOf.set(m[1], how);
  }
}

/** ⚠️ Each entry's slot names, which are the props the renderer will fill. */
const slotsOf = new Map();
for (const m of registry.matchAll(/block\("(\w+)",\s*"\w+",\s*\{/g)) {
  const from = registry.indexOf("{", m.index + m[0].length - 1);
  let depth = 0, end = from;
  for (let i = from; i < registry.length; i++) {
    if (registry[i] === "{") depth++;
    else if (registry[i] === "}") { depth--; if (!depth) { end = i; break; } }
  }
  slotsOf.set(m[1], [...registry.slice(from, end).matchAll(/^\s{4}(\w+):\s*slot\(/gm)].map((x) => x[1]));
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
  formatter: [
    /* ⚠️ SEVERAL THINGS SAID AS A PERSON WOULD SAY THEM — see `sayList`. It is
       the same kind of thing as `Num` and `When`: a value put into the reader's
       own language, where the language is the joining word. A block would mean a
       declaration binding a LIST of strings, and no `Read` answers one. */
    "Listed","Num", "Money", "When", "Size", "Unit", "Tally", "Dated", "Clock", "Amount", "Code"],
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
    /* ⚠️ THE SHEET THAT ASKS BEFORE A RECORD LEAVES — see `PutAside`. It is an
       INTERRUPTION rather than a block: it is spawned over whatever is on screen
       and owns the whole viewport while it is open, which is the same reason
       `Confirm` and `Menu` are here. A declaration that could place one would be
       a body that draws a modal in a grid cell. */
    "PutAside",
  ],
  /*
    A CONTROL — it holds an answer somebody has not saved yet. That is a story's
    business and never a body's (D-surface: a screen is a body or a story), so
    these are the components a story's own code reaches for.
  */
  control: [
    /* ⚠️ THE PHOTOGRAPHS A FLOW IS ASKED FOR — see `ASKS`. It is a block, but of
       the ASKING registry rather than the body one: it holds an answer nobody has
       saved and hands it back, which is a story's business and never a body's.
       Registered as a body block it would be handed bindings and draw a camera
       over them. */
    "Shots",
    "TextInput", "SecretInput", "LongText", "SearchInput", "NumberInput", "MoneyInput",
    "Dial", "Choice", "Lookup", "Agree", "Picks", "OneOf", "Segmented", "Tags", "Words",
    "DateInput", "TimeInput", "CodeEntry", "PeriodInput", "Colour", "DayPicker", "DayField",
    /* ⚠️ `PickFile` IS THE DOOR AND `Attach` IS THE ROOM BEHIND IT — a queue of
       files a person is putting somewhere, held before they are sent. Unsaved,
       handed back, and a story's business. */
    "Ranged", "PickFile", "Attach", "FileRow", "Viewfinder", "SettledSwitch", "Filters", "Found",
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
    /* ⚠️ ONE FILE INSIDE THE QUEUE, drawn by `Attach` rather than placed beside
       it — see `AttachedRow`. A body that could place one would be a body
       placing a row out of a control's list. */
    "AttachedRow",
    /* ⚠️ AND THE BAR IT WEARS. Work being done TO somebody, so unlike the flow's
       own progress it announces itself and carries its value — see `Sending`. */
    "Sending",
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
  /*
    A HERO'S DRAWING — the design half of `HEROES` rather than of `BLOCKS`, and
    the two registries are separate precisely so a body cannot lead with an
    ordinary row and cannot place a hero among its blocks.

    ⚠️ SO IT IS EXEMPT FROM THE BLOCK QUESTION AND NOT FROM EVERY QUESTION. The
    heroes check further down asks the one that matters about these — that the
    renderer has a branch for the kind — which is the same "declared and drawn by
    nothing" fault this file exists for, asked of the other registry.
  */
  hero: ["Lead", "Resuming"],
  /*
    ⚠️ A CHART WHOSE DATA A `view` CANNOT DESCRIBE, WHICH IS ELEVEN OF THE
    THIRTEEN. `LineChart` and `BarChart` take a series and a name and are in the
    vocabulary. These take two categorical axes and a measure, or pairs, or
    groups, or columns — shapes `ViewSpec` has no way to say, and a slot that
    accepted a view and quietly filled one of the three would be the fault this
    guard was widened to catch, one level along.

    ⚠️ THEY ARE STILL EXPORTED AND A WRITTEN SCREEN MAY DRAW ANY OF THEM. What
    they are not is bindable, and the honest way to record that is here rather
    than as a registry entry naming props the component does not have. This list
    shrinks when the contract learns to describe one of them.
  */
  unbindable: [
    /* ⚠️ FIVE SHAPES A ROW IS NOT, AND THE SIXTH IS A FLOW'S OWN. A branch, a
       moment, a tile, a crumb and a question are each a projection FROM rows —
       which column is the label, which is the parent, which is the answer — and
       the renderer performs exactly two of those (`shows` and `plots`). Each was
       registered with a `view` slot and would have been handed the rows: a
       declaration that composes, passes every check, and draws nothing. Same
       argument as the eleven charts below, applied late. `Steps` is separate
       only in that the story frame already draws it around a `StorySpec`, so a
       body placing one would be a second progress bar over the same walk. */
    "Tree", "Timeline", "TileGrid", "Crumbs", "Faq", "Steps",
    /* ⚠️ HELP IS SCREEN-SCOPED AND THE BOOK IS NOT ON THE WIRE. `Guide` and
       `Milestones` beside it are blocks now, fed from `AppSpec`'s own books
       through `Has.book`; `AppSpec.help` is not carried on the centre's answer,
       so a declaration placing this would draw an empty page of nothing. It
       becomes a block the day the book reaches the browser. */
    "Help",
    /* ⚠️ A FACE IS A KIND AND A SEED, AND A BINDING CARRIES NEITHER. The kind is
       what picks the world the plate is drawn in — an aura for somebody, a
       planet for a workspace, the photograph itself for a thing — and a
       declaration can hand over a field's value and nothing more. It was a block
       until the day something asked what it would draw. `PersonRow` takes the
       face as a prop of its own; a screen that needs a bare one draws it in a
       session. See the comment where it was, in kernel/src/blocks.ts. */
    "Face",
    "AreaChart", "ColumnChart", "StackedChart", "DivergingChart", "DumbbellChart",
    "HeatmapChart", "ScatterChart", "DonutChart", "CompositionBar", "Sparkline",
    "ChartTable",
  ],
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
      + `(formatter | state | chrome | control | inside | mark | plumbing | hero | unbindable).`);
  }
  if (!loose && !stale) {
    ok(`candidates: ${exported.size} export(s), every childless one placed or classified`);
  }
}

/* ------------------------------------------------ and it leads in one shape --- */

/**
 * ⚠️ `leads` IS TWO PROPS AND THE REGISTRY PICKS ONE, WHICH IS THE SAME SILENT
 * JOIN THE SLOT CHECK ABOVE EXISTS FOR. A row of shortcuts takes an array of
 * destinations (`actions`); a tile takes a single `onOpen`. An entry saying
 * `true` about a component that reads `onOpen` makes the renderer set a prop the
 * component does not take — React drops it without a word, the manifest
 * composes, the tile draws, and pressing it does nothing.
 *
 * ⚠️ AND THAT IS NOT HYPOTHETICAL. `Stat` was given `leads: true` and a single
 * `onOpen` in the same afternoon, and the screen photographed perfectly with no
 * affordance on any of four tiles. Nothing in this file could see it, because
 * `leads` is not a slot.
 */
{
  let wrong = 0;
  for (const [id, how] of leadsOf) {
    const part = exported.get(id);
    if (!part) continue;
    const wants = how === "one" ? "onOpen" : "actions";
    if (part.props.includes(wants)) continue;
    wrong++;
    fail(`kernel/src/blocks.ts: \`${id}\` leads ${how === "one" ? "to one screen" : "to several"} `
      + `and ${part.at}\n       does not take \`${wants}\` `
      + `(${part.props.join(", ") || "no destructured props"}).\n`
      + `       The renderer fills that prop; React drops one a component does not read, so\n`
      + `       the shortcut draws and the press goes nowhere.`);
  }
  if (!wrong) ok(`leading: ${leadsOf.size} block(s) that lead, each taking the prop its shape fills`);
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

/* --------------------------------------- and the slot is a prop it accepts --- */

/**
 * ⚠️ A SLOT NAME IS A PROP NAME, AND NOTHING CHECKED THAT UNTIL THE RENDERER
 * NEEDED IT. The registry was written as a description of what each block ought
 * to take, and twenty-three of the forty entries named something the component
 * does not accept: `PersonRow.who` against a component whose prop is `name`,
 * `Listing.rows` against `of`, `Markdown.text` against `of`, `Hero.label`
 * against `eyebrow`, and every chart's `label` against `describes`.
 *
 * ⚠️ AND THE FAILURE IS SILENT IN THE WORST POSSIBLE WAY. React ignores a prop a
 * component does not read, so the renderer would fill `rows` on a `Listing` that
 * reads `of`, get no error, no warning and no type complaint — the manifest
 * composes, the screen mounts, and the list is empty. Every other check in this
 * repository passes on that.
 *
 * ⚠️ `children` IS A SLOT LIKE ANY OTHER, because for some blocks the content IS
 * the children — `NoteRow` is a sentence, and eighty-nine call sites write it
 * between the tags. The renderer passes a slot of that name as children rather
 * than as an attribute.
 */
{
  let wrong = 0;
  for (const [id, slots] of slotsOf) {
    const part = exported.get(id);
    if (!part) continue; /* already reported above as not exported at all */
    for (const name of slots) {
      const takes = name === "children" ? part.composes : part.props.includes(name);
      if (takes) continue;
      wrong++;
      fail(`kernel/src/blocks.ts: \`${id}\` declares a slot "${name}" and ${part.at}\n`
        + `       does not take it (${part.props.join(", ") || "no destructured props"}).\n`
        + `       React drops a prop a component does not read, so a screen binding this\n`
        + `       composes, mounts, and draws nothing there.`);
    }
  }
  if (!wrong) {
    ok(`bound: every slot is a prop its component takes — `
      + `${[...slotsOf.values()].reduce((n, x) => n + x.length, 0)} across ${slotsOf.size} block(s)`);
  }
}

/* ------------------------------------------------- and a hero is drawn too --- */

/**
 * ⚠️ A HERO KIND IS DRAWN BY A BRANCH, SO WHAT IS CHECKED IS THAT THE BRANCH IS
 * THERE. A block's claim is "the design package exports a component of this
 * name"; a hero's is "the renderer knows what to do when a screen says this" —
 * different claims, and only the second one can be made about a kind that has no
 * component of its own. The failure both prevent is identical: a declaration
 * that composes, passes everything, and draws a blank region where the biggest
 * thing on the screen goes.
 */
{
  const kinds = [...heroes.matchAll(/^  (?:\/\*\*[\s\S]*?\*\/\n\s*)?(\w+): block\("(\w+)"/gm)]
    .map((m) => m[2]);
  const led = readFileSync(join(ENGINE, "design/src/rendered/body.tsx"), "utf8");
  let blind = 0;
  for (const kind of kinds) {
    if (!new RegExp(`hero\\.as === "${kind}"`).test(led)) {
      blind++;
      fail(`kernel/src/blocks.ts registers the hero kind "${kind}", and the renderer has no `
        + `branch for it.\n`
        + `       A screen leading with it composes and draws nothing where the one thing\n`
        + `       the screen is about was meant to be.`);
    }
  }
  /* ⚠️ AND A FLOOR, for this parser's own sake — see the one above. */
  if (!kinds.length) {
    fail("kernel/src/blocks.ts: no hero kinds parsed out of HEROES.\n"
      + "       Either the registry is empty or this guard has stopped reading it.");
  } else if (!blind) {
    ok(`heroes: ${kinds.length} kind(s), every one drawn by the renderer`);
  }
}

console.log(bad
  ? "\nvocabulary: the registry and the design package disagree."
  : "\nvocabulary: every block is real, and everything that could be one is placed.");
process.exit(bad ? 1 : 0);
