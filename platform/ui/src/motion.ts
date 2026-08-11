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
 *
 * ⚠️ THERE ARE FIVE DURATIONS, NOT FOUR, AND THE FIFTH WAS EARNED. A SCREEN
 * COMPOSING ITSELF IS A DIFFERENT EVENT FROM AN OBJECT ARRIVING ON A COMPOSED
 * ONE, and one number for both is a choice between a cheap page and a slow
 * sheet. The first version used `--t-enter` for both at 320ms with a 10px rise:
 * filmed, every frame was identical — the entrance had finished before the eye
 * could find it, so it did not read as fast, it read as nothing having happened.
 *
 * ⚠️ WEIGHT IS DISTANCE × VISIBLE DURATION, AND "VISIBLE" IS THE WORD THAT WAS
 * MISSING. All three of distance, duration and curve were wrong, but only the
 * curve was wrong in a way that hides the other two: under an expo ease, raising
 * the duration adds time in which nothing appears to move. See `--e-out`.
 */
export const CLOCK = `
:root {
  /* ⚠️ Leaving is always faster than arriving. Nobody waits to watch something go. */
  --t-tap: 140ms;
  --t-move: 260ms;
  --t-enter: 420ms;
  /* ⚠️ A SCREEN COMPOSING ITSELF IS NOT AN OBJECT ARRIVING ON ONE. See the note
     above: one number for both makes the page cheap or the sheet slow. */
  --t-entrance: 600ms;
  --t-exit: 220ms;
  /* ⚠️ A TAIL BELOW THE PERCEPTUAL THRESHOLD IS LATENCY, NOT WEIGHT — and this
     is measured rather than felt. An expo-out curve (0.16, 1, 0.3, 1) is at 95%
     of its distance after 43% of its time, so a 600ms entrance visibly STOPS at
     260ms and the remaining 340ms is a number in a stylesheet. Doubling the
     duration under that curve changes nothing anybody can see, which is exactly
     the trap: the fix looks applied and the screen still feels cheap.
     This one reaches 95% at 64%, so most of the duration is motion somebody can
     watch. Measured at 10/25/40/50/60/75% of the window: 27, 58, 78, 87, 93, 98. */
  --e-out: cubic-bezier(0.33, 1, 0.68, 1);
  --e-in: cubic-bezier(0.4, 0, 1, 1);
  /* ⚠️ A real overshoot in pure CSS. It is the one place easing is not enough:
     the overshoot is what makes a press feel physical rather than merely fast. */
  --e-spring: linear(0, 0.402 7.4%, 0.711 15.3%, 0.929 23.4%, 1.008 28.5%, 1.057 34.6%, 1.062 41.6%, 1.031 55.9%, 0.995 79.5%, 1);
  /* ⚠️ Wide enough to READ as choreography. Under about 60ms a stagger is a
     rendering artefact — the eye registers a smear rather than an order. */
  --stagger: 85ms;
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
export const WEATHER = {
  drift: 52,
  /* ⚠️ EVERY MASKED SKY BREATHES, AND NO TWO ON THE SAME PERIOD. Sharing one
     would make two patterns visibly the same animation; the periods are also
     mutually prime with the drift so the two motions never lock into a beat. */
  breathe: { dots: 26, grain: 29, waves: 32, grid: 35, rings: 38, beams: 41, halo: 47 },
  /* ⚠️ THE SWELL IS OPACITY, WHICH IS WHY IT MAY RUN BESIDE THE DRIFT. Two
     animations on one element must not both write `transform` — the second wins
     outright and the drift silently stops. */
  swell: 44,
} as const;

export const CHOREOGRAPHY = `
/* ⚠️ PRESS IS THE ONE UNIVERSAL: everything pressable, the same answer. */
[data-one='button'], [data-one='row'][data-interactive], [data-one='tile'], [data-one='quick-action'], [data-one='app-bar-leading'], [data-one='section-more'] {
  /* ⚠️ THE RELEASE SPRINGS; THE PRESS DOES NOT. A control that overshoots on the
     way DOWN feels loose — the finger is still on it, so the overshoot happens
     under the thumb where nothing physical would do that. Springing back on
     release is the half that reads as mass, and it is why the two directions
     carry different curves rather than one shared transition. */
  transition: transform var(--t-move) var(--e-spring), background-color var(--t-move) var(--e-out);
}
[data-one='button']:active, [data-one='row'][data-interactive]:active, [data-one='tile']:active, [data-one='quick-action']:active, [data-one='app-bar-leading']:active {
  transform: scale(0.96);
  transition: transform var(--t-tap) var(--e-in);
}
[data-one='segment'] { transition: opacity var(--t-move) var(--e-out); }
/* ⚠️ ONE INDICATOR THAT TRAVELS, rather than two pills cross-fading — which
   reads as two things happening instead of one thing moving. */
[data-one='segmented']::before { transition: transform var(--t-move) var(--e-spring); }

/* ── AN ICON PLAYS ON INTERACTION, AND ONLY ON INTERACTION.

   ⚠️ NOT ON HOVER. The whole animated-icon genre is built on hover, which is a
   capability half the devices this ships to do not have — so the animation is
   invisible on a phone and the guard in one lint fails anything reachable that
   way. Press and keyboard focus are what everybody has.

   ⚠️ AND THE MOTION IS THE ICON'S OWN, NOT A GENERIC ONE APPLIED TO IT. Four
   shared motions was the first version and it was the cheap answer: a bell that
   scales and a key that scales are two icons doing the same thing, which reads
   as a page effect rather than as either object behaving. A bell RINGS, a check
   DRAWS ITSELF, a search sweeps, a chart's bars grow in turn. The published
   animated-icon libraries do this with React plus a runtime animation engine,
   which is megabytes of dependency in a package that renders on a server. The
   idea is worth taking; the dependency is not.

   ⚠️ THE PARTS ARE ADDRESSED BY POSITION, which is only safe because the
   geometry is GENERATED and re-derived by a test. A hand-edited path would move
   a part out from under its rule and the icon would animate the wrong stroke. */
@keyframes icon-ring { 20% { transform: rotate(-13deg); } 45% { transform: rotate(9deg); } 70% { transform: rotate(-4deg); } }
@keyframes icon-draw { from { stroke-dasharray: 28; stroke-dashoffset: 28; } to { stroke-dasharray: 28; stroke-dashoffset: 0; } }
@keyframes icon-sweep { 35% { transform: translate(1.4px, -1.4px) scale(1.08); } }
@keyframes icon-fly { 40% { transform: translate(3px, -3px); opacity: 0.55; } 41% { transform: translate(-3px, 3px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes icon-pop { 45% { transform: scale(1.25); } }
@keyframes icon-rise { from { transform: scaleY(0.2); } }
@keyframes icon-tick { 30% { transform: rotate(30deg); } }
@keyframes icon-shutter { 40% { transform: scale(0.7); opacity: 0.4; } }
@keyframes icon-nudge { 50% { transform: translateX(3px); } }
@keyframes icon-back { 50% { transform: translateX(-3px); } }
@keyframes icon-turn { to { transform: rotate(90deg); } }
@keyframes icon-lift { 45% { transform: translateY(-2.5px); } }

[data-one='icon'] { transform-origin: 50% 50%; overflow: visible; }
[data-one='icon'] > * { transform-origin: 50% 50%; transform-box: fill-box; }

/* ⚠️ ONE SELECTOR, WRITTEN ONCE. Every rule below scopes to a pressed or focused
   control, so an icon sitting in text never moves and one inside a button always
   does — without either being decided at a call site. */
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='bell'] { animation: icon-ring var(--t-enter) var(--e-spring); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='send'] { animation: icon-fly var(--t-enter) var(--e-out); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='search'] { animation: icon-sweep var(--t-move) var(--e-out); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='plus'] { animation: icon-turn var(--t-move) var(--e-spring); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='close'] { animation: icon-turn var(--t-move) var(--e-out); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='chevron'] { animation: icon-nudge var(--t-move) var(--e-out); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='forward'] { animation: icon-nudge var(--t-move) var(--e-out); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='back'] { animation: icon-back var(--t-move) var(--e-out); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='camera'] { animation: icon-lift var(--t-move) var(--e-out); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='box'] { animation: icon-lift var(--t-move) var(--e-spring); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='key'] { animation: icon-tick var(--t-enter) var(--e-spring); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='lock'] { animation: icon-tick var(--t-move) var(--e-spring); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='dumbbell'] { animation: icon-tick var(--t-enter) var(--e-spring); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='mail'] { animation: icon-lift var(--t-move) var(--e-out); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='clock'] { animation: icon-pop var(--t-move) var(--e-spring); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='shield'] { animation: icon-pop var(--t-move) var(--e-spring); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='apple'] { animation: icon-pop var(--t-move) var(--e-spring); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='image'] { animation: icon-pop var(--t-move) var(--e-spring); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='phone'] { animation: icon-tick var(--t-move) var(--e-spring); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='info'] { animation: icon-pop var(--t-move) var(--e-spring); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='warning'] { animation: icon-ring var(--t-enter) var(--e-spring); }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='danger'] { animation: icon-turn var(--t-move) var(--e-out); }

/* ── AND THE PARTS THAT MOVE ON THEIR OWN. This is the half a shared motion
      cannot express, and the half that makes an icon look like the thing it is. */
/* A check DRAWS ITSELF, which is the one motion everybody recognises. */
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='success'] > :last-child { animation: icon-draw var(--t-enter) var(--e-out); }
/* Three dots arrive in order rather than together. */
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='dots'] > :nth-child(3) { animation: icon-pop var(--t-move) var(--e-spring) 0ms; }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='dots'] > :nth-child(1) { animation: icon-pop var(--t-move) var(--e-spring) 60ms; }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='dots'] > :nth-child(2) { animation: icon-pop var(--t-move) var(--e-spring) 120ms; }
/* A chart's bars grow, shortest first. */
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='chart'] > * { transform-origin: 50% 100%; }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='chart'] > :nth-child(2) { animation: icon-rise var(--t-move) var(--e-out) 0ms; }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='chart'] > :nth-child(3) { animation: icon-rise var(--t-move) var(--e-out) 70ms; }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='chart'] > :nth-child(4) { animation: icon-rise var(--t-move) var(--e-out) 140ms; }
/* A list's rules arrive top to bottom. */
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='list'] > :nth-child(1) { animation: icon-nudge var(--t-move) var(--e-out) 0ms; }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='list'] > :nth-child(2) { animation: icon-nudge var(--t-move) var(--e-out) 60ms; }
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='list'] > :nth-child(3) { animation: icon-nudge var(--t-move) var(--e-out) 120ms; }
/* The second person in the pair steps forward. */
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='users'] > :nth-child(2) { animation: icon-nudge var(--t-move) var(--e-out); }
/* The shutter closes and opens. */
:is(button, [data-interactive]):is(:active, :focus-visible) [data-icon='camera'] > :last-child { animation: icon-shutter var(--t-move) var(--e-out); }

/* ⚠️ AND A DISCLOSURE'S CHEVRON TURNS WITH THE DISCLOSURE. An indicator that
   does not move is an indicator that has to be re-read every time. */
[data-one='disclosure-summary'] [data-one='icon'] { transition: rotate var(--t-move) var(--e-out); }
[data-one='disclosure'][open] > [data-one='disclosure-summary'] [data-one='icon'] { rotate: 90deg; }

/* ⚠️ ARRIVING IS STAGGERED; LEAVING IS NOT — and the count is nth-CHILD on the
   body, not nth-of-type on the card. A section may be a wrapper around a card,
   so counting by TYPE lands the delays on the wrong elements and the stagger
   silently does nothing. It renders as "the animation is too subtle", which is
   the wrong diagnosis and leads to making the distance bigger. */
/* ⚠️ WEIGHT IS DISTANCE × DURATION × DECELERATION, and the first version had too
   little of all three: 10px over 320ms on a shallow curve is finished before the
   eye has found it. It moves further now, over longer, and settles rather than
   stopping — and it does NOT bounce, because a bounce reads as playful, which is
   the opposite of expensive. */
/* ⚠️ THE ONE ANIMATION THAT IS NOT CHOREOGRAPHY. A busy control spins for as
   long as the wait lasts, which is not a duration this file can know — so it
   borrows the longest one it has and repeats it, rather than inventing a number. */
@keyframes one-spin { to { rotate: 360deg; } }
/* ⚠️ AND THE TIMING LIVES HERE LIKE EVERY OTHER TIMING. The busy ring's geometry
   is the sheet's; how fast it turns is not, or the next one somebody adds turns
   at a different speed and both look deliberate. */
[data-one='button'][data-state='busy']::after { animation: one-spin var(--t-entrance) linear infinite; }
@keyframes one-rise { from { opacity: 0; transform: translateY(24px) scale(0.975); } to { opacity: 1; transform: none; } }
@keyframes one-lift { from { opacity: 0; transform: translateY(-16px) scale(1.035); } to { opacity: 1; transform: none; } }
[data-one='body'] > * { animation: one-rise var(--t-entrance) var(--e-out) both; }
[data-one='body'] > *:nth-child(1) { animation-delay: calc(var(--stagger) * 1); }
[data-one='body'] > *:nth-child(2) { animation-delay: calc(var(--stagger) * 2); }
[data-one='body'] > *:nth-child(3) { animation-delay: calc(var(--stagger) * 3); }
[data-one='body'] > *:nth-child(4) { animation-delay: calc(var(--stagger) * 4); }
/* ⚠️ Capped at five: past that a stagger stops reading as choreography and
   starts reading as the list being slow to arrive. */
[data-one='body'] > *:nth-child(n+5) { animation-delay: calc(var(--stagger) * 5); }
/* ⚠️ THE HERO LEADS. It is what the screen is about, so it arrives first and
   from further away — the only element allowed a longer distance. */
/* ⚠️ AND THE HERO IS THE SLOWEST THING ON THE SCREEN. It is what the screen is
   about, so it arrives first, from further, and takes longest to settle — the
   one element allowed more than the shared entrance. */
[data-one='hero'] { animation: one-lift calc(var(--t-entrance) * 1.15) var(--e-out) both; }

/* ⚠️ THE WEATHER. Transform, never background-position: one is composited on the
   GPU and one repaints the whole layer every frame — at 52s nobody sees the
   difference in motion and every device sees it in battery. */
@keyframes sky-drift {
  from { transform: translate3d(-2.5%, -1.5%, 0) scale(1.06); }
  to { transform: translate3d(2.5%, 1.5%, 0) scale(1.13); }
}
/* ⚠️ THE PATTERN BREATHES; IT DOES NOT TRAVEL. A moving pattern is a texture
   somebody is dragging past the screen. Scaling it a few percent reads as the
   light moving over a surface that is standing still.

   ⚠️ ONE KEYFRAME FOR SEVEN GEOMETRIES. It animates the registered factor each
   mask multiplies its own numbers by, so a hairline grid and a light shaft
   breathe by the same PROPORTION rather than by the same number of pixels —
   which is what a shared mask-size keyframe got wrong, and it got it wrong
   invisibly, by tiling a repeating gradient into a box smaller than its period. */
@keyframes sky-breathe { 0%, 100% { --breath: 1; } 50% { --breath: 1.075; } }
/* ⚠️ AND THE SWELL IS THE LIGHT ITSELF RISING AND FALLING, for the two skies
   with no pattern to breathe. Opacity, so it composites beside the drift. */
@keyframes sky-swell { 0%, 100% { opacity: 0.8; } 50% { opacity: 1; } }
[data-one='sky']::before { animation: sky-drift ${WEATHER.drift}s var(--e-out) infinite alternate; will-change: transform; }
${Object.entries(WEATHER.breathe)
  .map(
    ([sky, period]) =>
      `[data-one='sky'][data-sky='${sky}']::before { animation: sky-drift ${WEATHER.drift}s var(--e-out) infinite alternate, sky-breathe ${period}s ease-in-out infinite; }`,
  )
  .join("\n")}
[data-one='sky'][data-sky='mesh']::before { animation: sky-drift ${WEATHER.drift}s var(--e-out) infinite alternate, sky-swell ${WEATHER.swell}s ease-in-out infinite; }

/* ⚠️ REMOVED, NOT REDUCED. Layout may never depend on an animation having run,
   and information survives: the fade stays, the travel goes. */
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`.trim();
