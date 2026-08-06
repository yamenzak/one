/**
 * Starter templates for the widget builder (§17) — premium, ready-made scenes so
 * an operator starts from a polished layout and tweaks, rather than a blank
 * canvas. Beyond convenience, the gallery is a *tour of the widget set*: across
 * the collection every widget type appears and every variant is shown off
 * (analog + digital clocks, all ticker modes, weather small/current/day/week,
 * now-playing full/card/bar/minimal, queue solo/recent/grid/strip, metric card/
 * ring/sideLabel, menu rows/leaders/cards, the four text variants, an HTML
 * embed, a transitioning stack, …), so operators discover what's possible.
 *
 * BRAND-FIRST: every scene is built on the widget theme tokens — surfaces use
 * `var(--w-surface)`, text `var(--w-fg)` / `var(--w-fg-muted)`, emphasis
 * `var(--w-accent)` — so a template automatically follows the tenant's brand.
 * The neutral dark ground + a soft accent glow carry the brand hue across the
 * whole canvas. An operator can always override any surface (Glass / Solid /
 * None) or colour per widget in the panel; the tokens are just the default.
 *
 * Data-bound widgets (ticker / weather / board / now-playing) are placed but
 * left unbound; the operator points them at a feed / location / board / channel
 * after applying.
 *
 * Each template is just a set of builder nodes. Applying one loads them onto the
 * canvas (a fresh profile, or replacing the current scene).
 */

import { defaultsFor } from "@scena/widgets";
import type { WNode, WType } from "./types.js";

let seq = 0;
/** Mint a node from registry defaults at a fixed rect, with style/config overrides. */
function node(type: WType, rect: [number, number, number, number], style: Record<string, unknown> = {}, config: Record<string, unknown> = {}, z = 10): WNode {
  const d = defaultsFor(type);
  seq += 1;
  return {
    id: `${type}_tpl${seq}`,
    type,
    x: rect[0], y: rect[1], w: rect[2], h: rect[3],
    rot: 0, z,
    scaleMode: d.scaleMode,
    style: { ...d.style, ...style },
    config: { ...d.config, ...config },
  };
}

/** A nested widget for a stack item (each stack item is a full widget). */
function item(id: string, type: WType, style: Record<string, unknown> = {}, config: Record<string, unknown> = {}) {
  return { id, widget: { type, style, config } };
}

export type TemplateCategory =
  | "Starter" | "Corporate" | "Events" | "Restaurant" | "Retail" | "Real estate" | "Fitness"
  | "Healthcare" | "Hospitality" | "Wayfinding" | "Weather" | "News" | "Sports" | "Finance";

// Ordered by how often each shows up in the field — everyday business screens
// first, broadcaster looks last. The gallery renders categories in this order.
export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  "Starter", "Corporate", "Events", "Restaurant", "Retail", "Real estate", "Fitness",
  "Healthcare", "Hospitality", "Wayfinding", "Weather", "News", "Sports", "Finance",
];

export interface Template {
  id: string;
  name: string;
  /** The channel/vibe it evokes, shown as a subtitle. */
  description: string;
  category: TemplateCategory;
  /** Optional accent for the gallery card chrome. */
  accent?: string;
  build: () => WNode[];
}

/* -------------------------------- tokens ---------------------------------- */
// The widget theme tokens — these make a template follow the tenant brand. See
// packages/manifest theme.ts + the player's injected widget-theme <style>.
const SURFACE = "var(--w-surface)";       // brand glass panel
const SURFACE2 = "var(--w-surface-2)";    // stronger glass
const FG = "var(--w-fg)";                 // primary text
const MUTED = "var(--w-fg-muted)";        // secondary text
const ACCENT = "var(--w-accent)";         // brand emphasis
const ACCENT2 = "var(--w-accent-2)";      // brand secondary
const TRANSP = "transparent";             // suppress a widget's default panel

// A calm, near-neutral dark ground. Brand comes from the accent glow + glass on
// top, so this stays out of the way and lets any brand hue read cleanly.
const GROUND = "oklch(0.15 0.01 265)";
const GROUND_DEEP = "oklch(0.11 0.008 265)";

/* -------------------------------- helpers --------------------------------- */

/** A full-screen background box, always at the bottom. */
const bg = (style: Record<string, unknown>) => node("box", [0, 0, 1920, 1080], style, {}, 0);

/** The default ground: a soft vertical wash from ground to deep. */
const ground = () => bg({ gradient: { from: GROUND, to: GROUND_DEEP, angle: 145 } });

/** A soft circular brand-accent glow — tints the whole scene with the brand hue. */
const glow = (x: number, y: number, d: number, opacity = 0.16, fill = ACCENT): WNode =>
  node("circle", [x, y, d, d], { fill, opacity }, {}, 1);

/** A reflow text node — fills its box and honours align + wrapping + fontSize,
 *  instead of the text widget's default uniform "scale-to-fit + centre". Gives
 *  predictable, hand-placed typography in a template. */
const T = (rect: [number, number, number, number], style: Record<string, unknown>, config: Record<string, unknown>, z = 10): WNode =>
  ({ ...node("text", rect, style, config, z), scaleMode: "reflow" });

/** A starter HTML document for the HTML-embed template — a self-contained,
 *  brand-agnostic animated hero the operator can rewrite (by hand or with AI). */
const STARTER_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box}
  html,body{width:100%;height:100%;overflow:hidden;font-family:'Hanken Grotesk',system-ui,sans-serif;background:#0b0e1a;color:#fff}
  .wrap{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2vh;
    background:radial-gradient(120% 120% at 20% 10%, #21284a 0%, #0b0e1a 60%)}
  .eyebrow{font-size:1.4vw;letter-spacing:.4em;text-transform:uppercase;opacity:.6}
  h1{font-size:8vw;font-weight:800;line-height:.98;background:linear-gradient(100deg,#8ab4ff,#c98aff);
    -webkit-background-clip:text;background-clip:text;color:transparent;animation:rise .9s ease both}
  .bar{width:14vw;height:.6vh;border-radius:99px;background:#8ab4ff;animation:grow 1.1s ease both}
  @keyframes rise{from{opacity:0;transform:translateY(3vh)}to{opacity:1;transform:none}}
  @keyframes grow{from{width:0}to{width:14vw}}
</style></head><body><div class="wrap">
  <div class="eyebrow">Custom HTML</div>
  <h1>Anything you<br>can imagine</h1>
  <div class="bar"></div>
</div></body></html>`;

/* -------------------------------- templates ------------------------------- */

export const TEMPLATES: Template[] = [
  /* ------------------------------- Starter ------------------------------- */
  {
    id: "blank",
    name: "Blank canvas",
    description: "Start from nothing and compose your own scene.",
    category: "Starter",
    build: () => [],
  },
  {
    id: "brand-hero",
    name: "Brand Hero",
    description: "A confident welcome hero — big headline, subtitle, live clock and date — entirely on your brand tokens. The cleanest starting point.",
    category: "Starter",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(1180, -360, 1040, 0.18),
      glow(-260, 640, 720, 0.1, ACCENT2),
      T([120, 150, 900, 40], { color: ACCENT, fontSize: 30, fontWeight: "800", align: "left", letterSpacing: 8, textTransform: "uppercase" }, { text: "Welcome" }, 10),
      T([116, 300, 1400, 320], { color: FG, fontSize: 150, fontWeight: "900", align: "left", lineHeight: 0.98 }, { text: "Made for your brand." }, 10),
      node("line", [124, 636, 320, 10], { fill: ACCENT, thickness: 10, radius: 5 }, {}, 10),
      T([120, 686, 1200, 80], { color: MUTED, fontSize: 42, fontWeight: "500", align: "left" }, { text: "Every widget follows your colours, radius and type." }, 10),
      node("clock", [1420, 120, 400, 100], { color: FG, fontSize: 76, font: "mono", fontWeight: "800", align: "right", bg: TRANSP }, { variant: "digital", hour12: false, seconds: false }, 10),
      node("date", [1220, 232, 600, 44], { color: MUTED, fontSize: 30, fontWeight: "600", align: "right", bg: TRANSP }, { variant: "full" }, 10),
    ],
  },
  {
    id: "html-canvas",
    name: "HTML Canvas",
    description: "A full-frame HTML embed — bring any custom animated design, or write one with AI. The sandbox runs your own markup, CSS and JS.",
    category: "Starter",
    accent: ACCENT,
    build: () => [
      node("html", [0, 0, 1920, 1080], { radius: 0 }, { html: STARTER_HTML }, 10),
    ],
  },

  /* ------------------------------ Corporate ------------------------------ */
  {
    id: "executive-kpis",
    name: "Executive KPIs",
    description: "A live operations dashboard — KPI tiles including a progress ring and a side-label stat — all in brand glass. Shows the Metric widget in every variant.",
    category: "Corporate",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(1300, -320, 900, 0.14),
      T([80, 64, 1100, 76], { color: FG, fontSize: 56, fontWeight: "900", align: "left", letterSpacing: 1 }, { text: "Operations Today" }, 10),
      node("date", [80, 148, 800, 48], { color: MUTED, fontSize: 32, align: "left", bg: TRANSP }, { variant: "full" }, 10),
      node("clock", [1560, 64, 300, 60], { color: FG, fontSize: 54, font: "mono", align: "right", bg: TRANSP }, { variant: "digital", hour12: false, seconds: false }, 10),
      node("metric", [80, 250, 560, 300], { bg: SURFACE, color: FG, accent: ACCENT, radius: 24, shadow: "md" }, { variant: "card", label: "Revenue (MTD)", value: "$1.28M", trend: "up", delta: "+12.4%", caption: "vs. last month" }, 12),
      node("metric", [670, 250, 560, 300], { bg: SURFACE, color: FG, accent: ACCENT2, radius: 24, shadow: "md" }, { variant: "card", label: "Open tickets", value: "37", trend: "down", delta: "−8", caption: "cleared 21 today" }, 12),
      node("metric", [1260, 250, 580, 300], { bg: SURFACE, color: FG, accent: ACCENT, radius: 24, shadow: "md" }, { variant: "ring", label: "SLA", value: "94%", percent: 94 }, 12),
      node("metric", [80, 590, 850, 340], { bg: SURFACE2, color: FG, accent: ACCENT, radius: 24, shadow: "lg" }, { variant: "card", label: "Visitors on site", value: "1,284", trend: "up", delta: "+7.9%", caption: "peak 1,410 at 14:00" }, 12),
      node("metric", [960, 590, 880, 340], { bg: SURFACE, color: FG, accent: ACCENT2, radius: 24, shadow: "md" }, { variant: "sideLabel", label: "NPS this quarter", value: "72", caption: "world-class ≥ 70" }, 12),
    ],
  },
  {
    id: "world-clocks",
    name: "World Clocks",
    description: "A row of city clocks across time zones for a global HQ or trading floor — brand glass cards, brand-accent hands. Shows the clock's time-zone support.",
    category: "Corporate",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(760, -300, 800, 0.12),
      T([80, 70, 1200, 66], { color: FG, fontSize: 50, fontWeight: "900", align: "left", letterSpacing: 1 }, { text: "Around the World" }, 10),
      node("date", [80, 146, 900, 44], { color: MUTED, fontSize: 30, align: "left", bg: TRANSP }, { variant: "full" }, 10),
      ...[
        { tz: "America/Los_Angeles", label: "Los Angeles", x: 80 },
        { tz: "America/New_York", label: "New York", x: 560 },
        { tz: "Europe/London", label: "London", x: 1040 },
        { tz: "Asia/Dubai", label: "Dubai", x: 1440 },
      ].flatMap((c, i) => [
        node("box", [c.x, 300, 400, 480], { fill: SURFACE, radius: 28 }, {}, 6 + i),
        node("clock", [c.x + 40, 340, 320, 320], { color: FG, font: "sans", bg: TRANSP, accent: ACCENT }, { variant: "analog", seconds: true, tz: c.tz }, 12),
        node("clock", [c.x + 20, 672, 360, 70], { color: FG, fontSize: 52, font: "mono", align: "center", bg: TRANSP }, { variant: "digital", hour12: false, seconds: false, tz: c.tz, tzLabel: c.label }, 12),
      ]),
    ],
  },
  {
    id: "town-hall",
    name: "Town Hall",
    description: "An all-hands holding screen — a quote-styled welcome, today's agenda and a countdown to kick-off. Shows the text 'quote' variant + Menu + Countdown.",
    category: "Corporate",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(-240, -260, 760, 0.14),
      T([80, 70, 1000, 44], { color: ACCENT, fontSize: 26, fontWeight: "800", align: "left", letterSpacing: 6, textTransform: "uppercase" }, { text: "Company All-Hands" }, 10),
      T([80, 150, 1080, 300], { color: FG, fontSize: 60, fontWeight: "700", accent: ACCENT }, { text: "Great things are built by teams who show up for each other.", variant: "quote" }, 12),
      node("countdown", [80, 520, 1080, 300], { color: FG, accent: ACCENT, fontSize: 120, fontWeight: "900" }, { variant: "blocks", showDays: false, target: "2026-09-01T10:00", doneText: "We're live — welcome!" }, 12),
      node("menu", [1240, 150, 600, 780], { bg: SURFACE, color: FG, accent: ACCENT, radius: 24, fontWeight: "700", shadow: "md" }, {
        variant: "rows", title: "Agenda",
        items: [
          { label: "Welcome & vision", value: "10:00" },
          { label: "Quarter in review", value: "10:20" },
          { label: "Product roadmap", value: "10:45" },
          { label: "Team shout-outs", value: "11:10" },
          { label: "Q & A", value: "11:30" },
        ],
      }, 10),
    ],
  },

  /* -------------------------------- Events ------------------------------- */
  {
    id: "event-countdown",
    name: "Event Countdown",
    description: "A hero countdown to the big moment with a scan-to-register QR and a brand-gradient title. Shows Countdown (blocks) + QR.",
    category: "Events",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(1440, -240, 780, 0.2),
      glow(-220, 620, 640, 0.12, ACCENT2),
      T([120, 120, 1200, 70], { color: MUTED, fontSize: 40, fontWeight: "700", align: "left", letterSpacing: 6, textTransform: "uppercase" }, { text: "Doors open in" }, 10),
      T([116, 196, 1300, 200], { fontSize: 140, fontWeight: "900", align: "left", lineHeight: 0.96, gradientText: true, gradient: { from: ACCENT, to: ACCENT2, angle: 100 } }, { text: "Summit 2026" }, 10),
      node("countdown", [120, 480, 1180, 300], { color: FG, accent: ACCENT, fontSize: 150, fontWeight: "900" }, { variant: "blocks", target: "2026-09-01T09:00", showDays: true, doneText: "It's on — welcome!" }, 12),
      node("qr", [1470, 470, 340, 420], { bg: "#ffffff", color: "#0b0b12", radius: 22, pad: 7, shadow: "lg" }, { text: "https://scena.app/register", caption: "Scan to register" }, 12),
      node("date", [120, 890, 900, 56], { color: MUTED, fontSize: 40, fontWeight: "600", align: "left", bg: TRANSP }, { variant: "full" }, 10),
    ],
  },
  {
    id: "conference-agenda",
    name: "Conference Agenda",
    description: "Today's session list with a countdown to the next talk, a clock and a schedule QR — for conferences and expos.",
    category: "Events",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(1360, 560, 760, 0.12),
      T([80, 60, 1000, 66], { color: FG, fontSize: 52, fontWeight: "900", align: "left", letterSpacing: 1 }, { text: "Today's Agenda" }, 10),
      node("clock", [1560, 64, 300, 58], { color: ACCENT, fontSize: 50, font: "mono", align: "right", bg: TRANSP }, { variant: "digital", hour12: false, seconds: false }, 10),
      node("menu", [80, 170, 1180, 840], { bg: SURFACE, color: FG, accent: ACCENT, radius: 24, fontWeight: "700", shadow: "md" }, {
        variant: "rows", title: "Main Stage",
        items: [
          { label: "Opening keynote", note: "Grand Hall", value: "09:00" },
          { label: "The future of retail media", note: "A. Rivera", value: "10:15" },
          { label: "Workshop: building on the edge", note: "Room 2", value: "11:30" },
          { label: "Lunch & networking", value: "13:00" },
          { label: "Panel: scaling to a billion screens", value: "14:30" },
          { label: "Closing remarks", value: "16:00" },
        ],
      }, 10),
      T([1320, 200, 520, 44], { color: MUTED, fontSize: 30, fontWeight: "700", align: "center", letterSpacing: 4, textTransform: "uppercase" }, { text: "Next session in" }, 10),
      node("countdown", [1320, 260, 520, 240], { color: FG, accent: ACCENT, fontSize: 92, fontWeight: "900" }, { variant: "blocks", showDays: false, target: "2026-09-01T10:15" }, 12),
      node("qr", [1400, 560, 360, 440], { bg: "#ffffff", color: "#0b0b12", radius: 20, pad: 7, shadow: "md" }, { text: "https://scena.app/agenda", caption: "Full schedule" }, 12),
    ],
  },

  /* ------------------------------ Restaurant ----------------------------- */
  {
    id: "menu-board",
    name: "Menu Board",
    description: "A clean two-column menu board with leader-dot pricing for a café or counter. Shows the Menu 'leaders' variant.",
    category: "Restaurant",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(960, -300, 820, 0.12),
      T([80, 60, 1200, 96], { fontSize: 76, fontWeight: "900", align: "left", gradientText: true, gradient: { from: ACCENT, to: ACCENT2, angle: 100 } }, { text: "The Corner Café" }, 10),
      node("line", [88, 172, 360, 10], { fill: ACCENT, thickness: 10, radius: 6 }, {}, 10),
      node("menu", [80, 230, 880, 780], { bg: SURFACE, color: FG, accent: ACCENT, radius: 24, fontWeight: "700", shadow: "md" }, {
        variant: "leaders", title: "Coffee",
        items: [
          { label: "Espresso", note: "double shot", value: "$3.20" },
          { label: "Cappuccino", value: "$4.20" },
          { label: "Flat white", value: "$4.50" },
          { label: "Cold brew", note: "16oz", value: "$5.00" },
          { label: "Mocha", value: "$4.80" },
        ],
      }, 10),
      node("menu", [1000, 230, 840, 780], { bg: SURFACE, color: FG, accent: ACCENT, radius: 24, fontWeight: "700", shadow: "md" }, {
        variant: "leaders", title: "Kitchen",
        items: [
          { label: "Butter croissant", value: "$3.80" },
          { label: "Avocado toast", note: "sourdough", value: "$9.50" },
          { label: "Breakfast bagel", value: "$8.00" },
          { label: "Seasonal soup", note: "ask staff", value: "$7.50" },
          { label: "Granola bowl", value: "$6.50" },
        ],
      }, 10),
    ],
  },
  {
    id: "happy-hour",
    name: "Happy Hour",
    description: "A specials board with a countdown to happy hour and a drinks list — for bars and lounges. Shows Countdown + Menu 'rows'.",
    category: "Restaurant",
    accent: ACCENT,
    build: () => [
      ground(),
      node("triangle", [1500, -120, 520, 520], { fill: ACCENT, opacity: 0.18 }, {}, 1),
      glow(-160, 700, 520, 0.14, ACCENT2),
      T([120, 90, 1200, 130], { color: FG, fontSize: 104, fontWeight: "900", align: "left" }, { text: "Happy Hour" }, 10),
      T([124, 236, 900, 60], { color: ACCENT, fontSize: 40, fontWeight: "700", align: "left" }, { text: "Half price, every weekday" }, 10),
      node("countdown", [120, 340, 900, 260], { color: FG, accent: ACCENT, fontSize: 120, fontWeight: "900" }, { variant: "blocks", showDays: false, target: "2026-09-01T17:00", doneText: "It's happy hour! 🍹" }, 12),
      node("menu", [1080, 300, 760, 620], { bg: SURFACE, color: FG, accent: ACCENT, radius: 24, fontWeight: "700", shadow: "lg" }, {
        variant: "rows", title: "Specials",
        items: [
          { label: "House red / white", value: "$6" },
          { label: "Craft lager", note: "pint", value: "$5" },
          { label: "Signature spritz", value: "$8" },
          { label: "Loaded fries", value: "$7" },
        ],
      }, 10),
      node("clock", [124, 940, 400, 60], { color: FG, fontSize: 50, font: "mono", align: "left", bg: TRANSP }, { variant: "digital", hour12: true, seconds: false }, 10),
    ],
  },

  /* -------------------------------- Retail ------------------------------- */
  {
    id: "scan-to-save",
    name: "Scan to Save",
    description: "A promo scene built around a big scan-to-save QR with a bold brand-gradient offer. Shows the QR widget + a side-label Metric.",
    category: "Retail",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(1300, 620, 760, 0.16),
      T([120, 150, 1080, 90], { color: ACCENT, fontSize: 46, fontWeight: "800", align: "left", letterSpacing: 4, textTransform: "uppercase" }, { text: "Members save more" }, 10),
      T([116, 250, 1120, 300], { fontSize: 200, fontWeight: "900", align: "left", lineHeight: 0.9, gradientText: true, gradient: { from: ACCENT, to: ACCENT2, angle: 120 } }, { text: "20% OFF" }, 10),
      T([124, 590, 1080, 80], { color: FG, fontSize: 52, fontWeight: "600", align: "left" }, { text: "Scan to unlock today's coupon." }, 10),
      node("metric", [124, 720, 520, 240], { bg: SURFACE, color: FG, accent: ACCENT, radius: 22 }, { variant: "sideLabel", label: "Ends in", value: "3 days", caption: "while stocks last" }, 10),
      node("qr", [1360, 220, 480, 640], { bg: "#ffffff", color: "#0b0b12", radius: 28, pad: 8, shadow: "lg" }, { text: "https://scena.app/save20", caption: "Scan for 20% off" }, 12),
    ],
  },
  {
    id: "scan-review",
    name: "Rate Us on Google",
    description: "A full-screen 'scan to review' call-to-action — the animated Google-review CTA card centred on a branded ground. Point it at your review link and it's done.",
    category: "Retail",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(960, 200, 900, 0.18),
      node("cta", [680, 160, 560, 760], {}, { preset: "google", url: "https://g.page/r/your-business/review" }, 12),
    ],
  },
  {
    id: "scan-wifi",
    name: "Guest Wi-Fi",
    description: "A 'scan to connect' Wi-Fi card on a calm brand ground — guests scan to auto-join your network. Set the SSID + password on the widget.",
    category: "Hospitality",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(960, 200, 900, 0.16),
      node("cta", [680, 160, 560, 760], {}, { preset: "wifi", wifiSsid: "Guest WiFi", wifiPassword: "welcome123" }, 12),
    ],
  },
  {
    id: "cafe-specials",
    name: "Rotating Specials",
    description: "A rotating specials board — sliding offers on a brand-glass panel with playful shape accents. Shows the Stack widget with a slide transition.",
    category: "Retail",
    accent: ACCENT,
    build: () => [
      ground(),
      node("circle", [1500, -180, 620, 620], { fill: ACCENT, opacity: 0.18 }, {}, 1),
      node("circle", [-160, 720, 520, 520], { fill: ACCENT2, opacity: 0.16 }, {}, 1),
      T([140, 110, 1200, 140], { color: FG, fontSize: 96, fontWeight: "900", align: "left" }, { text: "Today's Specials" }, 10),
      node("line", [148, 258, 360, 12], { fill: ACCENT, thickness: 12, radius: 8 }, {}, 10),
      node("stack", [140, 340, 1640, 560], { bg: SURFACE, radius: 28, color: FG, shadow: "lg" }, {
        dwellMs: 5000, transition: "slide", shuffle: false,
        items: [
          item("p1", "text", { color: FG, fontSize: 104, fontWeight: "900", align: "center" }, { text: "20% off all pastries" }),
          item("p2", "text", { color: FG, fontSize: 104, fontWeight: "900", align: "center" }, { text: "Free refills before noon" }),
          item("p3", "text", { color: FG, fontSize: 104, fontWeight: "900", align: "center" }, { text: "Buy one, gift one" }),
        ],
      }, 10),
      node("clock", [1520, 118, 260, 60], { color: FG, fontSize: 52, font: "mono", align: "right", bg: TRANSP }, { variant: "digital", hour12: true, seconds: false }, 10),
    ],
  },

  /* ----------------------------- Real estate ----------------------------- */
  {
    id: "property-showcase",
    name: "Property Showcase",
    description: "A listing card — hero photo, price, key stats and a scan-for-details QR. For agency windows. Shows Image + Metric + Menu + QR.",
    category: "Real estate",
    accent: ACCENT,
    build: () => [
      bg({ fill: GROUND_DEEP }),
      node("image", [0, 0, 1180, 1080], { radius: 0, tint: "oklch(0.12 0.02 240 / 0.25)" }, { url: "", fit: "cover" }, 2),
      node("box", [1180, 0, 740, 1080], { fill: GROUND }, {}, 3),
      T([1230, 80, 640, 60], { color: ACCENT, fontSize: 34, fontWeight: "800", align: "left", letterSpacing: 3, textTransform: "uppercase" }, { text: "For Sale" }, 10),
      T([1230, 150, 640, 180], { color: FG, fontSize: 60, fontWeight: "900", align: "left", lineHeight: 1.02 }, { text: "12 Harbour View Terrace" }, 10),
      node("metric", [1230, 360, 640, 200], { bg: SURFACE2, color: FG, accent: ACCENT, radius: 22, shadow: "md" }, { variant: "card", label: "Guide price", value: "$1.95M" }, 12),
      node("menu", [1230, 590, 640, 300], { bg: SURFACE, color: FG, accent: ACCENT, radius: 22, fontWeight: "700" }, {
        variant: "rows",
        items: [
          { label: "Bedrooms", value: "4" },
          { label: "Bathrooms", value: "3" },
          { label: "Floor area", value: "240 m²" },
          { label: "Garage", value: "2 cars" },
        ],
      }, 10),
      node("qr", [1230, 910, 150, 150], { bg: "#ffffff", color: "#0b0b12", radius: 14, pad: 5 }, { text: "https://scena.app/listing/12-harbour-view" }, 12),
      T([1410, 946, 460, 90], { color: MUTED, fontSize: 30, fontWeight: "600", align: "left" }, { text: "Scan for photos,\nfloor plan & viewing times" }, 10),
    ],
  },

  /* -------------------------------- Fitness ------------------------------ */
  {
    id: "class-schedule",
    name: "Class Schedule",
    description: "Today's timetable with a countdown to the next session, a capacity ring and a booking QR — for gyms and studios. Shows the Menu 'cards' variant.",
    category: "Fitness",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(1340, 560, 760, 0.12),
      T([80, 60, 1000, 70], { color: FG, fontSize: 56, fontWeight: "900", align: "left", letterSpacing: 1 }, { text: "Today's Classes" }, 10),
      node("clock", [1560, 66, 300, 58], { color: ACCENT, fontSize: 50, font: "mono", align: "right", bg: TRANSP }, { variant: "digital", hour12: false, seconds: false }, 10),
      node("menu", [80, 180, 1120, 830], { bg: SURFACE, color: FG, accent: ACCENT, radius: 24, fontWeight: "700", shadow: "md" }, {
        variant: "cards", title: "Studio A",
        items: [
          { label: "Sunrise Yoga", note: "with Maya", value: "07:00" },
          { label: "HIIT 45", note: "Studio A", value: "09:30" },
          { label: "Spin Express", note: "20 bikes", value: "12:15" },
          { label: "Strength Lab", value: "17:30" },
          { label: "Evening Flow", note: "restorative", value: "19:00" },
        ],
      }, 10),
      T([1260, 210, 580, 44], { color: MUTED, fontSize: 30, fontWeight: "700", align: "center", letterSpacing: 4, textTransform: "uppercase" }, { text: "Next class in" }, 10),
      node("countdown", [1260, 270, 580, 260], { color: FG, accent: ACCENT, fontSize: 100, fontWeight: "900" }, { variant: "blocks", showDays: false, target: "2026-09-01T09:30" }, 12),
      node("metric", [1260, 580, 580, 200], { bg: SURFACE, color: FG, accent: ACCENT, radius: 22 }, { variant: "ring", label: "Capacity", value: "82%", percent: 82 }, 12),
      node("qr", [1400, 810, 300, 200], { bg: "#ffffff", color: "#0b0b12", radius: 16, pad: 5 }, { text: "https://scena.app/book", caption: "Book a spot" }, 12),
    ],
  },

  /* ------------------------------ Healthcare ----------------------------- */
  {
    id: "clinic-waiting-room",
    name: "Clinic Waiting Room",
    description: "A calm waiting-room board — now serving, exam-room status, and a notices crawl. Bind the widgets to a Queue and a Room board.",
    category: "Healthcare",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(-220, -220, 720, 0.12),
      node("box", [0, 0, 1920, 120], { fill: SURFACE }, {}, 4),
      T([64, 34, 900, 60], { color: FG, fontSize: 46, fontWeight: "800", align: "left" }, { text: "Welcome — please take a seat" }, 10),
      node("clock", [1600, 38, 260, 52], { color: ACCENT, fontSize: 44, font: "mono", align: "right", bg: TRANSP }, { variant: "digital", hour12: true, seconds: false }, 10),
      node("queue_caller", [80, 190, 1080, 640], { bg: SURFACE, radius: 24, shadow: "lg" }, { boardId: "", variant: "recent" }, 10),
      node("room_board", [1200, 190, 640, 640], { bg: SURFACE, radius: 24 }, { boardId: "" }, 10),
      node("ticker", [0, 980, 1920, 100], { bg: ACCENT, color: "#fff", fontSize: 40, fontWeight: "700", speed: 90 }, { feedId: "", variant: "scroll", badge: "NOTICES", separator: "     •     " }, 30),
    ],
  },
  {
    id: "exam-door",
    name: "Exam Room Door",
    description: "A door-tablet panel that fills with the room's live status colour and flashes when it changes — bind it to a Room board and pick the room.",
    category: "Healthcare",
    accent: ACCENT,
    build: () => [
      node("room_status", [0, 0, 1920, 1080], { radius: 0 }, { boardId: "", roomId: "" }, 10),
    ],
  },
  {
    id: "wellness-welcome",
    name: "Wellness Welcome",
    description: "A serene reception screen — a highlighted welcome, opening hours, live weather and a cycling wellbeing tip. Shows the text 'highlight' + 'panel' variants.",
    category: "Healthcare",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(1240, -280, 900, 0.14),
      node("box", [72, 60, 88, 88], { fill: ACCENT, radius: 24, shadow: "md" }, {}, 6),
      T([176, 74, 1000, 60], { color: FG, fontSize: 40, fontWeight: "800", align: "left" }, { text: "Rivergreen Wellness" }, 8),
      T([72, 220, 1080, 220], { color: "#0b0b12", fontSize: 92, fontWeight: "900", radius: 28, align: "left" }, { text: "You're in good hands.", variant: "highlight" }, 10),
      T([80, 480, 1080, 60], { color: MUTED, fontSize: 34, align: "left" }, { text: "Please check in at reception when you arrive." }, 10),
      T([80, 600, 1080, 380], { color: FG, fontSize: 36, fontWeight: "600", align: "left", accent: ACCENT }, { text: "Opening hours\nMon – Fri  ·  08:00 – 18:00\nSaturday  ·  09:00 – 13:00\nSunday  ·  closed", variant: "panel" }, 10),
      node("clock", [1470, 66, 378, 96], { color: FG, fontSize: 76, font: "sans", fontWeight: "800", align: "right", bg: TRANSP }, { variant: "digital", hour12: false, seconds: false }, 10),
      node("weather", [1240, 300, 608, 260], { bg: SURFACE, radius: 24, color: FG, shadow: "md" }, { sourceId: "", variant: "current" }, 10),
      T([1240, 600, 608, 30], { color: ACCENT, fontSize: 20, fontWeight: "800", align: "left", letterSpacing: 4, textTransform: "uppercase" }, { text: "Wellbeing tip" }, 10),
      node("stack", [1240, 650, 608, 330], { bg: TRANSP, radius: 0, color: FG }, {
        dwellMs: 6500, transition: "fade", shuffle: false,
        items: [
          item("w1", "text", { color: FG, fontSize: 40, fontWeight: "700", align: "left", lineHeight: 1.25 }, { text: "Drink a glass of water before your appointment." }),
          item("w2", "text", { color: FG, fontSize: 40, fontWeight: "700", align: "left", lineHeight: 1.25 }, { text: "Take three slow breaths — in for four, out for six." }),
          item("w3", "text", { color: FG, fontSize: 40, fontWeight: "700", align: "left", lineHeight: 1.25 }, { text: "Bring a list of any medications you're taking." }),
        ],
      }, 10),
    ],
  },

  /* ----------------------------- Hospitality ----------------------------- */
  {
    id: "lobby-welcome",
    name: "Lobby Welcome",
    description: "A warm reception scene — welcome headline, analog clock, live weather and date. All on brand glass.",
    category: "Hospitality",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(1240, 460, 820, 0.14),
      node("box", [80, 64, 120, 120], { fill: ACCENT, radius: 26, shadow: "md" }, {}, 8),
      T([224, 92, 700, 70], { color: FG, fontSize: 40, fontWeight: "800", align: "left" }, { text: "Acme Corporation" }, 10),
      T([224, 380, 1200, 180], { color: FG, fontSize: 108, fontWeight: "900", align: "left", lineHeight: 1 }, { text: "Welcome" }, 10),
      T([228, 566, 1100, 80], { color: MUTED, fontSize: 48, fontWeight: "500", align: "left" }, { text: "We're glad you're here." }, 10),
      node("date", [228, 700, 800, 60], { color: MUTED, fontSize: 40, align: "left", bg: TRANSP }, { variant: "full" }, 10),
      node("clock", [1480, 96, 360, 360], { color: FG, font: "sans", bg: SURFACE, accent: ACCENT }, { variant: "analog", seconds: true }, 10),
      node("weather", [1300, 520, 540, 300], { bg: SURFACE, radius: 24, color: FG, shadow: "md" }, { sourceId: "", variant: "current" }, 10),
    ],
  },
  {
    id: "now-playing-lounge",
    name: "Now Playing Lounge",
    description: "A music venue scene showing the now-playing widget three ways — full, card and bar. Bind it to the channel's music.",
    category: "Hospitality",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(960, -320, 900, 0.16),
      T([80, 56, 700, 60], { color: FG, fontSize: 46, fontWeight: "800", align: "left", letterSpacing: 1 }, { text: "The Lounge" }, 10),
      node("clock", [1560, 60, 300, 54], { color: ACCENT, fontSize: 48, font: "mono", align: "right", bg: TRANSP }, { variant: "digital", hour12: true, seconds: false }, 10),
      node("nowplaying", [80, 170, 1760, 440], { bg: SURFACE, radius: 26, color: FG, accent: ACCENT }, { variant: "full" }, 10),
      node("nowplaying", [80, 650, 860, 200], { bg: SURFACE, radius: 22, color: FG, accent: ACCENT }, { variant: "card" }, 10),
      node("nowplaying", [980, 650, 860, 200], { bg: SURFACE, radius: 22, color: FG, accent: ACCENT }, { variant: "bar" }, 10),
    ],
  },

  /* ------------------------------ Wayfinding ----------------------------- */
  {
    id: "now-serving",
    name: "Now Serving",
    description: "A now-serving queue board with the current number large and a recent-calls list. Bind both to your Queue board. Shows queue 'solo' + 'recent'.",
    category: "Wayfinding",
    accent: ACCENT,
    build: () => [
      ground(),
      T([80, 56, 1000, 80], { color: FG, fontSize: 60, fontWeight: "800", align: "left" }, { text: "Now Serving" }, 10),
      node("clock", [1560, 66, 300, 66], { color: FG, fontSize: 56, font: "mono", align: "right", bg: TRANSP }, { variant: "digital", hour12: false, seconds: false }, 10),
      node("line", [80, 168, 1760, 4], { fill: ACCENT, thickness: 4, radius: 2 }, {}, 10),
      node("queue_caller", [80, 210, 1080, 720], { bg: SURFACE, radius: 24 }, { boardId: "", variant: "solo" }, 10),
      node("queue_caller", [1200, 210, 640, 720], { bg: SURFACE, radius: 24 }, { boardId: "", variant: "recent" }, 10),
    ],
  },
  {
    id: "room-availability",
    name: "Room Availability",
    description: "A room-status board with a title bar and clock — for clinics, offices and hotels. Bind it to your Room board.",
    category: "Wayfinding",
    accent: ACCENT,
    build: () => [
      ground(),
      T([80, 56, 1000, 90], { color: FG, fontSize: 64, fontWeight: "800", align: "left" }, { text: "Room Availability" }, 10),
      node("clock", [1560, 66, 300, 70], { color: FG, fontSize: 60, font: "mono", align: "right", bg: TRANSP }, { variant: "digital", hour12: false, seconds: false }, 10),
      node("line", [80, 168, 1760, 4], { fill: ACCENT, thickness: 4, radius: 2 }, {}, 10),
      node("room_board", [80, 210, 1760, 720], { bg: SURFACE, radius: 22 }, { boardId: "" }, 10),
    ],
  },
  {
    id: "departures-board",
    name: "Departures Board",
    description: "A gate/queue grid with a clock and a scrolling notices crawl — for transit and lobbies. Shows the queue 'grid' variant.",
    category: "Wayfinding",
    accent: ACCENT,
    build: () => [
      bg({ fill: GROUND_DEEP }),
      node("box", [0, 0, 1920, 110], { fill: SURFACE }, {}, 4),
      T([64, 30, 700, 56], { color: ACCENT, fontSize: 46, fontWeight: "900", align: "left", letterSpacing: 2 }, { text: "DEPARTURES" }, 10),
      node("clock", [1560, 30, 300, 60], { color: FG, fontSize: 52, font: "mono", align: "right", bg: TRANSP }, { variant: "digital", hour12: false, seconds: true }, 10),
      node("queue_caller", [64, 150, 1792, 730], { bg: SURFACE, radius: 18 }, { boardId: "", variant: "grid" }, 10),
      node("ticker", [0, 980, 1920, 100], { bg: ACCENT, color: "#fff", fontSize: 42, fontWeight: "800", speed: 90 }, { feedId: "", variant: "scroll", separatorKind: "custom", separator: "   ✈   " }, 30),
    ],
  },

  /* -------------------------------- Weather ------------------------------ */
  {
    id: "weather-center",
    name: "Weather Center",
    description: "A full weather board — the week ahead, today's detail and a clock. Shows every weather variant. Bind it to a weather location.",
    category: "Weather",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(960, -320, 900, 0.14),
      T([80, 56, 900, 64], { color: FG, fontSize: 50, fontWeight: "900", align: "left", letterSpacing: 1 }, { text: "Weather Center" }, 10),
      node("clock", [1560, 60, 300, 56], { color: FG, fontSize: 48, font: "mono", align: "right", bg: TRANSP }, { variant: "digital", hour12: true, seconds: false }, 10),
      node("weather", [80, 170, 900, 420], { bg: SURFACE, radius: 24, color: FG }, { sourceId: "", variant: "current" }, 10),
      node("weather", [1020, 170, 820, 420], { bg: SURFACE, radius: 24, color: FG }, { sourceId: "", variant: "day" }, 10),
      node("weather", [80, 620, 1760, 300], { bg: SURFACE, radius: 24, color: FG }, { sourceId: "", variant: "week" }, 10),
      node("date", [80, 946, 900, 56], { color: MUTED, fontSize: 38, align: "left", bg: TRANSP }, { variant: "full" }, 10),
    ],
  },

  /* --------------------------------- News -------------------------------- */
  {
    id: "breaking-strap",
    name: "Breaking Strap",
    description: "A bold breaking-news look — an accent flag, a lower-third headline and a live crawl. Built on brand tokens; bind the crawl to a feed.",
    category: "News",
    accent: ACCENT,
    build: () => [
      bg({ fill: GROUND_DEEP }),
      node("box", [0, 0, 1920, 96], { fill: SURFACE }, {}, 4),
      T([64, 22, 620, 56], { color: FG, fontSize: 40, fontWeight: "900", align: "left", letterSpacing: 1 }, { text: "SCENA NEWS" }, 12),
      node("clock", [1590, 22, 270, 56], { color: FG, fontSize: 46, font: "mono", align: "right", bg: TRANSP }, { variant: "digital", hour12: false, seconds: false }, 12),
      node("box", [80, 760, 300, 62], { fill: ACCENT, radius: 6 }, {}, 18),
      T([96, 764, 268, 54], { color: "#fff", fontSize: 30, fontWeight: "900", align: "left", textTransform: "uppercase", letterSpacing: 3 }, { text: "Breaking" }, 22),
      node("box", [80, 828, 1360, 108], { fill: SURFACE2, radius: 8 }, {}, 16),
      T([104, 840, 1320, 84], { color: FG, fontSize: 60, fontWeight: "800", align: "left" }, { text: "Your headline goes right here" }, 22),
      node("ticker", [0, 980, 1920, 100], { bg: ACCENT, color: "#fff", fontSize: 44, fontWeight: "700", speed: 110 }, { feedId: "", variant: "scroll", badge: "LIVE", separator: "   •   " }, 30),
    ],
  },
  {
    id: "the-newsroom",
    name: "The Newsroom",
    description: "A calm newsroom — an analog clock, a live weather card, a top-story headline and a latest-stories list. Shows ticker 'list' + 'ribbon'.",
    category: "News",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(1560, 120, 640, 0.12),
      T([80, 60, 700, 60], { color: FG, fontSize: 46, fontWeight: "900", align: "left", letterSpacing: 1 }, { text: "THE BULLETIN" }, 10),
      node("clock", [1580, 48, 280, 280], { color: FG, font: "sans", bg: SURFACE, accent: ACCENT }, { variant: "analog", seconds: true }, 10),
      T([80, 380, 1120, 200], { color: FG, fontSize: 76, fontWeight: "800", align: "left", lineHeight: 1.04 }, { text: "Top story, front and centre" }, 10),
      node("date", [80, 610, 700, 54], { color: MUTED, fontSize: 38, align: "left", bg: TRANSP }, { variant: "full" }, 10),
      node("weather", [1300, 360, 560, 300], { bg: SURFACE, radius: 20, color: FG }, { sourceId: "", variant: "current" }, 10),
      node("ticker", [0, 980, 1920, 100], { bg: SURFACE2, color: FG, fontSize: 40, fontWeight: "700", speed: 90 }, { feedId: "", variant: "ribbon", separatorKind: "bullet" }, 30),
    ],
  },

  /* -------------------------------- Sports ------------------------------- */
  {
    id: "match-center",
    name: "Match Center",
    description: "A sports look with a live scoreboard and a scores crawl on brand tokens. Bind the scoreboard to a Score board to drive it live.",
    category: "Sports",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(960, -320, 1000, 0.16),
      node("box", [0, 0, 1920, 110], { fill: SURFACE }, {}, 4),
      T([64, 30, 620, 56], { color: FG, fontSize: 44, fontWeight: "900", align: "left", letterSpacing: 2 }, { text: "MATCH CENTER" }, 10),
      node("clock", [1620, 34, 240, 50], { color: ACCENT, fontSize: 44, font: "mono", align: "right", bg: TRANSP }, { variant: "digital", hour12: false, seconds: false }, 10),
      node("scoreboard", [260, 240, 1400, 420], { bg: SURFACE2, radius: 28, shadow: "lg" }, { boardId: "", variant: "classic" }, 8),
      node("ticker", [0, 980, 1920, 100], { bg: ACCENT, color: "#fff", fontSize: 42, fontWeight: "700", speed: 100 }, { feedId: "", variant: "scroll", badge: "SCORES", separator: "     " }, 30),
    ],
  },
  {
    id: "big-score",
    name: "Big Score",
    description: "A full-screen live scoreboard for a gym, hall or school game — bind it to a Score board and let a referee run it. Shows the scoreboard 'stacked' variant.",
    category: "Sports",
    accent: ACCENT,
    build: () => [
      ground(),
      glow(960, -300, 1000, 0.14),
      T([0, 70, 1920, 60], { color: MUTED, fontSize: 40, fontWeight: "800", align: "center", letterSpacing: 6 }, { text: "SCOREBOARD" }, 10),
      node("scoreboard", [120, 190, 1680, 700], { bg: SURFACE, radius: 32, shadow: "lg" }, { boardId: "", variant: "stacked" }, 10),
      node("clock", [0, 940, 1920, 70], { color: MUTED, fontSize: 52, font: "mono", align: "center", bg: TRANSP }, { variant: "digital", hour12: false, seconds: true }, 10),
    ],
  },
  {
    id: "game-day",
    name: "Game Day",
    description: "A high-energy sports board with a rotating fixtures stack and a scores ticker. Shows the Stack widget + digital clock.",
    category: "Sports",
    accent: ACCENT,
    build: () => [
      ground(),
      node("box", [0, 0, 620, 1080], { gradient: { from: ACCENT, to: ACCENT2, angle: 160 }, opacity: 0.9 }, {}, 2),
      T([80, 90, 460, 220], { color: "#fff", fontSize: 120, fontWeight: "900", align: "left", lineHeight: 0.92 }, { text: "GAME DAY" }, 10),
      node("line", [84, 330, 360, 14], { fill: "#fff", thickness: 14, radius: 6 }, {}, 10),
      node("clock", [80, 420, 460, 120], { color: "#fff", fontSize: 96, font: "mono", align: "left", bg: TRANSP }, { variant: "digital", hour12: false, seconds: false }, 10),
      node("date", [84, 560, 460, 50], { color: "#fff", fontSize: 34, align: "left", bg: TRANSP }, { variant: "long" }, 10),
      node("stack", [720, 150, 1120, 720], { bg: SURFACE, radius: 24, color: FG, shadow: "lg" }, {
        dwellMs: 4500, transition: "slide", shuffle: false,
        items: [
          item("g1", "text", { color: FG, fontSize: 92, fontWeight: "900", align: "center" }, { text: "United  2 – 1  City" }),
          item("g2", "text", { color: FG, fontSize: 92, fontWeight: "900", align: "center" }, { text: "Rovers  0 – 0  Athletic" }),
          item("g3", "text", { color: FG, fontSize: 92, fontWeight: "900", align: "center" }, { text: "Wanderers  3 – 2  County" }),
        ],
      }, 10),
      node("ticker", [0, 980, 1920, 100], { bg: ACCENT, color: "#fff", fontSize: 42, fontWeight: "700", speed: 110 }, { feedId: "", variant: "scroll", separator: "    ●    " }, 30),
    ],
  },

  /* -------------------------------- Finance ------------------------------ */
  {
    id: "index-board",
    name: "Index Board",
    description: "A clean markets summary — headline indices as metric tiles with trend arrows and a tape crawl. Shows Metric card/sideLabel + ticker.",
    category: "Finance",
    accent: ACCENT,
    build: () => [
      bg({ fill: GROUND_DEEP }),
      node("box", [0, 0, 1920, 104], { fill: SURFACE }, {}, 4),
      T([64, 26, 620, 52], { color: ACCENT, fontSize: 42, fontWeight: "900", align: "left", letterSpacing: 2 }, { text: "INDEX BOARD" }, 10),
      node("clock", [1500, 20, 360, 64], { color: FG, fontSize: 56, font: "mono", align: "right", bg: TRANSP }, { variant: "digital", hour12: false, seconds: true }, 10),
      node("metric", [64, 170, 580, 300], { bg: SURFACE, color: FG, accent: ACCENT, radius: 20, shadow: "md" }, { variant: "card", label: "S&P 500", value: "5,420", trend: "up", delta: "+0.82%" }, 12),
      node("metric", [670, 170, 580, 300], { bg: SURFACE, color: FG, accent: ACCENT2, radius: 20, shadow: "md" }, { variant: "card", label: "Nasdaq", value: "17,880", trend: "down", delta: "−0.31%" }, 12),
      node("metric", [1276, 170, 580, 300], { bg: SURFACE, color: FG, accent: ACCENT, radius: 20, shadow: "md" }, { variant: "card", label: "Gold", value: "$2,410", unit: "/oz", trend: "up", delta: "+0.45%" }, 12),
      node("metric", [64, 500, 880, 300], { bg: SURFACE, color: FG, accent: ACCENT, radius: 20, shadow: "md" }, { variant: "sideLabel", label: "EUR / USD", value: "1.0872", caption: "+0.12% on the day" }, 12),
      node("metric", [970, 500, 886, 300], { bg: SURFACE, color: FG, accent: ACCENT2, radius: 20, shadow: "md" }, { variant: "sideLabel", label: "Bitcoin", value: "$63,240", caption: "−1.4% on the day" }, 12),
      node("ticker", [0, 872, 1920, 100], { bg: SURFACE2, color: FG, fontSize: 38, fontWeight: "600", font: "mono", speed: 90 }, { feedId: "", variant: "scroll", separatorKind: "diamond" }, 28),
      node("ticker", [0, 980, 1920, 100], { bg: ACCENT, color: "#fff", fontSize: 40, fontWeight: "800", font: "mono", speed: 120 }, { feedId: "", variant: "scroll", badge: "LIVE", separatorKind: "bullet" }, 30),
    ],
  },
];

/** Templates grouped by category, in gallery order (skips empty categories). */
export function templatesByCategory(): { category: TemplateCategory; templates: Template[] }[] {
  return TEMPLATE_CATEGORIES
    .map((category) => ({ category, templates: TEMPLATES.filter((t) => t.category === category) }))
    .filter((g) => g.templates.length > 0);
}
