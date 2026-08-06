/**
 * @scena/timeline — the pure, zero-dependency clock + timeline engine.
 *
 * "Playout is a pure function of a synced clock" (BLUEPRINT §1). This package
 * holds that function and nothing else: no I/O, no DOM, no platform APIs. It
 * must run byte-identically in the manifest compiler (Worker), the player
 * (browser), and the test suite.
 */

export {
  buildTimeline,
  cycleIndexAt,
  cyclePositionAt,
  resolveAt,
  nextBoundaryAt,
  EmptyTimelineError,
  type Timeline,
  type TimelineItem,
  type TimelineOptions,
  type PlayoutState,
} from "./timeline.js";

export { shuffledOrder, rngFor } from "./shuffle.js";

export {
  interruptStateAt,
  activeInterrupt,
  type Interrupt,
  type InterruptState,
} from "./interrupt.js";

export {
  computeSample,
  OffsetFilter,
  decideSlew,
  mediaTargetSec,
  DEFAULT_FILTER,
  DEFAULT_SLEW,
  type SyncSample,
  type SyncResult,
  type OffsetFilterConfig,
  type SlewConfig,
  type SlewAction,
} from "./clock.js";
