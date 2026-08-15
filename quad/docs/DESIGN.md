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

## 4. Layout

**The failure this section exists to prevent: every screen looking like every
other screen.** Heading, card, list. Heading, card, list. It is consistent, and
it is unreadable, because consistency at that level removes the only signal a
reader has for *what kind of screen am I on*.

A screen should be recognisable from across the room by its **shape**:

- **A screen about a number** opens with the number, big, and nothing above it
  but the crown. Money does this. So should anything with one answer.
- **A screen about a person or a workspace** opens with the face and the name,
  centred, then rows.
- **A screen about a list** opens with the list. No preamble.
- **A screen about a choice** opens with the choices side by side, not stacked.
- **A screen about a state** opens with the state and the one control that
  changes it.

Use the whole width. A phone is one column, but a desktop is not — `Grid`,
`Columns` and `Split` exist and are under-used. Two figures that answer one
question belong side by side, not stacked with a gap.

**Density is a decision.** Not everything is a full-width row. A count belongs
in the corner of the row it counts. A rarely-used action belongs in a menu on
the block it acts on, not as a full row of its own. Three related toggles are a
`ToggleButtonGroup`, not three rows.

**Never wrap a single control in a card.** A card is a container for a *group*.
One button inside a card is a button with a box drawn round it — put it where it
belongs: in the crown, at the end of the row it acts on, or under the block it
finishes.

**Charts are part of the vocabulary and are barely used.** `@quad/web/chart`
ships nine chart forms, five figure blocks and four round ones, with the rule
for picking between them written at the top of the file. Anywhere the product
shows a trend, a share, or a ratio against a limit as a number in text, it is
throwing away the one thing that reads instantly.

---

## 5. Controls: which one, and where

| The thing | The control | Where it goes |
|---|---|---|
| On or off | `ToggleRow` | The row, switch at the end |
| One of two or three | `ToggleButtonGroup` | At the end of the row |
| One of many | `Select` | At the end of the row |
| A value to type | `ControlRow` + bare field | At the end of the row |
| Something that opens | `NavRow` | The whole row, chevron at the end |
| The screen's main action | `Button variant="primary"` | The crown, or pinned at the bottom |
| A rare action on a block | A menu (`⋯`) | The block's corner |
| Something destructive | `ActionRow tone="danger"` | Last row of the last card, after a rule — never a card of its own |

**An icon replaces a word only when the icon is unambiguous** — close, back,
more, add. Everything else gets the word. An icon-only button that needs a
tooltip to be understood has failed; a tooltip is for a shortcut, not for a
meaning.

**A count is a chip in the corner of the row it belongs to**, never a sentence.
Zero is not a chip — zero is nothing at all.

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

What is **not** checked, and is therefore on the person writing the screen:
placement, density, whether a screen is doing two jobs, and whether the reader
would have looked here. Those are §3 and §7, and they are the ones that make the
difference between a product and a filing cabinet.
