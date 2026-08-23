/**
 * THE FOUR THINGS A SURFACE CAN BE, DECIDED ONCE.
 *
 * ⚠️ EVERY SCREEN THAT FETCHES HAS FOUR OUTCOMES AND MOST SHIP TWO. Waiting,
 * nothing, a refusal, and the content — and the two that get skipped are the two
 * nobody sees while building, because in development the request is instant and
 * it succeeds. What ships is a screen that renders its empty state during the
 * round trip and its empty state again when the request fails, so "you have no
 * clients" is what a coach is told when the network dropped.
 *
 * ⚠️ SO THE DECISION IS A COMPONENT, NOT A CONVENTION. `Await` is the one place
 * the four-way choice is made; a caller that reaches for a ternary on `loading`
 * has re-implemented three of the four cases and got one of them wrong. This is
 * the same argument as `metrics.ts` and it has the same enforcement.
 *
 * ⚠️ AND `[]` IS NOT "NOT YET", WHICH IS THE FAILURE THIS SHAPE MAKES
 * UNREPRESENTABLE. A state seeded with an empty array and rendered as fact is a
 * wrong answer wearing a loading state's excuse — a badge confidently reading 0,
 * "you're all caught up" over an inbox still loading, a `catch(() => setItems([]))`
 * that turns a FAILED load into "no media yet". `Loaded<T>` has no value to seed
 * it with: the only way to construct one is to say which of the three it is.
 */

import * as React from "react";
import { Circle } from "lucide-react";
import { Alert, Button, EmptyState, Skeleton, Spinner } from "@heroui/react";
import { PLATFORM_PROBLEMS, problem } from "@engine/kernel";
import type { Problem } from "@engine/kernel";
import { TYPE } from "../tokens/type.js";
import { EMPTY_PAD, EMPTY_READ, NUDGE, PAD, ROW, SPACE } from "../tokens/metrics.js";
import { ARRIVE } from "../tokens/motion.js";
import { Waiting, blanks } from "./bones.js";
import { whoFace } from "./face.js";
import { Group, NavRow, QuickActions, TileGrid } from "./surfaces.js";
import { Balance } from "./heads.js";

/* ----------------------------------------------------------------- loaded --- */

/**
 * ⚠️ THREE CASES AND NO DEFAULT. `undefined` meaning "still loading" is the
 * shape this replaces, and it fails in the one place it matters: a request that
 * legitimately resolved to nothing is indistinguishable from one that has not
 * come back.
 */
export type Loaded<T> =
  | { readonly status: "waiting" }
  | { readonly status: "trouble"; readonly problem: Problem }
  | { readonly status: "ready"; readonly data: T };

export const waiting = <T,>(): Loaded<T> => ({ status: "waiting" });
export const trouble = <T,>(problem: Problem): Loaded<T> => ({ status: "trouble", problem });
export const ready = <T,>(data: T): Loaded<T> => ({ status: "ready", data });

/**
 * TWO ANSWERS READ AS ONE.
 *
 * ⚠️ A SCREEN THAT ASKS TWO QUESTIONS STILL HAS ONE EMPTY STATE. Awaited
 * separately, two loads draw two headings over two skeletons, then two "nothing
 * here" sentences stacked — which is a page that looks half-broken rather than a
 * page with nothing on it. Joined, the screen has one waiting, one trouble and
 * one nothing, which is what every other screen in the product has.
 *
 * ⚠️ TROUBLE WINS OVER WAITING, and the FIRST trouble is the one reported. A
 * screen cannot act on two failures at once, and showing a skeleton beside a
 * failure says the page is still coming when half of it never will.
 */
export const both = <A, B>(a: Loaded<A>, b: Loaded<B>): Loaded<readonly [A, B]> => {
  if (a.status === "trouble") return trouble(a.problem);
  if (b.status === "trouble") return trouble(b.problem);
  if (a.status === "waiting" || b.status === "waiting") return waiting();
  return ready([a.data, b.data] as const);
};

/* ------------------------------------------------------------------ await --- */

export interface AwaitProps<T> {
  readonly of: Loaded<T>;
  /**
   * ⚠️ SHAPED LIKE WHAT IS COMING, NOT A SPINNER. See `skeleton.tsx` — a
   * placeholder with the wrong geometry is a layout that jumps, which is worse
   * than one that was briefly blank.
   */
  readonly waiting: React.ReactNode;
  /** What is true when the answer is legitimately nothing. */
  readonly nothing?: React.ReactNode;
  /**
   * ⚠️ EMPTINESS IS THE CALLER'S TO DEFINE FOR ANYTHING THAT IS NOT A LIST. An
   * array of length zero is the case that is always empty and it is handled;
   * a `{ items: [], total: 0 }` is not something this can guess about.
   */
  readonly isNothing?: (data: T) => boolean;
  readonly then: (data: T) => React.ReactNode;
  /** ⚠️ Offered only where the problem says trying again could work. */
  readonly again?: () => void;
}

/**
 * THE FOUR-WAY DECISION, AND IT IS THE ONLY ONE.
 *
 * ⚠️ THE ORDER IS NOT ARBITRARY. Trouble outranks emptiness, because a failed
 * request has no data and `[]` is what a naive reading of it produces; waiting
 * outranks both, because during the round trip neither of the others is known
 * yet. Getting this order wrong is how a screen comes to say "nothing here" for
 * a second on every single load.
 */
export function Await<T>({ of, waiting: skeleton, nothing, isNothing, then, again }: AwaitProps<T>) {
  if (of.status === "waiting") return <>{skeleton}</>;
  if (of.status === "trouble") return <Trouble problem={of.problem} again={again} />;

  const empty = nothingIn(of.data, isNothing);
  /*
    ⚠️ `undefined` IS "NONE SUPPLIED"; `null` IS "DRAW NOTHING", AND THEY ARE NOT
    THE SAME ANSWER. The test was truthiness, so a caller who deliberately
    asked for silence on an empty result got the CONTENT branch instead — `then`
    ran with an empty array, and In your words drew a section heading and its
    description over no rows at all. A screen that looks half-loaded is the worst
    reading of an empty one, and the caller had said exactly what it wanted.
  */
  if (empty && nothing !== undefined) return <>{nothing}</>;

  /*
    ⚠️ AND THE FIFTH OUTCOME: THE ANSWER ARRIVED AND THE SCREEN COULD NOT DRAW
    IT. `then` runs against a shape the caller ASSERTED — `useLoad<Answer>` is a
    type argument, not a check — so a route that answers `{ book, runs }` to a
    screen expecting `{ jobs }` throws inside render. Without a boundary React
    unmounts the whole tree and the page goes black: no message, no retry, no
    clue, and nothing in any log a person can reach.

    ⚠️ AND THE SCREEN THAT CRASHES IS THE ONE ABOUT THE UNCONFIGURED STATE. That
    is not a coincidence and it is why this is here rather than in one page: the
    branches a shape mismatch reaches first are the ones nobody has data for yet,
    so the screens that explain an empty deployment are exactly the screens that
    go dark on a fresh one — which is the moment somebody most needs them.
  */
  return <Drew again={again}>{then(of.data)}</Drew>;
}

/**
 * ⚠️ A CLASS, BECAUSE REACT HAS NO HOOK FOR THIS. `componentDidCatch` is the only
 * way to keep a render fault inside the page it happened on, and it is worth the
 * one class in this package: the alternative is every screen being one wrong
 * field name away from a blank browser window.
 *
 * ⚠️ IT REPORTS THE SAME `Trouble` A FAILED REQUEST DOES. A person cannot act on
 * the difference between "the server would not answer" and "the answer was not
 * what this page expected", and inventing a second vocabulary for it would put a
 * developer's distinction on a customer's screen.
 */
class Drew extends React.Component<
  { readonly children: React.ReactNode; readonly again?: () => void },
  { readonly broke: boolean }
> {
  override state = { broke: false };

  static getDerivedStateFromError() { return { broke: true }; }

  override componentDidCatch(thrown: unknown) {
    /* ⚠️ THE CONSOLE IS WHERE THIS IS DIAGNOSED, so it says what threw rather
       than only that something did. Nobody can reach a Worker log from a phone;
       this is the one trace the person looking at the blank page can get. */
    console.error("a screen could not draw its answer", thrown);
  }

  override render() {
    if (!this.state.broke) return <>{this.props.children}</>;
    return (
      <Trouble
        problem={problem(PLATFORM_PROBLEMS, "platform.undrawable")}
        {...(this.props.again ? { again: this.props.again } : {})}
      />
    );
  }
}

/**
 * ⚠️ WHAT "EMPTY" MEANS, IN ONE PLACE, BECAUSE TWO THINGS NEED THE ANSWER.
 * `Await` needs it to choose a branch, and `Screen` needs it to decide where the
 * primary action goes — an empty screen carries it inside the empty state and a
 * populated one docks it (see `screen.tsx`). Two implementations of "is there
 * anything here" is how a screen comes to show the same button twice.
 *
 * ⚠️ AND ANYTHING THAT IS NOT A LIST IS THE CALLER'S TO DEFINE. An array of
 * length zero is the case that is always empty; a `{ items: [], total: 0 }` is
 * not something this can guess about, and guessing wrong renders "nothing here"
 * over a real answer.
 */
export const nothingIn = <T,>(data: T, isNothing?: (d: T) => boolean): boolean =>
  isNothing ? isNothing(data) : Array.isArray(data) && data.length === 0;

/* ---------------------------------------------------------------- trouble --- */

/**
 * A REFUSAL, IN THE WORDS THE PLATFORM ALREADY WROTE.
 *
 * ⚠️ EVERY FIELD ON THIS COMES FROM THE `Problem`, WHICH IS THE POINT. The
 * kernel decided what a refusal says, whether trying again could plausibly work
 * and what tone it carries; a screen that re-words it is a screen where the same
 * failure reads differently depending on where you hit it. There is no `message`
 * prop and there must not be one.
 *
 * ⚠️ `again` IS OFFERED ONLY WHERE `retryable` SAYS SO. A retry button on a
 * `forbidden` is a person hammering a door that will never open, and it teaches
 * them that our buttons do not mean anything.
 *
 * ⚠️ AND THE REFERENCE IS SHOWN WHEREVER THERE IS ONE. It is in the log beside
 * the cause, so support finds in seconds what is otherwise a conversation that
 * starts "it said something went wrong".
 */
export function Trouble({ problem, again }: {
  readonly problem: Problem;
  readonly again?: () => void;
}) {
  return (
    <Alert {...ARRIVE} status={statusOf(problem.tone)}>
      <Alert.Indicator />
      {/*
        ⚠️ THE ACTION GOES UNDER THE SENTENCE, NOT BESIDE IT. `.alert` is a ROW
        and `.alert__content` is the only child that grows, so a button as a
        third sibling takes its width out of the text — which turned a
        seven-word title into two cramped lines with a control wedged against
        them. A refusal is read first and acted on second, and the layout has to
        agree with that order.

        ⚠️ AND THE CONTENT COLUMN NEEDS A GAP. `.alert__content` ships none, so
        the title, the sentence and the control sat flush against each other in
        a component whose whole job is to be read under pressure.
      */}
      <Alert.Content className={SPACE.tight}>
        <Alert.Title>{problem.title}</Alert.Title>
        {problem.detail ? <Alert.Description>{problem.detail}</Alert.Description> : null}
        {/* ⚠️ ONLY WHERE THE SENTENCE DOES NOT ALREADY CARRY IT. Several
            problems interpolate `{ref}` into their own detail, and printing it
            again underneath is the reference twice with nothing between them —
            which reads as a rendering fault rather than as thoroughness. */}
        {problem.ref && !problem.detail?.includes(problem.ref) ? (
          <Alert.Description><span className={TYPE.code}>{problem.ref}</span></Alert.Description>
        ) : null}
        {again && problem.retryable ? (
          <Button size="sm" variant="tertiary" onPress={again}>Try again</Button>
        ) : null}
      </Alert.Content>
    </Alert>
  );
}

/**
 * ⚠️ THE KERNEL'S FIVE TONES AND THE LIBRARY'S FIVE STATUSES ARE NOT THE SAME
 * FIVE, and the mapping is here rather than at every call site. Both have
 * success, warning and danger; the kernel's `info` is the library's `accent` and
 * its `neutral` is `default`. Passing a tone straight through compiles for four
 * of them and silently paints an informational refusal in the default grey,
 * which is the reading a person acts on least.
 */
type Status = "default" | "accent" | "danger" | "success" | "warning";
const STATUS: Readonly<Record<Problem["tone"], Status>> = {
  neutral: "default",
  info: "accent",
  success: "success",
  warning: "warning",
  danger: "danger",
};
const statusOf = (tone: Problem["tone"]): Status => STATUS[tone] ?? "default";

/* ---------------------------------------------------------------- nothing --- */

/**
 * WHAT IS TRUE WHEN THERE IS NOTHING HERE.
 *
 * ⚠️ AN EMPTY STATE IS A BEGINNING, NOT A REPORT. "0 results" is the query's
 * answer; "Nothing here yet" is a person's, and it says the same thing while
 * adding that this is where something goes. The tone rules enforce the
 * difference — see `kernel/src/tone.ts`'s `empty` voice.
 *
 * ⚠️ AND IT CARRIES THE ACTION THAT WOULD END IT, where there is one. An empty
 * state with no way out of it is a dead end with good manners.
 */
export function Nothing({ icon, says, under, offer, does }: {
  /**
   * ⚠️ THE ONE MARK, AND IT IS THE SCREEN'S OWN. A glyph from the same set the
   * navigation uses, so an empty roster is a quiet drawing of PEOPLE rather than
   * a generic shrug — the emptiness is about a particular thing and the mark is
   * what says which. Absent draws the neutral one, which is honest for a surface
   * with no noun (`glyphOf`).
   */
  readonly icon?: React.ReactNode;
  readonly says: string;
  readonly under?: string;
  readonly offer?: { readonly label: string; readonly onDo: () => void };
  /**
   * ⚠️ FOR AN ACTION THAT IS NOT A CALLBACK — a sheet's trigger, a file picker.
   * Without it, a screen whose only way forward opens a `Tray` had to put that
   * trigger in a `Card` of its own next to the empty state, which is a button
   * with a box drawn round it (DESIGN.md §4). The way out of nothing belongs
   * INSIDE the nothing.
   */
  readonly does?: React.ReactNode;
}) {
  return (
    <EmptyState {...ARRIVE} className={`flex flex-col items-center ${SPACE.snug} ${EMPTY_PAD}`}>
      {/*
        ⚠️ A HALO, NOT AN ILLUSTRATION. The obvious move is a picture, and it is
        the wrong one twice over: a drawing per empty state is a drawing per
        screen for the one moment a screen has nothing to show, and any picture
        with colour in it fights the workspace whose brand the page is wearing.
        This is one plate of the page's OWN light — `currentColor`, so it takes
        the ground's hue wherever it lands and takes the accent nowhere.

        ⚠️ AND IT IS A VALUE, NOT A RING (D7). A hairline round it is the second
        way of saying "separate thing" in a design that has one, and the fill is
        already doing the work — a plate at 7% of the ink is findable on every
        tier this can land on.

        ⚠️ AND IT IS SIZED IN `rem` RATHER THAN BY A FACE SIZE. The face scale is
        for a subject; this is furniture, and borrowing `panel` would tie an
        empty roster's mark to whatever a person's avatar measures next.
      */}
      <span
        aria-hidden
        className="flex size-20 items-center justify-center rounded-[1.75rem]
          bg-current/[0.07] [&>svg]:size-8 [&>svg]:opacity-40"
      >
        {/* ⚠️ THE NEUTRAL MARK, AND IT IS THE ONE ICON A SCREEN MAY DRAW
            ITSELF. `glyphs.test.mjs` refuses a direct lucide import of anything
            the registry ANIMATES, because a still copy of a lively mark is the
            same picture until somebody presses it. A circle has no character to
            lose, and routing it through the registry would make this file
            import the shell — a cycle for no gain. */}
        {icon ?? <Circle />}
      </span>
      {/*
        ⚠️ THE SENTENCE IS `section`, NOT `label`. An empty state is the only
        thing on the screen when it shows, so at label weight it read as a caption
        for a missing thing rather than as the answer to what is here.
      */}
      <p className={`${TYPE.section} text-center text-balance`}>{says}</p>
      {under
        ? <p className={`${TYPE.note} text-center text-balance ${EMPTY_READ}`}>{under}</p>
        : null}
      {/* ⚠️ A VARIANT, NEVER A COLOUR. Naming one here would be this file
          deciding what an accent looks like, which is the library's answer and
          not ours (D7). */}
      {offer
        ? (
          <span className={NUDGE.over}>
            <Button variant="primary" onPress={offer.onDo}>{offer.label}</Button>
          </span>
        )
        : null}
      {does}
    </EmptyState>
  );
}

/* ---------------------------------------------------------------- waiting --- */

/**
 * ⚠️ A SPINNER IS FOR AN ACTION, A SKELETON IS FOR A SURFACE, AND SWAPPING THEM
 * IS THE MISTAKE. A spinner says "something is happening and I cannot tell you
 * how far"; on a page that is about to fill with rows it says nothing and then
 * the layout jumps. A skeleton says where the rows will be. Use this inside a
 * button or beside a control, and `skeleton.tsx` for everything else.
 */
export function Working({ says }: { readonly says?: string }) {
  return (
    <span className={`flex items-center ${SPACE.tight}`} role="status">
      <Spinner size="sm" />
      {says ? <span className={TYPE.note}>{says}</span> : null}
    </span>
  );
}

/* -------------------------------------------------------------- skeletons --- */

/**
 * THE PLACEHOLDER IS THE GEOMETRY OF WHAT IS COMING.
 *
 * ⚠️ A GREY BOX OF THE WRONG SIZE IS WORSE THAN A BLANK. The entire value of a
 * skeleton is that nothing moves when the content lands — get the height wrong
 * and you have added a jump that would not have happened, plus a flicker. So
 * there is one skeleton per real shape in this vocabulary, each built from the
 * SAME metrics as the component it stands in for, and a component whose box
 * changes changes its skeleton in the same commit.
 *
 * ⚠️ AND THE SHIMMER IS `Skeleton`'S OWN. The library animates it and switches
 * it off under both reduced-motion settings; a hand-rolled pulse would be a
 * fourth kind of motion in a system that has three.
 */

/**
 * ⚠️ REAL ROWS IN A REAL CARD, DRAWN AS BONES — not a copy of their measurements.
 * This wrote `ROW.gap ROW.tap ROW.pad` out for itself and came to 72px against a
 * `NavRow`'s 80: measured, 24px short over three rows, so every list shifted up
 * when it landed. The row's geometry is the row's, and the only thing left here
 * is how many of them and whether they have a face.
 */
const BONE_FACE = whoFace("bone");
/*
  ⚠️ NEVER RENDERED, AND NOT BLANK EITHER. Under `Waiting` a row draws bars and
  reads only whether there IS a second line and a face — so an empty string is
  falsy and quietly asks for a ONE-line row, which is 8px shorter than the two
  this has always drawn. Measured as 24px missing over three rows, by the check
  that exists for exactly this.
*/
const SOME = "…";
/** ⚠️ A handler a placeholder can never reach — nothing under `Waiting` is pressable. */
const NOTHING = () => undefined;

export function RowsWaiting({ rows = 3, lead = true }: {
  readonly rows?: number;
  readonly lead?: boolean;
}) {
  return (
    <Waiting>
      <Group>
        {blanks(rows).map((b) => (
          /* ⚠️ A SEED THAT DRAWS NOTHING, because the row only asks whether
             there IS a face — under `Waiting` it is a circle, and the drawing
             behind it is never rendered. */
          <NavRow key={b.id} label={SOME} under={SOME} face={lead ? BONE_FACE : undefined} />
        ))}
      </Group>
    </Waiting>
  );
}

/**
 * THE ONE NUMBER A SCREEN IS ABOUT, WAITING — AND IT IS THE REAL BLOCK.
 *
 * ⚠️ COMPOSITION, NOT A DRAWING, WHICH IS THE WHOLE POINT OF `Waiting`. A hero
 * is 64px of padding above, 40 below, a `vast` gap between its two halves, three
 * lines at three roles and a row of `lg` circles — six measurements, ~270px of a
 * phone. Written out here as bars it would be six chances to be wrong, and every
 * one of them moves the number when the content lands. Rendering the REAL
 * `Balance` and the REAL `QuickActions` under `Waiting` gives back their layout
 * with the leaves as bones, so there is nothing to keep in step.
 *
 * ⚠️ WHAT IS PASSED IS PRESENCE AND COUNT, AND NOTHING ELSE. The slots decide
 * whether a line exists, not what it says — a hero with no eyebrow is 20px
 * shorter, so it is the caller's to state — and `acts` is the count, which is
 * the one thing bones cannot know (`bones.tsx`).
 */
export function HeroWaiting(
  { eyebrow = true, identifier = true, acts = 0 }: {
    readonly eyebrow?: boolean;
    readonly identifier?: boolean;
    readonly acts?: number;
  },
) {
  return (
    <Waiting>
      <Balance
        eyebrow={eyebrow ? SOME : undefined}
        /* ⚠️ A NODE THAT IS NEVER RENDERED — under `Waiting`, `Balance` draws its
           own bar in its own `display` box. What this decides is nothing; the
           prop is required because a hero without a figure is not a hero. */
        figure={SOME}
        identifier={identifier ? SOME : undefined}
        under={acts > 0
          ? (
            <QuickActions
              actions={blanks(acts).map((b) => (
                { id: b.id, label: SOME, icon: null, onDo: NOTHING }))}
            />
          )
          : undefined}
      />
    </Waiting>
  );
}

/** ⚠️ A number and its label, at `TYPE.display`'s height rather than a guess. */
export function FigureWaiting({ count = 1 }: { readonly count?: number }) {
  return (
    <div className={`flex flex-col ${SPACE.tight}`}>
      {Array.from({ length: count }, (_, i) => (
        <React.Fragment key={i}>
          <Skeleton className="h-3 w-24 rounded-full" />
          <Skeleton className="h-10 w-40 rounded-full" />
        </React.Fragment>
      ))}
    </div>
  );
}

/**
 * ⚠️ THE CHART'S OWN ASPECT, NOT A SQUARE. Every frame in `chart/` is 320×120,
 * so this is that ratio — a placeholder at any other shape is a card that
 * changes height the moment real data lands.
 */
export function ChartWaiting() {
  return (
    <div className={`flex w-full flex-col ${SPACE.snug}`}>
      <Skeleton className="aspect-[320/120] w-full rounded-2xl" />
      <div className={`flex ${SPACE.snug}`}>
        <Skeleton className="h-3 w-20 rounded-full" />
        <Skeleton className="h-3 w-20 rounded-full" />
      </div>
    </div>
  );
}

/**
 * ⚠️ THE REAL GRID, DRAWN AS BONES. This wrote its own
 * `minmax(min(8rem, 100%), 1fr)` against `TileGrid`'s `min(6rem, 45%)`, so six
 * tiles measured 236px in three columns and waited behind 360px in two — half a
 * screen taller, in the wrong shape, and the page jumped 124px on landing. The
 * columns are a property of the container, so the container is shared.
 */
export function TilesWaiting({ tiles = 4 }: { readonly tiles?: number }) {
  /* ⚠️ THE GRID'S PROPS STAY REQUIRED, AND THE PLACEHOLDER FILLS THEM. Making
     `label`, `icon` and `onOpen` optional so this could omit them would loosen
     a real component's contract for the sake of its own stand-in — and the next
     caller to forget a label would typecheck. */
  return (
    <Waiting>
      <TileGrid
        tiles={blanks(tiles).map((b) => ({ ...b, label: "", icon: null, onOpen: NOTHING }))}
      />
    </Waiting>
  );
}

/** ⚠️ The geometry `Listing` draws: a header line, then cell bars per column. */
export function TableWaiting({ cols = 4, rows = 5 }: {
  readonly cols?: number;
  readonly rows?: number;
}) {
  return (
    <div className={`flex flex-col ${SPACE.snug}`} role="status" aria-label="Loading table">
      <div className={`flex ${SPACE.roomy}`}>
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className="h-4 grow rounded-full" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={`flex items-center ${SPACE.roomy} h-11`}>
          {Array.from({ length: cols }, (_, i) => (
            <Skeleton key={i} className="h-4 grow rounded-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** ⚠️ A label bar over a control-height box — what every `forms.tsx` control is. */
export function FormWaiting({ fields = 3 }: { readonly fields?: number }) {
  return (
    <div className={`flex flex-col ${SPACE.roomy}`} role="status" aria-label="Loading form">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className={`flex flex-col ${SPACE.tight}`}>
          <Skeleton className="h-4 w-28 rounded-full" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/**
 * ⚠️ THE LAST LINE IS SHORT, WHICH IS THE WHOLE TELL. A paragraph placeholder
 * of equal-length bars reads as a table; real prose ends mid-line, and copying
 * that is the difference between a skeleton somebody believes and one that looks
 * like a loading bug.
 */
export function TextWaiting({ lines = 3 }: { readonly lines?: number }) {
  return (
    <div className={`flex flex-col ${SPACE.tight}`}>
      {/* ⚠️ THE LAST LINE IS A SEPARATE ELEMENT RATHER THAN A TERNARY, which
          also makes the rule structural instead of a condition somebody has to
          read. */}
      {Array.from({ length: Math.max(0, lines - 1) }, (_, i) => (
        <Skeleton key={i} className="h-4 w-full rounded-full" />
      ))}
      {lines > 0 ? <Skeleton className="h-4 w-[55%] rounded-full" /> : null}
    </div>
  );
}
