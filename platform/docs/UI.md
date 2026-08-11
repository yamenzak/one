---
kind: contract
verified: 2026-08-11
---

# The interface language

> ⚠️ **THIS DOCUMENT IS DELIBERATELY EMPTY, AND THAT IS THE CURRENT STATE OF THE
> WORK.** There is no design system in `platform/` right now. It is being built
> back one component at a time, and every rule below this line will be written
> because a component needed it — never before one did.

---

## 0. Why it is empty

The first attempt is in `_ui-archive/` with a note on what it was and what is
worth taking back from it. It was not short of rules: four laws, five page
archetypes, a closed sky set, a measured contrast floor, a state matrix, ninety
guards. What it was short of was **components anybody had looked at**.

The defects that ended it were not subtle and not exotic. A card with no
padding. A menu with no trigger. A form with no row for its buttons. A progress
bar drawn in the text colour. Every one of them passed every guard, because a
guard written before the component exists can only check what its author already
thought of — and none of them thought of "is there any padding".

So the order is inverted from here:

1. **Build one component**, in a real screen, with real content.
2. **Look at it** — rendered, in the mode that ships, at both themes and both
   widths, before anything else happens.
3. **Fix what looking showed.**
4. **Write the rule that fix implies**, in this document, as one sentence.
5. **Write the check that holds the rule**, only if it can fail on a real break.
6. Only then extract it into `@one/ui`.

A rule with no component under it does not go in this file. A guard with no
defect behind it does not get written.

## 1. What survives from the first attempt

Nothing is inherited automatically. These are the four ideas worth re-earning,
recorded here so the work does not have to rediscover them — each still has to
be built, looked at, and justified by a component before it becomes a rule:

- **Ink is measured against the surface it lands on** rather than paired by
  hand, so a tenant cannot combine a colour with text that fails on it.
- **A tenant supplies one accent and one ambience hue**; every other colour is
  derived from them and the theme.
- **A component that is registered and never rendered is a test failure** —
  checked by rendering the app and reading the markup back, not from a list.
- **The preview must render in the mode that ships.** An artifact file opened
  directly puts the browser in quirks mode, and every judgement made from it is
  about a page nobody will ever see.

## 2. The rules

*Nothing yet.*
