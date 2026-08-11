/**
 * THE LIVE PAGE — every screen `@one/web` has, rendered from the real source.
 *
 * ⚠️ IT WRITES A COMPLETE DOCUMENT, DOCTYPE INCLUDED. A page served without one
 * renders in quirks mode, and quirks mode is not a cosmetic difference: a table
 * stops inheriting colour, percentage heights resolve differently, and every
 * judgement made from the picture is made about a page nobody will ever see.
 * That happened, and it invalidated an entire review.
 *
 * ⚠️ NOT SHIPPED CODE. Nothing in `src` may import this. It exists so a screen
 * can be looked at — which, on the evidence, is the only check that finds the
 * defects that matter.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync } from "node:fs";
import { AccountHome, type AccountHomeProps } from "../src/account/home.js";
import { ACCOUNT_CSS } from "../src/account/home.css.js";

const noop = () => undefined;

/* ⚠️ ONE PERSON, PLAUSIBLE, WITH A REAL SPREAD ACROSS PRODUCTS. Lorem in a
   screen review is a way of not looking at it: names are the thing that
   overflows, roles are the thing that repeats, and a workspace in trouble is the
   row the whole layout exists to make findable. */
const FULL: AccountHomeProps = {
  person: { name: "Nadia Haddad", email: "nadia@haddadstrength.com" },
  workspaces: [
    { tenantId: "t1", slug: "haddad", name: "Haddad Strength", product: "kova", role: "Owner" },
    { tenantId: "t2", slug: "barre", name: "Beirut Barre Collective", product: "kova", role: "Coach" },
    { tenantId: "t3", slug: "corniche", name: "Corniche Screens", product: "scena", role: "Owner", standing: { label: "Payment failed", urgent: true } },
    { tenantId: "t4", slug: "clinic", name: "Haddad Clinic", product: "tessa", role: "Member", standing: { label: "Trial · 6 days", urgent: false } },
  ],
  security: { passkeys: 2, devices: 3 },
  units: "Metric",
  locale: "English",
  onGo: noop,
};

/*
  ⚠️ THE STATES ARE ON THE PAGE, NOT DESCRIBED BESIDE IT. Not-answered-yet and
  answered-and-empty are different screens, and the second is the one a product
  ships without ever looking at — it is what a new person sees first.
*/
const CASES: readonly { readonly id: string; readonly note: string; readonly props: AccountHomeProps }[] = [
  { id: "full", note: "Four workspaces across three products, one of them in trouble.", props: FULL },
  {
    id: "empty",
    note: "Answered, and empty — what somebody sees before their first invitation arrives.",
    props: { ...FULL, workspaces: [], security: undefined, units: undefined, locale: undefined },
  },
  {
    id: "unknown",
    note: "Not answered yet. A different screen from empty, and never the same one.",
    props: { ...FULL, workspaces: null },
  },
  {
    id: "bare",
    note: "No display name, no preferences set — the account as it exists one second after the first sign-in.",
    props: { person: { email: "b.okonkwo@gmail.com" }, workspaces: [], onGo: noop },
  },
];

const CHROME = `
.dev-bar { position: sticky; inset-block-start: 0; z-index: 10; display: flex; flex-wrap: wrap;
  gap: 6px; align-items: center; padding: 10px 20px; background: var(--card);
  border-block-end: 1px solid var(--line); }
.dev-bar b { font: 600 13px/1 ui-monospace, monospace; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--ink-quiet); margin-inline-end: 6px; }
.dev-bar button { appearance: none; border: 1px solid var(--edge); background: none; color: var(--ink-quiet);
  font: inherit; font-size: 13px; padding: 5px 12px; border-radius: 999px; cursor: pointer; }
.dev-bar button[aria-pressed='true'] { background: var(--ink); color: var(--page); border-color: var(--ink); }
.dev-note { max-inline-size: 640px; margin: 20px auto -8px; padding: 0 20px;
  color: var(--ink-quiet); font-size: 14px; }
.case { display: none; }
.case[data-live] { display: block; }
`;

const SCRIPT = `
document.addEventListener('click', (e) => {
  const b = e.target.closest('.dev-bar button');
  if (!b) return;
  [...b.parentElement.querySelectorAll('button')].forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  if (b.dataset.act === 'theme') document.documentElement.dataset.theme = b.dataset.value;
  if (b.dataset.act === 'case') {
    document.querySelectorAll('.case').forEach((c) => c.toggleAttribute('data-live', c.dataset.case === b.dataset.value));
  }
});
`;

const html = `<!doctype html><html lang="en" data-theme="light"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Account — @one/web</title>
<style>${ACCOUNT_CSS}</style><style>${CHROME}</style>
</head><body>
<div class="dev-bar">
  <b>case</b>
  ${CASES.map((c, i) => `<button data-act="case" data-value="${c.id}" aria-pressed="${i === 0}">${c.id}</button>`).join("")}
  <b style="margin-inline-start:14px">theme</b>
  <button data-act="theme" data-value="light" aria-pressed="true">light</button>
  <button data-act="theme" data-value="dark" aria-pressed="false">dark</button>
</div>
${CASES.map((c, i) => `<div class="case" data-case="${c.id}"${i === 0 ? " data-live" : ""}>
  <p class="dev-note">${c.note}</p>
  ${renderToStaticMarkup(<AccountHome {...c.props} /> as never)}
</div>`).join("\n")}
<script>${SCRIPT}</script>
</body></html>`;

const out = process.argv[2] ?? "account.html";
writeFileSync(out, html);
process.stdout.write(`wrote ${out} — ${(html.length / 1024).toFixed(0)} kB\n`);
