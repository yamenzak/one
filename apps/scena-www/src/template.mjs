// @ts-check
/**
 * Renders one fully server-side landing page for a given locale. Output is a
 * complete, crawlable HTML document — real content in the markup, JS only
 * enhances. The <head> carries canonical + hreflang, Open Graph/Twitter, and
 * JSON-LD (Organization, SoftwareApplication, WebSite, FAQPage).
 */
import { SITE_URL, APP_URL, LOCALES, DEFAULT_LOCALE, localePrefix, localeUrl } from "./config.mjs";

const esc = (/** @type {any} */ s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (/** @type {any} */ s = "") => esc(s).replace(/"/g, "&quot;");

/* Brand marks (logo tile + canvas/CTA/sad mascots) are the real @scena/brand
   SVGs, built in build.mjs and passed in via `ctx` so this module stays pure. */



/* small stroke-icon set used in the mock + feature bullets */
const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M4 12l6 6L20 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M4 12h16M12 4v16"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/></svg>',
};
const SIDE_ICONS = [
  '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 20h8M12 17v3"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H4z"/><path d="M4 9h16M9 9v7"/></svg>',
  '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 9l5 3-5 3z"/></svg>',
  '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15l5-4 4 3 3-2 6 4"/><circle cx="9" cy="9" r="1.4"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="20" cy="16" r="3"/></svg>',
  '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M4 5h16v10H4z"/><path d="M8 19h8M9 15v4M15 15v4"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1.6"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M4 19V5M4 19h16"/><path d="M8 15l3-4 3 2 4-6"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>',
];
const LAYER_ICONS = [
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h7"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M4 12h16"/></svg>',
  '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>',
];

/** Build the JSON-LD @graph for a locale. */
function jsonLd(/** @type {import("./config.mjs").Locale} */ locale, /** @type {any} */ M) {
  const url = localeUrl(locale);
  const graph = [
    { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: "Scena", legalName: "Four Degree Labs", url: SITE_URL, logo: `${SITE_URL}/icons/icon-512.png` },
    { "@type": "WebSite", "@id": `${SITE_URL}/#site`, url: SITE_URL, name: "Scena", inLanguage: locale.code, publisher: { "@id": `${SITE_URL}/#org` } },
    {
      "@type": "SoftwareApplication", name: "Scena", applicationCategory: "BusinessApplication",
      operatingSystem: "Web", url, description: M.meta.description,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@type": "FAQPage", "@id": `${url}#faq`,
      mainEntity: M.faq.items.map((/** @type {any} */ it) => ({
        "@type": "Question", name: it.q,
        acceptedAnswer: { "@type": "Answer", text: it.a },
      })),
    },
  ];
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

function head(/** @type {import("./config.mjs").Locale} */ locale, /** @type {any} */ M) {
  const canonical = localeUrl(locale);
  const og = `${SITE_URL}/og.png`;
  const alternates = LOCALES.map((l) => `<link rel="alternate" hreflang="${l.code}" href="${localeUrl(l)}"/>`).join("\n    ");
  const xdefault = `<link rel="alternate" hreflang="x-default" href="${localeUrl(DEFAULT_LOCALE)}"/>`;
  const ogAlts = LOCALES.filter((l) => l.code !== locale.code).map((l) => `<meta property="og:locale:alternate" content="${l.ogLocale}"/>`).join("\n    ");
  const cairoPreload = locale.dir === "rtl" ? '\n    <link rel="preload" href="/fonts/cairo-arabic.woff2" as="font" type="font/woff2" crossorigin/>' : "";
  return `  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>${esc(M.meta.title)}</title>
    <meta name="description" content="${attr(M.meta.description)}"/>
    <meta name="keywords" content="${attr(M.meta.keywords)}"/>
    <link rel="canonical" href="${canonical}"/>
    ${alternates}
    ${xdefault}
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"/>
    <meta name="theme-color" content="#1a1030" media="(prefers-color-scheme: dark)"/>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
    <link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png"/>
    <link rel="apple-touch-icon" href="/apple-touch-icon.png"/>
    <link rel="manifest" href="/manifest.webmanifest"/>
    <meta property="og:type" content="website"/>
    <meta property="og:site_name" content="Scena"/>
    <meta property="og:title" content="${attr(M.meta.title)}"/>
    <meta property="og:description" content="${attr(M.meta.description)}"/>
    <meta property="og:url" content="${canonical}"/>
    <meta property="og:image" content="${og}"/>
    <meta property="og:image:width" content="1200"/>
    <meta property="og:image:height" content="630"/>
    <meta property="og:image:alt" content="${attr(M.meta.ogAlt)}"/>
    <meta property="og:locale" content="${locale.ogLocale}"/>
    ${ogAlts}
    <meta name="twitter:card" content="summary_large_image"/>
    <meta name="twitter:title" content="${attr(M.meta.title)}"/>
    <meta name="twitter:description" content="${attr(M.meta.description)}"/>
    <meta name="twitter:image" content="${og}"/>
    <link rel="preload" href="/fonts/hanken-grotesk.woff2" as="font" type="font/woff2" crossorigin/>
    <link rel="preload" href="/fonts/jetbrains-mono.woff2" as="font" type="font/woff2" crossorigin/>${cairoPreload}
    <link rel="stylesheet" href="/assets/styles.css"/>
    <script type="application/ld+json">${jsonLd(locale, M)}</script>
    <script>try{var t=localStorage.getItem('scena-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}</script>
  </head>`;
}

/** The language switcher menu. */
function langMenu(/** @type {import("./config.mjs").Locale} */ current, /** @type {any} */ M) {
  const items = LOCALES.map((l) => {
    const href = localePrefix(l) + "/";
    const cur = l.code === current.code ? " cur" : "";
    return `<a href="${href}" hreflang="${l.code}" lang="${l.code}" class="${cur.trim()}">${esc(l.name)}<span class="en">${l.code.toUpperCase()}</span></a>`;
  }).join("");
  return `<div class="lang">
        <button class="lang-btn" id="lang-btn" aria-haspopup="true" aria-expanded="false" aria-label="${attr(M.nav.language)}">${I.globe}<span>${esc(current.code.toUpperCase())}</span></button>
        <div class="lang-menu" id="lang-menu" role="menu">${items}</div>
      </div>`;
}

function productFrame(/** @type {any} */ M, /** @type {any} */ ctx) {
  const d = M.devices, c = M.channel, b = M.board, F = M.frame;
  const nav = F.nav, grp = F.groups;
  const sideRow = (/** @type {number} */ i, /** @type {string} */ extra = "", /** @type {string} */ goto = "") =>
    `<div class="side-item${extra}"${goto ? ` data-goto="${goto}"` : ""}>${SIDE_ICONS[i]} ${esc(nav[i])}</div>`;

  const rows = d.rows.map((/** @type {any} */ r, /** @type {number} */ i) => {
    const thumbs = ["", "background:linear-gradient(150deg,#f0a13d55,#e0603355)", "background:linear-gradient(150deg,#34d39955,#0f9d6b55)", "background:var(--secondary)", "background:linear-gradient(150deg,#8b3df055,#5b21b655)"];
    const codes = ["SCR-1A4F", "SCR-77C2", "SCR-90BE", "SCR-2E11", "SCR-51D0"];
    const res = ["1920×1080", "1080×1920", "1920×1080", "—", "2160×3840"];
    const st = r.on ? `<span class="st"><span class="dot on"></span>${esc(d.online)}</span>` : `<span class="st muted"><span class="dot off"></span>${esc(d.offline)}</span>`;
    return `<tr><td><div class="cell-name"><span class="thumb" style="${thumbs[i]}"></span><div><b>${esc(r.name)}</b><div class="sub">${codes[i]}</div></div></div></td>
              <td>${st}</td><td class="${r.on ? "" : "muted"}">${esc(r.playing)}</td><td class="res">${res[i]}</td><td class="res">${esc(r.seen)}</td></tr>`;
  }).join("");

  const layers = c.layerNames.map((/** @type {string} */ n, /** @type {number} */ i) =>
    `<div class="layer${i === 2 ? " sel" : ""}">${LAYER_ICONS[i]} ${esc(n)}</div>`).join("");

  const promosJson = attr(JSON.stringify(c.promos));

  return `<div class="stage" id="product">
      <div class="stage-shadow"></div>
      <div class="wrap">
      <div class="frame reveal">
        <div class="frame-bar">
          <div class="traffic"><i></i><i></i><i></i></div>
          <div class="frame-url">${I.lock} scena.4dl.app</div>
        </div>
        <div class="appscroll"><div class="app">
          <aside class="side">
            <div class="side-top"><span class="mk">${ctx.logo}</span> Scena</div>
            <div class="side-nav">
              <div class="side-grp"><div class="glabel">${esc(grp[0])}</div>
                ${sideRow(0, " active", "devices")}
                ${sideRow(1, "", "channel")}
                ${sideRow(2)}${sideRow(3)}${sideRow(4)}${sideRow(5)}
              </div>
              <div class="side-grp"><div class="glabel">${esc(grp[1])}</div>
                ${sideRow(6, "", "board")}${sideRow(7)}${sideRow(8)}
              </div>
              <div class="side-grp"><div class="glabel">${esc(grp[2])}</div>
                ${sideRow(9)}${sideRow(10)}
              </div>
            </div>
            <div class="side-foot"><div class="side-user"><span class="av">M</span><div><div class="nm">Marisa Lund</div><div class="em">${esc(F.role)}</div></div></div></div>
          </aside>
          <div class="amain">
            <div class="atop">
              <div class="crumbs">${esc(M.frame.home)} <span class="sep">/</span> <b id="crumb">${esc(M.frame.devices)}</b></div>
              <div class="atabs">
                <button class="atab active" data-view="devices">${esc(M.frame.devices)}</button>
                <button class="atab" data-view="channel">${esc(M.frame.channel)}</button>
                <button class="atab" data-view="board">${esc(M.frame.board)}</button>
              </div>
            </div>
            <div class="abody">
              <section class="view show" data-v="devices">
                <div class="phead"><div><h3>${esc(d.title)}</h3><p>${esc(d.desc)}</p></div><div class="grow"></div>
                  <button class="btn btn-outline btn-sm" aria-label="${attr(d.pair)}">${I.plus}</button>
                  <button class="btn btn-primary btn-sm">${I.plus} ${esc(d.pair)}</button></div>
                <div class="stats">
                  <div class="stat"><div class="l">${esc(d.stats.devices)}</div><div class="n">12</div></div>
                  <div class="stat"><div class="l"><span class="dot on"></span>${esc(d.stats.online)}</div><div class="n g">11</div></div>
                  <div class="stat"><div class="l"><span class="dot off"></span>${esc(d.stats.offline)}</div><div class="n r">1</div></div>
                  <div class="stat"><div class="l">${esc(d.stats.channels)}</div><div class="n">4</div></div>
                </div>
                <table class="tbl"><thead><tr><th>${esc(d.cols.device)}</th><th>${esc(d.cols.status)}</th><th>${esc(d.cols.playing)}</th><th>${esc(d.cols.resolution)}</th><th>${esc(d.cols.seen)}</th></tr></thead>
                  <tbody>${rows}</tbody></table>
              </section>
              <section class="view" data-v="channel">
                <div class="editor">
                  <div class="layers"><div class="lh">${esc(c.layers)}</div>${layers}</div>
                  <div class="stagewrap">
                    <div class="canvas">
                      <div class="cscan"></div>
                      <div class="wclock"><small>${esc(c.clockLabel)}</small><span id="ed-clock">09:41</span></div>
                      <div class="wweather">☀ <span>24°</span></div>
                      <div class="wpromo"><div class="k">${esc(c.specialK)}</div>
                        <h4 id="ed-promo" data-promos="${promosJson}">${esc(c.promos[0][0])}</h4>
                        <p id="ed-promo-sub">${esc(c.promos[0][1])}</p></div>
                      <div class="sel-box"><i></i><i></i><i></i><i></i></div>
                      ${ctx.mascotCanvas}
                      <div class="wticker"><span>${esc(c.ticker)}</span></div>
                    </div>
                    <div class="timeline"><div class="tl-head"><span>${esc(c.timeline)}</span><span id="tl-pos">00:00</span></div>
                      <div class="tl-track"><div class="tl-playhead"></div>
                        <div class="tl-clip" style="flex:3;background:linear-gradient(90deg,#8b3df0,#6d28d9)">Specials</div>
                        <div class="tl-clip" style="flex:2;background:linear-gradient(90deg,#f0a13d,#e06033)">Menu</div>
                        <div class="tl-clip" style="flex:2.4;background:linear-gradient(90deg,#34d399,#0f9d6b)">Promo</div>
                        <div class="tl-clip" style="flex:1.6;background:linear-gradient(90deg,#4b8bf0,#3a63d6)">QR</div>
                      </div></div>
                  </div>
                  <div class="props"><div class="ph">${esc(c.props.title)}</div>
                    <div class="prop"><label>${esc(c.props.text)}</label><div class="fld">${esc(c.promos[0][0])}</div></div>
                    <div class="prop"><label>${esc(c.props.fontSize)}</label><div class="row"><div class="fld">26 px</div><div class="fld">800</div></div></div>
                    <div class="prop"><label>${esc(c.props.color)}</label><div class="swatches"><i class="on" style="background:oklch(0.58 0.17 300)"></i><i style="background:oklch(0.66 0.15 70)"></i><i style="background:oklch(0.6 0.14 155)"></i><i style="background:#fff"></i></div></div>
                    <div class="prop"><label>${esc(c.props.showFor)}</label><div class="fld">${esc(c.props.showForVal)}</div></div>
                    <div class="prop"><label>${esc(c.props.bind)}</label><div class="fld">Sheet › Specials!A2</div></div>
                  </div>
                </div>
              </section>
              <section class="view" data-v="board">
                <div class="board">
                  <div class="boardscreen">
                    <div class="bs-now"><div class="lab">${esc(b.nowServing)}</div><div class="no" id="bd-no">A-42</div><div class="ct" id="bd-ct" data-label="${attr(b.counter)}">${esc(b.counter)} 3</div></div>
                    <div class="bs-recent"><div class="rh"><span>${esc(M.boards.colTicket)}</span><span>${esc(b.counter)}</span></div>
                      <div id="bd-recent"><div class="rr"><span>A-41</span><span>2</span></div><div class="rr"><span>A-40</span><span>1</span></div><div class="rr"><span>A-39</span><span>3</span></div></div>
                    </div>
                  </div>
                  <div class="ctrl"><div><div class="ch">${esc(b.frontDesk)}</div><div class="cs">${esc(b.coordinator)}</div></div>
                    <div class="big-no" id="ctrl-no">A-42</div>
                    <div class="cbtns"><button class="btn btn-outline btn-sm" id="bd-recall">${esc(b.recall)}</button><button class="btn btn-primary btn-sm" id="bd-next">${I.next} ${esc(b.callNext)}</button></div>
                    <div class="stationrow"><span>${esc(b.counter)} 3</span><span class="badge ok"><span class="dot on"></span>${esc(b.serving)}</span></div>
                    <div class="stationrow"><span>${esc(b.counter)} 1</span><span class="badge">${esc(b.idle)}</span></div>
                    <div class="cs" style="text-align:center">${esc(b.hint)}</div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div></div>
      </div>
      </div>
    </div>`;
}

function body(/** @type {import("./config.mjs").Locale} */ locale, /** @type {any} */ M, /** @type {any} */ ctx) {
  const { logo, mascotCta, pricing } = ctx;
  const bullet = (/** @type {string} */ t) => `<div>${I.check} ${esc(t)}</div>`;
  const trust = M.trust.items.map((/** @type {string} */ t, /** @type {number} */ i) =>
    `<span><b>${esc(t)}</b></span>${i < M.trust.items.length - 1 ? '<span class="sep"></span>' : ""}`).join("");
  const widgets = M.widgets.items.map((/** @type {any} */ w) =>
    `<div class="wchip"><div class="big"${w.id ? ` id="${w.id}"` : ""}>${esc(w.big)}</div>${w.live ? `<div class="tag"><span class="dot on"></span>${esc(M.widgets.liveTag)}</div>` : ""}<div class="lbl">${esc(w.lbl)}</div></div>`).join("");
  const steps = M.how.steps.map((/** @type {any} */ s) =>
    `<div class="step"><div class="n">${esc(s.n)}</div><h4>${esc(s.h)}</h4><p>${esc(s.p)}</p></div>`).join("");
  // Pricing is built in build.mjs from the real plan seed + feature catalog.
  const plans = pricing.map((/** @type {any} */ p) => {
    const feats = p.bullets.map((/** @type {string} */ f) => `<li>${I.check}${esc(f)}</li>`).join("");
    const cls = p.popular ? "plan pop" : "plan";
    const tag = p.popular ? `<div class="tag">${esc(M.pricing.popular)}</div>` : "";
    const btn = p.popular ? "btn btn-primary" : "btn btn-outline";
    return `<div class="${cls}">${tag}<div class="pn">${esc(p.name)}</div><div class="cost">${esc(p.price)}<small> ${esc(p.per)}</small></div><div class="pd">${esc(p.tagline)}</div><ul>${feats}</ul><a class="${btn}" href="${APP_URL}">${esc(p.cta)}</a></div>`;
  }).join("");
  const faq = M.faq.items.map((/** @type {any} */ it, /** @type {number} */ i) =>
    `<details${i === 0 ? " open" : ""}><summary>${esc(it.q)}</summary><p>${esc(it.a)}</p></details>`).join("");
  const aiOut = M.fAi.out.map((/** @type {any} */ o, /** @type {number} */ i) =>
    `<div class="o${i < 2 ? " done" : ""}"><div class="k">${esc(o[0])}</div><div class="v">${esc(o[1])}</div></div>`).join("");
  const footCols = M.footer.cols.map((/** @type {any} */ col) =>
    `<div class="foot-col"><h5>${esc(col.title)}</h5>${col.links.map((/** @type {string} */ l) => `<a href="#">${esc(l)}</a>`).join("")}</div>`).join("");

  return `<body class="scena" lang="${locale.code}" dir="${locale.dir}">
  <a class="sr-only" href="#product">${esc(M.hero.ctaSecondary)}</a>
  <nav class="nav"><div class="wrap nav-in">
    <a class="brand" href="${localePrefix(locale)}/" aria-label="Scena — home"><span class="mk">${logo}</span> Scena</a>
    <div class="nav-links">
      <a href="#product">${esc(M.nav.product)}</a>
      <a href="#widgets">${esc(M.nav.widgets)}</a>
      <a href="#boards">${esc(M.nav.boards)}</a>
      <a href="#pricing">${esc(M.nav.pricing)}</a>
    </div>
    <div class="nav-right">
      ${langMenu(locale, M)}
      <button class="icon-btn" id="theme-toggle" aria-label="Toggle theme">${I.sun}</button>
      <a class="btn btn-ghost btn-sm nav-hide" href="${APP_URL}">${esc(M.nav.signin)}</a>
      <a class="btn btn-primary btn-sm" href="${APP_URL}">${esc(M.nav.startFree)}</a>
    </div>
  </div></nav>

  <main>
  <header class="hero"><div class="wrap">
    <span class="pill"><b><span class="dot on"></span>${esc(M.hero.liveBadge)}</b> ${esc(M.hero.pill)}</span>
    <h1 class="h1">${esc(M.hero.h1a)}<br><em>${esc(M.hero.h1b)}</em></h1>
    <p class="lede">${esc(M.hero.lede)}</p>
    <div class="hero-cta">
      <a class="btn btn-primary btn-lg" href="${APP_URL}">${esc(M.hero.ctaPrimary)}</a>
      <a class="btn btn-outline btn-lg" href="#product">${I.play} ${esc(M.hero.ctaSecondary)}</a>
    </div>
    <div class="undercta">${esc(M.hero.undercta)}</div>
  </div>
    ${productFrame(M, ctx)}
  </header>

  <div class="trust"><div class="wrap trust-in"><span class="lead">${esc(M.trust.lead)}</span>${trust}</div></div>

  <section class="section"><div class="wrap">
    <div class="sec-head ctr reveal"><div class="eyebrow">${esc(M.featuresHead.eyebrow)}</div><h2>${esc(M.featuresHead.h2)}</h2><p>${esc(M.featuresHead.p)}</p></div>
    <div class="frow reveal">
      <div class="fr-copy"><div class="eyebrow">${esc(M.fChannels.eyebrow)}</div><h3>${esc(M.fChannels.h3)}</h3><p>${esc(M.fChannels.p)}</p>
        <div class="fr-list">${M.fChannels.list.map(bullet).join("")}</div></div>
      <div class="fr-visual"><div class="fv-bar">${esc(M.fChannels.barLabel)}<span class="dots"><i></i><i></i><i></i></span></div>
        <div style="padding:14px"><div class="timeline" style="border:none;background:transparent;padding:0">
          <div class="tl-head"><span>${esc(M.fChannels.timeline)}</span><span>${esc(M.fChannels.publishing)}</span></div>
          <div class="tl-track" style="height:44px"><div class="tl-playhead"></div>
            <div class="tl-clip" style="flex:3;background:linear-gradient(90deg,#8b3df0,#6d28d9)">Specials</div>
            <div class="tl-clip" style="flex:2;background:linear-gradient(90deg,#f0a13d,#e06033)">Menu</div>
            <div class="tl-clip" style="flex:2.4;background:linear-gradient(90deg,#34d399,#0f9d6b)">Promo</div>
            <div class="tl-clip" style="flex:1.6;background:linear-gradient(90deg,#4b8bf0,#3a63d6)">QR</div></div></div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px">
            <div class="stat" style="padding:9px 11px"><div class="l">${esc(M.fChannels.onAir)}</div><div class="n" style="font-size:17px">${esc(M.fChannels.onAirVal)}</div></div>
            <div class="stat" style="padding:9px 11px"><div class="l">${esc(M.fChannels.drift)}</div><div class="n g" style="font-size:17px">${esc(M.fChannels.driftVal)}</div></div>
            <div class="stat" style="padding:9px 11px"><div class="l">${esc(M.fChannels.cache)}</div><div class="n" style="font-size:17px">${esc(M.fChannels.cacheVal)}</div></div>
          </div></div></div>
    </div>
    <div class="frow rev reveal">
      <div class="fr-copy"><div class="eyebrow">${esc(M.fAi.eyebrow)}</div><h3>${esc(M.fAi.h3)}</h3><p>${esc(M.fAi.p)}</p>
        <div class="fr-list">${M.fAi.list.map(bullet).join("")}</div></div>
      <div class="fr-visual"><div class="fv-bar">ai.generate<span class="dots"><i></i><i></i><i></i></span></div>
        <div class="ai-frag"><div class="ai-prompt">${esc(M.fAi.prompt)}<span class="cur"></span></div><div class="ai-out">${aiOut}</div></div></div>
    </div>
  </div></section>

  <section class="section" id="widgets"><div class="wrap">
    <div class="sec-head reveal"><div class="eyebrow">${esc(M.widgets.eyebrow)}</div><h2>${esc(M.widgets.h2)}</h2><p>${esc(M.widgets.p)}</p></div>
    <div class="fr-visual reveal"><div class="fv-bar">${esc(M.widgets.barLabel)}<span class="dots"><i></i><i></i><i></i></span></div><div class="wgrid">${widgets}</div></div>
  </div></section>

  <section class="section" id="boards"><div class="wrap">
    <div class="frow reveal" style="border:none">
      <div class="fr-copy"><div class="eyebrow">${esc(M.boards.eyebrow)}</div><h3>${esc(M.boards.h3)}</h3><p>${esc(M.boards.p)}</p>
        <div class="fr-list">${M.boards.list.map(bullet).join("")}</div>
        <div class="hero-cta" style="justify-content:flex-start;margin-top:20px"><a class="btn btn-outline" href="#product" id="to-board">${esc(M.boards.tryBtn)}</a></div></div>
      <div class="fr-visual"><div class="fv-bar">${esc(M.boards.barLabel)}<span class="dots"><i></i><i></i><i></i></span></div>
        <div style="padding:14px"><div class="boardscreen" style="min-height:210px">
          <div class="bs-now"><div class="lab">${esc(M.boards.nowServing)}</div><div class="no" style="font-size:64px">B-17</div><div class="ct">${esc(M.boards.room)} 2</div></div>
          <div class="bs-recent"><div class="rh"><span>${esc(M.boards.colTicket)}</span><span>${esc(M.boards.colRoom)}</span></div>
            <div class="rr"><span>B-16</span><span>4</span></div><div class="rr"><span>B-15</span><span>1</span></div><div class="rr"><span>B-14</span><span>2</span></div></div>
        </div></div></div>
    </div>
  </div></section>

  <section class="section"><div class="wrap">
    <div class="sec-head ctr reveal"><div class="eyebrow">${esc(M.how.eyebrow)}</div><h2>${esc(M.how.h2)}</h2></div>
    <div class="steps reveal">${steps}</div>
  </div></section>

  <section class="section" id="pricing"><div class="wrap">
    <div class="sec-head ctr reveal"><div class="eyebrow">${esc(M.pricing.eyebrow)}</div><h2>${esc(M.pricing.h2)}</h2><p>${esc(M.pricing.p)}</p></div>
    <div class="prices reveal">${plans}</div>
  </div></section>

  <section class="section"><div class="wrap">
    <div class="sec-head reveal"><div class="eyebrow">${esc(M.faq.eyebrow)}</div><h2>${esc(M.faq.h2)}</h2></div>
    <div class="faq reveal">${faq}</div>
  </div></section>

  <section class="section"><div class="wrap"><div class="cta reveal">
    <div><div class="eyebrow">${esc(M.cta.eyebrow)}</div><h2 style="margin-top:12px">${esc(M.cta.h2)}</h2><p>${esc(M.cta.p)}</p>
      <div class="hero-cta"><a class="btn btn-primary btn-lg" href="${APP_URL}">${esc(M.cta.primary)}</a><a class="btn btn-outline btn-lg" href="${APP_URL}">${esc(M.cta.secondary)}</a></div></div>
    <span class="cta-scena">${mascotCta}</span>
  </div></div></section>
  </main>

  <footer class="foot"><div class="wrap">
    <div class="foot-grid">
      <div><a class="brand" href="${localePrefix(locale)}/" style="font-size:17px"><span class="mk">${logo}</span> Scena</a>
        <p style="margin-top:12px;font-size:13.5px;max-width:32ch;color:var(--muted)">${esc(M.footer.tagline)}</p></div>
      ${footCols}
    </div>
    <div class="foot-base"><span>${esc(M.footer.copyright)}</span><span class="mono">position(t) = (t − T0) mod cycle</span></div>
  </div></footer>
  <script src="/assets/app.js" defer></script>
</body>`;
}

/** Render a complete HTML document for one locale. `ctx` carries the built brand
 *  SVGs + registry-derived pricing (see build.mjs). */
export function renderPage(/** @type {import("./config.mjs").Locale} */ locale, /** @type {any} */ M, /** @type {any} */ ctx) {
  return `<!doctype html>
<html lang="${locale.code}" dir="${locale.dir}">
${head(locale, M)}
${body(locale, M, ctx)}
</html>
`;
}

/** Render a branded, localized 404 page. Not indexed (noindex); links back to
 *  the locale's home. Cloudflare's `404-page` handling serves the nearest one. */
export function renderNotFound(/** @type {import("./config.mjs").Locale} */ locale, /** @type {any} */ M, /** @type {any} */ ctx) {
  const { logo, mascotSad } = ctx;
  const home = localePrefix(locale) + "/";
  const cairoPreload = locale.dir === "rtl" ? '\n    <link rel="preload" href="/fonts/cairo-arabic.woff2" as="font" type="font/woff2" crossorigin/>' : "";
  return `<!doctype html>
<html lang="${locale.code}" dir="${locale.dir}">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>${esc(M.notFound.title)} · Scena</title>
    <meta name="robots" content="noindex, follow"/>
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"/>
    <meta name="theme-color" content="#1a1030" media="(prefers-color-scheme: dark)"/>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
    <link rel="apple-touch-icon" href="/apple-touch-icon.png"/>
    <link rel="preload" href="/fonts/hanken-grotesk.woff2" as="font" type="font/woff2" crossorigin/>
    <link rel="preload" href="/fonts/jetbrains-mono.woff2" as="font" type="font/woff2" crossorigin/>${cairoPreload}
    <link rel="stylesheet" href="/assets/styles.css"/>
    <script>try{var t=localStorage.getItem('scena-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}</script>
  </head>
  <body class="scena" lang="${locale.code}" dir="${locale.dir}">
    <nav class="nav"><div class="wrap nav-in">
      <a class="brand" href="${home}" aria-label="Scena — home"><span class="mk">${logo}</span> Scena</a>
      <div class="nav-right">
        ${langMenu(locale, M)}
        <button class="icon-btn" id="theme-toggle" aria-label="Toggle theme">${I.sun}</button>
        <a class="btn btn-primary btn-sm" href="${APP_URL}">${esc(M.nav.startFree)}</a>
      </div>
    </div></nav>
    <main class="wrap" style="min-height:62vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding-top:64px;padding-bottom:64px">
      <div style="width:132px;margin-bottom:6px">${mascotSad}</div>
      <div class="eyebrow" style="justify-content:center">ERROR 404</div>
      <h1 class="h1" style="font-size:clamp(30px,5vw,52px);margin-top:14px">${esc(M.notFound.title)}</h1>
      <p class="lede">${esc(M.notFound.body)}</p>
      <div class="hero-cta"><a class="btn btn-primary btn-lg" href="${home}">${esc(M.notFound.home)}</a></div>
    </main>
    <script src="/assets/app.js" defer></script>
  </body>
</html>
`;
}
