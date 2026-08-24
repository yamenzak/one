/**
 * COMPOSED PIECES — bigger than a control, smaller than a screen.
 *
 * ⚠️ EACH BLOCK IS A DECISION MADE ONCE. A wizard's progress, an activity
 * trail, a filter row, a fold-out — every product needs them, every product
 * draws them slightly differently, and the drift is never a choice anybody
 * made. The block owns the shape; the screen brings the words.
 *
 * ⚠️ NOTHING HERE NAMES A COLOUR, A GAP OR A TYPE SIZE. Tone comes through
 * tokens (`text-muted`, `currentColor`), rhythm through `SPACE`, type through
 * `TYPE` — the same rule as every specimen, enforced the same way.
 */

import * as React from "react";
import {
  Accordion, Breadcrumbs, Button, Disclosure, Kbd, ProgressCircle, Tabs, type KbdKey,
} from "@heroui/react";
import { Check } from "lucide-react";
import { passagesOf } from "@engine/kernel";
import {
  NUDGE, ROW, SPACE, WIDTH,
} from "../tokens/metrics.js";
import { TYPE } from "../tokens/type.js";
import { Group, NavRow } from "./surfaces.js";

/* ------------------------------------------------------------------ steps --- */

export interface Step {
  readonly id: string;
  readonly label: string;
}

/**
 * WHERE A FLOW IS, IN ITS OWN WORDS. Done steps wear a check, the current one
 * is the only bold thing, the rest wait in muted — a person mid-wizard reads
 * this in half a second, which is all the attention a progress row gets.
 *
 * ⚠️ THE NUMBERS ARE THE ROW AND THE WORDS ARE NOT, which is a narrower job than
 * it first looks. What a progress row answers is "where am I, and how much is
 * left" — and two numerals answer that completely. The NAME of the step is
 * already the screen's own subtitle and the heading over the first field, so a
 * third copy in the chip put "What it is" three times above the first thing
 * somebody could type into.
 *
 * ⚠️ AND FOUR NAMES DO NOT FIT A PHONE ANYWAY. Four circles, three rules and four
 * words is past 320px of content: the row that exists to be read at a glance
 * became the one thing on the screen that did not fit. Removing them is not a
 * concession to the width — it is what the row was for, and the width is how it
 * was noticed.
 *
 * ⚠️ THE WORDS STAY IN THE DOCUMENT, `sr-only`. A reader hears every step in
 * order, which is the whole content of a progress row, so this costs a sighted
 * person a repeat and costs somebody on a screen reader nothing.
 */
export function Steps({ at, steps }: {
  readonly at: string;
  readonly steps: readonly Step[];
}) {
  const here = steps.findIndex((s) => s.id === at);
  return (
    <ol className={`flex items-center ${SPACE.snug}`} aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < here;
        const now = i === here;
        return (
          <React.Fragment key={s.id}>
            {/* ⚠️ THE RULE SHRINKS RATHER THAN DISAPPEARING. It is what makes the
                circles read as a sequence instead of as a row of chips, and at
                `min-w` it still does that in a third of the room. */}
            {i > 0 ? (
              <span aria-hidden className="h-px min-w-2 flex-1 bg-current opacity-30 sm:max-w-6" />
            ) : null}
            <li
              className={`flex min-w-0 items-center ${SPACE.tight} ${now ? "" : "text-muted"}`}
              aria-current={now ? "step" : undefined}
            >
              {/* ⚠️ No type size of its own — the number inherits the step's,
                  which is what keeps this circle on the scale (D7). */}
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-current/10 tabular-nums"
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
                <span className="sr-only">{s.label}</span>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
}

/* --------------------------------------------------------------- timeline --- */

export interface Moment {
  readonly id: string;
  readonly when: string;
  readonly label: string;
  readonly under?: string;
}

/**
 * WHAT HAPPENED, IN ORDER. The rail and its dots draw in `currentColor` under
 * a muted wrapper, so the whole trail follows the theme with nothing named.
 */
export function Timeline({ moments }: { readonly moments: readonly Moment[] }) {
  return (
    <ol className="flex flex-col">
      {moments.map((m, i) => (
        <li key={m.id} className={`flex ${SPACE.snug}`}>
          <span aria-hidden className="flex flex-col items-center text-muted">
            <span className="mt-2 size-2 shrink-0 rounded-full bg-current" />
            {i < moments.length - 1 ? <span className="w-px grow bg-current opacity-30" /> : null}
          </span>
          <div className={`flex flex-col ${NUDGE.entry} ${SPACE.hair}`}>
            <span className={TYPE.note}>{m.when}</span>
            <span className={TYPE.label}>{m.label}</span>
            {m.under ? <span className={TYPE.note}>{m.under}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------- tabs --- */

export interface TabSpec {
  readonly id: string;
  readonly label: string;
  readonly content: React.ReactNode;
}

/**
 * ⚠️ TABS SPLIT ONE SUBJECT INTO FACETS — never unrelated destinations, which
 * is what navigation is for. Three to five, labels one word each.
 */
export function PageTabs({ tabs, value, onChange, label }: {
  readonly tabs: readonly TabSpec[];
  readonly value?: string;
  readonly onChange?: (id: string) => void;
  readonly label: string;
}) {
  return (
    <Tabs
      selectedKey={value}
      onSelectionChange={onChange ? (key) => onChange(String(key)) : undefined}
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label={label}>
          {tabs.map((t) => (
            <Tabs.Tab key={t.id} id={t.id}>
              {t.label}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
      {tabs.map((t) => (
        <Tabs.Panel key={t.id} id={t.id}>{t.content}</Tabs.Panel>
      ))}
    </Tabs>
  );
}

/* ----------------------------------------------------------------- reveal --- */

/**
 * One fold-out. For detail that most readers rightly skip.
 *
 * ⚠️ THE TRIGGER IS A `Button slot="trigger"`, WHICH IS THE LIBRARY'S OWN SHAPE.
 * `.disclosure__trigger` is `inline-block`, and `.disclosure__indicator` is
 * `ms-auto` — an auto margin does nothing inside an inline box, so the chevron
 * flowed after the words and wrapped to a line of its own under them, centred,
 * looking like a rendering fault. A `Button` is `inline-flex items-center`, the
 * auto margin resolves, and the row is a row. The fix is the documented
 * composition, not a class of ours (D7).
 *
 * ⚠️ AND IT WEARS THE ROW GRAMMAR, WHICH IT DID NOT — so the card could not tell
 * it was a row and it did not press like one. Measured against `NavRow` in the
 * same card: the row's trigger came out `h-auto … px-0 -mx-4
 * w-[calc(100%+2rem)] px-4 min-h-16` and this one `full-width justify-between
 * px-0`. Three consequences, all visible at once on the push-key card:
 *
 *   — `.button` is `h-10 md:h-9`, so the fill was a 36px slab in a column of
 *     64px rows: a hover state visibly shorter than everything around it, which
 *     is what reads as "no padding".
 *   — Without `ROW.press` the fill stopped at the content box instead of
 *     bleeding to the card's edge, so it floated inside the card with no
 *     relationship to it (see the token).
 *   — Without `data-row` on the OUTERMOST element the card applied
 *     `CARD_OTHERS` — a `py-3` wrapped round the trigger AND its content, which
 *     is the gap re-added outside the thing that already had it.
 *
 * ⚠️ THE MARKER GOES ON `Disclosure`, NOT ON THE BUTTON, and that is the whole
 * reason it was missing. `CARD_OTHERS` matches a DIRECT child of the card, and
 * the direct child here is the disclosure — the button is one level in, where
 * the selector cannot see it.
 */
export function Reveal({ label, children }: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <Disclosure data-row>
      <Disclosure.Heading>
        {/* ⚠️ `justify-between`, BECAUSE A FULL-WIDTH BUTTON CENTRES ITS CONTENT.
            Measured: "Public key ⌄" sat in the middle of a card whose every
            other row starts at the inset, so the one control on the card was
            the one thing not aligned with anything. A disclosure reads as a
            row — its name on the left, the way in on the right — which is what
            the accordion beside it already does.

            ⚠️ AND THE REST IS EXACTLY WHAT `NavRow` WEARS. Not `fullWidth`:
            `ROW.press` sets an explicit width that `button--full-width` would
            win against on the same property, leaving the row shifted left
            rather than widened — which is the fault the token's own header
            records. */}
        <Button
          slot="trigger"
          variant="ghost"
          className={`justify-between ${ROW.free} ${ROW.wrap} ${ROW.flush} ${ROW.press} ${ROW.tap}`}
        >
          {label}
          <Disclosure.Indicator />
        </Button>
      </Disclosure.Heading>
      {/* ⚠️ THE CONTENT CARRIES THE ROW'S OWN AIR. The trigger's height is the
          row's; what folds out is a child of the same card and would otherwise
          sit hard against whatever follows it — the disclosure took its spacing
          from `CARD_OTHERS`, and `data-row` above is what just stopped that. */}
      <Disclosure.Content className={ROW.pad}>{children}</Disclosure.Content>
    </Disclosure>
  );
}

/** Questions and their answers, one open at a time. */
export function Faq({ items }: {
  readonly items: readonly { readonly id: string; readonly q: string; readonly a: React.ReactNode }[];
}) {
  return (
    <Accordion>
      {items.map((item) => (
        <Accordion.Item key={item.id} id={item.id}>
          <Accordion.Heading>
            <Accordion.Trigger>
              {item.q}
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body>{item.a}</Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

/* ------------------------------------------------------------------ gauge --- */

/**
 * A fraction worn as a ring — storage used, budget spent, profile complete.
 * The number is the fact; the ring is how far that is from the edge.
 */
export function Gauge({ value, label, note }: {
  /** 0–100. */
  readonly value: number;
  readonly label: string;
  readonly note?: string;
}) {
  return (
    <div className={`flex items-center ${SPACE.snug}`}>
      <ProgressCircle aria-label={label} value={value}>
        <ProgressCircle.Track>
          {/*
            ⚠️ THE ARC DRAWS IN `--data` AND THAT RULE IS IN `ground.ts`, not
            here. Left as the library ships it the fill is `--accent`, which is
            monochrome in this interface — so a gauge at 62% and a gauge at 0%
            drew the identical ring, on the component whose whole job is saying
            how far along somebody is. `Meter` and `Ring` name the token
            themselves because their marks are ours; this mark is the library's,
            so the fix is a theme rule rather than a class or a style on it (D7).
          */}
          <ProgressCircle.TrackCircle />
          <ProgressCircle.FillCircle />
        </ProgressCircle.Track>
      </ProgressCircle>
      <div className={`flex flex-col ${SPACE.hair}`}>
        <span className={TYPE.label}>{label}</span>
        {note ? <span className={TYPE.note}>{note}</span> : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- crumbs --- */

/**
 * ⚠️ WHERE YOU ARE, WHEN THE HIERARCHY IS REAL. Two levels do not need this —
 * that is `PageCrown`'s back button. Crumbs earn their row at three or more.
 */
export function Crumbs({ trail }: {
  readonly trail: readonly { readonly label: string; readonly onGo?: () => void }[];
}) {
  return (
    <Breadcrumbs>
      {trail.map((t, i) => (
        <Breadcrumbs.Item key={i} onPress={t.onGo}>
          {t.label}
        </Breadcrumbs.Item>
      ))}
    </Breadcrumbs>
  );
}

/* --------------------------------------------------------------- document --- */

/**
 * A WHOLE TEXT, SET RATHER THAN DUMPED — terms, a notice, a policy.
 *
 * ⚠️ THE ONE PLACE A WALL OF WORDS IS THE POINT. Everything else in this system
 * fights prose: a refusal is a sentence, a row is a line, the copy rule is short
 * and actionable. A document somebody is asked to AGREE to is the exception — it
 * has to be readable end to end, so it gets a measure, a rhythm, and headings
 * that can be found while scrolling.
 *
 * ⚠️ `Prose` IS ONE PARAGRAPH THE CALLER WROTE; this is many the deployment
 * declared. Different jobs, and the split is why this one takes a string rather
 * than children — the text arrives from a declaration or an operation, never as
 * markup somebody assembled.
 *
 * ⚠️ AND THE CUTTING IS THE KERNEL'S (`passagesOf`), NOT THIS COMPONENT'S. The
 * same text is served as a standalone page by the worker, for anybody reading it
 * without the app open; two ideas of what a paragraph is would be two documents.
 */
export function Document({ text }: { readonly text: string }) {
  return (
    <div className={`flex flex-col ${SPACE.snug} ${WIDTH.read}`}>
      {passagesOf(text).map((p, i) => (p.heading
        /* ⚠️ AIR ABOVE A HEADING AND NOT BELOW IT — the space is what says the
           paragraph under it belongs to it. Never on the first, where it would
           open the document with a gap. */
        ? <h2 key={i} className={`${TYPE.section} ${i === 0 ? "" : NUDGE.over}`}>{p.text}</h2>
        : <p key={i} className={TYPE.body}>{p.text}</p>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- hotkey --- */

/** ⚠️ The library owns the glyphs — `keyValue` names the key, it draws ⌘. */
const NAMED: Readonly<Record<string, KbdKey>> = {
  cmd: "command", command: "command", shift: "shift", ctrl: "ctrl",
  alt: "alt", option: "option", enter: "enter", esc: "escape",
  tab: "tab", space: "space", up: "up", down: "down", left: "left", right: "right",
};

/** The keys that do it, beside the thing they do. */
export function Hotkey({ keys }: { readonly keys: readonly string[] }) {
  return (
    <Kbd>
      {keys.map((k) => {
        const named = NAMED[k.toLowerCase()];
        return named
          ? <Kbd.Abbr key={k} keyValue={named} />
          : <Kbd.Content key={k}>{k}</Kbd.Content>;
      })}
    </Kbd>
  );
}

/* ------------------------------------------------------------------- tree --- */

/** One node of a hierarchy, as a database hands it over: flat, with a parent. */
export interface Branch {
  readonly id: string;
  readonly label: string;
  /** A fact about it — a count, a state, a date. Never an explanation. */
  readonly under?: string;
  /** ⚠️ The parent's id. Absent is a root, which is what makes this flat list a
      tree without a second table and without anybody nesting it by hand. */
  readonly of?: string | null;
  readonly aside?: React.ReactNode;
}

export interface TreeProps {
  readonly nodes: readonly Branch[];
  /** Where the reader is. Absent is the top. */
  readonly here?: string | null;
  readonly onGo: (id: string | null) => void;
  /** ⚠️ What the top of the trail is called — a workspace, a library, a site. */
  readonly root?: string;
  readonly nothing?: React.ReactNode;
}

/**
 * A HIERARCHY, DESCENDED RATHER THAN EXPANDED.
 *
 * ⚠️ AN INDENTED TREE IS A DESKTOP CONTROL, AND THIS PRODUCT IS HELD IN ONE
 * HAND. Six levels at the 24px a level needs is 144 pixels of a 390-pixel screen
 * gone before a word is drawn — so the deepest rows, which are the ones actually
 * holding anything, get the narrowest column. Every phone that has ever shown a
 * filesystem shows one level and a way back, and it is not a compromise: it is
 * the shape DESIGN.md §3 already asks for. Descend, do not cram.
 *
 * ⚠️ SO THE TRAIL IS THE HALF THAT MAKES IT WORK. Somebody four levels down with
 * no trail is somebody who has to go back four times to find out where they are;
 * `Crumbs` earns its row here exactly as its own header describes.
 *
 * ⚠️ AND THE NESTING IS DERIVED FROM THE PARENT POINTER, NEVER PASSED IN. A
 * caller that had to build the nesting would build it slightly differently in
 * every screen that shows one — and the flat list with a parent column is what a
 * table gives back, so nesting it is work done twice to be undone.
 */
export function Tree({ nodes, here = null, onGo, root = "All", nothing }: TreeProps) {
  const under = nodes.filter((n) => (n.of ?? null) === here);

  /* ⚠️ WALKED UPWARDS FROM WHERE YOU ARE, and bounded by the node count. A cycle
     in the data — which a self-referencing table permits — would otherwise hang
     the screen rather than draw a wrong trail. */
  const trail: Branch[] = [];
  let at = here;
  for (let step = 0; step < nodes.length && at; step++) {
    const found = nodes.find((n) => n.id === at);
    if (!found) break;
    trail.unshift(found);
    at = found.of ?? null;
  }

  return (
    <div className={`flex flex-col ${SPACE.snug}`}>
      {/* ⚠️ ONLY WHERE THERE IS SOMEWHERE TO GO BACK TO. At the top the trail is
          one word, which is a row spent saying what the screen's own title
          already says. */}
      {trail.length
        ? (
          <Crumbs
            trail={[
              { label: root, onGo: () => onGo(null) },
              ...trail.map((n, i) => ({
                label: n.label,
                /* ⚠️ The last one is where you are, so it goes nowhere. A
                   breadcrumb that navigates to the current page is a control
                   that appears to do nothing. */
                ...(i < trail.length - 1 ? { onGo: () => onGo(n.id) } : {}),
              })),
            ]}
          />
        )
        : null}

      {/* ⚠️ THE ROWS ARE IN A CARD LIKE EVERY OTHER ROW. They were bare, and a
          tree is by definition drawn above a list of what is in the branch —
          so a stock screen put the same row grammar on the page's ground and
          on a surface, one under the other. The crumbs stay OUTSIDE it: a trail
          is where you are rather than a thing you are looking at. */}
      {under.length
        ? (
          <Group>
            {under.map((n) => (
              <NavRow
                key={n.id}
                label={n.label}
                under={n.under}
                aside={n.aside}
                /* ⚠️ A LEAF STILL OPENS. What is inside a shelf is not another
                   shelf, and a row that stops being pressable at the bottom of
                   the tree is a screen where the thing somebody came for is the
                   one row they cannot reach. */
                onOpen={() => onGo(n.id)}
              />
            ))}
          </Group>
        )
        : nothing}
    </div>
  );
}
