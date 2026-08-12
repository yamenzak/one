/**
 * A STACK — one level of a journey, and the movement between its screens.
 *
 * ⚠️ THE MOVEMENT BELONGS TO THE JOURNEY, NEVER TO THE SCREEN. A screen has no
 * business knowing whether it was reached by pressing a row on the surface behind
 * it or by a shortcut from somewhere else in a product — those are the same
 * screen, and a screen that carried its own entrance would play a return-to-the-
 * parent movement while arriving over an app that was never its parent. So the
 * direction is derived HERE, from how the level changed, and the screens below
 * declare nothing.
 *
 * ⚠️ WHICH MAKES ARRIVING BY SHORTCUT THE DEFAULT RATHER THAN A CASE. There is no
 * movement on the first render at all: whatever presented this level did the
 * arriving, and adding a second one over the top of it would be two things
 * arriving at once. A stack only ever animates a CHANGE.
 *
 * ⚠️ A LEVEL HAS A ROOT AND ONE SCREEN AT A TIME, which is what a hub is, and it
 * is why `null` is a value rather than an absence. Leaving the root is onward;
 * returning to it is back. A level with more depth than that is a stack inside a
 * stack — they nest, and each one only ever knows its own step.
 *
 * ⚠️ EACH SCREEN IS ITS OWN SCROLLER, AND COMING BACK PUTS YOU WHERE YOU WERE.
 * One scroller behind both would have to be forced to the top on the way in, and
 * could not be put back on the way out without dragging the screen still on its
 * way off along with it. Separate scrollers make the restore a number written to
 * an element nothing else is looking at — invisible, because it happens before the
 * frame is painted.
 *
 * ⚠️ AND ONLY THE STEP JUST TAKEN IS REMEMBERED. The offset is consumed by the
 * screen it belongs to, so coming BACK to a half-read list resumes it and going
 * ONWARD to a screen visited earlier starts at the top, which is what each of
 * those two actions means. Keeping every offset forever would make the second one
 * open somewhere in the middle for a reason nobody could reconstruct.
 */

import { useRef, useState, type ReactNode } from "react";

/**
 * ⚠️ NAMED FOR THE JOURNEY, NOT FOR THE MECHANISM. `push` and `pop` are a data
 * structure's words for it; what a person is doing is going onward into something
 * or coming back out of it, and that is also the only thing the direction has to
 * agree with.
 */
export type Move = "onward" | "back";

export interface StackProps {
  /**
   * WHICH SCREEN OF THIS LEVEL IS SHOWING — `null` for the level's own root.
   *
   * ⚠️ IT IS AN IDENTITY, NOT A NUMBER. The value is compared for change and used
   * as the reconciliation key, so two different screens must never share one: they
   * would be reconciled as the same element, and the second would inherit the
   * first's form state on the way in.
   */
  readonly at: string | null;
  /** The screen for `at`, as the caller already renders it. */
  readonly children: ReactNode;
}

interface Leaving {
  readonly key: string;
  readonly node: ReactNode;
}

export interface Level {
  readonly at: string | null;
  /**
   * ⚠️ HOW THE SCREEN SHOWING NOW ARRIVED, AND IT OUTLIVES THE MOVEMENT. It is
   * what suppresses the section stagger inside a screen that travelled — a screen
   * travelling in whose contents also rise one after another is two movements — and
   * that decision does not stop being true when the travel finishes. Clearing it
   * with the movement would hand every section an entrance to play half a second
   * after the screen had already arrived.
   */
  readonly move: Move | null;
  readonly leaving: Leaving | null;
}

/**
 * THE WHOLE DECISION, AS A FUNCTION — which way this step goes, and what is on
 * the surface while it goes there.
 *
 * ⚠️ IT IS SEPARATE FROM THE RENDERING BECAUSE IT IS THE HALF THAT CAN BE WRONG
 * WITHOUT ANYTHING FAILING. A movement in the wrong direction is still a movement;
 * a screen remounted on its way out still animates. Everything below is a rule
 * somebody could reasonably "simplify" into a version that looks identical in a
 * screenshot and is wrong in use, so each one is stated here and checked.
 */
export function stepTo(level: Level, at: string | null, node: ReactNode): Level {
  /* ⚠️ NOTHING TO DO IS NOTHING TO DO. Returning a new level for an unchanged
     `at` would replay the arrival on every render of the screen. */
  if (level.at === at) return level;
  return {
    at,
    move: directionOf(level.at, at),
    leaving: { key: keyOf(level.at), node },
  };
}

/**
 * WHICH WAY THE STEP GOES.
 *
 * ⚠️ IT WAS "IS THE DESTINATION THE ROOT", AND THAT IS ONLY RIGHT FOR A FLAT
 * LEVEL. The moment a level had three depths — a list, a product, a document —
 * leaving the document for its product was a destination that is not the root, so
 * it played the ONWARD movement: the screen you were returning to slid in from the
 * far side, over the one you were leaving, which is the picture of going deeper.
 * Nothing failed, every test passed, and the surface simply felt wrong in the one
 * direction people use most.
 *
 * ⚠️ THE KEY IS A PATH, SO DEPTH IS READABLE FROM IT. Every `at` in this platform
 * is printed by a router as slash-separated segments, and an ancestor is a prefix.
 * That makes the rule one comparison rather than a hierarchy the stack would have
 * to be told about — and for a flat level, where no key is a prefix of another, it
 * is exactly the old behaviour.
 *
 * ⚠️ SIDEWAYS IS ONWARD. Two screens at the same depth are neither ancestor nor
 * descendant, and moving between them is a fresh push: that is what pressing
 * something on a surface is, and it is the one case where either answer is
 * defensible and consistency is worth more than either.
 */
export function directionOf(from: string | null, to: string | null): Move {
  if (to === null) return "back";
  if (from === null) return "onward";
  return from.startsWith(`${to}/`) ? "back" : "onward";
}

interface Leaf {
  readonly key: string;
  readonly node: ReactNode;
  readonly going: boolean;
}

/**
 * ⚠️ ONE KEYED ARRAY, NEVER TWO SIBLING SLOTS. Written as a conditional beside a
 * fixed child, React reconciles by POSITION first: the screen on its way out lands
 * in a slot that held nothing a moment ago, so it is mounted afresh — every field
 * on it clears and every effect re-runs, in full view, for the whole length of the
 * movement it is playing. As one array they are matched by key, and the screen
 * leaving is the same instance that was there before.
 *
 * ⚠️ AND THE ONE ARRIVING IS LAST, so it paints over the one leaving without a
 * z-index for the common direction. Coming back is the exception and says so in
 * the sheet.
 */
export function leavesOf(level: Level, node: ReactNode): readonly Leaf[] {
  return [
    ...(level.leaving ? [{ key: level.leaving.key, node: level.leaving.node, going: true }] : []),
    { key: keyOf(level.at), node, going: false },
  ];
}

export function Stack({ at, children }: StackProps): ReactNode {
  const [level, setLevel] = useState<Level>({ at, move: null, leaving: null });
  /*
    ⚠️ THE SCREEN ON ITS WAY OUT IS A SNAPSHOT, WHICH IS WHY IT IS HELD IN A REF.
    What has to be captured is the element rendered for the PREVIOUS `at`, at the
    moment `at` changes — and by then the caller has already handed over the new
    one. Keeping it in state instead would make every render of the visible screen
    a render of the stack, which is a re-render of a whole level every keystroke in
    a field on it.
  */
  const showing = useRef<ReactNode>(children);
  /** The element the visible screen is scrolling in, and where it had got to. */
  const live = useRef<HTMLDivElement | null>(null);
  const resume = useRef(new Map<string, number>());

  if (level.at !== at) {
    /*
      ⚠️ READ HERE BECAUSE HERE IS THE LAST MOMENT IT IS TRUE. This is the one
      render in which the DOM still holds the screen being left, so its scroll
      offset still exists to be read; an effect runs after the swap and would
      measure the screen that replaced it. It is a read of a live value and
      nothing is written, which is what makes it safe to do while rendering.
    */
    resume.current.set(keyOf(level.at), live.current?.scrollTop ?? 0);
    setLevel(stepTo(level, at, showing.current));
  }
  showing.current = children;

  return (
    <div className="stack">
      {leavesOf(level, children).map((leaf) => (
        <div
          key={leaf.key}
          className="stack-leaf"
          data-scroll=""
          /* ⚠️ A CALLBACK REF, BECAUSE IT HAS TO LAND BEFORE THE FRAME IS PAINTED.
             React runs these during the commit, with the element already in the
             document and nothing drawn yet — so the screen is at the offset it was
             left at from its very first painted frame. An effect would run one
             frame later, which is a visible jump on exactly the screens long
             enough for any of this to matter. */
          ref={(node) => {
            if (leaf.going) return;
            live.current = node;
            const back = node && resume.current.get(leaf.key);
            if (node && back !== undefined && back !== null) {
              resume.current.delete(leaf.key);
              node.scrollTop = back;
            }
          }}
          data-move={level.move ?? undefined}
          data-going={leaf.going ? "" : undefined}
          /* ⚠️ THE ONE ON ITS WAY OUT IS INERT, not merely unclickable. It holds
             the focus at the moment the movement starts, so without this a
             keyboard is left inside a screen that is halfway off the surface. */
          inert={leaf.going}
          onAnimationEnd={(e) => {
            /* ⚠️ ANIMATIONS BUBBLE, and everything inside a screen has one. Left
               unchecked, the first icon to finish drawing itself takes the screen
               that is still leaving off the surface. */
            if (e.target !== e.currentTarget) return;
            setLevel((l) => (l.leaving ? { ...l, leaving: null } : l));
          }}
        >
          {leaf.node}
        </div>
      ))}
    </div>
  );
}

/**
 * ⚠️ THE ROOT AND A SCREEN CANNOT COLLIDE, BY CONSTRUCTION RATHER THAN BY CHOICE.
 * A React key is a string and `at` is a string, so any single reserved word for
 * the root is a word some screen may one day be called — and the collision is not
 * an error anywhere: the two are reconciled as one element, so the screen arriving
 * inherits the form state of the root it is replacing. Two namespaces, one
 * character apart, and the question stops being askable.
 */
const keyOf = (at: string | null): string => (at === null ? "/" : `:${at}`);
