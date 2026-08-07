/**
 * ProgressRing + TargetRing — the hero viz. Animated stroke draw-in on mount,
 * gradient stroke, big center numeral. Theme-driven, no emoji.
 */

import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { toneVar, type Tone } from "./primitives.js";
import { NoData, isBlank } from "./metrics.js";
import { cn } from "./lib/utils.js";
import { DUR, TIER_DELAY } from "./lib/animation.js";

interface ProgressRingProps {
  progress: number; // 0..1
  size?: number;
  strokeWidth?: number;
  tone?: Tone;
  /** Pass `null` when there is nothing to show — never a dash (see `NoData`). */
  value: ReactNode;
  label?: string;
  sublabel?: string;
  className?: string;
  /** Tint the unfilled track with the tone (instead of neutral surface-3). */
  softTrack?: boolean;
  /** Colour the centre value with the tone. */
  tintValue?: boolean;
}

export function ProgressRing({ progress, size = 200, strokeWidth, tone = "activity", value, label, sublabel, className, softTrack, tintValue }: ProgressRingProps) {
  const sw = strokeWidth ?? Math.max(8, Math.round(size * 0.1));
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  const gradId = useId();
  const color = toneVar[tone];
  // A soft track is the tone at low alpha over the card — a genuine faint tint of
  // the tone's OWN hue. Mixing against surface-3 instead let the neutral surface's
  // hue dominate (78% weight), so on a tinted-neutral theme the track drifted off
  // the tone (e.g. a cardio-blue ring with a green track).
  const track = softTrack ? `color-mix(in oklch, ${color} 24%, transparent)` : "var(--surface-3)";
  // Summarize the ring's data for AT — colour + arc length alone convey nothing.
  // A blank value means there is no reading yet, so the arc is not a measurement
  // — announcing "0%" would be a claim the screen isn't making.
  const ariaLabel = isBlank(value)
    ? [label, "no data yet"].filter(Boolean).join(", ")
    : [label, `${Math.round(p * 100)}%`, sublabel].filter(Boolean).join(", ");

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity={0.65} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={sw} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - p) }}
          transition={{ duration: DUR.draw, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      {/*
        INSET BY THE STROKE, not `inset-0`.

        The caption block used to fill the whole square, arc included, so any
        sublabel wider than the ring's INNER diameter sat on the stroke —
        crossing the arc at both ends, which reads as a rendering fault rather
        than as a caption. Reported on a hero ring whose sublabel was a target
        ("of N units"), i.e. the most ordinary thing a sublabel says.

        The arc geometrically occupies the outer `sw`; one pixel more is the
        breathing room. Centred and allowed to wrap inside that box, because a
        caption that silently overflows is the thing being fixed.
      */}
      <div
        className="absolute flex flex-col items-center justify-center text-center"
        style={{ inset: sw + 1 }}
      >
        {/* Floor the ring's caption at 12px (UI-LANGUAGE §5 — the scale's floor).
            The purely proportional size rendered the label at 7.5px on the hero
            ring most screens use (size 116), and an inline style beats the class
            beside it, so the smallest and most-read text in the app was barely
            legible. The class is the fallback for rings big enough not to need
            the floor; the `max` is what makes the small ones readable. */}
        {label && <div className="text-caption font-medium text-muted-foreground" style={{ fontSize: Math.max(12, size * 0.065) }}>{label}</div>}
        <motion.div
          className={isBlank(value) ? "leading-none" : "numeral font-semibold leading-none"}
          style={isBlank(value) ? undefined : { fontSize: size * 0.2, color: tintValue ? color : undefined }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: TIER_DELAY.content, duration: DUR.slow }}
        >
          {isBlank(value) ? <NoData className="text-caption">Not yet</NoData> : value}
        </motion.div>
        {sublabel && !isBlank(value) && <div className="mt-1 text-muted-foreground" style={{ fontSize: Math.max(12, size * 0.062) }}>{sublabel}</div>}
      </div>
    </div>
  );
}

interface TargetRingProps extends Omit<ProgressRingProps, "value" | "sublabel"> {
  current: number;
  target: number;
  unit?: string;
  deltaBadge?: string;
}

export function TargetRing({ current, target, unit, deltaBadge, label = "This week", ...rest }: TargetRingProps) {
  const pct = target > 0 ? current / target : 0;
  return (
    <div className="relative inline-block">
      <ProgressRing {...rest} label={label} progress={pct} value={`${Math.round(pct * 100)}%`} sublabel={`${current}${unit ? ` ${unit}` : ""} of ${target}`} />
      {deltaBadge && (
        <span className="numeral absolute right-1 top-2 rounded-full bg-cardio-soft px-2.5 py-1 text-micro text-cardio">{deltaBadge}</span>
      )}
    </div>
  );
}
