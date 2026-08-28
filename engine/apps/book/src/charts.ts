/**
 * THE CHARTS A WORKSPACE CAN START FROM — data, never code.
 *
 * ⚠️ A TEMPLATE IS A STARTING SET OF ROWS AND NOTHING ELSE. It is copied into a
 * workspace once and never rewritten; from that instant the accounts are theirs
 * to rename, nest, close and re-tag. Nothing in this file is consulted again
 * except by `book.top-up`, which only ever ADDS.
 *
 * ⚠️ `verified` IS THE HONEST FIELD AND MOST OF THEM ARE FALSE. These were
 * written from public convention rather than by an accountant in each country,
 * and the screen that offers them says so. Shipping them anyway is right BECAUSE
 * of the role seam: a wrong template gives a workspace unconventional names and
 * correct books, which is an afternoon of renaming rather than a migration.
 * Presenting them as authoritative would be the part that is not right.
 *
 * ⚠️ AND EVERY ONE OF THEM COVERS ALL SIXTEEN ROLES, checked by
 * `refuseChart` in this package's own suite. A template missing one is a
 * workspace whose first goods receipt has nowhere to post — found by a customer,
 * six months later, in whichever country nobody thought to check.
 *
 * ⚠️ WHAT IS DELIBERATELY SMALL: each of these is twenty-five to thirty-five
 * accounts, not a statutory chart. A business needs somewhere to put its first
 * hundred transactions on day one; the eight hundred rows a national standard
 * lists are what their accountant adds when there is something to add.
 */

import type { Chart } from "./roles.js";

/* ⚠️ ONE SHAPE FOR EVERY CHART, so the differences between countries are the
   differences and not the layout. Each is: what we own, what we owe, what the
   owners put in, what comes in, what goes out. */

/**
 * THE ONE THAT IS NEVER WRONG, ONLY GENERIC.
 *
 * ⚠️ IT IS THE FALLBACK FOR EVERY COUNTRY WITH NO TEMPLATE, which is most of
 * them, and it must therefore avoid every word that is local. "Sales tax" rather
 * than VAT or GST; "Customers owe us" rather than Trade Debtors or Accounts
 * Receivable. A generic chart in plain words is usable everywhere and idiomatic
 * nowhere, and that is the correct half to keep.
 */
const universal: Chart = {
  id: "universal",
  name: "Plain",
  said: "Plain English, no local words. Works anywhere.",
  verified: true,
  accounts: [
    { name: "What we own", type: "asset", children: [
      { name: "Bank", type: "asset", role: "bank" },
      { name: "Cash in hand", type: "asset", role: "cash" },
      { name: "Customers owe us", type: "asset", role: "receivable" },
      { name: "Stock on hand", type: "asset", role: "stock" },
      { name: "Sales tax we paid", type: "asset", role: "tax_input" },
      { name: "Not decided yet", type: "asset", role: "suspense" },
      { name: "Equipment", type: "asset" },
    ] },
    { name: "What we owe", type: "liability", children: [
      { name: "We owe suppliers", type: "liability", role: "payable" },
      { name: "Delivered, not yet invoiced", type: "liability", role: "stock_pending" },
      { name: "Sales tax we charged", type: "liability", role: "tax_output" },
      { name: "Wages owed", type: "liability" },
      { name: "Loans", type: "liability" },
    ] },
    { name: "What the owners put in", type: "equity", children: [
      { name: "Owner's capital", type: "equity" },
      { name: "Balances brought in", type: "equity", role: "opening" },
      { name: "Profit kept in the business", type: "equity", role: "retained" },
    ] },
    { name: "What comes in", type: "income", children: [
      { name: "Sales", type: "income", role: "income" },
      { name: "Other income", type: "income" },
    ] },
    { name: "What goes out", type: "expense", children: [
      { name: "Cost of what we sold", type: "expense", role: "cogs" },
      { name: "Other costs", type: "expense", role: "expense" },
      { name: "Discounts given", type: "expense", role: "discount" },
      { name: "Rounding", type: "expense", role: "rounding" },
      { name: "Wages", type: "expense" },
      { name: "Rent", type: "expense" },
      { name: "Bank charges", type: "expense" },
    ] },
  ],
};

/**
 * ⚠️ THE GULF VAT STATES SHARE A FRAMEWORK AND NOT A RATE. The GCC agreement
 * gave the Emirates, Saudi Arabia, Bahrain and Oman one VAT design with each
 * state setting its own rate — so the ACCOUNTS are the same shape and only the
 * number differs, which is why the rate is not in the chart at all. It belongs
 * to a tax rule, where it can change without touching anybody's books.
 */
const ae: Chart = {
  id: "ae",
  name: "United Arab Emirates",
  said: "VAT input and output, and a TRN on the party rather than the chart.",
  verified: false,
  accounts: [
    { name: "Assets", type: "asset", children: [
      { name: "Bank accounts", type: "asset", role: "bank" },
      { name: "Petty cash", type: "asset", role: "cash" },
      { name: "Accounts receivable", type: "asset", role: "receivable" },
      { name: "Inventory", type: "asset", role: "stock" },
      { name: "Input VAT recoverable", type: "asset", role: "tax_input" },
      { name: "Suspense", type: "asset", role: "suspense" },
      { name: "Fixed assets", type: "asset" },
    ] },
    { name: "Liabilities", type: "liability", children: [
      { name: "Accounts payable", type: "liability", role: "payable" },
      { name: "Goods received not invoiced", type: "liability", role: "stock_pending" },
      { name: "Output VAT payable", type: "liability", role: "tax_output" },
      /* ⚠️ END OF SERVICE IS A REAL LIABILITY HERE AND IN MOST OF THE GULF, and
         a chart that omits it is one an accountant adds by hand every time. */
      { name: "End of service benefits", type: "liability" },
      { name: "Accruals", type: "liability" },
    ] },
    { name: "Equity", type: "equity", children: [
      { name: "Share capital", type: "equity" },
      { name: "Opening balances", type: "equity", role: "opening" },
      { name: "Retained earnings", type: "equity", role: "retained" },
    ] },
    { name: "Revenue", type: "income", children: [
      { name: "Sales", type: "income", role: "income" },
      { name: "Other income", type: "income" },
    ] },
    { name: "Expenses", type: "expense", children: [
      { name: "Cost of sales", type: "expense", role: "cogs" },
      { name: "General expenses", type: "expense", role: "expense" },
      { name: "Discounts allowed", type: "expense", role: "discount" },
      { name: "Rounding differences", type: "expense", role: "rounding" },
      { name: "Salaries and wages", type: "expense" },
      { name: "Rent", type: "expense" },
      { name: "Bank charges", type: "expense" },
    ] },
  ],
};

const sa: Chart = {
  id: "sa",
  name: "Saudi Arabia",
  said: "VAT input and output, with ZATCA's e-invoicing in mind.",
  verified: false,
  accounts: [
    { name: "Assets", type: "asset", children: [
      { name: "Bank accounts", type: "asset", role: "bank" },
      { name: "Petty cash", type: "asset", role: "cash" },
      { name: "Accounts receivable", type: "asset", role: "receivable" },
      { name: "Inventory", type: "asset", role: "stock" },
      { name: "Input VAT recoverable", type: "asset", role: "tax_input" },
      { name: "Suspense", type: "asset", role: "suspense" },
      { name: "Fixed assets", type: "asset" },
    ] },
    { name: "Liabilities", type: "liability", children: [
      { name: "Accounts payable", type: "liability", role: "payable" },
      { name: "Goods received not invoiced", type: "liability", role: "stock_pending" },
      { name: "Output VAT payable", type: "liability", role: "tax_output" },
      { name: "End of service benefits", type: "liability" },
      { name: "Zakat and income tax payable", type: "liability" },
    ] },
    { name: "Equity", type: "equity", children: [
      { name: "Share capital", type: "equity" },
      { name: "Opening balances", type: "equity", role: "opening" },
      { name: "Retained earnings", type: "equity", role: "retained" },
    ] },
    { name: "Revenue", type: "income", children: [
      { name: "Sales", type: "income", role: "income" },
      { name: "Other income", type: "income" },
    ] },
    { name: "Expenses", type: "expense", children: [
      { name: "Cost of sales", type: "expense", role: "cogs" },
      { name: "General expenses", type: "expense", role: "expense" },
      { name: "Discounts allowed", type: "expense", role: "discount" },
      { name: "Rounding differences", type: "expense", role: "rounding" },
      { name: "Salaries and wages", type: "expense" },
      { name: "Rent", type: "expense" },
    ] },
  ],
};

/**
 * ⚠️ BRITISH ACCOUNTING SAYS DEBTORS AND CREDITORS, NOT RECEIVABLE AND PAYABLE,
 * and that is the whole of what differs — there is no prescribed chart, no
 * mandated numbering and no statutory layout below the statements themselves.
 * A template for the United Kingdom is therefore a vocabulary, which is exactly
 * the kind of difference the role seam exists to absorb.
 */
const gb: Chart = {
  id: "gb",
  name: "United Kingdom",
  said: "Debtors and creditors, VAT on both sides. No prescribed numbering.",
  verified: false,
  accounts: [
    { name: "Assets", type: "asset", children: [
      { name: "Bank current account", type: "asset", role: "bank" },
      { name: "Petty cash", type: "asset", role: "cash" },
      { name: "Trade debtors", type: "asset", role: "receivable" },
      { name: "Stock", type: "asset", role: "stock" },
      { name: "VAT on purchases", type: "asset", role: "tax_input" },
      { name: "Suspense", type: "asset", role: "suspense" },
      { name: "Fixed assets", type: "asset" },
    ] },
    { name: "Liabilities", type: "liability", children: [
      { name: "Trade creditors", type: "liability", role: "payable" },
      { name: "Goods received not invoiced", type: "liability", role: "stock_pending" },
      { name: "VAT on sales", type: "liability", role: "tax_output" },
      { name: "PAYE and National Insurance", type: "liability" },
      { name: "Corporation tax", type: "liability" },
    ] },
    { name: "Capital and reserves", type: "equity", children: [
      { name: "Called up share capital", type: "equity" },
      { name: "Opening balances", type: "equity", role: "opening" },
      { name: "Profit and loss reserve", type: "equity", role: "retained" },
    ] },
    { name: "Turnover", type: "income", children: [
      { name: "Sales", type: "income", role: "income" },
      { name: "Other operating income", type: "income" },
    ] },
    { name: "Expenditure", type: "expense", children: [
      { name: "Cost of sales", type: "expense", role: "cogs" },
      { name: "Administrative expenses", type: "expense", role: "expense" },
      { name: "Discounts allowed", type: "expense", role: "discount" },
      { name: "Rounding", type: "expense", role: "rounding" },
      { name: "Wages and salaries", type: "expense" },
      { name: "Rent and rates", type: "expense" },
    ] },
  ],
};

/**
 * ⚠️ THE UNITED STATES HAS NO VAT, AND THAT IS A STRUCTURAL DIFFERENCE RATHER
 * THAN A NAMING ONE. Sales tax is collected from the customer and remitted; it
 * is never recoverable on a purchase. So `tax_input` has no natural home — and
 * leaving the role out is not an option, because a posting rule may still name
 * it. It is tagged on a "Use tax" account, which is where the American answer to
 * the same question actually lives, and it will simply carry nothing for most
 * businesses.
 */
const us: Chart = {
  id: "us",
  name: "United States",
  said: "Sales tax collected, not reclaimed. Receivable and payable.",
  verified: false,
  accounts: [
    { name: "Assets", type: "asset", children: [
      { name: "Checking account", type: "asset", role: "bank" },
      { name: "Petty cash", type: "asset", role: "cash" },
      { name: "Accounts receivable", type: "asset", role: "receivable" },
      { name: "Inventory", type: "asset", role: "stock" },
      { name: "Use tax receivable", type: "asset", role: "tax_input" },
      { name: "Suspense", type: "asset", role: "suspense" },
      { name: "Property and equipment", type: "asset" },
    ] },
    { name: "Liabilities", type: "liability", children: [
      { name: "Accounts payable", type: "liability", role: "payable" },
      { name: "Received not billed", type: "liability", role: "stock_pending" },
      { name: "Sales tax payable", type: "liability", role: "tax_output" },
      { name: "Payroll liabilities", type: "liability" },
      { name: "Notes payable", type: "liability" },
    ] },
    { name: "Equity", type: "equity", children: [
      { name: "Owner's equity", type: "equity" },
      { name: "Opening balance equity", type: "equity", role: "opening" },
      { name: "Retained earnings", type: "equity", role: "retained" },
    ] },
    { name: "Income", type: "income", children: [
      { name: "Sales", type: "income", role: "income" },
      { name: "Other income", type: "income" },
    ] },
    { name: "Expenses", type: "expense", children: [
      { name: "Cost of goods sold", type: "expense", role: "cogs" },
      { name: "Operating expenses", type: "expense", role: "expense" },
      { name: "Discounts given", type: "expense", role: "discount" },
      { name: "Rounding", type: "expense", role: "rounding" },
      { name: "Payroll", type: "expense" },
      { name: "Rent", type: "expense" },
    ] },
  ],
};

/**
 * ⚠️ GERMANY NUMBERS ITS ACCOUNTS AND EVERYBODY USES THE SAME NUMBERS. SKR03 and
 * SKR04 are conventions rather than law, and they are followed so universally
 * that a German bookkeeper reads `1200` as the bank without looking. These codes
 * are SKR03's, which is the one most small businesses are on.
 *
 * ⚠️ AND THE CODES ARE STILL NEVER READ BY A POSTING RULE. They are printed,
 * sorted by and recognised; the posting names the role.
 */
const de: Chart = {
  id: "de",
  name: "Germany",
  said: "SKR03 numbering, Vorsteuer and Umsatzsteuer.",
  verified: false,
  accounts: [
    { name: "Aktiva", type: "asset", children: [
      { code: "1200", name: "Bank", type: "asset", role: "bank" },
      { code: "1000", name: "Kasse", type: "asset", role: "cash" },
      { code: "1400", name: "Forderungen aus Lieferungen und Leistungen", type: "asset", role: "receivable" },
      { code: "3980", name: "Vorräte", type: "asset", role: "stock" },
      { code: "1576", name: "Abziehbare Vorsteuer", type: "asset", role: "tax_input" },
      { code: "1590", name: "Verrechnungskonto", type: "asset", role: "suspense" },
      { code: "0400", name: "Anlagevermögen", type: "asset" },
    ] },
    { name: "Passiva", type: "liability", children: [
      { code: "1600", name: "Verbindlichkeiten aus Lieferungen und Leistungen", type: "liability", role: "payable" },
      { code: "1610", name: "Wareneingang ohne Rechnung", type: "liability", role: "stock_pending" },
      { code: "1776", name: "Umsatzsteuer", type: "liability", role: "tax_output" },
      { code: "1740", name: "Verbindlichkeiten aus Lohn und Gehalt", type: "liability" },
    ] },
    { name: "Eigenkapital", type: "equity", children: [
      { code: "0800", name: "Gezeichnetes Kapital", type: "equity" },
      { code: "9000", name: "Saldenvorträge", type: "equity", role: "opening" },
      { code: "0860", name: "Gewinnvortrag", type: "equity", role: "retained" },
    ] },
    { name: "Erträge", type: "income", children: [
      { code: "8400", name: "Erlöse", type: "income", role: "income" },
      { code: "8600", name: "Sonstige betriebliche Erträge", type: "income" },
    ] },
    { name: "Aufwendungen", type: "expense", children: [
      { code: "3400", name: "Wareneinsatz", type: "expense", role: "cogs" },
      { code: "4900", name: "Sonstige betriebliche Aufwendungen", type: "expense", role: "expense" },
      { code: "8700", name: "Erlösschmälerungen", type: "expense", role: "discount" },
      { code: "4970", name: "Rundungsdifferenzen", type: "expense", role: "rounding" },
      { code: "4100", name: "Löhne und Gehälter", type: "expense" },
      { code: "4210", name: "Miete", type: "expense" },
    ] },
  ],
};

/**
 * ⚠️ FRANCE IS THE ONE WHERE THE NUMBERS ARE LAW. The Plan Comptable Général
 * prescribes the account classes and much of the detail, so a French chart with
 * invented numbers is not merely unconventional — it is one an accountant has to
 * throw away. These are the PCG's own, which is the strongest argument for
 * shipping a template at all.
 */
const fr: Chart = {
  id: "fr",
  name: "France",
  said: "Plan Comptable Général numbering, which is prescribed rather than conventional.",
  verified: false,
  accounts: [
    { name: "Actif", type: "asset", children: [
      { code: "512", name: "Banque", type: "asset", role: "bank" },
      { code: "530", name: "Caisse", type: "asset", role: "cash" },
      { code: "411", name: "Clients", type: "asset", role: "receivable" },
      { code: "370", name: "Stocks de marchandises", type: "asset", role: "stock" },
      { code: "44566", name: "TVA déductible", type: "asset", role: "tax_input" },
      { code: "471", name: "Compte d'attente", type: "asset", role: "suspense" },
      { code: "215", name: "Immobilisations corporelles", type: "asset" },
    ] },
    { name: "Passif", type: "liability", children: [
      { code: "401", name: "Fournisseurs", type: "liability", role: "payable" },
      { code: "408", name: "Fournisseurs — factures non parvenues", type: "liability", role: "stock_pending" },
      { code: "44571", name: "TVA collectée", type: "liability", role: "tax_output" },
      { code: "421", name: "Personnel — rémunérations dues", type: "liability" },
    ] },
    { name: "Capitaux propres", type: "equity", children: [
      { code: "101", name: "Capital", type: "equity" },
      { code: "890", name: "Bilan d'ouverture", type: "equity", role: "opening" },
      { code: "110", name: "Report à nouveau", type: "equity", role: "retained" },
    ] },
    { name: "Produits", type: "income", children: [
      { code: "707", name: "Ventes de marchandises", type: "income", role: "income" },
      { code: "758", name: "Produits divers de gestion courante", type: "income" },
    ] },
    { name: "Charges", type: "expense", children: [
      { code: "607", name: "Achats de marchandises", type: "expense", role: "cogs" },
      { code: "628", name: "Charges diverses", type: "expense", role: "expense" },
      { code: "709", name: "Rabais, remises et ristournes accordés", type: "expense", role: "discount" },
      { code: "658", name: "Différences d'arrondis", type: "expense", role: "rounding" },
      { code: "641", name: "Rémunérations du personnel", type: "expense" },
      { code: "613", name: "Locations", type: "expense" },
    ] },
  ],
};

/**
 * ⚠️ INDIA IS THE CASE THAT PROVES THE ROLE SEAM, AND IT IS WORTH READING FOR
 * THAT ALONE. GST splits into central, state and integrated components — CGST,
 * SGST and IGST — so a workspace has THREE input accounts and three output ones,
 * and a design that tagged the role on each would have three accounts claiming to
 * be `tax_input`.
 *
 * ⚠️ THE ROLE GOES ON THE SUMMARY AND THE DETAIL HANGS UNDER IT. That is the
 * general answer for every country that splits a tax the rest of the world keeps
 * whole, and it needed no new mechanism at all — which is the test a seam passes
 * or fails.
 */
const inChart: Chart = {
  id: "in",
  name: "India",
  said: "GST split three ways, with the role on the summary and CGST, SGST and IGST under it.",
  verified: false,
  accounts: [
    { name: "Assets", type: "asset", children: [
      { name: "Bank accounts", type: "asset", role: "bank" },
      { name: "Cash in hand", type: "asset", role: "cash" },
      { name: "Sundry debtors", type: "asset", role: "receivable" },
      { name: "Stock in hand", type: "asset", role: "stock" },
      { name: "Input GST", type: "asset", role: "tax_input", children: [
        { name: "Input CGST", type: "asset" },
        { name: "Input SGST", type: "asset" },
        { name: "Input IGST", type: "asset" },
      ] },
      { name: "Suspense", type: "asset", role: "suspense" },
      { name: "Fixed assets", type: "asset" },
    ] },
    { name: "Liabilities", type: "liability", children: [
      { name: "Sundry creditors", type: "liability", role: "payable" },
      { name: "Goods received not billed", type: "liability", role: "stock_pending" },
      { name: "Output GST", type: "liability", role: "tax_output", children: [
        { name: "Output CGST", type: "liability" },
        { name: "Output SGST", type: "liability" },
        { name: "Output IGST", type: "liability" },
      ] },
      { name: "TDS payable", type: "liability" },
    ] },
    { name: "Capital account", type: "equity", children: [
      { name: "Capital", type: "equity" },
      { name: "Opening balances", type: "equity", role: "opening" },
      { name: "Reserves and surplus", type: "equity", role: "retained" },
    ] },
    { name: "Income", type: "income", children: [
      { name: "Sales", type: "income", role: "income" },
      { name: "Indirect income", type: "income" },
    ] },
    { name: "Expenses", type: "expense", children: [
      { name: "Purchases", type: "expense", role: "cogs" },
      { name: "Indirect expenses", type: "expense", role: "expense" },
      { name: "Discount allowed", type: "expense", role: "discount" },
      { name: "Rounding off", type: "expense", role: "rounding" },
      { name: "Salaries", type: "expense" },
      { name: "Rent", type: "expense" },
    ] },
  ],
};

const au: Chart = {
  id: "au",
  name: "Australia",
  said: "GST paid and collected, with PAYG withheld.",
  verified: false,
  accounts: [
    { name: "Assets", type: "asset", children: [
      { name: "Business bank account", type: "asset", role: "bank" },
      { name: "Petty cash", type: "asset", role: "cash" },
      { name: "Trade debtors", type: "asset", role: "receivable" },
      { name: "Inventory", type: "asset", role: "stock" },
      { name: "GST paid", type: "asset", role: "tax_input" },
      { name: "Suspense", type: "asset", role: "suspense" },
      { name: "Plant and equipment", type: "asset" },
    ] },
    { name: "Liabilities", type: "liability", children: [
      { name: "Trade creditors", type: "liability", role: "payable" },
      { name: "Goods received not invoiced", type: "liability", role: "stock_pending" },
      { name: "GST collected", type: "liability", role: "tax_output" },
      { name: "PAYG withholding payable", type: "liability" },
      { name: "Superannuation payable", type: "liability" },
    ] },
    { name: "Equity", type: "equity", children: [
      { name: "Owner's contribution", type: "equity" },
      { name: "Opening balances", type: "equity", role: "opening" },
      { name: "Retained earnings", type: "equity", role: "retained" },
    ] },
    { name: "Income", type: "income", children: [
      { name: "Sales", type: "income", role: "income" },
      { name: "Other income", type: "income" },
    ] },
    { name: "Expenses", type: "expense", children: [
      { name: "Cost of sales", type: "expense", role: "cogs" },
      { name: "Operating expenses", type: "expense", role: "expense" },
      { name: "Discounts given", type: "expense", role: "discount" },
      { name: "Rounding", type: "expense", role: "rounding" },
      { name: "Wages and salaries", type: "expense" },
      { name: "Rent", type: "expense" },
    ] },
  ],
};

const sg: Chart = {
  id: "sg",
  name: "Singapore",
  said: "GST input and output, in the vocabulary IRAS uses.",
  verified: false,
  accounts: [
    { name: "Assets", type: "asset", children: [
      { name: "Bank accounts", type: "asset", role: "bank" },
      { name: "Cash in hand", type: "asset", role: "cash" },
      { name: "Trade receivables", type: "asset", role: "receivable" },
      { name: "Inventories", type: "asset", role: "stock" },
      { name: "Input tax", type: "asset", role: "tax_input" },
      { name: "Suspense", type: "asset", role: "suspense" },
      { name: "Plant and equipment", type: "asset" },
    ] },
    { name: "Liabilities", type: "liability", children: [
      { name: "Trade payables", type: "liability", role: "payable" },
      { name: "Goods received not invoiced", type: "liability", role: "stock_pending" },
      { name: "Output tax", type: "liability", role: "tax_output" },
      { name: "CPF payable", type: "liability" },
    ] },
    { name: "Equity", type: "equity", children: [
      { name: "Share capital", type: "equity" },
      { name: "Opening balances", type: "equity", role: "opening" },
      { name: "Retained earnings", type: "equity", role: "retained" },
    ] },
    { name: "Revenue", type: "income", children: [
      { name: "Revenue", type: "income", role: "income" },
      { name: "Other income", type: "income" },
    ] },
    { name: "Expenses", type: "expense", children: [
      { name: "Cost of sales", type: "expense", role: "cogs" },
      { name: "Administrative expenses", type: "expense", role: "expense" },
      { name: "Discounts allowed", type: "expense", role: "discount" },
      { name: "Rounding", type: "expense", role: "rounding" },
      { name: "Staff costs", type: "expense" },
      { name: "Rent", type: "expense" },
    ] },
  ],
};

/**
 * EVERY CHART THIS DEPLOYMENT SHIPS.
 *
 * ⚠️ `universal` IS FIRST AND IS THE FALLBACK, so a country with no template of
 * its own gets something usable rather than an empty book. Adding a country is a
 * literal in this file and nothing else — no registration, no code path, and the
 * suite refuses it if it does not cover all sixteen roles.
 */
export const CHARTS: readonly Chart[] = [
  universal, ae, sa, gb, us, de, fr, inChart, au, sg,
];

/**
 * ⚠️ THE COUNTRY IS A DEFAULT AND NOT A CONSTRAINT. A freezone company in the
 * Emirates whose accountant thinks in a British chart picks the British one, and
 * nothing anywhere objects — which is why this resolves rather than validates.
 */
export const chartFor = (country: string | null | undefined): Chart => {
  const want = (country ?? "").trim().toLowerCase();
  return CHARTS.find((one) => one.id === want) ?? CHARTS[0]!;
};

export const chartById = (id: string | null | undefined): Chart | null =>
  CHARTS.find((one) => one.id === (id ?? "").trim().toLowerCase()) ?? null;
