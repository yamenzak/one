/**
 * Widget-stack loop (§17). A stack cycles through its own child *widgets* on a
 * dwell timer — a "widget that loops widgets" — so a single footprint can rotate
 * rich content: a headline, then a clock, then a promo shape. Each item is a
 * fully-configured widget (type + style + config); the stack owns dwell,
 * transition, and shuffle. Resolution is pure and clock-driven, so every screen
 * showing the same stack lands on the same item at the same instant.
 */

import { type Config, type Style, bool, num, str } from "./types.js";

/** A stack item's embedded widget (no rect/rot/z — it fills the stack box). */
export interface StackWidget {
  type: string;
  style: Style;
  config: Config;
}
export interface StackItem {
  id: string;
  widget: StackWidget;
}

export const STACK_TRANSITIONS: { id: string; label: string }[] = [
  { id: "fade", label: "Fade" },
  { id: "slide", label: "Slide" },
  { id: "zoom", label: "Zoom" },
  { id: "flip", label: "Flip" },
  { id: "none", label: "Cut" },
];
/** Widget types that can be a stack item — every widget except a stack itself
 *  (no nesting). Each renders through the shared per-type renderer and supports
 *  data rebinding, so bound widgets (weather, ticker, boards) work as slides too. */
export const STACK_ITEM_TYPES = [
  "text", "clock", "date", "countdown", "metric", "menu", "qr", "cta",
  "weather", "ticker", "nowplaying", "image", "logo", "html",
  "queue_caller", "room_board", "room_status", "scoreboard",
  "box", "circle", "triangle", "line",
] as const;

/**
 * Normalize a stack's items to the widget shape, migrating the legacy
 * `{ kind: "text" | "image", text, url }` items authored before the recursive
 * model so old profiles keep working.
 */
export function stackItems(config: Config): StackItem[] {
  const raw = config.items;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it): it is Record<string, unknown> => !!it && typeof it === "object")
    .map((it, i) => {
      const id = str(it.id, `s${i}`);
      const w = it.widget as Record<string, unknown> | undefined;
      if (w && typeof w === "object" && typeof w.type === "string") {
        return { id, widget: { type: w.type, style: (w.style as Style) ?? {}, config: (w.config as Config) ?? {} } };
      }
      // Legacy migration.
      if (str(it.kind, "text") === "image") {
        return { id, widget: { type: "image", style: {}, config: { url: str(it.url), fit: "cover" } } };
      }
      const style: Style = {};
      if (it.color != null) style.color = str(it.color);
      if (it.bg != null) style.bg = str(it.bg);
      return { id, widget: { type: "text", style, config: { text: str(it.text) } } };
    });
}

export function stackDwellMs(config: Config): number {
  return Math.max(1000, num(config.dwellMs, 5000));
}
export function stackTransition(config: Config): string {
  const t = str(config.transition, "fade");
  return STACK_TRANSITIONS.some((x) => x.id === t) ? t : "fade";
}
export function stackShuffle(config: Config): boolean {
  return bool(config.shuffle);
}

/** A deterministic shuffle order for `n` items seeded by `seed` (same on every
 *  screen, so a "random" stack order stays in sync). */
function seededOrder(n: number, seed: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  let s = (seed >>> 0) || 1;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    const t = arr[i]!; arr[i] = arr[j]!; arr[j] = t;
  }
  return arr;
}

/**
 * Which item is showing at `nowMs`, from a shared epoch of 0. Deterministic:
 * `floor(now / dwell)` picks the position; with shuffle on, each full loop is a
 * fresh seeded permutation, identical across screens.
 */
export function stackResolve(
  items: StackItem[],
  dwellMs: number,
  nowMs: number,
  shuffle = false,
): { index: number; item: StackItem | null } {
  const n = items.length;
  if (n === 0) return { index: -1, item: null };
  const dwell = Math.max(1000, dwellMs);
  const tick = Math.floor(Math.max(0, nowMs) / dwell);
  const pos = tick % n;
  let index = pos;
  if (shuffle && n > 1) index = seededOrder(n, Math.floor(tick / n) + 1)[pos]!;
  return { index, item: items[index]! };
}
