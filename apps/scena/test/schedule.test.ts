import { describe, it, expect } from "vitest";
import { resolveDaypart, resolveWindows, type DaypartRule } from "../src/schedule.js";

// A fixed instant: 2026-07-06 is a Monday. 10:00 UTC.
const MON_10_UTC = Date.UTC(2026, 6, 6, 10, 0, 0);
const MON_18_UTC = Date.UTC(2026, 6, 6, 18, 0, 0);
const allDays = [0, 1, 2, 3, 4, 5, 6];

const rules: DaypartRule[] = [
  { id: "breakfast", priority: 1, days: allDays, startMin: 6 * 60, endMin: 11 * 60, channelId: "ch_breakfast" },
  { id: "lunch", priority: 1, days: allDays, startMin: 11 * 60, endMin: 15 * 60, channelId: "ch_lunch" },
  { id: "promo", priority: 5, days: [1], startMin: 9 * 60, endMin: 10 * 60 + 30, channelId: "ch_promo" }, // Mon 09:00–10:30, high priority
];

describe("resolveDaypart", () => {
  it("selects the rule whose window contains now", () => {
    const noPromo = rules.filter((r) => r.id !== "promo");
    expect(resolveDaypart(noPromo, "UTC", MON_10_UTC).channelId).toBe("ch_breakfast");
    expect(resolveDaypart(noPromo, "UTC", MON_18_UTC).channelId).toBeNull(); // outside all windows → default
  });

  it("higher priority wins overlapping windows", () => {
    // At Mon 10:00, breakfast (p1) and promo (p5) both match → promo wins.
    expect(resolveDaypart(rules, "UTC", MON_10_UTC).channelId).toBe("ch_promo");
  });

  it("promo only applies on its day", () => {
    const TUE_10_UTC = Date.UTC(2026, 6, 7, 10, 0, 0); // Tuesday
    expect(resolveDaypart(rules, "UTC", TUE_10_UTC).channelId).toBe("ch_breakfast");
  });

  it("computes the next boundary", () => {
    // At Mon 10:00 with promo active (ends 10:30), the next edge is 30 min out.
    const r = resolveDaypart(rules, "UTC", MON_10_UTC);
    expect(r.nextBoundaryMs).toBe(MON_10_UTC + 30 * 60000);
  });

  it("next boundary is the soonest of all edges", () => {
    const noPromo = rules.filter((r) => r.id !== "promo");
    // At Mon 10:00, breakfast ends at 11:00 (60 min) — the soonest edge.
    const r = resolveDaypart(noPromo, "UTC", MON_10_UTC);
    expect(r.nextBoundaryMs).toBe(MON_10_UTC + 60 * 60000);
  });

  it("is timezone-aware", () => {
    // Mon 10:00 UTC is Mon 06:00 in America/New_York (UTC-4 in July) → breakfast just opened.
    const noPromo = rules.filter((r) => r.id !== "promo");
    expect(resolveDaypart(noPromo, "America/New_York", MON_10_UTC).channelId).toBe("ch_breakfast");
    // Mon 10:00 UTC is Mon 05:00 in NY — before breakfast (06:00) → default.
    const MON_0930_UTC = Date.UTC(2026, 6, 6, 9, 30, 0); // 05:30 NY
    expect(resolveDaypart(noPromo, "America/New_York", MON_0930_UTC).channelId).toBeNull();
  });

  it("returns null boundary when there are no rules", () => {
    expect(resolveDaypart([], "UTC", MON_10_UTC)).toEqual({ channelId: null, nextBoundaryMs: null });
  });
});

describe("resolveWindows (mute / screensaver tracks)", () => {
  // A same-day window: Mon–Fri 09:00–17:00.
  const dayWindow: DaypartRule[] = [{ id: "w", priority: 1, days: [1, 2, 3, 4, 5], startMin: 9 * 60, endMin: 17 * 60, channelId: "" }];
  // An overnight window: nights of Mon–Fri, 22:00 → 07:00 next morning.
  const overnight: DaypartRule[] = [{ id: "n", priority: 1, days: [1, 2, 3, 4, 5], startMin: 22 * 60, endMin: 7 * 60, channelId: "" }];

  it("is active inside a same-day window, inactive outside", () => {
    expect(resolveWindows(dayWindow, "UTC", MON_10_UTC).active).toBe(true); // 10:00
    expect(resolveWindows(dayWindow, "UTC", MON_18_UTC).active).toBe(false); // 18:00
  });

  it("handles an overnight window on both sides of midnight", () => {
    const MON_23 = Date.UTC(2026, 6, 6, 23, 0, 0); // Mon 23:00 → inside (started 22:00 Mon)
    const TUE_05 = Date.UTC(2026, 6, 7, 5, 0, 0); // Tue 05:00 → inside (continuation of Mon's window)
    const TUE_12 = Date.UTC(2026, 6, 7, 12, 0, 0); // Tue noon → outside
    expect(resolveWindows(overnight, "UTC", MON_23).active).toBe(true);
    expect(resolveWindows(overnight, "UTC", TUE_05).active).toBe(true);
    expect(resolveWindows(overnight, "UTC", TUE_12).active).toBe(false);
  });

  it("does not carry an overnight window into a non-selected next day", () => {
    // Saturday has no rule; Sat 05:00 is the morning after Fri-night's window → still active.
    const SAT_05 = Date.UTC(2026, 6, 11, 5, 0, 0); // Sat 05:00 (Fri night window runs into it)
    expect(resolveWindows(overnight, "UTC", SAT_05).active).toBe(true);
    // Sun 05:00 is the morning after Sat night — Sat is NOT selected → inactive.
    const SUN_05 = Date.UTC(2026, 6, 12, 5, 0, 0);
    expect(resolveWindows(overnight, "UTC", SUN_05).active).toBe(false);
  });

  it("computes the next boundary", () => {
    // Mon 10:00, window ends 17:00 → 7h out.
    expect(resolveWindows(dayWindow, "UTC", MON_10_UTC).nextBoundaryMs).toBe(MON_10_UTC + 7 * 60 * 60000);
  });

  it("returns inactive + null boundary with no rules", () => {
    expect(resolveWindows([], "UTC", MON_10_UTC)).toEqual({ active: false, nextBoundaryMs: null });
  });
});
