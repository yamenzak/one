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
import {
  NUDGE, SPACE,
} from "../tokens/metrics.js";
import { TYPE } from "../tokens/type.js";

/* ------------------------------------------------------------------ steps --- */

export interface Step {
  readonly id: string;
  readonly label: string;
}

/**
 * WHERE A FLOW IS, IN ITS OWN WORDS. Done steps wear a check, the current one
 * is the only bold thing, the rest wait in muted — a person mid-wizard reads
 * this in half a second, which is all the attention a progress row gets.
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
            {i > 0 ? <span aria-hidden className="h-px w-6 bg-current opacity-30" /> : null}
            <li
              className={`flex items-center ${SPACE.tight} ${now ? "" : "text-muted"}`}
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
              <span className={now ? TYPE.label : TYPE.note}>{s.label}</span>
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
 */
export function Reveal({ label, children }: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <Disclosure>
      <Disclosure.Heading>
        <Button slot="trigger" variant="ghost" fullWidth>
          {label}
          <Disclosure.Indicator />
        </Button>
      </Disclosure.Heading>
      <Disclosure.Content>{children}</Disclosure.Content>
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
