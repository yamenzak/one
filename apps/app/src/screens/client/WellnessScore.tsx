/**
 * Wellness score — the pillar breakdown that sits under the Wellness anchor.
 *
 * The score itself is no longer rendered here. It is the screen's T1 anchor
 * (UI-LANGUAGE §1), and the anchor's value appears ONCE: a hero card repeating
 * the same number a few pixels below the display numeral is the exact defect the
 * language calls out. What's left is the part the anchor can't say — which
 * pillar is lifting the number and which is dragging it.
 */

import { toneVar, IconBadge, Dumbbell, Utensils, Bed, ListChecks, Droplet, Smile, Pill, Scale, HeartPulse, Skeleton, type Tone, type LucideIcon } from "@kova/ui";

export interface WellnessPillar { key: string; label: string; score: number | null; weight: number; available: boolean }
export interface WellnessScoreResult { score: number; band: "start" | "building" | "solid" | "strong" | "peak"; pillars: WellnessPillar[] }

const PILLAR_META: Record<string, { tone: Tone; icon: LucideIcon }> = {
  training: { tone: "activity", icon: Dumbbell },
  nutrition: { tone: "nutrition", icon: Utensils },
  sleep: { tone: "sleep", icon: Bed },
  consistency: { tone: "primary", icon: ListChecks },
  hydration: { tone: "hydration", icon: Droplet },
  mood: { tone: "cardio", icon: Smile },
  supplements: { tone: "supplement", icon: Pill },
  body: { tone: "cardio", icon: Scale },
};

/**
 * The words for a band. `label` is the one-word verdict that rides under the
 * anchor; `blurb` is what to do about it.
 */
export const WELLNESS_BAND: Record<WellnessScoreResult["band"], { label: string; blurb: string }> = {
  start: { label: "Just starting", blurb: "Log a few things to build your score." },
  building: { label: "Building", blurb: "Momentum is forming — keep it steady." },
  solid: { label: "Solid", blurb: "Good, well-rounded week." },
  strong: { label: "Strong", blurb: "Dialed in across the board." },
  peak: { label: "Peak", blurb: "Elite consistency — outstanding week." },
};

function PillarBar({ pillar }: { pillar: WellnessPillar }) {
  const meta = PILLAR_META[pillar.key] ?? { tone: "primary" as Tone, icon: HeartPulse };
  const pct = pillar.score ?? 0;
  return (
    <div className="flex items-center gap-2.5">
      <IconBadge icon={meta.icon} tone={meta.tone} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
          <span className="truncate font-medium">{pillar.label}</span>
          <span className="numeral shrink-0 font-semibold text-muted-foreground">{pct}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: toneVar[meta.tone] }} />
        </div>
      </div>
    </div>
  );
}

/**
 * What's behind the number — one bar per pillar the client actually has.
 *
 * **Sorted weakest first**, which is the whole reason to show it. In catalog
 * order this was seven unlabelled numbers in a fixed sequence — 24, 89, 100,
 * 86, 63, 61, 76 — and the client had to scan all seven to find the 24. Sorted,
 * the first row IS the answer to "what's dragging my score", and the caller can
 * say so in the section header.
 *
 * T3 content, not a hero: no wash, no ring, no restatement of the score.
 * Returns null when there is nothing to break down, so a client with a single
 * pillar doesn't get a section header over one bar.
 */
export function WellnessPillars({ result }: { result: WellnessScoreResult }) {
  const shown = result.pillars
    .filter((p) => p.available)
    .slice()
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  if (shown.length < 2) return null;
  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl bg-card p-4 sm:grid-cols-2">
      {shown.map((p) => <PillarBar key={p.key} pillar={p} />)}
    </div>
  );
}

/**
 * The weakest pillar, for the caller's section header — "Sleep is pulling it
 * down" beats "What's behind it" because it is the sentence the breakdown was
 * drawn to support. Null when nothing is meaningfully behind (everything ≥ 80).
 */
export function weakestPillar(result: WellnessScoreResult): WellnessPillar | null {
  const shown = result.pillars.filter((p) => p.available && p.score != null);
  if (shown.length < 2) return null;
  const worst = shown.reduce((a, b) => ((b.score ?? 0) < (a.score ?? 0) ? b : a));
  return (worst.score ?? 0) < 80 ? worst : null;
}

/** Placeholder matching the pillar block's footprint. */
export function WellnessPillarsSkeleton() {
  return <Skeleton className="h-36 rounded-2xl" />;
}
