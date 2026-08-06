import { describe, it, expect } from "vitest";
import { scheduleAds, type AdSchedule } from "../src/ad-store.js";

const T = 1_700_000_000_000;
const min = 60_000;

describe("ad scheduler (§21)", () => {
  it("seeds a fresh ad one interval out (does not fire on enable)", () => {
    const ads: AdSchedule[] = [{ id: "a", everyMin: 5, nextDueAt: 0 }];
    const r = scheduleAds(ads, T);
    expect(r.fire).toEqual([]);
    expect(r.schedule[0]!.nextDueAt).toBe(T + 5 * min);
    expect(r.nextAlarm).toBe(T + 5 * min);
  });

  it("fires an ad once due and advances it one interval", () => {
    const ads: AdSchedule[] = [{ id: "a", everyMin: 5, nextDueAt: T }];
    const r = scheduleAds(ads, T);
    expect(r.fire).toEqual(["a"]);
    expect(r.schedule[0]!.nextDueAt).toBe(T + 5 * min);
  });

  it("does not fire before due", () => {
    const ads: AdSchedule[] = [{ id: "a", everyMin: 5, nextDueAt: T + 2 * min }];
    const r = scheduleAds(ads, T);
    expect(r.fire).toEqual([]);
    expect(r.nextAlarm).toBe(T + 2 * min);
  });

  it("rotates several ads by cadence and reports the soonest next wake", () => {
    const ads: AdSchedule[] = [
      { id: "a", everyMin: 5, nextDueAt: T },
      { id: "b", everyMin: 10, nextDueAt: T + 3 * min },
    ];
    const r = scheduleAds(ads, T);
    expect(r.fire).toEqual(["a"]);
    // a re-armed to T+5m, b still at T+3m → next wake is b's.
    expect(r.nextAlarm).toBe(T + 3 * min);
  });

  it("returns no alarm when there are no ads", () => {
    expect(scheduleAds([], T)).toEqual({ fire: [], schedule: [], nextAlarm: null });
  });

  it("clamps a zero/negative cadence to at least one minute", () => {
    const r = scheduleAds([{ id: "a", everyMin: 0, nextDueAt: T }], T);
    expect(r.fire).toEqual(["a"]);
    expect(r.schedule[0]!.nextDueAt).toBe(T + min);
  });
});
