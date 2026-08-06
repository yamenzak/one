import { describe, it, expect } from "vitest";
import { parseRss } from "../src/feeds.js";

describe("parseRss", () => {
  it("extracts RSS item titles + links", () => {
    const xml = `<rss><channel>
      <item><title>First headline</title><link>https://ex.com/1</link></item>
      <item><title><![CDATA[Second & bold]]></title><link>https://ex.com/2</link></item>
    </channel></rss>`;
    const items = parseRss(xml);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ title: "First headline", link: "https://ex.com/1" });
    expect(items[1]!.title).toBe("Second & bold"); // CDATA + entity decoded
  });

  it("handles Atom entries with href links", () => {
    const xml = `<feed><entry><title>Atom item</title><link href="https://ex.com/a"/></entry></feed>`;
    const items = parseRss(xml);
    expect(items[0]).toEqual({ title: "Atom item", link: "https://ex.com/a" });
  });

  it("returns empty for non-feed input", () => {
    expect(parseRss("<html><body>nope</body></html>")).toEqual([]);
  });
});

import { getPath, jsonToDataset, parseCsv, csvToDataset, itemsToDataset, sheetCsvUrl } from "../src/feeds.js";

describe("source normalization (§sources)", () => {
  it("getPath follows dot + bracket paths", () => {
    const root = { data: { items: [{ v: 1 }, { v: 2 }] }, n: 5 };
    expect(getPath(root, "data.items[1].v")).toBe(2);
    expect(getPath(root, "n")).toBe(5);
    expect(getPath(root, "")).toBe(root);
    expect(getPath(root, "missing.path")).toBeUndefined();
  });
  it("jsonToDataset: array of objects → union columns", () => {
    const ds = jsonToDataset([{ name: "A", price: 3 }, { name: "B", note: "x" }]);
    expect(ds.columns).toEqual(["name", "price", "note"]);
    expect(ds.rows).toEqual([["A", "3", ""], ["B", "", "x"]]);
  });
  it("jsonToDataset: object → key/value rows; scalar → value", () => {
    expect(jsonToDataset({ revenue: 1200, orders: 42 })).toEqual({ columns: ["key", "value"], rows: [["revenue", "1200"], ["orders", "42"]] });
    expect(jsonToDataset("hi")).toEqual({ columns: ["value"], rows: [["hi"]] });
    expect(jsonToDataset([1, 2, 3])).toEqual({ columns: ["value"], rows: [["1"], ["2"], ["3"]] });
  });
  it("parseCsv handles quotes, commas, and embedded newlines", () => {
    const rows = parseCsv('a,b,c\n"x,y","line\n2",z');
    expect(rows[0]).toEqual(["a", "b", "c"]);
    expect(rows[1]).toEqual(["x,y", "line\n2", "z"]);
  });
  it("csvToDataset uses the first row as headers", () => {
    const ds = csvToDataset("Item,Price\nEspresso,$3\nTea,$2\n");
    expect(ds.columns).toEqual(["Item", "Price"]);
    expect(ds.rows).toEqual([["Espresso", "$3"], ["Tea", "$2"]]);
  });
  it("itemsToDataset maps feed items to a title/link table", () => {
    expect(itemsToDataset([{ id: "1", title: "H", link: "u" }, { id: "2", title: "H2", link: null }]))
      .toEqual({ columns: ["title", "link"], rows: [["H", "u"], ["H2", ""]] });
  });
  it("sheetCsvUrl extracts id + gid from a pasted URL or raw id", () => {
    expect(sheetCsvUrl({ url: "https://docs.google.com/spreadsheets/d/ABC123def456GHI789jkl/edit#gid=42" }))
      .toBe("https://docs.google.com/spreadsheets/d/ABC123def456GHI789jkl/gviz/tq?tqx=out:csv&gid=42");
    expect(sheetCsvUrl({ sheetId: "ABC123def456GHI789jklMNO" }))
      .toBe("https://docs.google.com/spreadsheets/d/ABC123def456GHI789jklMNO/gviz/tq?tqx=out:csv&gid=0");
    expect(sheetCsvUrl({ url: "not a sheet" })).toBeNull();
  });
});
