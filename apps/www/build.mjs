/**
 * Mossa marketing site generator — dependency-free. Emits a single
 * SEO-complete landing page + the design tokens, matching DESIGN.md's tonal
 * dark aesthetic. Content lives inline; the app lives at mossa.4dl.app.
 */

import { mkdirSync, writeFileSync, cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "dist");
mkdirSync(dist, { recursive: true });

const APP_URL = "https://mossa.4dl.app";

const FEATURES = [
  ["🗂️", "One roster, real scope", "Owners see everything; trainers see only their assigned clients. Multi-trainer, multi-tenant, and secure by construction."],
  ["🏋️", "Plans clients actually follow", "Build workouts block by block or let AI draft from a client's intake. Publish, and they train against it with PR tracking and rest timers."],
  ["🍽️", "Nutrition without the friction", "Barcode, web food search, quick entry, and coach-set macro targets from a proper TDEE calculator."],
  ["✨", "An AI suite that pays its way", "Plan drafts, food parsing, check-in summaries — metered against your credits, transparently, at cost-plus."],
  ["💳", "Your Stripe, your money", "Sell packages on your own connected Stripe account. We take zero markup on what your clients pay you."],
  ["📈", "Progress that tells a story", "Streaks, adherence, tonnage, body-fat trends, and a retention radar that flags clients before they drift."],
];

const PLANS = [
  ["Free", "$0", ["1 seat", "3 clients", "Core coaching"]],
  ["Solo", "$29/mo", ["1 seat", "25 clients", "AI suite + Stripe", "500 AI credits"]],
  ["Studio", "$79/mo", ["4 seats", "100 clients", "Supplements + labs", "Branding + front desk", "2,500 AI credits"]],
  ["Team", "$199/mo", ["15 seats", "400 clients", "API + exports", "10,000 AI credits"]],
];

const css = `
:root{--bg:#0b0c0e;--s1:#16181b;--s2:#1e2126;--fg:#e8eaed;--mut:#9aa0a6;--acc:#6dd3c2;--acc2:#a8c7fa}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--fg);font:16px/1.6 'Figtree',ui-sans-serif,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.wrap{max-width:1080px;margin:0 auto;padding:0 24px}
header{position:sticky;top:0;background:rgba(11,12,14,.8);backdrop-filter:blur(12px);z-index:10}
header .wrap{display:flex;align-items:center;justify-content:space-between;height:64px}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:20px}
.logo .m{width:32px;height:32px;border-radius:12px;background:var(--acc);color:var(--bg);display:grid;place-items:center;font-weight:900}
.btn{display:inline-block;background:var(--acc2);color:var(--bg);font-weight:700;padding:12px 24px;border-radius:999px;transition:opacity .2s}
.btn:hover{opacity:.9}
.btn.ghost{background:var(--s2);color:var(--fg)}
.hero{text-align:center;padding:100px 0 80px}
.hero h1{font-size:clamp(38px,7vw,68px);font-weight:800;letter-spacing:-.03em;line-height:1.05}
.hero .grad{background:linear-gradient(120deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p{color:var(--mut);font-size:clamp(17px,2.5vw,21px);max-width:620px;margin:24px auto 36px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}
.card{background:var(--s1);border-radius:28px;padding:28px}
.card .ico{font-size:32px;margin-bottom:12px}
.card h3{font-size:19px;margin-bottom:8px}
.card p{color:var(--mut);font-size:15px}
section{padding:60px 0}
section h2{font-size:clamp(28px,4vw,40px);font-weight:800;letter-spacing:-.02em;text-align:center;margin-bottom:12px}
section .sub{color:var(--mut);text-align:center;max-width:560px;margin:0 auto 40px}
.plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.plan{background:var(--s1);border-radius:24px;padding:24px;display:flex;flex-direction:column}
.plan.feat{outline:2px solid var(--acc)}
.plan h3{font-size:18px}
.plan .price{font-size:32px;font-weight:800;margin:8px 0 16px;font-variant-numeric:tabular-nums}
.plan ul{list-style:none;flex:1;margin-bottom:16px}
.plan li{color:var(--mut);font-size:14px;padding:6px 0;border-bottom:1px solid var(--s2)}
.cta{text-align:center;background:var(--s1);border-radius:32px;padding:64px 24px;margin:40px 0}
footer{color:var(--mut);text-align:center;padding:40px 0;font-size:14px}
@media(prefers-color-scheme:light){:root{--bg:#f3f5f9;--s1:#fff;--s2:#eef1f6;--fg:#1b1d21;--mut:#5f6368}}
`;

const feature = ([ico, h, p]) => `<div class="card"><div class="ico">${ico}</div><h3>${h}</h3><p>${p}</p></div>`;
const plan = ([name, price, items], feat) =>
  `<div class="plan${feat ? " feat" : ""}"><h3>${name}</h3><div class="price">${price}</div><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul><a class="btn${feat ? "" : " ghost"}" href="${APP_URL}">Get started</a></div>`;

const html = `<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mossa — coaching software for personal trainers &amp; studios</title>
<meta name="description" content="Mossa is the all-in-one platform for personal trainers and studios: build workout &amp; meal plans, track clients, sell packages on your own Stripe, and use an AI coaching suite. Multi-trainer, multi-tenant, mobile-first.">
<meta property="og:title" content="Mossa — coaching, organized">
<meta property="og:description" content="Build plans, track clients, sell packages, and use AI — all in one clean app your clients will actually use.">
<meta property="og:type" content="website">
<link rel="icon" href="/icon.svg">
<style>${css}</style>
</head><body>
<header><div class="wrap">
  <div class="logo"><span class="m">M</span> Mossa</div>
  <div><a class="btn ghost" href="${APP_URL}">Sign in</a></div>
</div></header>

<main>
<div class="hero wrap">
  <h1>Coaching, <span class="grad">organized</span>.</h1>
  <p>The all-in-one platform for personal trainers and studios. Build plans, track clients, sell packages on your own Stripe, and let AI do the busywork — in an app a 70-year-old can use.</p>
  <a class="btn" href="${APP_URL}">Start free — no card</a>
</div>

<section class="wrap">
  <h2>Everything your coaching business runs on</h2>
  <p class="sub">From the first client intake to the monthly payout — one system, no spreadsheets.</p>
  <div class="grid">${FEATURES.map(feature).join("")}</div>
</section>

<section class="wrap">
  <h2>Simple, honest pricing</h2>
  <p class="sub">Pay for seats and clients. AI is metered at cost-plus against credits — never a surprise. Zero markup on what your clients pay you.</p>
  <div class="plans">${PLANS.map((p, i) => plan(p, i === 2)).join("")}</div>
</section>

<div class="cta wrap">
  <h2>Your clients deserve better than a PDF.</h2>
  <p class="sub">Set up your studio in minutes. Passwordless sign-in, mobile-first, offline-ready.</p>
  <a class="btn" href="${APP_URL}">Get started free</a>
</div>
</main>

<footer><div class="wrap">Mossa · Built on Cloudflare · <a href="${APP_URL}">app</a></div></footer>
</body></html>`;

writeFileSync(join(dist, "index.html"), html);
writeFileSync(join(dist, "404.html"), html.replace("<title>Mossa", "<title>Not found — Mossa"));

const icon = join(__dirname, "..", "app", "public", "icon.svg");
if (existsSync(icon)) cpSync(icon, join(dist, "icon.svg"));

console.log("www built → dist/index.html");
