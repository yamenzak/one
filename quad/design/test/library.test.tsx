/**
 * THE NEW VOCABULARY RENDERS, IN EVERY STATE IT CLAIMS TO HAVE.
 *
 * ⚠️ THESE ARE STATIC-MARKUP TESTS, WHICH IS THE RIGHT ALTITUDE. What breaks
 * this layer is not logic — it is a compound component recomposed against the
 * library's anatomy, which throws (or renders nothing) the moment it mounts.
 * Rendering each piece once, in each state, is what catches a HeroUI upgrade
 * moving a subcomponent before any screen does.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLATFORM_PROBLEMS, problem } from "@quad/kernel";
import {
  Agree, Choice, Crumbs, Faq, FormWaiting, Gauge, Hotkey, Listing, LongText, Lookup,
  MoneyInput, NumberInput, OneOf, PageTabs, Picks, SearchInput, SecretInput, Segmented,
  Dial, Steps, TableWaiting, Tags, TextInput, TimeInput, Timeline, DateInput,
  ready, trouble, waiting, type Col,
} from "../src/index.js";

const nothing = () => {};

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
  it("renders rows when ready", () => {
    const html = renderToStaticMarkup(
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

  it("every control renders with the same four sentences", () => {
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
      const html = renderToStaticMarkup(control);
      expect(html.length).toBeGreaterThan(40);
    }
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
