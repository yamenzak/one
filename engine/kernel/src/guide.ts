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
 * ⚠️ SOME STEPS ARE THE WORKSPACE'S AND SOME ARE THE PERSON'S, AND ONE LIST
 * CANNOT BE BOTH. Naming a place is done once for everybody; learning to scan is
 * done by each pair of hands. Ticked only from the workspace, somebody invited
 * on their first morning opens a checklist already complete and is taught
 * nothing. Ticked only per person, whoever arrives second is told to set up a
 * workspace that has been running for a year. `who` is which of the two a step
 * is, and `workspace` is the default so a book that never thinks about it keeps
 * the meaning it had.
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
  /**
   * ⚠️ WHOSE STEP IT IS. `workspace` (the default) is done once, by anybody, for
   * everybody — naming a place, importing the catalogue. `person` is done by
   * each pair of hands and ticks only for the one that did it.
   *
   * ⚠️ AND THE DEFAULT IS NOT A SHRUG. Most of a getting-started list is setup,
   * setup happens once, and a book written before this axis existed meant
   * exactly that — so the absent value has to keep meaning it.
   */
  readonly who?: "workspace" | "person";
  readonly order: number;
}

export type GuideBook = Readonly<Record<string, StepDef>>;

export interface Progress {
  readonly done: readonly string[];
  readonly total: number;
}

/**
 * WHAT HAS BEEN RAISED, ON BOTH AXES.
 *
 * ⚠️ TWO LISTS RATHER THAN ONE UNION, BECAUSE A UNION TICKS THE WRONG BOX. Merge
 * them and a person invited today opens a checklist where "record your first
 * count" is already crossed off — by their employer, last year. The step is
 * looked up on the axis it declares, so each list only ever answers for itself.
 */
export interface Raised {
  /** What anybody in this workspace has ever done. */
  readonly workspace: readonly string[];
  /** What THIS person has done. Empty for a caller who is not one. */
  readonly person: readonly string[];
}

const ticked = (step: StepDef, raised: Raised): boolean =>
  (step.who === "person" ? raised.person : raised.workspace).includes(step.done);

/**
 * ⚠️ WHAT IS LEFT, FOR THIS PERSON. Steps they could not do are not counted
 * against them — a checklist that is permanently 3/5 because two items need a
 * permission they do not hold is a checklist they learn to ignore.
 */
export function remaining(
  book: GuideBook,
  raised: Raised,
  held: ReadonlySet<string>,
): readonly StepDef[] {
  return Object.values(book)
    .filter((s) => !s.needs || held.has(s.needs))
    .filter((s) => !ticked(s, raised))
    .sort((a, b) => a.order - b.order);
}

export function progressOf(
  book: GuideBook,
  raised: Raised,
  held: ReadonlySet<string>,
): Progress {
  const mine = Object.values(book).filter((s) => !s.needs || held.has(s.needs));
  return { done: mine.filter((s) => ticked(s, raised)).map((s) => s.id), total: mine.length };
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
  | "step_needs_undeclared" | "help_without_a_screen"
  | "step_only_a_clock_raises" | "milestone_only_a_clock_raises";

export interface GuideProblem { readonly of: string; readonly why: GuideRefusal; readonly detail: string }

/**
 * ⚠️ `counted` IS THE SMALLER LIST, AND THE DIFFERENCE IS THE POINT. Everything
 * an app raises is `emitted`; what a WORKSPACE'S TALLY records is what its
 * people did, which excludes the clock. A checklist ticked by a nightly sweep
 * would credit somebody with a step they never took, and a step on such an
 * event would sit unticked for ever while composition said it was fine.
 */
export function refuseGuide(
  guide: GuideBook,
  milestones: MilestoneBook,
  help: HelpBook,
  emitted: readonly string[],
  routes: readonly string[],
  permissions: readonly string[],
  screens: readonly string[],
  counted: readonly string[] = emitted,
): readonly GuideProblem[] {
  const out: GuideProblem[] = [];
  const at = (of: string, why: GuideRefusal, detail: string) => out.push({ of, why, detail });

  for (const s of Object.values(guide)) {
    if (!emitted.includes(s.done)) {
      at(s.id, "step_nothing_raises", `completed by "${s.done}", which nothing raises — it can never be ticked`);
    } else if (!counted.includes(s.done)) {
      at(s.id, "step_only_a_clock_raises",
        `completed by "${s.done}", which only a job raises — nobody can do it, so it never ticks`);
    }
    if (!routes.includes(s.link)) at(s.id, "dead_step_link", `sends them to ${s.link}, which is not a screen`);
    if (s.needs && !permissions.includes(s.needs)) {
      at(s.id, "step_needs_undeclared", `shown to holders of "${s.needs}", which nothing declares`);
    }
  }
  for (const m of Object.values(milestones)) {
    if (!emitted.includes(m.on)) {
      at(m.id, "milestone_nothing_raises", `waits for "${m.on}", which nothing raises`);
    } else if (!counted.includes(m.on)) {
      at(m.id, "milestone_only_a_clock_raises",
        `waits for "${m.on}", which only a job raises — it is never counted, so it never arrives`);
    }
  }
  for (const id of orphanHelp(help, screens)) {
    at(id, "help_without_a_screen", "explains a screen that does not exist");
  }
  return out;
}
