# The design language

kind: guide

**Who this is for: a sixty-year-old who runs a business, is not a technical
person, and opened this because something needs doing.** They are competent,
busy, and have never read a manual for anything. They will not explore. They
will not read your paragraph. If they cannot see what to do in about two
seconds they will decide the software is difficult and ask somebody else to do
it — and they will be right, because a screen that needs explaining is a screen
that was designed wrong.

Everything below is downstream of that one person.

---

## 1. The rules, shortest first

Read these as tests you can apply to a screenshot without knowing the codebase.

1. **If it needs explaining, it is wrong.** Explanation is a symptom. Before
   writing a sentence under a control, change the control, the label, or where
   it lives. A screen with no description lines on it at all is normal and good.
2. **One screen, one job.** If you can say "this screen does X *and* Y", it is
   two screens. Six actions and three lists on one page is a filing cabinet, not
   a screen.
3. **Related is not together.** Two things being *about* the same subject does
   not put them on the same screen. Ask who does it, how often, and with what
   authority — those three answers decide where a thing lives, not the topic.
4. **Nothing is capped.** There is no budget on screens, sections, or steps. A
   screen that is cramped because somebody was avoiding a second screen is the
   most common failure in this product's history.
5. **Where would they look first?** Put it there. Not where it is tidy, not
   where the data model says.
6. **Verbs, not nouns; specifics, not categories.** "Invite somebody" not
   "Member management". "Sign out" not "Session". A button says what will happen
   when it is pressed, and the confirmation says it happened.
7. **Never make somebody count.** If the answer is a number, show the number.
8. **The default is safe.** A destructive thing is never the easy one to hit,
   and never a colour on its own.

---

## 2. Language

**Actionable, short, and about them.**

| Instead of | Write |
|---|---|
| "Member management" | "People" |
| "Configure notification preferences" | "How you are told" |
| "No data available" | "Nothing here yet" |
| "This action is irreversible" | "This cannot be undone" |
| "Session terminated successfully" | "Signed out" |

- A label is one to three words. A row's second line, if it exists at all, is
  a **fact** — a state, a count, a date — never an explanation of the row.
- No product vocabulary. Nobody outside the building knows what a *tenant*, an
  *entitlement*, a *sub-processor* or a *shard* is. If the operator console must
  use a word like that, it is the one place allowed, and only because its reader
  built the thing.
- No marketing anywhere inside the product. Somebody already signed in is not
  being sold to.
- No em-dashed compound headings. "Kova — the documents" is two labels wearing
  one; pick the one that varies.
- **A wire value is not copy.** `comfortable`, `past_due`, `kova` are keys. Say
  "Comfortable", "Payment failed", "Kova".

---

## 3. Where a thing lives

Ask three questions in this order. They resolve nearly every placement argument.

1. **Whose is it?** Mine, my workspace's, or the deployment's. Three different
   authorities, therefore at least three different places. *My* notification
   settings and *the workspace's* notification ceiling are not two halves of one
   screen — they are two operations with different consequences, done by
   different people, at different times.
2. **How often?** Daily things are one tap from where somebody starts. Yearly
   things are two or three taps away and that is correct. Putting a
   twice-a-year setting beside a daily one costs the daily one its prominence.
3. **What does it change?** A screen where every control changes the same kind
   of thing is a screen. A screen where one control changes a price, one changes
   a person's access and one changes a colour is three screens.

**Scale is the test.** Design every list for the customer with six products
and two branches, not the demo with one. A screen that is fine with one product
and unusable with six is a screen that will be rewritten. When there are many of
something, **group by the thing the reader is holding in their head** — the
workspace, the person — and let them descend into it. Do not flatten every
product's settings into one column and repeat the product's name as a heading:
that is a report, not a screen.

**Descend, don't cram.** A row that opens a screen costs one tap. A screen with
everything on it costs a scroll, a scan, and a mistake.

---

## 4. Layout — you do not write one, you name one

**A screen declares what KIND of page it is and hands over its content.** That
is the whole of the layout system, and it exists because the alternative was
measured: twenty screens each hand-assembling the same five decisions — column
width, waiting skeleton, what "nothing here" says, how blocks arrive, and where
the one action goes — and every one of them getting four right and one wrong.
Nobody can point at the file that is wrong, because none of them is. The product
is wrong in aggregate, and the only fix that holds is to stop asking.

```tsx
<Screen
  shape="list"
  does={{ label: "Invite somebody", onDo: open }}
  of={members.of} again={members.again}
  nothing={{ says: "Nobody here yet", under: "An invitation arrives by email" }}
  then={(data) => <Listing … />}
/>
```

Everything else is decided: the width, the skeleton, the stack and its gaps, the
arrival stagger, the crown and its collapse, and where "Invite somebody" lands
at each size. The screen's author chose a shape and wrote the content.

### The eight shapes

| Shape | The page is about | Primary action |
|---|---|---|
| `list` | a collection somebody scans and adds to | usually "add one of these" |
| `detail` | one subject and its facts | usually the thing you do TO it |
| `figure` | one number, everything else supporting it | often none — a figure is read |
| `board` | destinations or measures as tiles, some wider | often none |
| `settings` | many independent controls, each saving itself | **refused** — see below |
| `form` | a sequence of fields and one submit | the submit |
| `reader` | prose — a policy, a document | often "accept" |
| `decision` | one object, one choice | the choice |

They are kinds of PURPOSE, not kinds of arrangement. "Two columns" is not a
shape; it is a consequence, and naming consequences is how a preset system
becomes a second CSS with worse names.

**Two of the eight have no screen on them yet — `form` and `reader` — and that
is deliberate rather than an oversight.** Everywhere else in this system an
unused thing is a smell (an ambience no row wants is wallpaper), and the reason
this is different is what a shape IS: somewhere for the *next* screen to land. A
table a screen's author cannot find their page in is one they opt out of, and
the screen after that is hand-built with the whole argument re-run. Six is the
floor the guard enforces; a ninth needs a page nobody could file today.

**A door is not a screen.** The sign-in, the signpost and the setup wizard have
no router above them and nowhere to go back to — a crown there is a control
that closes onto a backdrop. They keep `Arrival`, and the guard exempts them by
name.

**A `settings` screen cannot have a primary action, and that is the most useful
row in the table.** Every control on one saves itself the moment it changes
(`useAction`, `useConfirmedState`). A Save button beside them makes it a screen
where half the controls save themselves and half do not, and nobody can tell
which by looking. The shape refuses it; a guard catches it before it runs.

### Where the primary action goes

**Never at the foot of the content.** The roster shipped "Invite somebody" as
the last row of the roster. With three members that is fine. With thirty it is
invisible: whoever is at the bottom of a long page scrolls to the top to act, or
whoever is at the top scrolls to the bottom, and which of the two happens was
never decided by anybody.

It lands in three places and the shape picks between them:

- **Phone** — docked above the thumb, at the bottom of the viewport on a short
  page and the bottom of the scroll on a long one.
- **Desktop** — in the crown, labelled, where the eye already is.
- **Empty screen** — inside the empty state, and the dock stands down. Two
  copies of the same button on a page with nothing else on it is the fault the
  whole system exists to remove.

**The action appears when there is something to act on.** No dock over a
skeleton — a press against data that has not arrived. None over a refusal — the
only useful control is "try again", and it is in the refusal where the
explanation is. None over an empty state, which already carries it.

### One screen, one primary, two secondaries at most

Not a style rule — a definition. A page with two things it is for is two pages,
and the moment a second `does` would be needed the right edit is a second screen
or a sheet. `also` is for the two or three things somebody might reach for
*while* doing the primary one, and it is capped in the type.

### Five outcomes, not four

`waiting`, `nothing`, `trouble`, the content — and **`refused`**. "You may not
see this" is a fact about the person, known before any request is made; a
`Problem` is a fact about a request that failed. Five screens used to answer it
with a bare sentence returned EARLY, above the frame, which took the crown with
it: no title, no way back, a sentence alone on a page. A refusal is content.

### Within the shape

Use the whole width. A phone is one column, a desktop is not — `Grid`, `Columns`
and `Split` exist and are under-used, and `board` gives you a real grid where
`Tile` items can be `wide` or `tall`. Two figures that answer one question belong
side by side, not stacked with a gap.

**Density is a decision.** Not everything is a full-width row. A count belongs in
the corner of the row it counts. A rarely-used action belongs in a menu on the
block it acts on. Three related toggles are a `ToggleButtonGroup`, not three
rows.

**Never wrap a single control in a card.** A card is a container for a *group*.
One button inside a card is a button with a box drawn round it — put it where it
belongs: in the crown, at the end of the row it acts on, or under the block it
finishes.

**Charts are part of the vocabulary and are barely used.** `@quad/web/chart`
ships nine chart forms, five figure blocks and four round ones, with the rule for
picking between them written at the top of the file. Anywhere the product shows a
trend, a share, or a ratio against a limit as a number in text, it is throwing
away the one thing that reads instantly.

---

## 5. Controls: which one, and where

| The thing | The control | Where it goes |
|---|---|---|
| On or off | `ToggleRow` | The row, switch at the end |
| One of two or three | `ToggleButtonGroup` | At the end of the row |
| One of many | `Select` | At the end of the row |
| A value to type | `ControlRow` + bare field | At the end of the row |
| Something that opens | `NavRow` | The whole row, chevron at the end |
| The screen's main action | `does` on the `Screen` | The shape decides — §4 |
| A rare action on a block | A menu (`⋯`) | The block's corner |
| Something destructive | `ActionRow tone="danger"` | Its own card, last |

**An icon replaces a word only when the icon is unambiguous** — close, back,
more, add. Everything else gets the word. An icon-only button that needs a
tooltip to be understood has failed; a tooltip is for a shortcut, not for a
meaning.

**A count is a chip in the corner of the row it belongs to**, never a sentence.
Zero is not a chip — zero is nothing at all.

**There is no line between rows.** Rows in a card are separated by rhythm: 24px
between two rows against 4px inside one, and a six-to-one ratio already says
"these two lines are one thing and that is another". The hairline was the last
edge in a product that banned borders and shadows everywhere else, and it was
asymmetric — inset past the glyph on the left, flush to the card on the right —
which is what made every list look hand-assembled.

### Faces

**A person, a workspace and a product each have one face, and it comes from one
resolver.** `<Face of={whoFace(accountId)} />`, `placeFace(slug)`,
`appFace(id, mark)` — nothing else draws an avatar, and a guard says so.

|  | What is drawn | Why |
|---|---|---|
| A person | an animated mood | a face is what people recognise each other by |
| A workspace | an animated planet | a workspace is its own world, seen from outside |
| A product | the glyph its manifest declared | a generated mark would read as a logo nobody chose |
| One | the framework's four-cell plate | the deployment is not one of the products in it |

**A product wears its plate wherever it is a row, a card or a section** — the
crown, the switcher, the chooser, the bill, every per-product console. Never as a
bare `{app.mark}`: a glyph dropped into JSX is a character somebody typed, with
no ground under it and a different optical weight from every face beside it. A
guard refuses it. In prose — "Kova · owner" under a workspace's name — a product
stays a word, because a mark inside a sentence is a second lead in a row that
already has one.

Three things follow from that and are decided for you.

- **A seed is an identity, never a label.** The resolvers take an account id and
  a slug because both outlive every edit; seeding on a name or an email gives
  somebody a new face the day they fix their spelling. This is the payoff of
  accounts living under the deployment rather than under each workspace — one
  person, one face, in every workspace and every product.
- **The size decides the movement.** A breathing face reads as alive at 40px and
  as a twitch at 32px, so a `chip` is still and a `row` is not. Nobody passes a
  flag. Under reduced motion every face is still, and that has to be a different
  PICTURE — the animation lives inside the SVG, where no stylesheet of ours
  reaches.
- **Absent is a real answer.** An invitation nobody has claimed has no account.
  It gets the initial, because a face for somebody who has not arrived yet is a
  picture of nobody.

**And a workspace's screen is its planet's sky.** Opening one puts you on the
world its face showed — same deep, same light, its own stars — so the row
somebody pressed and the page they arrived on are visibly one place. Only the
arrival: its People, Money and Settings keep the hub's working material, because
an arrival nobody leaves is not an arrival. See
[`AMBIENCE.md`](AMBIENCE.md) — `world`.

**A break between two runs is a second CARD.** That is how the workspace screen
separates what you come back to from what you set up once, and how the account
screen separates the two places that are yours from the way out. Two cards read
as two things because they ARE two things, at every size, with nothing to align
to anything.

---

## 6. Rhythm

Vary the block. A screen of five identical cards has no shape; a screen with a
figure, then a group of rows, then a quiet note has a beginning, a middle and an
end. Reach for a different block when the *content* is a different kind of
thing, not to be interesting — but notice when three blocks in a row are the
same and ask whether they are really the same kind of thing.

Air is structural. `roomy` between kinds of thing, `snug` within one. A heading
belongs to what is under it, never floating equidistant between two blocks.

---

## 7. The checks a screen has to pass

Before a screen is done, look at a screenshot of it at phone width and answer:

- [ ] What is this screen for? One sentence, no "and".
- [ ] What can I do here? If more than about three kinds of thing, split it.
- [ ] Is any sentence on it explaining a control? Fix the control.
- [ ] Would this still work with six products and forty people?
- [ ] Is there a single control wrapped in a card?
- [ ] Is every heading earning its line? (One of something needs no heading.)
- [ ] Does it look different from the screen before it?
- [ ] Is there a number here that should be a chart, or a chart that should be
      a number?
- [ ] Would a sixty-year-old who has never seen it know what to press?

---

## 8. Where the rules are enforced

Some of this is guarded and some is judgement. What is checked today:

- `tone` — label length, description length, sentence case, full stops.
- `heroui` — no component is restyled; layout utilities only.
- `states` — four outcomes, shaped skeletons, one rhythm.
- `surface` — every declaration reaches a screen; every field kind a control.
- `shape` — no screen draws its own crown or pins its own action; at most one
  primary per screen; a `settings` screen carries none.
- `face` — one resolver draws every face; a seed is an identity, not a label.

What is **not** checked, and is therefore on the person writing the screen:
placement, density, whether a screen is doing two jobs, and whether the reader
would have looked here. Those are §3 and §7, and they are the ones that make the
difference between a product and a filing cabinet.
