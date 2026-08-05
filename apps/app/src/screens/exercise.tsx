/**
 * Shared exercise UI bits — the workout-side analog of the food row polish:
 * a thumbnail (real image when the exercise has one, muscle-tinted fallback
 * otherwise) plus muscle/equipment helpers. Reused by the player, the plan
 * builder's picker, and the swap drawer so exercises read consistently
 * everywhere (SPEC §8.3, KOVA.md Part II metric-coding).
 */

import { useEffect, useState, type ReactNode } from "react";
import { Badge, Dumbbell, Eyebrow, Info, Media, SegmentedControl, Thumb, cn, type MediaProps, type ThumbProps } from "@4dl/ui";
import { Markdown } from "../Markdown.js";

// ── Shared frame ticker ──────────────────────────────────────────────────────
// One global interval drives every animated thumbnail in sync, so a whole
// library grid of exercises cross-fades between their start/end frames without
// spawning dozens of timers.
const tickers = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;

/**
 * ⚠️ This ticker re-renders EVERY animated thumbnail on screen, so its cost is
 * `mounted thumbnails × renders/second` and both halves get large fast: the
 * exercise picker fetches up to 100 rows, and a library grid mounts all of
 * them. At 1.1s that was ~90 component renders a second, forever, on a phone —
 * continuing while the app sat in the background, and never stopping as long as
 * one thumbnail stayed mounted. Coaches reported the exercise screens lagging
 * and needing a refresh.
 *
 * Two bounds, both cheap:
 *
 *   VISIBILITY — a backgrounded tab animates nothing anyone can see. The
 *                interval is torn down on `hidden` and restarted on `visible`,
 *                so a phone with the app in the background does no work at all.
 *   MOTION     — `prefers-reduced-motion` means don't animate. The frames still
 *                render; they just stop cross-fading, which is the correct
 *                reading of the preference and free performance besides.
 *
 * The frame index is module-level rather than per-component state so every
 * thumbnail stays in sync (that was always the point) — but a subscriber that
 * is already showing the current frame does not re-render.
 */
let frame = 0;

function startTicker() {
  if (tickTimer || tickers.size === 0) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  tickTimer = setInterval(() => { frame++; tickers.forEach((f) => f()); }, 1100);
}
function stopTicker() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") stopTicker();
    else startTicker();
  });
}

function useFrameTick(active = true): number {
  const [i, setI] = useState(frame);
  useEffect(() => {
    if (!active) return;
    // Respect the OS setting: no animation, no timer, no re-renders.
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const bump = () => setI(frame);
    tickers.add(bump);
    startTicker();
    return () => {
      tickers.delete(bump);
      if (tickers.size === 0) stopTicker();
    };
  }, [active]);
  return i;
}

export interface ExerciseInfo {
  id: string;
  name: string;
  thumb_url?: string | null;
  thumb2_url?: string | null;
  video_url?: string | null;
  muscle_groups?: string | null;
  secondary_muscle_groups?: string | null;
  equipment?: string | null;
  difficulty?: string | null;
  /** push | pull | static */
  force?: string | null;
  /** compound | isolation */
  mechanic?: string | null;
  category?: string | null;
  instructions_md?: string | null;
  /** 0 = archived (soft-deleted). Present on the resolve lane (scope=all). */
  active?: number;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Comma list → trimmed, non-empty parts. */
export const splitList = (s?: string | null): string[] => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
/** Human label for a taxonomy token (e.g. "lower_back" → "Lower back"). */
export const pretty = (m: string): string => cap(m.replace(/_/g, " "));
export const firstMuscle = (e: ExerciseInfo): string | undefined => splitList(e.muscle_groups)[0];

/**
 * An exercise's photo — `Thumb` with this product's fallback glyph and tone.
 *
 * The frame logic, the cross-fade, the failed-URL fallback and the FILL are all
 * `Thumb`'s now. This used to be `object-contain` over a tinted plate, which is
 * what put brand-green letterbox bars around every portrait photo in the
 * library grid: a photo is an identifier, and an identifier fills its frame
 * (@4dl/ui media.tsx).
 */
export function ExerciseThumb({ thumb, thumb2, size = 40, radius, className = "" }: { thumb?: string | null; thumb2?: string | null; size?: number; radius?: ThumbProps["radius"]; className?: string }) {
  // Subscribed only when there are two frames to flip between — the ticker
  // re-renders every subscriber every 1.1s, and a still image has nothing to do
  // with that.
  const tick = useFrameTick(Boolean(thumb && thumb2));
  return (
    <Thumb
      src={thumb}
      src2={thumb2}
      fallback={Dumbbell}
      tone="activity"
      size={size || undefined}
      radius={radius}
      frame={tick}
      className={className}
    />
  );
}

/**
 * THE EXERCISE'S MEDIA, at detail size.
 *
 * Three things were wrong with the hand-rolled versions, and all three came
 * from each surface deciding for itself:
 *
 *  1. The library sheet cropped a single frame into a 16:9 box, so a portrait
 *     photo showed the gym ceiling and the top of the model's head — the
 *     dumbbells, i.e. the exercise, cropped away. `Media` contains the photo
 *     over a blurred copy of itself (@4dl/ui media.tsx), so nothing is lost and
 *     nothing is a coloured bar.
 *  2. The library sheet showed ONE frame. An exercise with a start and an end
 *     position is a movement, and the pair animating is the whole point of
 *     storing two — it was already happening in every 40px row and not in the
 *     screen you open to study the movement.
 *  3. The library sheet dropped the demo VIDEO entirely. A coach who uploads
 *     one has said what they want the client to watch.
 *
 * Photos and video are a two-way switch rather than a stack, because they are
 * the same content at two fidelities — showing both means scrolling past the
 * one you did not want.
 */
export function ExerciseHero({ ex, ratio = "photo" }: { ex: ExerciseInfo; ratio?: MediaProps["ratio"] }) {
  const animated = Boolean(ex.thumb_url && ex.thumb2_url);
  const tick = useFrameTick(animated);
  const hasPhoto = Boolean(ex.thumb_url || ex.thumb2_url);
  const [tab, setTab] = useState<"photo" | "video">(hasPhoto ? "photo" : "video");
  if (!hasPhoto && !ex.video_url) return null;
  const both = hasPhoto && Boolean(ex.video_url);
  const showVideo = Boolean(ex.video_url) && (tab === "video" || !hasPhoto);
  return (
    <div className="space-y-2">
      <Media
        src={showVideo ? undefined : ex.thumb_url}
        src2={showVideo ? undefined : ex.thumb2_url}
        video={showVideo ? ex.video_url : undefined}
        fallback={Dumbbell}
        tone="activity"
        ratio={ratio}
        frame={tick}
        alt={ex.name}
        // Which position is on screen, on the frame itself — a cross-fade with
        // no label is just a photo that will not sit still.
        badge={animated && !showVideo ? (tick % 2 === 0 ? "Start" : "End") : undefined}
      />
      {both && (
        <SegmentedControl
          fill
          value={tab}
          onChange={setTab}
          options={[{ value: "photo" as const, label: "Demo" }, { value: "video" as const, label: "Video" }]}
        />
      )}
    </div>
  );
}

/** One attribute line: a fixed-width label and its chips. */
function Attr({ label, chips, tone }: { label: string; chips: string[]; tone: "activity" | "neutral" }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex items-start gap-3 px-1">
      <span className="mt-1 w-24 shrink-0 text-micro uppercase text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">{chips.map((c) => <Badge key={c} tone={tone}>{c}</Badge>)}</div>
    </div>
  );
}

/** What the movement trains and what it needs — the same four lines wherever an
 *  exercise is opened, so the answer is always in the same place. */
export function ExerciseFacts({ ex }: { ex: ExerciseInfo }) {
  const primary = splitList(ex.muscle_groups).map(pretty);
  const secondary = splitList(ex.secondary_muscle_groups).map(pretty);
  const equipment = splitList(ex.equipment).map(pretty);
  const type = [ex.difficulty, ex.mechanic, ex.force].filter(Boolean).map((a) => pretty(a!));
  if (!primary.length && !secondary.length && !equipment.length && !type.length) return null;
  return (
    <div className="space-y-2">
      <Attr label="Muscles" chips={primary} tone="activity" />
      <Attr label="Also works" chips={secondary} tone="neutral" />
      <Attr label="Equipment" chips={equipment} tone="neutral" />
      <Attr label="Type" chips={type} tone="neutral" />
    </div>
  );
}

/**
 * Instructions, as STEPS.
 *
 * The library's written instructions arrive as three or four dense paragraphs,
 * and rendering them as prose is what the screen looked like before: a wall of
 * text you are supposed to read WHILE holding a dumbbell. They are already a
 * sequence — the source just does not say so — and numbering them costs
 * nothing and makes the thing findable mid-set ("I'm on 3").
 *
 * Text that is ALREADY structured (a markdown list, headings) is left to
 * `Markdown`: someone wrote that structure deliberately and re-numbering it
 * would fight them.
 */
const STRUCTURED = /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s)/m;

export function ExerciseSteps({ md }: { md?: string | null }) {
  const text = (md ?? "").trim();
  if (!text) return <p className="px-1 text-sm text-muted-foreground">No written instructions yet — ask your coach for cues.</p>;
  if (STRUCTURED.test(text)) return <Markdown className="text-[0.95rem] leading-relaxed text-foreground/90">{text}</Markdown>;
  const steps = text.split(/\n\s*\n/).map((s) => s.trim().replace(/\s*\n\s*/g, " ")).filter(Boolean);
  if (steps.length < 2) return <p className="px-1 text-[0.95rem] leading-relaxed text-foreground/90">{steps[0] ?? text}</p>;
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="numeral mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-activity-soft text-xs font-bold text-activity">{i + 1}</span>
          <span className="min-w-0 flex-1 text-[0.95rem] leading-relaxed text-foreground/90">{s}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * THE exercise detail body — media, facts, whatever the surface wants in the
 * middle (the player puts the coach's prescription there), then the how-to.
 *
 * The two surfaces that show an exercise in full had drifted apart: the player
 * had side-by-side start/end stills, a video and an attribute list; the client's
 * library sheet had one cropped photo and three badges. Same subject, same
 * question being asked of it, two answers. This is the one answer.
 */
export function ExerciseDetail({ ex, children }: { ex: ExerciseInfo; children?: ReactNode }) {
  return (
    <div className="space-y-5">
      <ExerciseHero ex={ex} />
      <ExerciseFacts ex={ex} />
      {children}
      <div className="space-y-2.5">
        <Eyebrow>How to</Eyebrow>
        <ExerciseSteps md={ex.instructions_md} />
      </div>
    </div>
  );
}

/** The muscle · equipment label as a plain string (for composing sub-lines). */
export const metaText = (ex?: ExerciseInfo): string =>
  ex ? [firstMuscle(ex), splitList(ex.equipment)[0]].filter(Boolean).map((b) => pretty(b!)).join(" · ") : "";

/** Small muscle + equipment sub-label ("Chest · Barbell"). */
export function ExerciseMeta({ ex, className = "" }: { ex: ExerciseInfo; className?: string }) {
  const t = metaText(ex);
  if (!t) return null;
  return <span className={className}>{t}</span>;
}

/**
 * The canonical exercise row: thumbnail, name (with an optional ⓘ affordance),
 * and a sub-line that leads with the muscle · equipment meta and appends
 * whatever `sub` you pass (a prescription like "3 × 10 reps", a "2/3 sets"
 * progress, etc.). The tappable content is thumb+text; `trailing` hangs actions
 * or a difficulty badge off the end. Wrap it in the surface's own container
 * (SubCard, Card, a bare list) — the row is the shared, unified part.
 */
export function ExerciseRow({
  ex, name, sub, trailing, info, meta = true, thumbSize = 44, onClick, className,
}: {
  ex?: ExerciseInfo;
  /** Fallback name when `ex` is absent (e.g. an id-only reference). */
  name?: string;
  /** Extra sub-line text, appended after the muscle · equipment meta. */
  sub?: ReactNode;
  /** Actions/badge pinned to the far right. */
  trailing?: ReactNode;
  /** Show the ⓘ info affordance next to the name. */
  info?: boolean;
  /** Lead the sub-line with muscle · equipment (default true). */
  meta?: boolean;
  thumbSize?: number;
  onClick?: () => void;
  className?: string;
}) {
  const label = ex?.name ?? name ?? "Exercise";
  const m = meta ? metaText(ex) : "";
  const Body = (
    <>
      <ExerciseThumb thumb={ex?.thumb_url} thumb2={ex?.thumb2_url} size={thumbSize} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 font-medium"><span className="truncate">{label}</span>{info && <Info className="size-3.5 shrink-0 text-muted-foreground" />}</div>
        {/*
          The PRESCRIPTION never truncates; the muscle/equipment meta does.

          These were concatenated into one truncating line, so a superset slot
          read "Quadriceps · Barbell · 1 × 12 r…" — the part you need mid-set cut
          off, and the part you already know kept whole. Which of the two you can
          afford to lose is not a close call.
        */}
        {(m || sub != null) && (
          <div className="flex min-w-0 items-baseline gap-1 text-sm text-muted-foreground">
            {m && <span className="min-w-0 truncate">{m}</span>}
            {m && sub != null && <span className="shrink-0 text-muted-foreground/50">·</span>}
            {sub != null && <span className="shrink-0">{sub}</span>}
          </div>
        )}
      </div>
    </>
  );
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {onClick ? (
        <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left transition-opacity active:opacity-80">{Body}</button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{Body}</div>
      )}
      {trailing}
    </div>
  );
}
