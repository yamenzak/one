/**
 * THE REFERENCE BUILD — the prototype the scale was measured from.
 *
 * ⚠️ NOT SHIPPED CODE, AND NOTHING MAY IMPORT IT. Plain HTML and CSS, no
 * framework and no build step, kept beside the package so the numbers in
 * `docs/UI.md` §4 and §5 can be RE-DERIVED rather than trusted.
 *
 *     node build.mjs      # writes out.html — two screens, both hero variants
 *
 * ⚠️ THE DOCUMENT IS AUTHORITATIVE AND THIS IS A PHOTOGRAPH. Where the two
 * disagree, this is the stale one. It exists so the next person can see the
 * target before writing a component — which is the step that was skipped the
 * first time, and the reason fifteen commits of parts never became a screen.
 */

import { writeFileSync } from "node:fs";
import { svg } from "./icons.mjs";
import { MOTION } from "./motion.mjs";
import { SKY_CSS, SKIES } from "./sky.mjs";
import { tokensFor, groundFor, DEFAULT_BRAND } from "../src/brand.js";
import { accentOn, inkOn } from "../src/ground.js";
import { oklchToRgb, toHex } from "../src/colour.js";

/* ═══ THE SYSTEM, AS NUMBERS ═══ measured off the reference, at 390pt. */
const SYS = `
:root{
  /* ── type: FOUR sizes and one hero. Everything on a screen is one of these. */
  --t-hero:34px; --t-page:26px; --t-body:14px; --t-sub:12px; --t-meta:10px;
  --w-bold:700; --w-semi:600; --w-med:500;
  /* ── space: page inset, gap between cards, row inset. Three numbers. */
  --pad:17px; --gap:22px; --row-pad:16px;
  /* ── radius: card, tile, pill. */
  --r-card:16px; --r-tile:14px; --r-pill:999px;
  /* ── ground: black page, lifted card, translucent well. */
  --bg:#000; --card:rgb(255 255 255/.085); --well:rgb(255 255 255/.10); --well-hi:rgb(255 255 255/.16);
  --ink:#fff; --ink-2:rgb(255 255 255/.62); --ink-3:rgb(255 255 255/.38);
  --up:#3ddc84; --down:#ff5a5a;
}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--ink);font:400 var(--t-body)/1.35 -apple-system,"SF Pro Text",Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.phone{width:390px;height:844px;overflow:hidden;position:relative;background:var(--bg);display:flex;flex-direction:column}
.scroll{flex:1;overflow-y:auto;overflow-x:hidden}
.status{display:flex;justify-content:space-between;padding:14px 22px 0;font:600 15px/1 system-ui;color:var(--ink)}

/* ── HERO: full-bleed, never a card. Two grounds: a pattern, or a photograph. */
.scroll{position:relative}
/* The backdrop spans the whole scrolled height and is masked out, so nothing has
   an edge. --reach is how far down it survives: a photograph carries the whole
   screen, a pattern gives out just past the hero. */
.backdrop{position:absolute;inset:0;z-index:0;pointer-events:none;
  -webkit-mask-image:linear-gradient(to bottom,#000 var(--solid,28%),transparent var(--reach,60%));
  mask-image:linear-gradient(to bottom,#000 var(--solid,28%),transparent var(--reach,60%))}
/* One stated order: backdrop 0 · content 1 · floating chrome 3. */
.hero,.body{position:relative;z-index:1}
.dock{z-index:3}
.hero{padding:0 var(--pad) 28px}
.backdrop.pattern::before{content:"";position:absolute;inset:-6% -10% 0;
  background:radial-gradient(circle at 50% 30%,rgb(45 212 191/.55),transparent 62%);
  -webkit-mask-image:radial-gradient(circle,#000 1.1px,transparent 1.2px);mask-image:radial-gradient(circle,#000 1.1px,transparent 1.2px);
  -webkit-mask-size:9px 9px;mask-size:9px 9px;transform:rotate(-8deg) scale(1.25)}
.backdrop.photo::before{content:"";position:absolute;inset:0;
  background:
    radial-gradient(120% 80% at 20% 0%,#0b1c33,transparent 60%),
    radial-gradient(90% 60% at 85% 25%,#4a6f96,transparent 55%),
    radial-gradient(70% 50% at 40% 55%,#cfd8e3,transparent 60%),
    linear-gradient(160deg,#0a1420,#25405c 45%,#7d93ab 70%,#1a2735)}

/* ⚠️ Back/close is a circle in the corner, not a bar. The hero owns the top. */
.nav{display:flex;justify-content:space-between;align-items:center;padding:8px 0 0}
.circ{width:40px;height:40px;border-radius:var(--r-pill);background:var(--well);color:var(--ink);display:grid;place-items:center;border:0;cursor:pointer}
.pill-btn{height:44px;padding:0 20px;border-radius:var(--r-pill);background:var(--well);color:var(--ink);font-weight:var(--w-semi);font-size:var(--t-body);line-height:1;border:0;display:inline-flex;align-items:center;gap:8px;cursor:pointer}

.hero-title{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:44px;font-weight:var(--w-bold);font-size:var(--t-page);line-height:1.1;letter-spacing:-.02em}
.hero-stack{text-align:center;margin-top:34px;display:flex;flex-direction:column;align-items:center;gap:6px}
.eyebrow{display:block;font-weight:var(--w-med);font-size:var(--t-sub);line-height:1;color:var(--ink-2)}
/* ⚠️ The cents are smaller. A balance is read as a magnitude. */
.amount{display:block;font-weight:var(--w-bold);font-size:var(--t-hero);line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.amount i{font-size:.62em;font-style:normal}
.under{display:flex;align-items:center;gap:8px;color:var(--ink-2);font-weight:400;font-size:var(--t-sub);line-height:1}

/* ── QUICK ACTIONS: a circle in a WELL, label always beneath. Max four. */
.quick{display:flex;justify-content:center;gap:18px;margin-top:26px}
.quick button{background:none;border:0;display:flex;flex-direction:column;align-items:center;gap:10px;color:var(--ink);cursor:pointer;flex:1}
.quick .glyph{width:48px;height:48px;border-radius:var(--r-pill);background:var(--well);display:grid;place-items:center}
.quick span{white-space:nowrap;font-weight:var(--w-med);font-size:var(--t-sub);line-height:1}

/* ── SECTION + CARD: the card is a LIFT, never an outline. */
.body{padding:0 var(--pad) calc(76px + var(--pad));display:flex;flex-direction:column;gap:var(--gap)}
.sec-head{display:flex;align-items:baseline;justify-content:space-between;padding:0 4px 8px}
.sec-head h2{font-weight:var(--w-semi);font-size:var(--t-body);line-height:1}
.sec-head .sum{font-weight:400;font-size:var(--t-sub);line-height:1;color:var(--ink-2)}
.page-title{font-weight:var(--w-bold);font-size:var(--t-page);line-height:1.1;letter-spacing:-.02em;padding:24px 4px 16px}
.card,.notice{backdrop-filter:blur(24px) saturate(1.1);-webkit-backdrop-filter:blur(24px) saturate(1.1)}
.card{background:var(--card);border-radius:var(--r-card);overflow:hidden}

/* ── ROW: 64px, three columns. Two lead treatments, and the rule is the row's JOB. */
.row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:16px;
  min-height:52px;padding:11px var(--row-pad);width:100%;background:none;border:0;color:inherit;text-align:left;cursor:pointer;font:inherit}
.row + .row{box-shadow:inset 0 1px 0 rgb(255 255 255/.06)}
/* a SETTING → bare outline glyph */
.row .bare{color:var(--ink);display:grid;place-items:center;width:24px}
/* a THING with a value → filled colour medallion */
.med{width:36px;height:36px;border-radius:var(--r-pill);display:grid;place-items:center;color:#fff}
.row .txt{min-width:0}
.row .t{display:block;font-weight:var(--w-med);font-size:var(--t-body);line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row .d{display:block;font-weight:400;font-size:var(--t-sub);line-height:1.3;color:var(--ink-2);margin-top:2px}
.row .v{font-weight:var(--w-med);font-size:var(--t-body);line-height:1;font-variant-numeric:tabular-nums;text-align:right}
.row .v small{display:block;font-weight:400;font-size:var(--t-sub);line-height:1.4;margin-top:3px}
.row .chev{color:var(--ink-3)}
.up{color:var(--up)} .down{color:var(--down)}
.count{min-width:26px;height:26px;padding:0 8px;border-radius:var(--r-pill);background:#fff;color:#000;font-weight:var(--w-semi);font-size:var(--t-meta);line-height:26px;text-align:center}

/* ── NOTICE: an icon WELL, a title, a line, and a way to dismiss it. */
.notice{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:start;padding:16px 16px 18px;background:var(--card);border-radius:var(--r-card)}
.notice .w{width:40px;height:40px;border-radius:var(--r-pill);background:var(--well);display:grid;place-items:center}
.notice h3{font-weight:var(--w-semi);font-size:var(--t-body);line-height:1.3}
.notice p{font-weight:400;font-size:var(--t-sub);line-height:1.35;color:var(--ink-2);margin-top:2px}
.notice .x{background:none;border:0;color:var(--ink-3);cursor:pointer;padding:2px}

/* ── TILES: a small fixed set of destinations. Label BELOW the tile. */
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px 10px}
.tile{background:none;border:0;color:inherit;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;font:inherit}
.tile .sq{width:100%;aspect-ratio:1;border-radius:var(--r-tile);background:var(--well);display:grid;place-items:center}
.tile span{font-weight:var(--w-med);font-size:var(--t-sub);line-height:1}

.field{display:flex;align-items:center;gap:12px;height:52px;padding:0 16px;border-radius:var(--r-pill);background:var(--card);color:var(--ink-2);font-weight:400;font-size:var(--t-body);line-height:1}


/* ── the section patterns the archetypes are assembled from */
.face{display:grid;place-items:center;width:96px;height:96px;border-radius:var(--r-pill);
  background:#4ade80;color:#000;font-weight:700;font-size:34px}
.promo{display:flex;align-items:center;min-height:96px;padding:0 18px;
  background:linear-gradient(105deg,rgb(255 255 255/.14),rgb(255 255 255/.05))}
/* ⚠️ THE HEADER IS INSIDE ONLY ON A FEED, where the card IS the section rather
   than a list the section contains. Everywhere else it sits outside. */
.card.inset{padding:14px 0 4px}
.card-head{display:flex;align-items:center;gap:6px;padding:0 var(--row-pad) 8px}
.card-head h2{font-weight:600;font-size:var(--t-body)}
.card-head svg{opacity:.45}
.card-more{padding:10px 0 12px;text-align:center;font-weight:500;font-size:var(--t-body)}
.seg{display:flex;gap:4px;margin:2px var(--row-pad) 12px;padding:3px;border-radius:var(--r-pill);background:var(--well)}
.seg button{flex:1;border:0;background:none;color:var(--ink-2);font:inherit;font-size:var(--t-sub);
  font-weight:500;padding:7px 0;border-radius:var(--r-pill);cursor:pointer;
  transition:background var(--t-move) var(--e-out),color var(--t-move) var(--e-out)}
.seg button[aria-current]{background:var(--well-hi);color:var(--ink)}
/* ⚠️ A horizontal scroller is the ONE place content leaves the page inset, so the
   first item lines up with everything above it and the last hints at more. */
.scroller{display:flex;gap:14px;overflow-x:auto;padding:0 var(--row-pad) 14px;scrollbar-width:none}
.scroll-item{display:flex;flex-direction:column;align-items:center;gap:7px;flex:none;font-size:var(--t-sub);font-weight:500}

/* ── TAB BAR: a floating island. The page runs under it. */
.dock{position:absolute;left:50%;transform:translateX(-50%);bottom:14px;width:calc(100% - 2*var(--pad));
  display:flex;background:rgb(28 28 32/.86);backdrop-filter:blur(28px) saturate(1.2);-webkit-backdrop-filter:blur(28px) saturate(1.2);border-radius:var(--r-pill);padding:6px}
.dock button{flex:1;background:none;border:0;color:var(--ink-3);display:flex;flex-direction:column;align-items:center;gap:3px;
  padding:8px 0;border-radius:var(--r-pill);cursor:pointer;font:inherit;position:relative}
.dock button[aria-current]{background:rgb(255 255 255/.10);color:var(--ink)}
.dock span{font-weight:var(--w-med);font-size:var(--t-meta);line-height:1}
.dot{position:absolute;top:6px;right:26%;width:7px;height:7px;border-radius:var(--r-pill);background:var(--down)}
.stage{display:flex;gap:28px;padding:28px;background:#0e0e10;align-items:flex-start}
.swatch{position:relative;width:158px;height:104px;border-radius:14px;overflow:hidden;isolation:isolate}
.swatch[data-theme='dark']{background:#000}
.swatch[data-theme='light']{background:#f2f3f5}
.swatch span{position:absolute;z-index:1;left:8px;bottom:6px;font:500 10px ui-monospace,monospace;
  color:#fff;mix-blend-mode:difference;letter-spacing:.04em}
/* ⚠️ SCALE THE TOKENS, NOT THE FRAME. Zooming the whole phone would shrink the
   viewport too and prove nothing; the question is how big the type and controls
   are RELATIVE to a 390pt screen. */
.s88{--t-hero:38px;--t-page:30px;--t-body:15px;--t-sub:13px;--t-meta:11px;--pad:16px;--gap:14px;--r-card:18px}
.s88 .circ{width:44px;height:44px}
.s88 .quick .glyph{width:54px;height:54px}
.s88 .row{min-height:56px;padding:10px 16px}
.s88 .row .med{width:40px;height:40px}
.s88 .notice .w{width:44px;height:44px}
.s78{--t-hero:34px;--t-page:26px;--t-body:13.3px;--t-sub:12px;--t-meta:10px;--pad:14px;--gap:12px;--r-card:16px}
.s78 .circ{width:40px;height:40px}
.s78 .quick .glyph{width:48px;height:48px}
.s78 .row{min-height:50px;padding:9px 14px}
.s78 .med{width:36px;height:36px}
.s78 .notice .w{width:40px;height:40px}
.cap{color:#8b8d95;font:500 12px/1 ui-monospace,monospace;padding:0 0 10px 2px;letter-spacing:.06em;text-transform:uppercase}
`;


/*
  ⚠️ THE SKY'S COLOURS ARE DERIVED, NOT PICKED. Every value below comes from the
  brand engine — the tenant's ambience hue and their accent, re-lit — so a new
  tenant gets their own weather without anybody choosing a gradient.
*/
const skyVars = (brand, theme) => {
  const g = groundFor(brand, theme);
  const bloom = (l, c) => toHex(oklchToRgb({ l, c, h: brand.ambience.hue }));
  const lit = accentOn(g.accent, g.canvas);
  const a = (hex, alpha) => hex + Math.round(alpha * 255).toString(16).padStart(2, "0");
  return theme === "dark"
    ? { "--sky-deep": bloom(0.13, 0.03), "--sky-1": a(bloom(0.30, 0.06), .85),
        "--sky-2": a(toHex(oklchToRgb({ ...lit, l: 0.34, c: lit.c * 0.55 })), .8),
        "--sky-3": a(bloom(0.42, 0.05), .55), "--sky-bloom": bloom(0.62, 0.035) }
    : { "--sky-deep": bloom(0.90, 0.02), "--sky-1": a(bloom(0.80, 0.05), .9),
        "--sky-2": a(toHex(oklchToRgb({ ...lit, l: 0.74, c: lit.c * 0.45 })), .85),
        "--sky-3": a(bloom(0.86, 0.04), .6), "--sky-bloom": bloom(0.97, 0.02) };
};
/* ⚠️ Three tenants chosen to be AWKWARD, not pretty: a blue, a green whose hue
   collides with the success tone, and a mid-lightness saturated orange — the case
   a hand-tuned palette fails, because it carries neither near-white nor near-dark
   as a legible fill. */
const TENANTS = [
  DEFAULT_BRAND,
  { ...DEFAULT_BRAND, accent: "#0b7a5a", ambience: { hue: 155, intensity: 0.045 } },
  { ...DEFAULT_BRAND, accent: "#e8590c", ambience: { hue: 32, intensity: 0.05 } },
];

const skyFor = (brand, theme, cls) =>
  `.${cls}{${Object.entries(skyVars(brand, theme)).map(([k, v]) => `${k}:${v}`).join(";")}}`;

const bar = () => `<div class="status"><span>12:52</span><span>5G ▪▪▪ 53</span></div>`;
const row = (o) => `<button class="row">
  ${o.med ? `<span class="med" style="background:${o.med}">${svg(o.icon,20)}</span>` : `<span class="bare">${svg(o.icon,20)}</span>`}
  <span class="txt"><span class="t">${o.t}</span>${o.d?`<span class="d">${o.d}</span>`:""}</span>
  ${o.v ? `<span class="v">${o.v}</span>` : o.count ? `<span class="count">${o.count}</span>` : `<span class="chev">${svg("chevron",16)}</span>`}
</button>`;

/* ══ SCREEN 1 — a pattern hero over a menu. */
const security = `<div class="phone" data-enter><div class="status"><span>12:52</span><span>5G ▪▪▪ 53</span></div><div class="scroll">
  <div class="backdrop pattern" style="--solid:22%;--reach:52%"></div>
  <div class="hero">
    <div class="nav"><button class="circ">${svg("back",20)}</button><span></span></div>
    <div class="hero-title">${svg("shield",24)}<span>Security</span></div>
    <div class="quick">
      <button><span class="glyph">${svg("megaphone",21)}</span><span>Report fraud</span></button>
      <button><span class="glyph">${svg("card",21)}</span><span>Lost card</span></button>
      <button><span class="glyph">${svg("device",21)}</span><span>Lost device</span></button>
    </div>
  </div>
  <div class="body" style="padding-top:20px">
    <div class="notice">
      <span class="w">${svg("phone",20)}</span>
      <span><h3>Stay safe from scam calls</h3><p>We'll notify you if the caller isn't us</p></span>
      <button class="x">${svg("close",16)}</button>
    </div>
    <div class="card">
      ${row({icon:"face",t:"Wealth protection",d:"With Street mode"})}
      ${row({icon:"hidden",t:"Hidden from view"})}
    </div>
    <div class="card">
      ${row({icon:"cardlock",t:"Card security"})}
      ${row({icon:"link",t:"Linked wallets"})}
      ${row({icon:"swap",t:"Payments"})}
      ${row({icon:"gauge",t:"Limits"})}
      ${row({icon:"payees",t:"Payees"})}
    </div>
    <div class="card">
      ${row({icon:"privacy",t:"Privacy"})}
      ${row({icon:"key",t:"Sign-in & Passcode"})}
    </div>
  </div>
</div></div>`;

/* ══ SCREEN 2 — a photo hero over accounts. */
const home = `<div class="phone" data-enter><div class="status"><span>12:52</span><span>5G ▪▪▪ 53</span></div><div class="scroll">
  <div class="backdrop photo" style="--solid:34%;--reach:100%"></div>
  <div class="hero" style="padding-bottom:24px">
    <div class="nav" style="gap:10px">
      <span class="circ" style="background:#4ade80;color:#000;font-weight:700;font-size:17px;line-height:1">AL</span>
      <span class="field" style="flex:1;height:48px;background:rgb(255 255 255/.14)">${svg("search",20)} Search</span>
      <button class="circ" style="width:48px;height:48px">${svg("chart",22)}</button>
      <button class="circ" style="width:48px;height:48px">${svg("card",22)}</button>
    </div>
    <div class="hero-stack">
      <span class="eyebrow">Personal · EUR</span>
      <span class="amount">€1,216<i>.90</i></span>
      <span class="under">${svg("bank",18)} DE29 1001 0178 4770 4207 58</span>
    </div>
    <div class="quick">
      <button><span class="glyph">${svg("plus",21)}</span><span>Add money</span></button>
      <button><span class="glyph">${svg("shuffle",21)}</span><span>Move</span></button>
      <button><span class="glyph">${svg("bank",21)}</span><span>Details</span></button>
      <button><span class="glyph">${svg("more",21)}</span><span>More</span></button>
    </div>
  </div>
  <div class="body" style="padding-top:20px">
    <div class="card">
      ${row({icon:"coins",med:"#5b8def",t:"Cash",v:"€1,264"})}
      ${row({icon:"invest",med:"#2fa8e0",t:"Invest",d:"Invest for as little as €1"})}
      ${row({icon:"crypto",med:"#a855f7",t:"Crypto",d:"Invest for as little as €1"})}
      ${row({icon:"link",med:"#22d3ee",t:"Linked",d:"Link external accounts"})}
    </div>
    <div>
      <div class="sec-head"><h2>Yesterday</h2><span class="sum">+12,01 points</span></div>
      <div class="card">
        ${row({icon:"card",med:"#16a34a",t:"Uber Eats",d:"22:02",v:'−€16.44'})}
        ${row({icon:"card",med:"#f97316",t:"Thu Ha Duong",d:"16:35",v:'−€24.10'})}
        ${row({icon:"card",med:"#dc2626",t:"Rewe",d:"12:06",v:'−€8.72'})}
      </div>
    </div>
    <div class="tiles">
      <button class="tile"><span class="sq">${svg("swap",21)}</span><span>Send</span></button>
      <button class="tile"><span class="sq">${svg("bank",21)}</span><span>Bank</span></button>
      <button class="tile"><span class="sq">${svg("card",21)}</span><span>Card</span></button>
      <button class="tile"><span class="sq">${svg("more",21)}</span><span>More</span></button>
    </div>
    
  </div>
  </div>
  <div class="scrim" data-sheet hidden></div>
  <div class="sheet" data-sheet hidden>
    <div class="grab"></div>
    <div style="padding:0 14px 6px"><div class="sec-head"><h2>Move money</h2></div></div>
    ${["Between accounts","To a person","To a bank"].map((t,i)=>`<button class="row"><span class="bare">${svg("swap",20)}</span><span class="txt"><span class="t">${t}</span></span><span class="chev">${svg("chevron",16)}</span></button>`).join("")}
  </div>
  <nav class="dock" style="--at:0">
    <button aria-current="page">${svg("home",22)}<span>Home</span></button>
    <button>${svg("chart",22)}<span>Invest</span></button>
    <button>${svg("swap",22)}<span>Payments</span><i class="dot"></i></button>
    <button>${svg("hex",22)}<span>Points</span></button>
  </nav>
</div>`;

/* ⚠️ Beside itself. It wrote to an absolute /tmp path while it lived in /tmp,
   which is a file that only works from the machine it was written on. */

/* ══ ARCHETYPE C — A TITLE PAGE. No hero: there is no one number and no topic,
      so the title is large, LEFT, and the page starts immediately. Search when
      the list is long enough to hunt through. Group headers sit OUTSIDE the card
      and carry the group's total. */
const ledger = `<div class="phone"><div class="status"><span>12:52</span><span>5G ▪▪▪ 53</span></div><div class="scroll">
  <div class="backdrop" data-sky="aurora" style="--solid:8%;--reach:38%"></div>
  <div class="hero" style="padding-bottom:6px">
    <div class="nav"><button class="circ">${svg("back",20)}</button><span></span></div>
    <h1 class="page-title">Transactions</h1>
    <div class="field">${svg("search",20)} Search</div>
  </div>
  <div class="body" style="padding-top:18px">
    ${[["Yesterday","+12,01 points",[["Uber Eats","22:02","+4,11","#16a34a"],["Thu Ha Duong","16:35","+6,37","#f97316"],["Rewe","12:06","+1,53","#dc2626"]]],
       ["8 Aug","+33,45 points",[["REWE.de","23:06","+3,49","#dc2626"],["Anthropic","22:53","+25,87","#111"],["Tropical Islands","19:04","+4,08","#0ea5e9"]]]]
      .map(([when,sum,rows]) => `<div>
        <div class="sec-head"><h2>${when}</h2><span class="sum">${sum}</span></div>
        <div class="card">${rows.map(([t,d,v,c]) => row({icon:"card",med:c,t,d,v:`${v} points`})).join("")}</div>
      </div>`).join("")}
  </div>
</div></div>`;

/* ══ ARCHETYPE D — AN IDENTITY PAGE. Centred, because it is about one person
      rather than a list. A close and one action, the face at LARGE, the name,
      the handle — then the same grouped menu as any other settings surface. */
const identity = `<div class="phone"><div class="status"><span>12:52</span><span>5G ▪▪▪ 53</span></div><div class="scroll">
  <div class="backdrop" data-sky="aurora" style="--solid:14%;--reach:62%"></div>
  <div class="hero" style="padding-bottom:10px">
    <div class="nav"><button class="circ">${svg("close",20)}</button>
      <button class="pill-btn">${svg("hex",18)} Upgrade</button></div>
    <div class="hero-stack" style="margin-top:22px;gap:4px">
      <span class="face">AL</span>
      <span style="font-weight:700;font-size:26px;letter-spacing:-.02em;padding-top:10px">Ada Lovelace</span>
      <span class="under">@ada ${svg("hex",14)}</span>
    </div>
  </div>
  <div class="body" style="padding-top:16px">
    <div class="card promo"><div><div style="font-weight:700;font-size:20px">Premium</div>
      <div style="opacity:.7;font-size:var(--t-sub);padding-top:2px">View plan benefits ›</div></div></div>
    <div class="card">
      ${row({icon:"payees",t:"Invite friends",d:"Earn €70 or more"})}
      ${row({icon:"megaphone",t:"Inbox",count:5})}
      ${row({icon:"bank",t:"Account details"})}
      ${row({icon:"shield",t:"Security",count:1})}
      ${row({icon:"privacy",t:"Privacy"})}
    </div>
  </div>
</div></div>`;

/* ══ ARCHETYPE E — A FEED PAGE. No hero at all: it is a stack of independent
      sections, each carded with its own header INSIDE and its own way in. This is
      the one layout where a header sits inside the card, because the card IS the
      section rather than a list the section contains. */
const feed = `<div class="phone"><div class="status"><span>12:52</span><span>5G ▪▪▪ 53</span></div><div class="scroll">
  <div class="backdrop" data-sky="grid" style="--solid:6%;--reach:30%"></div>
  <div class="hero" style="padding-bottom:0">
    <div class="nav" style="gap:10px">
      <span class="circ" style="background:#4ade80;color:#000;font-weight:700;font-size:15px">AL</span>
      <span class="field" style="flex:1;height:44px">${svg("search",18)} Search</span>
      <button class="circ" style="width:40px;height:40px">${svg("chart",20)}</button>
    </div>
  </div>
  <div class="body" style="padding-top:18px">
    <div class="card inset">
      <div class="card-head"><h2>Recommended</h2>${svg("chevron",16)}</div>
      ${row({icon:"invest",med:"#111",t:"NVIDIA",d:"41,25% expected return",v:'$218.78<small class="down">▾ 2,32%</small>'})}
      ${row({icon:"invest",med:"#2563eb",t:"Microsoft",d:"27,69% expected return",v:'$504.05<small class="up">▴ 0,81%</small>'})}
      <div class="card-more">See all</div>
    </div>
    <div class="card inset">
      <div class="card-head"><h2>Watchlist</h2>${svg("chevron",16)}</div>
      ${row({icon:"invest",med:"#111",t:"NVIDIA",d:"NVDA",v:'$218.78<small class="down">▾ 2,31%</small>'})}
      ${row({icon:"invest",med:"#7f1d1d",t:"Vanguard S&P 500",d:"VUAA",v:'€129.78<small class="up">▴ 0,03%</small>'})}
    </div>
    <div class="card inset">
      <div class="card-head"><h2>Top movers</h2>${svg("chevron",16)}</div>
      <div class="seg"><button aria-current="page">Gainers</button><button>Losers</button></div>
      <div class="scroller">${[["BWMN","#065f46"],["MTEN","#1d4ed8"],["VREX","#0e7490"],["HZO","#b91c1c"]]
        .map(([t,c]) => `<div class="scroll-item"><span class="med" style="background:${c};width:52px;height:52px">${svg("chart",22)}</span><span>${t}</span></div>`).join("")}</div>
    </div>
  </div>
</div></div>`;

writeFileSync(new URL("out.html", import.meta.url),`<!doctype html><meta charset="utf8"><style>${SYS}${MOTION}${SKY_CSS}\n${TENANTS.map((b,i)=>["dark","light"].map((th)=>skyFor(b,th,`sky-${i}-${th}`)).join("\n")).join("\n")}\n${skyFor(TENANTS[0],"dark","phone")}</style>
<body><div class="stage">
<div><div class="cap">B · topic</div>${security}</div>
<div><div class="cap">A · crown</div>${home}</div>
<div><div class="cap">C · title</div>${ledger}</div>
<div><div class="cap">D · identity</div>${identity}</div>
<div><div class="cap">E · feed</div>${feed}</div>
</div>
<div class="stage" style="flex-direction:column;gap:18px">
${TENANTS.map((t, ti) => `
<div class="cap">tenant ${ti + 1} — every sky, both themes</div>
<div style="display:flex;gap:10px;flex-wrap:wrap">
${["dark","light"].flatMap((th) => SKIES.map((sky) => `
  <div class="swatch sky-${ti}-${th}" data-theme="${th}">
    <div class="backdrop" data-sky="${sky}" style="--solid:70%;--reach:100%"></div>
    <span>${sky} · ${th}</span>
  </div>`)).join("")}
</div>`).join("")}
</div></body>`);
console.log("wrote out.html");
