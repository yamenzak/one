/**
 * WHAT PINS ITSELF TO AN EDGE — the docked action and the nav island.
 *
 * ⚠️ A SCREEN HAS A `Docked` OR AN `Island`, NEVER BOTH. They pin to the same
 * place and overlap, which the catalogue demonstrated the first time it rendered
 * them together — and it is the right rule for a second reason: a screen with one
 * unmistakable action is not one somebody should be navigating away from
 * mid-decision.
 *
 * ⚠️ BOTH ARE DECLARED, NEVER WRAPPED. `heroui.test.mjs`'s `dock:` fails on a
 * `Docked` outside this directory, because a screen that pins its own control
 * decides where the product's one action lives.
 */

import * as React from "react";
import { PRIMARY_MAX, screenFor } from "@engine/kernel";
import { Button } from "@heroui/react";
import {
  DOCK_ACT, DOCK_PLATE, GUTTER, ICON, ISLAND_HERE, ISLAND_ITEM, ISLAND_ITEM_MAX, ISLAND_PAD, PAD, ROW,
  SAFE_BOTTOM, SPACE, WIDTH,
} from "../tokens/metrics.js";
import type { Width } from "../tokens/metrics.js";
import { MOTION, transition, useStill } from "../tokens/motion.js";
import { TYPE } from "../tokens/type.js";
import { Pip } from "../parts/beside.js";
import { Band } from "./page.js";
import { useScrolling } from "./scrolling.js";

/**
 * THE ACTION A WHOLE SCREEN EXISTS FOR, PINNED WHERE A THUMB IS.
 *
 * ⚠️ THIS WAS TWO COMPONENTS AND THEY HAD ALREADY DRIFTED. `StickyAction`, which
 * a screen wrapped by hand, and the bar a `Screen` renders from its `does` —
 * same place, same hem, same job, and they disagreed about both things there
 * were to disagree about: one was `max-w-md` and the other took the shape's own
 * width, one showed on a desktop and the other did not. Nothing made them agree,
 * because nothing knew they were the same thing.
 *
 * ⚠️ A LONG SCREEN WITH ITS ONLY CONTROL AT THE BOTTOM IS A SCREEN PEOPLE DO NOT
 * FINISH. The roster shipped "Invite somebody" as the last row of the roster:
 * fine with three people, invisible with thirty — whoever is at the bottom
 * scrolls to the top to act, or whoever is at the top scrolls to the bottom, and
 * which of the two happens was never decided by anybody.
 *
 * ⚠️ IT IS THE PHONE HALF OF ONE ACT, WHICH IS WHY IT IS ALWAYS `md:hidden`. The
 * crown carries the same `does` above the breakpoint, where the eye already is;
 * a bar welded across the bottom of a wide window is a mobile pattern wearing a
 * desktop's clothes. One declaration, both answers — so this is never the whole
 * story of an action and must not be reachable on its own.
 *
 * ⚠️ AND IT IS NOT EXPORTED PAST THE FRAME, ENFORCED BY A GUARD. Reachable from
 * a screen it is a way to pin a button that skips every rule the declaration
 * carries: no dock over a skeleton, none over a refusal, and none over an empty
 * state that already offers the same words. A hand-rolled dock has all three.
 *
 * ⚠️ `pb-[env(safe-area-inset-bottom)]` IS NOT OPTIONAL. Without it the control
 * sits under the home indicator on every modern phone.
 *
 * ⚠️ A SCREEN HAS THIS OR AN `Island`, NEVER BOTH — and the rule survived being
 * overridden, which is the best evidence for it. For one day a product screen
 * rendered both: they pin to the same place, so the dock was lifted onto the nav
 * and given a higher layer to escape its hem. The result was 180px of an 844px
 * phone in two objects with a gap between them, and a content column reserving
 * room for one of them — so the last row of the last card sat under the other
 * permanently, at the top of the scroll and still at the bottom of it.
 *
 * ⚠️ THE ACT GOES IN THE BAR INSTEAD (`Island.act`). `Screen` draws this only
 * when nothing above it has taken the act, which is the standalone case: a
 * screen with no shell around it, where there is no nav to share the foot of the
 * page with.
 */
export function Docked({ width = "read", children }: {
  readonly width?: Width;
  readonly children: React.ReactNode;
}) {
  return (
    /* ⚠️ THE SAME HEM THE NAV WEARS, because it is the same fault: content
       arriving at a docked control's edge and being sliced by it. */
    <div
      data-hem="bottom"
      className={`sticky bottom-0 z-10 w-full md:hidden ${PAD} ${SAFE_BOTTOM}`}
    >
      {/* ⚠️ THE SHAPE'S OWN WIDTH, NOT A WIDTH OF ITS OWN. `max-w-md` was the
          hand-rolled half's answer, so a docked action on a `work`-width screen
          sat narrower than everything above it. */}
      <Band bleed="hold" width={width}>{children}</Band>
    </div>
  );
}

/**
 * THE NAV — five destinations maximum (D10), and only where you are says its
 * name.
 *
 * ⚠️ FIVE ICON-AND-LABEL COLUMNS DO NOT FIT A PHONE, AND THAT WAS THE OLD BAR.
 * Equal columns mean every label is squeezed to a fifth of the screen, so a
 * two-word destination truncates and a five-item nav is five abbreviations. The
 * bar that works is COMPACT: every destination is its icon, and the ONE somebody
 * is on expands to say so. Four glyphs and one named item fit at any width, and
 * the label that is showing is the only one anybody needs — a person does not
 * read the nav to find out where they are not.
 *
 * ⚠️ IT IS A PLATE, AND IT IS THE ONE OBJECT IN THE PRODUCT THAT NEVER GOES
 * AWAY. There was no surface here at all for a while, and the reason was sound:
 * a capsule the width of its own content left the page's next row visible in the
 * gaps either side, sliced by its rounded ends — a face cut in half, a heading
 * reappearing beside the bar. What fixed that is the HEM, which is full width
 * and dissolves the content before it arrives; removing the plate as well was
 * one change too many, and what it left was four grey glyphs and a white one
 * standing on the page.
 *
 * ⚠️ THE PLATE IS DARK IN BOTH THEMES (`DOCK`), so everything on it is light in
 * both and the dock is one object rather than two that share a shape. That is
 * also what lets a destination be a CIRCLE: on the page's own ground a ring
 * around a glyph is an edge, which D7 refuses; on a plate it is a hole in a
 * surface.
 *
 * ⚠️ AND WHERE YOU ARE IS STILL INK PLUS A LIGHT, not a second surface. A pill
 * inside the plate would be a plate on a plate — the shape this design spent a
 * pass removing — so the active destination keeps the brand-lit glyph and the
 * one open word, now read against the dock's own ink rather than the page's.
 *
 * ⚠️ THE EXPANSION IS THE TRAVEL, WHICH REPLACES A PILL THAT SLID. There was one
 * absolutely-positioned pill stepping by `index × 100%` of an equal column, and
 * the argument for it was that a single element MOVING says two destinations are
 * on one shelf while four backgrounds switching on and off do not. That argument
 * still holds and this is a better answer to it: nothing jumps, because the word
 * grows out of one item while the one before it closes — the motion is
 * continuous and it IS the label. It also needs no measuring, no ref and no
 * resize observer, which the equal-column pill only avoided by forcing every
 * item to the same width in the first place.
 *
 * ⚠️ IT DOES NOT LEAVE, AND THAT IS THE SAME DECISION THE CROWN MAKES. The bar
 * used to translate out while somebody scrolled down and come back on the way
 * up, on the argument that reading and navigating are different moments. The
 * crown never did — it sits, and its hem dissolves what passes under it — and
 * the two ends of one screen behaving differently is what a person actually
 * notices: one edge of the product is furniture and the other is a thing that
 * moves. The hem is what handles content arriving at a control, at both ends,
 * so a bar that also hides is a second answer to a question already answered.
 *
 * ⚠️ AND THE LABEL GOES TO ZERO WIDTH, NEVER TO `display: none`. A nav that
 * removed its labels from the accessibility tree would be five unnamed buttons
 * to anybody using a screen reader — the one group for whom the icon carries
 * nothing at all.
 *
 * ⚠️ THE KERNEL REFUSES A SIXTH ITEM, and this slices too: a deployment
 * rendering a manifest it did not compose must not draw one either.
 *
 * ⚠️ AND FIVE IS A CEILING ON WHAT FITS, NOT ON WHAT AN APP MAY HAVE. The rule
 * was read as the second thing for as long as there was no way to say the first:
 * a product with twelve destinations drew five and the other seven existed on a
 * desktop rail alone, which on a phone is not a compromise, it is an absence.
 */
export function Island({ items, here, onGo, act, only }: {
  readonly items: readonly {
    readonly id: string; readonly label: string;
    readonly icon: React.ReactNode; readonly route: string;
    /** ⚠️ A dot, never a count. At this size a number is unreadable, and what
        the nav owes is "something happened here", not how much. */
    readonly unread?: boolean;
  }[];
  readonly here: string;
  readonly onGo: (route: string) => void;
  /**
   * THE SCREEN'S ONE ACTION, INSIDE THE BAR RATHER THAN ON A SECOND ONE.
   *
   * ⚠️ THIS IS WHY `Docked` AND `Island` NEVER APPEAR TOGETHER, and that rule is
   * `Docked`'s own — it was overridden for one day and the day is instructive.
   * Stacked, the two of them were 180px of an 844px phone with a gap between
   * them, which reads as two floating objects rather than as the foot of the
   * screen; and the content column reserved room for one of them, so the last
   * row of the last card was under the other permanently.
   *
   * ⚠️ THE ACT IS THE ONE THING IN THE BAR WEARING A WORD. Today that is the
   * destination somebody is on; with an act it is the act, because the crown
   * already says where they are and the bar is at the thumb. Two labels in a
   * 358px bar is a bar with no primary.
   *
   * ⚠️ AND IT TAKES THE ROOM THAT IS LEFT, TRUNCATING. Five destinations and a
   * four-word verb do not fit a phone; the honest degradation is a shorter
   * label rather than a dropped destination or a bar that wraps.
   */
  readonly act?: {
    readonly label: string;
    readonly icon?: React.ReactNode;
    readonly onDo: () => void;
    readonly tone?: "danger";
    readonly disabled?: boolean;
  };
  /**
   * ⚠️ THE BREAKPOINT IS A PROP BECAUSE A WRAPPER BREAKS `sticky`, AND THAT IS
   * NOT A STYLE OPINION — it is the bug this parameter exists to remove. A
   * sticky element can never leave its own PARENT's box, and the `md:hidden`
   * div the shell used to wrap this in is exactly the nav's own height. Eighty
   * eight pixels of travel is none: the bar sat at the end of the document and
   * scrolled away with the content, on every product screen, for as long as
   * there had been one.
   *
   * ⚠️ AND IT LOOKED CORRECT THE WHOLE TIME. Every screen was shorter than a
   * viewport, so the bar's natural position WAS the bottom of the screen —
   * there was nothing to pin it against and nothing to give it away. The first
   * long page is where it would have been reported, by somebody, as the nav
   * disappearing.
   */
  readonly only?: "phone";
}) {
  /* ⚠️ ALL FIVE, BECAUSE THERE IS NOTHING ELSE TO HOLD. One slot used to be
     spent on an item that opened a sheet of everywhere else; a screen is a
     destination or it belongs to a subject now, so the bar is the whole
     navigation and the ceiling is a ceiling on destinations rather than on
     destinations-plus-a-door. */
  const shown = items.slice(0, PRIMARY_MAX);
  /*
    ⚠️ ONE ANSWER TO "WHERE AM I", AND ASKING EACH ITEM SEPARATELY IS NOT IT.
    `isUnder` was asked per row, so every item whose route the address sits under
    marked itself — and a product's ROOT is under everything in it. The literal
    string `/` is excluded by `isUnder` itself, which is why this was invisible
    in the fixture: the ground mounts the shell with an app's OWN routes, where
    home really is `/`. The deployment mounts it with the same screens PREFIXED
    (`/inventory`, `/inventory/count`), and `/inventory` is a prefix of every
    address in the product — so home and the screen somebody was actually on
    were both lit, with both labels open.
    Two open words do not fit a phone: they push the row past its own width, and
    the nav is `overflow-clip`, so the fifth destination was silently cut off the
    right edge. One bar, two lit items, four of five reachable.
    `screenFor` is the same walk the shell already does — longest route wins —
    so there is one answer and this compares against it.
  */
  const at = screenFor(shown, here);

  return (
    <nav
      aria-label="Sections"
      /* ⚠️ THE HEM IS THE NAV'S BACKGROUND — see `ambienceStylesheet`. It is on
         the NAV rather than on the bar inside it, because what has to dissolve
         is the page's own content on its way past, and the bar is only 370px of
         a 402px screen. */
      data-hem="bottom"
      /*
        ⚠️ NOTHING IS CLIPPED HERE ANY MORE, BECAUSE NOTHING MOVES. This carried
        `overflow-clip` for one reason: a TRANSFORMED box still counts toward the
        document's scrollable overflow, so the bar translating past the bottom
        edge made the page taller while it was away and shorter when it came
        back — reach the foot of a long page, move a finger the other way, and it
        jumps upward on its own. With the travel gone the clip has no job, and a
        clip with no job is not free: it is what silently cut a destination off
        the right edge the day two items opened at once.
      */
      className={`sticky bottom-0 z-10 flex items-center justify-center ${SPACE.tight}`
        + ` ${GUTTER} ${PAD} ${SAFE_BOTTOM}`
        + (only === "phone" ? " md:hidden" : "")}
    >
      {/*
        ⚠️ SIZED BY ITS CONTENT, WITH A FLOOR — see `DOCK_PLATE`. It spanned the
        whole column while it had no fill, because a bar of loose glyphs narrower
        than the screen reads as something that did not finish loading. With the
        plate under it the gap either side is what makes it an object; the floor
        is what keeps the outer destinations inside a thumb's reach.

        ⚠️ THE PLATE IS PAINTED BY `[data-island]` IN `ambienceStylesheet`, NOT
        HERE. A component that names a colour is a component a workspace's
        branding never reaches (D7) — and the dock's fill and its ink are a PAIR
        (a light glyph on a dark plate), so they have to be stated together in
        one place or a control added later inherits the page's ink onto a
        near-black surface and is invisible rather than merely wrong.
      */}
      <div
        data-island="true"
        /* ⚠️ `justify-center`, AND IT ONLY DOES ANYTHING BELOW FIVE. With five
           destinations the row fills the bar exactly and this is inert; with
           four or three the closed items hit `ISLAND_ITEM_MAX` and stop
           growing, so there is leftover — and left-packed it all collects at
           the right end, which is a bar with a hole in it rather than a bar
           with fewer items. Centred, the marks keep their pitch and the slack
           splits between the ends. */
        className={`flex ${DOCK_PLATE} ${WIDTH.read} flex-row items-center justify-center`
          + ` ${SPACE.hair} ${ISLAND_PAD}`}
      >
        {shown.map((item) => {
          /* ⚠️ OPEN ONLY WHEN THERE IS NO ACT — see `act`. The bar carries one
             word, and when a screen has something to do it is that. */
          /* ⚠️ THE ONE THE ADDRESS BELONGS TO — see `at`. A detail screen carries
             what it is about (`/thing/t-glove`), so an exact match left the bar
             with nothing marked the moment anybody opened a record; asking each
             item on its own lit two. */
          const isHere = item.route === at?.route;
          /* ⚠️ THE WORD NO LONGER YIELDS TO THE ACT, because the act is no longer
             in the plate. This read `isHere && !act` for as long as the two
             shared a row and one label's worth of width between them — which
             meant the answer to "where am I" went blank on every screen with
             something to do, which is most of them. */
          const open = isHere;
          return (
            <Button
              key={item.id}
              /* ⚠️ ALWAYS `ghost`. Where you are is ink now — `data-here` sets
                 the colour and nothing else — so a variant that painted its own
                 surface would put back the pill this design removed. */
              variant="ghost"
              aria-current={isHere ? "page" : undefined}
              data-here={isHere ? "true" : undefined}
              /* ⚠️ THE OPEN ONE IS CONTENT-SIZED AND THE CLOSED ONES DIVIDE THE
                 REST. `grow basis-0` on the four is what makes them EQUAL rather
                 than merely fair — with the default `basis-auto` flex hands out
                 the leftover after each item's own content, so widths converge
                 without matching, which is worse than obviously wrong because it
                 looks nearly right. */
              /* ⚠️ THE CLOSED ONES ARE WHAT GIVES WAY, AND THAT IS ALREADY
                 DECIDED BELOW BY `grow basis-0 min-w-0`. Measured at 390px with
                 a deliberately unfittable name: the open item takes 212px and
                 the other four shrink to 29 — the row stays inside the bar and
                 no destination is lost. Which matters because the nav clips: a
                 row that overflowed would not wrap or scroll, it would silently
                 drop whatever fell off the right edge. */
              className={`flex-row items-center justify-center ${SPACE.tight} ${ROW.free} `
                + (open ? `shrink-0 ${ISLAND_HERE}` : `shrink-0 ${ISLAND_ITEM}`)
                + (open ? "" : ` grow basis-0 min-w-0 ${ISLAND_ITEM_MAX}`)}
              onPress={() => onGo(item.route)}
            >
              {/* ⚠️ NO HINT HERE, AND THAT IS THE ONE DELIBERATE OMISSION. The
                  nav is the phone half, where a tooltip never fires, and the
                  word is already beside the glyph the moment the item is open. */}
              <Pip on={Boolean(item.unread)}>
                <span
                  aria-hidden="true"
                  className="flex shrink-0 items-center"
                  /* ⚠️ `.button` SIZES ITS OWN SVGS to `size-5 sm:size-4`, so every
                     nav glyph drew at 16–20px under a 14px label — the one place
                     in the product where the word outweighed the mark. */
                  style={{ ["--icon" as string]: `${ICON.nav}px` }}
                >
                  {item.icon}
                </span>
              </Pip>
              {/*
                ⚠️ WIDTH, NOT DISPLAY — see the header. `max-width` from zero is
                what makes the pill GROW rather than appear, and it keeps the
                word in the accessibility tree while it is closed.

                ⚠️ `10rem` IS A CEILING, NOT A WIDTH. A max-width transition needs
                a number to travel to and `auto` is not one; the span is still
                sized by its text, so the ceiling only has to clear the longest
                destination anybody would write.
              */}
              {/*
                ⚠️ THE OPEN LABEL IS NOT `note`, AND THAT IS THE ONE COLOUR BUG
                THIS SHAPE INVITES. `note` is `text-muted` — correct for a
                caption and wrong for the only word in the nav, because a class
                on the span beats the `color` the `data-here` fill sets on the
                button, so the destination somebody IS on read dimmer than the
                icons around it. The word that is showing is the whole point of
                the bar; it takes full ink.
              */}
              {/*
                ⚠️ THE ELLIPSIS BELONGS TO THE OPEN LABEL AND TO NOTHING ELSE. A
                closed item is a word held at zero width on purpose, and an
                ellipsis on it says the layout ran out of room for something
                somebody was meant to read — which is what the geometry sweep
                looks for, and it found four of them in every bar in the product.
                The trim is for a destination whose name is longer than the pill;
                a name that is not showing has not been trimmed.
              */}
              <span
                className={`${TYPE.note} ${isHere ? "text-foreground" : ""}`
                  + ` overflow-hidden whitespace-nowrap leading-none${open ? " text-ellipsis" : ""}`}
                /* ⚠️ TWO INTENTS, NOT ONE — see `MOTION.unfold` / `MOTION.fold`.
                   The word that is leaving is quicker than the word arriving, so
                   the room is free before anything moves into it; at one
                   duration the four closed glyphs visibly shuffle for the whole
                   transition. And `reveal`, which this used, names `max-height`
                   while the bar animates `max-width` — so the width had never
                   been transitioned at all and only the fade was moving. */
                style={{
                  maxWidth: open ? "10rem" : 0,
                  opacity: open ? 1 : 0,
                  transition: open ? MOTION.unfold : MOTION.fold,
                }}
              >
                {item.label}
              </span>
            </Button>
          );
        })}

      </div>

      {/*
        ⚠️ THE ACT IS BESIDE THE PLATE, NOT ON IT — see `DOCK_ACT`. It was inside,
        and being inside cost the bar its one word: the destinations closed
        whenever a screen had something to do, so "where am I" went blank exactly
        on the screens somebody is deepest into. Two objects, two jobs, neither
        yielding.

        ⚠️ IT IS THE ONLY FILLED THING IN THE CHROME, and it is filled with the
        ACCENT, which is monochrome (D7). The product's own colour touches the
        chrome at one point and that point is the light under the active
        destination.

        ⚠️ `min-w-0` WITH A TRUNCATING LABEL, so five destinations and a long verb
        degrade to a shorter verb rather than to a dock that wraps.
      */}
      {act ? (
        <Button
          /* ⚠️ NAMED, BECAUSE THE PLATE PAINTS ITS BUTTONS IN ITS OWN INK — see
             the `[data-island]` rule. It is outside the plate now and so is not
             matched by it, and the attribute is kept anyway: the exclusion is
             what documents that this button owns its colour, and a future dock
             that nests it again would need it back. */
          data-act="true"
          variant={act.tone === "danger" ? "danger" : "primary"}
          isDisabled={act.disabled}
          onPress={act.onDo}
          className={`${DOCK_ACT} min-w-0 flex-row items-center justify-center`
            + ` ${SPACE.tight} ${ROW.free} ${ISLAND_HERE}`}
        >
          {act.icon ? (
            <span
              aria-hidden="true"
              className="flex shrink-0 items-center"
              style={{ ["--icon" as string]: `${ICON.nav}px` }}
            >
              {act.icon}
            </span>
          ) : null}
          {/* ⚠️ NO TYPE CLASS AT ALL, AND THIS IS THE SECOND TIME IN THIS FILE.
              `TYPE.note` is `text-sm text-muted` — a caption's colour, which on
              a FILLED control beats the foreground its variant sets, so the one
              word on the primary rendered grey on white. The destination label
              above carries the same warning for the same reason, and answers it
              by overriding the colour; a filled button has no colour to override
              it WITH, because the right one is the variant's. So the button
              styles its own word, which is D7. */}
          <span className="truncate leading-none">{act.label}</span>
        </Button>
      ) : null}
    </nav>
  );
}
