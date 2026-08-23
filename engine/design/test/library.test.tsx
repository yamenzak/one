/**
 * THE NEW VOCABULARY RENDERS, IN EVERY STATE IT CLAIMS TO HAVE.
 *
 * ⚠️ THESE ARE STATIC-MARKUP TESTS, WHICH IS THE RIGHT ALTITUDE. What breaks
 * this layer is not logic — it is a compound component recomposed against the
 * library's anatomy, which throws (or renders nothing) the moment it mounts.
 * Rendering each piece once, in each state, is what catches a HeroUI upgrade
 * moving a subcomponent before any screen does.
 */

import type * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { describe, expect, it } from "vitest";
import { PLATFORM_PROBLEMS, problem } from "@engine/kernel";
import {
  Agree, Choice, CodeEntry, Crumbs, Faq, FormWaiting, Gauge, Hotkey, Listing, LongText, Lookup,
  MoneyInput, NumberInput, OneOf, PageTabs, Picks, SearchInput, SecretInput, Segmented,
  Dial, Steps, TableWaiting, Tags, TextInput, TimeInput, Timeline, DateInput,
  PeriodInput, PERIODS, spanOf, ready, trouble, waiting, type Col,
} from "../src/index.js";

const nothing = () => {};

/**
 * ⚠️ A LAZY CHUNK NEVER RESOLVES INSIDE `renderToStaticMarkup`, so a control
 * that arrives in one renders as its own skeleton and nothing else. The
 * expensive components — a calendar, a colour picker, a table — are behind
 * `React.lazy` so their weight stays out of the entry chunk
 * (`scripts/weight.test.mjs`), and asserting on the CONTROL means waiting for
 * what the boundary is waiting for.
 *
 * ⚠️ AND IT IS `prerender` RATHER THAN A SECOND PASS. Rendering twice with a
 * tick between reads plausibly and is wrong: the sync renderer answers a
 * suspended boundary with its fallback rather than starting the import, so the
 * second pass returns the same skeleton and every assertion on LENGTH passes on
 * it. That is the shape this whole round is about — a check agreeing with the
 * thing it exists to catch. `react-dom/static` waits.
 */
const drawn = async (node: React.ReactElement): Promise<string> => {
  const { prelude } = await prerender(node);
  return new Response(prelude as unknown as ReadableStream).text();
};

interface Row { readonly id: string; readonly who: string; readonly amount: number }
const ROWS: readonly Row[] = [
  { id: "1", who: "Priya", amount: 240 },
  { id: "2", who: "Tom", amount: 85 },
];
const COLS: readonly Col<Row>[] = [
  { id: "who", label: "Who", cell: (r) => r.who, by: (a, b) => a.who.localeCompare(b.who) },
  { id: "amount", label: "Amount", numeric: true, cell: (r) => r.amount, by: (a, b) => a.amount - b.amount },
];

describe("the listing", () => {
  it("renders rows when ready", async () => {
    const html = await drawn(
      <Listing label="Test" of={ready(ROWS)} cols={COLS} rowKey={(r) => r.id} />,
    );
    expect(html).toContain("Priya");
    expect(html).toContain("Amount");
  });

  it("renders the table's own skeleton while waiting", () => {
    const html = renderToStaticMarkup(
      <Listing label="Test" of={waiting<readonly Row[]>()} cols={COLS} rowKey={(r) => r.id} />,
    );
    expect(html).toContain("Loading table");
    expect(html).not.toContain("Priya");
  });

  it("says what is true when there are no rows", () => {
    const html = renderToStaticMarkup(
      <Listing
        label="Test" of={ready<readonly Row[]>([])} cols={COLS} rowKey={(r) => r.id}
        says={{ nothing: "Nothing unpaid" }}
      />,
    );
    expect(html).toContain("Nothing unpaid");
  });

  it("reports trouble in the platform's words, never the empty state", () => {
    const html = renderToStaticMarkup(
      <Listing
        label="Test"
        of={trouble<readonly Row[]>(problem(PLATFORM_PROBLEMS, "platform.unavailable", {}, {}))}
        cols={COLS} rowKey={(r) => r.id}
        says={{ nothing: "Nothing unpaid" }}
      />,
    );
    expect(html).not.toContain("Nothing unpaid");
  });

  /* ⚠️ The pager appears only past the page size — under it, it is furniture. */
  it("pages only when there are pages", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: String(i), who: `P${i}`, amount: i }));
    const paged = renderToStaticMarkup(
      <Listing label="Test" of={ready(many)} cols={COLS} rowKey={(r) => r.id} pageSize={5} />,
    );
    const flat = renderToStaticMarkup(
      <Listing label="Test" of={ready(ROWS)} cols={COLS} rowKey={(r) => r.id} pageSize={5} />,
    );
    expect(paged).toContain("1–5 of 12");
    expect(flat).not.toContain("of 2");
  });
});

describe("the form grammar", () => {
  it("shows the caller's refusal under the control", () => {
    const html = renderToStaticMarkup(
      <TextInput label="IBAN" value="x" onChange={nothing} error="That is too short." />,
    );
    expect(html).toContain("That is too short.");
  });

  it("renders pending as disabled, never as empty-and-editable", () => {
    const html = renderToStaticMarkup(
      <TextInput label="Name" value={undefined} onChange={nothing} />,
    );
    expect(html).toContain("disabled");
  });

  it("never renders a secret back", () => {
    const html = renderToStaticMarkup(
      <SecretInput label="API key" set onChange={nothing} />,
    );
    expect(html).toContain("Stored. Type to replace it.");
    expect(html).not.toContain("value=\"sk-");
  });

  it("every control renders with the same four sentences", async () => {
    const opts = [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }];
    const controls = [
      <LongText key="l" label="About" value="" onChange={nothing} help="H" />,
      <NumberInput key="n" label="Count" value={3} onChange={nothing} />,
      <MoneyInput key="m" label="Rate" value={60} onChange={nothing} currency="EUR" />,
      <SearchInput key="s" label="Search" value="" onChange={nothing} />,
      <Choice key="c" label="Plan" value="a" onChange={nothing} options={opts} />,
      <Lookup key="lk" label="Coach" value={null} onChange={nothing} options={opts} />,
      <Agree key="ag" label="Terms" value={false} onChange={nothing} />,
      <Picks key="p" label="Days" value={[]} onChange={nothing} options={opts} />,
      <OneOf key="o" label="Level" value={null} onChange={nothing} options={opts} />,
      <Dial key="sl" label="Effort" value={5} onChange={nothing} />,
      <Segmented key="sg" label="Period" value="a" onChange={nothing} options={opts} />,
      <Tags key="t" label="Labels" items={opts} />,
      <DateInput key="d" label="Starts" onChange={nothing} />,
      <TimeInput key="ti" label="At" onChange={nothing} />,
    ];
    for (const control of controls) {
      const html = await drawn(control);
      expect(html.length).toBeGreaterThan(40);
      /* ⚠️ AND NOT AS ITS OWN PLACEHOLDER. A lazy control that never resolved
         renders a skeleton, which is longer than forty characters and passes
         the line above — so the length check alone would report every
         split-out control as drawn while drawing none of them. */
      expect(html, "rendered as a skeleton").not.toMatch(/data-slot="skeleton"/);
    }
  });

  /*
    ⚠️ THE BOXES ARE COUNTED FROM THE SERVER'S NUMBER, NOT WRITTEN OUT. The
    screen this came from opened by saying a form drawing six against a server
    issuing eight refuses every valid code and blames the person while doing it —
    and then drew six `<InputOTP.Slot index={0..5}>` by hand, a few lines below.
    Raising `CODE_DIGITS` would have left a six-box form unable to accept
    anything, with nothing failing.
  */
  const slots = (html: string) => [...html.matchAll(/data-slot="input-otp-slot"/g)].length;

  it("draws exactly as many boxes as the code has digits", () => {
    for (const digits of [4, 5, 6, 8]) {
      const html = renderToStaticMarkup(
        <CodeEntry digits={digits} value="" onChange={nothing} />,
      );
      expect(slots(html), `${digits} digits`).toBe(digits);
    }
  });

  it("splits a long code in two and leaves a short one whole", () => {
    const sep = (html: string) => [...html.matchAll(/data-slot="input-otp-separator"/g)].length;
    expect(sep(renderToStaticMarkup(<CodeEntry digits={6} value="" onChange={nothing} />))).toBe(1);
    /* ⚠️ Four or fewer is one run — a separator there is punctuation between two
       digits and one, which is not a grouping anybody reads. */
    expect(sep(renderToStaticMarkup(<CodeEntry digits={4} value="" onChange={nothing} />))).toBe(0);
  });

  it("names itself, because the boxes on their own are N unnamed inputs", () => {
    const html = renderToStaticMarkup(<CodeEntry digits={6} value="" onChange={nothing} />);
    expect(html).toContain("Your code");
  });
});

describe("a period", () => {
  /*
    ⚠️ THE SEGMENTS DIVIDE A PHONE AND SIT AT THEIR OWN SIZE ON A DESKTOP, and
    this is pinned because it is one word from being wrong again. At its
    intrinsic width a five-segment period is ~363px — wider than the column left
    inside a 390px screen — so it ran past the edge with its last segment cut
    off, over the panel's own title, in the one place a filter is most likely to
    appear. Dropping `w-full` or `basis-0` restores exactly that.

    ⚠️ AND `flex-wrap`, WHICH ONLY A BROWSER COULD SAY WAS MISSING. `basis-0`
    lets the segments share the width down to their MIN-CONTENT and no further:
    a button ships `whitespace-nowrap`, so five labels plus their padding still
    came to more than a phone's column and the control overran by two pixels.
    Wrapping puts the odd one on a second row, which is also the right reading —
    `Dates` is the escape from the named periods rather than one of them.
  */
  it("fills a narrow container and lets the segments share it", () => {
    const html = renderToStaticMarkup(
      <PeriodInput value="month" today="2026-08-16" onChange={nothing} />,
    );
    expect(html).toContain("w-full flex-wrap sm:w-auto sm:flex-nowrap");
    expect(html).toContain("grow basis-0 sm:grow-0 sm:basis-auto");
  });

  it("offers every named stretch and the exact case", () => {
    const html = renderToStaticMarkup(
      <PeriodInput value="month" today="2026-08-16" onChange={nothing} />,
    );
    for (const p of PERIODS) expect(html, p.id).toContain(p.label);
    expect(html).toContain("Dates");
    /* ⚠️ The calendar is only there for the exact case — a named period IS the
       answer, and a range field under it would be a second one. */
    expect(html).not.toContain("date-range-picker");
  });

  /*
    ⚠️ BOTH ENDS INCLUSIVE, SO "7 DAYS" REACHES BACK SIX. Off by one here is a
    week that is eight days long — which nothing surfaces except a total that
    quietly disagrees with the one beside it.
  */
  it("counts a named stretch inclusively", () => {
    expect(spanOf("7d", "2026-08-16")).toEqual({ from: "2026-08-10", to: "2026-08-16" });
    expect(spanOf("30d", "2026-08-16")).toEqual({ from: "2026-07-18", to: "2026-08-16" });
  });

  it("starts a month and a year where the calendar does", () => {
    expect(spanOf("month", "2026-08-16")).toEqual({ from: "2026-08-01", to: "2026-08-16" });
    expect(spanOf("year", "2026-08-16")).toEqual({ from: "2026-01-01", to: "2026-08-16" });
  });

  /*
    ⚠️ THE ARITHMETIC CROSSES BOUNDARIES, WHICH IS WHERE HAND-ROLLED DATE MATH
    BREAKS. Reaching back over the turn of a month, a year, and February in a
    leap year are three separate ways to be off by one.
  */
  it("reaches back across a month, a year and a leap day", () => {
    expect(spanOf("7d", "2026-03-03").from).toBe("2026-02-25");
    expect(spanOf("7d", "2026-01-03").from).toBe("2025-12-28");
    expect(spanOf("7d", "2028-03-02").from).toBe("2028-02-25");
    expect(spanOf("month", "2026-01-01")).toEqual({ from: "2026-01-01", to: "2026-01-01" });
  });

  /*
    ⚠️ UTC THROUGHOUT. Parsing `YYYY-MM-DD` gives midnight UTC, and reading it
    back through the LOCAL getters gives the previous day for anybody west of
    Greenwich — so a report run in New York would start and end one day early,
    every time, and look right to whoever wrote it. This test is what catches a
    later edit to `new Date(text).getDate()`.
  */
  it("does not move with the machine's timezone", () => {
    const was = process.env.TZ;
    for (const tz of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati"]) {
      process.env.TZ = tz;
      expect(spanOf("30d", "2026-08-16"), tz).toEqual({ from: "2026-07-18", to: "2026-08-16" });
    }
    process.env.TZ = was;
  });
});

describe("the blocks", () => {
  it("marks where the flow is and no other step", () => {
    const html = renderToStaticMarkup(
      <Steps at="b" steps={[{ id: "a", label: "One" }, { id: "b", label: "Two" }, { id: "c", label: "Three" }]} />,
    );
    expect(html.match(/aria-current="step"/g)?.length).toBe(1);
  });

  it("draws the trail in order", () => {
    const html = renderToStaticMarkup(
      <Timeline moments={[
        { id: "a", when: "Today", label: "Checked in" },
        { id: "b", when: "Yesterday", label: "Session 14" },
      ]} />,
    );
    expect(html.indexOf("Checked in")).toBeLessThan(html.indexOf("Session 14"));
  });

  it("renders tabs, crumbs, gauge, reveal, faq and hotkey", () => {
    for (const piece of [
      <PageTabs key="t" label="Client" tabs={[{ id: "a", label: "Plan", content: "X" }]} />,
      <Crumbs key="c" trail={[{ label: "Home", onGo: nothing }, { label: "Here" }]} />,
      <Gauge key="g" value={62} label="Storage" note="31 of 50" />,
      <Faq key="f" items={[{ id: "a", q: "Q?", a: "A." }]} />,
      <Hotkey key="h" keys={["cmd", "K"]} />,
    ]) {
      expect(renderToStaticMarkup(piece).length).toBeGreaterThan(20);
    }
  });

  it("keeps skeletons shaped like their content", () => {
    expect(renderToStaticMarkup(<TableWaiting cols={3} rows={2} />)).toContain("Loading table");
    expect(renderToStaticMarkup(<FormWaiting fields={2} />)).toContain("Loading form");
  });
});
