/**
 * HOW A FACT IS WRITTEN DOWN.
 *
 * ⚠️ EVERY ASSERTION HERE IS ABOUT A READER WHO IS NOT IN CALIFORNIA. The bugs
 * this module exists to remove are all invisible to whoever wrote the code — an
 * American reading American dates cannot see that 08/09 is ambiguous, and a
 * developer in UTC cannot see that bucketing by the UTC date files a Berliner's
 * evening under yesterday. So the cases are Berlin, Tokyo, an evening, and a
 * currency with no cents.
 */

import { describe, expect, it } from "vitest";
import type { Instant } from "../src/primitives.js";
import {
  DEFAULT_PRESENTATION, SHOW, byDay, dayIn, readAmount, refusePresentation,
  sayAmount, sayBytes, sayDate, sayMoment, sayMoney, sayNumber, sayTime, sayWhen, shownAs,
} from "../src/present.js";

const at = (iso: string) => iso as Instant;

/* ⚠️ The three readers every case below is checked against. */
const BERLIN = shownAs(DEFAULT_PRESENTATION, { locale: "de-DE", zone: "Europe/Berlin" });
const LONDON = shownAs(DEFAULT_PRESENTATION, { locale: "en-GB", zone: "Europe/London" });
const NEW_YORK = shownAs(DEFAULT_PRESENTATION, { locale: "en-US", zone: "America/New_York" });

describe("what the machine already knows", () => {
  it("takes the language, the region, the order, the clock and the units from one tag", () => {
    expect(BERLIN.locale).toBe("de-DE");
    expect(BERLIN.dateOrder).toBe("dmy");
    expect(BERLIN.clock).toBe("24");
    expect(BERLIN.units).toBe("metric");

    expect(NEW_YORK.dateOrder).toBe("mdy");
    expect(NEW_YORK.clock).toBe("12");
    expect(NEW_YORK.units).toBe("imperial");
  });

  /*
    ⚠️ THE REGION SUBTAG IS NOT ALWAYS THE SECOND ONE. `zh-Hant-TW` carries a
    SCRIPT there, and taking it as the region yields "HANT" — which `Intl` does
    not recognise, so it falls back silently for every reader of traditional
    Chinese.
  */
  it("finds the region past a script subtag", () => {
    const taipei = shownAs(DEFAULT_PRESENTATION, { locale: "zh-Hant-TW", zone: "Asia/Taipei" });
    expect(taipei.locale).toBe("zh-TW");
  });

  /*
    ⚠️ ENGLISH WORDS, GERMAN CONVENTIONS — the combination one locale dropdown
    cannot express, and the reason language and region are two fields.
  */
  it("joins a chosen language to a chosen region", () => {
    const both = shownAs({ ...DEFAULT_PRESENTATION, language: "en", region: "DE" });
    expect(both.locale).toBe("en-DE");
    expect(sayNumber(both, 1234.56, 2)).toBe("1.234,56");
  });
});

describe("a date, in the order they asked for", () => {
  /*
    ⚠️ THE SAME INSTANT, THREE READERS, THREE STRINGS — and all three name the
    same day. This is the whole product promise in one assertion.
  */
  it("writes one instant three ways", () => {
    const on = at("2026-08-05T10:00:00.000Z");
    expect(sayDate(LONDON, on, "numeric")).toBe("05/08/2026");
    expect(sayDate(NEW_YORK, on, "numeric")).toBe("08/05/2026");
    expect(sayDate(BERLIN, on, "numeric")).toBe("05.08.2026");
  });

  /*
    ⚠️ THE OVERRIDE `Intl` HAS NO OPTION FOR. Reordering the PARTS keeps the
    locale's own separators and month names; hand-building the string from the
    pieces is how a product comes to print `15/Januar/2026`.
  */
  it("overrides the order without touching the separators or the words", () => {
    const on = at("2026-08-05T10:00:00.000Z");
    const dmy = shownAs({ ...DEFAULT_PRESENTATION, dateOrder: "dmy" },
      { locale: "en-US", zone: "America/New_York" });
    expect(sayDate(dmy, on, "numeric")).toBe("05/08/2026");

    const ymd = shownAs({ ...DEFAULT_PRESENTATION, dateOrder: "ymd" },
      { locale: "de-DE", zone: "Europe/Berlin" });
    expect(sayDate(ymd, on, "numeric")).toBe("2026.08.05");
  });

  /*
    ⚠️ A BARE DAY IS NOON, NOT MIDNIGHT. `new Date("2026-08-18")` is midnight
    UTC, so rendering it anywhere west of Greenwich prints the 17th — a birthday
    showing the day before for a third of the planet.
  */
  it("does not move a bare day west of Greenwich", () => {
    expect(sayDate(NEW_YORK, "2026-08-18" as never, "numeric")).toBe("08/18/2026");
  });
});

describe("a time, on their clock", () => {
  it("writes the same instant on both clocks, in both zones", () => {
    const on = at("2026-08-05T21:30:00.000Z");
    expect(sayTime(BERLIN, on)).toBe("23:30");
    expect(sayTime(NEW_YORK, on)).toMatch(/^5:30\s?PM$/i);
  });

  it("honours an explicit clock against the region's own", () => {
    const on = at("2026-08-05T21:30:00.000Z");
    const twelve = shownAs({ ...DEFAULT_PRESENTATION, clock: "12" },
      { locale: "de-DE", zone: "Europe/Berlin" });
    expect(twelve.clock).toBe("12");
    expect(sayTime(twelve, on)).toMatch(/11:30/);
  });

  it("puts the date and the time in one line", () => {
    expect(sayMoment(LONDON, at("2026-08-05T09:04:00.000Z")))
      .toBe("5 Aug 2026 · 10:04");
  });
});

describe("which day it was, for the person who was there", () => {
  /*
    ⚠️ THIS IS THE ONE THAT COSTS A WHOLE DAY. A notification at 23:30 in Berlin
    is stamped 21:30Z; `dayOf` slices the UTC date and files it under the 5th,
    while the person who read it was looking at the 6th. Bucketing on the slice
    puts "yesterday" over something that happened tonight.
  */
  it("buckets by the reader's own calendar, not by UTC", () => {
    const late = at("2026-08-05T22:30:00.000Z");
    expect(dayIn(BERLIN, late)).toBe("2026-08-06");
    expect(dayIn(LONDON, late)).toBe("2026-08-05");
    expect(dayIn(NEW_YORK, late)).toBe("2026-08-05");
  });

  it("says today, yesterday, and then the date", () => {
    const now = at("2026-08-18T12:00:00.000Z");
    expect(sayWhen(LONDON, at("2026-08-18T08:00:00.000Z"), now)).toBe("Today");
    /* ⚠️ NOT 23:00Z ON THE 17th — London is BST in August, so that instant is
       already the 18th where the reader is, and "Today" is the right answer.
       Writing this test in UTC is the same mistake the module exists to fix. */
    expect(sayWhen(LONDON, at("2026-08-17T12:00:00.000Z"), now)).toBe("Yesterday");
    expect(sayWhen(LONDON, at("2026-08-12T09:00:00.000Z"), now)).toBe("12 August");
  });

  /*
    ⚠️ THE YEAR COMES BACK WHEN IT IS NOT THIS ONE, and goes away when it is. A
    column of headings each ending "2026" is noise around the two fields that
    differ.
  */
  it("drops this year and keeps another", () => {
    const now = at("2026-08-18T12:00:00.000Z");
    expect(sayWhen(LONDON, at("2026-01-04T09:00:00.000Z"), now)).toBe("4 January");
    expect(sayWhen(LONDON, at("2025-12-30T09:00:00.000Z"), now)).toContain("2025");
  });

  /*
    ⚠️ THE CALLER'S ORDER SURVIVES. A list arrives sorted by whoever read it —
    newest first out of a query — and re-sorting here would silently overrule
    that, which is how a deliberately oldest-first list comes back reversed.
  */
  it("cuts a list into days without reordering it", () => {
    const now = at("2026-08-18T12:00:00.000Z");
    const items = [
      { id: "a", at: at("2026-08-18T09:00:00.000Z") },
      { id: "b", at: at("2026-08-18T08:00:00.000Z") },
      { id: "c", at: at("2026-08-17T20:00:00.000Z") },
      { id: "d", at: at("2026-08-11T20:00:00.000Z") },
    ];
    const cut = byDay(LONDON, items, (i) => i.at, now);
    expect(cut.map((b) => b.says)).toEqual(["Today", "Yesterday", "11 August"]);
    expect(cut[0]!.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(cut[2]!.items.map((i) => i.id)).toEqual(["d"]);
  });

  /* ⚠️ Berlin's evening is its own day, so it heads its own group. */
  it("gives a late evening its own heading where the reader is", () => {
    const now = at("2026-08-06T09:00:00.000Z");
    const items = [{ at: at("2026-08-05T22:30:00.000Z") }];
    expect(byDay(BERLIN, items, (i) => i.at, now)[0]!.says).toBe("Today");
    expect(byDay(LONDON, items, (i) => i.at, now)[0]!.says).toBe("Yesterday");
  });
});

describe("numbers, money and quantities", () => {
  it("groups and points the way the region does", () => {
    expect(sayNumber(LONDON, 1234567.5, 2)).toBe("1,234,567.50");
    expect(sayNumber(BERLIN, 1234567.5, 2)).toBe("1.234.567,50");
  });

  /*
    ⚠️ THE CURRENCY IS NEVER CONVERTED AND THE PLACEMENT ALWAYS IS. A workspace
    billed in euros is billed in euros wherever its owner is standing.
  */
  it("keeps the currency and moves the symbol", () => {
    /* ⚠️ THE SPACE IS A NARROW NO-BREAK SPACE (U+202F), which is `Intl` being
       right about German typography. Normalised here rather than pasted in,
       because an invisible character in an expectation is a test nobody can
       edit without breaking. */
    const flat = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");
    expect(flat(sayMoney(LONDON, 123456, "EUR"))).toBe("€1,234.56");
    expect(flat(sayMoney(BERLIN, 123456, "EUR"))).toBe("1.234,56 €");
    expect(flat(sayMoney(BERLIN, 123456, "USD"))).toContain("1.234,56");
  });

  /*
    ⚠️ NOT EVERY CURRENCY HAS CENTS. Dividing by a hardcoded hundred prints a yen
    price a hundredth of what it is, which is the kind of wrong nobody notices
    until an invoice goes out.
  */
  it("divides by what the currency actually uses", () => {
    /* ⚠️ "JP¥" RATHER THAN "¥", because ¥ alone is also the renminbi and the
       locale disambiguates. That is `Intl` being more careful than we would be. */
    expect(sayMoney(LONDON, 1500, "JPY")).toBe("JP¥1,500");
    /* ⚠️ "US$" TO A BRITON AND "$" TO AN AMERICAN, which is `Intl`
       disambiguating a symbol that means four different currencies — and
       exactly what somebody reading a foreign invoice needs to see. */
    expect(sayMoney(LONDON, 1500, "USD")).toBe("US$15.00");
    expect(sayMoney(NEW_YORK, 1500, "USD")).toBe("$15.00");
  });

  /*
    ⚠️ ONE STORED GRAM, TWO READINGS, AND NEITHER TOUCHES THE ROW. This is the
    whole reason units are a presentation rather than a column.
  */
  /*
    ⚠️ EVERY IDENTIFIER, IN BOTH SYSTEMS, BECAUSE A WRONG ONE THROWS AT RENDER.
    `Intl.NumberFormat` takes a fixed CLDR list of American spellings, so
    `kilometre` is a `RangeError` out of a component — a blank screen on
    whichever surface shows a distance first. Nothing else exercises all ten:
    this test exists because "kilometre" shipped and took the preview screen
    down.
  */
  it("names a unit `Intl` will actually accept, for every measure and both systems", () => {
    for (const [measure, both] of Object.entries(SHOW)) {
      for (const [system, how] of Object.entries(both)) {
        expect(
          () => new Intl.NumberFormat("en", { style: "unit", unit: how.unit }),
          `${measure} / ${system} names "${how.unit}"`,
        ).not.toThrow();
      }
    }
  });

  it("shows one stored quantity in either system", () => {
    const metric = shownAs({ ...DEFAULT_PRESENTATION, units: "metric" }, { locale: "en-GB", zone: "UTC" });
    const imperial = shownAs({ ...DEFAULT_PRESENTATION, units: "imperial" }, { locale: "en-GB", zone: "UTC" });
    expect(sayAmount(metric, 82000, "mass")).toBe("82.0 kg");
    expect(sayAmount(imperial, 82000, "mass")).toBe("180.8 lb");
  });

  /*
    ⚠️ WHAT SOMEBODY TYPES COMES BACK IN THE BASE UNIT, or a preference becomes a
    corrupted row — and the round trip has to be stable, or the number drifts
    every time the form is opened and saved.
  */
  it("reads a typed amount back into the base unit, without drift", () => {
    const imperial = shownAs({ ...DEFAULT_PRESENTATION, units: "imperial" }, { locale: "en-GB", zone: "UTC" });
    expect(readAmount(imperial, 1, "mass")).toBeCloseTo(453.59237, 5);
    expect(readAmount(imperial, 98.6, "temperature")).toBeCloseTo(37, 5);

    /* ⚠️ THE PROPERTY THAT MATTERS IS THAT IT DOES NOT MOVE. Somebody opening a
       form and saving it unchanged must not shift the stored gram — and it
       would, if the display factor and the input factor were two tables. */
    const shown = sayAmount(imperial, 82000, "mass");
    const typed = Number(shown.replace(/[^\d.]/g, ""));
    const again = readAmount(imperial, typed, "mass");
    expect(sayAmount(imperial, again, "mass")).toBe(shown);
  });

  /* ⚠️ Powers of two, and the label says so — see `sayBytes`. */
  it("sizes in binary and labels it honestly", () => {
    expect(sayBytes(LONDON, 1024)).toBe("1.0 KiB");
    expect(sayBytes(LONDON, 5 * 1024 ** 3)).toBe("5.0 GiB");
    expect(sayBytes(LONDON, 900)).toBe("900 B");
  });
});

describe("what is refused", () => {
  /*
    ⚠️ REFUSED AT THE WRITE BECAUSE `Intl` THROWS AT THE READ. A person could put
    their own account into a state where every screen showing a date throws, and
    the only screen that could fix it is one of those.
  */
  it("refuses a tag, a country and a zone that would throw later", () => {
    expect(refusePresentation({ ...DEFAULT_PRESENTATION, language: "not a tag" }))
      .toContain("language_not_a_tag");
    expect(refusePresentation({ ...DEFAULT_PRESENTATION, region: "Germany" }))
      .toContain("region_not_a_country");
    expect(refusePresentation({ ...DEFAULT_PRESENTATION, zone: "Mars/Olympus" }))
      .toContain("zone_unknown");
    expect(refusePresentation(DEFAULT_PRESENTATION)).toEqual([]);
  });

  /* ⚠️ AND A STORED VALUE THAT SLIPPED THROUGH STILL RENDERS. A row written
     before the check existed must not take the screen down. */
  it("falls back rather than throwing on a tag it cannot use", () => {
    const bad = { locale: "!!!", zone: "UTC", dateOrder: "dmy", clock: "24", units: "metric" } as const;
    expect(() => sayDate(bad, at("2026-08-05T10:00:00.000Z"))).not.toThrow();
    expect(() => sayNumber(bad, 12)).not.toThrow();
  });
});
