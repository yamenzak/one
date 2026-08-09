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

/* --------------------------------------------------------- continuity --- */

/**
 * ⚠️ CONTINUITY BEATS TRANSITION, and only the shell can provide it.
 *
 * A record that appears in two places — a row in a list, then the heading of the
 * detail beside it — is ONE element with one identity, not a fade-out and a
 * fade-in. Crossfading two copies of the same thing is what makes an interface
 * feel like a slideshow of screens rather than one place you are moving around.
 *
 * The renderer can do this because it owns both surfaces and the record has an
 * id. An app cannot, which is most of why this lives here.
 */
export interface Continuity {
  /** ⚠️ The RECORD's identity, not the element's. Two views, one subject. */
  readonly of: string;
  readonly from: string;
  readonly to: string;
}

export type Continuous = { readonly shared: true; readonly key: string } | { readonly shared: false };

/**
 * Whether two surfaces are showing the same subject, and therefore whether the
 * move between them is one element travelling or two elements swapping.
 *
 * ⚠️ SAME SUBJECT, DIFFERENT SURFACE. Same surface is not a transition at all,
 * and a different subject is a genuine replacement — animating that as
 * continuity would claim a relationship between two unrelated records, which
 * reads as the interface having lost track of what it was showing.
 */
export function continuity(before: Continuity | null, after: Continuity | null): Continuous {
  if (!before || !after) return { shared: false };
  if (before.of !== after.of) return { shared: false };
  if (before.to === after.to) return { shared: false };
  return { shared: true, key: `one:${after.of}` };
}

/**
 * ⚠️ CRITICALLY DAMPED, WITH NO VISIBLE OVERSHOOT. Bounce reads as toy rather
 * than premium, and it is the fastest way to make an interface feel cheap. Not
 * exported: a shared element is moved by the shell, and nothing else has one.
 */
const SPRING = { stiffness: 380, damping: 34, mass: 0.9 } as const;

/** ⚠️ Never negative and never under-damped: `2 * sqrt(k * m)` is the boundary. */
export const overshoots = (): boolean => SPRING.damping < 2 * Math.sqrt(SPRING.stiffness * SPRING.mass) * 0.05;
