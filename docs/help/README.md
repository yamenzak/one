# The Help Center

One documentation surface for every 4DL app. Docs and support in the same place,
written per ROLE, and readable by both a person and a model.

This directory is the CONTENT. The reading surface — the app's Help entry, the
search, the role switch — is not built yet; the content is written first
deliberately, because a help surface with nothing in it teaches people not to
open it again.

```
docs/help/
  README.md          this file — the format, and the rules
  kova/              one directory per app
    <topic>.md       one topic per file
    images/          the screenshots a topic uses, by shot id
```

## Why this format

It has to serve three readers, and only one of them is a person browsing:

| Reader | Needs |
|---|---|
| a person, mid-task | the answer in the first screen, with a picture of where to tap |
| a support agent | to link one URL that answers exactly the question asked |
| **a model** | front-matter it can filter on, headings it can cite, no meaning carried by layout |

The third is why this is Markdown with front-matter rather than a CMS, and why
every topic states its role, its app and its prerequisites as DATA. When these
topics are answering questions in a chat, "which article is this?" has to be
answerable without reading the prose.

## The front-matter

Every topic starts with it. Every field is required.

```yaml
---
id: invite-a-client            # stable; the URL and the citation key. Never renamed.
app: kova
title: Add a client            # what the reader would search for, not a clever headline
role: [owner, trainer]         # who this is for: owner · trainer · assistant · client · operator
summary: >                     # one sentence, answering the question. Shown in search
  Add someone to your roster and send them their sign-in link.
keywords: [client, invite, roster, add, email]
updated: 2026-08-03
---
```

- **`id` is permanent.** It is the URL, the anchor a support reply links to and
  the key a model cites. Renaming one breaks every link that ever worked.
- **`role` is a filter, not a label.** A client must never be shown an article
  about staff seats; a trainer must never be shown one about billing. Where a
  task genuinely differs by role, that is TWO topics, not one with a fork in it.
- **`summary` answers the question.** It is the line shown in search results and
  the line a model quotes. "How to add a client" is a title, not a summary.

## The rules for the prose

The interface language applies to documentation too — the budgets in
[UI-LANGUAGE.md](../../UI-LANGUAGE.md) §10 and the sectioning rules in §7 were
written for both. Beyond them:

- **One topic answers ONE question.** If the title needs "and", it is two.
- **Steps are numbered and each one is a single action.** "Open Settings, scroll
  to Brand, tap Colour and pick your accent" is four steps pretending to be one,
  and a reader who fails at step three has nothing to fail at.
- **Name the control exactly as the app spells it**, in bold: tap **Add client**.
  A paraphrase is how a reader ends up hunting for a button that does not exist.
- **Say what will happen before it happens**, for anything irreversible, and say
  it in the step — not in a warning box the reader has already scrolled past.
- **Every topic ends with what to do when it did not work.** A documentation page
  that only describes the happy path sends every unhappy reader to support.
- **No screenshots of empty states pretending to be full ones**, and no cropping
  that hides a control the step refers to.

## The screenshots

Images come from the screenshot suite, never from someone's browser:

```
pnpm --filter @kova/e2e shots            # every screen, both themes, phone + desktop
pnpm --filter @kova/e2e shots --project=phone-light
```

Output lands in `apps/e2e/shots-out/<project>/<id>.png`, which is gitignored —
it is a regenerable output, not history. A topic that uses an image copies it in
by SHOT ID:

```
cp apps/e2e/shots-out/phone-light/coach-roster.png docs/help/kova/images/coach-roster.png
```

The id is the contract. `coach-roster` means the same screen in every theme and
every width, so a topic can be re-imaged after a redesign by re-running the
suite and copying the same names — and an image that no longer exists in the
output is an image of a screen that no longer exists in the product.

**Light theme for documentation.** Help pages are read on the web, usually on a
light page, and a dark screenshot on a light page reads as a photograph of
something else. Marketing picks per campaign; docs default to `phone-light`.

**Every image carries a caption** saying what the reader is looking at
(UI-LANGUAGE §15). An uncaptioned screenshot is decoration, and decoration is
what a reader skips.
