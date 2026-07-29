import { describe, expect, it } from "vitest";
import { packPages, fits, formOf, GRID_COLS, GRID_ROWS } from "./screens/widget-pack.js";
import { TILE_FOOTPRINT, type TileForm } from "@4dl/ui";

type I = { form: TileForm; page?: number };
const read = (t: I) => t;
const pack = (items: I[]) => packPages(items, read);

/** No two placements on a page may overlap, and none may leave the grid. */
function assertSound(page: { col: number; row: number; cols: number; rows: number }[]) {
  const seen = new Set<string>();
  for (const p of page) {
    expect(p.col + p.cols).toBeLessThanOrEqual(GRID_COLS);
    expect(p.row + p.rows).toBeLessThanOrEqual(GRID_ROWS);
    for (let r = p.row; r < p.row + p.rows; r++) {
      for (let c = p.col; c < p.col + p.cols; c++) {
        const k = `${r},${c}`;
        expect(seen.has(k), `cell ${k} used twice`).toBe(false);
        seen.add(k);
      }
    }
  }
}

describe("widget packing", () => {
  it("normalises legacy size to a form", () => {
    expect(formOf({ id: "a", size: "big" })).toBe("ring");
    expect(formOf({ id: "a", size: "small" })).toBe("card");
    expect(formOf({ id: "a" })).toBe("card");
    // An explicit form always wins over a stale size.
    expect(formOf({ id: "a", size: "big", form: "trend" })).toBe("trend");
  });

  it("fills a page before starting the next, and never overlaps", () => {
    const pages = pack(Array.from({ length: 7 }, () => ({ form: "card" as TileForm })));
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(6); // 2x3 = six 1x1 cards
    expect(pages[1]).toHaveLength(1);
    pages.forEach(assertSound);
  });

  it("gives a ring a whole column and packs cards beside it", () => {
    const pages = pack([{ form: "ring" }, { form: "card" }, { form: "card" }, { form: "card" }]);
    expect(pages).toHaveLength(1);
    const ring = pages[0]!.find((p) => p.form === "ring")!;
    expect(ring.rows).toBe(3);
    expect(ring.col).toBe(0);
    assertSound(pages[0]!);
  });

  it("a 2-wide form takes a full row and pushes when it cannot fit", () => {
    // card, card fills row 0; trend needs BOTH columns so it must go to row 1.
    const pages = pack([{ form: "card" }, { form: "card" }, { form: "trend" }]);
    expect(pages).toHaveLength(1);
    const trend = pages[0]!.find((p) => p.form === "trend")!;
    expect(trend.row).toBe(1);
    expect(trend.cols).toBe(2);
    assertSound(pages[0]!);
  });

  it("a ring leaves no room for a 2-wide form, so it flows to the next page", () => {
    const pages = pack([{ form: "ring" }, { form: "trend" }]);
    expect(pages).toHaveLength(2);
    expect(pages[1]![0]!.form).toBe("trend");
    pages.forEach(assertSound);
  });

  it("honours authored pages exactly, including a deliberately sparse one", () => {
    const pages = pack([
      { form: "card", page: 0 },
      { form: "ring", page: 1 },
    ]);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(1);
    expect(pages[1]![0]!.form).toBe("ring");
  });

  it("drops overflow on an authored page rather than reflowing the client's layout", () => {
    const pages = pack([
      { form: "ring", page: 0 }, { form: "ring", page: 0 }, // fills both columns
      { form: "card", page: 0 }, // no room left
    ]);
    expect(pages[0]).toHaveLength(2);
  });

  it("every form fits an otherwise empty page", () => {
    for (const form of Object.keys(TILE_FOOTPRINT) as TileForm[]) {
      expect(fits([], form), `${form} must fit an empty page`).toBe(true);
      expect(pack([{ form }])).toHaveLength(1);
    }
  });

  it("fits() agrees with what packing actually does", () => {
    const page: { form: TileForm }[] = [{ form: "card" }, { form: "card" }];
    expect(fits(page, "trend")).toBe(true);
    expect(fits([{ form: "ring" }], "trend")).toBe(false);
    expect(fits([{ form: "ring" }], "card")).toBe(true);
    expect(fits([{ form: "ring" }, { form: "ring" }], "card")).toBe(false);
  });
});
