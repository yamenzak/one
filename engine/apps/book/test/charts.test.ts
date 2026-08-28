/**
 * EVERY SHIPPED CHART, AGAINST THE RULE THAT WOULD REFUSE A NEW ONE.
 *
 * ⚠️ THIS IS THE TEST THAT MAKES "ADD A COUNTRY" A DATA CHANGE. A template
 * missing a role is a workspace whose first goods receipt has nowhere to post —
 * found by a customer, six months later, in whichever country nobody thought to
 * check — so it has to be a red build instead.
 */

import { describe, expect, it } from "vitest";
import { CHARTS, chartById, chartFor } from "../src/charts.js";
import {
  ROLES, ROOTS, ROOT_OF, missing, refuseChart, rowsOf,
  type Chart, type Node,
} from "../src/roles.js";

describe("every chart this deployment ships", () => {
  it("ships more than one, so the checks below are asked of something", () => {
    expect(CHARTS.length).toBeGreaterThan(1);
  });

  for (const chart of CHARTS) {
    describe(`${chart.name} (${chart.id})`, () => {
      it("passes every rule a new one would have to", () => {
        expect(refuseChart(chart)).toEqual([]);
      });

      /* ⚠️ ASKED SEPARATELY FROM `refuseChart` SO A FAILURE NAMES THE ROLE. The
         rule above reports a list; this says which country is missing what. */
      it("covers every role a posting rule can name", () => {
        const held = rowsOf(chart).map((row) => row.node.role).filter(Boolean);
        expect([...held].sort()).toEqual([...ROLES].sort());
      });

      it("says whether an accountant there has seen it", () => {
        expect(typeof chart.verified).toBe("boolean");
      });

      /* ⚠️ A CHART THAT IS ALL SUMMARY AND NO DETAIL IS A CHART SOMEBODY HAS TO
         BUILD ANYWAY. Twenty-five is not a statutory chart; it is enough to put
         a first hundred transactions somewhere. */
      it("holds enough accounts to be worth starting from", () => {
        expect(rowsOf(chart).length).toBeGreaterThanOrEqual(25);
      });
    });
  }
});

/* ------------------------------------------------------------- the rules --- */

const of = (over: Partial<Chart> = {}): Chart => ({
  id: "test", name: "Test", said: "A chart", verified: false,
  accounts: CHARTS[0]!.accounts, ...over,
});

/** ⚠️ The shipped universal chart with one node changed — see each case. */
const bent = (change: (node: Node) => Node | null): Chart => {
  const walk = (nodes: readonly Node[]): Node[] => nodes.flatMap((node) => {
    const next = change(node);
    if (!next) return [];
    return [{ ...next, ...(next.children ? { children: walk(next.children) } : {}) }];
  });
  return of({ accounts: walk(CHARTS[0]!.accounts) });
};

describe("what a chart can get wrong", () => {
  it("says nothing about a chart that is right", () => {
    expect(refuseChart(of())).toEqual([]);
  });

  /* ⚠️ THE ONE THAT MATTERS MOST. A missing role is silent until a posting. */
  it("refuses a chart that drops a role", () => {
    const said = refuseChart(bent((n) => (n.role === "suspense" ? null : n)))
      .map((w) => w.why).join("\n");
    expect(said).toContain('no account for "suspense"');
    expect(said).toContain("nowhere to go");
  });

  it("refuses a role tagged on two accounts", () => {
    const said = refuseChart(bent((n) => (n.role === "cash" ? { ...n, role: "bank" } : n)))
      .map((w) => w.why).join("\n");
    expect(said).toContain('tags "bank" on 2 accounts');
  });

  /*
    ⚠️ A PAYABLE ON THE ASSET SIDE WOULD PUT A BUSINESS'S DEBTS WHERE ITS
    PROPERTY GOES, and every statement after it would balance perfectly and be
    wrong. This is why `ROOT_OF` is arithmetic rather than taste.
  */
  it("refuses a role hanging under the wrong root", () => {
    const said = refuseChart(of({
      accounts: [{ name: "Wrong", type: "asset", role: "payable" }],
    })).map((w) => w.why).join("\n");
    expect(said).toContain("that role is liability");
  });

  it("refuses a child that crosses a statement", () => {
    const said = refuseChart(of({
      accounts: [{ name: "Assets", type: "asset", children: [
        { name: "Sales", type: "income" },
      ] }],
    })).map((w) => w.why).join("\n");
    expect(said).toContain("cannot cross a statement");
  });

  it("refuses one code on two accounts", () => {
    const said = refuseChart(of({
      accounts: [
        { code: "100", name: "One", type: "asset" },
        { code: "100", name: "Two", type: "asset" },
      ],
    })).map((w) => w.why).join("\n");
    expect(said).toContain('code "100" 2 times');
  });

  it("refuses a chart with nothing in it", () => {
    expect(refuseChart(of({ accounts: [] }))[0]?.why).toContain("no accounts at all");
  });
});

describe("the roots and the roles", () => {
  it("keeps five roots, because a sixth appears on no statement", () => {
    expect(ROOTS).toHaveLength(5);
  });

  it("gives every role exactly one root", () => {
    expect(Object.keys(ROOT_OF).sort()).toEqual([...ROLES].sort());
  });

  /* ⚠️ THE TWO SIDES OF TAX ARE TWO ACCOUNTS, never one net column — a workspace
     has to show each half to file at all. */
  it("puts tax paid and tax charged on opposite sides", () => {
    expect(ROOT_OF.tax_input).toBe("asset");
    expect(ROOT_OF.tax_output).toBe("liability");
  });

  /* ⚠️ THE GAP BETWEEN A DELIVERY AND ITS INVOICE IS A DEBT — see `roles.ts`. */
  it("makes what was delivered and not invoiced a liability", () => {
    expect(ROOT_OF.stock).toBe("asset");
    expect(ROOT_OF.stock_pending).toBe("liability");
  });
});

describe("choosing a chart", () => {
  it("finds the one for a country that has one", () => {
    expect(chartFor("ae").id).toBe("ae");
    expect(chartFor("AE").id).toBe("ae");
    expect(chartFor(" de ").id).toBe("de");
  });

  /* ⚠️ THE FALLBACK IS THE FEATURE. Most countries have no template, and an
     empty book is not an acceptable answer to any of them. */
  it("falls back to the plain one for every country that does not", () => {
    expect(chartFor("zz").id).toBe("universal");
    expect(chartFor(null).id).toBe("universal");
    expect(chartFor("").id).toBe("universal");
  });

  it("looks one up by id, and says so when there is none", () => {
    expect(chartById("gb")?.name).toBe("United Kingdom");
    expect(chartById("nowhere")).toBeNull();
  });
});

/* ------------------------------------------------------------- topping up --- */

describe("what a template has that a workspace lacks", () => {
  const chart = chartFor("universal");
  const everything = rowsOf(chart).map(({ node }) => ({
    name: node.name, code: node.code ?? null, role: node.role ?? null,
  }));

  it("finds nothing when the workspace already holds it all", () => {
    expect(missing(chart, everything)).toEqual([]);
  });

  it("finds everything when the workspace holds nothing", () => {
    expect(missing(chart, []).length).toBe(everything.length);
  });

  /*
    ⚠️ MATCHED BY ROLE FIRST, AND THIS IS THE CASE THAT PROVES WHY. A workspace
    renames "Bank" to "Barclays current account" on day one; matching by name
    would then add a second bank account every time anybody topped up, which is
    the one way an additive-only operation can still do harm.
  */
  it("does not add an account the workspace has renamed", () => {
    const renamed = everything.map((one) => (one.role === "bank"
      ? { ...one, name: "Barclays current account" } : one));
    expect(missing(chart, renamed)).toEqual([]);
  });

  it("adds an account the workspace genuinely does not have", () => {
    const without = everything.filter((one) => one.name !== "Rent");
    expect(missing(chart, without).map((n) => n.name)).toEqual(["Rent"]);
  });
});
