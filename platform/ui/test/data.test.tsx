/**
 * THE READING SURFACES.
 *
 * ⚠️ THESE ARE THE COMPONENTS THAT GET REBUILT PER SCREEN, which is why the
 * boundary forbids an app from having its own. A breadcrumb whose last item is a
 * link, a toast that asks a question, a table with no caption and a tooltip
 * carrying the only copy of something all render perfectly — and each is a
 * different answer to a question the language has already answered.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Breadcrumbs, Disclosure, Divider, Menu, PageHeader, Pagination, Progress, Spinner,
  Stat, Steps, Table, Toast, Tooltip,
  type Column, type Crumb, type MenuItem, type Stage,
} from "../src/index.js";

const html = (node: React.ReactNode): string => renderToStaticMarkup(node as never);
const trail: Crumb[] = [{ id: "home", label: "Home" }, { id: "clients", label: "Clients" }, { id: "one", label: "Marion" }];
const stages: Stage[] = [{ id: "a", label: "Details" }, { id: "b", label: "Plan" }, { id: "c", label: "Pay" }];

describe("where somebody is", () => {
  /*
    ⚠️ A BREADCRUMB IS A PATH, NOT A HISTORY. The last item is the page itself,
    so it is not a link — a trail of where somebody has BEEN is the back button,
    and it already exists.
  */
  it("makes the last crumb the page rather than a link", () => {
    const out = html(<Breadcrumbs trail={trail} />);
    expect(out).toContain('aria-current="page"');
    expect([...out.matchAll(/data-one="crumb-link"/g)]).toHaveLength(trail.length - 1);
  });

  it("gives a page header one title and at most one action", () => {
    const out = html(<PageHeader title="Clients" detail="18 active" trail={trail} action={<span>New</span>} />);
    expect(out).toContain("Clients");
    expect(out).toContain("18 active");
    expect([...out.matchAll(/data-one="page-header-action"/g)]).toHaveLength(1);
  });

  /*
    ⚠️ IT SAYS WHERE SOMEBODY IS AND HOW MUCH IS LEFT. Steps with no count is a
    decoration; a count with no current step is a progress bar wearing labels.
  */
  it("says which step of how many, and marks exactly one as current", () => {
    const out = html(<Steps steps={stages} at="b" />);
    expect(out).toContain('aria-label="Step 2 of 3"');
    expect([...out.matchAll(/aria-current="step"/g)]).toHaveLength(1);
    expect(out).toContain('data-state="done"');
    expect(out).toContain('data-state="ahead"');
  });

  /* ⚠️ A pair of arrows with no position is a control somebody presses blind. */
  it("says which page of how many, and stops at both ends", () => {
    const first = html(<Pagination page={1} pages={9} />);
    expect(first).toContain("1 of 9");
    expect(first).toMatch(/data-one="pagination-prev"[^>]*disabled/);
    expect(html(<Pagination page={9} pages={9} />)).toMatch(/data-one="pagination-next"[^>]*disabled/);
  });
});

describe("what is being shown", () => {
  interface Row { readonly id: string; readonly name: string; readonly owed: number }
  const columns: Column<Row>[] = [
    { id: "name", label: "Client", cell: (r) => r.name },
    { id: "owed", label: "Owed", numeric: true, cell: (r) => `$${r.owed}` },
  ];
  const rows: Row[] = [{ id: "1", name: "Marion", owed: 240 }];

  /*
    ⚠️ A TABLE WITHOUT A CAPTION IS A GRID OF NUMBERS somebody has to infer the
    subject of — and a screen reader announces nothing at all before the first
    cell. Headers are scoped for the same reason.
  */
  it("captions the table and scopes its headers", () => {
    const out = html(<Table columns={columns} rows={rows} caption="Outstanding invoices" keyOf={(r) => r.id} />);
    expect(out).toContain("Outstanding invoices");
    expect([...out.matchAll(/scope="col"/g)]).toHaveLength(columns.length);
    /* ⚠️ And a numeric column aligns right with tabular figures. Nothing else does. */
    expect(out).toContain('data-numeric=""');
  });

  /* ⚠️ A table scrolls in its OWN box: the page body never scrolls sideways. */
  it("keeps its own scroll", () => {
    expect(html(<Table columns={columns} rows={rows} caption="x" keyOf={(r) => r.id} />)).toContain('data-one="table-scroll"');
  });

  /*
    ⚠️ UP IS NOT GOOD. Spend up and weight down are both bad news, so the tone
    comes from `good` and never from the arrow's direction — which is the one
    thing a trend indicator gets wrong everywhere.
  */
  it("takes a trend's tone from whether it is good, not from its direction", () => {
    const bad = html(<Stat label="Spend" value="$4,120" trend={{ direction: "up", label: "+12%", good: false }} />);
    expect(bad).toContain('data-direction="up"');
    expect(bad).toContain('data-tone="error"');
    const good = html(<Stat label="Retention" value="94%" trend={{ direction: "up", label: "+3%", good: true }} />);
    expect(good).toContain('data-tone="success"');
  });

  /* ⚠️ `null` is not zero: a statistic nobody has computed says so. */
  it("renders an uncomputed statistic as words rather than as zero", () => {
    const out = html(<Stat label="Churn" value={null} />);
    expect(out).toContain("No data yet");
    expect(out).not.toContain(">0<");
  });

  /*
    ⚠️ INDETERMINATE IS A STATE, NOT A ZERO. A determinate bar at 0% claims
    nothing has happened; an indeterminate one says the length is unknown, which
    is usually the truth.
  */
  it("tells an unknown length from a zero one", () => {
    expect(html(<Progress value={null} label="Uploading" />)).toContain('data-state="unknown"');
    const zero = html(<Progress value={0} label="Uploading" />);
    expect(zero).toContain('data-state="ready"');
    expect(zero).toContain("0%");
    expect(html(<Progress value={50} label="Uploading" />)).toContain("50%");
  });
});

describe("actions, and things that pass", () => {
  const items: MenuItem[] = [
    { id: "edit", label: "Edit", icon: "key" },
    { id: "delete", label: "Delete", destructive: true },
  ];

  /*
    ⚠️ A MENU IS ACTIONS ON ONE THING, NOT NAVIGATION. Destinations belong to the
    one navigation surface; a menu holding places is a second answer to "where am
    I", which is the failure the whole navigation section exists to prevent.
  */
  it("is a menu of actions, and marks the destructive one", () => {
    const out = html(<Menu label="Client actions" items={items} />);
    expect(out).toContain('role="menu"');
    expect([...out.matchAll(/role="menuitem"/g)]).toHaveLength(items.length);
    expect(out).toContain('data-tone="error"');
  });

  /*
    ⚠️ A FAILURE IN A TOAST IS A FAILURE THE READER MAY NEVER SEE, so `danger` is
    announced assertively and does not time out. Everything else is polite and
    goes away.
  */
  it("makes a failure persistent and assertive, and everything else polite", () => {
    const bad = html(<Toast tone="danger" title="Could not save" />);
    expect(bad).toContain('role="alert"');
    expect(bad).toContain('aria-live="assertive"');
    expect(bad).toContain('data-persistent=""');

    const good = html(<Toast tone="success" title="Saved" />);
    expect(good).toContain('role="status"');
    expect(good).toContain('aria-live="polite"');
    expect(good).not.toContain("data-persistent");
  });

  /* ⚠️ A toast is where an undo can still exist — after this, it is gone. */
  it("carries an undo when there is one", () => {
    expect(html(<Toast tone="info" title="Archived" undo={{ label: "Undo", onUndo: () => undefined }} />)).toContain("Undo");
  });

  /*
    ⚠️ A TOOLTIP IS UNREACHABLE BY TOUCH, so it may never carry the only copy of
    anything. It is attached by `aria-describedby` so a screen reader gets it,
    and the sheet shows it on focus as well as hover — a keyboard would otherwise
    never see it at all.
  */
  it("attaches the hint to what it describes", () => {
    const out = html(<Tooltip hint="Credits reset monthly"><span>1,204</span></Tooltip>);
    const id = /aria-describedby="([^"]+)"/.exec(out)![1];
    expect(out).toContain(`id="${id}"`);
    expect(out).toContain('role="tooltip"');
  });

  it("names what it is waiting for", () => {
    expect(html(<Spinner label="Loading clients" />)).toContain('aria-label="Loading clients"');
    expect(html(<Spinner label="x" />)).toContain('role="status"');
  });

  /* ⚠️ Disclosure is for detail somebody may not need — never for a fault. */
  it("opens on demand and can start open", () => {
    expect(html(<Disclosure title="Advanced">x</Disclosure>)).not.toContain("open=");
    expect(html(<Disclosure title="Advanced" open>x</Disclosure>)).toContain("open=");
  });

  it("separates with a rule only when space would be ambiguous", () => {
    expect(html(<Divider />)).toContain('role="separator"');
    expect(html(<Divider label="or" />)).toContain("or");
  });
});

describe("the reading surfaces name no colour and no timing", () => {
  const every = [
    html(<Breadcrumbs trail={trail} />), html(<Steps steps={stages} at="a" />),
    html(<Pagination page={2} pages={4} />), html(<Stat label="A" value="1" />),
    html(<Progress value={20} label="x" />), html(<Toast tone="warning" title="Careful" />),
    html(<Menu label="m" items={[{ id: "a", label: "A" }]} />), html(<Spinner label="x" />),
  ].join("");

  it("emits no literal colour, duration or curve", () => {
    expect(every).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(every).not.toMatch(/\b(rgb|rgba|hsl|oklch)\s*\(/i);
    expect(every).not.toMatch(/cubic-bezier|\b\d+m?s\b/);
  });
});
