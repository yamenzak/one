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

/* ------------------------------------------------------------ a moment --- */

/**
 * A MOMENT — punctuation, and the only thing that interrupts the choreographer.
 *
 * ⚠️ IT IS STILL ONE CLOCK. A moment is a scene with one `overlay` role and a
 * HOLD, not a second animation system — so it cannot drift from everything else,
 * and the reduced-motion pass covers it for free.
 *
 * ⚠️ THE VOCABULARY IS THE KERNEL'S (`MomentId`), and this file is the timing.
 * They are two halves of one decision in two packages that do not import one
 * another, so `ui/test/motion.test.ts` pins them to each other — a hold for a
 * moment nobody can declare is dead, and a moment with no hold plays for zero
 * milliseconds, which is invisible rather than wrong.
 */
export const MOMENT_HOLD: Record<"acknowledge" | "welcome" | "farewell" | "celebrate", number> = {
  /* Barely there. It confirms; it does not perform. */
  acknowledge: 900,
  welcome: 1800,
  farewell: 1400,
  /* The longest, and the only one anybody should remember seeing. */
  celebrate: 2400,
};

export interface Moment {
  readonly steps: readonly Step[];
  /** How long it stays before leaving, in milliseconds. */
  readonly hold: number;
  /** ⚠️ Null unless the surface is audible AND a person just did something. */
  readonly sound: string | null;
}

export interface MomentOptions {
  readonly reduced?: boolean;
  /** Whether this surface declared itself audible — `SoundSpec.surfaces`. */
  readonly audible?: boolean;
  /**
   * ⚠️ WHETHER A PERSON JUST DID SOMETHING. Every browser refuses to play audio
   * that no gesture asked for, so a design that ignores this produces silence in
   * production and a chime in every demo. It is also simply correct: a sound
   * nobody's action caused is a sound arriving out of nowhere.
   */
  readonly gesture?: boolean;
}

export function moment(id: keyof typeof MOMENT_HOLD, sound: string, options: MomentOptions = {}): Moment {
  return {
    steps: scene(["overlay"], { reduced: options.reduced }),
    /*
      ⚠️ THE HOLD IS NOT SHORTENED BY REDUCED MOTION. Reduced motion is about
      movement, not about reading speed — cutting the time somebody has to read
      the words is the one adaptation that makes the setting worse for the people
      who turn it on.
    */
    hold: MOMENT_HOLD[id],
    sound: options.audible && options.gesture ? sound : null,
  };
}

/**
 * Which of two moments is on screen.
 *
 * ⚠️ ONE AT A TIME, AND A SECOND REPLACES RATHER THAN QUEUES. A queue is how a
 * batch of writes produces four celebrations in a row, each meaning less than
 * the last, long after the thing that caused them.
 */
export const supersede = <T>(current: T | null, next: T | null): T | null => next ?? current;

/* ═══════════════════════════════════════════════════════ the css clock ═══ */

/**
 * THE CLOCK, AS TOKENS — and it lives here for the same reason `scene` does.
 *
 * ⚠️ A SHEET THAT SPELLS A DURATION IS THE JUNGLE WITH EXTRA STEPS. `styles.ts`
 * held these for one increment and it was already a second copy of a clock this
 * file defines — a rule somewhere would have been re-tuned and the two would
 * have parted without anything failing. The choreographer emits every timing the
 * product has, in both forms: `scene` for anything React animates, and this for
 * anything CSS does.
 *
 * ⚠️ AND THE TWO SETS BELOW ARE NOT DUPLICATES OF EACH OTHER. `SCORE` is what a
 * ROLE does on entrance; this is what an INTERACTION costs. They are kept
 * adjacent so the relationship is visible rather than inferred.
 */
export const CLOCK = `
:root {
  /* ⚠️ Leaving is always faster than arriving. Nobody waits to watch something go. */
  --t-tap: 120ms;
  --t-move: 220ms;
  --t-enter: 320ms;
  --t-exit: 170ms;
  --e-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --e-in: cubic-bezier(0.4, 0, 1, 1);
  /* ⚠️ A real overshoot in pure CSS. It is the one place easing is not enough:
     the overshoot is what makes a press feel physical rather than merely fast. */
  --e-spring: linear(0, 0.402 7.4%, 0.711 15.3%, 0.929 23.4%, 1.008 28.5%, 1.057 34.6%, 1.062 41.6%, 1.031 55.9%, 0.995 79.5%, 1);
  --stagger: 40ms;
}
`.trim();

/**
 * THE CHOREOGRAPHY — every animation and transition the sheet applies.
 *
 * ⚠️ THE SKY'S WEATHER IS HERE TOO, AND IT IS DELIBERATELY OFF THE INTERACTION
 * CLOCK. Drift is 52 seconds because under about 30 it reads as an animation
 * somebody added and past about 45 it reads as light changing in a room. It is
 * the one timing in the product that is not a response to anything a person did,
 * which is exactly why it needed a token of its own rather than a number in a
 * stylesheet somewhere.
 */
export const WEATHER = { drift: 52, breathe: { dots: 26, waves: 32, rings: 38 } } as const;

export const CHOREOGRAPHY = `
/* ⚠️ PRESS IS THE ONE UNIVERSAL: everything pressable, the same answer. */
[data-one='button'], [data-one='row'][data-interactive], [data-one='tile'], [data-one='quick-action'], [data-one='app-bar-leading'], [data-one='section-more'] {
  transition: transform var(--t-tap) var(--e-spring), background-color var(--t-move) var(--e-out);
}
[data-one='button']:active, [data-one='row'][data-interactive]:active, [data-one='tile']:active, [data-one='quick-action']:active, [data-one='app-bar-leading']:active { transform: scale(0.97); }
[data-one='segment'] { transition: opacity var(--t-move) var(--e-out); }
/* ⚠️ ONE INDICATOR THAT TRAVELS, rather than two pills cross-fading — which
   reads as two things happening instead of one thing moving. */
[data-one='segmented']::before { transition: transform var(--t-move) var(--e-spring); }

/* ── AN ICON PLAYS ON INTERACTION, AND ONLY ON INTERACTION.
   ⚠️ NOT ON HOVER. The whole animated-icon genre is built on hover, which is a
   capability half the devices this ships to do not have — so the animation is
   invisible on a phone and the guard in one lint fails anything reachable that
   way. Press and keyboard focus are what everybody has.
   ⚠️ AND THE VOCABULARY IS CLOSED, like every other list here. Four motions,
   assigned by what the icon MEANS: something that travels, something that rings,
   something that appears, something that turns. Per-icon timelines would be
   twenty-two decisions nobody could keep in step. */
@keyframes icon-nudge { 50% { transform: translate(2px, -2px); } }
@keyframes icon-swing { 25% { transform: rotate(-11deg); } 60% { transform: rotate(7deg); } }
@keyframes icon-pop { 45% { transform: scale(1.22); } }
@keyframes icon-turn { to { transform: rotate(360deg); } }
[data-one='icon'] { transform-origin: 50% 50%; }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='send'],
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='back'],
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='chevron'] {
  animation: icon-nudge var(--t-move) var(--e-out);
}
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='bell'],
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='key'],
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='dumbbell'] {
  animation: icon-swing var(--t-enter) var(--e-spring);
}
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='plus'],
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='camera'],
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='box'],
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='dots'] {
  animation: icon-pop var(--t-move) var(--e-spring);
}
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='search'],
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='clock'],
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='close'] {
  animation: icon-turn var(--t-enter) var(--e-out);
}

/* ⚠️ ARRIVING IS STAGGERED; LEAVING IS NOT — and the count is nth-CHILD on the
   body, not nth-of-type on the card. A section may be a wrapper around a card,
   so counting by TYPE lands the delays on the wrong elements and the stagger
   silently does nothing. It renders as "the animation is too subtle", which is
   the wrong diagnosis and leads to making the distance bigger. */
@keyframes one-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes one-lift { from { opacity: 0; transform: translateY(-8px) scale(1.02); } to { opacity: 1; transform: none; } }
[data-one='body'] > * { animation: one-rise var(--t-enter) var(--e-out) both; }
[data-one='body'] > *:nth-child(1) { animation-delay: calc(var(--stagger) * 1); }
[data-one='body'] > *:nth-child(2) { animation-delay: calc(var(--stagger) * 2); }
[data-one='body'] > *:nth-child(3) { animation-delay: calc(var(--stagger) * 3); }
[data-one='body'] > *:nth-child(4) { animation-delay: calc(var(--stagger) * 4); }
/* ⚠️ Capped at five: past that a stagger stops reading as choreography and
   starts reading as the list being slow to arrive. */
[data-one='body'] > *:nth-child(n+5) { animation-delay: calc(var(--stagger) * 5); }
/* ⚠️ THE HERO LEADS. It is what the screen is about, so it arrives first and
   from further away — the only element allowed a longer distance. */
[data-one='hero'] { animation: one-lift var(--t-enter) var(--e-out) both; }

/* ⚠️ THE WEATHER. Transform, never background-position: one is composited on the
   GPU and one repaints the whole layer every frame — at 52s nobody sees the
   difference in motion and every device sees it in battery. */
@keyframes sky-drift {
  from { transform: translate3d(-2.5%, -1.5%, 0) scale(1.06); }
  to { transform: translate3d(2.5%, 1.5%, 0) scale(1.13); }
}
/* ⚠️ THE PATTERN BREATHES; IT DOES NOT TRAVEL. A moving pattern is a texture
   somebody is dragging past the screen. Scaling the mask a few percent reads as
   the light moving over a surface that is standing still. */
@keyframes sky-breathe {
  0%, 100% { -webkit-mask-size: 9px 9px; mask-size: 9px 9px; }
  50% { -webkit-mask-size: 9.7px 9.7px; mask-size: 9.7px 9.7px; }
}
[data-one='sky']::before { animation: sky-drift ${WEATHER.drift}s var(--e-out) infinite alternate; will-change: transform; }
[data-one='sky'][data-sky='dots']::before { animation: sky-drift ${WEATHER.drift}s var(--e-out) infinite alternate, sky-breathe ${WEATHER.breathe.dots}s ease-in-out infinite; }
[data-one='sky'][data-sky='waves']::before { animation: sky-drift ${WEATHER.drift}s var(--e-out) infinite alternate, sky-breathe ${WEATHER.breathe.waves}s ease-in-out infinite; }
[data-one='sky'][data-sky='rings']::before { animation: sky-drift ${WEATHER.drift}s var(--e-out) infinite alternate, sky-breathe ${WEATHER.breathe.rings}s ease-in-out infinite; }

/* ⚠️ REMOVED, NOT REDUCED. Layout may never depend on an animation having run,
   and information survives: the fade stays, the travel goes. */
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`.trim();
