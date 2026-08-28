/**
 * WHAT AN ACCOUNT IS FOR, AND WHY A POSTING RULE NEVER NAMES ONE.
 *
 * ⚠️ THE ROLE IS THE SEAM, AND IT IS THE WHOLE INTERNATIONAL DESIGN. A posting
 * rule says "debit `receivable`", never "debit Trade Debtors" and never "debit
 * 1400". A German workspace tags `1400 Forderungen aus L+L`, a British one tags
 * `Trade Debtors`, and a workspace that threw the template away and built its own
 * chart tags whatever it likes — and the posting code is identical in all three.
 *
 * ⚠️ WHICH IS WHAT MAKES A HALF-FINISHED COUNTRY TEMPLATE SAFE TO SHIP. A
 * template we got wrong produces a workspace with badly-named accounts and
 * CORRECT BOOKS: the names are wrong, the numbering may be unconventional, and a
 * local accountant will want changes — all of which are renames somebody makes in
 * an afternoon. In a system whose rules name accounts directly, the same mistake
 * is a migration. See `docs/BUSINESS.md`.
 *
 * ⚠️ AND THE FILE IS PURE, so every rule here is asserted against the shipped
 * charts rather than against a fixture somebody agreed with. A template that does
 * not cover every role is a workspace where the first goods receipt has nowhere
 * to post, and that has to be a red build rather than a 500 in six months.
 */

/* ------------------------------------------------------------------ roots --- */

/**
 * ⚠️ FIVE, AND A SIXTH IS NOT A NATIONAL CONVENTION — IT IS A FIGURE THAT
 * APPEARS ON NEITHER STATEMENT. A balance sheet is assets, liabilities and
 * equity; a profit-and-loss is income and expense. A workspace may name them
 * anything and nest anything under them; there is nowhere to print a sixth.
 */
export const ROOTS = ["asset", "liability", "equity", "income", "expense"] as const;
export type Root = (typeof ROOTS)[number];

/* ------------------------------------------------------------------ roles --- */

/**
 * EVERY ROLE A POSTING RULE CAN NAME.
 *
 * ⚠️ THE LIST IS CLOSED, AND THAT IS THE POINT. A role a template may leave out
 * is a role a posting has no account for, and the failure arrives as a receipt
 * that silently does not post. `refuseChart` refuses a template missing one.
 */
export const ROLES = [
  "receivable", "payable",
  "bank", "cash",
  "stock", "stock_pending",
  "cogs",
  "income", "expense",
  "tax_input", "tax_output",
  "rounding", "discount",
  "opening", "suspense", "retained",
  "exchange",
] as const;
export type Role = (typeof ROLES)[number];

/**
 * WHICH ROOT EACH ROLE MUST HANG UNDER.
 *
 * ⚠️ THIS IS ARITHMETIC, NOT TASTE. Money owed TO a business is an asset and
 * money owed BY it is a liability in every jurisdiction that has ever kept
 * books — so a template tagging `payable` on an asset is a template that would
 * put its own debts on the wrong side of a balance sheet, and nothing downstream
 * would notice.
 */
export const ROOT_OF: Readonly<Record<Role, Root>> = {
  receivable: "asset",
  payable: "liability",
  bank: "asset",
  cash: "asset",
  stock: "asset",
  /* ⚠️ THE GAP BETWEEN A DELIVERY AND ITS INVOICE, AND IT IS A DEBT. Goods are
     on the shelf and nobody has billed for them yet; the value is owed. Without
     this role a goods receipt has to either wait for paperwork or credit the
     supplier before they have asked — the first makes stock lie, the second
     makes the payables ledger lie. */
  stock_pending: "liability",
  cogs: "expense",
  income: "income",
  expense: "expense",
  /* ⚠️ TAX PAID IS MONEY THE AUTHORITY OWES BACK; TAX CHARGED IS MONEY OWED TO
     THEM. Two accounts on two sides, never one net column — a workspace has to
     be able to show each half to file at all. */
  tax_input: "asset",
  tax_output: "liability",
  /* ⚠️ ONE ACCOUNT FOR BOTH DIRECTIONS. Rounding gains and losses are pennies in
     both directions and separating them buys nothing but two figures to add up. */
  rounding: "expense",
  /* ⚠️ WHAT WAS GIVEN AWAY RATHER THAN EARNED, kept as an expense rather than
     netted off income — because "we sold 100 and discounted 12" and "we sold 88"
     are the same profit and different businesses. */
  discount: "expense",
  /* ⚠️ WHERE A BUSINESS'S EXISTING BALANCES LAND WHEN IT ARRIVES MID-LIFE.
     Nobody starts keeping books on the day they start trading. */
  opening: "equity",
  /* ⚠️ NOT AN ADMISSION OF DEFEAT — THE ALTERNATIVE TO A SILENT WRONG ANSWER.
     A posting whose rule cannot decide has to go somewhere findable. Without
     this it either refuses the operation that caused it — making one product's
     misconfiguration another product's outage — or it guesses, and a guessed
     account is a figure nobody can trace. */
  suspense: "asset",
  retained: "equity",
  /*
    ⚠️ ONE ACCOUNT FOR A GAIN AND A LOSS, AND IT IS AN EXPENSE. A rate moving
    against a business costs it money and a rate moving with it makes money, and
    the two are the same event in opposite directions — so separating them buys
    two figures somebody has to net off. Filed as an expense because that is
    where a negative reads correctly on a profit-and-loss: a credit balance here
    is a gain, and every accountant reads it that way.
  */
  exchange: "expense",
};

/* ----------------------------------------------------------------- a chart --- */

/** One account in a template. `children` nest under it and share its root. */
export interface Node {
  /**
   * ⚠️ OPTIONAL, AND NEVER READ BY A POSTING RULE. France's Plan Comptable
   * Général prescribes account numbers by law and Germany's SKR conventions are
   * followed by everyone; the United Kingdom and the United States prescribe
   * nothing at all. Shipping the numbers where they exist is help — depending on
   * them would make the two halves of the world different code.
   */
  readonly code?: string;
  readonly name: string;
  readonly type: Root;
  readonly role?: Role;
  readonly children?: readonly Node[];
}

export interface Chart {
  /** ⚠️ ISO-3166 alpha-2, lower case — or `universal`, which is the fallback. */
  readonly id: string;
  readonly name: string;
  readonly said: string;
  /**
   * ⚠️ WHETHER AN ACCOUNTANT IN THAT COUNTRY HAS ACTUALLY SEEN IT, AND IT IS
   * SHOWN TO THE PERSON CHOOSING. A template nobody has checked is worth
   * shipping — the role seam makes a wrong one a rename rather than a migration —
   * but it is NOT worth presenting as authoritative. A product that quietly
   * implies a local accountant signed this off is a product somebody files a
   * return from.
   */
  readonly verified: boolean;
  readonly accounts: readonly Node[];
}

/* ------------------------------------------------------------------ walking --- */

/** One row of a flattened chart: the node, its depth, and its parent's path. */
export interface Row {
  readonly node: Node;
  readonly depth: number;
  /** ⚠️ The names from the root down, which is what makes a row identifiable
     without an id the template does not have. */
  readonly path: readonly string[];
}

export const rowsOf = (chart: Chart): readonly Row[] => {
  const out: Row[] = [];
  const walk = (nodes: readonly Node[], depth: number, path: readonly string[]) => {
    for (const node of nodes) {
      out.push({ node, depth, path });
      if (node.children?.length) walk(node.children, depth + 1, [...path, node.name]);
    }
  };
  walk(chart.accounts, 0, []);
  return out;
};

/* ------------------------------------------------------------------- rules --- */

export interface Wrong {
  readonly of: string;
  readonly why: string;
}

/**
 * WHAT A TEMPLATE CAN GET WRONG, AND EVERY ONE OF THEM IS SILENT AT RUNTIME.
 *
 * ⚠️ A MISSING ROLE IS A WORKSPACE WHOSE FIRST RECEIPT CANNOT POST, and it would
 * be found by the customer rather than by us — six months after the template
 * shipped, in whichever country nobody thought to check.
 */
export function refuseChart(chart: Chart): readonly Wrong[] {
  const out: Wrong[] = [];
  const at = (of: string, why: string) => out.push({ of, why });
  const rows = rowsOf(chart);

  if (!rows.length) {
    at(chart.id, "has no accounts at all, so seeding from it leaves a workspace empty");
    return out;
  }

  /* --- every role, exactly once --- */
  const held = new Map<string, number>();
  for (const { node } of rows) {
    if (node.role) held.set(node.role, (held.get(node.role) ?? 0) + 1);
  }
  for (const role of ROLES) {
    const many = held.get(role) ?? 0;
    if (!many) {
      at(chart.id, `has no account for "${role}" — a posting naming it has nowhere to go`);
    } else if (many > 1) {
      at(chart.id, `tags "${role}" on ${many} accounts, and a role points at one`);
    }
  }
  for (const role of held.keys()) {
    if (!(ROLES as readonly string[]).includes(role)) {
      at(chart.id, `tags "${role}", which no posting rule can name`);
    }
  }

  /* --- a role sits under the root its arithmetic requires --- */
  for (const { node, path } of rows) {
    const wants = node.role ? ROOT_OF[node.role] : null;
    if (wants && node.type !== wants) {
      at([...path, node.name].join(" › "),
        `is tagged "${node.role}" and typed "${node.type}", and that role is ${wants}`);
    }
  }

  /* --- a child shares its parent's root --- */
  const nest = (nodes: readonly Node[], parent: Node | null, path: readonly string[]) => {
    for (const node of nodes) {
      if (parent && node.type !== parent.type) {
        at([...path, node.name].join(" › "),
          `is ${node.type} under a ${parent.type} — a subtotal cannot cross a statement`);
      }
      if (!node.name.trim()) at(path.join(" › ") || chart.id, "has an account with no name");
      if (node.children?.length) nest(node.children, node, [...path, node.name]);
    }
  };
  nest(chart.accounts, null, []);

  /* --- a code, where there is one, is unique --- */
  const codes = new Map<string, number>();
  for (const { node } of rows) {
    if (node.code) codes.set(node.code, (codes.get(node.code) ?? 0) + 1);
  }
  for (const [code, many] of codes) {
    if (many > 1) at(chart.id, `uses the code "${code}" ${many} times, and a code names one account`);
  }

  return out;
}

/* ------------------------------------------------------------------ topping --- */

/** ⚠️ Only what identifies an account across a seed — see `missing`. */
export interface Held {
  readonly name: string;
  readonly code?: string | null;
  readonly role?: string | null;
}

/**
 * WHAT A TEMPLATE HAS THAT A WORKSPACE'S CHART DOES NOT.
 *
 * ⚠️ ADDITIVE ONLY, AND THAT IS WHAT MAKES IT SAFE TO RUN ON A LIVE CHART. It
 * renames nothing, moves nothing and deletes nothing — the only thing the
 * operation reading this can do is add. That is what lets a workspace seeded
 * from a thin early template pick up the accounts we later learned its country
 * needs, without any risk to the chart it has been posting to for a year.
 *
 * ⚠️ AND THE MATCH IS ROLE, THEN CODE, THEN NAME, IN THAT ORDER. A role is
 * unique and is the strongest identity a template row has; a code is next; a
 * name is last because it is the field a workspace is most likely to have
 * changed — and a renamed account matched by name would be added a second time,
 * which is the one way an additive operation can still do harm.
 */
export const missing = (chart: Chart, held: readonly Held[]): readonly Node[] => {
  const roles = new Set(held.map((one) => one.role).filter(Boolean));
  const codes = new Set(held.map((one) => one.code).filter(Boolean));
  const names = new Set(held.map((one) => one.name.trim().toLowerCase()));

  return rowsOf(chart)
    .map(({ node }) => node)
    .filter((node) => {
      if (node.role) return !roles.has(node.role);
      if (node.code) return !codes.has(node.code);
      return !names.has(node.name.trim().toLowerCase());
    });
};
