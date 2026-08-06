import { describe, it, expect } from "vitest";
import {
  computeSample,
  OffsetFilter,
  decideSlew,
  mediaTargetSec,
  interruptStateAt,
  activeInterrupt,
  type Interrupt,
} from "../src/index.js";

describe("mediaTargetSec", () => {
  it("maps an item offset to media seconds, honouring trim start", () => {
    expect(mediaTargetSec(0, 0, 10_000, true)).toBe(0);
    expect(mediaTargetSec(3000, 0, 10_000, true)).toBe(3);
    expect(mediaTargetSec(2500, 2000, 10_000, true)).toBe(4.5); // 2s trim + 2.5s in
  });
  it("loops by wrapping the offset within the clip length", () => {
    expect(mediaTargetSec(12_000, 0, 10_000, true)).toBe(2); // 12s into a 10s loop → 2s
    expect(mediaTargetSec(25_000, 1000, 10_000, true)).toBe(6); // 25 mod 10 = 5, +1s trim
  });
  it("play-once clamps and holds the last frame", () => {
    expect(mediaTargetSec(12_000, 0, 10_000, false)).toBe(10); // clamps to clip end
    expect(mediaTargetSec(4000, 0, 10_000, false)).toBe(4);
  });
  it("is defensive about an unknown clip length", () => {
    expect(mediaTargetSec(4000, 500, 0, true)).toBe(0.5); // no length yet → trim start
    expect(mediaTargetSec(4000, 0, NaN, true)).toBe(0);
  });
});

describe("computeSample", () => {
  it("recovers a known offset with symmetric latency", () => {
    // Screen monotonic clock is 1000 behind server wall-clock. RTT = 40ms.
    const tSend = 500;
    const tRecv = 540; // 40ms round trip
    const trueOffset = 1000;
    // Server stamps its reply at the midpoint of the round trip:
    const tServer = tSend + 20 + trueOffset; // monotonic midpoint + offset
    const { rtt, offset } = computeSample({ tSend, tServer, tRecv });
    expect(rtt).toBe(40);
    expect(offset).toBe(trueOffset);
  });
});

describe("OffsetFilter", () => {
  it("converges to the true offset", () => {
    const f = new OffsetFilter();
    const trueOffset = 3200;
    for (let i = 0; i < 40; i++) {
      const tSend = i * 1000;
      const rtt = 30;
      const tRecv = tSend + rtt;
      const tServer = tSend + rtt / 2 + trueOffset;
      f.push({ tSend, tServer, tRecv });
    }
    expect(Math.abs(f.offset - trueOffset)).toBeLessThan(1);
    expect(f.sampleCount).toBe(40);
  });

  it("rejects high-RTT outliers after warmup", () => {
    const f = new OffsetFilter({ warmup: 3, rttRejectFactor: 2 });
    const trueOffset = 500;
    for (let i = 0; i < 6; i++) {
      const tSend = i * 1000;
      const rtt = 20;
      f.push({ tSend, tServer: tSend + rtt / 2 + trueOffset, tRecv: tSend + rtt });
    }
    const before = f.offset;
    // A spike: huge RTT with a corrupted offset should be discarded.
    const tSend = 100000;
    const spikeRtt = 400;
    const accepted = f.push({
      tSend,
      tServer: tSend + spikeRtt / 2 + trueOffset + 9999,
      tRecv: tSend + spikeRtt,
    });
    expect(accepted).toBe(false);
    expect(f.offset).toBe(before); // unchanged
  });

  it("syncedTime maps monotonic to server time", () => {
    const f = new OffsetFilter();
    f.push({ tSend: 0, tServer: 1000, tRecv: 0 });
    expect(f.syncedTime(50)).toBe(f.offset + 50);
  });
});

describe("decideSlew", () => {
  it("holds inside the deadband", () => {
    expect(decideSlew(5, 0)).toEqual({ kind: "hold", playbackRate: 1 });
  });

  it("slews to speed up when behind", () => {
    const a = decideSlew(200, 0);
    expect(a.kind).toBe("slew");
    if (a.kind === "slew") expect(a.playbackRate).toBeGreaterThan(1);
  });

  it("slews to slow down when ahead", () => {
    const a = decideSlew(-200, 0);
    expect(a.kind).toBe("slew");
    if (a.kind === "slew") expect(a.playbackRate).toBeLessThan(1);
  });

  it("hard-seeks past the threshold", () => {
    const a = decideSlew(5000, 4321);
    expect(a).toEqual({ kind: "seek", toOffsetMs: 4321 });
  });

  it("clamps slew rate to ±maxRate", () => {
    const a = decideSlew(700, 0, { deadbandMs: 15, hardSeekMs: 800, maxRate: 0.02 });
    if (a.kind === "slew") expect(a.playbackRate).toBeLessThanOrEqual(1.02);
  });
});

describe("interrupts", () => {
  const ix: Interrupt = { id: "ad1", startEpoch: 1000, durationMs: 5000 };

  it("is idle before it starts", () => {
    expect(interruptStateAt(ix, 500)).toEqual({ active: false, offsetMs: 0, remainingMs: 0 });
  });

  it("is active during its window with a synced offset", () => {
    const s = interruptStateAt(ix, 3000);
    expect(s.active).toBe(true);
    expect(s.offsetMs).toBe(2000);
    expect(s.remainingMs).toBe(3000);
  });

  it("is idle after it ends", () => {
    expect(interruptStateAt(ix, 6000).active).toBe(false);
    expect(interruptStateAt(ix, 6001).active).toBe(false);
  });

  it("two screens see the same interrupt offset (event, not clock)", () => {
    for (let t = 900; t < 6100; t += 33) {
      expect(interruptStateAt(ix, t)).toEqual(interruptStateAt(ix, t));
    }
  });

  it("activeInterrupt honors priority order", () => {
    const emergency: Interrupt = { id: "emg", startEpoch: 0, durationMs: 100000 };
    const ad: Interrupt = { id: "ad", startEpoch: 1000, durationMs: 5000 };
    const winner = activeInterrupt([emergency, ad], 2000);
    expect(winner?.interrupt.id).toBe("emg"); // higher priority (index 0) wins
    expect(activeInterrupt([ad], 500)).toBeNull();
  });
});
