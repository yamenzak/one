/**
 * ONE CHOREOGRAPHER. COMPONENTS DO NOT ANIMATE.
 *
 * ⚠️ THE FAILURE THIS IS DESIGNED AGAINST IS A JUNGLE: forty elements each
 * running their own tasteful 240ms animation, arriving at forty different times.
 * No individual animation is wrong and the screen is chaos. The fix is not taste
 * — it is that timing is not a component's to own.
 *
 * A component declares its ROLE in a scene. The timeline is derived from the
 * role and the document order, here, once.
 */

/** The house curve: fast start, long settle. Not exported — see `Step.ease`. */
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Where a thing sits in an entrance. Chrome is always last; the user came for the content. */
export const ROLES = ["ground", "anchor", "content", "chrome", "overlay"] as const;
export type Role = (typeof ROLES)[number];

export interface Step {
  readonly role: Role;
  readonly delay: number;
  readonly duration: number;
  /**
   * ⚠️ THE CURVE COMES WITH THE STEP, not from a constant a component imports.
   * An exported easing is one somebody uses beside a duration of their own, and
   * that is the jungle rebuilt one reasonable import at a time.
   */
  readonly ease: string;
  /** ⚠️ Enter by settling DOWN. Content arrives fractionally too large and comes to rest. */
  readonly from: { readonly opacity: number; readonly scale?: number; readonly y?: number };
}

const SCORE: Record<Role, { delay: number; duration: number; from: Step["from"] }> = {
  ground: { delay: 0, duration: 240, from: { opacity: 0 } },
  anchor: { delay: 60, duration: 360, from: { opacity: 0, scale: 1.06 } },
  content: { delay: 140, duration: 280, from: { opacity: 0, y: 12 } },
  chrome: { delay: 260, duration: 200, from: { opacity: 0 } },
  overlay: { delay: 0, duration: 300, from: { opacity: 0, y: 24 } },
};

/** How far apart two members of the same role arrive. Shallow: deeper reads as a slow network. */
const STAGGER = 45;
/**
 * ⚠️ MOTION IS A BUDGET, NOT A PROPERTY. Past this many moving groups the
 * stagger collapses to zero rather than animating a hundred rows one after
 * another — so a long list gets SHORTER motion automatically instead of the
 * impression that the page is loading badly.
 */
const BUDGET = 3;

export interface SceneOptions {
  /** `prefers-reduced-motion`. ⚠️ Removes transforms; it does not shorten them. */
  readonly reduced?: boolean;
  /** Leaving is decisive: the same endpoints, traversed the other way, at 60%. */
  readonly direction?: "enter" | "exit";
}

/**
 * The timeline for one surface transition.
 *
 * ⚠️ ONE CLOCK. Everything entering enters on this; two components physically
 * cannot run competing timelines because neither of them holds one.
 *
 * ⚠️ EXIT IS ENTER REVERSED AT 60%, not a second animation to design and get out
 * of step with the first.
 */
export function scene(roles: readonly Role[], options: SceneOptions = {}): readonly Step[] {
  const counts = new Map<Role, number>();
  const overBudget = roles.length > BUDGET;

  return roles.map((role) => {
    const base = SCORE[role];
    const index = counts.get(role) ?? 0;
    counts.set(role, index + 1);
    const stagger = overBudget ? 0 : index * STAGGER;

    if (options.reduced) {
      /*
        ⚠️ REMOVED, NOT REDUCED — and layout may never depend on an animation
        having run. A "reduced" motion that still translates is one that still
        makes a person ill; a layout that needs the transform to finish is one
        that is broken for everybody who turned motion off.
      */
      return { role, delay: 0, duration: 120, ease: EASE, from: { opacity: 0 } };
    }

    const duration = options.direction === "exit" ? Math.round(base.duration * 0.6) : base.duration;
    const delay = options.direction === "exit" ? 0 : base.delay + stagger;
    return { role, delay, duration, ease: EASE, from: base.from };
  });
}

/*
  DEFER(one-007) stage:4 — shared-element continuity: a record that appears in
  two places is ONE element with one identity, not a fade-out and a fade-in.
  Only the shell can do it, because only the shell owns both surfaces — and the
  spring constants belong with it rather than exported ahead of a caller.
*/
