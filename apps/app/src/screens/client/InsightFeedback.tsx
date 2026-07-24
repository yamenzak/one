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

/** Has this device muted this insight type? Hosts check before rendering. */
export function isInsightMuted(type: string): boolean {
  try {
    return localStorage.getItem(MUTE_PREFIX + type) === "1";
  } catch {
    return false;
  }
}

function persistMuted(type: string): void {
  try {
    localStorage.setItem(MUTE_PREFIX + type, "1");
  } catch {
    /* private mode / storage disabled — mute is best-effort */
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
