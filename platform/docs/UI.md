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
or supported.** — The account centre was a route with four pieces of component
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

**One thing on a surface may be a place rather than a setting, and it is lit to
say so.** — A list of rows says *these are all the same kind of thing*, which is
exactly what an account centre's settings are and exactly what the vault is not:
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
*Checked: `web/test/vendors.test.tsx` — every declared mark has a drawing.*

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
