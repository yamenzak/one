/**
 * A COMMIT — the lifecycle of one thing being written, and there is only one.
 *
 * ⚠️ IT WAS EXTRACTED AT ITS SECOND USE, which is the confirm sheet. Saving a
 * value and confirming a destructive action are the same five moments — idle,
 * refused, working, done, failed — and a product with two implementations of them
 * is a product where one of the two eventually forgets to disable its button, or
 * says "Saved" and does not close, or reports a failure as a toast. The whole
 * reason the value editor felt finished was this sequence; a second surface
 * re-deriving it would have been a coin toss.
 *
 * ⚠️ THE FAILURE IS A `Problem`, NEVER A THROW. What comes back from a write is a
 * title we wrote, a detail composed from structured values, per-field messages,
 * whether retrying could plausibly work, and a reference the person can quote.
 * `catch (e)` throws all five away and leaves the caller with a string.
 *
 * ⚠️ AND IT ANSWERS IN THE HAND AS WELL AS ON THE SCREEN. Done and failed each
 * fire their note once, here, so no surface can forget one — which is exactly
 * what "one lifecycle" has to mean to be worth having.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Problem } from "@one/kernel";
import { feel } from "./feedback.js";

export type Commit =
  | { readonly at: "idle" }
  | { readonly at: "working" }
  | { readonly at: "done" }
  | { readonly at: "failed"; readonly problem: Problem };

/** Long enough to register as an answer, short enough not to be a wait. */
export const SEEN_MS = 850;

export interface Committing {
  readonly state: Commit;
  /** Ignored while working or done — a second press is not a second write. */
  readonly run: () => Promise<void>;
  /** A failure describes a value that may no longer exist. */
  readonly reset: () => void;
}

export function useCommit(
  write: () => Promise<Problem | null>,
  onDone?: () => void,
): Committing {
  const [state, setState] = useState<Commit>({ at: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const run = useCallback(async () => {
    if (state.at === "working" || state.at === "done") return;
    setState({ at: "working" });
    const problem = await write();
    if (problem) { setState({ at: "failed", problem }); feel("wrong"); return; }
    setState({ at: "done" });
    feel("done");
    if (onDone) timer.current = setTimeout(onDone, SEEN_MS);
  }, [state.at, write, onDone]);

  const reset = useCallback(() => {
    setState((s) => (s.at === "idle" ? s : { at: "idle" }));
  }, []);

  return { state, run, reset };
}
