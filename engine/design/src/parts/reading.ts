/**
 * WHAT ONE FRAME OF A CAMERA MEANS — the decision, without the camera.
 *
 * ⚠️ THIS IS A SEPARATE FILE BECAUSE EVERY FAULT THIS READER HAS HAD WAS IN THE
 * DECISION RATHER THAN IN THE VIDEO. The worst of them shipped and was reported
 * with a photograph: one pack of tobacco sticks, held still, produced a growing
 * list of EAN-13s nobody had scanned. Nothing about `getUserMedia`, the aspect
 * ratio or the torch was involved. Left inside a `requestAnimationFrame` loop
 * around a `BarcodeDetector` that exists in no test environment, that logic can
 * only be tested by mocking the browser, which tests the mocks.
 *
 * ⚠️ AND IT IS THE SAME SHAPE THE FILE PICKER ALREADY USES (`sift`). A control
 * whose hard part is a judgement puts the judgement outside the component and
 * passes the state in.
 */

/**
 * ⚠️ HOW MANY FRAMES AGREE BEFORE A CODE IS BELIEVED, AND IT IS THE WHOLE
 * DIFFERENCE BETWEEN READING AND GUESSING. A decoder returns its best answer per
 * frame and is occasionally confident and wrong — a glare across a barcode, a
 * fold in a label, half a symbol at the edge of the frame. Accepted on one
 * frame that is a number nobody typed entering somebody's product record; on a
 * screen that COLLECTS codes it is a product with three barcodes, two of which
 * do not exist.
 *
 * ⚠️ THREE, AND THE COST IS UNDER HALF A SECOND. At eight decodes a second,
 * three agreeing frames is ~375ms of holding the phone still — below the point
 * anybody notices — and it moves a misread from needing one bad frame to needing
 * three consecutive identical bad frames, which is not a thing that happens.
 */
export const SURE = 3;

/**
 * ⚠️ HOW LONG A PART-BUILT AGREEMENT SURVIVES. Two frames of a code and then the
 * phone moves away: without an expiry those votes sit there, and the same
 * misread half a minute later arrives already two-thirds believed.
 */
export const FORGET = 1200;

/** The reader's memory between frames. Held by the loop, never by React. */
export interface Votes {
  /** How many recent frames agreed on each code, and when they last did. */
  readonly votes: Map<string, { count: number; at: number }>;
  /** When each code was last announced, so a held label is not a stream. */
  readonly told: Map<string, number>;
}

export interface FrameAt {
  readonly now: number;
  /** ⚠️ How long before the same code counts again — see `ViewfinderProps`. */
  readonly again: number;
  /** ⚠️ What the caller already has. See `read` versus `again` below. */
  readonly held: readonly string[];
  /**
   * ⚠️ THE ONE PLACE A PRODUCT'S MEANING IS ALLOWED IN, AND IT IS WHY ONE BOX IS
   * ONE CODE. A retail pack commonly carries TWO symbols — an EAN-13 and a GS1
   * DataMatrix a few millimetres away — and a frame containing both decodes both.
   * They identify the same item, so a reader that reports what it saw reports two
   * products; only the app knows that the DataMatrix's `(01)` element IS the
   * EAN-13. Returning `""` rejects a symbol outright, which is what a pack's
   * marketing QR deserves on a screen collecting barcodes.
   */
  readonly fold: (raw: string) => string;
}

export interface Sifted {
  /** Confirmed, folded, and not already held. */
  readonly read: readonly string[];
  /** Confirmed and already held — said out loud, never swallowed. */
  readonly again: readonly string[];
  /**
   * ⚠️ TRUE WHILE SOMETHING IS PARTWAY TO BEING BELIEVED. A frame with a symbol
   * in it that has not yet agreed looks identical to a frame with nothing in it,
   * so somebody holding a code up to a lens sees a dead rectangle and moves the
   * phone — which is the one thing that stops the frames agreeing.
   */
  readonly working: boolean;
}

/**
 * ⚠️ EVERY SYMBOL IN THE FRAME, NOT THE FIRST ONE. This was the whole bug: a
 * pack carrying an EAN-13 and a DataMatrix hands the decoder two results, their
 * order is not stable frame to frame, and taking `found[0]` means the SAME BOX
 * alternates between two strings. Compared against the last read, each
 * alternation looked new — so holding one pack in front of the lens produced a
 * stream of codes nobody had scanned.
 */
export function siftFrame(
  state: Votes, raw: readonly string[], at: FrameAt,
): Sifted {
  const read: string[] = [];
  const again: string[] = [];
  let working = false;

  for (const one of raw) {
    const code = at.fold(one ?? "");
    if (!code) continue;

    const before = state.votes.get(code);
    const vote = before && at.now - before.at < FORGET
      ? { count: before.count + 1, at: at.now }
      : { count: 1, at: at.now };
    state.votes.set(code, vote);

    if (vote.count < SURE) { working = true; continue; }

    /*
      ⚠️ ABSENT IS NOT ZERO, AND THE `?? 0` THAT USED TO BE HERE WAS A LATENT
      FAULT THE FIRST TEST FOUND. "Never announced" compared as "announced at the
      epoch" — which is only ever true against `Date.now()`, and silently refuses
      the very first read of a session on any clock that starts near zero. A
      reader whose correctness depends on the wall clock being a large number is
      a reader that works until somebody passes it a timeline.
    */
    const last = state.told.get(code);
    if (last !== undefined && at.now - last < at.again) continue;
    state.told.set(code, at.now);

    /*
      ⚠️ AGAINST EVERYTHING HELD, NOT AGAINST THE LAST READ. Two codes alternating
      in front of a lens — two boxes on a bench — each looked new every time the
      other one intervened, so a list of two grew without limit.
    */
    if (at.held.includes(code)) again.push(code);
    else read.push(code);
  }

  return { read, again, working };
}
