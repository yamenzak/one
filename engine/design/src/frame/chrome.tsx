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
import { PRIMARY_MAX, isUnder } from "@engine/kernel";
import { Button } from "@heroui/react";
import {
  GUTTER, ICON, ISLAND_HERE, ISLAND_ITEM, ISLAND_PAD, PAD, ROW, SAFE_BOTTOM, SPACE, WIDTH,
} from "../tokens/metrics.js";
import type { Width } from "../tokens/metrics.js";
import { MOTION, transition, useStill } from "../tokens/motion.js";
import { TYPE } from "../tokens/type.js";
import { Pip } from "../parts/beside.js";
import { Band } from "./page.js";

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
 * ⚠️ NOTHING HERE IS A SURFACE. No bar, no pill: the hem under the nav is the
 * background (`data-hem`), and where you are is INK — full foreground against a
 * distinctly recessive muted, plus the one word. Every surface this used to have
 * was solving a problem the hem solves better: the bar was holding contrast
 * against a moving field, and the pill was clearing the bar.
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
 * ⚠️ IT LEAVES DOWNWARDS AND COMES BACK UP. Reading and navigating are different
 * moments: during the first the nav is in the way, during the second it is the
 * point. The whole bar translates out rather than shedding its labels, because a
 * bar that changes SHAPE while you scroll is a thing moving in the corner of the
 * eye — and a translate is the compositor's work while a height is the layout
 * engine's, on every frame of a scroll.
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
 * `more` is the fifth item where an app has more than the bar can hold — see it.
 */
export function Island({ items, here, onGo, act, more, only }: {
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
   * EVERYWHERE IN THIS APP THAT IS NOT AT THE THUMB.
   *
   * ⚠️ WITHOUT THIS, A SECOND-TIER DESTINATION DID NOT EXIST ON A PHONE. The
   * shell drew `nav: "secondary"` in the desktop rail and nowhere else, so an
   * app declaring five primaries and seven secondaries offered five of its
   * twelve screens to anybody holding one — and the seven were unreachable by
   * any gesture, on the half of the breakpoint the product is used on.
   *
   * ⚠️ IT IS A DESTINATION-SHAPED ITEM, NOT A "MORE" BUTTON, AND THE DIFFERENCE
   * IS THE LABEL. When somebody IS somewhere it holds, it opens and says WHICH —
   * so the bar still answers "where am I" from every screen in the app rather
   * than going blank the moment they leave the four. A button called More can
   * never do that.
   *
   * ⚠️ AND IT COSTS THE FIFTH SLOT RATHER THAN A SIXTH. Five is the ceiling
   * (D10) and it is a ceiling on WHAT FITS, not on what an app may declare; a
   * sixth item is refused by the kernel and sliced here. The fifth primary is
   * one tap away instead of nought — which is the trade that buys seven
   * destinations their only way in.
   */
  readonly more?: {
    /** ⚠️ Where they are if they are inside it; otherwise the app's own name. */
    readonly label: string;
    readonly icon: React.ReactNode;
    readonly onOpen: () => void;
    /** ⚠️ True when the current screen is one this holds — see `label`. */
    readonly here?: boolean;
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
  const away = useScrollingDown();
  /* ⚠️ THE INDEX TAKES ONE OF THE FIVE, AND ONLY WHERE THERE IS ONE. Five is a
     ceiling on what fits, so the item that holds everywhere else has to come out
     of it rather than be added to it — otherwise the bar is six things wide on
     the device the ceiling exists for. An app with nothing to hold keeps all
     five. */
  const shown = items.slice(0, PRIMARY_MAX - (more ? 1 : 0));

  return (
    <nav
      aria-label="Sections"
      /* ⚠️ THE HEM IS THE NAV'S BACKGROUND — see `ambienceStylesheet`. It is on
         the NAV rather than on the bar inside it, because what has to dissolve
         is the page's own content on its way past, and the bar is only 370px of
         a 402px screen. */
      data-hem="bottom"
      /*
        ⚠️ `overflow-clip` IS WHAT STOPS THE PAGE MOVING ON ITS OWN, and it is
        the whole of the bug below. A TRANSFORMED box still counts toward the
        document's scrollable overflow, so a sticky bar translated past the
        bottom edge makes the page 88px TALLER while it is away — and shorter
        again the moment it comes back. Reach the foot of a long page, move a
        finger the other way, and the browser clamps the scroll to a document
        that just shrank: the page jumps upward, by itself, with nobody
        touching it. Measured synthetically: 1288 → 1376 → 1288.

        ⚠️ IT IS ON THE NAV AND THE TRAVEL IS ON THE BAR INSIDE IT, because
        clipping cannot help an element against its own transform. `clip`
        rather than `hidden`: `hidden` makes this a scroll container, and the
        note on `overflow-x: clip` below is the same trap one element over.
      */
      className={`sticky bottom-0 z-10 flex justify-center overflow-clip ${GUTTER} ${PAD} ${SAFE_BOTTOM}`
        + (only === "phone" ? " md:hidden" : "")}
    >
      {/*
        ⚠️ IT SPANS THE COLUMN AND THE CLOSED ITEMS SHARE WHAT IS LEFT. A bar
        sized to its own content came out 234px of 430 with a visible gap either
        side, which reads as a control that did not finish loading rather than as
        something floating over the page — and it packs four tap targets into the
        middle third of the screen, which is the half of the argument that is
        about thumbs rather than taste. The open pill takes the room its word
        needs and the four glyphs divide the rest, so the bar is the same width
        on every screen and the spacing falls out of the arithmetic.

        ⚠️ AND IT CARRIES NO FILL AT ALL. It was `data-chrome` — the ground's own
        colour, a capsule — and that is a plate with rounded ends, so the page's
        next row arrived at those ends and was sliced by them: a face cut in half
        down the gutter, a heading reappearing in the gaps either side. The hem
        on the nav around it dissolves the content instead, which fixes the
        collision rather than out-contrasting it, and leaves the five items
        standing on the page.
      */}
      {/* ⚠️ AND NO `data-capsule` EITHER — there is no surface left to round.
          The attribute would still match its rule and change nothing, which is
          the state it was in before anybody noticed the nav was a rectangle. */}
      <div
        data-island="true"
        className={`flex w-full ${WIDTH.read} flex-row items-center ${SPACE.hair} ${ISLAND_PAD}`}
        style={{
          /* ⚠️ PAST ITS OWN HEIGHT PLUS THE SAFE AREA, or it rests half off the
             bottom edge on a phone with a home indicator — which reads as a bar
             that failed to finish rather than as one that left. The distance is
             the nav's own bottom inset, so it clears the clip exactly. */
          transform: away
            ? "translateY(calc(100% + max(0.75rem, env(safe-area-inset-bottom))))"
            : "none",
          opacity: away ? 0 : 1,
          transition: away ? MOTION.exit : MOTION.enter,
        }}
      >
        {shown.map((item) => {
          /* ⚠️ OPEN ONLY WHEN THERE IS NO ACT — see `act`. The bar carries one
             word, and when a screen has something to do it is that. */
          /* ⚠️ THE SCREEN THE ADDRESS IS UNDER, NOT THE ONE IT EQUALS. A detail
             screen carries what it is about (`/thing/t-glove`), and an exact
             match left the bottom bar with nothing marked the moment anybody
             opened a record — on the one control that answers "where am I". */
          const isHere = isUnder(item.route, here);
          const open = isHere && !act;
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
              className={`flex-row items-center justify-center ${SPACE.tight} ${ROW.free} `
                + (open ? `shrink-0 ${ISLAND_HERE}` : `shrink-0 ${ISLAND_ITEM}`)
                + (act ? "" : open ? "" : " grow basis-0 min-w-0")}
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
              <span
                className={`${TYPE.note} ${isHere ? "text-foreground" : ""}`
                  + " overflow-hidden whitespace-nowrap leading-none"}
                style={{
                  maxWidth: open ? "10rem" : 0,
                  opacity: open ? 1 : 0,
                  transition: MOTION.reveal,
                }}
              >
                {item.label}
              </span>
            </Button>
          );
        })}

        {/*
          ⚠️ THE SAME SHAPE AS A DESTINATION, DELIBERATELY. It is one, in every
          way a person can tell: it sits in the row, it wears a glyph, and when
          somebody is inside it, it opens and says which place they are in. What
          it is NOT is a button called More — that reads as an admission the nav
          ran out of room, and it leaves the bar unable to answer "where am I"
          from a third of the app's screens.
        */}
        {more ? (
          <Button
            variant="ghost"
            aria-haspopup="dialog"
            aria-current={more.here ? "page" : undefined}
            data-here={more.here ? "true" : undefined}
            className={`flex-row items-center justify-center ${SPACE.tight} ${ROW.free} `
              + (more.here && !act ? `shrink-0 ${ISLAND_HERE}` : `shrink-0 ${ISLAND_ITEM}`)
              + (act ? "" : more.here ? "" : " grow basis-0 min-w-0")}
            onPress={more.onOpen}
          >
            <span
              aria-hidden="true"
              className="flex shrink-0 items-center"
              style={{ ["--icon" as string]: `${ICON.nav}px` }}
            >
              {more.icon}
            </span>
            {/* ⚠️ THE LABEL IS THE ACCESSIBLE NAME WHETHER OR NOT IT IS SHOWING,
                for the reason every other item's is: closed, this is one more
                unnamed button to anybody reading the page aloud. */}
            <span
              className={`${TYPE.note} ${more.here ? "text-foreground" : ""}`
                + " overflow-hidden whitespace-nowrap leading-none"}
              style={{
                maxWidth: more.here && !act ? "10rem" : 0,
                opacity: more.here && !act ? 1 : 0,
                transition: MOTION.reveal,
              }}
            >
              {more.label}
            </span>
          </Button>
        ) : null}

        {/*
          ⚠️ THE ACT TAKES WHAT IS LEFT, AND IT IS THE ONLY FILLED THING IN THE
          BAR. The destinations are ink on the page's own ground (see above);
          one primary among them is what makes it a primary rather than a sixth
          glyph. `min-w-0` with a truncating label so five destinations and a
          long verb degrade to a shorter verb rather than to a bar that wraps or
          a destination that vanishes.
        */}
        {act ? (
          <Button
            /* ⚠️ NAMED, BECAUSE THE BAR PAINTS ITS BUTTONS MUTED — see the
               `[data-island]` rule. The act is the one that keeps its variant's
               own colour. */
            data-act="true"
            variant={act.tone === "danger" ? "danger" : "primary"}
            isDisabled={act.disabled}
            onPress={act.onDo}
            className={`grow min-w-0 flex-row items-center justify-center ${SPACE.tight} ${ROW.free} ${ISLAND_HERE}`}
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
                three elements up carries the same warning for the same reason,
                and answers it by overriding the colour; a filled button has no
                colour to override it WITH, because the right one is the
                variant's. So the button styles its own word, which is D7. */}
            <span className="truncate leading-none">{act.label}</span>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}

/**
 * ⚠️ WHICH WAY SOMEBODY IS GOING, NOT WHETHER THEY ARE MOVING. The first version
 * of this collapsed the nav while ANY scrolling was happening and restored it
 * when it stopped — so the labels flickered back on every pause, and reading
 * halfway down a page meant watching the bar breathe. Direction is the signal
 * people actually give: going DOWN is reading, and the nav is in the way; coming
 * back UP is looking for it.
 *
 * ⚠️ AND IT UNFOLDS AT THE TOP WHATEVER THE DIRECTION. Arriving at the head of a
 * page with the labels still folded from the last scroll is a nav that remembers
 * something the person does not.
 *
 * ⚠️ THE THRESHOLD IS NOT DECORATION. Without it a one-pixel jitter — a rubber
 * band, a focus scroll, a fixed element resizing — flips the direction, and the
 * bar folds and unfolds on its own while nobody touches anything.
 */
function useScrollingDown(threshold = 6, top = 24): boolean {
  const [down, setDown] = React.useState(false);

  React.useEffect(() => {
    if (typeof matchMedia === "function"
      && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y <= top) { setDown(false); last = y; return; }
      if (Math.abs(y - last) < threshold) return;
      setDown(y > last);
      last = y;
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, [threshold, top]);

  return down;
}
