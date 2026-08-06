/**
 * Interrupt math (BLUEPRINT §21, reused by §12 emergency + §20 queue calls).
 *
 * An interrupt (ad, queue-call announcement, emergency takeover) is an *event*,
 * not a function of the cycle clock. The ChannelDO stamps it with a start
 * epoch + duration and broadcasts it; every screen then computes the interrupt
 * playout as a pure function of *that stamped epoch* — so screens stay locked
 * through the ad/announcement exactly as they do for normal playout.
 */

export interface Interrupt {
  readonly id: string;
  /** Wall-clock epoch (ms) at which the interrupt begins on every screen. */
  readonly startEpoch: number;
  /** How long the interrupt holds the screen, in ms. */
  readonly durationMs: number;
}

export interface InterruptState {
  readonly active: boolean;
  /** Seek offset into the interrupt content, ms (only meaningful if active). */
  readonly offsetMs: number;
  /** ms until the interrupt ends (if active) or begins (if pending, negative
   *  once past). 0 when not applicable. */
  readonly remainingMs: number;
}

const IDLE: InterruptState = { active: false, offsetMs: 0, remainingMs: 0 };

/** Resolve a single interrupt against the wall clock `t`. */
export function interruptStateAt(ix: Interrupt, t: number): InterruptState {
  if (t < ix.startEpoch) return IDLE;
  const offsetMs = t - ix.startEpoch;
  if (offsetMs >= ix.durationMs) return IDLE;
  return { active: true, offsetMs, remainingMs: ix.durationMs - offsetMs };
}

/**
 * Resolve the highest-priority active interrupt from a set. Interrupts are
 * ranked by array order (index 0 = highest priority), matching the precedence
 * chain in §13: emergency > manual > screensaver > schedule. The first one
 * that is active at `t` wins; returns null when the normal timeline should play.
 */
export function activeInterrupt(
  interrupts: readonly Interrupt[],
  t: number,
): { interrupt: Interrupt; state: InterruptState } | null {
  for (const ix of interrupts) {
    const state = interruptStateAt(ix, t);
    if (state.active) return { interrupt: ix, state };
  }
  return null;
}
