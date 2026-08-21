/**
 * EVERY DATE, TIME, NUMBER, PRICE AND QUANTITY THE PRODUCT SHOWS.
 *
 * ⚠️ A SCREEN NEVER FORMATS A VALUE, AND A GUARD SAYS SO. Before this existed
 * the product had `toLocaleDateString("en-US")` in one file, `Intl.NumberFormat("en")`
 * in another and `.slice(0, 10)` in six — so a reader in Berlin got American
 * dates on some screens and an ISO fragment on others, and `08/09` meant a
 * different day depending on which one they were looking at. That is not
 * untidiness; it is the product stating a fact and being wrong about it.
 *
 * ⚠️ SO THE PREFERENCE IS READ ONCE, AT THE TOP, AND EVERY VALUE DESCENDS FROM
 * IT. `Presenting` resolves what the person chose against what the machine reports,
 * once per session, and puts the answer in context. Nothing below it knows what
 * a locale is.
 *
 * ⚠️ AND THEY ARE COMPONENTS RATHER THAN FUNCTIONS, WHICH IS THE PART THAT
 * MAKES IT HOLD. A helper is something a screen may or may not call; an element
 * is something a screen has to write, and a guard can find every place a bare
 * number was written instead. It also means changing a preference REPAINTS —
 * a formatted string captured in state would not.
 *
 * ⚠️ THE ENGINE IS `Intl`, AND `@engine/kernel`'s `present.ts` IS THE WHOLE OF
 * IT. This file is the binding: context, a hook, and one element per kind of
 * value. No formatting decision is made here.
 */

import * as React from "react";
import {
  DEFAULT_PRESENTATION, MACHINE, byDay, dayIn, instant, readAmount, sayAmount, sayBytes,
  sayDate, sayMoment, sayMoney, sayNumber, sayTime, sayWhen, shownAs,
  type Bucket, type DateLength, type Day, type Instant, type Machine, type Measure,
  type Presentation, type Shown,
} from "@engine/kernel";
import { TYPE } from "../tokens/type.js";
import { compact, grouped } from "../chart/scale.js";

/* ---------------------------------------------------------------- the room --- */

const Ctx = React.createContext<Shown | null>(null);

/**
 * ⚠️ WHAT THE BROWSER REPORTS, ASKED ONCE. `navigator.language` and the resolved
 * time zone are stable for the life of a page, and asking `Intl` for the zone
 * per render is a synchronous ICU lookup inside a list.
 *
 * ⚠️ AND IT IS GUARDED FOR THE SERVER. The screens are rendered to a string in
 * the suite, where neither global exists — reaching for them unguarded is what
 * makes a component provable only in a browser.
 */
export const machineHere = (): Machine => {
  const locale = typeof navigator === "undefined" ? MACHINE.locale
    : navigator.language || MACHINE.locale;
  let zone = MACHINE.zone;
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || MACHINE.zone; }
  catch { zone = MACHINE.zone; }
  /* ⚠️ THE PLACE IS REPORTED BESIDE THE TAG, NEVER STITCHED INTO IT — see
     `Machine.region`. Overwriting the region subtag loses the device's own
     conventions, which are the fallback wherever the region's cannot be
     borrowed. */
  return { locale, zone, region: countryOf(zone) ?? undefined };
};

/* -------------------------------------------------------------- where they are --- */

/**
 * ⚠️ `Intl.Locale.getTimeZones()` IS THE INVERSE OF THE QUESTION, so the answer
 * is found by scanning regions rather than by holding a table of 418 zones that
 * would be this file having an opinion about borders. It is one lookup per
 * session — the device's zone does not move while a page is open — and the
 * result is remembered.
 *
 * ⚠️ DEPRECATED CODES ARE DROPPED BY CANONICALISING, and that is not tidiness.
 * `DD` (East Germany) still carries `Europe/Berlin` in CLDR and sorts before
 * `DE`, so the obvious scan resolves Berlin to a country that stopped existing
 * in 1990 — and `und-DD` formats nothing, so every date on the screen silently
 * falls back. A code that does not survive `maximize()` is an alias, not a place.
 *
 * ⚠️ AND THE ZONE IS CANONICALISED TOO. `Europe/Kyiv` is what a modern runtime
 * REPORTS and `Europe/Kiev` is what its own region data still LISTS, so the
 * lookup misses on the one country where getting this right matters most.
 */
const known = new Map<string, string | null>();
const countryOf = (zone: string): string | null => {
  const had = known.get(zone);
  if (had !== undefined) return had;
  let found: string | null = null;
  try {
    const zonesOf = (code: string) =>
      (new Intl.Locale(`und-${code}`) as { getTimeZones?: () => string[] | undefined })
        .getTimeZones?.();
    /* ⚠️ A RUNTIME WITHOUT IT ANSWERS NOTHING, and nothing is the honest answer —
       the caller then keeps the language's own region, which is what every
       browser did before this existed. */
    if (!zonesOf("DE")) { known.set(zone, null); return null; }
    const want = new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone;
    /* ⚠️ `fallback: "none"` — an unassigned code answers `undefined` rather than
       echoing itself back, which is what makes this a filter at all. */
    const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
    outer:
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        if (!names.of(code)) continue;
        if (new Intl.Locale(`und-${code}`).maximize().region !== code) continue;
        if (!zonesOf(code)?.includes(want)) continue;
        found = code;
        break outer;
      }
    }
  } catch { found = null; }
  known.set(zone, found);
  return found;
};


/**
 * ⚠️ ONE OF THESE, AT THE ROOT, ALWAYS. Absent, everything below falls back to
 * the machine's own conventions — which is correct rather than broken, and is
 * what the sign-in screens get before there is a person to have a preference.
 */
export function Presenting({ of, machine, children }: {
  readonly of?: Presentation;
  /** ⚠️ Injected in the suite, so a formatted string is provable without a browser. */
  readonly machine?: Machine;
  readonly children: React.ReactNode;
}) {
  const from = machine ?? machineHere();
  const shown = React.useMemo(
    () => shownAs(of ?? DEFAULT_PRESENTATION, from),
    [of, from.locale, from.zone, from.region],
  );
  return <Ctx.Provider value={shown}>{children}</Ctx.Provider>;
}

/**
 * HOW THIS READER READS.
 *
 * ⚠️ FOR THE CASES AN ELEMENT CANNOT COVER — a value inside an `aria-label`, a
 * filename, a chart's axis ticks, a string handed to a library. Everything a
 * person reads on the page should be one of the elements below instead: the
 * hook returns a string, and a string in a variable is a value that has already
 * escaped the guard.
 */
export function useShown(): Shown {
  return React.useContext(Ctx) ?? shownAs(DEFAULT_PRESENTATION, machineHere());
}

/* ------------------------------------------------------------------- when --- */

/**
 * ⚠️ `<time>`, WITH THE MACHINE-READABLE VALUE ON IT. A screen reader, a
 * translation tool and a copy-paste into a spreadsheet all want the instant; the
 * person wants their own convention. The element carries both, which no string
 * can.
 */
const Time = ({ at, says }: { readonly at: string; readonly says: string }) => (
  <time dateTime={at}>{says}</time>
);

/** A date. `numeric` for a column, `short` for a row, `long` for a heading. */
export function Dated({ at, length = "short", withTime }: {
  readonly at: Instant | Day | string;
  readonly length?: DateLength;
  /** ⚠️ Only where the hour is part of the fact — see `sayMoment`. */
  readonly withTime?: boolean;
}) {
  const shown = useShown();
  return (
    <Time
      at={at}
      says={withTime
        ? sayMoment(shown, at as Instant, length)
        : sayDate(shown, at as Instant, length)}
    />
  );
}

/** Just the clock time. */
export function Clock({ at, seconds }: {
  readonly at: Instant | string;
  readonly seconds?: boolean;
}) {
  return <Time at={at} says={sayTime(useShown(), at as Instant, seconds)} />;
}

/**
 * "Today", "Yesterday", then the date.
 *
 * ⚠️ `now` IS A PROP WITH A DEFAULT RATHER THAN A `Date.now()` INSIDE. A
 * component that reads the clock during render is one whose output cannot be
 * asserted, and every test of a list with dates in it becomes a test that passes
 * only on the day it was written.
 */
export function When({ at, now }: {
  readonly at: Instant | string;
  readonly now?: Instant;
}) {
  return <Time at={at} says={sayWhen(useShown(), at as Instant, now ?? instant())} />;
}

/**
 * A LIST CUT INTO DAYS, NEWEST FIRST.
 *
 * ⚠️ THE HOOK, NOT A COMPONENT, BECAUSE THE CALLER OWNS THE HEADINGS. What sits
 * over each group is a `SectionTitle` on one screen and a sticky rule on
 * another; what this decides is which day each item belongs to, in the reader's
 * own zone, which is the part nobody should be writing twice.
 */
export function useDays<T>(
  items: readonly T[], at: (item: T) => Instant, now?: Instant,
): readonly Bucket<T>[] {
  const shown = useShown();
  /* ⚠️ THE CLOCK IS READ ONCE PER LIST, not once per item. Two items either side
     of midnight during one render would otherwise land in headings that disagree
     with each other. */
  const asOf = now ?? instant();
  return React.useMemo(() => byDay(shown, items, at, asOf), [shown, items, asOf]);
}

/**
 * ⚠️ THE CHART'S TWO NUMBER SHAPES, ALREADY BOUND. An axis tick and a cell are
 * drawn in a loop inside a `<svg>`, where an element per value is not an
 * option — so this is the one place a bound FUNCTION is the right answer, and
 * it exists so the chart files never see a locale either.
 */
export function useFigures(): {
  readonly compact: (v: number) => string;
  readonly grouped: (v: number) => string;
} {
  const shown = useShown();
  return React.useMemo(() => ({
    compact: (v: number) => compact(shown, v),
    grouped: (v: number) => grouped(shown, v),
  }), [shown]);
}

/** ⚠️ The reader's own calendar day — for a key, never for a label. */
export const useDay = (at: Instant | string): Day => dayIn(useShown(), at as Instant);

/* ---------------------------------------------------------------- numbers --- */

/**
 * ⚠️ `tabular-nums` IS NOT COSMETIC IN A COLUMN. Proportional digits ripple down
 * a list and the reader ends up comparing the ripple rather than the values, so
 * every figure this draws wears `TYPE.figure`'s numerals.
 */
export function Num({ value, places, plain }: {
  readonly value: number;
  readonly places?: number;
  /** ⚠️ For a number inside a sentence, where lining figures look pasted in. */
  readonly plain?: boolean;
}) {
  const says = sayNumber(useShown(), value, places);
  return plain ? <>{says}</> : <span className={TYPE.figures}>{says}</span>;
}

/**
 * THE WORD A NUMBER IS COUNTED IN — the workspace's own, beside the figure.
 *
 * ⚠️ IT IS NOT INFLECTED, AND THAT IS THE DECISION RATHER THAN AN OMISSION. The
 * word is whatever somebody typed — `glove`, `box`, `kg`, `ea` — so pluralising
 * it means guessing: naive rules give "boxs", better rules give "kgs", and a
 * measurement abbreviation is never pluralised in any of them. Every inventory
 * and every invoice in the world prints the unit uninflected for this reason.
 *
 * ⚠️ AND IT IS MUTED AND SHRINK-PROOF, because it sits after a figure in a row
 * that packs everything right. Passed as a bare string it inherits the row's own
 * size and weight, so a column of quantities reads as "1,200 glove" in the same
 * ink as the number — the unit competing with the value it qualifies.
 */
export function Unit({ of }: { readonly of: string }) {
  return of ? <span className={`shrink-0 ${TYPE.note}`}>{of}</span> : null;
}

/*
  ⚠️ THERE IS NO `<Money>` HERE, AND THAT IS DELIBERATE. `surfaces.tsx` already
  owns the one typographic device money needs — the fraction set smaller than the
  whole — so a second money element would be two answers to "what does a price
  look like". It reads its currency through `useShown` like everything else.
*/

/** ⚠️ Powers of two, labelled as such — see `sayBytes`. */
export function Size({ bytes }: { readonly bytes: number }) {
  return <span className={TYPE.figures}>{sayBytes(useShown(), bytes)}</span>;
}

/**
 * A PHYSICAL QUANTITY, STORED IN THE BASE UNIT AND SHOWN IN THEIRS.
 *
 * ⚠️ THE PROP IS THE BASE UNIT AND ITS NAME SAYS SO. `grams`, not `weight`: a
 * prop called `weight` is one somebody passes kilograms to, and the reading is
 * then wrong by a thousand with nothing to catch it.
 */
export function Amount({ base, measure }: {
  readonly base: number;
  readonly measure: Measure;
}) {
  return <span className={TYPE.figures}>{sayAmount(useShown(), base, measure)}</span>;
}

/**
 * ⚠️ THE OTHER DIRECTION, AND A FORM THAT SKIPS IT CORRUPTS THE ROW. A field
 * showing pounds must WRITE grams, through the same table the display reads, or
 * the number drifts every time somebody opens the form and saves it unchanged.
 */
export function useAmount(measure: Measure): {
  readonly show: (base: number) => number;
  readonly read: (typed: number) => number;
} {
  const shown = useShown();
  return React.useMemo(() => ({
    show: (base: number) => Number(sayAmount(shown, base, measure).replace(/[^\d.-]/g, "")),
    read: (typed: number) => readAmount(shown, typed, measure),
  }), [shown, measure]);
}
