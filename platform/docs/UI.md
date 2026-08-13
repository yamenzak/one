---
kind: contract
verified: 2026-08-12
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

**A record is not a field.** — A field is a quiet label with its value under it,
which is right for an address and wrong for a company: written that way the
recipient's NAME was the small grey label and its job description was the value at
full ink, so somebody scanning "who has my data" read a column of grey names under
a column of white sentences about hosting and payment. The identity goes at the
top, at the weight of an identity.

**A thing with its own screenful of content is a place, not a fold.** — Built as
a disclosure, a product with four documents and a recipient list of its own read
fine closed and pushed the next product half a screen down when opened — so a
person in three of them was reading a list that moved under them. What earns the
row is the state ON it: "1 to read" or "Up to date", so the hub is readable
without opening anything and the chevron is a promise of a place.

**A sign shares a row with the chevron; an action replaces it.** — `sign` was
documented as a mark rather than a control, and was silently dropped whenever the
row went anywhere: a state written beside a destination was declared, passed, and
never rendered.

**Destructive is the words, not the whole row.** — A red bar in a list of
settings reads as an error somebody has to fix. Red text on the one row that
cannot be undone reads as a warning about that row.

### 2.3a Addresses

**Every screen has one, and a screen without one cannot be linked to, refused to,
or supported.** — The hub was a route with four pieces of component
state inside it. So there was no link to somebody's own vault, a refusal that said
"read this first" had nowhere to send anybody, support could not say "open this
address", and the back button left the whole surface instead of going up one
level. The vocabulary is a parser and a printer over a value — the package carries
no router, because a shared surface that mounted one would have to agree with
three of them.
*Checked: `web/test/routes.test.ts` — every route round-trips, and no two print to
one path.*

**Up is derived, never carried.** — A screen that knew where it came from would
behave differently when it was deep-linked to, which is the one thing the stack
already refuses to let a screen know.

**A destination is a value, not a name.** — Rows handed back strings that whoever
mounted the surface matched, so a row could name a screen nobody had built and the
only symptom was a press that did nothing. Handing back an address makes that a
type error. What leaves the surface entirely — a workspace row, which goes into
another product at another origin — is a different callback, because folding it in
would put a route in the union that no screen here can render.

**A reserved segment is refused where the name is declared, not handled where it
is parsed.** — One path segment past a product is where a document's id goes, and
the disclosure sits at the same depth under a fixed word. A document called that
word would resolve to the disclosure on every link, for ever, with nothing
throwing. A parser can only guess which the author meant; a refusal is a sentence
somebody reads while the name is still in their hand.

### 2.4 Words

**A detail line is a fact about this person, not a slogan.** — *"One file with
every workspace you own"* was shown to somebody who owns none. A row describing
something that does not apply is how a screen teaches people to stop reading the
second line.

**An address is not set like a name.** — Put in the heading at heading size, an
email wrapped mid-word — `b.okonkwo@gmail.` / `com` — because an address has no
spaces to break at. With no name the heading *is* the address and is set as one;
and the action beside it is not "Edit", it is "Add your name".

**A summary is a sentence; a table is the summarising the reader had to do.** —
"Stored in", "Companies with access" and "Leaves Europe" were three label/value
rows a person assembled into one fact — *three companies receive something, one of
them is outside Europe, some of it is sensitive.* Write the fact. The rows behind
it are the evidence and belong under it, not in place of it. It is computed from
the same declaration the list is, in one place, because a summary that can
disagree with the list under it is worse than no summary.

**A version says what moved, and only to somebody who saw the last one.** — The
consent ledger is keyed per person per document per VERSION, so republishing
correctly re-asks everybody — and what they were shown was the same wall of text
with a different number on it. Somebody re-agreeing without being told what changed
is a signature collected, not a consent given. To a first reader it is a diff
against a document they have not read, so it is not shown at all.

**A refusal the server already makes needs a surface, or it is a dead end with a
citation.** — Every write with an outstanding document came back 451 naming
document ids, and no screen existed for it: a person met an error on whatever they
happened to be doing. The screen names which product is asking, tells a new version
from a first reading, and says that leaving is still allowed — because the exit
lane survives every gate in the platform precisely so somebody who will not agree
can take their account and go.

**A label promises whose fact it is.** — "Stored in" over `auto, eu` was the
regions the PRODUCT can be deployed in, under a label saying where THIS PERSON'S
data is. Nothing was malformed and nothing failed; the value was simply an answer
to a different question, which is the one kind of wrong a screen cannot show.

### 2.5 Theme

**Both themes exist from the first line, in all three scopings.** — The viewer
has three states, not two: an explicit choice stamps `data-theme`, and the
default setting stamps nothing. A colour defined only inside the media query does
not apply when the root carries an explicit choice, and one defined only under
the attribute does not apply to the default. Getting this wrong renders one
theme's text on the other theme's ground.
*Checked: `web/test/css.test.tsx` — "defines every colour in all three theme scopings".*

**What a theme adjusts, it adjusts through a factor the rest can still multiply.**
— How much of a sky arrives is a ground's headroom times a placement's ask: black
takes the field whole, white takes a third of it, and a card takes half of
whatever its ground allows. Written as an opacity the theme sets outright, the
theme wins — it is `.sky` under two attribute selectors against a placement's
one — so the card dims correctly on white and not at all on black. Both are valid
CSS, both typecheck, and the half that breaks is the half whoever wrote it was
not looking at. Two named factors and one product: the ground sets one, the
placement sets the other, and neither has to win.
*Checked: `web/test/css.test.tsx` — "dims a sky by a factor, so no theme rule can
outrank a placement".*

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

**A disclosure opens and closes; it does not appear and vanish.** — It was the one
state change in the interface with no movement at all, and the worst place for it:
the content arrives below the row that was pressed, so everything under it jumps
and the eye has nothing to follow. The element hides its own children when closed,
so the familiar 0fr-to-1fr transition never runs — the closed state does not render
— which is why this animates the browser's own content box and keeps the element a
real disclosure: keyboard, open state, and a control a reader is told is
expandable. Where the pseudo-element is unsupported the property is dropped and it
opens instantly, exactly as before.

**Ambient motion is not on the interface scale.** — A sky drifting over
fifty-four seconds and a face breathing over nine are weather: nothing is
responding to anybody, and their rate *is* the effect. The line is two seconds,
and it is a distinction rather than a convenience.

**A movement belongs to the journey, never to the screen.** — The same screen is
reached by pressing a row on the surface behind it and by a shortcut from
somewhere else in a product, and those are not the same arrival. A screen
carrying its own entrance would play a coming-back-out movement while arriving
over an app that was never its parent. The direction is derived from how the
level changed; the screens declare nothing.
*Checked: `web/test/stack.test.tsx` — "goes onward away from the root and back to
it", "treats a move between two screens as onward".*

**Which makes the shortcut the default rather than the case.** — A stack animates
a CHANGE and never a first render: whatever presented the level did the arriving,
and a second movement over the top of it is two things arriving at once. That one
rule is the whole of the context-awareness — nothing anywhere has to know that a
screen was deep-linked to.
*Checked: `web/test/stack.test.tsx` — "plays no movement until something changes".*

**A screen that travelled does not also assemble itself.** — Sliding in while its
sections rise one after another is two entrances for one arrival, and the sections
finish long after the screen has stopped. The suppression lasts the life of that
screen, not the life of the movement: released at the end — the obvious tidy-up,
since the movement is over — every section plays its entrance half a second late.
*Checked: `web/test/stack.test.tsx` — "keeps the direction after the screen leaving
has gone".*

**Both screens are on the surface, and both keep their own identity.** — Written
as a conditional beside a fixed child, React reconciles by POSITION first: the
screen on its way out lands in a slot that held nothing a moment ago and is
mounted afresh, so a half-typed field clears and every effect re-runs, in full
view, for the whole length of the movement it is playing. One keyed array. And the
root's key is in a different namespace from every screen's, because a single
reserved word for it is a word some screen may one day be called — that collision
fails nowhere and hands the screen arriving the state of the root it replaced.
*Checked: `web/test/stack.test.tsx` — "carries the screen leaving under its own
key", "keys the root out of every namespace a screen can be in".*

**Onward is a direction, not a sign.** — Going deeper travels the other way in
Arabic, and no transform has a logical form — so the sign is the one thing a level
has to be told, and everything multiplies by it. Sixteen hand-written translates
each getting it right is sixteen chances not to.

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

### 2.6a Feedback

**A tick you feel and a note you hear, and only on a result.** — A press already
has feedback: the control moved because the finger moved. What has no feedback is
the moment a round trip comes back, which is the moment the person has looked away
and the only one worth spending an interruption on. Two notes — `done` and
`wrong` — and there will not be a third without a moment that earns it.
`web/src/feedback.ts` is the whole of it: `feel(note)` fires one,
`configureFeedback(settings)` is called once by the app.

**Sound is off until somebody asks; vibration is on.** — An interface that makes a
noise nobody chose is the most complained-about behaviour there is, and the person
who finds out in a meeting does not go looking for the setting, they stop using
the feature. A tick is silent, is what every native app on the device already
does, and is what a phone in a pocket can actually perceive. `FEEDBACK_DEFAULT` is
`{ haptics: true, sound: false }`, and the preferences screen says which is which
rather than leaving it to be discovered.

**Vibration is Android-only on the web, and the row says so about THIS device.** —
Safari implements no `navigator.vibrate` on any iOS version, so on an iPhone the
control changed a stored value and did nothing anybody could feel: the same lie as
a switch that silently fails. The row asks the browser once, at module scope —
whether a device can vibrate is a fact about the device, not about a render — and
disables itself with a reason where the answer is no.

**The note is synthesised, never a file.** — An asset is a request that can fail,
a decode that can be slow and a byte cost on a page that already inlines its
fonts, for two hundred milliseconds of sine wave. It is also why there is no
silent-first-play problem: nothing has to load before the first save.

**It is configured once, not threaded as a prop.** — This is a device-wide
preference — true of the person, not of the sheet they happen to be in — and
passing it through four components to reach a callback is how one screen ends up
being the one that forgot.

**And a preview needs a way to play one.** — Haptics and a sound cannot be
photographed, and there is no way to feel a save without a control to turn it on;
that is why the dial in `web/dev/mount.tsx` survives, and why it has a *play* row.
A vocabulary nobody can experience is a vocabulary nobody reviews.

### 2.7 Shape

**Round is a symbol or a person; a rounded square is a thing with an identity of
its own.** — The workspace mark was 14px on a 44px box, close enough to the
circles beside it to read as a value somebody nearly got right rather than a
decision. A workspace has a name its owner chose and a logo they will upload, and
a logo in a circle is a logo with its corners cut off.

**One tile draws every face, logo and symbol, and it is one component.** — There
were five and they agreed about nothing: a person's face as a circle at 44 and
another at 62, a workspace at an 11-pixel radius, a company at 14, an icon in a
fully rounded well, and two badges hanging off their corners at −1 and −3. Every
one was defensible alone. Together they were five sizes, four radii and three
badge positions, which is what *inconsistent avatars* is — and no amount of
individually careful work fixes it while there are five places to be careful in.
*Checked: `web/test/interface.test.tsx` — the picture primitive is imported in
one file, and a path is drawn only where drawing lives.*

**A mark's geometry is derived from its size, never written.** — The size is one
number on the element; the radius, the letter, the glyph, the badge and its ring
all come out of it in the sheet. That is what makes a new size one value instead
of five rules — and a pixel radius is what drifted into 11 on one 44-pixel tile
and 14 on another, close enough to read as a value somebody nearly got right.
*Checked: `web/test/interface.test.tsx` — no pixel length inside a mark rule, and
the size variable is set by the component alone.*

**A badge sits on the shape's edge, which takes arithmetic rather than a nudge.**
— Placed at the bounding box's corner it lands *on* a rounded square and in empty
space beside a circle, which is exactly why a camera on somebody's photograph
looked detached while a device on a workspace did not. Nine per cent of the box,
outward, is the point on the arc at four o'clock and just past the square's
corner: one number, both shapes.

**There are two capsules and a third is a symptom.** — A chip says WHICH one: it
carries a face into a sentence, so the thing being talked about appears as itself,
and it is never coloured because the face is already the identification. A pill
says WHAT STATE the row is in: it takes the tone scale and nothing else, appears
only when the state is worth saying, and a row has at most one. The tag was a data
category rendered as a capsule — seventeen possible values, three or four to a
row, in a colour picked per row — and what a reader had was a stack of grey
lozenges to parse instead of a sentence to read. A set of things is a sentence or
a count.
*Checked: `web/test/interface.test.tsx` — no third capsule, a pill is coloured
only by tone, and a pill may not look pressable.*

**Nobody names a colour.** — A palette is only a palette while every surface takes
its colour from it. One white typed onto a button does not move when a theme does,
and it is invisible to whoever typed it, because they were looking at the theme it
happens to be right in. Five of those, a scrim whose darkness was one theme's
guess, and a drop shadow nobody had decided the platform had.
*Checked: `web/test/vocabulary.test.ts` — a colour literal appears on a token's
own declaration, in a value derived from one, or in a mask, where black is
opacity rather than colour.*

**There is one label style, and small tracked capitals is not it.** — A key, an
eyebrow, a callout's sign: all of them are quiet ink, sentence case, a size
smaller. Capitals with letter-spacing is what an interface reaches for when a
label has to LOOK like something, and it had appeared twice — once in amber, on
the screen somebody is asked to read most carefully.
*Checked: `web/test/interface.test.tsx`.*

**Three things said in one paragraph is a list.** — "It covers your account
itself — how you sign in, what you have agreed to, the notifications you have had
— and your vault, including who has read each fact in it. Records inside a
workspace belong to that workspace and are exported by whoever runs it" is five
lines a reader has to take apart before they can answer the question they arrived
with. As three rows it is scanned and finished, and the limit — whose the records
in a workspace are — reads as a fact rather than as an apology at the end of a
paragraph.

**Fine print is a register, and a consent sheet may not use it.** — What a
reading conceals was set faint and italic, which is the typography of a
disclaimer: it is what a sheet nobody is meant to read looks like, on the one
surface whose entire job is being read. Same voice as the sentence above it, one
step quieter. And the recommendation's argument moved to the picker, beside the
option it argues for — in the list it was a third grey sentence read before
anybody had a choice in front of them.

**A place has no mark.** — A globe stood for the edge network and a ring of
sparkles for the European Union: shapes a drawing library happened to have, doing
duty as emblems, in a column where every other tile is a company's own logo or a
symbol that means what it draws. Nothing an icon set contains means "European
Union", and the honest response to that is not the nearest shape — it is a label.
A region and what happens inside it are a question and its answer, which is what
an entry already is.

**There is one focus ring, and it is declared once.** — It was written out
fourteen times: two pixels of accent, by hand, per control. What stays per control
is the OFFSET, because a ring inside a row and a ring around a pill are different
shapes, not different rings. Every pressable thing has one — the consent sheet's
own picker did not, and nothing but a keyboard would ever have found that.
*Checked: `web/test/interface.test.tsx` — one ring, and no control without it.*

**A field that opens focused wears a quieter ring than one you tabbed to.** — An
editor's field is focused the moment the sheet arrives, so a full-strength accent
ring is not an answer to anything somebody did: it is a band of colour across a
surface whose entire content is one value, and it was most of what made that sheet
read as a browser dialog. Three states on one shape — nothing at rest, the accent
at half voice while it is being typed in, the alarm at full strength when what is
in it cannot be saved.

**Selected text is ours.** — Every value editor opens with its content selected,
so the first thing on that sheet was a solid block of the browser's blue behind
our own ring. The ink is left alone: repainting the text is a second decision
about legibility on a colour we did not choose.

**A control takes the page's word space back.** — The text face sets wide letters
against a narrow word space and the platform corrects it once, on the body. The
font shorthand resets that correction, and every row, field and button in this
product takes the page's font through it — so the correction reached paragraphs
and nothing else. Measured: 1.28px on a paragraph, 0 on every row title and every
row detail, which is most of the words in the hub. It read as bad
rendering rather than as a choice, which is what the original rule says about it.
*Checked: `web/test/interface.test.tsx`.*

**A link out is a component, and it says it leaves.** — Every link in the account
centre was a bare anchor: browser blue, browser underline, no press, no motion,
nothing saying it left, on a surface where every other control has a tone and a
spring. It happened because an anchor is the one element that looks finished with
no styling at all. The outward mark is not decoration — rendering an operative
document's address as more of this page is how somebody agrees to a summary
believing they read the contract. The underline is drawn rather than inherited so
it can grow from the start of the word; a browser underline sits at a fixed offset
and cannot animate at all.
*Checked: `web/test/interface.test.tsx` — no bare anchor outside the two files
that own one, and a link out carries the mark and no referrer.*

**One thing on a surface may be a place rather than a setting, and it is lit to
say so.** — A list of rows says *these are all the same kind of thing*, which is
exactly what a hub's settings are and exactly what the vault is not:
it is the one part of an account that keeps its meaning for somebody who has left
every product. Making it a taller row would have said it was a bigger setting. It
carries its own light, its own lockup and its whole surface as the target — and
the light is the page's own variant at a different hue, one number moved, so it
is unmistakably its own without being a second design. At most one per surface;
a second crown is a list of crowns, which is a list.

**A recognisable thing gets its mark, and the mark never carries the
identification.** — A list of company names is a list of words to read; the same
list with logos is one to recognise, and a reader who has seen the host's mark on a
hundred status pages skips the sentence. Which mark to draw is DECLARED rather than
inferred from an id — two entries for one company share a mark and keep their own
ids — and an unknown or absent name falls back to the initial, never to a drawn
office block, which beside three real logos reads as a company nobody could
identify. The full legal name is always on the row, so the mark is hidden from a
reader.
*Checked: `web/test/interface.test.tsx` — every declared mark has a drawing, and
nothing is drawn that no manifest declares.*

**A link to somebody else's terms is a link, never a copy.** — Their certification
list changes on their schedule; a copy in this repository is wrong the first time
one lapses, in the most damaging place available — a compliance claim we made about
somebody else.

**A section that is a place with a mark of its own is named by the mark.** — The
account's own documents sit above three products' in one list. Set as words,
"Your 4° account" is a fourth product with a longer name — and the lockup is the
platform's only device for saying this one is a different order of thing: it
exists before any product, outlives all of them, and holds the vault. It is not a
licence to decorate a heading; a section named by anything other than what it is
already had the wrong name.

**A card's light is a placement, never a second sky.** — The same field, differing
only in where it starts, how far it reaches and how much of it arrives. Written as
a variant it would be two piles of gradients to keep in step, and it would go
wrong in the direction nobody checks: the card's copy, months later, still lit the
way the page was lit when it was copied. What genuinely differs is that a card is
a fifth of the width — every source overlaps at that size, so the field saturates
and what read as light becomes paint — and that a bounded card on white can take
*more* tint than a page can, because what a page's light must not become is a
coloured header, and a card has an edge and a shadow so a tint inside it reads as
what the card is made of.

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

**Each screen is its own scroller, and coming back puts you where you were.** —
One scroller behind a level would have to be forced to the top on the way in, and
could not be put back on the way out without dragging the screen still leaving
along with it — so a half-read list comes back at the top. Separate scrollers make
the restore a number written to an element nothing else is looking at, before the
frame is painted. Only the step just taken is remembered: coming BACK resumes,
going ONWARD to a screen visited earlier starts at the top, which is what each of
those two words means.

**A card inside a sheet bleeds to the sheet's edges.** — The sheet is already the
card — same fill — so the element contributes no ground at all, and the only
thing it was doing was insetting every row by its own padding while the title
stayed at the sheet's edge: two left edges, eighteen pixels apart, for a reason
no reader could name. Full-bleed also gives each row's press its whole width. The
sheet's inline padding is a variable so the negation cannot drift out of step
with it.

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

**A marked row's second line is one line, and the sheet is what holds it there.**
— A company's declared role is a sentence written for a record; as a row's detail
it wrapped to five lines while the TITLE clipped to make room — the identity
truncated so the metadata could run on, which is the wrong way round in every
case. It is on the row rather than on the line, because what a screen chooses is
what it puts on the row; how a row holds it is the sheet's.
*Checked: `web/test/interface.test.tsx`.*

**A row that carries a button has about half a phone for words.** — "Added 4
March · last used 2 days ago" wrapped to two lines and pushed the standing pill
onto a third; every row was half again as tall as it had reason to be. One short
fact, and at that width a pill is a line by itself. A switch is the same
budget — measured, 212 pixels against a plain row's 243, which is about thirty
characters — and both feedback rows wrapped until their copy was cut to fit.

**A chevron is a promise of a next screen.** — An option in a picker is pressed
and commits and closes, so it points at nothing; the tick on the one in effect is
the only mark it ever carries. `Item` derives this rather than taking a third
prop: a row only knows whether it is *current* when it is one of several, and a
row that is one of several never goes anywhere.

### 2.7-i Places, tiles and quick actions

**A crown is a PLACE; a row is a setting.** — The difference is carried by the
light, the lockup-scale name and the fact that the entire card is the target. A
button inside one would be a second thing to hit on a surface that is already the
offer. Use it where the destination is somewhere rather than something to change:
the hub's three areas, the vault.
*Checked: `web/test/screens.test.tsx` — three crowns, three targets, nothing
nested.*

**Only the hue varies between crowns on one screen.** — Same mechanism, same sky
variant, one number moved, so a set of them reads as a set. Given free rein each
grows its own gradient and the screen stops being one page. Chosen together, never
apart: picked one at a time, two of them land within fifteen degrees and nobody
can tell the cards apart at a glance, which is the one job the hue is doing.
*Checked: `web/test/screens.test.tsx` — three distinct hues, one sky variant.*

**The mark goes on what is actually named after the brand.** — The hub drew its
three areas as lockups and its own title as a fourth, so one screen carried the
mark four times; that does not make three areas look important, it makes the mark
furniture. "4° Vault" is a name. "4° Marketplace" is a page with a logo on it.

**A grid where the mark is the content; rows where the second line is.** — A
product on a shelf has a logo and a name and nothing else worth a line, and set as
rows that is a column of mostly empty space where the eye reads every label to
find one it recognises. A subscription has a price, a standing and a renewal date
— facts somebody scans for — and set as a tile all three are gone. Three across,
which is not a breakpoint: two is a list with gaps, four puts the mark below the
size at which a logo is a logo.
*Checked: `web/test/screens.test.tsx`.*

**Something on offer that is not open to this person is shown and said, never
hidden.** — Hidden, the grid is a different shape per person and "where is the
other one" has no answer anybody can act on. And it is not rendered as a disabled
button: that announces it as a control they cannot use, when it is a thing on a
shelf with a word saying why it is not theirs. A truncated grid says how many
there are, because one truncated silently reads as the whole set.

**A quick row is the two-to-four things somebody came to do.** — It earns its
place as the alternative to full-width buttons stacked down a screen, which is a
screen that looks like a decision when it is a menu. The label is part of the
target, not a caption beside it, and the circles are a fixed width so four of them
still read as a row rather than as a sentence of buttons. Nothing destructive goes
in one — that gets its own card at the bottom, which is what says it is not one of
the things above.

**A hero is a STATE, not a heading.** — What am I on, is it fine, when does the
next thing happen. A screen that opens with a list of features has answered the
fourth question first. Its supporting line is narrower than the page because it is
centred; centred text at full width is read by moving the eye back to a different
starting point on every line.

### 2.7a The door

**A sign-in screen never says whether an address is known here.** — Both
operations behind it answer identically for an address with an account and one
without, because telling them apart is a membership oracle: type an address,
learn whether that person uses a clinical product. A screen with "no account
found", or with a sign-up button beside the field, hands over exactly what the
endpoints refuse to.
*Checked: `web/test/door.test.tsx`.*

**The passkey is offered in the field, not announced.** — Conditional mediation
puts the credential in the address field's own suggestions, so somebody who has
one taps it and is in, and somebody who does not sees an ordinary field. A "sign
in with a passkey" button asks everybody to know what a passkey is in order to
find out whether they have one. The explicit row appears only where the browser
cannot suggest.

**A dismissal is not a failure, and this is the distinction every naive passkey
flow loses.** — `NotAllowedError` is what a browser raises when somebody
dismisses the sheet, when the ceremony times out, and when a conditional request
is superseded. Shown as an error, the product accuses somebody of a mistake they
did not make, in red, on the screen where they cannot get in. Four outcomes —
worked, dismissed, unsupported, failed — and only the last one is anybody's
problem.
*Checked: `web/test/door.test.tsx`.*

**The offer to add a passkey is a suggestion, so both answers are the same
size.** — Somebody standing on it is already signed in; the product has what it
needs. A "Not now" set small and grey would be asking for a decision the screen
has already made. And it is shown when the SERVER says so: it knows what
credentials this person holds and which relying party this door prompts for, and
a screen that guessed would nag somebody who already has one.

**A countdown belongs to whoever refuses.** — The runtime declines a second code
inside a minute and reports the seconds remaining; a timer the screen invented
comes back before the endpoint will answer it, which teaches people to press a
button that fails.

**The title is the value and the button is the action.** — The passkey offer had
"Add a passkey" as its heading and "Add a passkey" as its button, two hundred
pixels apart: a screen saying one thing twice, with nothing on it saying what the
thing is for.

### 2.7b Starting something

**Nobody is offered what they cannot do.** — Most people holding an account here
are a customer of somebody else's workspace. A "New workspace" button on their
hub offers a thing they cannot do, and the refusal that says so
arrives long after they have decided the product is confusing. The control
appears only for somebody a grant or an open front door lets in — and the control
is not what makes it safe: `identity.workspace.create` refuses regardless, which
is a different job from not offering.
*Checked: `web/test/screens.test.tsx`, `hello/test/provisioning.test.ts`.*

**A picker with one option is a question with one answer.** — One product to
open goes straight to it; one region to keep records in draws no region row at
all. This is the same rule everywhere it comes up, and it comes up on every
screen that hands over.
*Checked: `web/test/screens.test.tsx`, `web/test/setup.test.tsx`.*

**The permanent decision is made above the button that commits it.** — An
address and a region can never be changed afterwards. A row for either placed
under the create control is one the ordinary path presses past without scrolling
to.
*Checked: `web/test/setup.test.tsx`.*

**A suggestion derived from what somebody typed stops following the moment they
touch it.** — An address derived from a name is a courtesy; one that keeps
re-deriving overwrites what was deliberately typed on the next keystroke
somewhere else, which reads as the form fighting back.

**A field's helper line lives inside the field.** — Written as the form's next
child it inherits the form's gap, which is the same distance as the gap to the
button below — so a line about the field above reads as a line about the control
beneath it. `Field`'s `under` is where it goes, and a refusal REPLACES it rather
than joining it: two lines under one box, in the one place somebody is trying to
fix something, and only one of them is what they need to read.
*Checked: `web/test/setup.test.tsx`.*

**A public address is shown whole.** — A field showing `my-gym` with the rest of
the hostname in a help page reads as a nickname, and somebody picks one they
would not have chosen written out.

### 2.7c Money on a screen

**A row either goes somewhere or carries something on the right, never both.** —
This is `Item`'s own rule and it bites hardest here: a price or a trial pill put
in the action slot makes the row unpressable AND is silently dropped, which is
how a credit-pack row shipped with no price on it. Money and state go in the
detail line, which already takes a capsule.
*Checked: `web/test/screens.test.tsx`.*

**A price is formatted once, from minor units.** — Divided by a hundred at each
render site it is wrong in one place, and it is always the place nobody looks at
— which on a storefront is the one that took the money.

**A balance says what expires and when, beside what does not.** — One figure
covering a perishable allowance and a permanent purchase is a number that drops
overnight, and the conversation that follows is about whether we took somebody's
credits.

**A ledger's own string never reaches a screen.** — `hold:draft-plan` is right to
store and wrong to print: it makes somebody's own spending read as a machine's
notes about them.

**What a plan includes belongs inside the plan.** — Three plans of three
entitlements rendered flat is nine rows repeating three labels; a real catalogue
is four plans of eight. Disclosed, the shelf is three lines and comparing is
something somebody chooses to do. **And a switch that is off is drawn**, because
a plan that omits what it does not include cannot be compared with one that does.

**A deployment that cannot charge says so before the price list, once.** — Every
button refusing is somebody's decision spent before they are told it could not
have been made.

**A state is a label; a consequence is a sentence; they go in different places.**
— "Payment failed" fits under a plan name and in a row's second line. "This
workspace is read-only until 4 September" fits in neither, and one string carrying
both renders as `Payment failed — this workspace is rea…`. The label may change
colour; a pill repeating the sentence it sits under is the same fact twice.
*Checked: `web/test/screens.test.tsx`.*

**Arrears carry the address that fixes them.** — A screen saying "payment failed"
with nothing to press has told somebody they have a problem and left them to find
the door, which is how arrears reach support instead of the provider's own portal.
Its opposite is also a rule: a pay control on a subscription in good standing is
an invitation to pay twice.
*Checked: `web/test/screens.test.tsx`.*

**A paid subscription with nowhere to point is a state, and it needs a surface.**
— Somebody buys, is handed to the product's setup door, and closes the tab: what
they hold is money taken with nothing to show for it until a screen says
otherwise. Modelled as an error the recovery is a support conversation; modelled
as a state it is a row that says "you have paid for this, making the workspace is
the last step".
*Checked: `web/test/screens.test.tsx`.*

### 2.7d Screens nobody writes

**A settings screen is the declaration, rendered.** — `SettingsSpec` already
carries the label, the kind, the range, the choices and the help line, and the
read already sends it beside the values. A form written beside that goes out of
date in the direction nobody notices: a setting added to the manifest and not to
the form has a default nobody can change on a screen that looks complete; one
removed and left on the form writes a key no consumer reads. Neither fails.
*Checked: `web/test/declared.test.tsx`.*

**One control per KIND, and an unknown kind draws nothing.** — A switch is the
only inline control, because in a switch the choice IS the action; everything
else is a value somebody types or picks, and a card of inline inputs is a form
rather than a settings screen. A future kind rendered as a text box is a colour
somebody types a word into — refused by the store, so what they see is a field
that will not save. Absent is honest; wrong is not.

**A row says what it is set to, whether or not you may change it.** — A settings
screen whose rows are only names is a menu, and a menu between somebody and
eleven settings is a tax. What a workspace has chosen is also not a secret from
the people it applies to, so a narrower setting is shown and stood down rather
than hidden.

**A fallback is not a choice.** — Printing a declared default as though somebody
had typed it makes an untouched workspace look configured. "We have not decided"
and "we decided this" are the difference the screen exists to show.

**Group by the prefix the key already has.** — `brand.*` is one card, `lapse.*`
another. Derived, so a new group is a key name rather than a second registry to
keep in step.

**A roster names no role and no permission of its own.** — Both come from the
manifest merged with what the workspace made for itself, so a role added to a
product appears on the screen and one removed stops appearing. The same rule as a
settings screen, for the same reason — and the permission's own words are read
out of its key rather than from a lookup table, which would be a second
vocabulary to keep in step with the manifest.
*Checked: `web/test/declared.test.tsx`.*

**A role somebody may not hand out is shown and stood down, never hidden.** — The
server refuses to grant a role carrying keys the granter does not hold, so
dropping it from the list leaves an administrator wondering why their screen is
shorter than the one a colleague is describing. The same rule as a narrower
setting, one screen over.

**A permission is a checkbox, and the sheet saves once.** — A write per toggle
turns composing a role into fifteen requests, any of which can fail alone and
leave a role that is half of what somebody meant — with no moment they could
point at and say "that is what I decided".

### 2.7e An operator console

**It is the deployment's, not one product's.** — There is one payment account,
one mail lane and one bot check behind every product, so a console per product is
three sign-ins and three places to paste one key — and the copy nobody re-pastes
fails in a way nobody attributes to the rotation. What makes it possible is that
every per-product row is keyed by the product; what makes it honest is that each
product publishes what it declares, so the console can show what shipped beside
what was changed.

**A secret is set, and never shown.** — A console that can display a provider's
key leaks one through a screen share, a support session or any read
vulnerability. What an operator needs is whether it is configured. Say
"write-only" ONCE for the screen: repeated per row it makes the secrets the
tallest, loudest things on a list whose subject is which keys are set.

**Say where a value came from.** — "It is set" and "it is set HERE" have
different fixes. Typing a local value over one resolving from the shared store
pins that product to a copy which will not follow the next rotation, and nothing
else on the screen would say so.

**Mark what was moved, and only what was moved.** — An edited price, a
grandfathered ceiling, an adjusted one. A badge on every row is texture; a badge
on the two that differ is the answer to "why does this workspace have more than
the plan says", which is the question support is actually asked.
*Checked: `web/test/declared.test.tsx`.*

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

### 2.8a Consent

**A decision is a paragraph with a control, not a row with a value.** — Built on
the row shape, a consent line had a title, a reason, a sentence about what would
be hidden and a rung all competing for one line: the rung took a third of a phone
and the words wrapped into a four-word column. A row is for scanning a list; this
is for reading one thing and deciding about it, so the control goes underneath at
full width — where it is also a better target.

**The recommendation is an argument, never a default.** — Nothing is
pre-selected, no switch is already on. Every fact starts at "only me" and the
suggestion appears beside the choice with its reason. A default that applied
itself would be a disclosure nobody made, and the whole value of the screen is
that somebody had to move something.

**A derivation says what it cannot reveal, in writing.** — "Which way it is
going" and "your weight" are different disclosures, and the second sentence —
*a direction and a rate, with no starting point to add them to* — is what earns
the smaller one. Without it a reader has to take on trust that the arithmetic
gives less away than its input.

**"Done", never "Allow".** — Nothing was allowed as a whole. Every row was
answered on its own, and one button implying otherwise is the permission prompt
this screen exists instead of.

**The current answer is always shown, in words.** — A chevron alone makes every
block look unanswered, so somebody who has already decided cannot see that they
have and the screen reads as a form they failed to fill in.

**Asking happens where the blank is.** — A consent screen shown once during
onboarding is answered by somebody who has not seen the feature and cannot weigh
it. The same question asked where the value would have gone, by a surface that
says what would fill it, is one somebody can actually answer — and it is an
invitation, not an error: a withheld fact is a decision the person is entitled to.

### 2.9 Settings

**A switch for what is on or off, a sheet for one of a few, and neither has a
save button.** — In both, the choice *is* the action, so a confirm step asks
somebody to agree with themselves. What that costs is a way to fail, which is why
both apply optimistically, hand back a `Problem`, and put themselves back where
they were.

**The current value is the detail line.** — It is what makes a list of choices
readable without opening any of them. A row that says only "Theme" is a row
somebody has to press to learn anything.

**A hub of categories, each its own screen — and every row says what is set.** —
Preferences is the one surface that only ever grows, and it grows sideways:
notifications, region, privacy and accessibility have nothing to do with each
other and each arrives whole. A flat list absorbs the first two and then has to be
split anyway, at which point every setting somebody had learned the position of
has moved. What earns the extra tap is the summary: with the current values on
the hub the whole configuration is readable without opening anything. A hub whose
rows are only names is a menu, and a menu between somebody and five settings is a
tax.

**A control tells the truth about the device it is on.** — Safari implements no
`navigator.vibrate` on any iOS version, so on an iPhone the vibration switch
changed a stored value and did nothing anybody could feel — the same lie as a
switch that silently fails. It is asked once, at module scope: whether a device
can vibrate is a fact about the device, not about a render.

**Each language is named in itself.** — "German" is only useful to somebody who
already reads English, which is precisely not the person looking for it.

**A summary names what is on, not how many things are.** — "2 of 3" is a count
somebody would still have to open the screen to identify.

**A list whose rows would all carry the same icon carries none.** — Two
candidates for the vault's lists were both borrowed meanings — a shield is
protection, a download arrow is a download — and either way the column repeats
what the section heading already said.

**Shared first, then the rest.** — A list in registry order buries the three
things somebody came to check under nine they have never filled in. The screen is
opened by somebody who wants to stop something, which is a thing they are already
sharing.

**A lapsed grant is shown, with its date.** — "It ran out" and "I never gave it"
are the two answers somebody most wants to tell apart, and filtering the first out
makes them the same screen. The same reason an expiry is a date rather than
"expires soon": somebody deciding whether to extend needs the day.

**Once is not worth a count.** — "4 times" is information; "1 times" is a
template showing through.

### 2.10 Looking

**The preview renders in the mode that ships.** — An HTML file opened directly
has no doctype and puts the browser in quirks mode, where a table stops
inheriting colour and percentage heights resolve differently. A whole review was
made from such a preview and every judgement in it was about a page nobody would
ever see. `web/dev/page.tsx` writes a complete document.

**A fixture holds the shipped defaults.** — The preview had sound switched on
because it was convenient to test, so every screenshot of the feedback screen was
a picture of a setting nobody chose — and a screenshot is what a design decision
is argued from.

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
| `Field` | the confirm sheet's typed gate wanted the editor's input, wrong-state and all |
| `SwitchRow`, `Choose`, `Chip`, `Confirm`, `useCommit` | each at its second wanter; `Choose` then went back onto `Item` rather than keeping its own copy of a row's markup |

What stayed: the centred lockup title, the name-beside-a-face header, and the
photo control — one use each. The next screen that wants a face beside its title
is what moves them.

## 4. What enforces this

⚠️ **GENERATED FROM `docs/guards.json`, so this document cannot promise a check
that does not exist.** Prose claiming enforcement nobody built is worse than no
prose: it is authoritative-sounding and expensive to disprove. Every rule in §2
that names a check appears here; every rule that does not is a rule and nothing
more, which is the honest state.

<!-- generated: node scripts/guards.mjs table interface -->
| guard | fails on | |
|---|---|---|
| `a-class-is-declared-once` | two unrelated things sharing one class name. `ghost` was the quiet button AND the loading placeholder, so every placeholder bar inherited a 40px minimum height, a border and a pill radius — the loading state rendered as a stack of empty outlined capsules and nothing failed, because both rules were valid CSS | **live** |
| `the-sheet-and-the-markup-are-one-set-of-names` | a rule nothing wears — an affordance somebody designed, wrote and believed shipped — or a class the sheet never mentions, which renders as a bare box | **live** |
| `both-themes-in-all-three-scopings` | a colour defined only under the media query or only under the attribute. The viewer has three states, not two, and the missing one renders one theme's text on the other theme's ground | **live** |
| `a-movement-belongs-to-the-journey` | a direction taken from the screen rather than from the step. The same screen is reached by pressing a row on the surface behind it and by a shortcut from elsewhere in a product; one carrying its own entrance plays a coming-back-out movement while arriving over an app that was never its parent, and a movement in the wrong direction is still a movement | **live** |
| `a-stack-animates-a-change-and-never-a-mount` | a level that animates its first render. Whatever presented it did the arriving, so a second movement over the top is two things arriving at once — and every deep link slides in from the side over an app that was never behind it. This one rule is the whole of the context-awareness | **live** |
| `a-screen-leaving-keeps-its-own-key` | the pair rendered as two sibling slots rather than one keyed array. React reconciles by position first, so the screen on its way out lands in a slot that held nothing a moment ago and is mounted afresh — a half-typed field clears and every effect re-runs, in full view, for the whole length of the movement | **live** |
| `a-sky-is-dimmed-by-a-factor` | a theme rule setting a sky's opacity outright. How much light arrives is a ground's headroom times a placement's ask; set as an opacity the theme wins on specificity, so a card that dims itself dims correctly under one theme and not at all under the other — valid CSS either way, and the broken half is the one whoever wrote it was not looking at | **live** |
| `no-backtick-inside-a-sheet` | a backtick in a comment inside a CSS template literal — it closes the literal, and the compiler reports a missing , or ; hundreds of lines away in a line that has nothing wrong with it. Scans raw text, so it reports the cause on a file that no longer parses | **live** |
| `vault-a-control-never-spends-a-rung-unasked` | a want with more than two rungs rendered as a switch. Somebody who chose "the assistant, no people" sees it reading ON, and turning it off and on again silently re-grants at the top of the ladder — nothing throws, the sentence underneath stays correct, and only the control is a lie about what it will do | **live** |
| `vault-screen-writes-no-copy-of-its-own` | the hub explaining a fact in its own words. Every reason, recommendation and hides-sentence is read out of a declaration, so an app that declares a thirteenth fact gets a thirteenth row without this screen being opened; the day it stops being true is the day the vault grows a branch per product | **live** |
| `a-screen-may-not-invent-a-payload` | a screen written against `subprocessor: {name, purpose, region}` where the kernel declares `{id, name, role, receives, where, safeguard, terms}` — two fields nobody has ever sent. It typechecked, every test passed, and the screenshots looked right, because the FIXTURES were written to match the invention. `s.json()` is opaque at the boundary, so the kernel type the handler returns is the only place the shape is written down: name it, never describe it | **live** |
| `an-old-acceptance-is-not-a-missing-one` | a boolean where four states are needed. "Accepted an earlier version" is what everybody sees the day terms change, and collapsing it into agreed-or-not misreports the record on precisely the day it matters | **live** |
| `an-acceptance-is-matched-on-its-version` | "Accepted 2 March" shown against terms published in June — a screen quietly claiming somebody agreed to something they have never been shown | **live** |
| `agreeing-requires-opening-the-document` | a tick beside a link, which is worth nothing as evidence — the only defensible record of an acceptance is one where the text was on the screen | **live** |
| `a-recipient-is-shown-the-intersection` | rendering a subprocessor's own `receives` instead of the transfer's `categories`, which lets any recipient make its row larger than the truth — over-disclosure, in the direction nobody checks | **live** |
| `leaving-europe-is-counted-by-safeguard` | `transfersOf` returning a row per recipient whether or not it crosses a border, so counting the list says yes for a deployment where nothing leaves | **live** |
| `a-declared-document-is-text-not-markup` | bold headings bought at the price of making every app's manifest a way into every reader's page | **live** |
| `documents-are-named-by-their-product` | an ungrouped list, which cannot say whose terms these are once a person belongs to more than one product | **live** |
| `a-category-set-is-a-sentence` | a set of things rendered as capsules — seventeen possible values three or four to a row, so the question somebody actually has, is my health data in there, is answered by scanning a stack of grey lozenges rather than by reading. Article 9 marked as a badge is the same failure twice: it says something here is sensitive without saying which | **live** |
| `the-account-is-named-as-yours` | the account's own section headed like a product's. Under the deployment's name it reads as a fourth product in a list of three, and the documents everybody owes look like ones only some people do | **live** |
| `the-answer-comes-before-the-evidence` | a disclosure written as a table — "Stored in", "Companies with access" and "Leaves Europe" were three label/value rows a person had to assemble into one fact, and the first of them was a claim the payload cannot support: the regions the PRODUCT can be deployed in, under a label saying where THIS PERSON'S data is | **live** |
| `a-disclosure-is-worth-not-opening` | a row saying only "Who else sees this" — a door, with everything behind it one press further away for nothing. The same rule the vault's groups and the preferences hub live by, and the reason the count is on the row rather than only on the screen it opens | **live** |
| `an-unpublished-disclosure-says-so` | a product whose disclosure has not published rendering nothing at all, which is indistinguishable from one that shares with nobody — the opposite claim, made silently, on the screen where the difference matters most | **live** |
| `a-product-is-a-place-not-a-fold` | a hub of disclosures. A product with four documents and a disclosure of its own is a PLACE, and unfolding one pushed the next product half a screen down — so a person in three of them was reading a list that moved under them. The state stays on the row, which is what keeps the hub readable without opening anything | **live** |
| `a-group-counts-what-is-owed` | "3 of 4" — a fraction whose remainder may be documents nobody ever has to accept. The number a person is looking for is how many are waiting on them, and the settled state has to be true of a product that never asked them for anything | **live** |
| `a-version-says-what-moved` | a republished document shown as the same wall of text with a different number on it. Versioning was already real — the ledger re-asks everybody the day it changes — so somebody re-agreeing without being told what moved is a signature collected rather than a consent given | **live** |
| `a-refusal-to-continue-has-a-surface` | a 451 with a list of document ids and nowhere to go. The server refused every write for outstanding consent and there was no screen for it, so a person met an error on whatever they happened to be doing — a dead end with a citation | **live** |
| `declining-still-lets-you-leave` | a consent wall that only offers agreement. The exit lane survives every gate in the platform precisely so somebody who will not agree can take their account and go, and a screen that does not say so pretends otherwise | **live** |
| `closing-waits-for-what-it-would-strand` | a working Close in front of somebody whose workspaces would be left with nobody who can manage them — `null` and `[]` read as the same answer, on the one screen where the difference is a workspace nobody can re-enter | **live** |
| `an-export-says-what-is-missing` | an export that prints only what it managed to gather. It arrives, it is full of somebody's data, and nothing in it says what is not there — which is the omission that makes an export dangerous rather than merely incomplete | **live** |
| `a-region-is-named-or-printed-as-itself` | a prettified guess at where somebody's data physically is, on the one screen that exists to answer exactly that. The two ids the kernel documents are named; a third has no name and is shown as the identifier it is | **live** |
| `every-destination-has-an-address` | two screens printing to one path, so one of them is unreachable — and, before this, a hub whose inner screens were component state: no link to a vault, no address for a refusal to send anybody to, and a back button that left the whole surface | **live** |
| `a-route-parses-back-to-where-it-was` | a printer and a parser that do not invert each other — a surface that works until somebody reloads, and then opens somewhere else, once, with nothing in the console | **live** |
| `a-declared-mark-is-drawn` | a mark named in a manifest that nothing draws. The fallback is total by design — an unknown name renders the company's initial — so a typo is a row that looks fine with the wrong thing in it, and the only way to notice is to have seen the right one | **live** |
| `a-face-is-drawn-by-one-tile` | five avatar treatments, each defensible alone: a circle at 44 and another at 62, an 11-pixel radius beside a 14, two badge offsets and an icon well that was a sixth. Nothing fails — a screen with the wrong radius renders, passes and ships — and no amount of individually careful work fixes it while there are five places to be careful in | **live** |
| `a-path-is-drawn-where-drawing-lives` | a glyph written at a screen, which is a second stroke weight and a second optical size nobody chose. On this surface it is worse: four company logos were drawn from memory, which is a trademark reproduced wrongly on the one screen that names the company it belongs to | **live** |
| `a-mark-derives-its-geometry` | a radius, a badge offset or a letter size written in pixels. It drifts the first time somebody adds a size, which is exactly what an 11-pixel radius on one 44-pixel tile and a 14 on another already were — a value somebody nearly got right rather than a decision | **live** |
| `a-mark-is-sized-from-the-scale` | a screen setting the tile's size variable itself, which is a fourth size in a three-size scale — and it is invisible, because the sheet derives everything else from it and a wrong number still renders a perfectly proportioned mark | **live** |
| `nothing-is-drawn-that-nobody-declares` | a committed brand path shipped to every browser for a company no manifest names. Not a defect a person sees — which is why it accumulates | **live** |
| `a-link-out-is-never-a-bare-anchor` | browser blue, browser underline, no press and no motion, on a surface where every other control has a tone and a spring. An anchor is the one element that looks finished with no styling at all, which is why this was every link in the hub | **live** |
| `a-link-out-says-it-leaves` | an operative document's address rendered as more of this page, which is how somebody agrees to a summary believing they read the contract. The referrer matters for the same reason: a link out of a screen about somebody's data should not tell the destination which screen they were on | **live** |
| `there-is-no-third-capsule` | a chip, a pill and a tag that are all a rounded rectangle with a grey ground and small text. That is what capsules everywhere is — not too many of them, but no rule about what one MEANS | **live** |
| `a-pill-takes-the-tone-scale` | a colour chosen per row, which is how a column of capsules comes to look arbitrary. Four states named for what they mean is the rule that was missing | **live** |
| `a-pill-is-not-a-control` | a border, a shadow or a cursor on a thing that cannot be pressed, which makes a list of facts look like a row of buttons | **live** |
| `a-marked-rows-detail-is-one-line` | a sentence written for a record used as a row's second line: five wrapped lines with the title clipped above them — the identity truncated so the metadata can run on. It is held by the sheet rather than by the caller, because a payload somebody else composes will eventually arrive longer than it promised | **live** |
| `nobody-names-a-colour` | a colour typed at the point of use, which does not move when a theme does — and is invisible to whoever typed it, because they were looking at the theme it happens to be right in. Five hand-written whites on saturated grounds, a scrim and a drop shadow got in this way | **live** |
| `there-is-one-focus-ring` | a focus ring written out per control — two pixels of accent, fourteen times, by hand. It is the same failure as fourteen durations: not a ring anybody chose, and the first person who wants a softer one has fourteen places to change | **live** |
| `every-control-can-be-seen-when-focused` | a pressable thing with no focus indicator, which is a control somebody navigating by keyboard has lost — and which is invisible to everybody testing with a pointer, meaning everybody. The consent sheet's own picker was one | **live** |
| `a-control-keeps-the-pages-word-space` | the font shorthand resetting the word space inside a control. The text face sets wide letters against a narrow word space and the platform corrects it once on the body; every row, field and button then silently undid the correction. Measured: 1.28px on a paragraph and 0 on every row title and detail, which is most of the words in the hub | **live** |
| `a-link-out-tells-mail-from-a-page` | an address opened through the web treatment: a new tab that never arrives, under the outward mark whose entire value is that it is honest | **live** |
| `there-is-one-label-style` | small tracked capitals — the device an interface reaches for when a label has to LOOK like something. This one already has a label: quiet ink, sentence case, smaller. Two had appeared, one of them in amber on the screen somebody is asked to read most carefully | **live** |
| `a-door-is-not-an-oracle` | a sign-in screen that adds back what its endpoints refuse to say. Both operations behind it answer identically for an address with an account and one without — telling them apart is a membership oracle, which on a clinical product is a disclosure on its own — and a 'no account found' or a 'sign up' would hand that over from the screen instead | **live** |
| `a-door-arms-the-field-for-a-passkey` | an address field with no webauthn token in its autocomplete. The conditional request then resolves nowhere, the suggestion never appears, and the entire passkey lane is silently dead on the browsers that support it best | **live** |
| `a-door-asks-for-no-password` | a password field on a passwordless platform — offered to a manager which would then save one, for a credential nothing here can check | **live** |
| `a-dismissal-is-not-a-failure` | a browser's NotAllowedError rendered as an error. It is what a dismissal, a timeout and a superseded conditional request all raise — the three most ordinary things that can happen — so the product accuses somebody of a mistake they did not make, in red, on the screen where they cannot get in | **live** |
| `a-ceremony-is-not-offered-where-it-cannot-run` | a create call on a device with no authenticator, which throws in the middle of an offer somebody just accepted — so it reads as the product breaking rather than as a device that was never going to work | **live** |
| `a-credential-carries-the-account-not-the-address` | the user handle and the display name written the wrong way round. What goes in user.id is stored on the authenticator forever and cannot be rewritten by us, so an address there is a permanent copy of something a person is allowed to change | **live** |
| `a-passkey-works-where-windows-does` | a registration offering ES256 alone. Windows Hello produces RS256, so the product 'does not work on Windows' and nothing in it says why | **live** |
| `a-passkey-sign-in-needs-no-address` | an allow list where an empty one belongs. Empty means any credential for this relying party, which is what lets a discoverable passkey open the door before anybody types — a populated list turns the passkey lane into something that begins by asking for the thing a passkey exists to avoid typing | **live** |
| `the-passkey-offer-is-the-servers-answer` | a screen deciding for itself whether to suggest a credential. It knows neither what this person holds nor which relying party this door prompts for, so it nags somebody who already has one, on every sign-in, forever | **live** |
| `a-cooldown-is-the-servers-number` | a countdown the screen invented. The runtime decides when another code may be asked for and reports what is left; a local timer comes back before the endpoint will answer, which teaches people to press a button that fails | **live** |
| `a-proof-is-raised-by-a-refusal` | a screen deciding for itself which actions need a recent proof — a second copy of a rule the operations declare, and the copy is the one that goes out of date the first time a fourth operation is added | **live** |
| `a-proof-never-asks-who-you-are` | a form demanding the address the session already knows, standing between somebody and something they were in the middle of doing | **live** |
| `the-product-can-be-left` | a hub with no way to sign out. The row for the device in your hand carried no control and the comment beside it said leaving was the avatar menu's job — a menu this platform does not have — so on a shared computer there was no way out at all, on the one screen whose subject is where you are signed in | **live** |
| `nobody-is-offered-what-they-cannot-open` | a New workspace button on the hub of somebody who is a customer of a workspace rather than the owner of one. It offers a thing they cannot do, and the refusal that says so arrives long after they have decided the product is confusing | **live** |
| `a-workspace-can-actually-be-created` | the whole platform being behind having a workspace with no screen that makes one — `identity.workspace.create` was written, audited and tested and only a test harness ever called it. The narrower failure the same test pins: a business name sent through unchanged, so the first thing a new customer meets is a refusal for typing their own name correctly | **live** |
| `a-permanent-choice-is-made-before-it-is-committed` | where a workspace's records live sitting under the control that creates it — a decision that can never be changed afterwards, which the ordinary path presses past without scrolling to | **live** |
| `a-refusal-lands-on-what-caused-it` | every refusal sent to the same place. A taken address belongs under the address; not being let in is not something retyping fixes, and putting it there is an instruction to keep trying | **live** |
| `a-product-not-open-to-you-is-said-not-hidden` | a marketplace that is a different shape per person, so "where is Tessa" has no answer anybody can act on | **live** |
| `money-is-formatted-once` | a price divided by a hundred at each render site — wrong in one place, and always the place nobody looks at, which on a storefront is the one that took the money | **live** |
| `a-row-goes-somewhere-or-carries-something` | a shopping row with no price on it. The action slot makes a row unpressable, so a price put there is silently dropped AND the row stops working — which is how a pack row shipped with neither. The same test's sibling pins the trial pill on a plan row | **live** |
| `a-plan-carries-what-it-includes` | three plans of three entitlements rendered flat — nine rows repeating three labels, and a real catalogue is four plans of eight. The same test pins that a switch which is OFF is drawn rather than omitted, because a plan that silently leaves out what it does not include cannot be compared with one that does | **live** |
| `a-balance-says-what-expires` | one figure covering an allowance that lapses and a pack that does not — somebody watches the number fall on the first of the month with nothing having said it would, and the conversation that follows is about whether we took their credits | **live** |
| `a-ledger-string-never-reaches-a-screen` | `hold:draft-plan` printed on the page — right to store, wrong to show, and it makes somebody's own spending read as a machine's notes about them | **live** |
| `nothing-chargeable-is-said-before-a-price-list` | a price list whose every button refuses — somebody's decision spent before they are told it could not have been made | **live** |
| `the-hub-names-its-three-areas` | three questions flattened into one list of settings, where "new workspace" sits beside "change your language" — a purchase and a preference wearing the same row | **live** |
| `an-empty-area-is-not-drawn` | a named section promising something that is not there — and most people holding an account here are a customer of somebody else's workspace | **live** |
| `one-control-per-destination` | two controls for one destination in two vocabularies — the workspace list said "New workspace" while the marketplace said "Start something new", which also makes the area that names it read as decoration. The exception the same block pins: an empty list keeps the offer, because making somebody read a section header before they can act is making them read the page first | **live** |
| `an-area-is-one-target` | a button inside a crown — markup no browser agrees on, and a second thing to hit on a surface that is already the offer. The same test pins the hues apart, because three cards given free rein each grow their own gradient and the screen stops reading as a set | **live** |
| `the-account-centre-holds-only-the-account` | the split undone one row at a time — a workspace or a balance on the screen about who you are is how "change my language" and "start a business" came to be adjacent rows | **live** |
| `a-state-is-a-label-and-a-consequence-is-a-sentence` | one string carrying both, which renders in a row's second line as "Payment failed — this workspace is rea…". A row's second line is one line and a consequence is not | **live** |
| `arrears-carry-the-address-that-fixes-them` | a screen that says "payment failed" with nothing to press — it has told somebody they have a problem and left them to find the door, which is how arrears reach support instead of the provider's own portal. The same test pins its opposite: a pay control on a subscription in good standing is an invitation to pay twice | **live** |
| `a-paid-subscription-with-no-workspace-has-a-screen` | money taken with nothing to show for it. The state is on the wire — bought, paid, pointed at nothing — and had no surface at all, so somebody who closed the tab after paying met an empty workspace list and no address that would finish it | **live** |
| `a-hero-is-the-size-of-a-hero` | a balance headline rendered at the size of a table cell, because the class that gives it lining figures also carries a 15px row size and silently won. The same test pins the expiry to one place — twice on a screen, forty pixels apart, it reads as two facts that happen to agree | **live** |
| `a-shelf-is-a-grid-and-a-holding-is-a-row` | a product set as a row — a column of mostly empty space where the eye reads every label to find one it recognises — or a subscription set as a tile, which drops the price, the standing and the renewal date that are the reason somebody opened the screen | **live** |
| `an-inert-tile-is-not-a-disabled-button` | a product hidden from somebody it is not open to, so the grid is a different shape per person and "where is the other one" has no answer anybody can act on — or shown as a disabled button, which announces it as a control they cannot use rather than as a thing on a shelf | **live** |
| `up-is-the-area-not-the-hub` | somebody who opened their passkeys from the account centre being dropped two levels by one press — the back button doing something other than undoing what they did | **live** |
| `a-settings-screen-is-the-declaration` | a form written beside a declaration, which goes out of date in the direction nobody notices — a setting added to a manifest and not to the form is one with a default nobody can change, on a screen that looks complete; one removed and left on the form writes a key no consumer reads. Neither fails, and both are one edit somebody forgot | **live** |
| `an-unknown-kind-draws-nothing` | a future setting kind rendered as a text box — a colour somebody types a word into, a number that accepts "soon". The store refuses it, correctly, so what a person sees is a field that will not save and no explanation available anywhere. Absent is honest; wrong is not | **live** |
| `a-setting-shows-what-it-is-set-to` | a settings screen whose rows are only names, which is a menu — and a menu between somebody and eleven settings is a tax. The same test pins the narrower case: a setting most people may not write is still SHOWN, because what a workspace has chosen is not a secret from the people it applies to | **live** |
| `a-fallback-is-not-a-choice` | an untouched workspace that looks configured — "we have not decided" and "we decided this" printed identically, on the screen where the difference is the whole question | **live** |
| `a-moved-ceiling-says-who-moved-it` | a workspace shown its plan's numbers rather than the walk's, which disagrees with the gate for exactly the workspaces somebody has helped — the ones most likely to be looking. A badge on every row instead is texture; the two that differ are the answer to the question support is actually asked | **live** |
| `a-secret-is-set-and-never-shown` | a console that can display a payment provider's key, leaked through a screen share, a support session or any read vulnerability. The same test pins the rule being stated ONCE for the screen: repeated per row it made the secrets the tallest, loudest things on a list whose subject is which keys are set | **live** |
| `a-console-says-where-a-value-came-from` | "it is set" and "it is set HERE" printed the same, which have different fixes: typing a local value over one that resolves from the shared store pins that product to a copy which will not follow the next rotation, and nothing else on the screen would say so | **live** |
| `an-edited-price-is-told-from-a-shipped-one` | every price looking like the one the product was built with, so an operator cannot tell their own change from the app's default. It is also the whole reason each product publishes its declaration: without the shipped catalogue beside the overrides there is nothing to compare | **live** |
| `a-hub-says-what-it-cannot-answer` | an empty "What it includes" card, which is indistinguishable from a plan that includes nothing — a sentence about somebody's bill invented by a screen that simply could not reach the answer. Settings and ceilings are regional and per-product by design, and unlike memberships they must not be crossed by copying: a workspace's settings are its data, and publishing them into the store every product reads would put one business's configuration where another product's worker can read it | **live** |
| `every-destination-has-a-screen-that-renders-it` | a destination nobody built silently opening the HOME. The surface renders from a chain of `at === "…"` ternaries ending in the hub's home, so a route with no branch does not fail to compile, does not throw and does not render blank — and a row that goes somewhere unexpected is the hardest kind of wrong to notice, because the screen it lands on is a real one. It happened immediately: the operator console shipped rows linking to Workspaces and to Maintenance while neither screen existed | **live** |
| `every-destination-is-held-to-a-round-trip` | a destination missing from the list nothing holds to a round trip or to a screen. The union is read from its own source rather than typed out in the test, because a list of names in a test is a list somebody has to remember to add to — which is the same forgotten edit, moved | **live** |
| `two-workspaces-may-share-a-slug` | a list showing what reads as a duplicate. A slug is unique per PRODUCT rather than per deployment — the whole point of the app column added to the directory — so an operator acting on "the haddad one" has a one-in-two chance of the right business | **live** |
| `a-region-that-is-down-is-not-a-workspace-on-nothing` | a row with no plan on it, produced by a region that would not answer, reading as a workspace that is on no plan. The plan and the standing are read from each workspace's own region one at a time, and those two states want opposite responses from whoever is looking | **live** |
| `an-unknown-maintenance-rung-is-never-open` | a CLOSED deployment reported as open, on the one screen whose entire job is saying which it is. The mode arrives off the wire, so a deployment ahead of this bundle can send a word the list does not carry — and falling back to the first rung is the one wrong answer that matters here | **live** |
| `the-ai-settings-screen-discovers-its-own-actions` | a hand-written list of a product's AI actions, which goes out of date in the direction nobody notices: an action added and not listed is one nobody can configure, on a screen that looks complete. It names no models either — what a workspace may pick is decided by four server-side layers, so a screen offering a list of its own would offer what the save refuses | **live** |
| `an-unmetered-model-is-shown-and-flagged` | an operator seeing a model they added simply not appear, with nothing anywhere saying why — and the fault being hidden is the one that decides whether every call to that model is free | **live** |
| `a-model-shows-under-every-lane-it-serves` | a catalogue whose vision section looks empty while a vision model sits in it. One model serves several modalities — a Gemini text model is priced for pictures on the same row — which is why a model carries a LIST of lanes rather than one, and why one row per lane is not the alternative: the id is the provider path and there is only one of it | **live** |
| `a-retirement-is-said-before-it-happens` | an operator learning about a retirement from a failing generation — one they had a month of warning about, on a screen that never showed it. The replacement is named because the provider names it | **live** |
| `the-roster-has-a-screen` | a roster reachable by anybody who can compose an HTTP request and by nobody else. It also names no role or permission itself — both come from `role.list`, so one added to a product appears here and one removed stops appearing | **live** |
| `the-inbox-has-a-surface` | a notification reachable at an endpoint and nowhere a person would look — the failure this platform was started over | **live** |
| `an-unknown-notification-icon-still-draws` | a blank where a glyph should be, on a row that then reads as broken | **live** |
| `no-switch-for-a-channel-that-cannot-deliver` | somebody turning on a switch that does nothing and no longer watching their inbox | **live** |
| `a-person-is-never-offered-the-category-that-blocks-the-product` | the product silently ceasing to work for whoever switched off the notices that say it has | **live** |
| `a-workspace-turning-something-off-says-so` | "you turned this off" shown to somebody who did not, with nothing to do about it | **live** |
| `the-policy-screen-names-no-notification` | a hand-written list going out of date in the direction nobody notices | **live** |
| `the-roster-has-a-surface` | invite, remove and permissions reachable only by whoever can compose an HTTP request | **live** |
| `a-role-it-cannot-grant-is-shown-and-stood-down` | an administrator wondering why their list is shorter than the one a colleague describes | **live** |
| `a-role-id-is-derived-and-never-typed` | a role somebody made, assigned, and that grants nothing at all | **live** |
| `a-push-key-reaches-the-browser-as-bytes` | `InvalidCharacterError` out of `subscribe`, which reads as a broken browser rather than a wrong argument | **live** |
| `a-push-always-shows-something` | a silent push costing the site the notification permission it will not be granted twice | **live** |
| `a-device-label-is-not-a-fingerprint` | a device fingerprint stored against a person's account to label a row they read once | **live** |
<!-- /generated -->

## 5. What is not decided yet

Named so that nobody assumes it was. Each becomes a rule when a screen needs it:

- a type scale — the two screens use six sizes and have not had to justify them
- spacing beyond `--pad`, and the gaps in `.page` and `section`
- how a tenant's own brand reaches a platform screen
- a second sheet, which is what will say whether `dismissible: false` was right
- forms with more than one field: every editor so far edits exactly one value

The three product colours in `web/src/ui.css.ts` are **placeholders**, present so
a cross-product list can be scanned when a workspace has no face yet. They become
a lookup the moment a product has a real mark.
