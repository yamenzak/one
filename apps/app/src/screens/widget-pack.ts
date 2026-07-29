/**
 * Packing placed widgets into hero pages — pure, so the carousel and the
 * builder cannot disagree about what a layout looks like.
 *
 * That is the whole reason this is a separate module rather than a closure
 * inside the carousel. The old customizer was a list of rows with up/down
 * arrows, and the only way to find out what your arrangement actually looked
 * like was to save it and go back. Once the builder draws real pages, the
 * builder and the hero MUST agree pixel for pixel, and the only way to
 * guarantee that is one function both of them call.
 *
 * The grid is 2 columns × 3 rows per page. Each form's footprint comes from
 * `TILE_FOOTPRINT` in `@4dl/ui` — this module never hard-codes a shape.
 */

import { TILE_FOOTPRINT, type TileForm } from "@4dl/ui";
import type { WidgetItem, WidgetForm } from "@kova/protocol";

export const GRID_COLS = 2;
export const GRID_ROWS = 3;

/** A widget placed at a known spot on a known page. */
export interface Placement<T> {
  item: T;
  form: TileForm;
  col: number; // 0-based
  row: number; // 0-based
  cols: number;
  rows: number;
}

/**
 * Legacy layouts stored `size`, not `form`. Normalising here (rather than at
 * every read site) means the rest of the app only ever sees a form.
 */
export function formOf(it: WidgetItem): TileForm {
  if (it.form) return it.form as TileForm;
  return it.size === "big" ? "ring" : "card";
}

/** A page's occupancy: `grid[row][col]`. */
type Grid = boolean[][];
const emptyGrid = (): Grid => Array.from({ length: GRID_ROWS }, () => Array.from({ length: GRID_COLS }, () => false));

/** First free spot, scanning top-left to bottom-right, that fits `cols × rows`. */
function findSpot(g: Grid, cols: number, rows: number): { col: number; row: number } | null {
  for (let r = 0; r + rows <= GRID_ROWS; r++) {
    for (let c = 0; c + cols <= GRID_COLS; c++) {
      let free = true;
      for (let dr = 0; dr < rows && free; dr++) for (let dc = 0; dc < cols; dc++) if (g[r + dr]![c + dc]) { free = false; break; }
      if (free) return { col: c, row: r };
    }
  }
  return null;
}

function occupy(g: Grid, col: number, row: number, cols: number, rows: number): void {
  for (let dr = 0; dr < rows; dr++) for (let dc = 0; dc < cols; dc++) g[row + dr]![col + dc] = true;
}

/**
 * Lay `items` out into pages.
 *
 * When any item declares a `page`, pages are taken as authored — the builder
 * writes them, so the client's arrangement is preserved exactly, including a
 * deliberately half-empty page. Otherwise (legacy layouts) items flow in order
 * and a new page starts when the current one cannot fit the next widget.
 *
 * An item whose form cannot fit an EMPTY page is dropped rather than silently
 * shrunk — there is no such form today, but a future one that is too big should
 * fail visibly in review rather than quietly render as something else.
 */
export function packPages<T>(items: T[], read: (t: T) => { form: TileForm; page?: number }): Placement<T>[][] {
  const authored = items.some((i) => read(i).page != null);
  const pages: Placement<T>[][] = [];
  const grids: Grid[] = [];

  const ensure = (n: number) => { while (pages.length <= n) { pages.push([]); grids.push(emptyGrid()); } };

  if (authored) {
    for (const item of items) {
      const { form, page = 0 } = read(item);
      const fp = TILE_FOOTPRINT[form];
      ensure(page);
      const spot = findSpot(grids[page]!, fp.cols, fp.rows);
      if (!spot) continue; // over-stuffed page: drop the overflow rather than reflow someone's layout
      occupy(grids[page]!, spot.col, spot.row, fp.cols, fp.rows);
      pages[page]!.push({ item, form, ...spot, cols: fp.cols, rows: fp.rows });
    }
    // An authored layout can leave a hole in the middle (page 2 emptied but
    // page 3 kept). Renumbering would move widgets the client did not touch, so
    // only genuinely trailing empties are trimmed.
    while (pages.length && pages[pages.length - 1]!.length === 0) pages.pop();
    return pages.filter((p, i) => p.length > 0 || i < pages.length - 1);
  }

  let cur = 0;
  ensure(0);
  for (const item of items) {
    const { form } = read(item);
    const fp = TILE_FOOTPRINT[form];
    let spot = findSpot(grids[cur]!, fp.cols, fp.rows);
    if (!spot) {
      cur += 1;
      ensure(cur);
      spot = findSpot(grids[cur]!, fp.cols, fp.rows);
      if (!spot) continue; // does not fit an empty page at all
    }
    occupy(grids[cur]!, spot.col, spot.row, fp.cols, fp.rows);
    pages[cur]!.push({ item, form, ...spot, cols: fp.cols, rows: fp.rows });
  }
  return pages.filter((p) => p.length > 0);
}

/** Whether `form` still fits on the page holding `items` — drives the builder's
 *  slot affordances, so it can grey out a form that cannot be placed. */
export function fits(items: { form: TileForm }[], form: TileForm): boolean {
  const g = emptyGrid();
  for (const it of items) {
    const f = TILE_FOOTPRINT[it.form];
    const spot = findSpot(g, f.cols, f.rows);
    if (spot) occupy(g, spot.col, spot.row, f.cols, f.rows);
  }
  const fp = TILE_FOOTPRINT[form];
  return findSpot(g, fp.cols, fp.rows) != null;
}

export type { WidgetItem, WidgetForm };
