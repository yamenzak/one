/**
 * MOTION, AND EVERY CURVE IN IT IS THE LIBRARY'S (D7).
 *
 * ⚠️ NOT ONE `cubic-bezier` IS WRITTEN HERE. HeroUI ships six easings and a
 * default duration, and every component it draws already moves on them — so a
 * screen that hand-rolls a curve is a screen whose motion is subtly out of step
 * with every control on it. That is the same failure as a hand-picked colour,
 * and it is harder to see: nobody can name what is wrong, the page just feels
 * cheap.
 *
 * ⚠️ AND THE LIBRARY ALREADY HANDLES REDUCED MOTION, IN BOTH DIRECTIONS —
 * `prefers-reduced-motion` and a `data-reduce-motion="true"` ancestor. Writing
 * our own `@keyframes` outside that machinery produces motion that keeps moving
 * for somebody who asked it to stop, which for some people is not a preference
 * but a symptom. Everything below is expressed as tokens the library's own rules
 * already cover, and `REDUCED` is the escape hatch for a page that wants to
 * switch its own ambience off explicitly.
 *
 * ⚠️ WHAT THIS IS NOT: an animation library. There are no springs, no
 * orchestration and no timeline. A product that needs those has a specific
 * reason and can reach for one; what every product needs is that a drawer, a
 * toast and a page all decelerate the same way.
 */
import * as React from "react";

/**
 * The six curves HeroUI defines, by what they are FOR rather than by their
 * shape. A screen naming `--ease-out-quart` directly has to be revisited the day
 * the library renames one, and there are a lot of screens.
 */
export const EASE = {
  /** Anything arriving. The library's own default for entering content. */
  enter: "var(--ease-out-quart)",
  /** Anything leaving. Faster off the screen than onto it — see `DURATION`. */
  exit: "var(--ease-out-quad)",
  /** A control settling under a finger: press, hover, focus. */
  settle: "var(--ease-out)",
  /** Something large moving a long way — a drawer, a sheet, a page. */
  travel: "var(--ease-out-fluid)",
  /** A value changing in place, where a curve would read as a glitch. */
  steady: "var(--ease-linear)",
  /** The library's unopinionated default, for when none of the above is it. */
  plain: "var(--ease-smooth)",
} as const;

export type Ease = keyof typeof EASE;

/**
 * ⚠️ FOUR DURATIONS, AND THE SHORTEST IS THE LIBRARY'S OWN DEFAULT. A scale with
 * twelve entries is a scale nobody stays on. `instant` is what every HeroUI
 * control already uses, so a control we animate ourselves matches the ones
 * beside it.
 *
 * ⚠️ EXIT IS SHORTER THAN ENTER, ALWAYS. Somebody dismissing a thing has already
 * decided; making them watch it leave at the speed it arrived is the single most
 * common way an interface comes to feel slow.
 */
export const DURATION = {
  instant: "var(--default-transition-duration)",
  quick: "180ms",
  moderate: "260ms",
  /**
   * ⚠️ A FIFTH, FOR THE ONE MOMENT A PERSON SEES ONCE. Everything else here is
   * paced for something done repeatedly, where anything slower than a fifth of
   * a second is a tax paid on every repetition. A door is entered before
   * anybody is signed in, at most a few times ever, with nothing else on the
   * screen competing for the eye — the only place in the product where a longer
   * curve is an impression rather than a delay.
   */
  stately: "560ms",
  /**
   * ⚠️ A FIFTH ENTRY, AND A PAGE IS WHAT IT IS FOR. This scale was four for a
   * long time and a page change borrowed `moderate` — 260ms, which is the pace
   * of a control settling under a finger. Reported as "the transitions are
   * there, just too fast", and correctly: the largest thing on the screen
   * moving at the speed of a chip reads as a flicker rather than as travel.
   * `stately` is the other direction — half a second is right for a door
   * somebody sees once and a tax on something done all day.
   */
  page: "440ms",
  /**
   * ⚠️ ONE TURN OF SOMETHING THAT TURNS UNTIL IT STOPS, WHICH IS A DIFFERENT
   * KIND OF NUMBER FROM EVERY ONE ABOVE. The rest of this scale describes a
   * movement with an END somebody is waiting for; a spinner's period describes a
   * TEMPO somebody watches for as long as the wait lasts, and the two want
   * opposite things. Fast reads as urgent, which on a five-second boot is the
   * product looking anxious about itself; slow enough to follow with the eye
   * reads as composure. Measured against the usual 1s: at 2.2s a single arc
   * travels about a fifth of the ring per second, which is the pace of something
   * turning rather than something spinning.
   */
  turn: "2200ms",
  ambient: "24s",
  /**
   * ⚠️ AND ONE THAT IS NOT PACED FOR ANYBODY — it is paced so that NOBODY
   * catches it. Every duration above is the length of a thing somebody is
   * waiting on or watching; this is the length of a thing nobody is meant to see
   * happen. A scene's source turns a degree and a half over it, `alternate`, so
   * a screen looked at twice a minute apart is subtly different and a screen
   * watched is still. Under about a minute it becomes a movement, and a ground
   * that draws the eye is a ground that has failed.
   */
  breath: "90s",
} as const;

export type Duration = keyof typeof DURATION;

/**
 * WHEN A SECOND THING IN ONE MOVEMENT STARTS.
 *
 * ⚠️ TWO NUMBERS, AND THEY ARE NOT DURATIONS. A delay is how far behind the
 * leading edge something follows, and the vocabulary above has nothing that
 * means that — so the first version of the nav's travel wrote `60ms` and `90ms`
 * at the call sites, which is exactly the private number `metrics` and `motion`
 * exist to refuse. It was refused.
 *
 * ⚠️ AND THEY ARE SHORT BY DESIGN. Past about a tenth of a second a follower
 * stops reading as part of the same movement and becomes a second event — which
 * is the difference between a word emerging from a mark and a word appearing
 * after one.
 */
export const DELAY = {
  /** Just behind the leading edge — a follower, still one movement. */
  behind: "60ms",
  /** After the room is made: a word waiting for the space to open. */
  after: "90ms",
} as const;

/** One transition, as a CSS value. */
export const transition = (
  properties: string, duration: Duration = "quick", ease: Ease = "settle",
): string => `${properties} ${DURATION[duration]} ${EASE[ease]}`;

/**
 * ⚠️ THE ONE PLACE MOTION IS SWITCHED OFF, and it is an attribute rather than a
 * class so it cascades to everything inside — including HeroUI's own components,
 * which read exactly this. A page that turned motion off with a class would turn
 * off its own and leave the library's running.
 */
export const REDUCED = { "data-reduce-motion": "true" } as const;

/**
 * HOW A MARK IN A SCENE BREATHES — period, offset, and how far it dips.
 *
 * ⚠️ HERE RATHER THAN WHERE THEY ARE USED, BECAUSE THE RULE IS THAT NO FILE
 * WRITES ITS OWN DURATION, AND A GENERATED PICTURE IS NOT AN EXCEPTION. A
 * scene's field carries its own `<style>` element (`render`), which is what lets
 * its motion travel with the image and switch itself off — but the numbers in it
 * are still durations, and a duration invented in the file that happened to need
 * it is exactly what `MOTION` exists to prevent.
 *
 * ⚠️ NO TWO PERIODS DIVIDE INTO EACH OTHER. A field on one shared period pulses
 * in unison, which reads as a fault rather than as a sky and is unmistakable
 * once seen. The delays offset them again, so the brightest mark is never in
 * phase with the one beside it.
 *
 * ⚠️ AND THEY ARE LONG. Every other value here is under a second because it
 * describes a control settling; a scene is the one thing in the product meant to
 * be noticed only if you look at it for a while.
 *
 * ⚠️ `dip` IS WHY THIS IS A TABLE RATHER THAN THREE PERIODS. A star is a point:
 * it can go most of the way out and back and still read as a star twinkling. A
 * bloom is a fifth of the screen, and the same dip on one of those is the page
 * throbbing. How deep a beat goes is a property of the beat, not a constant the
 * renderer gets to assume — and it was a constant, which is why the first aura
 * pulsed like a warning light.
 */
/**
 * ⚠️ A BEAT IS A FADE **OR** A TURN, AND THE TURN IS WHAT A LATTICE HAS. A field
 * of interlocking arcs has no brightness to give — what it has is ORIENTATION,
 * and rotating ONE TILE by a quarter re-routes every curve running through it:
 * the lines that met now miss and two others join, so the field re-draws itself
 * without a single mark appearing or disappearing.
 *
 * ⚠️ ONE TILE, NEVER THE FIELD. Turning a whole layer is a picture rotating, and
 * fading a whole layer is the page throbbing — both were tried and both were
 * reported as the ambience flickering. A beat belongs to a MARK, which is why it
 * is SMIL (`render`).
 */
/**
 * ⚠️ HOLD, TURN, HOLD — never a continuous spin, and this is the rhythm the
 * lattice beats got back. A tile turning steadily is a spinning graphic and the
 * eye locks onto it; a tile that sits still for four fifths of its cycle and
 * turns in the remaining fifth is a pattern that was different when you looked
 * back. It is expressed as SMIL values because SMIL is the only thing that
 * repaints inside a `<pattern>` (`render`).
 */
export const TURN = "0;0;90;90;180;180;270;270;360;360";
export const TURN_AT = "0;0.17;0.23;0.42;0.48;0.67;0.73;0.92;0.98;1";

/** ⚠️ The library's own ease, as a spline — SMIL cannot name a CSS easing. */
export const EASE_SPLINE = "0.4 0 0.2 1 ";

export const BEAT = {
  /* A sky's three: small, sharp marks, so they may go most of the way out. */
  medium: { period: "5.2s", delay: "2s", dip: 0.3 },
  large: { period: "3.7s", delay: "2.7s", dip: 0.3 },
  glint: { period: "2.8s", delay: "1.4s", dip: 0.3 },
  /* An aura's two: enormous and soft, so they barely move and take an age. */
  swell: { period: "13s", delay: "0s", dip: 0.62 },
  breathe: { period: "19s", delay: "6.5s", dip: 0.78 },
  /* A lattice's two. Minutes, not seconds, and hardly a dip — see above. */
  quarter: { period: "47s", delay: "0s", turn: true },
  half: { period: "71s", delay: "17s", turn: true },
} as const;

/** ⚠️ Every beat is one or the other, and `render` asks which. */
export const turns = (beat: keyof typeof BEAT): boolean => "turn" in BEAT[beat];

/**
 * WHETHER MOTION IS SWITCHED OFF FOR THIS ELEMENT.
 *
 * ⚠️ FOR THE MOTION CSS CANNOT REACH, AND ONLY FOR THAT. Almost everything here
 * animates through the two rules above, which answer both opt-outs for free. Two
 * things cannot: a number counted in JavaScript, and a face whose animation is a
 * `<style>` element INSIDE an SVG being used as an image. Those have to ask, and
 * asking in two places is how they come to disagree.
 *
 * ⚠️ BOTH SIGNALS, AND THE SECOND IS THE HALF THAT IS ACTUALLY REACHABLE.
 * `prefers-reduced-motion` is an operating-system setting; `data-reduce-motion`
 * is what a switch inside the product sets, and it is the one somebody flips
 * after an animation annoys them. Answering only the first means the app has a
 * control that visibly does nothing.
 *
 * ⚠️ AND THE OS SETTING IS READ SYNCHRONOUSLY, WHICH IS LOAD-BEARING. Starting
 * at `true` and correcting in an effect made the counter's first run take the
 * bail-out path — which marks the value as already reached, so when the
 * correction arrived there was nothing left to count from. The component never
 * animated at all, in either setting, with every test green and the code reading
 * exactly as intended.
 */
export function useStill(at: React.RefObject<HTMLElement | null>): boolean {
  const [still, setStill] = React.useState(
    () => typeof matchMedia === "function"
      && matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  /* ⚠️ The ancestor can only make it MORE still — an in-app switch turns motion
     off, it never turns it back on over somebody's operating system. */
  React.useEffect(() => {
    if (at.current?.closest('[data-reduce-motion="true"]')) setStill(true);
  }, [at]);
  return still;
}

/* ------------------------------------------------------------- the budget --- */

/**
 * TWO KINDS OF MOTION, AND ONLY ONE OF THEM IS FREE.
 *
 * ⚠️ ESSENTIAL MOTION IS SHORT, ONE-SHOT AND COMPOSITED. A screen arriving, a
 * page travelling, a mark playing its character under a finger, a chart drawing
 * itself: each is a few hundred milliseconds of `transform` and `opacity` on a
 * handful of elements, which the compositor runs on its own thread and the main
 * thread never sees. It is also the motion that CARRIES MEANING — where a screen
 * came from, that a press registered — so taking it away costs comprehension.
 *
 * ⚠️ AMBIENT MOTION IS ENDLESS AND FULL-SCREEN, AND IT IS NEVER COMPOSITED. The
 * world's marks beat in SMIL inside a `<pattern>`, which is the only thing that
 * repaints in one — and a repaint inside a paint server invalidates the whole
 * fill, so every frame re-rasterises a tile and repaints a viewport-sized rect,
 * on the main thread, for as long as the screen is open. It costs the same
 * whether anybody is looking at it or not, and it competes with scrolling.
 *
 * ⚠️ SO AMBIENT IS EARNED AND ESSENTIAL IS ASSUMED. A device that has not shown
 * it can afford a permanent full-screen repaint does not get one; nothing about
 * the product is missing without it, because a still world is still a world.
 */
export interface Motion {
  /** Arrival, travel, a press, a chart drawing. Assumed unless motion is refused. */
  readonly essential: boolean;
  /** The world's marks. Earned, never assumed. */
  readonly ambient: boolean;
}

/**
 * ⚠️ FOUR STATES, AND `auto` IS THE DEFAULT BECAUSE IT IS AN ANSWER. A person
 * who has never chosen is not asking for the most the device can do; they are
 * asking for whatever is right on the thing in their hand, which is a different
 * answer on a phone and a desktop. Storing `calm` on first load makes a choice
 * for them they then have to undo, exactly as `system` exists to avoid in
 * `Appearance`.
 *
 * ⚠️ AND `full` IS AN OVERRIDE THAT BEATS THE DEVICE TEST, IN ONE DIRECTION ONLY.
 * Somebody who asks for the world to move gets it wherever they asked; nothing
 * overrides an operating system that asked for less motion, because for some
 * people that is not a preference.
 */
export type Liveliness = "auto" | "full" | "calm" | "none";

export const LIVELINESS: readonly Liveliness[] = ["auto", "full", "calm", "none"];

/** ⚠️ Prefixed, because a person may have several products on one origin. */
export const LIVELINESS_KEY = "one:motion";

/**
 * WHAT THE DEVICE SAID ABOUT ITSELF. A record rather than a set of `navigator`
 * reads, so the rule below is a pure function somebody can put a table of
 * devices through — which is the only way a rule about hardware gets tested at
 * all.
 */
export interface Device {
  /** The operating system asked for less motion. Outranks every other field. */
  readonly asked: boolean;
  /** The person asked the network for less. Somebody metering bytes is metering. */
  readonly saveData: boolean;
  /** A pointer that hovers — a mouse, and therefore a machine with a fan. */
  readonly fine: boolean;
  /** Gigabytes, where the browser says. `null` is "did not say". */
  readonly memory: number | null;
  /** Logical cores, where the browser says. `null` is "did not say". */
  readonly cores: number | null;
}

/**
 * ⚠️ THE POINTER IS THE STRONGEST SIGNAL AND THE COUNTS ONLY VETO. A mid-range
 * phone reports eight cores, so a threshold on cores alone admits exactly the
 * device this exists to protect; what a phone cannot report is a mouse. So a
 * fine pointer is the entry condition, and memory and cores are read only to
 * REFUSE a machine that says it is small.
 *
 * ⚠️ AND SILENCE IS NOT A REFUSAL, ON THOSE TWO ONLY. `deviceMemory` is absent
 * outside Chromium; treating absent as small would make a still world the
 * permanent answer in two browsers on hardware that is fine — a rule that turns
 * into a browser test is a rule about the wrong thing.
 */
export const earned = (d: Device): boolean =>
  !d.asked && !d.saveData && d.fine
  && (d.memory === null || d.memory >= 8)
  && (d.cores === null || d.cores >= 8);

/** The whole decision, pure, from a choice and a device. */
export const motionFor = (choice: Liveliness, device: Device): Motion => {
  /* ⚠️ THE OPERATING SYSTEM IS ABOVE THE PRODUCT'S OWN SWITCH. */
  if (device.asked || choice === "none") return { essential: false, ambient: false };
  if (choice === "calm") return { essential: true, ambient: false };
  if (choice === "full") return { essential: true, ambient: true };
  return { essential: true, ambient: earned(device) };
};

const isLiveliness = (v: unknown): v is Liveliness =>
  v === "auto" || v === "full" || v === "calm" || v === "none";

/**
 * ⚠️ AN UNREADABLE STORE IS `auto`, NOT A THROW — the same hazard `Appearance`
 * documents: private browsing and a blocked-cookies setting make `localStorage`
 * throw on ACCESS, so a naive read takes the application down before it renders.
 */
export function livelinessStored(): Liveliness {
  try {
    const raw = localStorage.getItem(LIVELINESS_KEY);
    return isLiveliness(raw) ? raw : "auto";
  } catch {
    return "auto";
  }
}

export function rememberLiveliness(choice: Liveliness): void {
  try {
    if (choice === "auto") localStorage.removeItem(LIVELINESS_KEY);
    else localStorage.setItem(LIVELINESS_KEY, choice);
  } catch {
    /* ⚠️ Swallowed: failing to REMEMBER a preference must never stop it being
       APPLIED for this visit. */
  }
}

/**
 * ⚠️ READ FRESH RATHER THAN CACHED. A laptop that loses its mouse, a phone that
 * turns on data saving, and an operating system whose motion setting changes are
 * all things that happen while the page is open.
 */
export function reading(): Device {
  if (typeof document === "undefined") {
    return { asked: false, saveData: false, fine: false, memory: null, cores: null };
  }
  const media = (q: string) => typeof matchMedia === "function" && matchMedia(q).matches;
  const nav = navigator as Navigator & {
    deviceMemory?: number; connection?: { saveData?: boolean };
  };
  return {
    /*
      ⚠️ THE ATTRIBUTE COUNTS AS ASKING, AND LEAVING IT OUT BROKE THE CURTAIN.
      `data-reduce-motion` is how a PAGE switches its own ambience off — `REDUCED`
      is exported for exactly that, and a harness sets it to prove the opening
      holds one line. Reading only the media query left every CSS rule honouring
      it while everything decided at RENDER went on moving, which is the split
      this whole budget exists to close.

      ⚠️ SO `none` AND THE OPERATING SYSTEM ARE ONE ANSWER HERE, and that is
      harmless: `none` already means both tiers off, so there is nothing `full`
      could override that it should be allowed to.
    */
    asked: media("(prefers-reduced-motion: reduce)")
      || document.documentElement.getAttribute("data-reduce-motion") === "true",
    saveData: nav.connection?.saveData === true,
    fine: media("(pointer: fine)") && media("(hover: hover)"),
    memory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    cores: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
  };
}

/**
 * Stamp the document so the stylesheet can answer, and keep it stamped.
 *
 * ⚠️ ONLY `none` REACHES CSS, AND THAT IS THE WHOLE OF WHAT CSS CAN DECIDE. The
 * ambient half is SMIL, which no rule can switch off — it is decided where the
 * drawing is MADE (`useScenery`). Stamping a third state here would be a
 * selector that looks like it controls the world and controls nothing.
 *
 * ⚠️ ON `documentElement`, NOT ON A WRAPPER — overlays are portalled to
 * `document.body`, outside whatever the application renders into.
 */
export function applyLiveliness(choice: Liveliness = livelinessStored()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (choice === "none") root.setAttribute("data-reduce-motion", "true");
  else root.removeAttribute("data-reduce-motion");
}

/**
 * WHAT MAY MOVE, WATCHED.
 *
 * ⚠️ READ SYNCHRONOUSLY. Starting permissive and correcting in an effect renders
 * one moving world and throws it away, which is a second field built and
 * discarded on the slowest device in the fleet — the device the correction was
 * for.
 */
export function useMotion(): Motion {
  const read = () => motionFor(livelinessStored(), reading());
  const [motion, setMotion] = React.useState(read);
  React.useEffect(() => {
    const again = () => setMotion(read());
    /* ⚠️ THE ATTRIBUTE IS WATCHED AS WELL AS THE MEDIA, because the switch that
       writes it is a control on a settings screen and somebody who moves it must
       not have to reload to be believed. */
    const on = new MutationObserver(again);
    on.observe(document.documentElement, {
      attributes: true, attributeFilter: ["data-reduce-motion"],
    });
    const watched = ["(prefers-reduced-motion: reduce)", "(pointer: fine)", "(hover: hover)"]
      .map((q) => (typeof matchMedia === "function" ? matchMedia(q) : null));
    for (const m of watched) m?.addEventListener("change", again);
    return () => {
      on.disconnect();
      for (const m of watched) m?.removeEventListener("change", again);
    };
  }, []);
  return motion;
}

/**
 * WHETHER THIS PERSON WANTS LESS MOTION.
 *
 * ⚠️ A PROJECTION OF `useMotion`, WHICH IS WHY IT IS ONE LINE. Two
 * implementations of "may this move" is how a screen comes to hold still while
 * the world under it goes on breathing.
 *
 * ⚠️ IT IS HERE RATHER THAN IN `frame/`, BECAUSE THE THINGS THAT NEED IT ARE NOT
 * ALL FRAMES. `Page` asks so it can bake a still world; the opening asks so it
 * can hold one line instead of cycling them. A hook about a PREFERENCE living
 * beside one of its callers is how a `parts/` file comes to import a `frame/`
 * one, which is the direction that eventually closes a cycle.
 */
export function useStillness(): boolean {
  return !useMotion().essential;
}

/**
 * ⚠️ A NAMED INTENT, NOT A DURATION AND A CURVE AT EVERY CALL SITE. `enter`,
 * `exit`, `press`, `travel` and `drift` are the whole vocabulary; a screen that
 * needs a sixth is a screen that should say why.
 */
export const MOTION = {
  enter: transition("opacity, transform", "quick", "enter"),
  exit: transition("opacity, transform", "instant", "exit"),
  press: transition("transform, background-color, border-color", "instant", "settle"),
  travel: transition("transform", "moderate", "travel"),
  drift: transition("background-position", "ambient", "steady"),
  /**
   * ⚠️ A SIXTH, AND THE REASON IS THAT NOTHING ELSE ANIMATES A THING'S SIZE.
   * Every intent above moves or fades something whose box does not change; a
   * label folding out of a nav changes the height of the bar it is in, and the
   * things around it have to move with it rather than jump when it lands.
   */
  reveal: transition("max-height, opacity, transform", "moderate", "travel"),
  /**
   * THE NAV'S WORD ARRIVING, AND LEAVING — two intents, because they are not the
   * same length and that asymmetry is the whole effect.
   *
   * ⚠️ `reveal` NAMES `max-height` AND THE BAR ANIMATES `max-width`, so for as
   * long as this bar has existed the label's WIDTH has snapped. Only its opacity
   * moved. The header on `Island` describes a word that "grows out of one item
   * while the one before it closes" and a motion that "is continuous"; what
   * shipped was two boxes changing size in one frame with a fade over the top,
   * which is why it read as two things resizing rather than one thing moving.
   *
   * ⚠️ AND NEITHER OF THEM TRANSLATES. A few pixels of lead-in would make the
   * word read as sliding out of its mark, and it is not worth what it costs: a
   * `transform` anywhere in the bar's file is refused by `heroui`, whose reason
   * is that a transformed STICKY box counts toward the document's scrollable
   * overflow. Narrowing a sound guard to admit a garnish is the wrong trade, and
   * `max-width` from zero already opens the word from the edge the glyph is on.
   *
   * ⚠️ THE OUTGOING WORD IS FASTER THAN THE INCOMING ONE, and that is what makes
   * it read as ONE movement between two items rather than a swap. Room has to be
   * free before the arriving word can take it — at equal durations the two
   * compete for the same pixels for the whole transition, and the four closed
   * glyphs visibly shuffle in the middle of it.
   *
   * ⚠️ AND THE ARRIVING WORD IS DELAYED BEHIND ITS OWN WIDTH. Opacity opening
   * with the box puts letters on the screen while the space is a third open, so
   * they appear clipped and then un-clip. The width goes first and the word
   * follows into the room it made.
   */
  unfold: [
    transition("max-width", "moderate", "travel"),
    `opacity ${DURATION.quick} ${EASE.plain} ${DELAY.after}`,
  ].join(", "),
  fold: [
    transition("max-width", "quick", "travel"),
    transition("opacity", "instant", "plain"),
  ].join(", "),
  /**
   * THE LIGHT UNDER THE NAV'S ACTIVE MARK, COMING AND GOING.
   *
   * ⚠️ IT IS AN INTENT RATHER THAN A PAIR OF NUMBERS IN THE STYLESHEET THAT
   * PAINTS IT, and the reason is the claim it makes: the light arrives WITH the
   * word. Written where the gradient is, that is two timings a person has to
   * compare across two files to check — and the motion guard refused the second
   * copy, correctly, the first time it was written that way.
   */
  lit: `opacity ${DURATION.moderate} ${EASE.plain} ${DELAY.behind}`,
  unlit: transition("opacity", "quick", "plain"),
} as const;

export type Intent = keyof typeof MOTION;

/* ---------------------------------------------------------------- arrival --- */

/**
 * THE THREE KINDS OF MOTION THERE ARE, AND THERE IS NO FOURTH.
 *
 * ⚠️ A PRODUCT WITH A DOZEN ANIMATION TECHNIQUES HAS NO MOTION DESIGN, IT HAS A
 * JUNGLE. Every moving thing in this system is one of exactly three, and which
 * one it is falls out of what is happening rather than out of taste:
 *
 *   IT ARRIVED ... `ARRIVE` — something that was not in the tree now is. A
 *                  transition cannot express this: there is no prior state to
 *                  transition FROM, so it needs a keyframe.
 *   IT CHANGED ... a transition on a `MOTION` token. The element was already
 *                  there and one of its properties moved.
 *   IT IS WAITING  `Skeleton`, `Spinner`, `ProgressBar` — the library's own,
 *                  which animate themselves and stand down by themselves.
 *
 * ⚠️ AND THE ARRIVAL KEYFRAME IS THE LIBRARY'S, NOT OURS. HeroUI defines
 * `@keyframes enter` globally and drives it entirely through `--tw-enter-*`
 * custom properties — it is what every popover, dropdown and modal it ships
 * animates on. Naming it here means our own content arrives the same way the
 * library's does, rather than one step out of phase with it, which is the exact
 * fault this file's header is about. The only thing declared below is WHICH
 * properties move.
 *
 * ⚠️ THE OPT-OUTS ARE BOTH PRESENT AND BOTH REQUIRED. HeroUI switches its own
 * components off for `prefers-reduced-motion` and for a `data-reduce-motion`
 * ancestor; a rule of ours that answered only the first would keep moving for
 * somebody who turned it off inside the app, which is the half that is actually
 * reachable from a settings screen.
 */
export const ARRIVE = { "data-arrive": "true" } as const;

/**
 * ⚠️ A STAGGER, AND IT IS CAPPED. A list where every row arrives at once reads
 * as a flash; one where the delay grows without limit makes the twentieth row
 * take a second and a half, which reads as a slow page rather than as a
 * considered one. Six steps is where the eye stops counting.
 */
export const arriveAt = (index: number): React.CSSProperties =>
  ({ ["--tw-animation-delay" as string]: `${Math.min(index, 5) * 40}ms` });

/**
 * ⚠️ INJECTED BESIDE THE REST OF THE SHARED CHROME, and it has to BE injected —
 * `CHART_MOTION` was imported by OneSpace's entry point and left out of the join,
 * so the chart reveal never ran once, in any build, with everything green.
 */
export const ARRIVE_MOTION = [
  `[data-arrive="true"] {`,
  `  animation: enter var(--default-transition-duration) var(--ease-out-quart)`,
  `    var(--tw-animation-delay, 0s) both;`,
  `  --tw-enter-opacity: 0;`,
  `  --tw-enter-translate-y: 0.5rem;`,
  `}`,
  /*
    ⚠️ A BLOCK ARRIVES ONCE. `Screen` now animates every top-level block it is
    given, and several components animate THEMSELVES because they were built to
    be dropped anywhere — so inside a screen both fired: the same element
    translated half a rem inside a parent already translating half a rem, and
    faded from zero inside a parent already fading from zero. Nothing looks
    broken; it looks like a slightly bigger jump than everything else, on the
    two screens that happen to use those components.

    ⚠️ THE INNER ONE STANDS DOWN, NOT THE OUTER. The outer block is the thing
    that arrived — the inner is part of it, and it is carried.
  */
  `[data-arrive="true"] [data-arrive="true"] { animation: none; }`,
  `@media (prefers-reduced-motion: reduce) { [data-arrive="true"] { animation: none; } }`,
  `[data-reduce-motion="true"] [data-arrive="true"] { animation: none; }`,
].join("\n");

/**
 * A SCREEN'S BLOCKS ARRIVE IN THE ORDER THEY ARE IN, AND THE DOM DECIDES WHAT
 * THAT ORDER IS.
 *
 * ⚠️ THE STAGGER WAS AN INLINE DELAY PER WRAPPER AND IT WAS SILENTLY ABSENT ON
 * NEARLY EVERY SCREEN. `Screen` wrapped each child it could count, and a `then`
 * returning a COMPONENT — which is what every real screen does — is one child.
 * So the delay landed on one wrapper and every block inside it arrived at once,
 * along with the gap between them, which was zero. Positionally in CSS there is
 * nothing to count and nothing to lose: `nth-child` reads the DOM, and fragments
 * produce no DOM, so a block is a block however deeply it was composed.
 *
 * ⚠️ IT SETS THE DELAY VARIABLE RATHER THAN THE ANIMATION, so a block that
 * already animates itself (`ARRIVE`, on every `Group`) keeps its own rule and
 * only learns where it is in the queue. Two `animation` shorthands on one element
 * is a fight the cascade settles arbitrarily; one variable is not.
 *
 * ⚠️ AND SIX, LIKE `arriveAt`. A list where every block arrives at once reads as
 * a flash; one whose delay grows without limit makes the seventh block take most
 * of a second, which reads as a slow page. Past the cap they land together,
 * because by then the eye has stopped counting.
 */
export const BLOCK_MOTION = [
  /* ⚠️ A block that does not animate itself still arrives — most do not. */
  `[data-blocks] > *:not([data-arrive]) {`,
  `  animation: enter var(--default-transition-duration) var(--ease-out-quart)`,
  `    var(--tw-animation-delay, 0s) both;`,
  `  --tw-enter-opacity: 0;`,
  `  --tw-enter-translate-y: 0.5rem;`,
  `}`,
  ...[0, 1, 2, 3, 4, 5].map((i) =>
    `[data-blocks] > *:nth-child(${i + 1}) { --tw-animation-delay: ${i * 40}ms; }`),
  `[data-blocks] > *:nth-child(n+7) { --tw-animation-delay: 200ms; }`,
  `@media (prefers-reduced-motion: reduce) { [data-blocks] > * { animation: none; } }`,
  `[data-reduce-motion="true"] [data-blocks] > * { animation: none; }`,
].join("\n");

/**
 * THE DOOR'S ENTRANCE — the one sequence in the product that is allowed to be
 * an impression.
 *
 * ⚠️ IT IS STILL THE LIBRARY'S OWN `enter` KEYFRAME, WITH DIFFERENT VARIABLES.
 * HeroUI ships `--tw-enter-opacity`, `-scale`, `-rotate`, `-blur` and
 * `-translate-*` against one animation, so a mark that turns into place and a
 * heading that rises are the SAME animation given different numbers — not two
 * hand-rolled keyframes with their own curves, which is the version that keeps
 * moving for somebody who asked motion to stop.
 *
 * ⚠️ THE MARK TURNS AND THE REST RISES, WHICH IS THE WHOLE CHOREOGRAPHY. Every
 * block moving the same way is a page sliding; one element behaving differently
 * is the thing the eye lands on first, and on a door that element should be the
 * mark. Kept to two behaviours because a third is a screen with an opinion
 * about itself.
 */
/**
 * THE CODE READER'S OWN MOTION — one line, and it means the machine is looking.
 *
 * ⚠️ A LIVE PICTURE OF A SHELF IS INDISTINGUISHABLE FROM A CAMERA THAT IS MERELY
 * ON. The viewfinder deliberately draws no guide box — the decoder reads the
 * whole frame, so a rectangle somebody lines a barcode up inside is the interface
 * lying about how it works. But with nothing drawn at all, a person holding a
 * code in front of the lens has no way to tell whether anything is reading, and
 * the honest answer to that is a mark about the MACHINE's state rather than an
 * instruction to the person.
 *
 * ⚠️ IT IS HERE AND NOT IN A `className`, WHICH IS THE RULE THIS FILE EXISTS FOR.
 * An `animate-[sweep_2s]` utility is only emitted if Tailwind has SEEN that exact
 * string, and it carries none of the reduced-motion machinery below — so the line
 * would go on sweeping for somebody who asked motion to stop, which is precisely
 * the failure the header bans.
 */
export const READER_MOTION = [
  /* ⚠️ IT CROSSES AND COMES BACK rather than looping top-to-bottom. A beam that
     jumps back to the start is a progress bar, which claims the read is a
     process with an end — it is not; it is eight attempts a second, for as long
     as somebody points it at something. */
  `@keyframes reader-sweep {`,
  `  0% { top: 12% } 50% { top: 88% } 100% { top: 12% }`,
  `}`,
  `[data-reading="beam"] {`,
  `  top: 12%;`,
  /* ⚠️ `turn`, NOT A CONTROL DURATION — and that is the same distinction the
     scale draws for a spinner. Every entry above `turn` describes a movement
     with an END somebody is waiting for; this describes a TEMPO somebody watches
     for as long as they are pointing the phone, and fast reads as anxious. */
  `  animation: reader-sweep ${DURATION.turn} ${EASE.settle} infinite;`,
  `}`,
  /* ⚠️ STOPPED IN THE MIDDLE, NOT HIDDEN. The line still says a reader is on;
     what it stops doing is moving. */
  `@media (prefers-reduced-motion: reduce) {`,
  `  [data-reading="beam"] { animation: none; top: 50% }`,
  `}`,
  `[data-reduce-motion="true"] [data-reading="beam"] { animation: none; top: 50% }`,
].join("\n");

export const DOOR_MOTION = [
  `[data-arrive="mark"] {`,
  `  animation: enter ${DURATION.stately} ${EASE.travel} var(--tw-animation-delay, 0s) both;`,
  `  --tw-enter-opacity: 0;`,
  `  --tw-enter-scale: 0.6;`,
  `  --tw-enter-rotate: -35deg;`,
  `  --tw-enter-blur: 6px;`,
  `}`,
  `[data-arrive="rise"] {`,
  `  animation: enter ${DURATION.moderate} ${EASE.enter} var(--tw-animation-delay, 0s) both;`,
  `  --tw-enter-opacity: 0;`,
  `  --tw-enter-translate-y: 0.75rem;`,
  `  --tw-enter-blur: 3px;`,
  `}`,
  `@media (prefers-reduced-motion: reduce) {`,
  `  [data-arrive="mark"], [data-arrive="rise"] { animation: none; }`,
  `}`,
  `[data-reduce-motion="true"] [data-arrive="mark"],`,
  `[data-reduce-motion="true"] [data-arrive="rise"] { animation: none; }`,
].join("\n");

export const ARRIVE_MARK = { "data-arrive": "mark" } as const;
export const ARRIVE_RISE = { "data-arrive": "rise" } as const;

/**
 * ⚠️ A DOOR'S STAGGER IS SLOWER THAN A LIST'S, AND UNCAPPED BECAUSE IT IS FOUR
 * BLOCKS. `arriveAt` caps at six steps of 40ms so a long list does not take a
 * second and a half to appear; a door has a mark, a name, a form and a line
 * under it, and at 40ms apart they arrive as one flash rather than as a
 * sequence somebody notices.
 */
export const doorAt = (index: number): React.CSSProperties =>
  ({ ["--tw-animation-delay" as string]: `${index * 110}ms` });

/* ------------------------------------------------------------------ glyphs --- */

/**
 * AN ICON ANSWERS IN ITS OWN CHARACTER, AND THAT IS THE WHOLE RULE.
 *
 * ⚠️ A SCALE-AND-FADE ON EVERY MARK IS THE SAME AS NO ANIMATION AT ALL. It says
 * "something was pressed", which the row's own press already said — so it is a
 * second copy of one fact, and the eye stops seeing it within a day. A bell that
 * RINGS says which thing was pressed, and that is information the press does not
 * carry.
 *
 * ⚠️ NINE CHARACTERS, NOT ONE PER ICON. Every mark in the registry is one of
 * these, and which one falls out of what the mark IS rather than out of taste —
 * the same rule the three arrival kinds follow. A tenth is a decision somebody
 * makes on purpose, having failed to fit a mark into the nine.
 *
 * ⚠️ THE WHOLE GLYPH MOVES, NOT ITS PARTS. Lucide draws each mark as several
 * paths whose order is the library's business; a bell whose clapper swings needs
 * `svg > path:nth-child(2)`, which is a selector that silently animates the
 * wrong path the day lucide redraws the icon. A transform on the mark is robust
 * across every version and reads as clearly at 20px.
 *
 * ⚠️ AND BOTH OPT-OUTS ARE HERE, WHICH IS THE PRICE OF OWNING A KEYFRAME. This
 * file's header bans hand-rolled motion precisely because it escapes the
 * library's reduced-motion machinery. These do not: the media query and the
 * `data-reduce-motion` ancestor both stop them dead, and the curves are the
 * library's own `EASE` variables rather than new cubic-beziers.
 */
export const GLYPH_MOTION = [
  /*
    ⚠️ THE PART MOVES, NOT THE MARK — see `marks.tsx`. A bell rings by its
    clapper; a calendar turns its days over; an arrow leaves through a door that
    stays. Each of these names a `data-part` we drew, so nothing here depends on
    the order lucide happens to put its paths in.
  */
  /* ⚠️ FIVE SWINGS, DAMPED, AND THE AMPLITUDE IS THE PART THAT WAS WRONG. At
     19 degrees over half a second the clapper reads as a bell being SHAKEN. */
  `@keyframes glyph-clapper {`,
  `  0% { transform: rotate(0deg) }   20% { transform: rotate(-12deg) }`,
  `  40% { transform: rotate(12deg) } 60% { transform: rotate(-8deg) }`,
  `  80% { transform: rotate(8deg) }  100% { transform: rotate(0deg) }`,
  `}`,
  /* ⚠️ The body rocks a fraction of the clapper's arc — a bell held, not shaken. */
  `@keyframes glyph-body {`,
  `  0% { transform: rotate(0deg) } 22% { transform: rotate(4deg) }`,
  `  50% { transform: rotate(-3deg) } 78% { transform: rotate(1.5deg) }`,
  `  100% { transform: rotate(0deg) }`,
  `}`,
  /* A page turning: the days rise out and the next set rises in behind them. */
  /* ⚠️ AND THE PAGE COMES BACK. Turning to the next set and STAYING there left
     one calendar in the product showing different days from every other. */
  `@keyframes glyph-page-out {`,
  `  0% { transform: translateY(0); opacity: 1 }`,
  `  30%, 70% { transform: translateY(-5px); opacity: 0 }`,
  `  100% { transform: translateY(0); opacity: 1 }`,
  `}`,
  `@keyframes glyph-page-in {`,
  `  0%, 30% { transform: translateY(5px); opacity: 0 }`,
  `  50% { transform: translateY(0); opacity: 1 }`,
  `  70%, 100% { transform: translateY(5px); opacity: 0 }`,
  `}`,
  /* The arrow goes through the opening and comes back — the row is still there. */
  `@keyframes glyph-depart {`,
  `  0% { transform: translateX(0); opacity: 1 }`,
  `  45% { transform: translateX(7px); opacity: 0 }`,
  `  55% { transform: translateX(-7px); opacity: 0 }`,
  `  100% { transform: translateX(0); opacity: 1 }`,
  `}`,
  /*
    ⚠️ THE BEAM CROSSES AND COMES BACK, because a viewfinder that swept once and
    stopped at the bottom is a scanner that has finished — and this mark is
    pressed to START one. Out of the window at both ends so the line is never
    seen resting anywhere but the middle.
  */
  `@keyframes glyph-sweep-beam {`,
  `  0% { transform: translateY(0); opacity: 1 }`,
  `  45% { transform: translateY(-6px); opacity: 0 }`,
  `  55% { transform: translateY(6px); opacity: 0 }`,
  `  100% { transform: translateY(0); opacity: 1 }`,
  `}`,
  /*
    ⚠️ THE FIFTH STROKE IS DRAWN, NOT MOVED. A tally is finished by putting the
    diagonal ACROSS the four, so what the eye wants is the line arriving along
    its own length — the same draw the tick uses, which is the one motion in this
    vocabulary that means "somebody just made this mark".
  */
  `@keyframes glyph-fifth {`,
  `  0% { stroke-dashoffset: 20 } 100% { stroke-dashoffset: 0 }`,
  `}`,
  /* The line reaches the other two; what is shared does not move. */
  `@keyframes glyph-reach {`,
  `  0% { transform: scaleX(0.2); opacity: 0.3 }`,
  `  60% { transform: scaleX(1); opacity: 1 }`,
  `  100% { transform: scaleX(1); opacity: 1 }`,
  `}`,
  /* Something lands in the tray, and the tray takes the weight. */
  `@keyframes glyph-arrive {`,
  `  0% { transform: translateY(-4px); opacity: 0 }`,
  `  40% { opacity: 1 }`,
  `  70% { transform: translateY(1px); opacity: 1 }`,
  `  100% { transform: translateY(0); opacity: 0 }`,
  `}`,
  `@keyframes glyph-settle {`,
  `  0%, 55% { transform: translateY(0) }`,
  `  72% { transform: translateY(1.5px) }`,
  `  100% { transform: translateY(0) }`,
  `}`,
  /*
    ⚠️ A STROKE BEING MADE, WHICH NEEDS `pathLength={1}` ON THE PATH. With it the
    dash numbers are fractions of the whole and survive the path being redrawn;
    without it they are user units somebody measured once.
  */
  `@keyframes glyph-draw {`,
  `  0% { stroke-dasharray: 1; stroke-dashoffset: 1 }`,
  `  100% { stroke-dasharray: 1; stroke-dashoffset: 0 }`,
  `}`,
  /* A glass moved over a page: the lens leads and the handle follows it. */
  `@keyframes glyph-sweep {`,
  `  0% { transform: translate(0, 0) }   30% { transform: translate(-2.5px, 1px) }`,
  `  65% { transform: translate(2px, -1px) } 100% { transform: translate(0, 0) }`,
  `}`,
  /*
    ⚠️ EVERY ONE OF THESE ENDS WHERE IT STARTED, AND THAT IS THE RULE THE FIRST
    SET BROKE. `glyph-turn` was `to { rotate(60deg) }` with `both`, so a cog that
    had been pressed once sat permanently sixty degrees off-axis — beside three
    other cogs that had not. A coin was left MIRRORED (`rotateY(180deg)`); a star
    upside down. Nothing about it reads as an animation: it reads as an icon that
    is wrong, and as a press that did something and will not do it again.

    ⚠️ A PRESS IS A MOMENT, NOT A STATE CHANGE. The mark acknowledges and goes
    back to being the mark. So a cog turns a WHOLE turn, a coin flips a whole
    flip, and everything that leans returns — which is also what makes a second
    press look like a second press.
  */
  `@keyframes glyph-turn { from { transform: rotate(0) } to { transform: rotate(360deg) } }`,
  /* ⚠️ A WHOLE FLIP, so the face lands the way up it started. Half of one leaves
     a coin mirrored, which is a different picture rather than a moved one. */
  `@keyframes glyph-flip { from { transform: rotateY(0) } to { transform: rotateY(360deg) } }`,
  /* Something catches the light, and then it is a star again. */
  `@keyframes glyph-twinkle {`,
  `  0% { transform: rotate(0) scale(1) }`,
  `  45% { transform: rotate(14deg) scale(1.18) }`,
  `  100% { transform: rotate(0) scale(1) }`,
  `}`,
  /* ⚠️ A PULSE THE WHOLE MARK MAKES, for what is being generated rather than
     found. Kept small: this is the one character that plays while something is
     working, so an amplitude that reads once reads badly forty times. */
  `@keyframes glyph-spark {`,
  `  0% { transform: scale(1); opacity: 1 }`,
  `  40% { transform: scale(1.14); opacity: .55 }`,
  `  100% { transform: scale(1); opacity: 1 }`,
  `}`,
  /* ⚠️ A REFRESH GOES ROUND ONCE. Not a spinner: the mark says the work was
     asked for, and how long it takes is the row's business. */
  `@keyframes glyph-round { from { transform: rotate(0) } to { transform: rotate(360deg) } }`,
  /* Cloth catching the air — it rises, ripples once and falls. */
  `@keyframes glyph-lift {`,
  `  0% { transform: translateY(0) skewY(0) }`,
  `  35% { transform: translateY(-1.5px) skewY(-4deg) }`,
  `  68% { transform: translateY(.5px) skewY(2deg) }`,
  `  100% { transform: translateY(0) skewY(0) }`,
  `}`,
  /*
    ⚠️ THE MARK IS ITS OWN TRANSFORM CONTEXT, AND SO IS EVERY PART. Without
    `transform-box: fill-box` an SVG group rotates about the viewport's origin,
    which throws the clapper off the screen — the one difference between these
    rules and the same rules on an HTML element.
  */
  `[data-glyph] { display: inline-flex }`,
  `[data-glyph] [data-part] { transform-box: fill-box; transform-origin: center }`,
  `[data-glyph="ring"] [data-part="clapper"], [data-glyph="ring"] [data-part="body"] {`,
  `  transform-origin: top center }`,
  /*
    ⚠️ SLOWER THAN A CONTROL, AND THAT IS THE POINT. `instant` and `quick` are
    paced for something done a hundred times a day, where anything longer is a
    tax on every repetition. A mark answering in character is a small piece of
    craft somebody is meant to NOTICE — under about half a second it reads as a
    flicker, which is worse than nothing.
  */
  `[data-glyph="ring"][data-lively="true"] [data-part="clapper"] {`,
  `  animation: glyph-clapper ${DURATION.stately} ${EASE.settle} backwards }`,
  `[data-glyph="ring"][data-lively="true"] [data-part="body"] {`,
  `  animation: glyph-body ${DURATION.stately} ${EASE.settle} backwards }`,
  `[data-glyph="page"][data-lively="true"] [data-part="days"] {`,
  `  animation: glyph-page-out ${DURATION.stately} ${EASE.travel} backwards }`,
  `[data-glyph="page"][data-lively="true"] [data-part="days-next"] {`,
  `  animation: glyph-page-in ${DURATION.stately} ${EASE.travel} backwards }`,
  /* ⚠️ The next set is invisible until the mark is pressed, or a calendar sits
     with two rows of days printed over each other. */
  `[data-glyph="page"] [data-part="days-next"] { opacity: 0 }`,
  `[data-glyph="reach"][data-lively="true"] [data-part="link"] {`,
  `  transform-origin: 6px 12px;`,
  `  animation: glyph-reach ${DURATION.moderate} ${EASE.travel} backwards }`,
  `[data-glyph="depart"][data-lively="true"] [data-part="arrow"] {`,
  `  animation: glyph-depart ${DURATION.stately} ${EASE.travel} backwards }`,
  `[data-glyph="take"][data-lively="true"] [data-part="post"] {`,
  `  animation: glyph-arrive ${DURATION.stately} ${EASE.travel} backwards }`,
  `[data-glyph="take"][data-lively="true"] [data-part="tray"] {`,
  `  animation: glyph-settle ${DURATION.stately} ${EASE.settle} backwards }`,
  `[data-glyph="take"] [data-part="post"] { opacity: 0 }`,
  `[data-glyph="guard"][data-lively="true"] [data-part="tick"] {`,
  `  animation: glyph-draw ${DURATION.stately} ${EASE.enter} backwards }`,
  `[data-glyph="draw"][data-lively="true"] [data-part="tick"] {`,
  `  animation: glyph-draw ${DURATION.moderate} ${EASE.enter} backwards }`,
  `[data-glyph="draw"][data-lively="true"] [data-part="tick-two"] {`,
  `  animation: glyph-draw ${DURATION.moderate} ${EASE.enter} 140ms backwards }`,
  `[data-glyph="read"][data-lively="true"] [data-part="beam"] {`,
  `  animation: glyph-sweep-beam ${DURATION.stately} ${EASE.travel} backwards }`,
  /* ⚠️ `pathLength` IS NOT SET HERE, so the dash numbers are the path's own
     length in user units — the diagonal is 18.6 long and 20 clears it. The tick
     sets `pathLength`; this one does not, and mixing the two conventions in one
     rule is how a draw comes out half-finished. */
  `[data-glyph="count"] [data-part="fifth"] { stroke-dasharray: 20 }`,
  `[data-glyph="count"][data-lively="true"] [data-part="fifth"] {`,
  `  animation: glyph-fifth ${DURATION.moderate} ${EASE.enter} backwards }`,
  `[data-glyph="seek"][data-lively="true"] [data-part="lens"],`,
  `[data-glyph="seek"][data-lively="true"] [data-part="handle"] {`,
  `  animation: glyph-sweep ${DURATION.stately} ${EASE.settle} backwards }`,
  /* ⚠️ THE BOW IS THE PIVOT, not the middle of the box — a key turned about its
     centre swings the blade through an arc no lock has. */
  `[data-glyph="unlock"] [data-part="key"] { transform-origin: 31% 74% }`,
  `[data-glyph="unlock"][data-lively="true"] [data-part="key"] {`,
  `  animation: glyph-unlock ${DURATION.stately} ${EASE.settle} backwards }`,
  `[data-glyph="stack"][data-lively="true"] [data-part="plate"] {`,
  `  animation: glyph-land ${DURATION.stately} ${EASE.settle} backwards }`,
  `[data-glyph="stack"][data-lively="true"] [data-part="under"] {`,
  `  animation: glyph-settle ${DURATION.stately} ${EASE.settle} 90ms backwards }`,
  /*
    ⚠️ AND SIX MARKS WHERE THE WHOLE SELF MOVING *IS* THE PURPOSE — a cog turns,
    a coin flips, a star twinkles, a person nods, something is generated, a
    catalogue is refreshed. These are still lucide's, and that is correct:
    drawing our own to move them the same way would be a bespoke icon nobody
    could tell from the library's, which is cost with no picture.

    ⚠️ NONE OF THEM USES `both` ANY MORE, AND THAT IS THE FIX. `both` holds the
    LAST keyframe after the animation ends, so a one-way rotation left the mark
    rotated: a cog at sixty degrees, a coin mirrored, a star upside down, beside
    identical marks that had not been pressed. Every keyframe returns to rest
    now, so the fill mode has nothing to hold — and `backwards` alone is what
    keeps the first frame from flashing.
  */
  `[data-glyph="turn"][data-lively="true"] {`,
  `  animation: glyph-turn ${DURATION.stately} ${EASE.travel} backwards }`,
  `[data-glyph="flip"][data-lively="true"] {`,
  `  animation: glyph-flip ${DURATION.stately} ${EASE.travel} backwards }`,
  `[data-glyph="twinkle"][data-lively="true"] {`,
  `  animation: glyph-twinkle ${DURATION.stately} ${EASE.settle} backwards }`,
  `[data-glyph="nod"][data-lively="true"] {`,
  `  animation: glyph-nod ${DURATION.moderate} ${EASE.settle} backwards }`,
  /* ⚠️ WHAT A MODEL MADE, AND ONLY THAT — see `LIVELY`. The one character
     reserved to a meaning rather than to a shape. */
  `[data-glyph="spark"][data-lively="true"] {`,
  `  animation: glyph-spark ${DURATION.stately} ${EASE.settle} backwards }`,
  `[data-glyph="round"][data-lively="true"] [data-part="round"] {`,
  `  animation: glyph-round ${DURATION.stately} ${EASE.travel} backwards }`,
  /* ⚠️ THE CLOTH, NOT THE POLE — a flag drawn as one shape and nudged is a
     picture of a flag being carried. */
  `[data-glyph="lift"] [data-part="cloth"] { transform-origin: left center }`,
  `[data-glyph="lift"][data-lively="true"] [data-part="cloth"] {`,
  `  animation: glyph-lift ${DURATION.stately} ${EASE.settle} backwards }`,
  `@media (prefers-reduced-motion: reduce) {`,
  `  [data-glyph], [data-glyph] [data-part] { animation: none !important }`,
  `}`,
  `[data-reduce-motion="true"] [data-glyph],`,
  `[data-reduce-motion="true"] [data-glyph] [data-part] { animation: none !important }`,
].join("\n");

/* ----------------------------------------------------------------- opening --- */

/**
 * THE CURTAIN — the one screen that is nothing but the name and a wait.
 *
 * ⚠️ THE LETTER TURNS, NOT A SPINNER BESIDE IT. `One` begins with a closed round
 * counter, which is already the shape every loading indicator in software is
 * drawn as — so the mark does not need one added, it needs one revealed. What
 * moves is a bright run of the O's own stroke; the letter stays a letter, and
 * the wait is expressed by the word rather than announced next to it.
 *
 * ⚠️ THE DASH TRAVELS, THE SHAPE DOES NOT. A rotation is what a round spinner
 * does and it is wrong here: the O is an ELLIPSE (see `parts/opening.tsx`, where
 * the measurements are), and an ellipse turned through 360 degrees is a bowl
 * tumbling — a letter falling over rather than a letter with a highlight going
 * round it. Offsetting the dash moves the visible run along an outline that
 * stays exactly where it was.
 *
 * ⚠️ ONE ANIMATION, LINEAR, FOREVER. Every alternative is the same mistake: an
 * eased offset looks like it is catching on something, a pulsing opacity is a
 * second thing moving, and a dash that lengthens and shortens is the browser's
 * own spinner wearing our letter. A constant travel is the only one that
 * survives being watched for eight seconds, which is the state this screen is
 * FOR — and the ellipse eases it anyway, because the same length of dash covers
 * the flat top faster than the tight sides.
 *
 * ⚠️ AND UNDER EITHER REDUCED-MOTION SETTING THE O IS SIMPLY AN O. The arc is
 * hidden and the ring behind it comes up to full ink — a complete letterform,
 * not a broken one, which is what stopping a travelling arc leaves. Something
 * that holds still has to still be a thing.
 */
/**
 * ⚠️ HOW LONG A LINE STAYS UP, AND HOW LONG IT TAKES TO GO. Numbers rather than
 * CSS strings, because the curtain has to run the same two beats from a timer —
 * a hold that a stylesheet cannot express and a fade that it can. Written twice
 * they drift, and the symptom is a line that starts leaving before the one
 * before it has gone.
 *
 * ⚠️ THE HOLD IS FOR READING, NOT FOR PACING. Nine words is about a second and a
 * half at a glance; under two seconds the line is a ticker and somebody feels
 * hurried on the one screen where they have nothing to do. Three and a bit
 * leaves a beat after the sentence has landed, which is the difference between
 * a caption changing and a title card.
 *
 * ⚠️ AND THE FADE IS `stately`, the longest curve in the scale. This is the one
 * place that is an impression rather than a step, so the number that is a tax
 * everywhere else is the point here.
 */
export const SAID = {
  hold: 3200,
  fade: 560,
} as const;

export const OPENING_MOTION = [
  /* ⚠️ `pathLength` MAKES THIS 100 THE WHOLE OUTLINE, so the keyframe is a
     percentage and not a perimeter — see `RUN`. */
  `@keyframes opening-turn { to { stroke-dashoffset: -100 } }`,
  `[data-opening="arc"] {`,
  `  animation: opening-turn ${DURATION.turn} ${EASE.steady} infinite;`,
  `}`,
  /*
    ⚠️ THE LINE GOES ALL THE WAY OUT BEFORE THE NEXT ONE COMES IN, and that is
    the whole difference between a title card and a caption changing. A
    cross-dissolve puts two sentences on the screen at once for a third of a
    second — legible enough to start reading the wrong one — and on a dark ground
    the overlap reads as a smear. Out, a beat of nothing, in.

    ⚠️ AND THE TEXT IS SWAPPED WHILE IT IS AT ZERO, so there is no frame where
    the old words and the new ones are both drawn.
  */
  `[data-said] {`,
  `  transition: opacity ${DURATION.stately} ${EASE.plain};`,
  `}`,
  `[data-said="gone"] { opacity: 0 }`,
  /* ⚠️ STILL A LETTER WHEN IT STOPS. Hiding the arc and lifting the ring is one
     swap, so there is no moment where the O is both faint and broken. */
  `@media (prefers-reduced-motion: reduce) {`,
  `  [data-opening="arc"] { animation: none; opacity: 0 }`,
  `  [data-opening="ring"] { opacity: 1 }`,
  /* ⚠️ AND THE LINE STOPS CHANGING AT ALL — see `Opening`. The transition going
     is not enough on its own: a sentence REPLACED without a fade is a harder cut
     than the fade it was meant to spare somebody. */
  `  [data-said] { transition: none }`,
  `}`,
  `[data-reduce-motion="true"] [data-opening="arc"] { animation: none; opacity: 0 }`,
  `[data-reduce-motion="true"] [data-opening="ring"] { opacity: 1 }`,
  `[data-reduce-motion="true"] [data-said] { transition: none }`,
].join("\n");
