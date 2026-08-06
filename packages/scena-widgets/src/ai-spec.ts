/**
 * Widget capability spec for the AI layout designer (§24). A compact, LLM-facing
 * description of every widget — derived from the registry (type, group, default
 * size, binding needs) merged with hand-maintained field/variant notes — so the
 * model can compose and edit `WNode[]` layouts without ever drifting from the
 * real widget set. Kept next to the registry so a new widget/variant updates it.
 */

import { WIDGET_REGISTRY, type WidgetDef } from "./registry.js";

/** Per-type authoring notes: what it's for + the config/style keys that matter. */
const NOTES: Record<string, string> = {
  text: "Freeform text/headline. config: text (string), variant (plain|panel|highlight|quote|underline). style: color, fontSize, fontWeight (300-900), align (left|center|right), font (sans|serif|mono|<family>), letterSpacing, textTransform. For a headline use large fontSize + bold weight.",
  clock: "Live clock. config: variant (digital|analog), hour12 (bool), seconds (bool), showDate (bool), dateVariant (full|long|medium|short), tz (IANA e.g. America/New_York), tzLabel. style: color, font, fontSize.",
  date: "Live date. config: variant (full|long|medium|short|weekday|numeric). style: color, fontSize, fontWeight.",
  countdown: "Countdown/up to a datetime. config: variant (blocks|inline|stacked), target (ISO e.g. 2026-12-31T23:59), countUp (bool), showDays (bool), doneText. style: color, accent, fontSize.",
  metric: "A KPI/stat. config: variant (card|sideLabel|ring), label, value, unit, caption, trend (up|down|flat|none), delta, percent (0-100 for ring). style: color, accent, bg (surface).",
  menu: "A priced list/menu. config: variant (rows|leaders|cards), title, items (array of {label, note?, value?}). style: color, accent, bg (surface).",
  qr: "A QR code. config: text (the URL/payload), caption. style: color (dark modules), paper (the code's own background — keep it light for scannability), bg (optional card behind the code — 'transparent' for a bare code), radius, pad.",
  cta: "An animated 'scan to act' call-to-action card (QR + headline + icon), on-brand by default. config: preset (google|feedback|follow|instagram|wifi|menu|tip|custom — sets the icon + default wording), url (where the scan goes; for wifi use wifiSsid + wifiPassword instead), headline/sub/hint (override the preset copy). style: accent, color, bg (surface). Great as a corner promo — pair with a display cycle so it isn't always on screen.",
  image: "An image. config: url (public https), fit (cover|contain|fill). style: radius, tint, filters.",
  logo: "The company/brand logo. config: url (use an EXACT brand-logo URL from the brand brief — never invent one), fit (contain|cover). Renders transparent (no surface) so it sits on any background. Place it small in a corner or header. Only use when brand logos are provided.",
  html: "A sandboxed HTML embed for anything custom. config: html (a self-contained HTML document string). Use sparingly for bespoke visuals.",
  ticker: "A horizontal news/RSS crawl (needs a feed source). config: feedId, variant (scroll|ribbon|headline|list), separator, badge. style: bg (surface), color, fontSize, speed. Usually full-width at the bottom.",
  stack: "A rotating loop of child widgets. config: items (array of {id, widget:{type,style,config}}), dwellMs, transition (fade|slide|zoom|flip). style: bg (surface).",
  nowplaying: "Now-playing music card (follows the channel's music). config: variant (bar|card|full|minimal). style: bg (surface), accent.",
  weather: "Weather (needs a weather source). config: sourceId, variant (small|current|day|week), units (metric|imperial). style: bg (surface).",
  queue_caller: "Queue now-serving display (needs a queue board). config: boardId, variant (solo|recent|grid|strip). style: bg (surface).",
  room_board: "Room-status grid (needs a room board). config: boardId. style: bg (surface).",
  room_status: "A single room's status door (needs a room board). config: boardId, roomId.",
  scoreboard: "Live scoreboard (needs a score board). config: boardId, variant (classic|stacked). style: bg (surface).",
  box: "A solid/gradient rectangle — backgrounds, panels, accents. style: fill, gradient {from,to,angle}, radius, opacity.",
  circle: "A circle/dot accent. style: fill, opacity.",
  triangle: "A triangle accent. style: fill, opacity.",
  line: "A divider line/rule. config via style: fill (color), thickness, lineStyle (solid|dashed|dotted|gradient).",
};

function describe(def: WidgetDef): string {
  const [w, h] = def.size;
  const bind = def.needsBinding ? ` (needs a ${def.needsBinding} source)` : "";
  const note = NOTES[def.type] ?? "";
  return `- ${def.type}${bind} — default ${w}×${h}. ${note}`;
}

/** The full widget catalogue as an LLM prompt block. */
export function describeWidgets(): string {
  return WIDGET_REGISTRY.map(describe).join("\n");
}

/** The style keys shared by (almost) every widget, for the layout prompt. */
export const SHARED_STYLE_NOTES =
  "Shared style keys on any widget: bg (container background — set to 'transparent' for no surface, or 'var(--w-surface)' for brand glass), radius, opacity (0-1), shadow (none|sm|md|lg|glow), borderW + borderColor. contentScale (0.4-2, default 1) scales the inner content within the box — use it to fine-tune density on countdown/metric/menu without resizing the tile. Colors accept hex or oklch(); prefer the brand tokens var(--w-accent), var(--w-fg), var(--w-surface) so the layout follows the tenant brand.";
