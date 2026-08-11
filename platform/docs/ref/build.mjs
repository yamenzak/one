import { writeFileSync } from "node:fs";
import { svg } from "./icons.mjs";
import { MOTION } from "./motion.mjs";

/* ═══ THE SYSTEM, AS NUMBERS ═══ measured off the reference, at 390pt. */
const SYS = `
:root{
  /* ── type: FOUR sizes and one hero. Everything on a screen is one of these. */
  --t-hero:34px; --t-page:26px; --t-body:14px; --t-sub:12px; --t-meta:10px;
  --w-bold:700; --w-semi:600; --w-med:500;
  /* ── space: page inset, gap between cards, row inset. Three numbers. */
  --pad:14px; --gap:12px; --row-pad:14px;
  /* ── radius: card, tile, pill. */
  --r-card:16px; --r-tile:14px; --r-pill:999px;
  /* ── ground: black page, lifted card, translucent well. */
  --bg:#000; --card:#1b1b1e; --well:rgb(255 255 255/.10); --well-hi:rgb(255 255 255/.16);
  --ink:#fff; --ink-2:rgb(255 255 255/.62); --ink-3:rgb(255 255 255/.38);
  --up:#3ddc84; --down:#ff5a5a;
}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--ink);font:400 var(--t-body)/1.35 -apple-system,"SF Pro Text",Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.phone{width:390px;height:844px;overflow:hidden;position:relative;background:var(--bg);display:flex;flex-direction:column}
.scroll{flex:1;overflow-y:auto;overflow-x:hidden}
.status{display:flex;justify-content:space-between;padding:14px 22px 0;font:600 15px/1 system-ui;color:var(--ink)}

/* ── HERO: full-bleed, never a card. Two grounds: a pattern, or a photograph. */
.hero{position:relative;padding:0 var(--pad) 28px;overflow:hidden}
.hero.pattern::before{content:"";position:absolute;inset:-20% -10% 0;
  background:radial-gradient(circle at 50% 30%,rgb(45 212 191/.55),transparent 62%);
  -webkit-mask-image:radial-gradient(circle,#000 1.1px,transparent 1.2px);mask-image:radial-gradient(circle,#000 1.1px,transparent 1.2px);
  -webkit-mask-size:9px 9px;mask-size:9px 9px;transform:rotate(-8deg) scale(1.25)}
.hero.photo::before{content:"";position:absolute;inset:0;
  background:
    radial-gradient(120% 80% at 20% 0%,#0b1c33,transparent 60%),
    radial-gradient(90% 60% at 85% 25%,#4a6f96,transparent 55%),
    radial-gradient(70% 50% at 40% 55%,#cfd8e3,transparent 60%),
    linear-gradient(160deg,#0a1420,#25405c 45%,#7d93ab 70%,#1a2735)}
.hero>*{position:relative}
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
.body{padding:0 var(--pad) 24px;display:flex;flex-direction:column;gap:var(--gap)}
.sec-head{display:flex;align-items:baseline;justify-content:space-between;padding:0 4px 8px}
.sec-head h2{font-weight:var(--w-semi);font-size:var(--t-body);line-height:1}
.sec-head .sum{font-weight:400;font-size:var(--t-sub);line-height:1;color:var(--ink-2)}
.page-title{font-weight:var(--w-bold);font-size:var(--t-page);line-height:1.1;letter-spacing:-.02em;padding:24px 4px 16px}
.card{background:var(--card);border-radius:var(--r-card);overflow:hidden}

/* ── ROW: 64px, three columns. Two lead treatments, and the rule is the row's JOB. */
.row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:16px;
  min-height:50px;padding:9px var(--row-pad);width:100%;background:none;border:0;color:inherit;text-align:left;cursor:pointer;font:inherit}
.row + .row{box-shadow:inset 0 1px 0 rgb(255 255 255/.06)}
/* a SETTING → bare outline glyph */
.row .bare{color:var(--ink);display:grid;place-items:center;width:24px}
/* a THING with a value → filled colour medallion */
.row .med{width:36px;height:36px;border-radius:var(--r-pill);display:grid;place-items:center;color:#fff}
.row .txt{min-width:0}
.row .t{display:block;font-weight:var(--w-med);font-size:var(--t-body);line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row .d{display:block;font-weight:400;font-size:var(--t-sub);line-height:1.3;color:var(--ink-2);margin-top:2px}
.row .v{font-weight:var(--w-med);font-size:var(--t-body);line-height:1;font-variant-numeric:tabular-nums;text-align:right}
.row .v small{display:block;font-weight:400;font-size:var(--t-sub);line-height:1.4;margin-top:3px}
.row .chev{color:var(--ink-3)}
.up{color:var(--up)} .down{color:var(--down)}
.count{min-width:26px;height:26px;padding:0 8px;border-radius:var(--r-pill);background:#fff;color:#000;font-weight:var(--w-semi);font-size:var(--t-meta);line-height:26px;text-align:center}

/* ── NOTICE: an icon WELL, a title, a line, and a way to dismiss it. */
.notice{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:start;padding:16px;background:var(--card);border-radius:var(--r-card)}
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

/* ── TAB BAR: a floating island. The page runs under it. */
.dock{position:absolute;left:50%;transform:translateX(-50%);bottom:14px;width:calc(100% - 32px);
  display:flex;background:rgb(38 38 42/.92);backdrop-filter:blur(20px);border-radius:var(--r-pill);padding:6px}
.dock button{flex:1;background:none;border:0;color:var(--ink-3);display:flex;flex-direction:column;align-items:center;gap:3px;
  padding:8px 0;border-radius:var(--r-pill);cursor:pointer;font:inherit;position:relative}
.dock button[aria-current]{background:rgb(255 255 255/.10);color:var(--ink)}
.dock span{font-weight:var(--w-med);font-size:var(--t-meta);line-height:1}
.dot{position:absolute;top:6px;right:26%;width:7px;height:7px;border-radius:var(--r-pill);background:var(--down)}
.stage{display:flex;gap:28px;padding:28px;background:#0e0e10;align-items:flex-start}
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
.s78 .row .med{width:36px;height:36px}
.s78 .notice .w{width:40px;height:40px}
.cap{color:#8b8d95;font:500 12px/1 ui-monospace,monospace;padding:0 0 10px 2px;letter-spacing:.06em;text-transform:uppercase}
`;

const bar = () => `<div class="status"><span>12:52</span><span>5G ▪▪▪ 53</span></div>`;
const row = (o) => `<button class="row">
  ${o.med ? `<span class="med" style="background:${o.med}">${svg(o.icon,20)}</span>` : `<span class="bare">${svg(o.icon,20)}</span>`}
  <span class="txt"><span class="t">${o.t}</span>${o.d?`<span class="d">${o.d}</span>`:""}</span>
  ${o.v ? `<span class="v">${o.v}</span>` : o.count ? `<span class="count">${o.count}</span>` : `<span class="chev">${svg("chevron",16)}</span>`}
</button>`;

/* ══ SCREEN 1 — a pattern hero over a menu. */
const security = `<div class="phone" data-enter><div class="status"><span>12:52</span><span>5G ▪▪▪ 53</span></div><div class="scroll">
  <div class="hero pattern">
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
  <div class="hero photo" style="padding-bottom:24px">
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
    <div style="height:110px"></div>
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

writeFileSync("/tmp/rep/out.html",`<!doctype html><meta charset="utf8"><style>${SYS}${MOTION}</style>
<body><div class="stage">
<div><div class="cap">pattern hero · menu</div>${security}</div>
<div><div class="cap">photo hero · accounts</div>${home}</div>
</div></body>`);
console.log("ok");
