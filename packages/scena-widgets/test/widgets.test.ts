import { describe, it, expect } from "vitest";
import {
  fillValue,
  shadowValue,
  shapeCss,
  lineCss,
  clockFormat,
  formatClock,
  formatDate,
  textDisplay,
  tickerVariant,
  tickerBadge,
  stackItems,
  stackResolve,
  defaultsFor,
  widgetDef,
  WIDGET_REGISTRY,
  displayVisible,
  displaySummary,
  displayPose,
  displayEase,
  ctaPayload,
  ctaDefaults,
  ctaBodyHtml,
  ctaContainerCss,
} from "../src/index.js";

describe("fills", () => {
  it("prefers a gradient when declared", () => {
    expect(fillValue({ gradient: { from: "#000", to: "#fff", angle: 90 } })).toBe("linear-gradient(90deg, #000, #fff)");
  });
  it("falls back to solid fill then legacy bg", () => {
    expect(fillValue({ fill: "red" })).toBe("red");
    expect(fillValue({ bg: "blue" })).toBe("blue");
    expect(fillValue({})).toBeUndefined();
  });
  it("maps shadow presets and passes raw strings through", () => {
    expect(shadowValue({ shadow: "none" })).toBeUndefined();
    expect(shadowValue({ shadow: "md" })).toContain("24px");
    expect(shadowValue({ shadow: "0 0 1px red" })).toBe("0 0 1px red");
    expect(shadowValue({})).toBeUndefined();
  });
});

describe("shapes", () => {
  it("circle is fully rounded, triangle is clipped", () => {
    expect(shapeCss("circle", {}).borderRadius).toBe("50%");
    expect(shapeCss("triangle", {}).clipPath).toContain("polygon");
  });
  it("stroke becomes a per-side border except on triangles", () => {
    const box = shapeCss("box", { strokeWidth: 3, stroke: "#f00" });
    expect(box.borderTop).toBe("3px solid #f00");
    expect(box.borderLeft).toBe("3px solid #f00");
    expect(shapeCss("triangle", { strokeWidth: 3 }).borderTop).toBeUndefined();
  });
  it("per-side border width overrides a single side", () => {
    const box = shapeCss("box", { borderStyle: "solid", borderColor: "#0f0", borderW: 2, borderWT: 8 });
    expect(box.borderTop).toBe("8px solid #0f0");
    expect(box.borderBottom).toBe("2px solid #0f0");
  });
  it("per-corner radius composes into a four-value radius", () => {
    expect(shapeCss("box", { radius: 4, radiusTL: 20 }).borderRadius).toBe("20px 4px 4px 4px");
  });
  it("line thickness drives the bar height", () => {
    expect(lineCss({ thickness: 10 }).height).toBe("10px");
  });
});

describe("clock + date", () => {
  const d = new Date(2026, 0, 6, 9, 5, 3); // Tue Jan 6 2026 09:05:03

  it("builds a format from hour12/seconds config", () => {
    expect(clockFormat({ hour12: false, seconds: true })).toBe("HH:mm:ss");
    expect(clockFormat({ hour12: true, seconds: false })).toBe("hh:mm A");
  });
  it("formats 24h and 12h", () => {
    expect(formatClock(d, "HH:mm:ss")).toBe("09:05:03");
    expect(formatClock(d, "hh:mm A")).toBe("09:05 AM");
  });
  it("date variants render distinctly", () => {
    expect(formatDate(d, "weekday")).toBe("Tuesday");
    expect(formatDate(d, "short")).toBe("Jan 6");
    expect(formatDate(d, "numeric")).toBe("01/06/2026");
  });
  it("textDisplay routes by type", () => {
    expect(textDisplay("clock", { hour12: false, seconds: false }, d.getTime())).toBe("09:05");
    expect(textDisplay("date", { variant: "weekday" }, d.getTime())).toBe("Tuesday");
    expect(textDisplay("text", { text: "hi" }, 0)).toBe("hi");
  });
});

describe("ticker", () => {
  it("clamps the variant and reads a badge", () => {
    expect(tickerVariant({ variant: "list" })).toBe("list");
    expect(tickerVariant({ variant: "nope" })).toBe("scroll");
    expect(tickerBadge({ badge: " LIVE " })?.text).toBe("LIVE");
    expect(tickerBadge({ badge: "" })).toBeNull();
  });
});

describe("stack", () => {
  const items = stackItems({ items: [{ id: "a", kind: "text", text: "1" }, { kind: "image", url: "u" }] });
  it("normalizes + migrates legacy items to widgets, defaults ids", () => {
    expect(items).toHaveLength(2);
    expect(items[0]!.id).toBe("a");
    expect(items[0]!.widget.type).toBe("text");
    expect(items[1]!.widget.type).toBe("image");
    expect(items[1]!.id).toBe("s1");
  });
  it("resolves deterministically by clock", () => {
    expect(stackResolve(items, 5000, 0).index).toBe(0);
    expect(stackResolve(items, 5000, 5001).index).toBe(1);
    expect(stackResolve(items, 5000, 10000).index).toBe(0); // wraps
    expect(stackResolve([], 5000, 0).item).toBeNull();
  });
});

describe("fonts", () => {
  it("resolves the curated ids and any bundled family name", async () => {
    const { fontFamilyValue } = await import("../src/index.js");
    expect(fontFamilyValue({ font: "sans" })).toContain("Hanken Grotesk");
    expect(fontFamilyValue({ font: "mono" })).toContain("JetBrains Mono");
    // A bundled, self-hosted slide font quotes cleanly with a safe fallback.
    expect(fontFamilyValue({ font: "Poppins" })).toBe("'Poppins', system-ui, sans-serif");
    expect(fontFamilyValue({ font: "Playfair Display" })).toBe("'Playfair Display', system-ui, sans-serif");
    // A full stack passes through; empty falls back to the default.
    expect(fontFamilyValue({ font: "Foo, serif" })).toBe("Foo, serif");
    expect(fontFamilyValue({})).toContain("Hanken Grotesk");
  });
});

describe("registry", () => {
  it("every entry has an icon, size, and clonable defaults", () => {
    for (const def of WIDGET_REGISTRY) {
      expect(def.icon).toBeTruthy();
      expect(def.size).toHaveLength(2);
    }
  });
  it("defaultsFor deep-clones so nodes never alias the registry", () => {
    const a = defaultsFor("stack");
    const b = defaultsFor("stack");
    (a.config.items as unknown[]).push({ id: "x" });
    expect((b.config.items as unknown[]).length).toBe(2);
  });
  it("resolves known types and is undefined for unknown", () => {
    expect(widgetDef("circle")?.label).toBe("Circle");
    expect(widgetDef("nope")).toBeUndefined();
  });
});

describe("scaling model (§17)", () => {
  it("scalerFit contains the intrinsic box in the frame (min ratio)", async () => {
    const { scalerFit } = await import("../src/index.js");
    expect(scalerFit(100, 100, 200, 200)).toBe(2); // square → 2×
    expect(scalerFit(100, 50, 200, 200)).toBe(2);  // limited by width ratio (200/100)
    expect(scalerFit(200, 100, 200, 200)).toBe(1);  // limited by height ratio (200/100→ width 200/200=1)
    expect(scalerFit(100, 100, 50, 100)).toBe(0.5); // shrink
  });
  it("scalerFit is defensive about zero/negative sizes", async () => {
    const { scalerFit } = await import("../src/index.js");
    expect(scalerFit(0, 100, 200, 200)).toBe(1);
    expect(scalerFit(100, 100, 0, 200)).toBe(1);
  });
  it("resolveScaleMode falls back to reflow for legacy nodes, honours stored", async () => {
    const { resolveScaleMode } = await import("../src/index.js");
    expect(resolveScaleMode("clock")).toBe("reflow");        // legacy → unchanged
    expect(resolveScaleMode("clock", null)).toBe("reflow");
    expect(resolveScaleMode("clock", "uniform")).toBe("uniform");
    expect(resolveScaleMode("clock", "bogus")).toBe("reflow");
  });
  it("registry carries a scale mode for every widget; new clocks default uniform", async () => {
    const { WIDGET_REGISTRY, defaultsFor, intrinsicSize } = await import("../src/index.js");
    expect(WIDGET_REGISTRY.every((w) => w.scaleMode === "uniform" || w.scaleMode === "reflow")).toBe(true);
    expect(defaultsFor("clock").scaleMode).toBe("uniform");
    expect(defaultsFor("ticker").scaleMode).toBe("reflow");
    expect(intrinsicSize("clock")).toEqual([460, 150]); // defaults to footprint
  });
});

describe("clocks (§17)", () => {
  it("clockHands maps time to degrees (3:00:00 → hour 90°, minute 0°)", async () => {
    const { clockHands } = await import("../src/index.js");
    const h = clockHands(new Date(2026, 0, 6, 3, 0, 0));
    expect(h.hour).toBeCloseTo(90, 5);
    expect(h.minute).toBe(0);
    expect(h.second).toBe(0);
    const h2 = clockHands(new Date(2026, 0, 6, 6, 30, 15));
    expect(h2.minute).toBe(30 * 6 + (15 / 60) * 6); // 183°
    expect(h2.second).toBe(90);
  });
  it("clockIsAnalog reads the variant", async () => {
    const { clockIsAnalog } = await import("../src/index.js");
    expect(clockIsAnalog({ variant: "analog" })).toBe(true);
    expect(clockIsAnalog({ variant: "digital" })).toBe(false);
    expect(clockIsAnalog({})).toBe(false);
  });
  it("analog SVG has a face + three hands when seconds on, two when off", async () => {
    const { analogClockSvg } = await import("../src/index.js");
    const on = analogClockSvg(new Date(2026, 0, 6, 10, 8, 30), {}, { seconds: true });
    expect(on).toContain("<svg");
    expect((on.match(/<line/g) || []).length).toBeGreaterThanOrEqual(12 + 3); // ticks + hands
    const off = analogClockSvg(new Date(2026, 0, 6, 10, 8, 30), {}, { seconds: false });
    expect((on.match(/<line/g) || []).length).toBe((off.match(/<line/g) || []).length + 1);
  });
  it("clockBodyHtml appends a date line only when showDate is on", async () => {
    const { clockBodyHtml } = await import("../src/index.js");
    const d = new Date(2026, 0, 6, 9, 41, 0);
    expect(clockBodyHtml(d, {}, { variant: "digital", showDate: false }, 150)).not.toContain("Jan");
    expect(clockBodyHtml(d, {}, { variant: "digital", showDate: true, dateVariant: "medium" }, 150)).toContain("Jan");
  });
});

describe("recursive widget stack (§17)", () => {
  it("migrates legacy text/image items to the widget shape", async () => {
    const { stackItems } = await import("../src/index.js");
    const items = stackItems({ items: [
      { id: "a", kind: "text", text: "Hi" },
      { id: "b", kind: "image", url: "x.png" },
    ] });
    expect(items[0]).toEqual({ id: "a", widget: { type: "text", style: {}, config: { text: "Hi" } } });
    expect(items[1]!.widget.type).toBe("image");
    expect(items[1]!.widget.config).toEqual({ url: "x.png", fit: "cover" });
  });
  it("passes through new widget items untouched", async () => {
    const { stackItems } = await import("../src/index.js");
    const items = stackItems({ items: [{ id: "c", widget: { type: "clock", style: { color: "#fff" }, config: { variant: "analog" } } }] });
    expect(items[0]!.widget.type).toBe("clock");
    expect(items[0]!.widget.config).toEqual({ variant: "analog" });
  });
  it("stackResolve cycles by dwell and is deterministic", async () => {
    const { stackResolve } = await import("../src/index.js");
    const items = stackItems2();
    expect(stackResolve(items, 5000, 0).index).toBe(0);
    expect(stackResolve(items, 5000, 5000).index).toBe(1);
    expect(stackResolve(items, 5000, 10000).index).toBe(2);
    expect(stackResolve(items, 5000, 15000).index).toBe(0);
  });
  it("shuffle stays in sync (same now → same index) and is a permutation", async () => {
    const { stackResolve } = await import("../src/index.js");
    const items = stackItems2();
    const a = stackResolve(items, 5000, 7000, true).index;
    const b = stackResolve(items, 5000, 7000, true).index;
    expect(a).toBe(b);
    const loop = [0, 1, 2].map((k) => stackResolve(items, 5000, k * 5000, true).index).sort();
    expect(loop).toEqual([0, 1, 2]); // one full loop visits every item once
  });
});
function stackItems2() {
  return [
    { id: "a", widget: { type: "text", style: {}, config: {} } },
    { id: "b", widget: { type: "text", style: {}, config: {} } },
    { id: "c", widget: { type: "text", style: {}, config: {} } },
  ];
}

describe("countdown (§17)", () => {
  it("splits remaining time into d/h/m/s and flags done", async () => {
    const { countdownParts } = await import("../src/index.js");
    const target = Date.UTC(2026, 0, 2, 1, 2, 3);
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    const p = countdownParts(target, now);
    expect(p).toMatchObject({ days: 1, hours: 1, minutes: 2, seconds: 3, done: false });
    expect(countdownParts(target, target + 1000).done).toBe(true);
  });
  it("counts up (elapsed) without a done flag", async () => {
    const { countdownParts } = await import("../src/index.js");
    const start = Date.UTC(2026, 0, 1, 0, 0, 0);
    const p = countdownParts(start, start + 90_000, true);
    expect(p).toMatchObject({ minutes: 1, seconds: 30, done: false });
  });
  it("renders a done message once past the target", async () => {
    const { countdownBodyHtml } = await import("../src/index.js");
    const target = Date.UTC(2026, 0, 1);
    const html = countdownBodyHtml({}, { target: new Date(target).toISOString(), doneText: "Live now" }, target + 5000, 200);
    expect(html).toContain("Live now");
  });
});

describe("metric + menu", () => {
  it("metric clamps trend and renders the value + label", async () => {
    const { metricTrend, metricBodyHtml } = await import("../src/index.js");
    expect(metricTrend({ trend: "up" })).toBe("up");
    expect(metricTrend({ trend: "bogus" })).toBe("none");
    const html = metricBodyHtml({}, { value: "42", unit: "%", label: "Load" }, 300);
    expect(html).toContain("42");
    expect(html).toContain("Load");
    expect(html).toContain("%");
  });
  it("menu parses items and renders rows", async () => {
    const { menuItems, menuBodyHtml } = await import("../src/index.js");
    const cfg = { items: [{ label: "Coffee", value: "$3" }, { label: "Tea", value: "$2", note: "green" }] };
    expect(menuItems(cfg)).toHaveLength(2);
    const html = menuBodyHtml({}, { ...cfg, title: "Drinks" }, 600);
    expect(html).toContain("Coffee");
    expect(html).toContain("$3");
    expect(html).toContain("Drinks");
  });
});

describe("qr encoder", () => {
  it("picks a version-1 matrix (21×21) for a short string", async () => {
    const { qrMatrix } = await import("../src/index.js");
    const m = qrMatrix("HI", "M");
    expect(m).toHaveLength(21);
    expect(m[0]).toHaveLength(21);
  });
  it("lays the three finder patterns at the corners", async () => {
    const { qrMatrix } = await import("../src/index.js");
    const m = qrMatrix("https://scena.app", "M");
    const n = m.length;
    const finderAt = (r0: number, c0: number) => {
      // outer ring dark, inner ring light, 3×3 dark core — the finder signature.
      return m[r0]![c0] === true && m[r0 + 1]![c0 + 1] === false && m[r0 + 3]![c0 + 3] === true && m[r0]![c0 + 6] === true;
    };
    expect(finderAt(0, 0)).toBe(true);
    expect(finderAt(0, n - 7)).toBe(true);
    expect(finderAt(n - 7, 0)).toBe(true);
  });
  it("has the timing patterns alternating on row/col 6", async () => {
    const { qrMatrix } = await import("../src/index.js");
    const m = qrMatrix("test", "M");
    for (let i = 8; i < m.length - 8; i++) {
      expect(m[6]![i]).toBe(i % 2 === 0);
      expect(m[i]![6]).toBe(i % 2 === 0);
    }
  });
  it("grows the version with the payload and refuses over-long text", async () => {
    const { qrMatrix } = await import("../src/index.js");
    expect(qrMatrix("x".repeat(10), "M").length).toBe(21); // version 1 (≤16 B)
    expect(qrMatrix("x".repeat(20), "M").length).toBe(25); // version 2 (≤28 B)
    expect(qrMatrix("x".repeat(3000), "M")).toHaveLength(0); // too big for v1–10
  });
  it("matches a golden matrix (RS ECC + masking are byte-exact)", async () => {
    // Locked to the output verified to decode back to "SCENA" via jsQR. Guards the
    // Reed–Solomon ECC + mask selection against regressions.
    const { qrMatrix } = await import("../src/index.js");
    const sig = qrMatrix("SCENA", "M").map((row) => parseInt(row.map((b) => (b ? 1 : 0)).join(""), 2).toString(36)).join(",");
    expect(sig).toBe("18m7z,mzwh,woyl,wqql,wti5,mtz5,18prz,2yo,twk2,8qiy,nqcb,16zwh,ql3p,59c,18nov,mw1c,ws87,wpd2,wsnl,muki,18pqv");
  });
});

describe("clock timezone + weather units (§17 enhancements)", () => {
  it("zonedDate shifts an instant into an IANA zone and tolerates bad input", async () => {
    const { zonedDate } = await import("../src/index.js");
    const utc = new Date("2026-06-01T12:00:00Z");
    const ny = zonedDate(utc, "America/New_York"); // UTC-4 in June
    const tk = zonedDate(utc, "Asia/Tokyo");       // UTC+9
    expect(tk.getHours() - ny.getHours()).toBe(13);
    expect(zonedDate(utc, "").getTime()).toBe(utc.getTime());
    expect(zonedDate(utc, "Not/AZone").getTime()).toBe(utc.getTime());
  });
  it("applyWeatherUnits converts °C↔°F and passes through when unchanged", async () => {
    const { applyWeatherUnits } = await import("../src/index.js");
    const base = { label: "x", units: "metric" as const,
      current: { temp: 20, feelsLike: 18, hi: 25, lo: 15, condition: "", icon: "clear-day" as const, humidity: 50, wind: 10, pop: 0 },
      hourly: [{ dt: 0, temp: 10, icon: "clear-day" as const, pop: 0 }],
      daily: [{ dt: 0, hi: 30, lo: 20, icon: "clear-day" as const, pop: 0 }] };
    const imp = applyWeatherUnits(base, "imperial");
    expect(imp.units).toBe("imperial");
    expect(imp.current.temp).toBe(68); // 20°C → 68°F
    expect(imp.daily[0]!.hi).toBe(86); // 30°C → 86°F
    expect(applyWeatherUnits(base, "metric")).toBe(base); // no-op
    expect(applyWeatherUnits(base, "")).toBe(base);
  });
});

describe("dynamic sources (§sources)", () => {
  const ds = { columns: ["Item", "Price", "Note"], rows: [["Espresso", "$3", "double"], ["Tea", "$2", "green"], ["Cold brew", "$5", ""]] };
  it("resolves a value binding by column name and row", async () => {
    const { resolveValue } = await import("../src/index.js");
    expect(resolveValue(ds, { sourceId: "s", col: "Price", row: 0 })).toBe("$3");
    expect(resolveValue(ds, { sourceId: "s", col: "Item", row: 2 })).toBe("Cold brew");
    expect(resolveValue(ds, { sourceId: "s", col: 1 })).toBe("$3"); // by index, default row 0
  });
  it("joins a whole column when asked", async () => {
    const { resolveValue } = await import("../src/index.js");
    expect(resolveValue(ds, { sourceId: "s", col: "Item", join: " · " })).toBe("Espresso · Tea · Cold brew");
  });
  it("resolves a list binding into label/value/note rows", async () => {
    const { resolveList } = await import("../src/index.js");
    const rows = resolveList(ds, { sourceId: "s", kind: "list", labelCol: "Item", valueCol: "Price", noteCol: "Note", max: 2 });
    expect(rows).toEqual([{ label: "Espresso", value: "$3", note: "double" }, { label: "Tea", value: "$2", note: "green" }]);
  });
  it("overlays bindings onto config, leaving unbound fields + missing sources alone", async () => {
    const { applyBindings } = await import("../src/index.js");
    const config = { value: "0", label: "Sales", bindings: { value: { sourceId: "s1", col: "Price", row: 0 }, items: { sourceId: "s2", kind: "list", labelCol: "Item", valueCol: "Price" } } };
    const out = applyBindings(config, { s1: ds }); // s2 missing → items untouched
    expect(out.value).toBe("$3");
    expect(out.label).toBe("Sales"); // unbound, unchanged
    expect(out.items).toBeUndefined(); // source not loaded yet
    const out2 = applyBindings(config, { s1: ds, s2: ds });
    expect((out2.items as unknown[]).length).toBe(3);
  });
  it("lists the source ids a widget references", async () => {
    const { boundSourceIds, hasBindings } = await import("../src/index.js");
    const config = { bindings: { value: { sourceId: "a" }, delta: { sourceId: "b" }, label: { sourceId: "a" } } };
    expect(boundSourceIds(config).sort()).toEqual(["a", "b"]);
    expect(hasBindings(config)).toBe(true);
    expect(hasBindings({})).toBe(false);
  });
});

describe("ticker across sources (§sources)", () => {
  it("tickerTitles reads the chosen column, defaulting to title", async () => {
    const { tickerTitles } = await import("../src/index.js");
    const rss = { columns: ["title", "link"], rows: [["Headline A", "u1"], ["Headline B", "u2"]] };
    expect(tickerTitles(rss, {})).toEqual(["Headline A", "Headline B"]); // default "title" → col 0
    const api = { columns: ["symbol", "price"], rows: [["AAPL", "$220"], ["MSFT", "$410"], ["", ""]] };
    expect(tickerTitles(api, { column: "price" })).toEqual(["$220", "$410"]); // pick a column, skip blanks
    expect(tickerTitles(api, { column: "symbol" })).toEqual(["AAPL", "MSFT"]);
    expect(tickerTitles({ columns: [], rows: [] }, {})).toEqual([]);
  });
});

describe("display schedule", () => {
  it("is always visible without a schedule or in always mode", () => {
    expect(displayVisible(undefined, 0)).toBe(true);
    expect(displayVisible({ mode: "always" }, 123_456)).toBe(true);
    expect(displayVisible({}, 999)).toBe(true);
  });
  it("cycles visible for showSec within everySec", () => {
    const d = { mode: "interval" as const, showSec: 10, everySec: 60 };
    expect(displayVisible(d, 0)).toBe(true); // t=0s
    expect(displayVisible(d, 9_000)).toBe(true); // t=9s
    expect(displayVisible(d, 10_000)).toBe(false); // t=10s → hidden
    expect(displayVisible(d, 59_000)).toBe(false); // t=59s
    expect(displayVisible(d, 60_000)).toBe(true); // next cycle
    expect(displayVisible(d, 61_000)).toBe(true);
  });
  it("treats a cycle no longer than the on-time as always on", () => {
    expect(displayVisible({ mode: "interval", showSec: 30, everySec: 20 }, 25_000)).toBe(true);
  });
  it("summarizes for the editor", () => {
    expect(displaySummary(undefined)).toMatch(/always/i);
    expect(displaySummary({ mode: "interval", showSec: 10, everySec: 60 })).toBe("Shown 10s every 60s (hidden 50s)");
  });
});

describe("cta widget", () => {
  it("builds a wifi join payload from ssid + password", () => {
    expect(ctaPayload({ preset: "wifi", wifiSsid: "Guest", wifiPassword: "hunter2" })).toBe("WIFI:T:WPA;S:Guest;P:hunter2;;");
    expect(ctaPayload({ preset: "wifi", wifiSsid: "Open" })).toBe("WIFI:T:nopass;S:Open;;");
    expect(ctaPayload({ preset: "wifi", wifiSsid: "A;B", wifiPassword: "p:q" })).toBe("WIFI:T:WPA;S:A\\;B;P:p\\:q;;");
  });
  it("uses the url for non-wifi presets", () => {
    expect(ctaPayload({ preset: "google", url: "https://g.page/x" })).toBe("https://g.page/x");
  });
  it("exposes per-preset default copy", () => {
    expect(ctaDefaults("google").headline).toMatch(/google/i);
    expect(ctaDefaults("nonsense").headline).toBe(ctaDefaults("google").headline);
  });
  it("renders a card with headline and an svg qr", () => {
    const html = ctaBodyHtml({}, { preset: "google", url: "https://x.co" }, 760);
    expect(html).toContain("Rate us on Google");
    expect(html).toContain("<svg");
    expect(html).toContain("@keyframes cta-ring");
  });
});

describe("display motion", () => {
  it("shown pose is neutral; hidden poses carry a transform/filter", () => {
    expect(displayPose("rise", true)).toEqual({ transform: "", filter: "" });
    expect(displayPose("rise", false).transform).toMatch(/translateY/);
    expect(displayPose("zoom", false).transform).toMatch(/scale/);
    expect(displayPose("blur", false).filter).toMatch(/blur/);
    expect(displayPose("fade", false)).toEqual({ transform: "", filter: "" });
    // Unknown/undefined anim falls back to the "rise" pose.
    expect(displayPose(undefined, false).transform).toMatch(/translateY/);
  });
  it("entry eases slower than exit", () => {
    expect(displayEase(true).ms).toBeGreaterThan(displayEase(false).ms);
    expect(displayEase(true).ease).toContain("cubic-bezier");
  });
});

describe("cta container", () => {
  it("defaults to a token surface with an accent hairline + shadow", () => {
    const css = ctaContainerCss({});
    expect(String(css.background)).toContain("--w-surface");
    expect(String(css.border)).toContain("color-mix");
    expect(String(css.boxShadow)).toBeTruthy();
  });
  it("honours an explicit background + radius", () => {
    const css = ctaContainerCss({ bg: "#101010", radius: 12 });
    expect(css.background).toBe("#101010");
    expect(String(css.borderRadius)).toContain("12px");
  });
});
