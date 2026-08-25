/**
 * NO HEROUI COMPONENT IS RESTYLED (D7).
 *
 * @design no component is restyled — layout utilities and tokens only.
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
import { appDirs, appManifests, appTrees } from "./lib/trees.mjs";

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
      else if (/\.tsx$/.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

/**
 * ⚠️ EVERY DIRECTORY IN THIS TREE THAT DRAWS SOMETHING, and `one-space` is named
 * here because it is the largest of them: the OneSpace is the first surface anybody
 * sees, and a guard that covered the shared package and the reference app while
 * leaving the real screens out would be a guard that reports green about the
 * files nobody checked.
 */
const FILES = [
  ...filesIn("design/src"),
  ...filesIn("one-space/src"),
  ...appDirs().flatMap((d) => filesIn(d)),
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
  /* ⚠️ EVERY `whitespace-` VALUE, NOT JUST `nowrap`. The list held the one that
     stops text wrapping and refused the one that lets it — and letting it is
     the case that comes up, because `.button` ships `whitespace-nowrap` and a
     row whose second line is a sentence then sets its own min-content width
     and pushes a phone sideways. Text flow is placement; which value is right
     is the caller's. */
  /^(sr-only|not-sr-only|truncate)$/,
  /^whitespace-/,
  /^(aspect|columns)-/,
  /* ⚠️ ALIGNMENT IS WHERE TEXT SITS IN ITS BOX, WHICH IS PLACEMENT. A column of
     amounts ragged-left is unreadable at a glance, and a table cell is the one
     element where only the caller knows which columns are numbers. The values
     are listed exactly rather than as `^text-`, so `text-sm` and `text-danger`
     — a size and a colour, both the library's answer — stay refused. */
  /^text-(start|end|center|left|right|justify|balance|pretty|wrap|nowrap)$/,
  /* ⚠️ AND TABULAR FIGURES ARE A MEASUREMENT, NOT A TYPEFACE. Proportional
     digits make a column ripple, so the reader compares the ripple rather than
     the values; the variant does not change the face, the size or the weight.
     ⚠️ This was refused while `listing.tsx` set the SAME two utilities and
     passed — its are behind a ternary, which this check cannot see. A rule that
     holds only where somebody wrote the literal inline is not a rule. */
  /^(tabular|proportional|lining|oldstyle|ordinal|slashed-zero|normal)-nums$/,
];

/**
 * ⚠️ AN INTERPOLATION NAMING A METRIC IS RESOLVED, NOT TRUSTED. Once the spacing
 * moved into `metrics.ts`, every placement read `${ROW.pad}` — a value this check
 * could neither see nor sensibly refuse. The first version answered with a list
 * of metric names to wave through, and that list was wrong within the day: `FACE`
 * was added to `metrics.ts`, used exactly as `LEAD` is, and reported as a
 * restyle. A guard whose maintenance is a second list of the thing it checks is a
 * guard people edit to make green.
 *
 * ⚠️ SO THE VALUES ARE READ OUT OF `metrics.ts` AND PUT THROUGH THE SAME RULE AS
 * EVERY OTHER UTILITY. A metric that is genuinely appearance — a colour, a
 * radius — is then refused where it is used, which is the answer this always
 * should have given.
 */
const METRIC_VALUES = (() => {
  const src = readFileSync(join(ENGINE, "design/src/tokens/metrics.ts"), "utf8");
  const out = new Map();
  /*
    ⚠️ ONE DECLARATION AT A TIME, because a regex over the whole file gets this
    wrong in a way that reads as a real finding. Matching `export const NAME = {…}`
    with a lazy body runs a SINGLE-LINE object on to the next multi-line one's
    closing brace, swallowing the declaration between them — so `SPACE.tight`
    resolved to nothing and `gap-2` was reported as a restyle.
  */
  for (const chunk of src.split(/^export const /m).slice(1)) {
    const name = chunk.match(/^(\w+)/)?.[1];
    if (!name) continue;
    const decl = chunk.slice(0, chunk.search(/^(?:export |\/\*)/m) + 1 || undefined);
    const string = decl.match(/^\w+\s*=\s*"([^"]*)"/);
    if (string) { out.set(name, string[1]); continue; }
    for (const [, key, value] of decl.matchAll(/(\w+):\s*"([^"]*)"/g)) {
      out.set(`${name}.${key}`, value);
    }
  }
  return out;
})();

/** An interpolation of a metric, resolved to the utilities it actually is. */
const metricClasses = (cls) => {
  const m = cls.match(/^\$\{([\w.]+)\}$/);
  if (!m) return null;
  const value = METRIC_VALUES.get(m[1]);
  return value === undefined ? null : value.split(/\s+/).filter(Boolean);
};

/** ⚠️ A responsive or state prefix does not change what the utility IS. */
const bare = (cls) => cls.replace(/^(?:[a-z0-9]+:)+/, "").replace(/^[!-]/, "");

const plainLayout = (cls) => LAYOUT.some((re) => re.test(bare(cls)));

/**
 * ⚠️ PADDING IS REFUSED WHEN IT IS A NUMBER SOMEBODY PICKED AND ALLOWED WHEN IT
 * CAME FROM `metrics.ts`, AND THE DISTINCTION IS THE WHOLE POINT OF THAT FILE.
 * The rule started as a flat ban because a component's own density is the
 * library's decision — right for making a `Button` chunkier, wrong for the case
 * that actually came up: the library ships no ROW, so a full-width row is a
 * `Button` inside a `Card` and pays BOTH their paddings, indented 32px with its
 * separator drawn at 36. Refusing the fix left the misalignment in place and
 * called it consistency. A metric is reviewed once, in one file, with its own
 * guard over it — which is exactly the property the ban was reaching for.
 */
const PADDING = [/^p-/, /^(px|py|pt|pr|pb|pl)-/];
const metricLayout = (cls) => plainLayout(cls) || PADDING.some((re) => re.test(bare(cls)));

const layoutOnly = (cls) => {
  const resolved = metricClasses(cls);
  return resolved ? resolved.every(metricLayout) : plainLayout(cls);
};

/**
 * ⚠️ ONE COMPONENT WHERE THE SHAPE IS THE DATA, AND IT IS `Skeleton`. Radius is
 * appearance on everything the library draws, because the library knows what a
 * card or a button should look like. It does not know what is COMING — and a
 * placeholder's entire job is to be the geometry of the thing it stands in for,
 * so a stand-in for an avatar is a circle, one for a line of text is a pill, and
 * one for a chart is a rounded panel. Refusing the radius would leave every
 * skeleton a sharp-cornered rectangle, which is a placeholder that does not
 * match its content — the exact fault the shaped skeletons exist to avoid.
 *
 * ⚠️ AND IT IS RADIUS ONLY. A `Skeleton` given a colour, a border or a shadow is
 * the ordinary breach, and still is.
 */
const SHAPE_IS_DATA = new Set(["Skeleton"]);
const shapeOk = (tag, cls) => SHAPE_IS_DATA.has(tag.split(".")[0]) && /^rounded(-|$)/.test(bare(cls));

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
        if (!layoutOnly(one) && !shapeOk(tag, one)) {
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

/**
 * ⚠️ ONE CONTROL THE LIBRARY DOES NOT SHIP AND THE PLATFORM CANNOT AVOID.
 * `<input type="file">` is the only way to open a file dialog: there is no API
 * that opens one without it, and it is deliberately unstylable, which is exactly
 * why every product hides one behind a button. The rule above is right — a
 * hand-rolled control misses the focus, pressed and keyboard behaviour — and it
 * does not apply to a control nobody could roll differently.
 *
 * ⚠️ NARROW ON PURPOSE: `type="file"` and nothing else. An exemption for
 * `<input>` as such would let the next text field in, which is the whole thing
 * this guard is for. The button beside it is still HeroUI's, and the file input
 * itself is `sr-only`, so what a person sees and operates is a real control.
 */
const IRREDUCIBLE = /<input[^>]*type="file"/;

let raw = 0;
for (const file of FILES) {
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [re, why] of HAND_ROLLED) {
    if (re === HAND_ROLLED[2][0] && IRREDUCIBLE.test(src)) {
      /* ⚠️ Still checked for every OTHER `<input>` in the same file. */
      if (!/<input(?![^>]*type="file")/.test(src)) continue;
    }
    if (re.test(src)) {
      raw++;
      fail(`${rel(file)}: ${why} (D7).\n` +
           `       A hand-rolled control misses the focus, pressed, disabled and keyboard behaviour.`);
    }
  }
}
if (!raw) ok(`library: nothing hand-rolls a control HeroUI ships`);

/**
 * ⚠️ AND A SCREEN DOES NOT ASSEMBLE A COMPOUND CONTROL THE PACKAGE ALREADY
 * SHIPS. The sign-in screen opened by saying that "a form drawing six boxes
 * against a server issuing eight refuses every valid code and blames the person
 * while doing it" — and then drew six `<InputOTP.Slot index={0..5}>` by hand, a
 * few lines under the sentence. Raising `CODE_DIGITS` would have left the form
 * unable to accept anything, with nothing anywhere failing.
 *
 * ⚠️ WHAT MAKES IT CATCHABLE IS WHERE IT IS, NOT WHAT IT SAYS. The count cannot
 * be checked — a literal six is correct today — but a SCREEN holding the pieces
 * at all is the thing that goes wrong, because a screen is where nobody thinks
 * to derive anything. `CodeEntry` counts them from the number it is given.
 */
const COMPOSED = [
  [/<InputOTP\.Slot\b/, "InputOTP.Slot", "CodeEntry"],
  /* ⚠️ `forms.tsx` EXISTS SO EVERY CONTROL SPEAKS THE SAME FOUR SENTENCES —
     label, help, error, disabled, in the same places. A screen assembling its
     own places those four by hand, and the two screens that did it are the two
     a person meets first: signing in and creating a workspace. Both bypassed the
     grammar for two mechanics it was missing, `name` and `autoFocus`, which is
     how a grammar comes to be optional. */
  [/<TextField\b/, "TextField", "TextInput"],
  [/<ComboBox\b/, "ComboBox", "Lookup"],
  [/<Select\b/, "Select", "Choice"],
];
let assembled = 0;
for (const file of FILES) {
  if (rel(file).startsWith("design/src/")) continue;
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [re, what, instead] of COMPOSED) {
    if (!re.test(src)) continue;
    assembled++;
    fail(`${rel(file)}: a screen assembling <${what}> by hand (D7).\n` +
         `       The package ships <${instead}>, which derives the pieces from the number it\n` +
         `       is given. Written out, a screen and its server disagree in silence.`);
  }
}
if (!assembled) ok(`composed: no screen assembles a control the package already ships`);

/**
 * ⚠️ AND AN APP DOES NOT KEEP A DRAWER OF SHARED FURNITURE. A file of local
 * components named for being local is a staging area that empties one export at
 * a time into the package, each time somebody notices a second app would want
 * it — so what is left in it at any moment is not an exception to the pattern,
 * it is the part of the pattern nobody has reached yet.
 *
 * ⚠️ THE TEST IS THE NAME, WHICH IS BLUNT AND IS THE POINT. Whether a component
 * is product-specific cannot be decided by a script; whether somebody has
 * started a `ui`, `components`, `shared` or `common` file in an app can be, and
 * that file is where the furniture accumulates. A screen file exporting a
 * screen-specific piece is fine and always was — this fails on the DRAWER, not
 * on the piece.
 */
const DRAWERS = /^(ui|components?|shared|common|widgets|primitives|design)\.(tsx?|ts)$/;
let drawers = 0;
for (const dir of ["one-space/src", ...appDirs()]) {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) continue;
  for (const e of readdirSync(at, { withFileTypes: true })) {
    if (e.isDirectory() ? !DRAWERS.test(`${e.name}.tsx`) : !DRAWERS.test(e.name)) continue;
    drawers++;
    fail(`${dir}/${e.name}: an app keeping a drawer of shared furniture (D7).\n` +
         `       This is where a second app's components accumulate one at a time. If a\n` +
         `       piece is about the product it belongs beside the screen that uses it; if\n` +
         `       it is not, it belongs in @engine/design.`);
  }
}
if (!drawers) ok(`furniture: no app keeps a drawer of shared components`);

/**
 * ⚠️ TAILWIND ONLY EMITS WHAT IT WAS POINTED AT, AND A PATH THAT NO LONGER
 * EXISTS IS NOT AN ERROR — IT IS A SMALLER STYLESHEET. `styles.css` said
 * `@source "../../web/src"` for as long as the design package was called `web`
 * and for a while after it was not, so **185 utility classes it alone used were
 * never generated**: `.hidden`, `.md:hidden`, `.absolute`, `.bottom-0`,
 * `.basis-0`, `.flex-1`, half the grid. Everything still mounted, typechecked
 * and passed, because `one-space/src` happened to use most of the same utilities —
 * the ones it did not are the ones that silently stopped working.
 *
 * ⚠️ SO THE CHECK IS THAT THE DIRECTORY IS THERE, which is the whole of it. No
 * build, no diff of two stylesheets, no snapshot: a `@source` naming somewhere
 * that does not exist is always a mistake, and it is the only way this fails.
 */
let unpointed = 0;
let pointed = 0;
for (const sheet of ["one-space/src/styles.css"]) {
  const at = join(ENGINE, sheet);
  if (!existsSync(at)) { fail(`${sheet}: named here but not in the tree.`); unpointed++; continue; }
  for (const m of readFileSync(at, "utf8").matchAll(/@source\s+"([^"]+)"/g)) {
    pointed++;
    if (existsSync(join(dirname(at), m[1]))) continue;
    unpointed++;
    fail(`${sheet}: @source "${m[1]}" does not exist.\n` +
         `       Tailwind emits nothing for it and says nothing. Every class only that\n` +
         `       package uses is silently absent from the stylesheet.`);
  }
}
if (!unpointed) ok(`sources: all ${pointed} @source path(s) resolve, so every package's classes are emitted`);

/**
 * ⚠️ A COMPONENT THAT POSITIONS ITSELF IS USED INSIDE THE THING IT POSITIONS
 * AGAINST. Some of the library's components are not laid out by the flow they
 * appear in — they are placed relative to a wrapper (`Badge` against
 * `Badge.Anchor`). Written without it, the component still compiles, still
 * renders and still looks like a component; it simply takes itself out of the
 * flow and lands on top of whatever is beside it.
 *
 * ⚠️ WHICH IS WHY THIS IS A GUARD AND NOT A NOTE. `PersonRow`'s unread count sat
 * over the time beside it in every render anybody looked at, and the diff that
 * caused it — `<Badge>` where every other file in the tree had written `<Chip>` —
 * is the most reasonable-looking line in the file. The library's own
 * documentation says to use `Chip` for a standalone label, so the fix is
 * unambiguous once anybody knows; the guard is what makes anybody know.
 */
const ANCHORED = [
  ["Badge", "Badge.Anchor", "Chip"],
];
let loose = 0;
for (const file of FILES) {
  const src = readFileSync(file, "utf8");
  for (const [tag, wrapper, instead] of ANCHORED) {
    /* The wrapper is a member of the same component, so a file that uses it at
       all has imported the base name — count the tags, not the imports. */
    const used = [...src.matchAll(new RegExp(`<${tag}(?![\\w.])`, "g"))].length;
    const wrapped = [...src.matchAll(new RegExp(`<${wrapper.replace(".", "\\.")}\\b`, "g"))].length;
    if (used > wrapped) {
      loose++;
      fail(`${rel(file)}: <${tag}> appears ${used}× with ${wrapped} <${wrapper}> around it (D7).\n` +
           `       ${tag} is POSITIONED against its anchor — standalone it leaves the flow and\n` +
           `       overlaps its neighbour. For a standalone label the library ships <${instead}>.`);
    }
  }
}
if (!loose) ok(`anchored: every positioned component sits inside the wrapper it positions against`);

/**
 * ⚠️ A GLYPH IS NEVER BRAND-COLOURED, AND ONE LIBRARY VARIANT MAKES IT ONE.
 * `.button--secondary` sets `--button-fg: var(--accent-soft-foreground)` — so an
 * icon button written the obvious way came out tinted, and every quick action,
 * every crown control and every tile in the product was drawn in the brand
 * colour. That looks deliberate right up until the ground behind it changes, at
 * which point a tinted mark is one that stops reading: a workspace whose accent
 * is close to its own ambience loses its icons entirely.
 *
 * ⚠️ THE RULE IS THAT COLOUR BELONGS TO THE GROUND AND NEVER TO THE THING ON IT.
 * A neutral mark on a translucent fill survives olive, violet, white and
 * concrete alike, which is exactly why the products that do this well look
 * timeless and ours looked like a theme. `tertiary` is the same fill with no
 * foreground override; `ghost` is no fill at all.
 */
let tinted = 0;
for (const file of FILES) {
  const src = readFileSync(file, "utf8");
  /*
    ⚠️ THE WHOLE ELEMENT, NOT ITS FIRST CHILD. The first version of this matched
    `<Button …>{x.icon}` and so passed `TileGrid`, whose glyph is one `<span>`
    deeper and whose tiles were the most obviously tinted thing on the screen. A
    check that only sees the shape it was written against reports green about
    the case it was written to find.
  */
  for (const m of src.matchAll(/<Button\b([^>]*)>([\s\S]*?)<\/Button>/g)) {
    if (!/\.icon\}/.test(m[2])) continue;
    /*
      ⚠️ THE WORD ANYWHERE IN THE ATTRIBUTE, NOT JUST AS THE WHOLE VALUE. This
      matched `variant="secondary"` and so could not see
      `variant={at ? "secondary" : "ghost"}` — which is how the nav's CURRENT
      destination stayed the one brand-tinted glyph in the product, with the
      guard green, for as long as nobody put the two navs side by side. A rule
      that only recognises the simplest way to write the thing it forbids is a
      rule that teaches people the other way.
    */
    /* ⚠️ COMMENTS OUT FIRST, AND MATCH THE PROP RATHER THAN THE WORD. The prose
       explaining why this must not be `secondary` contains the word `secondary`,
       so a bare search reads its own rationale — and it happened to pass only
       because the comment quotes it in backticks rather than in quotes, which is
       not a property anybody should be relying on. */
    if (/variant=[^\n]*secondary/.test(m[1].replace(/\/\*[\s\S]*?\*\//g, ""))) {
      tinted++;
      fail(`${rel(file)}: an icon <Button variant="secondary"> is drawn in the accent (D7).\n` +
           `       \`.button--secondary\` sets --button-fg to accent-soft-foreground. Use\n` +
           `       \`tertiary\` (same fill, no tint) or \`ghost\` — colour is the ground's.`);
    }
  }
}
if (!tinted) ok(`glyphs: no icon control is tinted with the brand`);

/**
 * ⚠️ AN ICON CONTROL IS A CIRCLE, AND WITHOUT `isIconOnly` IT IS A LOZENGE.
 * `.button` is `w-fit px-4`, so a 20px glyph in a 44px-tall button comes out
 * 52×44 — and a crown built from an avatar, a field and two actions came out as
 * four different shapes at three different widths. Set against a product whose
 * top row is four equal circles, that one omission is most of what read as
 * cheap: not the colours, not the spacing, the SHAPES.
 *
 * ⚠️ IT IS FINDABLE BECAUSE THE ACCESSIBLE NAME GIVES IT AWAY. A control with an
 * `aria-label` and no words in it is, by construction, a control whose only
 * content is a glyph — which is the same condition `isIconOnly` describes. The
 * library ships the modifier; the only way to get this wrong is not to ask.
 */
let lozenge = 0;
for (const file of FILES) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/<Button\b([^>]*)>([\s\S]*?)<\/Button>/g)) {
    const [, attrs, body] = m;
    if (!/aria-label=/.test(attrs) || /isIconOnly/.test(attrs)) continue;
    /* Words between the tags — a label, not a glyph expression or an element. */
    const words = body.replace(/\{[^}]*\}|<[^>]*>|\/\*[\s\S]*?\*\//g, "").trim();
    if (words) continue;
    lozenge++;
    fail(`${rel(file)}: an icon-only <Button> without \`isIconOnly\` (D7).\n` +
         `       It renders \`w-fit px-4\` — a glyph in a lozenge, not a circle, and a row\n` +
         `       of them is a row of different widths. The library ships the modifier.`);
  }
}
if (!lozenge) ok(`shapes: every icon-only control asks the library to be one`);

/**
 * ⚠️ AN ICON-ONLY CONTROL TELLS A SCREEN READER WHAT IT DOES AND SHOWS EVERYBODY
 * ELSE A SHAPE. Every one of them already carried an `aria-label`, so the
 * product read correctly aloud and there were forty-four glyphs in it and no
 * tooltips at all. The crown's trail is the sharp case: those icons are the
 * APP's, nobody has seen them before, and that row is on every screen.
 *
 * ⚠️ A TOOLTIP IS NEVER THE ACCESSIBLE NAME. It is hover and focus only and
 * never reaches a touch screen, so `Hint` is the sighted pointer user's copy of
 * the `aria-label` rather than a replacement for it — which is why this checks
 * for a hint IN ADDITION TO the label the check above already found.
 *
 * ⚠️ AND THE EXEMPTION IS A MARKER A SCRIPT FINDS, NOT A FILE ON A LIST. Two
 * sites are correctly hint-less — the nav, which is the phone half where a
 * tooltip never fires and whose word sits beside the glyph anyway, and the quick
 * actions, whose label is a sibling under the circle. A file-level exemption
 * would have covered the crown's four as well, since three of them live in the
 * same file. Every reason is printed on every run, so a rubber stamp is visible.
 */
const NO_HINT = /no-hint:\s*([^*\n]+)/;
let mute = 0;
const excused = [];
for (const file of FILES) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/<Button\b([^>]*)>([\s\S]*?)<\/Button>/g)) {
    const [, attrs, body] = m;
    if (!/isIconOnly/.test(attrs)) continue;
    /* Words between the tags mean the control names itself and owes no hint. */
    if (body.replace(/\{[^}]*\}|<[^>]*>|\/\*[\s\S]*?\*\//g, "").trim()) continue;
    /* The wrapper and any excuse are both ABOVE the tag — read the run of source
       leading up to it rather than trying to balance JSX. */
    const before = src.slice(Math.max(0, m.index - 600), m.index);
    const excuse = NO_HINT.exec(before);
    if (/<Hint\b/.test(before)) continue;
    if (excuse) { excused.push(`${rel(file)}: ${excuse[1].trim()}`); continue; }
    mute++;
    fail(`${rel(file)}: an icon-only <Button> with no <Hint> around it (D7).\n` +
         `       Its \`aria-label\` names it aloud and shows everybody else a shape. Wrap it\n` +
         `       in <Hint says={…}>, or state why not with a \`no-hint:\` marker.`);
  }
}
if (!mute) {
  ok(`hints: every icon-only control is named to a pointer too` +
     (excused.length ? `, ${excused.length} excused` : ""));
  for (const why of excused) console.log(`     ${why}`);
}

/**
 * ⚠️ A ROW OF EQUALS IS EQUAL, AND `.button` IS `w-fit`, SO IT NEVER IS BY
 * DEFAULT. This is the same fault three times over and each one shipped: the
 * crown came out four shapes at three widths, the tiles came out 162/156/198 in
 * a grid of identical columns, and the nav came out 69/46/48/60 with the active
 * pill inheriting whichever width its own label happened to make. Every time,
 * the container was right and nothing filled it; every time it read as cheap
 * without being nameable.
 *
 * ⚠️ SO THE CHECK IS ON THE GROUPS, BY NAME, because "these siblings are peers"
 * is a fact about the design rather than anything in the markup. A fourth group
 * is a line here, added on purpose, by whoever builds it.
 *
 * ⚠️ AND `grow` ALONE IS NOT ENOUGH — `basis-0` is the half people leave off.
 * With `grow` and the default `basis-auto`, flex hands out the LEFTOVER space
 * after each item's own content, so a longer label still ends up wider. The
 * widths converge, which is worse than obviously wrong: it looks nearly right.
 */
/*
  ⚠️ `Island` WAS ON THIS LIST AND IS DELIBERATELY OFF IT. Equal columns were
  right while every destination showed its label: five items each sized to their
  own word is five different widths, and the pill inherited whichever width its
  own label happened to make. The nav is COMPACT now — every destination is its
  icon and only the one you are on expands — so items sizing to their content is
  the design rather than the defect, and the width that matters is the bar's,
  which is its content's by choice. What replaced this check is `travel` below.
*/
const EQUALS = [
  ["design/src/parts/surfaces.tsx", "TileGrid", /w-full flex-col/],
];
let uneven = 0;
for (const [file, group, needs] of EQUALS) {
  const src = readFileSync(join(ENGINE, file), "utf8");
  /* ⚠️ SPLIT ON THE DECLARATIONS, not a lazy match to the first `\n}`. Both of
     these components destructure a multi-line inline type, whose `}) {` sits at
     column zero — so the naive block stopped at the PARAMETER LIST and reported
     a finding against a body it had never read. Every guard in this repo that
     matched a function body has had this bug once. */
  /* ⚠️ AND THE COMMENTS COME OUT FIRST. The prose explaining why `basis-0` is
     required contains the string `basis-0`, so the check matched its own
     rationale and passed a body that no longer had it — a guard made green by
     the paragraph justifying the guard. */
  const block = src
    .split(/\nexport /)
    .filter((b) => b.startsWith(`function ${group}`))
    .map((b) => [null, b.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")])[0];
  if (!block) {
    uneven++;
    fail(`${file}: no \`${group}\` to check — if it moved, move this line with it.`);
  } else if (!needs.test(block[1])) {
    uneven++;
    fail(`${file}: \`${group}\` lets its items size to their own content (D7).\n` +
         `       \`.button\` is \`w-fit\`, so a row of peers comes out a row of different\n` +
         `       widths — and \`grow\` without \`basis-0\` only narrows the difference.`);
  }
}
if (!uneven) ok(`peers: ${EQUALS.length} group(s) of equals share their width`);

/**
 * ⚠️ THE NAV NAMES EXACTLY ONE DESTINATION, AND THE FILL AND THE WORD COME FROM
 * ONE CONDITION. That is the whole of the compact bar: four glyphs and one named
 * pill fit at any width, and they only fit because the label is closed on
 * everything else. Two ways to break it, both silent:
 *
 *   - the fill and the label are driven by different expressions, so the bar
 *     highlights one item and names another. It looks like a routing bug and it
 *     is a nav bug.
 *   - the label is hidden with `display: none` or `hidden`, which takes it out
 *     of the accessibility tree — five unnamed buttons to anybody using a screen
 *     reader, who are the one group for whom the icon carries nothing at all.
 *
 * ⚠️ THIS REPLACED A CHECK FOR ONE TRAVELLING PILL. That design was right and
 * its argument still is — a background can only appear and disappear while a
 * single element can MOVE, and moving is what says two destinations are on one
 * shelf. The expansion is that movement now: the fill grows out of one item
 * while the one before it closes, continuously, carrying the label with it. What
 * the old shape needed was equal columns, which is what stopped five labels
 * fitting a phone in the first place.
 *
 * ⚠️ AND THE BAR LEAVES BY `transform`. A nav that animated its height or its
 * padding on scroll is layout work on every frame of every scroll, on the device
 * least able to afford it — and it is the shape a "simplification" takes.
 */
{
  const src = readFileSync(join(ENGINE, "design/src/frame/chrome.tsx"), "utf8");
  const body = (src.split(/\nexport /).find((b) => b.startsWith("function Island")) ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  if (!body) {
    fail(`design/src/frame/chrome.tsx: no \`Island\` to check — if it moved, move this with it.`);
  } else {
    /*
      ⚠️ WHAT IS NAMED MUST BE WHAT IS HIGHLIGHTED, WHICH IS NOT THE SAME AS
      "one variable". The first version demanded both halves read `isHere`, and
      that is the rule stated as an implementation — it failed the day the label
      became conditional on something FURTHER: with an act in the bar nothing is
      named, because the act is the one thing wearing a word. Highlighting
      without naming is the ordinary closed item; naming without highlighting is
      the defect.

      ⚠️ SO THE LABEL'S CONDITION MUST BE `isHere` OR DERIVED FROM IT IN THIS
      BODY. A name declared `const open = isHere && …` can only ever be true
      where `isHere` is, which is the invariant; a name declared from anything
      else is exactly the bar naming what it did not highlight.
    */
    const marks = /data-here=\{isHere/.test(body);
    const named = /maxWidth:\s*(\w+)/.exec(body)?.[1] ?? "";
    /* ⚠️ A PLAIN ASSIGNMENT IS THE STRONGEST FORM OF THE INVARIANT, and this
       accepted only the weaker one. `const open = isHere && …` is admitted
       because a narrowing of `isHere` can never be true where `isHere` is
       false; `const open = isHere` is that with nothing narrowing it, and it
       failed. A guard that refuses the exact thing it is asking for is one
       somebody edits the CODE to satisfy, which is the wrong direction. */
    const names = named === "isHere"
      || new RegExp(`const ${named}\\s*=\\s*isHere\\s*(?:&&|;)`).test(body);
    /* ⚠️ `overflow-hidden` IS NOT `hidden`, and the first version of this could
       not tell them apart — `\b` matches after a dash, so the utility that makes
       the label narrow read as the utility that removes it. The closed label is
       BUILT from `overflow-hidden`, so the guard failed on the correct code.

       ⚠️ AND NEITHER IS `md:hidden`, which is the same mistake one character
       along. The nav hides itself above the breakpoint where the sidebar takes
       over — a statement about the whole BAR at one width, not about a label at
       any width — and `:` is neither a word character nor a dash, so the
       original lookbehind let it through. It happened to sit on its own line, so
       `[^\n]*` was all that stood between this guard and a false failure on
       correct code, one reformat away. A variant prefix is excluded by name. */
    const gone =
      /(?:className=[^\n]*(?<![\w:-])hidden(?![\w-])|display:\s*["']?none)/.test(body);
    /* ⚠️ AND IT MUST NOT MOVE AT ALL. This used to REQUIRE a transform: the bar
       left downwards while somebody scrolled, and animating that by height would
       have been layout work on every frame. The travel is gone — the crown never
       had one, and two ends of a screen behaving differently is what a person
       notices — so what is worth checking inverted with it. A transform on a
       sticky bar is not merely dead style: a transformed box still counts toward
       the document's scrollable overflow, so the page grows while the bar is away
       and shrinks when it returns, and the browser clamps the scroll to a document
       that just changed size. */
    const moves = /transform:\s*[^\n]*\b(?:away|translate)/.test(body);

    if (!marks || !names) {
      fail(`design/src/frame/chrome.tsx: the nav's fill and its label are not one condition (D7).\n` +
           `       fill from \`isHere\`: ${marks}; label from \`${named}\`, which is ` +
           `neither \`isHere\` nor derived from it.\n` +
           `       A condition that can be true where \`isHere\` is false is a bar that\n` +
           `       highlights one destination and names another.`);
    } else if (gone) {
      fail(`design/src/frame/chrome.tsx: a closed label is removed rather than narrowed.\n` +
           `       \`display: none\` takes it out of the accessibility tree, which is five\n` +
           `       unnamed buttons to the one group the icon carries nothing for.`);
    } else if (moves) {
      fail(`design/src/frame/chrome.tsx: the nav moves itself.\n` +
           `       A transformed sticky bar still counts toward the document's scrollable\n` +
           `       overflow, so the page grows while it is away and shrinks when it comes\n` +
           `       back — reach the foot of a long page, move a finger the other way, and it\n` +
           `       jumps upward with nobody touching it. The hem is what handles content\n` +
           `       arriving at a control, at both ends of the screen.`);
    } else {
      ok(`travel: the nav names one destination, and stays where it is`);
    }
  }
}

/* ---------------------------------------------- one door into the system --- */

/**
 * ⚠️ `@engine/design` HAS ONE ENTRY, AND A DEEP IMPORT IS HOW A PACKAGE STOPS BEING
 * ABLE TO MOVE ANYTHING. Everything in this session — the crown becoming one
 * component, the dock becoming one, the scene engine replacing twenty-four
 * grounds — was possible because the only thing anybody had was the name of an
 * export. One `@engine/design/src/frame/chrome.js` in an app and the file's PATH
 * is public: it cannot be split, renamed, or folded into another without
 * breaking a caller nobody remembers.
 *
 * ⚠️ AND `exports` DOES NOT ENFORCE IT HERE. The package resolves through the
 * workspace, where TypeScript and Vite will happily follow a relative path into
 * `../../design/src/…` — which typechecks, bundles, and is invisible in review.
 * The subpath map is the intent; this is the mechanism.
 */
{
  const DEEP = /from\s+["'](?:@one\/design\/[^"']+|[./][^"']*\/design\/src\/[^"']+)["']/;
  let deep = 0;
  for (const file of [...filesIn("one-space/src"), ...filesIn("apps")]) {
    const m = readFileSync(file, "utf8").match(DEEP);
    if (!m) continue;
    deep++;
    fail(`${rel(file)}: reaches inside the design system — \`${m[0]}\`.\n` +
         `       There is one door: \`import { … } from "@engine/design"\`. A path that is public\n` +
         `       is a path nothing can rename, split or fold away again.`);
  }
  if (!deep) ok(`door: one entry into @engine/design, no path made public`);
}

/* ------------------------------------------- one dock, and it is declared --- */

/**
 * ⚠️ THE DOCKED ACTION WAS TWO COMPONENTS AND THEY HAD ALREADY DRIFTED.
 * `StickyAction`, wrapped by hand around a screen's own button, and the bar a
 * `Screen` renders from its `does` — same place, same hem, same job, disagreeing
 * about both things there were to disagree about: one was `max-w-md` and the
 * other took the shape's own width, one showed on a desktop and the other did
 * not. Nothing made them agree because nothing knew they were the same thing.
 *
 * ⚠️ SO THERE IS ONE, AND IT IS NOT REACHABLE FROM A SCREEN. What a screen
 * declares is the ACT; where it lands at each size is the frame's. A hand-rolled
 * dock skips every rule the declaration carries — no dock over a skeleton, which
 * invites a press against data that has not arrived; none over a refusal, where
 * the only useful control is "try again"; and none over an empty state that
 * already offers the same words in the only thing on the page.
 *
 * ⚠️ AND IT IS A GUARD RATHER THAN A PRIVATE EXPORT because there is no privacy
 * to be had: `@engine/design` is one entry point and a screen can import anything in
 * it. What decides whether a thing is internal here is whether something fails
 * when it is used from outside.
 */
{
  const DOCK = /\bDocked\b/;
  const FRAME = "design/src/frame/";
  let hand = 0;
  for (const file of [...filesIn("one-space/src"), ...filesIn("apps")]) {
    const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    if (!DOCK.test(src)) continue;
    hand++;
    fail(`${rel(file)}: docks an action by hand.\n` +
         `       A screen declares \`does\` and the frame places it — in the crown above \`md\`,\n` +
         `       docked below it, and NOWHERE while the screen is waiting, refused or empty.`);
  }
  /* ⚠️ And the one implementation is where it says it is. */
  const inFrame = filesIn("design/src/frame").filter((f) => DOCK.test(readFileSync(f, "utf8")));
  if (!inFrame.length) {
    fail(`${FRAME}: no \`Docked\` to check — if it moved, move this guard with it.`);
  } else if (!hand) {
    ok(`dock: one docked action, declared rather than wrapped`);
  }
}

/* ---------------------------------------------------- a table is a collection --- */

/**
 * ⚠️ A `Table.Column` OUTSIDE `Table.Content` THROWS DURING RENDER, so the screen
 * around it is a blank page rather than a broken table. `Table` is the frame;
 * the collection is `Table.Content`, which is the react-aria half. Putting the
 * header straight under the frame typechecks — every part is a real component
 * and the nesting is plausible — and then react-aria says "cannot be rendered
 * outside a collection" at runtime and React unmounts the tree.
 *
 * ⚠️ THAT IS THE WORST SHAPE A UI DEFECT CAN HAVE, which is why it is worth a
 * static check as well as the render test that now covers the one instance: it
 * produces no partial output, no warning anybody sees, and nothing to tell
 * "broken" from "not built yet". Data & Trust shipped blank in every build.
 */
{
  let tables = 0;
  for (const file of FILES) {
    const src = readFileSync(file, "utf8");
    if (!/<Table\.Header\b/.test(src)) continue;
    tables++;
    if (!/<Table\.Content\b/.test(src)) {
      fail(`${rel(file)}: <Table.Header> with no <Table.Content> — the collection ` +
           `react-aria needs.\n       This throws during render, so the whole screen is blank.`);
    }
  }
  if (!bad) ok(`collection: ${tables} table(s), each inside the collection it needs`);
}

/* ------------------------------------------------------------------ press --- */

/**
 * ⚠️ `Switch.Control` OUTSIDE `Switch.Content` DRAWS A PERFECT SWITCH THAT DOES
 * NOTHING WHERE PEOPLE PRESS IT. `Switch.Content` renders react-aria's
 * `SwitchButton` — the `<label>` carrying the hidden `<input role="switch">` —
 * and the control and the thumb are plain spans with no behaviour of their own.
 * Beside it they are a picture: pressing the track is inert, pressing the word
 * works, and the control reads as broken to everybody who aims at the obvious
 * target.
 *
 * ⚠️ AND THE LIBRARY'S OWN "ANATOMY" SNIPPET SHOWS THEM AS SIBLINGS. Every
 * runnable example on the same page nests them and the source says so in a
 * comment, but the anatomy is the part somebody copies — so this shipped in four
 * components at once, each one built by reading the documentation.
 *
 * ⚠️ THE RENDER TEST IS `design/test/switch.test.tsx` AND IT IS THE REAL ONE;
 * this is the cheap net over every file, including the ones that compose a
 * `Switch` by hand rather than reaching for a component that already got it
 * right.
 */
/*
  ⚠️ AND THE TRACK IS `<Knob />` NOW, WHICH IS THE SAME CHECK ON A DIFFERENT
  NAME. The two-element composition was written at five call sites and grew a
  tick in it, so it is one component — and a component means the raw
  `Switch.Control` legitimately appears once, in the file that defines it, with
  no `Switch.Content` in sight. Exempting that file by NAME rather than by
  pattern is the rule this whole script follows: a wildcard is an exemption a new
  file can wander into.

  ⚠️ THE INVARIANT IS UNCHANGED — the track is inside the pressable label — so
  what the walk matches is both spellings. A `<Knob />` beside a `Switch.Content`
  is the same broken switch it always was, and it now fails for the same reason.
*/
const KNOB_IS_DEFINED_IN = "design/src/parts/forms.tsx";
const TRACK = /<(?:Switch\.Control|Knob)\b/g;

{
  let switches = 0;
  let loose = 0;
  for (const file of FILES) {
    if (rel(file) === KNOB_IS_DEFINED_IN) continue;
    const src = readFileSync(file, "utf8");
    if (!TRACK.test(src)) continue;
    TRACK.lastIndex = 0;
    switches++;
    /* Every track must open after a `Switch.Content` opens and before that
       content closes. Anything else is the sibling shape. */
    for (const at of [...src.matchAll(TRACK)].map((m) => m.index)) {
      const opened = src.lastIndexOf("<Switch.Content", at);
      const closed = src.lastIndexOf("</Switch.Content>", at);
      if (opened < 0 || closed > opened) {
        const line = src.slice(0, at).split("\n").length;
        loose++;
        fail(`${rel(file)}:${line}: the switch's track is outside <Switch.Content>.\n` +
             `       The content is the pressable label; beside it the track is a picture — ` +
             `pressing the switch does nothing and only the word works.`);
      }
    }
  }
  /* ⚠️ Only when THIS check is clean — a confident line under a finding of its
     own is how a guard comes to be read as passing. */
  if (!loose) ok(`press: ${switches} file(s) composing a Switch, every track inside the control`);
}

/* ------------------------------------------------------------------ slots --- */

/**
 * ⚠️ A `slot` NAMES A PLACE IN THE NEAREST CONTEXT, WHICH IS NOT THE ONE YOU ARE
 * LOOKING AT. React Aria resolves a slotted control against the innermost
 * provider above it, and if that provider does not offer the name it THROWS —
 * not a warning, not a fallback: an exception during render, which React turns
 * into an unmounted tree. A white screen.
 *
 * ⚠️ THE OVERLAY COMPONENTS TAKE A `trigger` AND RENDER IT AS THE LIBRARY'S OWN
 * FIRST CHILD, WHICH ASKS FOR NO SLOT. `Drawer`, `Dropdown` and `Popover` each
 * document a bare control there; inside them the only slot on offer is `close`.
 * So a trigger that names one reaches PAST the overlay it belongs to and asks
 * whatever encloses the screen — and whether that is fatal depends entirely on
 * where the screen happens to be drawn.
 *
 * ⚠️ WHICH IS WHY THIS WAS INVISIBLE FOR AS LONG AS IT WAS. Six sites carried
 * `slot="trigger"`; the design package's own mounted test carried it too and
 * passed, because nothing encloses a component mounted on its own. The account
 * centre is presented inside a `Modal` — so the same six characters that are
 * inert in a test fixture took `/space/data` down to a blank page, and the four
 * checks measuring that screen all failed as a twenty-second timeout waiting for
 * a page that was never going to draw.
 *
 * ⚠️ `Reveal` IS THE ONE THAT MAY, AND IT IS NOT AN EXEMPTION. Its trigger sits
 * inside `Disclosure.Heading`, which provides the name — the innermost provider
 * is the right one, so the lookup resolves where it was meant to. The rule is
 * not "no slots"; it is that a trigger handed ACROSS a prop boundary has left
 * the context that would have answered for it.
 */
{
  const TAKES_A_TRIGGER = /\btrigger=\{([\s\S]{0,400}?)\}\s*\n/g;
  /* ⚠️ THE MOUNTED FIXTURES TOO, AND THEY ARE THE HALF THAT MATTERS. The other
     checks here ask about shipped screens; this one asks about a shape that is
     harmless in isolation, and a fixture is isolation by definition. The
     design package's `confirm.mount.tsx` carried the fault and its four
     browser assertions passed — so a fixture left out of this corpus is a
     worked example of the bug, kept green, next to the component. */
  const HANDING = [...FILES, ...filesIn("design/test"), ...filesIn("one-space/test")];
  let handed = 0;
  let reaching = 0;
  for (const file of HANDING) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(TAKES_A_TRIGGER)) {
      handed++;
      if (!/\bslot=/.test(m[1])) continue;
      reaching++;
      const line = src.slice(0, m.index).split("\n").length;
      fail(`${rel(file)}:${line}: a trigger handed across a prop carries a \`slot\`.\n` +
           `       The overlay renders it as the library's first child, where no slot is\n` +
           `       offered — so the name is resolved against whatever encloses the SCREEN.\n` +
           `       Inside a presented surface that is the Modal, which offers "close" only,\n` +
           `       and an unmatched slot throws during render: a blank page, not a warning.`);
    }
  }
  if (!reaching) ok(`slots: ${handed} trigger(s) handed across a prop, none naming a slot`);
}

console.log(bad
  ? `\nheroui: ${bad} finding(s) — a screen branding will not reach.`
  : `\nheroui: components as they ship, themed through tokens.`);
process.exit(bad ? 1 : 0);
