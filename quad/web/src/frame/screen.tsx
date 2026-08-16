/**
 * A SCREEN IS A DECLARATION, NOT A LAYOUT.
 *
 * ⚠️ THE FAULT THIS EXISTS TO REMOVE IS NOT UGLINESS, IT IS DRIFT. Every screen
 * in the hub hand-assembled the same five decisions — which column width, which
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
import { Band, Page, PageCrown, Spacer, type Slot, type Width } from "./layout.js";
import { Group, NavRow } from "../parts/surfaces.js";
import { worldFor, type FaceOf } from "../parts/face.js";
import type { Tone } from "@quad/kernel";
import type { Ambience } from "../tokens/ambience.js";
import type { Density } from "../scene/index.js";
import { Await, Nothing, RowsWaiting, FigureWaiting, FormWaiting, TextWaiting, TilesWaiting, nothingIn, type Loaded } from "../parts/state.js";
import { Stack } from "./layout.js";
import { PAD, SAFE_BOTTOM, SPACE } from "../tokens/metrics.js";
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
  readonly sky?: Ambience;
  /**
   * THE ONE THING THIS PAGE IS ABOUT — AND IT DECIDES THREE THINGS AT ONCE.
   *
   * ⚠️ THAT IS THE WHOLE OF LAYOUTS 2.0, AND IT IS A FIX RATHER THAN A
   * CONVENIENCE. The hub used to compute the ground, the hero face and the
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
   * ⚠️ AN INTENT, AND THE DEFAULT IS THE INTERESTING PART. A page with a subject
   * is somewhere somebody ARRIVED — the world is most of what is on it, so it
   * runs `rich`. A page wearing a material is a page with work on it. Named here
   * only where a screen knows better than that.
   */
  readonly density?: Density;
  readonly tone?: Tone;
  /**
   * ⚠️ ABSENT WHERE THE SCREEN IS ITS OWN HEADING — the hub's root is a face, an
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
  { sky = "plain", subject, density, tone, frame, nav, children }: LayoutProps,
) {
  const world = worldFor(subject) ?? undefined;
  const inside = frame ? <Framed frame={frame}>{children}</Framed> : children;
  return (
    <Page
      sky={sky}
      world={world}
      density={density ?? (subject ? "rich" : "even")}
      tone={tone}
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
  /** ⚠️ What is true when the answer is legitimately nothing. */
  readonly nothing?: { readonly says: string; readonly under?: string };
  /**
   * ⚠️ A FIFTH OUTCOME, AND IT IS NOT `trouble`. "You may not see this" is a
   * fact about the person, known before any request is made — a `Problem` is a
   * fact about a request that failed. Screens used to answer it with a bare
   * `Nothing` returned EARLY, above the frame, which took the crown with it: no
   * title, no way back, a sentence alone on a page. The refusal is content now,
   * and the screen it refuses still has a name and a way out of it.
   */
  readonly refused?: { readonly says: string; readonly under?: string };
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
const shows = <T,>(of: Loaded<T> | undefined, isNothing?: (d: T) => boolean): "act" | "empty" | "no" =>
  of === undefined ? "act"
    : of.status !== "ready" ? "no"
      : nothingIn(of.data, isNothing) ? "empty" : "act";

export function Screen<T = unknown>({
  shape, title, under, back, leave, does, also = [],
  of, then, isNothing, again, waiting, nothing, refused, children,
}: ScreenProps<T>) {
  const preset = SHAPES[shape];
  /* ⚠️ A refusal offers nothing to act on, so the primary stands down with it. */
  const where = refused ? "no" : shows(of, isNothing);
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
    ? <Nothing says={refused.says} under={refused.under} />
    : of !== undefined
    ? (
      <Await
        of={of}
        again={again}
        waiting={waiting ?? preset.waiting()}
        isNothing={isNothing}
        nothing={nothing
          ? (
            <Nothing
              says={nothing.says}
              under={nothing.under}
              /* ⚠️ The way out lives IN the empty state — see `shows`. */
              does={does ? <Button variant="primary" onPress={does.onDo}>{does.label}</Button> : undefined}
            />
          )
          : undefined}
        then={(data) => <Arriving space={preset.space}>{then?.(data)}</Arriving>}
      />
    )
    : <Arriving space={preset.space}>{children}</Arriving>;

  return (
    <>
      <PageCrown
        bleed="hold"
        width={preset.width}
        title={name}
        face={subject ?? undefined}
        under={sub}
        back={out}
        leave={how}
        actions={also.slice(0, 2)}
        /* ⚠️ THE SAME ACT, DRAWN TWICE AND SHOWN ONCE — see `PageCrown`. Two
           declarations would drift the day one of them gets new copy. */
        does={where === "act" ? does : undefined}
      />

      <Band bleed="hold" width={preset.width}>
        <div className="pb-2">{body}</div>
      </Band>

      {/* ⚠️ THE SCREEN OWNS THE SPACE UNDER ITS CONTENT, so the dock below is at
          the bottom of the VIEWPORT on a short page and at the bottom of the
          SCROLL on a long one. Without it a page with three rows on it put the
          primary action floating in the middle of an empty screen — sticky does
          nothing on a page that does not scroll, which is exactly the page
          where it looks most like a mistake. */}
      <Spacer />

      {/*
        ⚠️ DOCKED ON A PHONE ONLY, because on a desktop the crown is already in
        view and a bar welded across the bottom of a wide window is a mobile
        pattern wearing a desktop's clothes.
      */}
      {where === "act" && does
        ? (
          <div className={`sticky bottom-0 z-10 w-full md:hidden ${PAD} ${SAFE_BOTTOM}`}>
            <Band bleed="hold" width={preset.width}>
              <Button
                className="w-full"
                variant={does.tone === "danger" ? "danger" : "primary"}
                isDisabled={does.disabled}
                onPress={does.onDo}
              >
                {does.icon}
                {does.label}
              </Button>
            </Band>
          </div>
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
 * ⚠️ FRAGMENTS ARE FLATTENED, AND SKIPPING THAT COSTS EVERY GAP ON THE SCREEN.
 * `then` naturally returns `<>…</>` — it is the shape the type asks for — and
 * `React.Children.toArray` counts that as ONE child. So the stack had a single
 * item, its `gap` applied between nothing, and three cards ran together with
 * their radii overlapping. Nothing throws, nothing warns, and it looks like a
 * z-index bug rather than a missing gap.
 */
const blocksIn = (node: React.ReactNode): React.ReactNode[] =>
  React.Children.toArray(node).flatMap((child) =>
    React.isValidElement(child) && child.type === React.Fragment
      ? blocksIn((child.props as { readonly children?: React.ReactNode }).children)
      : [child]);

function Arriving({ space, children }: {
  readonly space: "snug" | "roomy";
  readonly children: React.ReactNode;
}) {
  const blocks = blocksIn(children).filter(Boolean);
  return (
    <Stack space={space}>
      {blocks.map((child, i) => (
        <div key={i} {...ARRIVE} style={arriveAt(i)}>{child}</div>
      ))}
    </Stack>
  );
}

/* ------------------------------------------------------------------ board --- */

/**
 * A GRID WHOSE ITEMS ARE NOT ALL THE SAME SIZE.
 *
 * ⚠️ THE SPANS ARE WHAT MAKES IT A BOARD RATHER THAN A LIST WITH COLUMNS. A grid
 * of identical tiles says every one of them matters equally, which is almost
 * never true and is the reason a wall of equal cards reads as a menu somebody
 * gave up sorting. One wide tile at the top is a hierarchy, expressed in the
 * only channel a grid has.
 *
 * ⚠️ AND IT IS TWO COLUMNS ON A PHONE, ALWAYS. One column is a list and should
 * have been declared as one; three is a phone showing 100px-wide cards. The
 * widening happens at `md`, where there is room for it and not before.
 */
export function Board({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 ${SPACE.snug}`}>{children}</div>
  );
}

/**
 * ⚠️ `wide` AND `tall` RATHER THAN NUMBERS. A tile that could ask for four
 * columns is a tile that breaks the board on a phone, where there are two — so
 * the vocabulary offers the two spans a two-column grid can honour and nothing
 * else. On a wide board they become two of four, which is the same proportion.
 */
export function Tile({ wide, tall, children }: {
  readonly wide?: boolean;
  readonly tall?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <div className={`${wide ? "col-span-2" : ""} ${tall ? "row-span-2" : ""} min-w-0`}>
      {children}
    </div>
  );
}

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
  items, id, name, icon, face, chosen, onChoose, then, nothing,
}: {
  readonly items: readonly T[];
  readonly id: (item: T) => string;
  readonly name: (item: T) => string;
  /** ⚠️ The same glyph for every item — a CATEGORY, not an identity. */
  readonly icon?: React.ReactNode;
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
  readonly nothing: { readonly says: string; readonly under?: string };
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
            icon={icon}
            face={face?.(item)}
            label={name(item)}
            onOpen={() => onChoose(id(item))}
          />
        ))}
      </Group>
    </Screen>
  );
}
