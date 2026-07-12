/**
 * Wellness Score hero — the one number that reflects a client's whole-system
 * commitment (training, nutrition, sleep, consistency, hydration, mood,
 * supplements, body progress), with a per-pillar breakdown so it's obvious
 * what's lifting or dragging it. Theme-tokened; the ring uses the brand color.
 */

import { ProgressRing, cn, toneVar, IconBadge, Dumbbell, Utensils, Bed, ListChecks, Droplet, Smile, Pill, Scale, HeartPulse, type Tone, type LucideIcon } from "@mossa/ui";

export interface WellnessPillar { key: string; label: string; score: number | null; weight: number; available: boolean }
export interface WellnessScoreResult { score: number; band: "start" | "building" | "solid" | "strong" | "peak"; pillars: WellnessPillar[] }

const PILLAR_META: Record<string, { tone: Tone; icon: LucideIcon }> = {
  training: { tone: "activity", icon: Dumbbell },
  nutrition: { tone: "nutrition", icon: Utensils },
  sleep: { tone: "sleep", icon: Bed },
  consistency: { tone: "primary", icon: ListChecks },
  hydration: { tone: "hydration", icon: Droplet },
  mood: { tone: "cardio", icon: Smile },
  supplements: { tone: "activity", icon: Pill },
  body: { tone: "cardio", icon: Scale },
};

const BAND: Record<WellnessScoreResult["band"], { label: string; blurb: string }> = {
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
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-medium">{pillar.label}</span>
          <span className="numeral font-semibold text-muted-foreground">{pct}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: toneVar[meta.tone] }} />
        </div>
      </div>
    </div>
  );
}

export function WellnessScoreCard({ result }: { result: WellnessScoreResult }) {
  const band = BAND[result.band];
  const shown = result.pillars.filter((p) => p.available);
  return (
    <div className="relative overflow-hidden rounded-2xl bg-card p-5">
      <div className="pointer-events-none absolute -right-12 -top-12 size-44 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex items-center gap-5">
        <ProgressRing size={132} strokeWidth={11} tone="primary" progress={result.score / 100} value={result.score} label="Wellness" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-primary">This week</div>
          <div className="mt-0.5 text-lg font-bold tracking-tight">{band.label}</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{band.blurb}</p>
        </div>
      </div>
      {shown.length > 0 && (
        <div className="relative mt-4 grid grid-cols-1 gap-2.5 border-t border-border/50 pt-4 sm:grid-cols-2">
          {shown.map((p) => <PillarBar key={p.key} pillar={p} />)}
        </div>
      )}
    </div>
  );
}

/** Compact skeleton block matching the hero footprint. */
export function WellnessScoreCardSkeleton() {
  return <div className={cn("h-56 animate-pulse rounded-2xl bg-surface-2")} />;
}
