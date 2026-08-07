/** Eat tab — the nutrition diary: intake vs target, meals, per-entry macros. */

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtEnergy, fmtVolume, volumeDisplayToMl, kcalToDisplay } from "@kova/domain";
import { Button, Card, Field, Chip, Sheet, Skeleton, IconBadge, MetricPill, ProgressRing, toneSoft, Eyebrow, Page, Stagger, EmptyState, motion, ConfirmDialog, Reveal, SkeletonHero, SkeletonStatGrid, SkeletonList, SkeletonLine, Plus, Utensils, Croissant, Soup, Apple, Dumbbell, Trash2, AlertTriangle, type LucideIcon, Anchor, CountUp, Droplet, SPRING_SOFT, cn } from "@4dl/ui";
import { MacroBar, MetricChip, METRICS } from "../../registry/index.js";
import type { UnitPrefs } from "@kova/domain";
import { api, errorText, isQueued, todayLocal } from "../../api.js";
import { QueuedNotice } from "../../notices.js";
import { useCan } from "../../FeatureLock.js";
import { useUnits } from "../../units.js";
import { FoodRow, FoodThumb, normFood } from "../food.js";
import { FoodSearchSheet } from "./FoodSearchSheet.js";
import { MealPlanDrawer } from "./MealPlanDrawer.js";
import { CoachNote } from "./CoachNote.js";
import { LaneSwitcher, type Lane } from "./LaneSwitcher.js";
import { publishedInLane } from "./lanes.js";

interface Entry { id: string; meal_type: string; label: string | null; calories: number; protein_g: number; carbs_g: number; fat_g: number; quantity: number | null; unit: string | null; image_url: string | null }
/** A previously-logged food, ready to re-log at its last portion in one tap. */
interface Recent { food_id: string | null; label: string; unit: string | null; quantity: number | null; calories: number; protein_g: number; carbs_g: number; fat_g: number; image_url: string | null }
interface Targets { targetCalories?: number; targetProteinG?: number; targetCarbsG?: number; targetFatG?: number; targetWaterMl?: number }
interface WeekDay { date: string; calories: number; proteinG: number; waterMl: number; logged: boolean }
interface Week { days: WeekDay[]; targets: { calories: number | null; proteinG: number | null; waterMl: number | null } }

const MEAL_META: Record<string, { label: string; icon: LucideIcon }> = {
  breakfast: { label: "Breakfast", icon: Croissant },
  lunch: { label: "Lunch", icon: Soup },
  dinner: { label: "Dinner", icon: Utensils },
  snack: { label: "Snack", icon: Apple },
  pre_workout: { label: "Pre-workout", icon: Dumbbell },
  post_workout: { label: "Post-workout", icon: Dumbbell },
  free: { label: "Free meal", icon: Utensils },
};
const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout", "free"];
const metaFor = (m: string) => MEAL_META[m] ?? { label: m.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), icon: Utensils };
/** The sensible default meal for a one-tap quick-add, bucketed by time of day. */
const mealBucket = (): string => { const h = new Date().getHours(); return h < 11 ? "breakfast" : h < 15 ? "lunch" : h < 17 ? "snack" : h < 22 ? "dinner" : "snack"; };

export function Eat({ clientId }: { clientId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [relogging, setRelogging] = useState<string | null>(null);
  const [waterMl, setWaterMl] = useState(0);
  const [logMeal, setLogMeal] = useState<string | undefined>(undefined);
  const [logOpen, setLogOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [mealPlan, setMealPlan] = useState<{ name: string; meals: number; options: number } | null>(null);
  const [variants, setVariants] = useState<Lane[]>([]);
  const [currentVariantId, setCurrentVariantId] = useState<string | null>(null);
  const [defaultLabel, setDefaultLabel] = useState("Main");
  const [edit, setEdit] = useState<Entry | null>(null);
  const [error, setError] = useState(false);
  // Feedback for the one-tap write paths (quick-add re-log, water): a failure the
  // user can read, and a "saved offline" confirmation so nothing gets re-tapped.
  const [logErr, setLogErr] = useState<string | null>(null);
  const [queuedMsg, setQueuedMsg] = useState(false);
  const reqRef = useRef(0);
  const units = useUnits();
  const date = todayLocal();
  // What this client's package includes. Absent capabilities are omitted, not
  // locked: a client can't buy their studio's plan, so an upsell here is noise.
  const canFood = useCan("foodLogging");
  const canMealPlan = useCan("mealPlan");
  const canMacros = useCan("macroBreakdown");
  const canWater = useCan("waterLogging");
  const canWeekReport = useCan("nutritionReports");

  // Guards stale writes (fast client swap in coach view) and surfaces a load
  // failure instead of stranding the screen on the skeleton forever.
  //
  // These five reads are INDEPENDENT sections, so they settle independently: with
  // Promise.all a flaky /week (or /today) rejected the whole batch and blanked
  // the diary the client had already logged. Only the diary itself is required —
  // everything else degrades to its own section going quiet.
  const load = useCallback(async () => {
    const rid = ++reqRef.current;
    setError(false);
    // A read whose section this client doesn't hold is skipped (the week read
    // 403s without `nutritionReports`); positions are held by resolved stubs.
    const [eR, todayR, wkR, mpR, rcR] = await Promise.allSettled([
      api.get<{ entries: Entry[] }>(`/api/logs/food?clientId=${clientId}&date=${date}`),
      api.get<{ waterMl?: number; goal: { targets: Targets | null } | null }>(`/api/today?clientId=${clientId}&date=${date}`),
      canWeekReport ? api.get<Week>(`/api/logs/nutrition/week?clientId=${clientId}&date=${date}`) : Promise.resolve<Week | null>(null),
      canMealPlan ? api.get<{ plans: { status: string; name: string; variantId: string | null; body?: { mealOptions?: { mealType: string }[] } }[]; variants: Lane[]; currentVariantId: string | null; defaultLabel?: string }>(`/api/meal-plans?clientId=${clientId}`) : Promise.resolve(null),
      canFood ? api.get<{ recents: Recent[] }>(`/api/foods/recent?clientId=${clientId}&limit=8`) : Promise.resolve({ recents: [] as Recent[] }),
    ]);
    if (rid !== reqRef.current) return;
    // The diary is the screen — without it there's nothing to show, so that one
    // failure is the only one that becomes the full-screen retry.
    if (eR.status !== "fulfilled") { setError(true); return; }
    setEntries(eR.value.entries);
    if (todayR.status === "fulfilled") {
      setTargets(todayR.value.goal?.targets ?? null);
      // Today's water normally rides the /week read; with that read skipped the
      // today bundle is where the total comes from, so the pill still moves.
      if (!canWeekReport && todayR.value.waterMl != null) setWaterMl(todayR.value.waterMl);
    }
    if (rcR.status === "fulfilled") setRecents(rcR.value.recents ?? []);
    if (wkR.status === "fulfilled" && wkR.value) { setWeek(wkR.value); setWaterMl(wkR.value.days[wkR.value.days.length - 1]?.waterMl ?? 0); }
    if (mpR.status === "fulfilled" && mpR.value) {
      const mp = mpR.value;
      setVariants(mp.variants ?? []); setCurrentVariantId(mp.currentVariantId ?? null); setDefaultLabel(mp.defaultLabel || "Main");
      const cur = mp.currentVariantId ?? null;
      const published = publishedInLane(mp.plans, cur);
      const opts = published?.body?.mealOptions ?? [];
      setMealPlan(published ? { name: published.name, meals: new Set(opts.map((o) => o.mealType)).size, options: opts.length } : null);
    }
  }, [clientId, date, canFood, canMealPlan, canWeekReport]);
  useEffect(() => void load(), [load]);

  const waterTarget = targets?.targetWaterMl ?? week?.targets.waterMl ?? 2500;
  const waterPresets = units.volume === "oz" ? [8, 12, 16] : [250, 500, 750];
  const addWater = async (displayAmount: number) => {
    const ml = Math.round(volumeDisplayToMl(displayAmount, units));
    setWaterMl((w) => w + ml);
    // Roll the optimistic bump back if the write fails, so no phantom water sticks
    // — but NOT when it's queued: that write is parked in the service worker and
    // will land, so un-bumping it reads as "nothing happened" and the user taps
    // again, queuing a second glass that also replays.
    try { await api.post("/api/logs/water", { clientId, data: { date, amountMl: ml } }); }
    catch (e) { if (isQueued(e)) setQueuedMsg(true); else setWaterMl((w) => w - ml); }
  };

  const openLog = (meal?: string) => { setLogMeal(meal); setLogOpen(true); };

  // One-tap re-log: write a recent food back at its last portion, bucketed to
  // the current meal-time. A single busy flag guards double-taps from double-logging.
  const relog = async (r: Recent) => {
    if (relogging) return;
    const key = r.food_id ?? r.label;
    setRelogging(key); setLogErr(null); setQueuedMsg(false);
    try {
      await api.post("/api/logs/food", { clientId, data: { date, mealType: mealBucket(), foodId: r.food_id ?? null, label: r.label, quantity: r.quantity, unit: r.unit, calories: r.calories, proteinG: r.protein_g, carbsG: r.carbs_g, fatG: r.fat_g } });
      await load();
    } catch (e) {
      // Queued = durably saved for replay, so it must read as done. Reporting it
      // as a failure got the tile re-tapped and the food logged twice.
      if (isQueued(e)) setQueuedMsg(true);
      else setLogErr(errorText(e, "Couldn't log that — try again."));
    } finally { setRelogging(null); }
  };

  const byMeal = new Map<string, Entry[]>();
  for (const e of entries ?? []) byMeal.set(e.meal_type, [...(byMeal.get(e.meal_type) ?? []), e]);
  const meals = [...MEAL_ORDER.filter((m) => byMeal.has(m)), ...[...byMeal.keys()].filter((m) => !MEAL_ORDER.includes(m))];
  const sum = (f: (e: Entry) => number) => (entries ?? []).reduce((n, e) => n + (f(e) || 0), 0);
  const total = sum((e) => e.calories);
  const proteinTotal = Math.round(sum((e) => e.protein_g));
  const proteinTarget = targets?.targetProteinG ?? 0;
  const calTarget = targets?.targetCalories ?? 0;
  const pct = calTarget > 0 ? total / calTarget : 0;
  const remaining = calTarget - total;

  return (
    <Page className="column space-y-5 p-4 pb-28">
      {/* T1 (§1). Nobody opens Eat to read the word "Eat" — they open it to find
          out how much room is left. With no target there is no "left", so the
          anchor shows what has been eaten instead of inventing a denominator. */}
      <Anchor eyebrow={calTarget > 0 ? "Left today" : "Eaten today"} sub={calTarget > 0
            ? `of ${kcalToDisplay(calTarget, units).toLocaleString()} ${units.energy === "kJ" ? "kJ" : "kcal"}`
            : units.energy === "kJ" ? "kJ" : "kcal"}>
        <CountUp value={kcalToDisplay(calTarget > 0 ? Math.max(0, remaining) : total, units)} />
      </Anchor>

      {error && !entries ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load your day" description="Something went wrong loading your diary. Check your connection and try again." action={<Button onClick={() => void load()}>Try again</Button>} />
      ) : (
      <Reveal loading={!entries} className="space-y-5" skeleton={
        <>
          <SkeletonHero height={104} />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-28 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
          </div>
          <div className="space-y-2">
            <SkeletonLine w="4rem" h="xs" />
            <SkeletonHero height={150} />
            <SkeletonStatGrid count={2} />
          </div>
          <div className="space-y-2">
            <SkeletonLine w="6rem" h="xs" />
            <SkeletonList card rows={3} />
          </div>
        </>
      }>
        {entries && (
        <>
      {/* Lane switching only means something with a meal plan (`mealPlan`). */}
      {canMealPlan && <LaneSwitcher clientId={clientId} kind="meal" variants={variants} currentVariantId={currentVariantId} defaultLabel={defaultLabel} onSwitched={() => void load()} />}
      {/* Your meal plan — the primary entry (parity with Train's active-plan hero) */}
      {canMealPlan && mealPlan && (
        <Stagger>
          <button onClick={() => setPlanOpen(true)} className="w-full text-left">
            <Card interactive className="relative overflow-hidden">
              <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-nutrition/10 blur-2xl" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-micro uppercase text-nutrition">Your meal plan</div>
                  <h2 className="mt-0.5 truncate text-title-3">{mealPlan.name}</h2>
                  <p className="mt-1 text-body text-muted-foreground">{mealPlan.meals} meal{mealPlan.meals === 1 ? "" : "s"} · {mealPlan.options} options to choose from</p>
                </div>
                <div className="grid size-12 shrink-0 place-items-center rounded-full bg-nutrition-soft text-nutrition [&_svg]:size-6"><Utensils /></div>
              </div>
            </Card>
          </button>
        </Stagger>
      )}

      {/* Primary actions — logging is always one prominent tap away (when the
          package includes it: `foodLogging` / `mealPlan`). */}
      {(canFood || (canMealPlan && mealPlan)) && (
      <Stagger className="flex gap-2">
        {canFood && <Button className="min-w-0 flex-1" onClick={() => openLog()}><Plus /> Log food</Button>}
        {canMealPlan && mealPlan && <Button variant="secondary" onClick={() => setPlanOpen(true)}><Utensils /> View plan</Button>}
      </Stagger>
      )}
      {/* One-tap write feedback (quick-add / water) — sits above both so a queued
          or failed tap is never a silent no-op the user retries blindly. */}
      {queuedMsg && <QueuedNotice />}
      {logErr && <p role="alert" className="text-body text-warning">{logErr}</p>}

      {/* Today — intake, hydration + protein at a glance */}
      <section className="space-y-2">
        <Eyebrow>Today</Eyebrow>

        {/* Hero — today's intake, the visual anchor */}
        <Stagger>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-calories/10 blur-2xl" />
            {/*
              Three facts, not one fact three times.

              With real data this card was showing "1,770 kcal eaten" beside an
              "84%" ring, under an anchor already reading "330 left of 2,100" —
              the same measurement in three notations, stacked. The percentage
              was the emptiest of the three: it is the anchor divided by the
              target, carries no unit, and nobody eats a percentage.

              What survives is what the anchor genuinely cannot say — how much
              is IN (the complement of what's left), whether that is fine, and
              what it was made of.
            */}
            <div className="relative">
              <div className="text-micro uppercase text-calories">Today&rsquo;s intake</div>
              <div className="mt-1.5 text-body-lg">
                {fmtEnergy(total, units)} eaten
                {calTarget > 0 && (
                  <span className={cn("ml-2 text-caption font-medium", remaining < 0 ? "text-danger" : "text-muted-foreground")}>
                    {remaining >= 0 ? "· on track" : `· ${fmtEnergy(-remaining, units)} over`}
                  </span>
                )}
              </div>
              {calTarget === 0 && <div className="mt-1 text-caption text-muted-foreground">Log your meals to track intake</div>}
            </div>
            {/* Per-macro detail is `macroBreakdown`. */}
            {canMacros && <MacroBar
              className="relative mt-4"
              proteinG={sum((e) => e.protein_g)}
              carbsG={sum((e) => e.carbs_g)}
              fatG={sum((e) => e.fat_g)}
              targets={targets ? { proteinG: targets.targetProteinG, carbsG: targets.targetCarbsG, fatG: targets.targetFatG } : null}
            />}
          </Card>
        </Stagger>

        {/*
          Water only.

          This was a two-up: water beside a protein pill whose entire content —
          "130 / 165 g" — is the protein chip in the MacroBar 40px above it,
          plus "35 g to go", which is that subtraction. Protein was rendering
          FOUR times on this screen with data in it. Water earns its place
          because it is the one thing here that is not in the macro bar and the
          only one with an action attached.
        */}
        {canWater && (
        <Stagger>
          <div className="space-y-1.5">
            <MetricPill
              icon={METRICS.water.icon}
              tone="hydration"
              label="Water"
              progress={waterMl / waterTarget}
              value={<>{fmtVolume(waterMl, units)}<span className="text-caption font-medium text-muted-foreground"> / {fmtVolume(waterTarget, units)}</span></>}
            />
            <div className="flex gap-1.5">
              {waterPresets.map((v) => <button key={v} onClick={() => void addWater(v)} className={`flex-1 rounded-lg py-2 text-caption font-semibold transition-transform active:scale-95 ${toneSoft.hydration}`}>+{v}</button>)}
            </div>
          </div>
        </Stagger>
        )}
      </section>

      {/* Quick add — one-tap re-log of the client's recent foods at their last
          portion. A re-log is a food write, so it follows `foodLogging`. */}
      {canFood && recents.length > 0 && (
        <section className="space-y-2">
          <Eyebrow>Quick add</Eyebrow>
          {/* `pr-8` on a horizontal scroller: without trailing room the last
              card is sliced flush against the viewport edge mid-word, which
              reads as a clipping bug rather than as "there is more this way". */}
          <Stagger className="no-scrollbar -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 pr-8">
            {recents.map((r) => {
              const key = r.food_id ?? r.label;
              const busy = relogging === key;
              return (
                <button
                  key={key}
                  onClick={() => void relog(r)}
                  disabled={!!relogging}
                  className="flex w-36 shrink-0 snap-start flex-col gap-2 rounded-2xl bg-card p-3 text-left transition-transform active:scale-[0.97] disabled:opacity-60"
                >
                  <div className="flex items-center justify-between">
                    <FoodThumb src={r.image_url} size={38} />
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary [&_svg]:size-4">
                      {busy ? <span className="size-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" /> : <Plus />}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-body font-medium leading-tight">{normFood(r).name}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-caption text-muted-foreground">
                      <span className="numeral shrink-0 font-semibold text-calories">{fmtEnergy(r.calories, units)}</span>
                      {r.quantity ? <span className="truncate">· {Math.round(r.quantity)} {r.unit ?? "g"}</span> : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </Stagger>
        </section>
      )}

      {/* Today's meals */}
      <section className="space-y-2">
        {/* Every entry point into food writing follows `foodLogging`. */}
        <Eyebrow action={canFood && entries.length > 0 ? <button onClick={() => openLog()} className="inline-flex items-center gap-1 text-body font-medium normal-case tracking-normal text-primary [&_svg]:size-4"><Plus /> Log</button> : undefined}>Today's meals</Eyebrow>
        {entries.length === 0 ? (
          <EmptyState icon={Utensils} title="Nothing logged today" description={canFood ? "Log your first meal — search, barcode, snap a photo, or your plan." : "Nothing here yet — your coach logs your meals for you."} action={canFood ? <Button onClick={() => openLog()}><Plus /> Log food</Button> : undefined} />
        ) : (
          <Stagger className="space-y-3">
            {meals.map((meal) => {
              const list = byMeal.get(meal)!;
              const meta = metaFor(meal);
              const mealCal = list.reduce((n, e) => n + e.calories, 0);
              return (
                <Card key={meal} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5"><IconBadge icon={meta.icon} tone="nutrition" size="sm" /><span className="font-semibold">{meta.label}</span></div>
                    {/* A "total" of one thing is not a total — it is the same
                        number printed twice, 20px apart. Shown only when there
                        is actually something to add up. */}
                    {list.length > 1 && <span className="numeral text-body font-semibold text-calories">{fmtEnergy(mealCal, units)}</span>}
                  </div>
                  <div className="divide-y divide-border/40">
                    {list.map((e) => (
                      <FoodRow
                        key={e.id}
                        {...normFood(e)}
                        sub={e.quantity ? `${Math.round(e.quantity)} ${e.unit ?? "g"}` : undefined}
                        thumbSize={36}
                        macros={canMacros}
                        onClick={canFood ? () => setEdit(e) : undefined}
                        className="py-2.5"
                      />
                    ))}
                  </div>
                  {canFood && <button onClick={() => openLog(meal)} className="pt-0.5 text-caption font-semibold text-primary">+ Add to {meta.label.toLowerCase()}</button>}
                </Card>
              );
            })}
          </Stagger>
        )}
      </section>

      {/* This week — a nutrition trend report (`nutritionReports`). */}
      {canWeekReport && week && (
        <section className="space-y-2">
          <Eyebrow>This week</Eyebrow>
          <Stagger><WeekStrip week={week} /></Stagger>
        </section>
      )}

      <Stagger><CoachNote clientId={clientId} surface="eat" /></Stagger>
        </>
        )}
      </Reveal>
      )}

      {canFood && logOpen && <FoodSearchSheet clientId={clientId} mealType={logMeal} onClose={() => setLogOpen(false)} onLogged={() => void load()} />}
      {canMealPlan && planOpen && <MealPlanDrawer clientId={clientId} onClose={() => setPlanOpen(false)} onLogged={() => void load()} />}
      {canFood && edit && <EditEntrySheet entry={edit} clientId={clientId} units={units} onClose={() => setEdit(null)} onSaved={() => void load()} />}
    </Page>
  );
}

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

/** Compact 7-day nutrition reflection: calorie-adherence bars + streak/on-target/protein. */
function WeekStrip({ week }: { week: Week }) {
  const days = week.days;
  if (!days.some((d) => d.logged)) return null;
  const ct = week.targets.calories;
  const pt = week.targets.proteinG;
  const logged = days.filter((d) => d.logged);
  const onTarget = ct ? days.filter((d) => d.logged && d.calories >= ct * 0.85 && d.calories <= ct * 1.15).length : logged.length;
  const avgProtein = logged.length ? Math.round(logged.reduce((n, d) => n + d.proteinG, 0) / logged.length) : 0;
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) { if (days[i]!.logged) streak++; else break; }
  const max = Math.max(ct ?? 0, ...days.map((d) => d.calories), 1);

  return (
    <Card className="space-y-3">
      {streak > 0 && <div className="flex justify-end"><MetricChip metric="streak" value={`${streak}d streak`} /></div>}
      <div>
        <div className="relative flex h-11 items-end gap-1.5">
          {ct ? <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/25" style={{ bottom: `${(ct / max) * 44}px` }} /> : null}
          {days.map((d, i) => {
            const over = ct ? d.calories > ct * 1.15 : false;
            const today = i === days.length - 1;
            const h = d.logged ? Math.max(4, (d.calories / max) * 44) : 4;
            return (
              <div key={d.date} className="flex flex-1 justify-center">
                <motion.div
                  initial={{ height: 4, opacity: 0 }}
                  animate={{ height: h, opacity: d.logged ? 1 : 0.6 }}
                  transition={{ ...SPRING_SOFT, delay: i * 0.04 }}
                  className={`w-full max-w-6 rounded-md ${!d.logged ? "bg-surface-2" : over ? "bg-danger" : "bg-calories"} ${today ? "ring-2 ring-calories/30" : ""}`}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {days.map((d, i) => (
            <span key={d.date} className={`flex-1 text-center text-caption ${i === days.length - 1 ? "font-bold text-foreground" : "text-muted-foreground"}`}>{DOW[new Date(`${d.date}T00:00:00Z`).getUTCDay()]}</span>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-around border-t border-border/50 pt-3 text-center">
        <div>
          <div className="numeral text-body-lg font-bold leading-none">{onTarget}<span className="text-body font-medium text-muted-foreground">/7</span></div>
          <div className="mt-1 text-caption text-muted-foreground">{ct ? "on target" : "days logged"}</div>
        </div>
        <div className="h-8 w-px bg-border/50" />
        <div>
          <div className="numeral text-body-lg font-bold leading-none text-protein">{avgProtein}<span className="text-body font-medium text-muted-foreground"> g</span></div>
          <div className="mt-1 text-caption text-muted-foreground">avg protein{pt ? ` / ${pt}` : ""}</div>
        </div>
      </div>
    </Card>
  );
}

const EDIT_MEALS = ["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout"];

function EditEntrySheet({ entry, clientId, units, onClose, onSaved }: { entry: Entry; clientId: string; units: UnitPrefs; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState(entry.quantity != null ? String(entry.quantity) : "");
  const [meal, setMeal] = useState(entry.meal_type);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const scalable = entry.quantity != null && entry.quantity > 0;
  const qtyNum = Number(qty);
  const qtyValid = !!qty && Number.isFinite(qtyNum) && qtyNum > 0;
  const factor = scalable && qtyValid ? qtyNum / entry.quantity! : 1;
  const s = (v: number) => Math.round(v * factor);

  // Neither of these is in the Background-Sync queue — it only replays POSTs — so
  // there is no "queued" outcome here: an edit or a delete that doesn't reach the
  // server didn't happen, and the sheet must stay open saying so rather than
  // closing as if it had (the entry would silently snap back on the next reload).
  const save = async () => {
    // A malformed quantity (e.g. "1.2.3" → NaN) must never reach the API.
    if (scalable && qty && !qtyValid) return;
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = { clientId, mealType: meal };
      if (scalable && qtyValid) { body.quantity = qtyNum; body.calories = s(entry.calories); body.proteinG = s(entry.protein_g); body.carbsG = s(entry.carbs_g); body.fatG = s(entry.fat_g); }
      await api.patch(`/api/logs/food/${entry.id}`, body);
      onSaved(); onClose();
    } catch (e) { setErr(errorText(e, "Couldn't save that change — try again.")); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setErr(null);
    try { await api.del(`/api/logs/food/${entry.id}?clientId=${clientId}`); onSaved(); onClose(); }
    catch (e) { setErr(errorText(e, "Couldn't delete that entry — try again.")); }
    finally { setBusy(false); }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={entry.label ?? "Edit food"}
      footer={<div className="flex gap-3">
        <Button variant="ghost" className="text-danger" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 /> Delete</Button>
        <Button size="lg" className="flex-1" disabled={busy || (scalable && !!qty && !qtyValid)} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
      </div>}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <FoodThumb src={entry.image_url} size={48} radius="xl" />
          <div className="grid grid-cols-4 gap-2 flex-1">
            {([["calories", entry.calories], ["protein", entry.protein_g], ["carbs", entry.carbs_g], ["fat", entry.fat_g]] as const).map(([m, v]) => {
              const M = METRICS[m];
              return <div key={m} className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 ${toneSoft[M.tone]}`}><M.icon className="size-3.5" /><span className="numeral text-body font-semibold leading-none">{m === "calories" ? kcalToDisplay(s(v), units).toLocaleString() : s(v)}</span></div>;
            })}
          </div>
        </div>

        {scalable && <Field label={`Quantity (${entry.unit ?? "g"})`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))} />}

        <div>
          <div className="mb-1.5 text-body text-muted-foreground">Meal</div>
          <div className="flex flex-wrap gap-2">{EDIT_MEALS.map((m) => <Chip key={m} selected={meal === m} onClick={() => setMeal(m)}>{metaFor(m).label}</Chip>)}</div>
        </div>

        {err && <p role="alert" className="text-body text-warning">{err}</p>}

      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={entry.label ? `Delete ${entry.label}?` : "Delete this entry?"}
        description="This removes the logged food from your diary."
        confirmLabel="Delete"
        destructive
        onConfirm={() => void remove()}
      />
    </Sheet>
  );
}
