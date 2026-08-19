/**
 * THE SKELETON IS THE SCREEN SOMEBODY SAW LAST TIME.
 *
 * ⚠️ A PLACEHOLDER PICKED FROM A SHAPE IS A PLACEHOLDER FOR A DIFFERENT PAGE.
 * Eight presets stand in for twenty-odd screens, so a console page of three
 * headed cards holding one, two and two rows waits behind one un-headed card of
 * four rows with a face on each — the right VOCABULARY and the wrong drawing. It
 * is the fault a skeleton exists to prevent, wearing the fix's clothes: the
 * content lands, every block is in a different place, and the whole page jumps.
 *
 * ⚠️ SO IT IS MEASURED, NOT DECLARED, AND NOT GENERATED EITHER. Declaring one
 * per screen is twenty declarations that go stale the first time a card is
 * added — the class of drift this repository has the most of. Generating them
 * from the source needs a script that can predict how a component composes,
 * which is the thing nobody can do statically, and it would be a build artefact
 * describing a page that may have changed since. Reading the real DOM after the
 * real render is exact by construction and cannot go stale: what is remembered
 * is what was drawn.
 *
 * ⚠️ AND IT IS THE FIRST VISIT THAT IS THE HONEST LIMIT. Nothing has been drawn
 * yet, so there is nothing to remember and the screen falls back to its shape's
 * own skeleton — the behaviour that shipped before this file. Every visit after
 * that, including the cold boot after a reload, is exact.
 */

import * as React from "react";
import { Skeleton } from "@heroui/react";
import { CARD_ROWS, ROW, SPACE } from "../tokens/metrics.js";
import { Group } from "./surfaces.js";

/**
 * ⚠️ THREE FACTS PER BLOCK AND NOT THE MARKUP. A skeleton that copied the real
 * subtree would be the previous page's CONTENT greyed out — somebody's name in a
 * blur, which is both wrong and a small privacy problem in a shared session.
 * What is kept is geometry: was there a heading, how many rows, how tall.
 */
export interface Block {
  /**
   * ⚠️ THE HEADING'S HEIGHT, NOT WHETHER THERE IS ONE. A `Section` is a name and
   * sometimes a line under it, so "has a heading" is two different heights — and
   * a bar drawn at the wrong one moves the card under it by twenty pixels, which
   * is the jump this whole file exists to remove. Zero means none.
   */
  readonly head: number;
  readonly rows: number;
  readonly height: number;
}

/**
 * ⚠️ BOUNDED IN BOTH DIRECTIONS, BECAUSE THIS IS READ BACK AND RENDERED. A
 * stored value is a value some other version of the app wrote, so a block count
 * or a height out of range is not a bug to trust — it is a page of ten thousand
 * skeleton rows. Clamping is cheaper than validating and cannot throw.
 */
const MOST_BLOCKS = 10;
const MOST_ROWS = 12;
const TALLEST = 2000;

const clamp = (n: number, most: number) =>
  Number.isFinite(n) ? Math.max(0, Math.min(most, Math.round(n))) : 0;

/* ------------------------------------------------------------------ read --- */

/**
 * ⚠️ THE LAST `[data-blocks]` IN THE DOCUMENT, AND THE OVERLAY IS WHY. OneSpace
 * is a modal in a portal at the end of `<body>`, over a product that is drawing
 * its own screen underneath — so the FIRST match is a page nobody is looking at.
 * Same convention as `travel()`, for the same reason.
 */
const shapeNow = (): readonly Block[] => {
  const all = document.querySelectorAll<HTMLElement>("[data-blocks]");
  const host = all.length ? all[all.length - 1] : null;
  if (!host) return [];
  /* ⚠️ `Array.from`, not a spread — `HTMLCollection` is iterable in every
     browser and is typed as iterable only under a DOM lib that the reference
     app's stricter config does not enable. */
  return Array.from(host.children).slice(0, MOST_BLOCKS).map((block) => {
    /* ⚠️ A heading is an `h2` — the one `Section` draws, and the only one a
       screen's top-level block can carry. Its BLOCK is what is measured, because
       the line under the name belongs to the heading. */
    const head = block.querySelector("h2")?.parentElement ?? null;
    return {
      head: head ? clamp(head.getBoundingClientRect().height, TALLEST) : 0,
      rows: clamp(block.querySelectorAll("[data-row]").length, MOST_ROWS),
      height: clamp(block.getBoundingClientRect().height, TALLEST),
    };
  });
};

/* ----------------------------------------------------------------- keep --- */

const AT = "one.shape.";

/**
 * ⚠️ SESSION STORAGE, NOT MEMORY, AND THE RELOAD IS THE WHOLE POINT. A cold boot
 * is the longest wait in the product and the one place a skeleton earns its
 * keep; a value that lives in a module would be gone at exactly that moment. It
 * is per tab and per session, so it never becomes a stale artefact somebody has
 * to think about clearing.
 *
 * ⚠️ AND EVERY ACCESS IS GUARDED. Storage throws on a full quota and in a
 * private window in more than one browser, and a placeholder is the last thing
 * in the product that may take a screen down with it.
 */
const keep = (key: string, blocks: readonly Block[]): void => {
  try { sessionStorage.setItem(AT + key, JSON.stringify(blocks)); } catch { /* full */ }
};

const recall = (key: string): readonly Block[] | null => {
  try {
    const held = sessionStorage.getItem(AT + key);
    if (!held) return null;
    const read = JSON.parse(held) as readonly Block[];
    return Array.isArray(read) && read.length ? read.slice(0, MOST_BLOCKS) : null;
  } catch { return null; }
};

/**
 * ⚠️ THE ADDRESS IS THE SCREEN'S IDENTITY, AND ASKING FOR IT IS NOT ROUTING.
 * This package has no route table and is not getting one; what it needs is a
 * name for "the surface being drawn right now", and the path is the one every
 * app already agrees on. A title would collide — several screens are called
 * Settings — and a prop would be one more thing twenty screens can forget.
 */
const here = (): string => (typeof location === "undefined" ? "" : location.pathname);

/* ---------------------------------------------------------------- render --- */

/**
 * WHAT WAS THERE LAST TIME, IN BARS.
 *
 * ⚠️ THE HEADING IS OUTSIDE THE CARD AND THE ROWS ARE INSIDE IT, which is where
 * `Section` and `Group` put them — a skeleton that draws the heading inside the
 * card is a placeholder for a layout this product does not have, and the content
 * moves up eight pixels on every block when it lands.
 */
export function ShapeWaiting({ blocks }: { readonly blocks: readonly Block[] }) {
  return (
    <div className={`flex flex-col ${SPACE.roomy}`} role="status" aria-label="Loading">
      {blocks.map((block, i) => (
        /*
          ⚠️ THE BLOCK IS DRAWN AT EXACTLY THE HEIGHT IT WAS, AND CLIPPED TO IT.
          Everything inside is an approximation — a row placeholder is not a row,
          a heading bar is not a sentence — and approximations compose into a
          column that is sixty pixels short, which is the jump again. Fixing the
          OUTER box makes the total exact whatever the contents come to, and the
          contents are then free to look like the screen rather than to add up.
        */
        <div
          key={i}
          className={`flex flex-col ${SPACE.tight} overflow-clip`}
          style={{ height: block.height || undefined }}
        >
          {block.head > 0
            ? (
              <div className={`flex shrink-0 flex-col justify-center ${SPACE.hair}`}
                style={{ height: block.head }}
              >
                {/* ⚠️ `h-5` is `TYPE.section`'s line and `h-3` is the note under
                    it, so a one-line heading and a two-line one are drawn as
                    what they are rather than as one bar of an averaged size. */}
                <Skeleton className="h-5 w-2/5 rounded-full" />
                {block.head > 30 ? <Skeleton className="h-3 w-3/5 rounded-full" /> : null}
              </div>
            )
            : null}
          {block.rows > 0
            ? (
              <Group>
                {Array.from({ length: block.rows }, (_, r) => (
                  <div key={r} className={`flex items-center ${ROW.gap} ${ROW.tap} ${ROW.pad}`}>
                    <div className={`flex min-w-0 grow flex-col ${SPACE.tight}`}>
                      <Skeleton className="h-4 w-2/5 rounded-full" />
                      <Skeleton className="h-3 w-3/5 rounded-full" />
                    </div>
                  </div>
                ))}
              </Group>
            )
            : (
              /*
                ⚠️ A BLOCK WITH NO ROWS IS ONE SHAPE. Some of them are a grid of
                figures, a chart, a paragraph — shapes a row placeholder would
                misrepresent completely — and there is nothing to be gained by
                guessing which. It fills what is left of the block.
              */
              <Skeleton className={`w-full grow rounded-3xl ${CARD_ROWS}`} />
            )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ hook --- */

/**
 * REMEMBER WHAT THIS SCREEN DREW, AND HAND BACK WHAT IT DREW LAST TIME.
 *
 * ⚠️ IT RECORDS ONLY WHEN THE SCREEN IS SHOWING CONTENT. Measuring while it is
 * still waiting would remember the skeleton — which is a placeholder that
 * converges on a picture of itself, and after two visits every screen in the
 * product waits behind whatever the preset happened to draw the first time.
 *
 * ⚠️ AND IT MEASURES AFTER PAINT, ON PURPOSE. `useEffect` runs once the browser
 * has laid the blocks out, so `getBoundingClientRect` is the real height rather
 * than zero. The arrival stagger moves blocks with a transform, which does not
 * change any of the three numbers here.
 */
export function useRecalledShape(ready: boolean): readonly Block[] | null {
  /* ⚠️ Read once, at mount, and held. Re-reading on every render would swap the
     skeleton under somebody the moment this screen records its own shape. */
  const [was] = React.useState(() => recall(here()));
  React.useEffect(() => {
    if (!ready) return;
    const blocks = shapeNow();
    if (blocks.length) keep(here(), blocks);
  }, [ready]);
  return was;
}
