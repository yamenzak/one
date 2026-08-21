/**
 * A SCREEN IS A DECLARATION, NOT A LAYOUT.
 *
 * ⚠️ THE FAULT THIS EXISTS TO REMOVE IS NOT UGLINESS, IT IS DRIFT. Every screen
 * in OneSpace hand-assembled the same five decisions — which column width, which
 * skeleton, what "nothing here" says, where the one action goes, how the content
 * arrives — and each got most of them right and one of them wrong. Nobody can
 * point at the file that is wrong, because none of them is: the product is
 * wrong, in aggregate, and the only fix that holds is to stop asking.
 *
 * ⚠️ SO A SCREEN NAMES ITS SHAPE AND HANDS OVER SLOTS. `shape` is what KIND of
 * page this is — a collection, a subject, a number, a board, a form. Everything
 * that follows from that is decided here, once: the width, the waiting skeleton,
 * how content is stacked, and — the one that keeps being got wrong by hand —
 * where the primary action lands at each size.
 *
 * ⚠️ WHERE THE PRIMARY ACTION GOES IS THE WHOLE ARGUMENT. The roster put "Invite
 * somebody" at the FOOT of the list. With three people that is fine and with
 * thirty it is invisible: somebody at the bottom of a long page has to scroll to
 * the top to act, or somebody at the top has to scroll to the bottom, and which
 * of the two depends on a decision nobody made. It is DOCKED on a phone, where a
 * thumb already is, and it sits in the crown on a desktop, where the eye already
 * is. One declaration, both answers, no screen involved.
 *
 * ⚠️ AND ONE SCREEN HAS ONE PRIMARY ACTION. Not a style rule — a definition. A
 * page with two things it is for is two pages, and the moment a second `does`
 * would be needed the right edit is a second screen or a sheet. `also` is for
 * the two or three things somebody might reach for while doing the primary one,
 * and it is capped in the type.
 */

import * as React from "react";
import { Button } from "@heroui/react";
import { Band, Page } from "./page.js";
import { PageCrown, useCrownSocket, type Slot } from "./crown.js";
import { Docked } from "./chrome.js";
import { sayGate, useGate } from "../parts/gated.js";
import { TYPE } from "../tokens/type.js";
import { Spacer } from "../parts/arrange.js";
import { Title } from "../parts/heads.js";
import type { Width } from "../tokens/metrics.js";
import { Group, NavRow } from "../parts/surfaces.js";
import { worldFor, type FaceOf } from "../parts/face.js";
import type { Tone } from "@engine/kernel";
import type { Sky } from "../tokens/ambience.js";
import type { Density } from "../scene/index.js";
import { Await, Nothing, RowsWaiting, FigureWaiting, FormWaiting, TextWaiting, TilesWaiting, nothingIn, type Loaded } from "../parts/state.js";
import { Stack } from "../parts/arrange.js";
import { ShapeWaiting, useRecalledShape } from "../parts/recall.js";
import {
  NUDGE, PAD, SAFE_BOTTOM, SCREEN_TITLE_PAD, SPACE, WHOLE,
} from "../tokens/metrics.js";
import { ARRIVE, arriveAt } from "../tokens/motion.js";

/* ------------------------------------------------------------------ shape --- */

/**
 * WHAT KIND OF PAGE THIS IS.
 *
 * ⚠️ EIGHT, AND THEY ARE KINDS OF PURPOSE RATHER THAN KINDS OF ARRANGEMENT.
 * "Two columns" is not a shape — it is a consequence, and naming consequences is
 * how a preset system becomes a second CSS with worse names. What a screen knows
 * about itself is what it is FOR, and every arrangement below falls out of that.
 *
 *   list      a collection somebody scans and adds to. A roster, a catalogue.
 *   detail    one subject and its facts. A person, a workspace, a product.
 *   figure    one number is the point, everything else supports it. A bill.
 *   board     destinations or measures as tiles, some wider than others.
 *   settings  many independent controls, each saving itself. No primary — see
 *             below, this one is enforced.
 *   form      a sequence of fields and ONE submit. The submit is the primary.
 *   reader    prose. A policy, a document, an explanation.
 *   decision  one object, one choice. A plan, a paywall, a confirmation.
 */
export type Shape =
  | "list" | "detail" | "figure" | "board" | "settings" | "form" | "reader" | "decision";

/**
 * ⚠️ THE TABLE IS THE PRESET SYSTEM. Everything a shape decides is a row here,
 * so adding a ninth kind of page is a row rather than a component — and, more to
 * the point, so the answer to "how wide is a form" is in ONE place for every app
 * that will ever be built on this.
 */
const SHAPES: Readonly<Record<Shape, {
  /** ⚠️ `read` for anything with sentences in it; `work` for columns. */
  readonly width: Width;
  /** ⚠️ Shaped like what is coming — a spinner is a layout that will jump. */
  readonly waiting: () => React.ReactNode;
  /** How the content's own blocks are spaced. */
  readonly space: "snug" | "roomy";
  /**
   * ⚠️ WHETHER A PRIMARY ACTION IS EVEN LEGAL HERE. `settings` is the one that
   * says no, and it is the most useful entry in the table: a settings screen
   * with a Save button is a screen where half the controls save themselves and
   * half do not, and nobody can tell which by looking (see `useAction`).
   */
  readonly primary: "docked" | "none";
}>> = {
  /* ⚠️ `work`, BECAUSE A LIST BECOMES A TABLE. `Listing` collapses to rows on a
     phone and opens into columns above `md` — at reading width those columns
     were squeezed into 42% of a desktop with black either side, which reads as
     a page that failed to fill rather than as a held column. Rows inside a card
     are perfectly happy wider; four columns at 672px are not. */
  list: { width: "work", waiting: () => <RowsWaiting rows={4} />, space: "roomy", primary: "docked" },
  detail: { width: "read", waiting: () => <RowsWaiting rows={3} />, space: "roomy", primary: "docked" },
  figure: { width: "read", waiting: () => <FigureWaiting count={2} />, space: "roomy", primary: "docked" },
  board: { width: "work", waiting: () => <TilesWaiting tiles={6} />, space: "roomy", primary: "docked" },
  settings: { width: "read", waiting: () => <FormWaiting fields={4} />, space: "roomy", primary: "none" },
  form: { width: "read", waiting: () => <FormWaiting fields={4} />, space: "roomy", primary: "docked" },
  reader: { width: "read", waiting: () => <TextWaiting lines={6} />, space: "roomy", primary: "docked" },
  decision: { width: "read", waiting: () => <TilesWaiting tiles={3} />, space: "roomy", primary: "docked" },
};

/* ------------------------------------------------------------------- acts --- */

/**
 * THE ONE THING A SCREEN IS FOR.
 *
 * ⚠️ A LABEL THAT IS A VERB, ALWAYS. "Invite somebody", not "People management".
 * The control says what happens; the toast afterwards says it happened, in the
 * same words (DESIGN.md §2).
 */
export interface Act {
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly onDo: () => void;
  /** ⚠️ Reserved for a primary that destroys. Rare, and never a default. */
  readonly tone?: "danger";
  readonly disabled?: boolean;
  /**
   * WHAT IT CALLS — the operation's id.
   *
   * ⚠️ THE ONE THING A SCREEN IS FOR IS ALSO THE WORST ONE TO OFFER AND REFUSE.
   * A primary that is drawn, pressed and answered 402 puts the refusal in a
   * toast over whatever the person just filled in — so naming the operation lets
   * the frame ask the gate BEFORE it draws, from the verdicts the boot read
   * already carried (`Allowed`, `useGate`).
   *
   * ⚠️ THE OPERATION RATHER THAN THE VERDICT, so a screen never restates the
   * gate's question in its own words. It says what it calls; the platform says
   * whether that would work.
   *
   * ⚠️ DISABLED AND EXPLAINED, NOT ABSENT. A screen whose one action has
   * silently vanished is a screen that looks broken; `sayGate` is the line under
   * it, and the words are the design system's rather than each screen's.
   */
  readonly op?: string;
}

/* ------------------------------------------------------------------ frame --- */

/**
 * WHO THE SCREEN IS AND HOW YOU LEAVE IT — supplied by whatever routes, not by
 * the screen.
 *
 * ⚠️ A SCREEN DOES NOT KNOW ITS OWN NAME, AND IT MUST NOT. The name and the way
 * out are properties of WHERE the screen sits: the same content is "People"
 * under a workspace and a step you go back from, and a router already knows
 * both. Twenty screens each passing their own title is twenty places to get the
 * back behaviour subtly wrong — the root dismissed with an ×, everything inside
 * left with an arrow — and the third one always does.
 *
 * ⚠️ SO IT IS CONTEXT RATHER THAN PROPS. Threading four values through every
 * branch of a router's switch is the same information written twenty times, and
 * the day a fifth is added it is written twenty more.
 */
export interface Frame {
  readonly title: string;
  readonly under?: React.ReactNode;
  readonly back?: () => void;
  readonly leave?: "back" | "dismiss";
}

const FrameContext = React.createContext<Frame | null>(null);

/** Wraps whatever a router renders for one address. */
export function Framed({ frame, children }: {
  readonly frame: Frame;
  readonly children: React.ReactNode;
}) {
  return <FrameContext.Provider value={frame}>{children}</FrameContext.Provider>;
}

/* ----------------------------------------------------------------- layout --- */

/**
 * ⚠️ THE SUBJECT TRAVELS BY CONTEXT AND `Layout` IS THE ONLY THING THAT PROVIDES
 * IT, WHICH IS THE ENFORCEMENT. This was a `face` on `Frame` — a prop, so any
 * router could set one — and a face set there gets the hero title card WITHOUT
 * the sky it is supposed to be standing on: a planet floating on linen, which
 * looks deliberate. There is no prop to get wrong now; a page either declares a
 * subject or has none, and both consequences follow from the one word.
 */
const SubjectContext = React.createContext<FaceOf | null>(null);

export interface LayoutProps {
  /**
   * ⚠️ THE MATERIAL, FOR A PAGE THAT IS ABOUT NO ONE THING. Most pages: a list,
   * a form, a console. Ignored where there is a subject — a page has one ground.
   */
  readonly sky?: Sky;
  /** ⚠️ Which one of the family — see `PageProps.seedling`. */
  readonly seedling?: string;
  /**
   * THE ONE THING THIS PAGE IS ABOUT — AND IT DECIDES THREE THINGS AT ONCE.
   *
   * ⚠️ THAT IS THE WHOLE OF LAYOUTS 2.0, AND IT IS A FIX RATHER THAN A
   * CONVENIENCE. The OneSpace used to compute the ground, the hero face and the
   * density in three separate expressions from the same slug, each of which had
   * to agree with the other two and none of which could tell when it did not.
   * From one declaration: the ground is this subject's own world (`worldFor`),
   * the crown is a title card wearing its face, and the density is an arrival's
   * rather than a working screen's. Nothing to keep in step, because there is
   * nothing to keep.
   *
   * ⚠️ A SUBJECT WITH NO WORLD IS NOT AN ERROR. A person and a product have
   * faces and no sky; the page keeps its material and the crown keeps the face,
   * which is the honest half of what was asked for rather than a blank.
   */
  readonly subject?: FaceOf;
  /**
   * WHOSE WORLD THIS PAGE STANDS IN, WHERE THE PAGE IS NOT ABOUT THEM.
   *
   * ⚠️ TWO FACTS WERE ONE, AND THE SECOND ONE IS WHY THIS EXISTS. `subject`
   * decides three things at once, which is right when a page IS a thing: a
   * workspace's own screen wears its planet AND is titled by it. It is wrong for
   * every other screen in the same area. "Your workspaces" stands in the
   * person's light and is about a LIST of places — given it as a subject, the
   * frame drew that person's face at the size of the screen with the word
   * "Workspaces" across it, which is a title card for the wrong noun.
   *
   * ⚠️ SO THE GROUND FALLS BACK TO THIS AND THE TITLE CARD DOES NOT. An area
   * hands every screen in it a world; only the screens that ARE their subject
   * name one. Ignored where `subject` is set — a page has one ground, and the
   * subject's own is the better answer whenever there is one.
   */
  readonly world?: FaceOf;
  /**
   * ⚠️ AN INTENT, AND THE DEFAULT IS THE INTERESTING PART. A page with a subject
   * is somewhere somebody ARRIVED — the world is most of what is on it, so it
   * runs `rich`. A page wearing a material is a page with work on it. Named here
   * only where a screen knows better than that.
   */
  readonly density?: Density;
  /**
   * ⚠️ ABSENT WHERE THE SCREEN IS ITS OWN HEADING — OneSpace's root is a face, an
   * address and a list, and a display title over it names a screen the face has
   * already named.
   */
  readonly frame?: Frame;
  readonly nav?: React.ReactNode;
  readonly children?: React.ReactNode;
}

/**
 * A PAGE, ITS WORLD, AND WHAT IS OVER THE DOOR — one declaration.
 *
 * ⚠️ IT IS THE OUTERMOST PIECE AND EVERY ADDRESS GOES THROUGH IT. `Page` is
 * still the frame and `Framed` is still the context; what this removes is the
 * four-place knowledge that used to sit in a router — which ground, which world,
 * how dense, whose face — three of which are the same fact.
 */
export function Layout(
  { sky = "plain", seedling, subject, world: standingIn, density, frame, nav, children }:
  LayoutProps,
) {
  /* ⚠️ THE GROUND TAKES EITHER; THE TITLE CARD TAKES ONLY A SUBJECT — see
     `world`. That asymmetry is the whole of the split. */
  const world = worldFor(subject ?? standingIn) ?? undefined;
  const inside = frame ? <Framed frame={frame}>{children}</Framed> : children;
  return (
    <Page
      sky={sky}
      seedling={seedling}
      world={world}
      density={density ?? (subject ?? standingIn ? "rich" : "even")}
      nav={nav}
    >
      <SubjectContext.Provider value={subject ?? null}>{inside}</SubjectContext.Provider>
    </Page>
  );
}

/* ----------------------------------------------------------------- screen --- */

export interface ScreenProps<T> {
  readonly shape: Shape;
  /** ⚠️ Absent takes the router's — see `Frame`. Named only where it differs. */
  readonly title?: string;
  /** ⚠️ A FACT, or nothing. Not a description of the screen — DESIGN.md §1. */
  readonly under?: React.ReactNode;
  readonly back?: () => void;
  readonly leave?: "back" | "dismiss";
  /** ⚠️ ONE. See the header; `settings` refuses it outright. */
  readonly does?: Act;
  /** ⚠️ At most two, and they are crown chips. A third is a sheet. */
  readonly also?: readonly Slot[];

  /* --- the data, and therefore the four outcomes ------------------------- */

  /**
   * ⚠️ HANDED TO THE SCREEN RATHER THAN WRAPPED INSIDE IT, because the primary
   * action's PLACE depends on the outcome — see `does` below. A screen that
   * resolved its own `Await` and then rendered a dock would offer "Invite
   * somebody" over a skeleton and again inside its own empty state.
   */
  readonly of?: Loaded<T>;
  readonly then?: (data: T) => React.ReactNode;
  readonly isNothing?: (data: T) => boolean;
  readonly again?: () => void;
  /** Overrides the shape's own skeleton where the content is unusual. */
  readonly waiting?: React.ReactNode;
  /**
   * ⚠️ What is true when the answer is legitimately nothing.
   *
   * ⚠️ `does` IS FOR A WAY OUT THAT IS NOT A BUTTON — a field to fill first, a
   * sheet's trigger. Without it a screen whose emptiness ends in anything more
   * than one press had to render its own `Nothing` as content, which is the
   * shape that put an empty state under the heading with the rest of the
   * viewport blank beneath it. The way out belongs INSIDE the nothing.
   */
  readonly nothing?: {
    readonly says: string;
    readonly under?: string;
    /**
     * ⚠️ THE SCREEN'S OWN NOUN — `glyphOf("workspace")`, not a shrug. See
     * `Nothing`: an empty state with the neutral circle on it is the same
     * drawing on every screen in the product, so the one moment a surface has
     * nothing to show is the one moment it stops looking like itself.
     */
    readonly icon?: React.ReactNode;
    readonly does?: React.ReactNode;
  };
  /**
   * ⚠️ A FIFTH OUTCOME, AND IT IS NOT `trouble`. "You may not see this" is a
   * fact about the person, known before any request is made — a `Problem` is a
   * fact about a request that failed. Screens used to answer it with a bare
   * `Nothing` returned EARLY, above the frame, which took the crown with it: no
   * title, no way back, a sentence alone on a page. The refusal is content now,
   * and the screen it refuses still has a name and a way out of it.
   */
  readonly refused?: {
    readonly says: string;
    readonly under?: string;
    readonly icon?: React.ReactNode;
  };
  /** For a screen with no request behind it. */
  readonly children?: React.ReactNode;
}

/**
 * ⚠️ THE ACTION APPEARS WHEN THERE IS SOMETHING TO ACT ON, which is three rules
 * in one and each was a real screen:
 *
 *   WAITING  — no dock. A primary button floating over a skeleton invites a
 *              press against data that has not arrived.
 *   TROUBLE  — no dock. The only useful control is "try again", and it is in
 *              the refusal where the explanation is.
 *   NOTHING  — no dock; the action moves INTO the empty state instead. An empty
 *              screen with a docked bar shows the same words twice, once in the
 *              only thing on the page and once bolted to the bottom of it.
 *
 * A screen with no request at all is always ready, which is the fourth case and
 * needs no branch.
 */
/**
 * ⚠️ WAITING IS ITS OWN ANSWER HERE, AND COLLAPSING IT INTO "NO" MOVED THE
 * SKELETON. `status !== "ready"` folded waiting in with a refusal, and a refusal
 * takes the WHOLE screen (centred in what is left) — so every screen in the
 * product drew its placeholder in the MIDDLE of the viewport and then dropped
 * the real content to the top when it arrived. A skeleton exists to make nothing
 * move; centring it guarantees the one jump it was there to prevent.
 */
const shows = <T,>(
  of: Loaded<T> | undefined,
  isNothing?: (d: T) => boolean,
): "act" | "empty" | "wait" | "no" =>
  of === undefined ? "act"
    : of.status === "waiting" ? "wait"
      : of.status === "trouble" ? "no"
        : nothingIn(of.data, isNothing) ? "empty" : "act";

export function Screen<T = unknown>({
  shape, title, under, back, leave, does, also = [],
  of, then, isNothing, again, waiting, nothing, refused, children,
}: ScreenProps<T>) {
  const preset = SHAPES[shape];
  /* ⚠️ A refusal offers nothing to act on, so the primary stands down with it. */
  const where = refused ? "no" : shows(of, isNothing);
  /*
    ⚠️ THE SKELETON IS THIS SCREEN AS IT WAS LAST TIME, WHERE THERE IS A LAST
    TIME. A shape's own placeholder stands in for every screen that names the
    shape, so a page of three headed cards waits behind one un-headed card of
    four rows — the fault a skeleton exists to prevent, wearing its clothes.
    `useRecalledShape` measures what was actually drawn and hands it back on the
    next visit; the preset is what a screen nobody has opened yet still gets.
    See `parts/recall.tsx`.
  */
  const recalled = useRecalledShape(where === "act");
  const frame = React.useContext(FrameContext);
  /* ⚠️ THE HERO IS THE PAGE'S SUBJECT, AND ONLY `Layout` CAN HAVE SAID SO. A
     screen cannot ask for one: the title card and the sky under it are two
     halves of one declaration, and half of it is a planet floating on linen. */
  const subject = React.useContext(SubjectContext);
  /* ⚠️ The screen's own value wins where it has one, because a screen CAN know
     something the router does not — a workspace's real name behind a slug. */
  const name = title ?? frame?.title ?? "";
  const sub = under ?? frame?.under;
  const out = back ?? frame?.back;
  const how = leave ?? frame?.leave;

  /* ⚠️ A `settings` SCREEN WITH A PRIMARY IS A BUG, AND IT IS LOUD RATHER THAN
     IGNORED. Silently dropping it would leave somebody wondering why their
     button never rendered; a guard catches it before this ever runs, and this
     catches the case the guard cannot see (a shape chosen at runtime). */
  if (preset.primary === "none" && does) {
    throw new Error(
      `A "${shape}" screen cannot have a primary action — its controls save themselves.`,
    );
  }

  const body = refused
    ? <Nothing icon={refused.icon} says={refused.says} under={refused.under} />
    : of !== undefined
    ? (
      <Await
        of={of}
        again={again}
        /*
          ⚠️ WHAT WAS ACTUALLY DRAWN BEATS BOTH GUESSES, AND A SCREEN'S OWN
          GUESS BEATS THE SHAPE'S. `waiting` used to win outright, which made it
          an override — so the four screens that had hand-tuned one could never
          be exact, permanently, and the tuning was the reason. It is the
          FIRST-VISIT answer now: better than the preset because the screen's
          author knew what was coming, and superseded the moment the screen has
          been seen once.
        */
        waiting={recalled ? <ShapeWaiting blocks={recalled} /> : waiting ?? preset.waiting()}
        isNothing={isNothing}
        nothing={nothing
          ? (
            <Nothing
              icon={nothing.icon}
              says={nothing.says}
              under={nothing.under}
              /* ⚠️ The way out lives IN the empty state — see `shows`. The
                 screen's own `does` is the ordinary case; a node given here
                 replaces it, for the ways out that take more than one press. */
              does={nothing.does
                ?? (does ? <Button variant="primary" onPress={does.onDo}>{does.label}</Button> : undefined)}
            />
          )
          : undefined}
        then={(data) => <Arriving space={preset.space}>{then?.(data)}</Arriving>}
      />
    )
    : <Arriving space={preset.space}>{children}</Arriving>;

  /*
    ⚠️ THE CEILING IS THE CROWN'S TYPE AND THIS IS WHERE IT IS MET. A screen may
    declare any number of `also`; two is what the row can hold, so the slice
    happens once, here, rather than the crown silently dropping the third.

    ⚠️ AND `does` IS THE SAME ACT DRAWN TWICE AND SHOWN ONCE — the crown above
    `md`, the dock below it. Two declarations would drift the day one of them
    gets new copy.
  */
  const trail = [also[0], also[1]].filter(Boolean) as readonly Slot[];
  /*
    ⚠️ ASKED ONCE, HERE, FOR BOTH HALVES OF THE ACT. The crown draws it above
    `md` and the dock below, and a verdict resolved twice is two chances to
    resolve it differently. Absent `op` reads as allowed — every screen that has
    not yet named what its primary calls behaves exactly as it did.
  */
  const stopped = useGate(does?.op);
  /* ⚠️ A BLOCKED ACT IS A DISABLED ACT WITH A REASON, and the fold happens once
     here so the crown and the dock cannot disagree about it. */
  const act = where === "act" && does
    ? {
      ...does,
      wide: true,
      disabled: does.disabled || Boolean(stopped),
      ...(stopped ? { why: sayGate(stopped) } : {}),
    }
    : undefined;

  /*
    ⚠️ A CROWN ABOVE US TAKES THIS ONE — see `useCrownSocket`. Inside a `Shell`
    there is already a crown, and two of them stack; what happens next depends
    on whether this screen is somewhere you WENT (it has a way out, so it owns
    the crown and the shell's stands down) or somewhere you ARE (it has none, so
    the shell's crown stands and this hands it the actions).
  */
  const socketed = useCrownSocket({ back: out, leave: how, title: name, also: trail, does: act });
  const ownCrown = !socketed;
  /* ⚠️ A DESTINATION'S NAME IS A HEADING, NOT CHROME. With the shell's crown
     standing there is nothing to collapse into, so the name belongs in the
     content where a heading belongs — which is where it was going to end up the
     first time somebody looked at a screen with no crown of its own. */
  const heading = socketed && !out;

  return (
    <>
      {ownCrown ? (
        <PageCrown
          bleed="hold"
          width={preset.width}
          title={name}
          face={subject ?? undefined}
          under={sub}
          back={out}
          leave={how}
          also={trail as unknown as readonly [Slot, Slot]}
          does={act}
        />
      ) : null}

      {heading ? (
        <Band bleed="hold" width={preset.width}>
          <div className={SCREEN_TITLE_PAD}><Title under={sub}>{name}</Title></div>
        </Band>
      ) : null}

      {/*
        ⚠️ AN EMPTY STATE IS THE WHOLE SCREEN, SO IT TAKES THE WHOLE SCREEN. Laid
        out like content it sits under the heading with eight hundred pixels of
        nothing beneath it, which does not read as "there is nothing here" — it
        reads as a page that stopped loading, and the sentence explaining the
        emptiness is the one thing nobody trusts on a page that looks broken.

        ⚠️ AND IT IS DECIDED HERE RATHER THAN IN `Nothing`, because only the
        screen knows whether the emptiness IS the page. The same component drawn
        inside a card, beside other blocks, must stay where it was put.

        ⚠️ BUT NEVER WHILE WAITING — see `shows`. A skeleton is the geometry of
        what is coming, so it belongs exactly where the content will be; centred,
        it is a placeholder that guarantees the jump it exists to prevent. The
        box still GROWS, so the dock below it stays at the bottom of the
        viewport rather than following the placeholder up the page.
      */}
      <Band bleed="hold" width={preset.width} grow={where !== "act"}>
        <div className={where === "empty" || where === "no"
          ? `${NUDGE.body} ${WHOLE}`
          : NUDGE.body}
        >
          {body}
        </div>
      </Band>

      {/* ⚠️ THE SCREEN OWNS THE SPACE UNDER ITS CONTENT, so the dock below is at
          the bottom of the VIEWPORT on a short page and at the bottom of the
          SCROLL on a long one. Without it a page with three rows on it put the
          primary action floating in the middle of an empty screen — sticky does
          nothing on a page that does not scroll, which is exactly the page
          where it looks most like a mistake.

          ⚠️ Not when the body already grew — two things claiming the leftover
          room share it, and the empty state lands a quarter of the way up. */}
      {where === "act" ? <Spacer /> : null}

      {/* ⚠️ ONE COMPONENT FOR THE DOCK — see `Docked`. The same act the crown
          carries above `md`, and the crown's copy is `wide` so exactly one of
          them is ever on screen. */}
      {/*
        ⚠️ NO DOCK WHERE A CHROME ABOVE HAS TAKEN THE ACT. Socketed, this screen
        published its `does` to the shell — whose crown shows it above `md` and
        whose NAV shows it below, in the bar (`Island.act`). A dock as well would
        be the same act twice on a phone, six inches apart, which is the fault
        `Crown`'s `wide` already exists to prevent one breakpoint over.

        ⚠️ AND IT IS `Docked`'s OWN RULE, RESTORED. "A screen has this or an
        `Island`, never both" was overridden for a day: stacked, the two were
        180px of an 844px screen with a gap between them, and the content column
        reserved room for one of them so the last row of the last card sat under
        the other permanently. The rule was right; what was missing was somewhere
        for the act to go.
      */}
      {where === "act" && does && !socketed
        ? (
          <Docked width={preset.width}>
            {/* ⚠️ THE REASON IS WRITTEN OUT DOWN HERE, not put in a tooltip. This
                is the phone half of the act, and a phone has no hover — so the
                one place the explanation could hide is the one place nobody on
                this half of the breakpoint can reach. */}
            <div className={`flex flex-col ${SPACE.hair}`}>
              <Button
                className="w-full"
                variant={does.tone === "danger" ? "danger" : "primary"}
                isDisabled={does.disabled || Boolean(stopped)}
                onPress={does.onDo}
              >
                {does.icon}
                {does.label}
              </Button>
              {stopped
                ? <span className={`${TYPE.note} text-center`}>{sayGate(stopped)}</span>
                : null}
            </div>
          </Docked>
        )
        : null}
    </>
  );
}

/* --------------------------------------------------------------- arriving --- */

/**
 * ⚠️ EVERY SCREEN'S CONTENT ARRIVES, AND NO SCREEN ASKS FOR IT. Applying the
 * stagger by hand means the screens that were written after somebody remembered
 * have it and the rest do not, which is worse than none of them having it — an
 * inconsistency reads as a bug where an absence reads as a choice.
 *
 * ⚠️ IT IS HEROUI'S OWN `enter` KEYFRAME, driven by `--tw-enter-*`. A hand-rolled
 * one sits outside the library's reduced-motion handling and keeps moving for
 * somebody who asked it to stop (`motion.ts`).
 */
/**
 * WHERE A SCREEN'S BLOCKS GET THEIR AIR, AND WHY NOTHING COUNTS THEM.
 *
 * ⚠️ THIS USED TO WALK THE CHILDREN AND WRAP EACH ONE, AND IT COST EVERY GAP ON
 * NEARLY EVERY SCREEN. `React.Children` can flatten a fragment written inline,
 * so `then={() => <><Group/><Group/></>}` worked — and the moment `then` returns
 * a COMPONENT that returns that fragment, which is what every real screen does,
 * the walk sees one child. One wrapper, a gap applied between nothing, and the
 * blocks inside it stacked at zero. Measured on the models screen: 0px where the
 * scale says 24.
 *
 * ⚠️ AND IT CANNOT BE FIXED BY FLATTENING HARDER. A parent cannot look inside a
 * component's return value without rendering it; `<Lanes/>` is opaque to
 * `React.Children` by construction. Any rhythm that depends on counting React
 * children is a rhythm one indirection away from being silently absent — which
 * is exactly how this shipped, was fixed once for the inline case, and came
 * straight back.
 *
 * ⚠️ SO THE RHYTHM IS THE DOM'S. Fragments produce no DOM nodes, so a component
 * returning three sections puts three siblings in this container however deeply
 * it is nested — and a `gap` on the container applies between them because they
 * ARE siblings. Nothing counts anything, and there is no arrangement of
 * components that can defeat it.
 *
 * ⚠️ THE STAGGER MOVED WITH IT, TO `nth-child`. It was an inline delay per
 * wrapper, so it was lost on precisely the screens the gap was lost on — the
 * same silence twice. `BLOCK_MOTION` sets the delay positionally, in CSS, on
 * whatever the DOM actually holds.
 */
function Arriving({ space, children }: {
  readonly space: "snug" | "roomy";
  readonly children: React.ReactNode;
}) {
  return <Stack space={space} blocks>{children}</Stack>;
}

/*
  ⚠️ `Board` AND `Tile` WERE HERE AND ARE GONE, WHICH IS WORTH ONE PARAGRAPH.
  They were a fixed two-then-four column grid with `wide`/`tall` spans, and the
  argument for them was hierarchy: one wide tile says which measure matters.
  Their only caller was the operator's shard screen, and drawing it proved the
  opposite — two columns on a phone is 190 pixels a tile, so a heading, a place
  and a value wrapped onto three lines and no two tiles were the same height.
  Bars stacked in one card compare BETTER, because they start at the same x.
  What survives is `Grid` (auto-fit, so the column count follows the content's
  own minimum width) and the `board` SHAPE, which is about page width rather
  than about a grid. A span vocabulary can come back the day something needs a
  span; until then it is a second way to lay out a page that nothing has tried.
*/

/* -------------------------------------------------------------- whichever --- */

/**
 * WHICHEVER ONE THE ADDRESS NAMES — and where there is only one, it IS the
 * screen.
 *
 * ⚠️ THREE SCREENS SHIPPED THIS BY HAND AND A FOURTH WAS ABOUT TO. Settings,
 * In your words and the operator's AI actions each hold a thing per product, and
 * each wrote the same four branches: none, exactly one, several with a choice
 * made, several without. Written four times it is four places to get the middle
 * two wrong — and the middle two are the interesting ones.
 *
 * ⚠️ NOBODY PAYS A TAP FOR A MENU WITH ONE ITEM ON IT. A workspace with a single
 * product should land on that product's screen, not on a list containing it;
 * the list is a cost that only earns itself once there is a choice to make. That
 * rule was stated in three separate comments and implemented three times.
 *
 * ⚠️ AND THE CHOICE IS AN ADDRESS, NOT A STATE. `chosen` comes from the router
 * and `onChoose` navigates, so going back from a product's screen lands on the
 * list rather than on whatever was before the whole surface. A local `useState`
 * here would make the back control skip a level, which is the kind of thing
 * nobody files and everybody feels.
 */
export function Whichever<T>({
  items, id, name, said, icon, face, chosen, onChoose, then, nothing,
}: {
  readonly items: readonly T[];
  readonly id: (item: T) => string;
  readonly name: (item: T) => string;
  /**
   * ⚠️ WHAT IS BEHIND THE ROW, IN A LINE. A list of destinations named by one
   * word each is a list somebody has to open to understand; this is what tells
   * them whether to. Settings areas carry one by declaration, which is why the
   * area is a declaration rather than a heading somebody typed.
   */
  readonly said?: (item: T) => string;
  /**
   * ⚠️ PER ITEM, AND IT WAS NOT — it was one glyph for the whole list, and
   * nothing ever passed it, because a list of identical marks is worse than a
   * list of none. What a per-item glyph is for is a CATEGORY list, where the
   * items are subjects rather than identities: a settings area is not a person
   * or a product and has no face to generate.
   */
  readonly icon?: (item: T) => React.ReactNode;
  /**
   * ⚠️ PER ITEM, AND IT IS WHAT THIS LIST ACTUALLY WANTS. Every caller here is
   * choosing between PRODUCTS, and every one of them passed one glyph for the
   * whole list — so a workspace with six products was six identical cogs with
   * the label doing all the work. A face makes the list scannable, which is the
   * only reason a list exists rather than a menu of words.
   */
  readonly face?: (item: T) => FaceOf;
  /** Which one the address names. Absent means the choice has not been made. */
  readonly chosen?: string;
  readonly onChoose: (id: string) => void;
  readonly then: (item: T) => React.ReactNode;
  /** What is true when there is nothing to choose between at all. */
  readonly nothing: {
    readonly says: string;
    readonly under?: string;
    readonly icon?: React.ReactNode;
  };
}) {
  if (items.length === 0) return <Screen shape="list" refused={nothing} />;

  const only = items.length === 1 ? items[0] : undefined;
  const pick = chosen ? items.find((i) => id(i) === chosen) : only;
  if (pick) return <>{then(pick)}</>;

  return (
    <Screen shape="list">
      <Group>
        {items.map((item) => (
          <NavRow
            key={id(item)}
            icon={icon?.(item)}
            face={face?.(item)}
            label={name(item)}
            under={said?.(item)}
            onOpen={() => onChoose(id(item))}
          />
        ))}
      </Group>
    </Screen>
  );
}
