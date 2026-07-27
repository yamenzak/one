/**
 * InsightFeedback — the 👍/👎 eval signal (SPEC §8.11) for AI insight cards.
 * Posts to /api/ai/feedback (the insight_feedback tuning table) and offers a
 * per-type mute persisted per-device. Reusable across every insight surface
 * (CoachNote, Today feed cards, …): render it under the insight and pass the
 * insight's type/ref. `onMute` lets the host hide the card the moment the user
 * mutes that type; hosts should also skip rendering when isInsightMuted(type).
 */

import { useState } from "react";
import { api } from "../../api.js";
import { ThumbsUp, ThumbsDown, Check, cn } from "@mossa/ui";

const MUTE_PREFIX = "mossa:insight-muted:";

/** Human labels for the mutable insight types, for the un-mute list. A type with
 *  no entry still un-mutes; it just shows its raw key. */
export const INSIGHT_LABELS: Record<string, string> = {
  "coach-note": "Coach notes on your screens",
};

/** Has this device muted this insight type? Hosts check before rendering. */
export function isInsightMuted(type: string): boolean {
  try {
    return localStorage.getItem(MUTE_PREFIX + type) === "1";
  } catch {
    return false;
  }
}

/**
 * Every insight type this device has muted.
 *
 * "Mute these" used to be a ONE-WAY DOOR: it wrote the flag and nothing could
 * read the set back, so there was no screen that could offer to undo it. The
 * only route to un-muting was signing out, which clears the app's localStorage
 * — undiscoverable, and it meant the setting silently didn't survive a sign-out
 * either. Preferences → Coach notes lists these and turns them back on.
 */
export function mutedInsights(): string[] {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(MUTE_PREFIX) && localStorage.getItem(k) === "1")
      .map((k) => k.slice(MUTE_PREFIX.length));
  } catch {
    return [];
  }
}

function persistMuted(type: string): void {
  try {
    localStorage.setItem(MUTE_PREFIX + type, "1");
  } catch {
    /* private mode / storage disabled — mute is best-effort */
  }
}

/** Turn an insight type back on for this device. */
export function unmuteInsight(type: string): void {
  try {
    localStorage.removeItem(MUTE_PREFIX + type);
  } catch {
    /* private mode / storage disabled */
  }
}

export function InsightFeedback({
  insightType,
  insightRef,
  onMute,
  className,
}: {
  insightType: string;
  insightRef?: string | null;
  onMute?: () => void;
  className?: string;
}) {
  const [vote, setVote] = useState<1 | -1 | null>(null);

  const send = (v: 1 | -1) => {
    setVote(v);
    // Fire-and-forget: the tuning signal never blocks or interrupts the client.
    void api.post("/api/ai/feedback", { insightType, insightRef: insightRef ?? null, vote: v }).catch(() => undefined);
  };
  const mute = () => {
    persistMuted(insightType);
    onMute?.();
  };

  if (vote !== null) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)} role="status" aria-live="polite">
        <Check className="size-3.5 text-success" /> Thanks for the feedback.
        {onMute && (
          <button onClick={mute} className="font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline">
            Mute these
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <span className="mr-1 text-xs text-muted-foreground/70">Helpful?</span>
      <button
        onClick={() => send(1)}
        aria-label="Helpful"
        className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-success-soft hover:text-success [&_svg]:size-3.5"
      >
        <ThumbsUp />
      </button>
      <button
        onClick={() => send(-1)}
        aria-label="Not helpful"
        className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger [&_svg]:size-3.5"
      >
        <ThumbsDown />
      </button>
    </div>
  );
}
