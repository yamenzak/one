/**
 * THE LIVE PAGE — every screen `@one/web` has, rendered from the real source.
 *
 * ⚠️ THE CONTROLS ARE IN A SPEED DIAL, NOT A BAR. A bar across the top is part of
 * the picture: it sets the page down by its own height, it puts a second visual
 * language above the one being judged, and every screenshot taken from it is of a
 * page that has something above it which the product never will. The dial is one
 * small round control in a corner; closed, the page is exactly the page.
 *
 * ⚠️ IT WRITES A COMPLETE DOCUMENT, DOCTYPE INCLUDED. A page served without one
 * renders in quirks mode — a table stops inheriting colour, percentage heights
 * resolve differently — and every judgement made from the picture is made about a
 * page nobody will ever see. That happened, and it invalidated a whole review.
 *
 * ⚠️ NOT SHIPPED CODE. Nothing in `src` may import this.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync } from "node:fs";
import { AccountHome, type AccountHomeProps } from "../src/account/home.js";
import { ACCOUNT_CSS } from "../src/account/home.css.js";
import { SKIES, SKY_CSS } from "../src/sky.css.js";

const noop = () => undefined;

/* ⚠️ ONE PERSON, PLAUSIBLE, WITH A REAL SPREAD ACROSS PRODUCTS. Lorem in a screen
   review is a way of not looking at it: names are what overflows, roles are what
   repeats, and a workspace in trouble is the row the layout exists to surface. */
const FULL: AccountHomeProps = {
  person: { name: "Nadia Haddad", email: "nadia@haddadstrength.com" },
  workspaces: [
    { tenantId: "t1", slug: "haddad", name: "Haddad Strength", product: "kova", role: "Owner" },
    { tenantId: "t2", slug: "barre", name: "Beirut Barre Collective", product: "kova", role: "Coach" },
    { tenantId: "t3", slug: "corniche", name: "Corniche Screens", product: "scena", role: "Owner", standing: { label: "Payment failed", urgent: true } },
    { tenantId: "t4", slug: "clinic", name: "Haddad Clinic", product: "tessa", role: "Member", standing: { label: "Trial · 6 days", urgent: false } },
  ],
  onGo: noop,
  onClose: noop,
};

/*
  ⚠️ THE STATES ARE ON THE PAGE, NOT DESCRIBED BESIDE IT. Not-answered-yet and
  answered-and-empty are different screens, and the second is the one a product
  ships without ever looking at — it is what a new person sees first.
*/
const CASES: readonly { readonly id: string; readonly label: string; readonly props: AccountHomeProps }[] = [
  { id: "full", label: "four", props: FULL },
  { id: "empty", label: "none", props: { ...FULL, workspaces: [] } },
  { id: "waiting", label: "waiting", props: { ...FULL, workspaces: null } },
  { id: "bare", label: "new", props: { person: { email: "b.okonkwo@gmail.com" }, workspaces: [], onGo: noop, onClose: noop } },
];

/*
  ⚠️ THE DIAL'S OWN LOOK IS DELIBERATELY NOT THE PRODUCT'S. It borrows no token
  and shares no class with the screen: a control that dresses like the thing being
  reviewed is a control that gets reviewed by mistake.
*/
const DIAL = `
.dial { position: fixed; inset-block-end: 18px; inset-inline-end: 18px; z-index: 999;
  display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
  font: 500 13px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dial-panel { display: none; flex-direction: column; gap: 12px; padding: 14px;
  border-radius: 16px; background: rgb(28 28 32 / 0.94); color: #f2f2f4;
  box-shadow: 0 10px 40px rgb(0 0 0 / 0.4); backdrop-filter: blur(12px);
  min-inline-size: 190px; }
.dial[data-open] .dial-panel { display: flex; }
.dial-group { display: flex; flex-direction: column; gap: 6px; }
.dial-group > span { color: #8a8a92; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
.dial-panel button { appearance: none; text-align: start; border: 0; border-radius: 9px;
  padding: 7px 10px; background: rgb(255 255 255 / 0.07); color: inherit; font: inherit; cursor: pointer; }
.dial-panel button[aria-pressed='true'] { background: #f2f2f4; color: #16161a; }
.dial-toggle { inline-size: 46px; block-size: 46px; border-radius: 999px; border: 0; cursor: pointer;
  background: rgb(28 28 32 / 0.94); color: #f2f2f4; font-size: 19px;
  box-shadow: 0 6px 22px rgb(0 0 0 / 0.35); backdrop-filter: blur(12px); }
.dial[data-open] .dial-toggle { background: #f2f2f4; color: #16161a; }
.case { display: none; }
.case[data-live] { display: block; }
@media print { .dial { display: none; } }
`;

const SCRIPT = `
const dial = document.querySelector('.dial');
document.querySelector('.dial-toggle').addEventListener('click', () => dial.toggleAttribute('data-open'));
document.addEventListener('click', (e) => {
  const b = e.target.closest('.dial-panel button');
  if (!b) return;
  [...b.parentElement.querySelectorAll('button')].forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  if (b.dataset.act === 'theme') document.documentElement.dataset.theme = b.dataset.value;
  if (b.dataset.act === 'sky') document.querySelectorAll('.sky').forEach((s) => { s.dataset.sky = b.dataset.value; });
  if (b.dataset.act === 'case') {
    document.querySelectorAll('.case').forEach((c) => c.toggleAttribute('data-live', c.dataset.case === b.dataset.value));
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dial.removeAttribute('data-open'); });
`;

const group = (act: string, label: string, options: readonly { readonly value: string; readonly label: string }[]) =>
  `<div class="dial-group"><span>${label}</span>${options
    .map((o, i) => `<button data-act="${act}" data-value="${o.value}" aria-pressed="${i === 0}">${o.label}</button>`)
    .join("")}</div>`;

const html = `<!doctype html><html lang="en" data-theme="dark"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Account — @one/web</title>
<style>${ACCOUNT_CSS}</style><style>${SKY_CSS}</style><style>${DIAL}</style>
</head><body>
${CASES.map((c, i) => `<div class="case" data-case="${c.id}"${i === 0 ? " data-live" : ""}>${
  renderToStaticMarkup(<AccountHome {...c.props} /> as never)
}</div>`).join("\n")}
<div class="dial">
  <div class="dial-panel">
    ${group("case", "state", CASES.map((c) => ({ value: c.id, label: c.label })))}
    ${group("sky", "sky", SKIES.map((s) => ({ value: s, label: s })))}
    ${group("theme", "theme", [{ value: "dark", label: "dark" }, { value: "light", label: "light" }])}
  </div>
  <button class="dial-toggle" type="button" aria-label="Preview controls">⚙</button>
</div>
<script>${SCRIPT}</script>
</body></html>`;

const out = process.argv[2] ?? "account.html";
writeFileSync(out, html);
process.stdout.write(`wrote ${out} — ${(html.length / 1024).toFixed(0)} kB\n`);
