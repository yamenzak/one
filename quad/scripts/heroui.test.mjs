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
  const src = readFileSync(join(QUAD, "web/src/tokens/metrics.ts"), "utf8");
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
  ["web/src/parts/surfaces.tsx", "TileGrid", /w-full flex-col/],
];
let uneven = 0;
for (const [file, group, needs] of EQUALS) {
  const src = readFileSync(join(QUAD, file), "utf8");
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
  const src = readFileSync(join(QUAD, "web/src/frame/layout.tsx"), "utf8");
  const body = (src.split(/\nexport /).find((b) => b.startsWith("function Island")) ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  if (!body) {
    fail(`web/src/frame/layout.tsx: no \`Island\` to check — if it moved, move this with it.`);
  } else {
    /* ⚠️ Both halves off the SAME name, or the bar can name what it did not
       highlight. `isHere` is that name; a second one is the defect. */
    const marks = /data-here=\{isHere/.test(body);
    const names = /maxWidth:\s*isHere/.test(body);
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
    const leaves = /transform:\s*away\s*\?/.test(body);

    if (!marks || !names) {
      fail(`web/src/frame/layout.tsx: the nav's fill and its label are not one condition (D7).\n` +
           `       fill from \`isHere\`: ${marks}; label from \`isHere\`: ${names}.\n` +
           `       Two expressions is a bar that highlights one item and names another.`);
    } else if (gone) {
      fail(`web/src/frame/layout.tsx: a closed label is removed rather than narrowed.\n` +
           `       \`display: none\` takes it out of the accessibility tree, which is five\n` +
           `       unnamed buttons to the one group the icon carries nothing for.`);
    } else if (!leaves) {
      fail(`web/src/frame/layout.tsx: the nav does not leave by \`transform\`.\n` +
           `       Animating height or padding on scroll is layout work on every frame.`);
    } else {
      ok(`travel: the nav names one destination, and leaves on the compositor`);
    }
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

console.log(bad
  ? `\nheroui: ${bad} finding(s) — a screen branding will not reach.`
  : `\nheroui: components as they ship, themed through tokens.`);
process.exit(bad ? 1 : 0);
