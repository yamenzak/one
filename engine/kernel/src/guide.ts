/**
 * GETTING STARTED, GETTING HELP, AND BEING TOLD YOU GOT SOMEWHERE.
 *
 * ⚠️ A CHECKLIST IS DERIVED FROM WHAT HAPPENED, NEVER TICKED BY A SCREEN. A step
 * a screen marks done is a step that stays undone when somebody does the same
 * thing from the API, from an import, or from the second screen that also does
 * it — and the person is then told to finish something they finished last week.
 * Every step names an event, and the event is what completes it.
 *
 * ⚠️ AND A STEP NOTHING CAN RAISE IS STUCK FOR EVER. It renders, it is never
 * ticked, and the onboarding it belongs to never reaches the end — so the whole
 * checklist reads as broken because of one line nobody can satisfy.
 *
 * Layer 2. Imports primitives.
 */

import type { Tone } from "./primitives.js";

/* ------------------------------------------------------------------- help --- */

export interface HelpDef {
  readonly id: string;
  readonly title: string;
  /** The screen it explains. It is how help finds its way to the right page. */
  readonly screen: string;
  readonly body: string;
  /** Search terms a person would actually type, in their words rather than ours. */
  readonly terms?: readonly string[];
}

export type HelpBook = Readonly<Record<string, HelpDef>>;

/** ⚠️ Help for a screen that does not exist is a page nothing ever opens. */
export const orphanHelp = (book: HelpBook, screens: readonly string[]): readonly string[] =>
  Object.values(book).filter((h) => !screens.includes(h.screen)).map((h) => h.id);

/* ------------------------------------------------------------------ guide --- */

export interface StepDef {
  readonly id: string;
  readonly label: string;
  /** One line saying what doing it gets them. Not what it is called. */
  readonly why: string;
  /** ⚠️ The event that completes it. See the header. */
  readonly done: string;
  /** Where to go to do it. A declared screen's route. */
  readonly link: string;
  /** ⚠️ Only shown to somebody who could actually do it. */
  readonly needs?: string;
  readonly order: number;
}

export type GuideBook = Readonly<Record<string, StepDef>>;

export interface Progress {
  readonly done: readonly string[];
  readonly total: number;
}

/**
 * ⚠️ WHAT IS LEFT, FOR THIS PERSON. Steps they could not do are not counted
 * against them — a checklist that is permanently 3/5 because two items need a
 * permission they do not hold is a checklist they learn to ignore.
 */
export function remaining(
  book: GuideBook,
  events: readonly string[],
  held: ReadonlySet<string>,
): readonly StepDef[] {
  return Object.values(book)
    .filter((s) => !s.needs || held.has(s.needs))
    .filter((s) => !events.includes(s.done))
    .sort((a, b) => a.order - b.order);
}

export function progressOf(
  book: GuideBook,
  events: readonly string[],
  held: ReadonlySet<string>,
): Progress {
  const mine = Object.values(book).filter((s) => !s.needs || held.has(s.needs));
  return { done: mine.filter((s) => events.includes(s.done)).map((s) => s.id), total: mine.length };
}

/* ------------------------------------------------------------- milestones --- */

/**
 * ⚠️ RECOGNITION IS OF SOMETHING THAT HAPPENED, AND IT IS SAID ONCE. A
 * congratulation repeated on every load is not recognition, it is noise — so the
 * event is the trigger and the record of having said it is what stops it.
 */
export interface MilestoneDef {
  readonly id: string;
  readonly label: string;
  readonly said: string;
  readonly on: string;
  /** How many of the event it takes. One, unless it is a count worth marking. */
  readonly after?: number;
  readonly tone: Tone;
  readonly icon: string;
}

export type MilestoneBook = Readonly<Record<string, MilestoneDef>>;

export const reached = (
  book: MilestoneBook,
  counts: Readonly<Record<string, number>>,
  already: readonly string[],
): readonly MilestoneDef[] =>
  Object.values(book)
    .filter((m) => !already.includes(m.id) && (counts[m.on] ?? 0) >= (m.after ?? 1));

/* ------------------------------------------------------------------ rules --- */

export type GuideRefusal =
  | "step_nothing_raises" | "milestone_nothing_raises" | "dead_step_link"
  | "step_needs_undeclared" | "help_without_a_screen";

export interface GuideProblem { readonly of: string; readonly why: GuideRefusal; readonly detail: string }

export function refuseGuide(
  guide: GuideBook,
  milestones: MilestoneBook,
  help: HelpBook,
  emitted: readonly string[],
  routes: readonly string[],
  permissions: readonly string[],
  screens: readonly string[],
): readonly GuideProblem[] {
  const out: GuideProblem[] = [];
  const at = (of: string, why: GuideRefusal, detail: string) => out.push({ of, why, detail });

  for (const s of Object.values(guide)) {
    if (!emitted.includes(s.done)) {
      at(s.id, "step_nothing_raises", `completed by "${s.done}", which nothing raises — it can never be ticked`);
    }
    if (!routes.includes(s.link)) at(s.id, "dead_step_link", `sends them to ${s.link}, which is not a screen`);
    if (s.needs && !permissions.includes(s.needs)) {
      at(s.id, "step_needs_undeclared", `shown to holders of "${s.needs}", which nothing declares`);
    }
  }
  for (const m of Object.values(milestones)) {
    if (!emitted.includes(m.on)) {
      at(m.id, "milestone_nothing_raises", `waits for "${m.on}", which nothing raises`);
    }
  }
  for (const id of orphanHelp(help, screens)) {
    at(id, "help_without_a_screen", "explains a screen that does not exist");
  }
  return out;
}
