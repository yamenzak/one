/**
 * Interactive product tour — a guided spotlight walkthrough of the client app.
 * While it runs, the api layer is intercepted with sample data (tour-mock.ts) so
 * every screen is populated and writes are swallowed, letting a brand-new client
 * explore a fully "lived-in" app. Each step highlights a real element
 * (`data-tour="…"`), narrating what it does; route steps navigate as they go.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Button, ArrowRight, ArrowLeft, X, Sparkles, toneVar, type Tone } from "@mossa/ui";
import { setApiInterceptor } from "./api.js";
import { tourInterceptor } from "./tour-mock.js";

const DONE_KEY = "mossa.tour.v1.done";
export const tourSeen = (): boolean => { try { return localStorage.getItem(DONE_KEY) === "1"; } catch { return true; } };
const markSeen = (): void => { try { localStorage.setItem(DONE_KEY, "1"); } catch { /* private mode */ } };

interface TourStep { route?: string; selector?: string; title: string; body: string; tone?: Tone }

const STEPS: TourStep[] = [
  { route: "/today", title: "Welcome to your training home", body: "Let's take a quick spin. We've filled the app with sample data so you can see everything in action — none of this is real yet.", tone: "primary" },
  { route: "/today", selector: "today-hero", title: "Your day at a glance", body: "Live rings for today — calories, protein, water and workouts. Tap Customize to rearrange them however you like.", tone: "primary" },
  { route: "/today", selector: "today-log", title: "Log in a tap", body: "Meals, water, weight, workouts — everything you track starts from this button.", tone: "primary" },
  { route: "/today", selector: "today-agenda", title: "Today's game plan", body: "Your checklist for the day: check-in, workout, meals and supplements. Tick them off as you go.", tone: "primary" },
  { route: "/train", selector: "train-hero", title: "Your training plan", body: "Your coach's plan, day by day. Tap a day to start a guided session with rest timers and set logging.", tone: "activity" },
  { route: "/eat", selector: "eat-hero", title: "Nutrition, made simple", body: "Today's intake against your targets, your meal plan to follow, and food logging in seconds.", tone: "nutrition" },
  { route: "/wellness", selector: "wellness-hero", title: "Your wellness score", body: "One number for how you're really doing — blending sleep, nutrition, training, hydration and mood.", tone: "sleep" },
  { route: "/progress", selector: "progress-hero", title: "Watch yourself improve", body: "Weight, strength, adherence and wellness, all trending over time so you can see the work pay off.", tone: "cardio" },
  { route: "/today", title: "You're all set", body: "That was sample data — your real journey starts now. Finish your profile and your coach will tailor everything to you.", tone: "primary" },
];

interface TourValue { active: boolean; start: () => void; stop: () => void }
const TourCtx = createContext<TourValue>({ active: false, start: () => {}, stop: () => {} });
export const useTour = (): TourValue => useContext(TourCtx);

export function TourProvider({ children }: { children: ReactNode }) {
  const [idx, setIdx] = useState<number | null>(null);
  const active = idx !== null;
  const start = useCallback(() => { setApiInterceptor(tourInterceptor); setIdx(0); }, []);
  const stop = useCallback(() => { setApiInterceptor(null); setIdx(null); markSeen(); }, []);
  const value = useMemo(() => ({ active, start, stop }), [active, start, stop]);
  return (
    <TourCtx.Provider value={value}>
      {children}
      {active && <TourOverlay idx={idx!} setIdx={setIdx} stop={stop} />}
    </TourCtx.Provider>
  );
}

const PAD = 8;

function TourOverlay({ idx, setIdx, stop }: { idx: number; setIdx: (i: number) => void; stop: () => void }) {
  const step = STEPS[idx]!;
  const nav = useNavigate();
  const loc = useLocation();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const accent = toneVar[step.tone ?? "primary"];

  // Navigate to the step's route before highlighting.
  useEffect(() => { if (step.route && loc.pathname !== step.route) nav(step.route); }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Find + track the target element (it may still be loading in after nav).
  useEffect(() => {
    if (!step.selector) { setRect(null); return; }
    setRect(null);
    let raf = 0, tries = 0, scrolled = false;
    const find = () => {
      const el = document.querySelector(`[data-tour="${step.selector}"]`) as HTMLElement | null;
      if (el) {
        if (!scrolled) { el.scrollIntoView({ block: "center", behavior: "smooth" }); scrolled = true; raf = requestAnimationFrame(() => setTimeout(() => { setRect(el.getBoundingClientRect()); }, 260)); return; }
        setRect(el.getBoundingClientRect());
      } else if (tries++ < 150) raf = requestAnimationFrame(find);
    };
    raf = requestAnimationFrame(find);
    return () => cancelAnimationFrame(raf);
  }, [idx, loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the highlight glued to the element through scroll / layout shifts.
  useEffect(() => {
    if (!step.selector) return;
    const update = () => { const el = document.querySelector(`[data-tour="${step.selector}"]`); if (el) setRect(el.getBoundingClientRect()); };
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    const iv = window.setInterval(update, 350);
    return () => { window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); clearInterval(iv); };
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  const last = idx === STEPS.length - 1;
  const next = () => (last ? stop() : setIdx(idx + 1));
  const back = () => idx > 0 && setIdx(idx - 1);

  // Tooltip placement: below the target if it sits in the top ~55% of the
  // viewport, otherwise above. Centered when there's no target.
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const below = rect ? rect.top + rect.height / 2 < vh * 0.5 : false;
  const tipStyle: React.CSSProperties = rect
    ? below
      ? { top: rect.bottom + PAD + 12, left: 16, right: 16 }
      : { bottom: vh - rect.top + PAD + 12, left: 16, right: 16 }
    : { top: "50%", left: 16, right: 16, transform: "translateY(-50%)" };

  return createPortal(
    <div className="fixed inset-0 z-[200]">
      {/* Click-catcher — blocks the app so the tour stays on rails. */}
      <div className="absolute inset-0" />

      {/* Dim + spotlight. Four panes leave the target lit; full dim otherwise. */}
      {rect ? (
        <>
          <div className="absolute inset-x-0 top-0 bg-black/65 backdrop-blur-[1px]" style={{ height: Math.max(0, rect.top - PAD) }} />
          <div className="absolute inset-x-0 bottom-0 bg-black/65 backdrop-blur-[1px]" style={{ top: rect.bottom + PAD }} />
          <div className="absolute bg-black/65 backdrop-blur-[1px]" style={{ top: rect.top - PAD, height: rect.height + PAD * 2, left: 0, width: Math.max(0, rect.left - PAD) }} />
          <div className="absolute bg-black/65 backdrop-blur-[1px]" style={{ top: rect.top - PAD, height: rect.height + PAD * 2, left: rect.right + PAD, right: 0 }} />
          <motion.div
            className="pointer-events-none absolute rounded-2xl"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: `0 0 0 2px ${accent}, 0 0 0 6px color-mix(in oklch, ${accent} 30%, transparent)` }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-[1px]" />
      )}

      {/* Tooltip / narration card. */}
      <div className="pointer-events-none absolute" style={tipStyle}>
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: below ? -8 : 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto mx-auto max-w-md rounded-3xl border border-border/50 bg-card p-5 shadow-[0_24px_60px_-20px_oklch(0_0_0/0.6)]"
          >
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl [&_svg]:size-[1.1rem]" style={{ backgroundColor: `color-mix(in oklch, ${accent} 16%, transparent)`, color: accent }}><Sparkles /></div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold leading-tight">{step.title}</div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
              <button onClick={stop} aria-label="Skip tour" className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&_svg]:size-4"><X /></button>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex gap-1.5">{STEPS.map((_, i) => <span key={i} className="h-1.5 rounded-full transition-all" style={{ width: i === idx ? 18 : 6, backgroundColor: i === idx ? accent : "var(--surface-3)" }} />)}</div>
              <div className="flex items-center gap-2">
                {idx > 0 && <Button size="sm" variant="ghost" onClick={back}><ArrowLeft /> Back</Button>}
                <Button size="sm" onClick={next} style={{ backgroundColor: accent }}>{last ? "Finish" : "Next"} {!last && <ArrowRight />}</Button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>,
    document.body,
  );
}
