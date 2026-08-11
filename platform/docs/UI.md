---
kind: contract
verified: 2026-08-11
---

# The interface language

> ⚠️ **EVERY RULE IN §2 WAS WRITTEN AFTER A DEFECT PRODUCED IT.** None was
> written in advance. That is the method, and §1 is why.
>
> The screens live in `platform/web`; components are extracted out of them when a
> *second* screen wants the same thing, never before one does.

---

## 0. Why this document was emptied

The first attempt is in `_ui-archive/` with a note on what it was. It was not
short of rules: four laws, five page archetypes, a closed sky set, a measured
contrast floor, a state matrix, ninety-one guards. What it was short of was
**components anybody had looked at**.

The defects that ended it were a card with no padding, a menu with no trigger, a
form with no row for its buttons and a progress bar drawn in the text colour.
Every one passed every guard, because a guard written before its component exists
can only check what its author already thought of — and none of them thought of
"is there any padding".

## 1. The order

1. **Build one screen**, in the product, with real content and every state it
   really has.
2. **Look at it** — rendered, in the mode that ships, in both themes, before
   anything else happens.
3. **Fix what looking showed.**
4. **Write the rule that fix implies**, here, as one sentence with its defect.
5. **Write the check**, only if it can fail on a real break.
6. **Extract the component**, only when a second screen wants it.

A rule with no component under it does not go in this file. A guard with no
defect behind it does not get written.

## 2. The rules

Each line names the defect that produced it. Where a check exists it is named;
where none does, the rule is a rule and nothing enforces it yet, which is the
honest state and is marked as such.

### 2.1 Names

**A class is declared once.** — `.ghost` was the quiet button *and* the loading
placeholder. Two unrelated things, one flat namespace, and the rules merged: every
placeholder bar inherited a 40px minimum height, a border and a pill radius, so
the loading state rendered as a stack of empty outlined capsules. Nothing failed
and nothing could have — both rules were valid CSS and the markup was valid HTML.
A second bare `.x { … }` is a second thing wearing the name; `.x:hover`, `.x.y`
and `.a .x` are the same thing being refined.
*Checked: `web/test/css.test.tsx` — "declares no class twice".*

**The stylesheet and the markup are the same set of names.** — A class the sheet
never mentions renders as a bare box; a class nothing wears is an affordance
somebody designed, wrote and believed shipped. `.pad` became dead the moment the
loading state stopped being a sentence, and nothing said so.
*Checked: same file, both directions.*

### 2.2 Waiting

**A placeholder holds the geometry of what is coming.** — A sentence where a list
is about to be means the page jumps the moment the answer arrives, under whoever
had started reading it.

**A placeholder is drawn from the page's ink, never from `currentColor`.** — It
stands in for content on an element that may have set its own colour. The product
mark sets white text for its letter, so a `currentColor`-derived grey came out
white on a white card and the square was simply absent.

**Not answered yet and answered-and-empty are different screens.** — `null` is
the first, `[]` is the second, and conflating them is how a product says "nothing
here" for the length of a round trip and then says it permanently when the
request failed and somebody swallowed the error.

### 2.3 Rows

**Truncation belongs to a row that has something to its right.** — In a list of
things the title is an identity and the line under it is metadata, so a name that
wrapped would push the standing pill off the scan line it shares with every other
row. A destination row has no pill and no scan line: its second line is the whole
content, and clipping it mid-sentence — *"everything in …"* — withholds the only
thing the row had to say.

**An identifier repeats nothing the row already says.** — The workspace mark was
the workspace's own first letter, which the row title states two centimetres
away; two workspaces starting with the same letter were indistinguishable, while
the one thing a cross-product list must make scannable — which product a row
belongs to — was readable only as text. The colour is the product; the letter is
the workspace.

**A status is shown only when it is not fine.** — A standing on every row is a
column of green nobody reads, and the one that needs attention stops being the
thing that stands out.

**Destructive is the words, not the whole row.** — A red bar in a list of
settings reads as an error somebody has to fix. Red text on the one row that
cannot be undone reads as a warning about that row.

### 2.4 Words

**A detail line is a fact about this person, not a slogan.** — *"One file with
every workspace you own"* was shown to somebody who owns none. A row describing
something that does not apply is how a screen teaches people to stop reading the
second line.

**An address is not set like a name.** — Put in the heading at heading size, an
email wrapped mid-word — `b.okonkwo@gmail.` / `com` — because an address has no
spaces to break at. With no name the heading *is* the address and is set as one;
and the action beside it is not "Edit", it is "Add your name".

### 2.5 Theme

**Both themes exist from the first line, in all three scopings.** — The viewer
has three states, not two: an explicit choice stamps `data-theme`, and the
default setting stamps nothing. A colour defined only inside the media query does
not apply when the root carries an explicit choice, and one defined only under
the attribute does not apply to the default. Getting this wrong renders one
theme's text on the other theme's ground.
*Checked: `web/test/css.test.tsx` — "defines every colour in all three theme scopings".*

### 2.6 Motion

**Nobody invents a duration or a curve.** — Before the motion module one screen's
stylesheet carried eight ad-hoc `cubic-bezier`s and eight ad-hoc millisecond
values, each written by somebody reaching for a number that felt right at that
moment and each slightly different from the rest. That is what an interface
moving at eleven speeds is: not a decision, the absence of one. Four curves
(`--enter` `--exit` `--move` `--spring`) and five durations (`--quick` `--swift`
`--settle` `--arrive` `--step`).
*Checked: `web/test/vocabulary.test.ts` — no curve and no sub-two-second duration
outside `motion.css.ts`.*

**Entering and leaving are not the same curve.** — A thing arriving is fastest at
the start and settles, because it is coming to rest somewhere and the eye wants
to see where. A thing leaving starts slowly and accelerates away, because it is
already irrelevant and dwelling on it makes the next thing feel late. Symmetric
easing on both is what makes motion read as *animated* rather than as physical.

**Weight is travel and time together.** — 14 pixels over 320ms read as brisk
rather than substantial: too little distance to see the deceleration, too little
time for the eye to follow it. The same movement at 26 pixels over half a second
has mass. Neither lever alone does it.

**A press releases slowly and answers instantly.** — Down in 150ms so the control
is under the finger before the finger notices; back over half a second on a
spring that overshoots. Making the *release* longer is most of what separates a
control that feels sprung from one that feels like a state change. `cubic-bezier`
cannot overshoot at all — it is bounded by its endpoints — so the spring is
sampled into `linear()`.

**An icon moves the way its own parts would.** — Four generic verbs applied
across a set makes every icon move like every other one, which is tidy and dead.
A key turns about its *hole*, which is the one point a key does not move through;
a download's arrow falls into a tray that stays, because arriving *into*
something is the whole gesture. What stays shared is the timing.
*Checked: `web/test/icon.test.tsx` — every icon's shape is pinned, because the
movements address SVG children by position and Lucide redraws icons between
versions. A redrawn icon does not fail; it animates the wrong part, quietly.*

**Ambient motion is not on the interface scale.** — A sky drifting over
fifty-four seconds and a face breathing over nine are weather: nothing is
responding to anybody, and their rate *is* the effect. The line is two seconds,
and it is a distinction rather than a convenience.

**An entrance fills `backwards`, never `both`.** — `both` keeps the animation's
final values applied forever and they silently win over the element's own
declarations. A collapsing header whose opacity and scale are computed from scroll
position was pinned at whatever a finished entrance had left behind, and did
nothing at all. The entrance looks identical either way; only the element's future
differs.

**A blanket rule sets no `position`.** — `.page > *:not(.sky)` declared
`position: relative` to lift content above the sky, and at two classes to the
bar's one it won: the sticky header was quietly a relative one and scrolled away
with the page, on every screen, while the rule that broke it read as harmless
boilerplate. A flex item takes a `z-index` without being positioned.

**Reduced motion is removed, not shortened, and the rule is universal.** — A
person who has turned motion down is not asking for the same motion faster. The
rule uses `*` rather than a list of classes, because a rule that names what it
knows about silently stops covering the next thing somebody writes.

### 2.7 Shape

**Round is a symbol or a person; a rounded square is a thing with an identity of
its own.** — The workspace mark was 14px on a 44px box, close enough to the
circles beside it to read as a value somebody nearly got right rather than a
decision. A workspace has a name its owner chose and a logo they will upload, and
a logo in a circle is a logo with its corners cut off.

**A single row of interactive content is a pill; a container of rows is a card.**
— A 15px rounded rectangle sat directly above a fully rounded action, in the same
sheet, at the same width.

**Dismissible is one property, not three.** — Dragging a sheet down, pressing
outside it and pressing Escape are the same statement: *I am leaving without
deciding.* A sheet that allows one allows all three; a sheet that allows none
says so with an × and refuses the other two. Wiring them separately produces the
sheet that cannot be dragged away but vanishes when a thumb brushes the ground
behind it.

**A grabber is a claim, so it appears only where it is true.** — A bar at the top
of a sheet is the one piece of furniture that means *pull me*.

**The bar is there from the first pixel and only its ground arrives.** — It holds
the way out and the way on at every scroll position, so nothing moves into it and
nothing has to be found again after scrolling. What changes is a surface, a name,
and the action's words collapsing into its symbol. A bar that slides in carrying
controls that were somewhere else a moment ago is two sets of the same buttons.

**A gate on a confirm is chosen by consequence.** — A press for what can be done
again; a tick for what cannot be undone but takes nothing with it; the thing's own
name typed for what destroys something that has a name. Friction cannot make an
action reversible and cannot make anybody read — what it buys is stopping the
press that was already in flight when the sheet appeared, which is why the
default is a plain press and why a gate on *every* removal trains people to tick
without reading.

**A confirm is dismissible.** — Leaving without deciding is a decision, and the
only one available for free. A confirm you cannot escape is a trap with a
question mark on it.

**A row either goes somewhere or does something, never both.** — Two targets on
one line means the finger that meant "Remove" and landed a millimetre left opens
a screen instead. With an action on the right there is no chevron, because there
is nowhere onward.

**Destruction on a row is quiet, not red.** — Removing a passkey and signing a
device out are both destructive and both sit beside the thing being removed,
which is the more important half of the line. A red button per row makes a list
of ordinary facts look like a list of problems, and the one that really is
dangerous stops standing out. Destruction is confirmed, not coloured.

**A row that carries a button has about half a phone for words.** — "Added 4
March · last used 2 days ago" wrapped to two lines and pushed the standing pill
onto a third; every row was half again as tall as it had reason to be. One short
fact, and at that width a pill is a line by itself.

### 2.8 Failure

**A failure is a `Problem`, never a string.** — The platform already refuses to
hand a provider's prose to a person, so what comes back is a title we wrote, a
detail composed from structured values, per-field messages for a form to place in
place, whether retrying could plausibly work, and a reference the person can
quote to support. Rendering that as `String(err)` in a toast throws away all
five. Per-field goes under its field; anything else sits with the action that
caused it.

**A symbol after the words is its own child, not part of the label.** — Passed in
with the text, the tick landed *inside* a label that sets `line-height: 1` and no
gap, so a finished save read as "Done✓" with the mark touching the word.

**Success is white ink on a deep green, not dark ink on a bright one.** — The
bright green a success colour wants to be cannot carry white text, so the button
was near-black lettering on neon: legible, and it reads as a browser alert from
fifteen years ago rather than as the product answering. Deepen the green until
white sits on it. And it arrives with a small overshoot on the same spring every
control uses, because a ground that merely changes colour is a state being
switched.

**A thing with a face appears as itself inside a sentence.** — "Whoever is using
Scena · Corniche Screens will be signed out" asks the reader to match a name they
read to a planet they saw on the row behind the sheet. A chip is the same object
in both places, so there is nothing to match. It is not a control and must not
look like one, and it never wraps.

**Working is not off.** — The saving state shared the disabled look — the same
attribute, the opposite meaning — so a button mid-round-trip read as broken.

**A disabled control says why.** — "Nothing has changed" is a different dead end
from "that is not an email address", and a control that is off with no
explanation is neither.

**An empty list of something people have never deliberately made explains
itself.** — "No passkeys" says nothing to somebody who does not know what one is,
and that screen is exactly where they will be.

**The absence of a control is a statement, so it does not need a badge too.** —
The email code row carried an "Always on" pill *and* a sentence saying the same
thing, and the pill cost a third line.

### 2.9 Looking

**The preview renders in the mode that ships.** — An HTML file opened directly
has no doctype and puts the browser in quirks mode, where a table stops
inheriting colour and percentage heights resolve differently. A whole review was
made from such a preview and every judgement in it was about a page nobody would
ever see. `web/dev/page.tsx` writes a complete document.

**A comment inside a CSS template literal may not contain a backtick.** — It
closes the literal, and the compiler then reports a missing `,` or `;` hundreds
of lines away in a line that has nothing wrong with it. Sixteen sessions have
ended this way.
*Checked: `scripts/sheets.mjs`, run before the package's own tests. It scans raw
text, so it reports the cause on a file that no longer parses.*

## 3. What was extracted, and when

Two screens is what it took. `ui.css.ts` holds every shape both of them needed;
`screen.tsx` and `list.tsx` hold the components; `account/account.css.ts` is four
rules long, and its being short is the measure of whether this worked.

| Moved out | Because |
|---|---|
| `Screen`, `Section`, `Title` | both screens; and the way OUT is a property of where a screen sits, which two got right by hand and the third would not have |
| `Card`, `Item`, `Entry`, `Pill`, `Waiting`, `Blank` | `Item` six times, `Entry` three, the card in both |
| `ui.css.ts` | the sheet was named for the account and held the sheet, the field and the action — all of which the platform's own `sheet.tsx` already used |
| `mark.css.ts` | the lockup's spacing is a fact about the brand, not about a screen |
| `Sheet`, `ValueEditor`, `Face`, `Icon`, `feedback` | each moved at its second use, before this |

What stayed: the centred lockup title, the name-beside-a-face header, and the
photo control — one use each. The next screen that wants a face beside its title
is what moves them.

## 4. What is not decided yet

Named so that nobody assumes it was. Each becomes a rule when a screen needs it:

- a type scale — the two screens use six sizes and have not had to justify them
- spacing beyond `--pad`, and the gaps in `.page` and `section`
- how a tenant's own brand reaches a platform screen
- a second sheet, which is what will say whether `dismissible: false` was right
- forms with more than one field: every editor so far edits exactly one value

The three product colours in `web/src/ui.css.ts` are **placeholders**, present so
a cross-product list can be scanned when a workspace has no face yet. They become
a lookup the moment a product has a real mark.
