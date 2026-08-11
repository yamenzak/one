# The first interface language — archived, and meant to be deleted

This is Northlight as it stood on 2026-08-11, moved out of the way so the
interface could be rebuilt one component at a time with the rules written as
they are discovered rather than up front.

**It is not governed and nothing runs it.** Nothing in this directory is in the
pnpm workspace, so it is not installed, built, typechecked or tested. No guard
reads it and no document indexes it. It exists so a decision made in it can be
looked up without a `git log`, and it should be deleted once it stops being
consulted:

```
rm -rf _ui-archive
```

## What is in here

| | |
|---|---|
| `platform/ui/` | the `@one/ui` package — tokens, the surface ladder, the daisyUI bridge, 27 icons, the component set, the sample app, 212 tests |
| `platform/docs/UI.md` | the authority document: the four laws, the archetypes, the sky, the clock, the state matrix |
| `platform/scripts/interface.test.mjs` | the gate's interface guards — no literal colour, no literal motion, the renderer boundary, hover-is-not-required |
| `platform/scripts/sheets.mjs` | the backtick-in-a-CSS-template-literal check |
| `platform/hello/**` | the one app screen written against it, and its test |

## Why it was set aside

Not because the ideas were wrong — several are worth taking back, and this is
where to read them properly:

- **ink is measured against the surface it lands on**, rather than a palette
  paired by hand
- **the tenant supplies one accent and one ambience hue**, and every other
  colour is derived, so a tenant cannot pair a colour with text that fails on it
- **a component that is registered and never drawn is a test failure**, checked
  by rendering and reading the markup back rather than from a list
- **the preview must render in the mode that ships** — reviewing an artifact
  file directly puts the browser in quirks mode, and every judgement made from
  it is made about a page nobody will see

What went wrong was the order. The rules were written first and at length, the
components were built to satisfy them, and the compounding defects — a container
with no padding, a menu with no trigger, a form with no action row — were only
ever found by photographing a finished screen and looking at it. Building one
component at a time and writing the rule that component actually needs is the
correction.
