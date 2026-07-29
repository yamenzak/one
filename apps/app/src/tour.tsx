/**
 * Interactive product tours — guided spotlight walkthroughs of the client app.
 * There are three:
 *   • "app"     — the whole app, auto-starts on first run. Runs with sample data
 *                 (tour-mock.ts) so every screen is populated and writes are
 *                 swallowed; the others annotate the real screen in place.
 *   • "workout" — the session player: days, exercise details, set logging, timers.
 *   • "meal"    — the meal plan: sections, options, macros, the shopping list.
 * Each step highlights a real element (`data-tour="…"`), narrating what it does;
 * `route` steps navigate as they go.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Button, ArrowRight, ArrowLeft, X, Info, Hand, CircleCheck, toneVar, type Tone, DUR} from "@kova/ui";
import { setApiInterceptor } from "./api.js";
import { tourInterceptor } from "./tour-mock.js";

export type TourId = "app" | "workout" | "meal";

const doneKey = (id: TourId) => `kova.tour.v1.${id}.done`;
export const tourSeen = (id: TourId): boolean => { try { return localStorage.getItem(doneKey(id)) === "1"; } catch { return true; } };
const markSeen = (id: TourId): void => { try { localStorage.setItem(doneKey(id), "1"); } catch { /* private mode */ } };

interface TourStep {
  route?: string; routeMatch?: string; selector?: string; action?: boolean;
  title: string; body: string; tone?: Tone;
  /** For action steps: shown once the user does the thing — a beat that explains
   *  what just happened before they move on (instead of silently advancing). */
  after?: { title: string; body: string };
}

// `action: true` → the highlighted element is live: doing the thing (tapping
// it) advances the tour. Beginner-friendly "now you try it" beats.
const TOURS: Record<TourId, TourStep[]> = {
  app: [
    { route: "/today", title: "Welcome to your training home", body: "Let's take a hands-on spin. We've filled the app with sample data so you can try everything — none of it is real yet.", tone: "primary" },
    { route: "/today", selector: "today-hero", title: "Your day at a glance", body: "Live rings for today — calories, protein, water and workouts. Long-press to rearrange them however you like.", tone: "primary" },
    { route: "/today", selector: "today-log", title: "Log in a tap", body: "Meals, water, weight, workouts — everything you track starts from this button.", tone: "primary" },
    { route: "/today", selector: "today-agenda", title: "Today's game plan", body: "Your checklist for the day — check-in, workout, meals and supplements. Tick them off as you go.", tone: "primary" },
    { selector: "tab-train", action: true, title: "Now you try — tap Train", body: "These are your five tabs. Give the Train tab a tap to see your workouts.", tone: "activity" },
    { route: "/train", selector: "train-hero", title: "Your training plan", body: "Your coach's plan, day by day. Tap a day to start a guided session with rest timers and set logging.", tone: "activity" },
    { selector: "tab-eat", action: true, title: "Tap the Eat tab", body: "Nice! Now hop over to Eat.", tone: "nutrition" },
    { route: "/eat", selector: "eat-hero", title: "Nutrition, made simple", body: "Today's intake against your targets, your meal plan to follow, and food logging in seconds.", tone: "nutrition" },
    { selector: "tab-wellness", action: true, title: "Tap Wellness", body: "Keep going — open the Wellness tab.", tone: "sleep" },
    { route: "/wellness", selector: "wellness-hero", title: "Your wellness score", body: "One number for how you're really doing — blending sleep, nutrition, training, hydration and mood.", tone: "sleep" },
    { selector: "tab-progress", action: true, title: "Last one — tap Progress", body: "And finally, the Progress tab.", tone: "cardio" },
    { route: "/progress", selector: "progress-hero", title: "Watch yourself improve", body: "Weight, strength, adherence and wellness, all trending over time so you can see the work pay off.", tone: "cardio" },
    { route: "/today", title: "You've got it", body: "That was sample data — your real journey starts now. Finish your profile and your coach will tailor everything to you.", tone: "primary" },
  ],
  workout: [
    { route: "/train/session/0", routeMatch: "/train/session", selector: "wp-exercise", title: "Your workout, guided", body: "Each exercise in order with everything you need to train it — no guessing. Here's the first.", tone: "activity" },
    { selector: "wp-details", title: "Know every move", body: "Tap the exercise name anytime for a demo, the muscles it works, and step-by-step how-to.", tone: "activity" },
    { selector: "wp-sets", title: "Your prescribed sets", body: "Each dot is a set with its target reps and weight. They fill in as you log.", tone: "activity" },
    { selector: "wp-timer", action: true, title: "Now you try — start a rest", body: "Between exercises there's a rest clock. Tap it to start your countdown.", tone: "activity",
      after: { title: "That's your rest running", body: "The clock is counting down your recovery — when it hits zero you're set for the next round. It keeps ticking even if you scroll away." } },
    { selector: "wp-progress", title: "Track your session", body: "This ring fills as you log — when it's full, you're done. Head back with the arrow any time.", tone: "activity" },
    { selector: "wp-log", action: true, title: "Now you try — log a set", body: "Ready? Tap Log to record your reps, weight and how it felt.", tone: "activity",
      after: { title: "Set logged — you're training!", body: "Your reps, weight and how it felt are saved, and the session ring just ticked up. Log every set this way and you'll finish the whole workout." } },
  ],
  meal: [
    { route: "/eat?tour=meal", routeMatch: "/eat", selector: "mp-hero", title: "Your meal plan", body: "Everything your coach designed for you, with your daily calorie and protein targets right up top.", tone: "nutrition" },
    { selector: "mp-section", title: "Options for every meal", body: "Each meal comes with options — swipe through and tap one to see its foods, full macros and even an AI recipe.", tone: "nutrition" },
    { selector: "mp-log", action: true, title: "Now you try — log a meal", body: "Eating this one? Tap Log to add it to today.", tone: "nutrition",
      after: { title: "Meal logged", body: "Its calories and macros just landed in today's intake — your rings on Today and Eat move to match. That's all it takes to stay on target." } },
    { selector: "mp-tabs", title: "Meals & shopping list", body: "Two views: your meals, and a Shopping list that totals every ingredient you need for the week.", tone: "nutrition" },
    { selector: "mp-shop-add", action: true, title: "Now you try — plan your week", body: "Here's your shopping list. Tap + to add another day of this meal.", tone: "nutrition",
      after: { title: "Added to your list", body: "We tallied every ingredient in that meal into your shopping list. Add more days and the quantities add up for you automatically." } },
    { selector: "mp-shop-item", action: true, title: "Now you try — check it off", body: "There's your list. Tap an item to mark it as bought.", tone: "nutrition",
      after: { title: "Crossed off", body: "It's marked done and saved on your device, so your list remembers what you've already got — even next time you open it." } },
    { selector: "mp-shop-reset", title: "Fresh start each week", body: "When a new week rolls around, hit Start over to clear it and plan again.", tone: "nutrition" },
  ],
};

interface TourValue { tour: TourId | null; active: boolean; stepSelector: string | null; start: (id: TourId) => void; startIfNew: (id: TourId) => void; stop: () => void }
const TourCtx = createContext<TourValue>({ tour: null, active: false, stepSelector: null, start: () => {}, startIfNew: () => {}, stop: () => {} });
export const useTour = (): TourValue => useContext(TourCtx);

export function TourProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ tour: TourId; idx: number } | null>(null);
  const active = state !== null;
  const start = useCallback((id: TourId) => {
    setApiInterceptor(tourInterceptor); // every tour runs on sample data
    setState({ tour: id, idx: 0 });
  }, []);
  const startIfNew = useCallback((id: TourId) => { if (!tourSeen(id)) start(id); }, [start]);
  const stop = useCallback(() => { setApiInterceptor(null); setState((s) => { if (s) markSeen(s.tour); return null; }); }, []);
  const setIdx = useCallback((idx: number) => setState((s) => (s ? { ...s, idx } : s)), []);
  const stepSelector = state ? TOURS[state.tour][state.idx]?.selector ?? null : null;
  const value = useMemo(() => ({ tour: state?.tour ?? null, active, stepSelector, start, startIfNew, stop }), [state, active, stepSelector, start, startIfNew, stop]);
  return (
    <TourCtx.Provider value={value}>
      {children}
      {state && TOURS[state.tour].length > 0 && <TourOverlay steps={TOURS[state.tour]} idx={state.idx} setIdx={setIdx} stop={stop} />}
    </TourCtx.Provider>
  );
}

const PAD = 8;

/** The visible element for a data-tour anchor (an anchor can exist twice — the
 *  mobile bottom bar and the desktop rail — only one is on-screen). */
const pickEl = (selector: string): HTMLElement | null => {
  const els = [...document.querySelectorAll<HTMLElement>(`[data-tour="${selector}"]`)];
  return els.find((e) => e.getBoundingClientRect().width > 0) ?? els[0] ?? null;
};

function TourOverlay({ steps, idx, setIdx, stop }: { steps: TourStep[]; idx: number; setIdx: (i: number) => void; stop: () => void }) {
  const step = steps[idx]!;
  const nav = useNavigate();
  const loc = useLocation();
  const [rect, setRect] = useState<DOMRect | null>(null);
  // For action steps with an `after` beat: flips true once the user does the
  // thing, swapping the card to the "here's what just happened" explanation.
  const [done, setDone] = useState(false);
  useEffect(() => { setDone(false); }, [idx]);
  const cardRef = useRef<HTMLDivElement>(null);

  // Escape dismisses the tour, matching the close (✕) affordance.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") stop(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stop]);

  // Basic focus management: move focus onto the tour card as each step (and each
  // action `after` beat) appears, so keyboard/AT users land on the live copy.
  useEffect(() => { cardRef.current?.focus(); }, [idx, done]);
  const accent = toneVar[step.tone ?? "primary"];
  const last = idx === steps.length - 1;
  const next = () => (last ? stop() : setIdx(idx + 1));
  const back = () => idx > 0 && setIdx(idx - 1);
  // The copy currently on the card — the explanation once the action fired.
  const shown = done && step.after ? step.after : step;

  // Navigate to the step's route before highlighting. Compare on pathname only
  // so a query (e.g. ?tour=meal, used to open the Eat meal drawer) doesn't loop.
  useEffect(() => {
    const routePath = step.route?.split("?")[0];
    const base = step.routeMatch ?? routePath;
    if (routePath && base && !loc.pathname.startsWith(base)) nav(step.route!);
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Action steps: advance when the user actually does the thing (taps the live
  // target). The element's own handler runs first, then we step forward.
  useEffect(() => {
    if (!step.action || !step.selector) return;
    let raf = 0, tries = 0, el: Element | null = null;
    // Let the element's own handler run, then either explain what happened
    // (steps with an `after` beat) or move straight on.
    const onClick = () => window.setTimeout(() => (step.after ? setDone(true) : next()), 60);
    const attach = () => {
      el = pickEl(step.selector!);
      if (el) el.addEventListener("click", onClick, { once: true });
      else if (tries++ < 200) raf = requestAnimationFrame(attach);
    };
    raf = requestAnimationFrame(attach);
    return () => { cancelAnimationFrame(raf); el?.removeEventListener("click", onClick); };
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Find + track the target element (it may still be loading in after nav).
  // NB: don't null the rect up front for selector steps — keep the previous
  // spotlight painted until the new target resolves, so hopping between steps
  // glides instead of flashing the whole screen fully-dimmed for a frame.
  useEffect(() => {
    if (!step.selector) { setRect(null); return; }
    let raf = 0, tries = 0, scrolled = false;
    const find = () => {
      const el = pickEl(step.selector!);
      if (el) {
        if (!scrolled) { el.scrollIntoView({ block: "center", behavior: "smooth" }); scrolled = true; raf = requestAnimationFrame(() => setTimeout(() => setRect(el.getBoundingClientRect()), 260)); return; }
        setRect(el.getBoundingClientRect());
      } else if (tries++ < 150) raf = requestAnimationFrame(find);
    };
    raf = requestAnimationFrame(find);
    return () => cancelAnimationFrame(raf);
  }, [idx, loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the highlight glued to the element through scroll / layout shifts.
  useEffect(() => {
    if (!step.selector) return;
    const update = () => { const el = pickEl(step.selector!); if (el) setRect(el.getBoundingClientRect()); };
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    const iv = window.setInterval(update, 350);
    return () => { window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); clearInterval(iv); };
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const below = rect ? rect.top + rect.height / 2 < vh * 0.5 : false;
  const tipStyle: React.CSSProperties = rect
    ? below
      ? { top: rect.bottom + PAD + 12, left: 16, right: 16 }
      : { bottom: vh - rect.top + PAD + 12, left: 16, right: 16 }
    : { top: "50%", left: 16, right: 16, transform: "translateY(-50%)" };

  return createPortal(
    // Root is click-through; each layer opts back in. This is what lets an
    // action step's spotlit target stay live — only the dimmed panes (and, for
    // info steps, a full catcher) actually intercept clicks.
    <div className="pointer-events-none fixed inset-0 z-[200]">
      {/* Info steps block interaction (Next to advance). Action steps leave the
          spotlit target live so the user can actually tap it — but once they've
          done it (the `after` beat), we re-block so they read, not double-tap. */}
      {(!step.action || done) && <div className="pointer-events-auto absolute inset-0" />}

      {rect ? (
        <>
          <div className="pointer-events-auto absolute inset-x-0 top-0 bg-black/65 backdrop-blur-[1px]" style={{ height: Math.max(0, rect.top - PAD) }} />
          <div className="pointer-events-auto absolute inset-x-0 bottom-0 bg-black/65 backdrop-blur-[1px]" style={{ top: rect.bottom + PAD }} />
          <div className="pointer-events-auto absolute bg-black/65 backdrop-blur-[1px]" style={{ top: rect.top - PAD, height: rect.height + PAD * 2, left: 0, width: Math.max(0, rect.left - PAD) }} />
          <div className="pointer-events-auto absolute bg-black/65 backdrop-blur-[1px]" style={{ top: rect.top - PAD, height: rect.height + PAD * 2, left: rect.right + PAD, right: 0 }} />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute rounded-2xl"
            initial={{ opacity: 0 }}
            animate={/* design-tokens-exempt: an ANIMATED spotlight ring measured from the target element at runtime — no utility class can express it, and it is already brand-derived (`accent` is the primary token). */ step.action && !done ? { opacity: 1, boxShadow: [`0 0 0 2px ${accent}, 0 0 0 4px color-mix(in oklch, ${accent} 35%, transparent)`, `0 0 0 2px ${accent}, 0 0 0 12px color-mix(in oklch, ${accent} 0%, transparent)`] } : { opacity: 1 }}
            transition={/* design-tokens-exempt: the timing for the animated ring above. */ step.action && !done ? { boxShadow: { duration: 1.4, repeat: Infinity, ease: "easeOut" }, opacity: { duration: 0.2 } } : { duration: 0.2 }}
            /* design-tokens-exempt: the ring's resting state, same runtime geometry as the animation above. */
            style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: `0 0 0 2px ${accent}, 0 0 0 6px color-mix(in oklch, ${accent} 30%, transparent)` }}
          />
        </>
      ) : (
        <div className="pointer-events-auto absolute inset-0 bg-black/70 backdrop-blur-[1px]" />
      )}

      <div className="pointer-events-none absolute" style={tipStyle}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${idx}:${done ? 1 : 0}`}
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-label={shown.title}
            tabIndex={-1}
            initial={{ opacity: 0, y: below ? -8 : 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: DUR.base, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto mx-auto max-w-md rounded-3xl border border-border/50 bg-card p-5 shadow-lg outline-none"
          >
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl [&_svg]:size-[1.1rem]" style={{ backgroundColor: `color-mix(in oklch, ${accent} 16%, transparent)`, color: accent }}>{done ? <CircleCheck /> : step.action ? <Hand /> : <Info />}</div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold leading-tight">{shown.title}</div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{shown.body}</p>
              </div>
              <button onClick={stop} aria-label="Close tour" className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&_svg]:size-4"><X /></button>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex gap-1.5">{steps.map((_, i) => <span key={i} className="h-1.5 rounded-full transition-all" style={{ width: i === idx ? 18 : 6, backgroundColor: i === idx ? accent : "var(--surface-3)" }} />)}</div>
              <div className="flex items-center gap-2">
                {idx > 0 && !done && <Button size="sm" variant="ghost" onClick={back}><ArrowLeft /> Back</Button>}
                {step.action && !done ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ color: accent, backgroundColor: `color-mix(in oklch, ${accent} 12%, transparent)` }}><Hand className="size-3.5" /> Your turn — give it a tap</span>
                ) : (
                  <Button size="sm" onClick={next} style={{ backgroundColor: accent }}>{last ? "Finish" : "Next"} {!last && <ArrowRight />}</Button>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>,
    document.body,
  );
}
