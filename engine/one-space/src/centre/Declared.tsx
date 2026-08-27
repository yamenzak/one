/**
 * A SCREEN AN APP DECLARED, FETCHED AND DRAWN — no file in the product.
 *
 * ⚠️ THIS IS THE HALF THAT MAKES THE DECLARED SURFACE REACHABLE. The kernel
 * refuses a body that does not compose, the runtime answers `/api/screen/<id>`
 * with the record and every view the body reads, and `Body` draws it — and
 * between the last two there was nothing, so a perfectly declared screen was a
 * manifest entry a person could not open.
 *
 * ⚠️ ONE ROUND TRIP, MANY REGIONS. The door answers a screen's views TOGETHER,
 * so the wire is one request; what each block waits on is still its own view,
 * because `Has.views` is a map of outcomes and `Region` reads them one at a
 * time. A heading and a note are never held behind the slowest list on the page.
 *
 * ⚠️ AND A DECLARED BODY OUTRANKS A MOUNTED COMPONENT — see `AppSurface`. That
 * order is what makes a port a deletion: a screen gains a `body`, the file that
 * drew it stops being reached, and the day it is removed nothing changes.
 */

import * as React from "react";
import {
  Consequences,
  Await, Screen, Trouble, Waiting, ready, trouble, useTelling, waiting, type Loaded,
} from "@engine/design";
import { Doing, asks, type Ran } from "@engine/design/doing";
/* ⚠️ NOT THROUGH THE BARREL, WHICH IS THE RENDERER'S OWN RULE. `@engine/design`
   re-exports thirty components; the entry chunk carries the contract and this
   page is in the product's, so the deep path is what keeps the two apart. */
import { Body, type Has } from "@engine/design/body";
/* ⚠️ THE THIRD KIND OF SCREEN, AND ITS OWN CHUNK. A flow carries a camera and a
   file picker behind it; on the same path as a body every list screen in the
   product would download them. */
const Create = React.lazy(() => import("@engine/design/create")
  .then((m) => ({ default: m.Create })));
/* ⚠️ THE PATH AND THE ANSWER SHAPE COME FROM THE KERNEL, NOT THE RUNTIME. The
   runtime is the worker's and importing it here would put a D1 client in a
   browser bundle — so what both ends need is declared once, in the layer both
   are allowed to reach. */
import {
  BLOCKS, PLATFORM_PROBLEMS, SCREEN_PATH, askedOf, fillWith, isGroup, opensOn, problem,
  upFrom, verbId, viewsIn,
  type Fields, type Fill, type GuideBook, type MilestoneBook, type Problem, type Raised,
  type ScreenSpec,
  type SurfaceSpec, type Viewed,
} from "@engine/kernel";
import type { Answers } from "@engine/design/create";
import { api, forget } from "../api.js";
import { today, useLoad } from "./data.js";

/**
 * HOW FAR THIS WORKSPACE HAS GOT — the platform's one answer, for every product.
 *
 * ⚠️ THE EVENTS, NEVER THE STEPS. A checklist ticks a step whose `done` event is
 * in these lists; a screen that decided for itself would leave the step undone
 * when the same thing is done from the API or from the second screen that also
 * does it, and then tell somebody to finish what they finished last week.
 */
interface Far {
  readonly counts: Readonly<Record<string, number>>;
  /** ⚠️ What THIS person has done. Half a checklist is theirs, not the workspace's. */
  readonly mine: readonly string[];
  readonly fresh: readonly { readonly id: string }[];
  readonly said: readonly string[];
}

/** What the door answers. */
interface Drawn {
  readonly record: Readonly<Record<string, unknown>> | null;
  readonly views: Readonly<Record<string, Viewed>>;
  /** ⚠️ What each narrowing offers — see `Drawn.picks`. */
  readonly picks: Readonly<Record<string, readonly { id: string; label: string }[]>>;
  /** ⚠️ The acts this body offers, with their input — see `Drawn.acts`. */
  readonly acts: Readonly<Record<string, {
    summary: string; input: Fields; fills?: Readonly<Record<string, Fill>>;
    /** ⚠️ What a `ref` input may be — see `Act.choices`. */
    choices?: Readonly<Record<string, readonly { id: string; label: string }[]>>;
  }>>;
  /** ⚠️ Which of the subject's fields this screen may change — see `Drawn.edits`. */
  readonly edits: Fields;
  /** ⚠️ What this record is called — see `Drawn.name`. `null` where nothing does. */
  readonly name: string | null;
  /** ⚠️ Whether this record can be put aside, and its words — see `Drawn.aside`. */
  readonly aside: {
    of: string; name: string; bin: boolean; already: "frozen" | "binned" | null;
  } | null;
}

/**
 * ⚠️ AN ABSENT VIEW IS EMPTY, NOT MISSING. The door runs only the views a body
 * reads, and it may legitimately answer without one — a view over a collection
 * whose rows were all erased. `undefined` there would make `Region` wait for
 * something already answered, so the screen keeps a skeleton for ever.
 */
const NOTHING: Viewed = { items: [], count: 0 };

const spread = (
  ids: readonly string[], got: Loaded<Drawn>,
): Readonly<Record<string, Loaded<Viewed>>> => Object.fromEntries(ids.map((id) => [
  id,
  got.status === "ready" ? ready(got.data.views[id] ?? NOTHING)
    : got.status === "trouble" ? trouble(got.problem)
      : waiting<Viewed>(),
]));

/**
 * ⚠️ WHETHER THIS BODY PLACES A BOOK BLOCK — see `BlockEntry.book`. The read
 * behind them is the platform's and it costs a round trip, so a screen that
 * places neither must not pay for one. Read off the declaration rather than
 * fetched-and-discarded, which is what "the manifest says what it needs" means.
 */
const booksIn = (body: SurfaceSpec): boolean =>
  body.blocks.some((placed) => (isGroup(placed) ? placed.of : [placed])
    .some((b) => Boolean(BLOCKS[b.block]?.book)));

export function Declared({ screen, screens, at, go, currency, app }: {
  readonly screen: ScreenSpec;
  /**
   * ⚠️ EVERY SCREEN THIS PRODUCT DECLARES, because `goes` names one by ID and an
   * address is what a browser needs. Turning the id into a route here is what
   * keeps a route out of the manifest: one written there would be a second
   * spelling of an address the manifest already holds, and the two drift the
   * first time a screen moves.
   */
  readonly screens: readonly ScreenSpec[];
  /**
   * ⚠️ THE SEGMENTS PAST THE SCREEN'S OWN ROUTE — see `AppScreen.at`. The first
   * is the record this screen is about, which is what makes a detail screen
   * linkable and reloadable rather than a state somebody navigated into.
   */
  readonly at: readonly string[];
  readonly go: (route: string) => void;
  readonly currency?: string | undefined;
  /**
   * ⚠️ THE PRODUCT'S OWN BOOKS AND WHAT THIS PERSON HOLDS — see `Has.book` and
   * `BlockSpec.leads`. Both come from the centre, which already resolved them to
   * draw the nav; a second request for either would be asking the server what it
   * has already said.
   */
  readonly app: {
    readonly guide: GuideBook;
    readonly milestones: MilestoneBook;
    readonly permissions: readonly string[];
    /** ⚠️ What this workspace chose, for the settings a flow starts from. */
    readonly chose?: Readonly<Record<string, unknown>>;
    /** ⚠️ Which of its operations spend credits — see `meteredIds`. */
    readonly metered?: readonly string[];
  };
}) {
  /*
    ⚠️ WHICH OPERATION IS BEING ASKED ABOUT, and `null` for none. An operation
    that takes nothing never lands here — it runs on the press, because a sheet
    holding one button to confirm a press somebody already made is a second press
    for nothing.
  */
  const [asking, setAsking] = React.useState<string | null>(null);
  /* ⚠️ EVERY ACT SAYS SO — see `Telling`. Putting a record aside is the one act
     on this screen whose outcome is that the screen leaves, so without a
     sentence the only evidence it worked is a page that changed. */
  const tell = useTelling();
  /*
    ⚠️ WHAT SOMEBODY NARROWED THIS SCREEN TO, HELD HERE AND SENT WITH THE READ —
    see `PickSpec`. It is not in the address on purpose: narrowing a list is a
    filter rather than a destination, and putting it in the path would make the
    back gesture undo a filter one step at a time before it left the screen.

    ⚠️ AND CHANGING IT IS A REFETCH, WHICH IS THE WHOLE POINT. The narrowing
    reaches an asked view's input on the worker; held in the browser it would
    move a control and leave the figures under it exactly where they were.
  */
  /*
    ⚠️ SEEDED FROM THE BODY, BECAUSE AN UNSENT DEFAULT IS A CONTROL THAT LIES.
    This started empty, so the very first read carried no `pick.*` at all while
    the control under it drew its first option as chosen — a report showing
    "7 days" over a month of movements, with nothing anywhere disagreeing. What
    the manifest says the screen opens on is what goes out with the first read.
  */
  const [picked, setPicked] = React.useState<Readonly<Record<string, string>>>(
    /* ⚠️ THE KERNEL'S OWN READING, which is also what the renderer draws the
       chosen segment from — see `opensOn`. Answering it here as well is how the
       control and the numbers under it come to disagree. */
    () => Object.fromEntries(
      (screen.body?.picks ?? []).map((one) => [one.id, opensOn(one)])),
  );
  const record = at[0];
  /* ⚠️ SENT WITH EVERY SCREEN, NOT ONLY THE ONES THAT ASK. Which views a body
     reads is the manifest's business and the browser does not open it to find
     out; one extra query parameter is cheaper than a second round trip on the
     screens where it turns out to matter, and the value is a constant string per
     day, so it changes nothing about caching within one. */
  const got = useLoad<Drawn>(
    `${SCREEN_PATH}/${screen.id}`,
    {
      today: today(),
      ...(record ? { record } : {}),
      /* ⚠️ PREFIXED, so a pick can never take over `record` or `today` — see the
         door. A product declaring one called `today` would otherwise silently
         replace the device's own calendar day. */
      ...Object.fromEntries(Object.entries(picked)
        .filter(([, v]) => v !== "")
        .map(([k, v]) => [`pick.${k}`, v])),
    },
  );

  /* ⚠️ FROM THE BODY, NOT FROM THE ANSWER. Reading the ids off `views` would
     mean a view the door has not answered yet has no key at all — so the block
     bound to it reads `undefined`, `Region` never waits, and an unfetched list
     draws as an empty one for the length of the request. */
  const body = screen.body;
  const ids = React.useMemo(() => (body ? viewsIn(body) : []), [body]);
  /**
   * ⚠️ THE WRITE HAPPENS HERE AND THE RE-READ IS PART OF IT. A screen that ran an
   * operation and did not ask again shows what was true a moment before the
   * thing somebody just did — which is the one moment they are certain it should
   * have changed. `forget` clears the answers the write made untrue elsewhere;
   * `again` is this screen asking for its own.
   */
  const run = React.useCallback(async (id: string, input: Record<string, unknown>): Promise<Ran> => {
    const said = await api.post(id, input);
    if (!said.ok) return said.problem;
    forget();
    got.again();
    return null;
  }, [got]);

  /*
    ⚠️ WHAT A WRITE ANSWERED WITH, WHICH `run` DELIBERATELY DOES NOT CARRY. Every
    caller of `run` wants one of two things: whether it landed, or the record it
    made. Widening `Ran` to hold both would put a value in front of every caller
    that has no use for it and no idea it is optional — so the flow, which is the
    one caller that needs the id, asks for it here.
  */
  const made = React.useCallback(async (
    id: string, input: Record<string, unknown>,
  ): Promise<{ readonly id: string } | Problem> => {
    const said = await api.post(id, input);
    if (!said.ok) return said.problem;
    forget();
    return { id: String((said.value as { id?: unknown })?.id ?? "") };
  }, []);

  /*
    ⚠️ AN OPERATION THAT TAKES NOTHING RUNS ON THE PRESS — see `asks`. And one
    this app does not declare does nothing at all rather than throwing: the
    kernel refuses a `does` naming an unknown operation at composition, so
    reaching here means a manifest that never composed.
  */
  const acts = got.of.status === "ready" ? got.of.data.acts : {};

  /**
   * ⚠️ WHAT THE SCREEN SUPPLIES, RESOLVED ONCE PER ACT — see `Fill`. The person
   * is never asked for either of these: the record is the thing they opened, and
   * the day is the one they are standing in. Filling them at the seam rather
   * than inside the form is what makes `asks` able to say "nothing left to ask"
   * and run the act on the press.
   */
  const held = got.of.status === "ready" ? got.of.data.record : null;
  const filled = React.useCallback(
    /* ⚠️ THE KERNEL'S OWN READING, which is also what the worker uses for an
       asked view's input — see `fillWith`. Answering it twice is how a source
       comes to mean two things at the two ends of one wire. */
    (id: string): Record<string, unknown> => fillWith(acts[id]?.fills ?? {}, {
      ...(record ? { record } : {}),
      today: today(),
      held,
    }),
    [acts, record, held],
  );

  const onDo = React.useCallback((id: string) => {
    const spec = acts[id];
    if (!spec) return;
    const already = filled(id);
    if (asks(spec.input, already)) { setAsking(id); return; }
    void run(id, already);
  }, [acts, filled, run]);

  /**
   * ⚠️ THE ID BECOMES AN ADDRESS HERE, AND THE RECORD GOES WITH IT. `goes` names
   * a screen the kernel has already checked exists; handing that string to a
   * router expecting a route opened `/location` in a product whose route is
   * `/where`, so every row on a declared list led to the app's own not-found.
   *
   * ⚠️ AND A SCREEN THIS PRODUCT DOES NOT DECLARE LEADS NOWHERE RATHER THAN
   * ANYWHERE. `refuseSurface` refuses a `goes` naming an unknown screen at
   * composition, so reaching here means a manifest that never composed —
   * navigating to a guess would be worse than the dead row it replaces.
   */
  const onGo = React.useCallback((id: string, record?: string) => {
    const to = screens.find((s) => s.id === id)?.route;
    if (!to) return;
    go(record ? `${to.replace(/\/$/, "")}/${record}` : to);
  }, [screens, go]);

  /*
    ⚠️ ASKED ONLY WHERE THE BODY PLACES A CHECKLIST, and `useLoad` is given a
    null path otherwise — every other screen in the product would otherwise pay a
    round trip for a block it does not draw.

    ⚠️ AND THE MILESTONE IS MARKED SEEN WITHOUT THE SCREEN WAITING FOR IT. The
    congratulation is already on the page; what the write buys is that it is not
    there again tomorrow, so a failure costs a repeat rather than a blank.
  */
  const wantsBook = Boolean(body && booksIn(body));
  const far = useLoad<Far>(wantsBook ? "guide.view" : null, {});
  const reached = far.of.status === "ready" ? far.of.data : null;
  const fresh = reached?.fresh ?? [];
  const marked = React.useRef(new Set<string>());
  React.useEffect(() => {
    for (const one of fresh) {
      if (marked.current.has(one.id)) continue;
      marked.current.add(one.id);
      void api.post("guide.seen", { milestone: one.id });
    }
  }, [fresh]);

  const holds = React.useMemo(() => new Set(app.permissions), [app.permissions]);
  const book = React.useMemo(() => ({
    guide: app.guide,
    milestones: app.milestones,
    /* ⚠️ THE EVENTS, NOT THE STEPS, AND BOTH AXES SEPARATELY — a workspace step
       is anybody's to have done, a person step is only this person's. One merged
       list opens already complete for somebody invited into a workspace that has
       been running, which is a welcome congratulating them for a year of work
       they were not there for. */
    raised: (reached
      ? { workspace: Object.keys(reached.counts), person: reached.mine }
      : null) as Raised | null,
    counts: reached?.counts ?? {},
    /* ⚠️ WHILE IT IS LOADING, EVERYTHING IS "ALREADY SAID". `[]` would draw every
       reached milestone for the length of the round trip and then take them away
       — a congratulation that flickers, which is worse than one a beat late. */
    already: reached ? reached.said : Object.keys(app.milestones),
    held: holds,
    onGo: go,
  }), [app.guide, app.milestones, reached, holds, go]);

  /* ⚠️ A SHORTCUT WEARS THE SCREEN'S OWN LABEL AND MARK — see `BlockSpec.leads`.
     A screen behind a grant this person does not hold answers `undefined`, so the
     tile is dropped rather than leading to a refusal. */
  const named = React.useCallback((id: string) => {
    const one = screens.find((s) => s.id === id);
    if (!one) return undefined;
    if (one.permission && !holds.has(one.permission)) return undefined;
    return { label: one.label, ...(one.icon ? { icon: one.icon } : {}) };
  }, [screens, holds]);

  /*
    ⚠️ ONE FACT AT A TIME, THROUGH THE COLLECTION'S OWN UPDATE — see
    `BlockSpec.edits`. The write is derived rather than declared, so a row's
    pencil can only ever change the field the row is about; and it goes through
    `run`, so it re-reads afterwards for the reason every other write does — the
    moment somebody is most certain the screen should have changed is the moment
    they just changed it.

    ⚠️ AND IT IS ABSENT WHERE THE DOOR SENT NO FIELDS. That is the answer to both
    "this screen offers none" and "this person may not write", which are one
    thing on the screen: no pencil.
  */
  const edits = got.of.status === "ready" ? got.of.data.edits : undefined;
  const subject = got.of.status === "ready" ? got.of.data.record : null;
  const editing = React.useMemo(() => (
    edits && Object.keys(edits).length && screen.of && subject
      ? {
        fields: edits,
        onSave: (field: string, value: unknown) =>
          /* ⚠️ THE KERNEL'S SPELLING OF THE VERB — see `verbId`. Written out
             here it would be a second copy of a name the kernel owns. */
          run(verbId(screen.of!, "update"), { id: String(subject["id"] ?? ""), [field]: value }),
      }
      : undefined
  ), [edits, screen.of, subject, run]);

  /**
   * WHAT IS ABOVE THIS SCREEN — see `upFrom`.
   *
   * ⚠️ IT ANSWERS TWO THINGS AND THAT IS WHY IT IS ONE WALK: the way back in the
   * crown, and where the screen goes when its record is put away. Derived twice
   * they would land in different places on the same screen, and nobody would
   * notice without pressing both.
   *
   * ⚠️ AND THE DESTINATION IS DERIVED, NOT NAMED. The list screen for this
   * collection is the one place a person could have arrived from; a route typed
   * here would be a second spelling of an address the manifest holds.
   *
   * ⚠️ AND A DESTINATION GETS `undefined`, WHICH IS THE WHOLE SWITCH. A screen
   * with a way out is a sub-page: the shell's crown stands down, the avatar is
   * replaced by the way back, and the screen's own name is what the crown takes
   * once the heading has scrolled away. `Screen` and `crownFor` do all of that
   * from this one value.
   */
  const above = React.useMemo(() => upFrom(screens, screen), [screens, screen]);
  const back = React.useMemo(
    () => (above ? () => { go(above.route); } : undefined),
    [above, go],
  );

  /*
    ⚠️ THE RECORD LEAVES AND SO DOES THE SCREEN, WHICH IS THE HALF A SHEET
    CANNOT DO FOR ITSELF. Binned or frozen, this record is off every list; a
    re-read would draw it exactly as it was, on a page whose whole subject has
    just been put away — which is the "answered 200 over a change that did not
    happen" shape read from the other end. So the screen goes back to where the
    record was listed, and `forget` clears the lists that are now shorter.

    ⚠️ AND WHERE THE PRODUCT DECLARES NOWHERE ABOVE — a record only ever reached
    from a search — the screen stays and re-reads, and the row it is about then
    says it is aside.
  */
  const onAside = React.useCallback((how: "frozen" | "binned") => {
    void (async () => {
      const said = how === "binned"
        ? await api.post(verbId(screen.of!, "delete"), { id: String(subject?.["id"] ?? "") })
        : await api.post("bin.freeze",
          { collection: screen.of, id: String(subject?.["id"] ?? "") });
      if (!said.ok) { tell.failed(said.problem); return; }
      tell.did(how === "binned" ? "Moved to trash" : "Put away");
      forget();
      /* ⚠️ THE SAME PLACE THE ARROW GOES — see `above`. */
      if (above) go(above.route); else got.again();
    })();
  }, [screen.of, subject, above, go, got, tell]);

  const has: Has = React.useMemo(() => ({
    ...(got.of.status === "ready" && got.of.data.record
      ? { record: got.of.data.record }
      : {}),
    views: spread(ids, got.of),
    onGo: onGo,
    onDo,
    picked,
    onPick: (id: string, value: string) =>
      setPicked((was) => ({ ...was, [id]: value })),
    ...(got.of.status === "ready" ? { picks: got.of.data.picks } : {}),
    ...(currency ? { currency } : {}),
    named,
    ...(editing ? { edits: editing } : {}),
    ...(got.of.status === "ready" && got.of.data.aside
      ? { aside: got.of.data.aside, onAside }
      : {}),
    ...(wantsBook ? { book } : {}),
  }), [got.of, ids, onGo, onDo, currency, picked, named, wantsBook, book, editing, onAside]);

  /*
    ⚠️ A FLOW WAITS AND FAILS OUT LOUD, LIKE EVERY OTHER SCREEN. It used to be
    handed `acts` and render `null` when the write was not in them — which is
    true while the request is in flight and true forever if the door refuses, so
    a 404 on the screen door and a round trip in progress drew the same thing:
    the shell, and nothing inside it. `Await` is what the rest of the surface
    uses, and it orders the three the same way here.
  */
  if (screen.story) {
    return (
      <React.Suspense fallback={<Waiting />}>
        <Await
          of={got.of}
          waiting={<Waiting />}
          again={got.again}
          then={(drawn) => (
            <Flow
              screen={screen}
              acts={drawn.acts}
              run={run}
              made={made}
              onGo={onGo}
              chose={app.chose ?? {}}
              metered={app.metered ?? []}
            />
          )}
        />
      </React.Suspense>
    );
  }

  /*
    ⚠️ A DECLARED BODY GOES IN A `Screen`, AND THE DEPLOYMENT WAS THE ONE PLACE
    IT DID NOT. `Body` places blocks; the rhythm BETWEEN them, the gutter, the
    reading width, the shape's own skeleton and the arrival stagger are all the
    frame's — `Arriving` is the `data-blocks` stack that carries the first two.
    Mounted bare, the hero and the blocks under it were not siblings in anything
    with a gap, so they touched, while the grid inside kept its own 24: one
    column, two rhythms, and the seam exactly where a screen is read first.

    ⚠️ AND THE FIXTURE ALWAYS DID THIS, which is why nothing caught it. The board
    wraps a declared body in a `Screen` and says so in a comment — "mounting a
    body bare leaves every one of them off" — so the browser sweep has been
    measuring a frame no customer gets, and reporting one rhythm because in the
    fixture there was one. The board is right; this was the copy that drifted.
  */
  /*
    ⚠️ A SCREEN ABOUT ONE THING IS NAMED BY THAT THING — see `Drawn.name`. The
    manifest's `label` is the word for the KIND, because it is also the nav item,
    the shortcut tile and the sentence in a permission refusal, none of which is
    about a particular row; over a page about the clear casting resin it is a
    heading answering a question nobody asked. The kind moves UNDER the name,
    where it is a fact about what is on the screen rather than the screen's own
    title, and it is dropped where it would only repeat the words above it.

    ⚠️ AND THE FALLBACK IS THE LABEL, NOT AN IDENTIFIER. A list screen has no
    record, an address still resolving has not got one yet, and a collection with
    nothing that names a row legitimately answers `null` — all three are "one of
    these", which is what the kind's own word says.
  */
  const titled = got.of.status === "ready" ? got.of.data.name : null;
  const kind = titled && titled !== screen.label ? screen.label : undefined;

  if (!body) return null;
  return (
    <Screen
      shape={body.shape}
      title={titled ?? screen.label}
      {...(kind ? { under: kind } : {})}
      {...(back ? { back } : {})}
    >
      <Body body={body} has={has} />
      {asking && acts[asking] ? (
        <Doing
          id={asking}
          summary={acts[asking]!.summary}
          input={acts[asking]!.input}
          fills={filled(asking)}
          {...(acts[asking]!.choices ? { choices: acts[asking]!.choices } : {})}
          open
          onOpen={(next: boolean) => { if (!next) setAsking(null); }}
          /* ⚠️ THE FILLS LAST, so a field the screen supplies cannot be
             overwritten by a draft — `Doing` does not draw them, and a stale key
             left in the draft from an earlier open would otherwise win. */
          run={(input: Record<string, unknown>) => run(asking, { ...input, ...filled(asking) })}
        />
      ) : null}
    </Screen>
  );
}

/**
 * A DECLARED FLOW, HELD AND RUN.
 *
 * ⚠️ THE ANSWERS LIVE HERE RATHER THAN INSIDE `Create`, and that is the point of
 * the split. A refusal comes back from the door naming three fields; a flow that
 * owned its own answers would have to be told to keep them, and the shape that
 * forgets is the one where somebody loses eight screens of typing to a validation
 * error. Held out here, a refusal is a render with the same draft in it.
 *
 * ⚠️ AND THE STEP IS STATE, NOT A ROUTE — see `Story`. A URL per step would make
 * each one shareable, bookmarkable and reloadable into a form with nothing in it.
 */
function Flow({ screen, acts, run, made, onGo, chose, metered }: {
  readonly screen: ScreenSpec;
  readonly acts: Drawn["acts"];
  readonly run: (id: string, input: Record<string, unknown>) => Promise<Ran>;
  /**
   * ⚠️ WHAT THE WRITE ANSWERED WITH — see `made`. A flow is the one caller that
   * needs the record's id: it ends by opening the thing it just made.
   */
  readonly made: (
    id: string, input: Record<string, unknown>,
  ) => Promise<{ readonly id: string } | Problem>;
  /** ⚠️ A screen's id and the record — see `Has.onGo`. Never a route. */
  readonly onGo: (screen: string, record?: string) => void;
  /** ⚠️ What this workspace chose, for the settings this flow starts from. */
  readonly chose: Readonly<Record<string, unknown>>;
  /** ⚠️ Which of this product's operations spend credits — see `meteredIds`. */
  readonly metered: readonly string[];
}) {
  const told = screen.story!;
  const write = acts[told.writes];

  /*
    ⚠️ WHAT THE WORKSPACE ALREADY ANSWERED — see `StorySpec.starts`. A workspace
    that set "we count in millilitres" has answered "what do you count it in?",
    and asking again with an empty box is the product forgetting a preference it
    is still storing. The value goes in as an ANSWER, not as a placeholder, so
    the step settles into the review and can be opened and changed there — the
    same shape a model's fill produces, deliberately, because a person should not
    have to learn two rules for two ways an answer can already be there.

    ⚠️ AND AN UNSET SETTING IS NOT AN ANSWER. `settingsFor` resolves a missing row
    to the declared fallback, which may legitimately be empty — and a step marked
    settled on `""` is a question skipped and never asked.
  */
  const opens = React.useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const [name, id] of Object.entries(told.starts ?? {})) {
      const value = chose[id];
      if (value === undefined || value === null || value === "") continue;
      out[name] = value;
    }
    /*
      ⚠️ AND WHAT THE FLOW SUPPLIES ITSELF — see `StorySpec.holds`. The same
      `fillWith` a body uses for an act, for the same reason: two readings of one
      contract at the two ends of a product is how "the device's day" comes to
      mean two things, and the day a flow sends is the day a shelf life is
      counted from.

      ⚠️ IT GOES IN BESIDE `starts` BECAUSE BOTH ARE ANSWERS THE PERSON DID NOT
      GIVE. The difference is where they came from and nothing else, and a second
      slot for them would be a second thing to remember to clear.
    */
    Object.assign(out, fillWith(told.holds ?? {}, { today: today() }));
    return out as Answers;
  }, [told.starts, told.holds, chose]);

  /* ⚠️ THE FIRST STEP THAT IS STILL A QUESTION, AND `askedOf` DECIDES WHICH ONE
     — the same walk the flow itself uses. Reimplemented here it would be a
     second opinion about what counts as answered, and the two disagree first on
     `always`, whose whole meaning is that an arrived value does not settle it. */
  const opensAt = React.useMemo(() => (
    askedOf(told.asks, opens, new Set(Object.keys(opens)))[0]?.id ?? "review"
  ), [told.asks, opens]);

  const [at, setAt] = React.useState(opensAt);
  const [held, setHeld] = React.useState<Answers>(opens);
  const [filled, setFilled] = React.useState<ReadonlySet<string>>(new Set(Object.keys(opens)));
  const [refused, setRefused] = React.useState<Readonly<Record<string, string>>>({});
  const [filling, setFilling] = React.useState(false);
  const tell = useTelling();

  const onSet = React.useCallback((name: string, value: unknown) => {
    setHeld((was) => ({ ...was, [name]: value }));
    /*
      ⚠️ TYPING OVER AN ARRIVED ANSWER MAKES IT THEIRS. `filled` is what keeps a
      step out of the questions; left set after somebody edited the value in the
      review, the step they just corrected would still be skipped — so the
      correction would stand and the question would never be asked, which is
      right, and the SECOND correction would have nowhere to happen.
    */
    setFilled((was) => {
      if (!was.has(name)) return was;
      const next = new Set(was);
      next.delete(name);
      return next;
    });
    /* ⚠️ AND A REFUSAL IS ABOUT THE VALUE THAT WAS SENT, so editing the value
       clears it. Left standing it is a sentence about a number nobody is looking
       at any more. */
    setRefused((was) => (name in was ? Object.fromEntries(
      Object.entries(was).filter(([k]) => k !== name),
    ) : was));
  }, []);

  /*
    ⚠️ THE FILL RUNS WHEN WHAT IT IS HANDED IS THERE, AND ONCE PER SET OF IT.
    `sent` remembers what was last sent rather than a boolean: a person who adds a
    seventh photograph has given the model something new to look at, and a flag
    would refuse to ask again. Two runs over the same pictures is a charge for the
    same answer.
  */
  const fills = told.fills;
  const given = React.useMemo(() => {
    if (!fills) return null;
    const out: Record<string, unknown> = {};
    for (const [wants, from] of Object.entries(fills.with)) {
      const value = held[from];
      /* ⚠️ NOTHING TO LOOK AT IS NOT A RUN. An empty list sent to a vision model
         is a charge for a question about no pictures, answered plausibly. */
      if (value === undefined || value === null || value === "") return null;
      if (Array.isArray(value) && !value.length) return null;
      out[wants] = value;
    }
    return out;
  }, [fills, held]);

  const sent = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!fills || !given) return;
    const key = JSON.stringify(given);
    if (sent.current === key) return;
    sent.current = key;
    setFilling(true);
    void (async () => {
      const said = await api.post(fills.by, given);
      setFilling(false);
      /*
        ⚠️ A READER THAT COULD NOT HELP IS SAID, AND THE FLOW GOES ON. Out of
        credits, a provider down, a photograph it could make nothing of — none of
        those stops somebody adding a product, so the steps are simply asked. What
        must not happen is silence: the screen would go from "reading your
        pictures" to five questions with nothing saying why, which reads as the
        app having lost them.
      */
      if (!said.ok) { tell.failed(said.problem, "Could not read the pictures"); return; }
      /*
        ⚠️ WHAT THE WRITE TAKES AND NOTHING ELSE. A reader answers more than a
        registration keeps — a pack size, a reason for the rung, whether it looked
        hazardous — and spreading the whole answer would send the door inputs it
        never declared, which it drops, having refused nothing.

        ⚠️ AND AN EMPTY ANSWER IS NOT AN ANSWER. A model that could not read the
        brand answers "", and marking that filled would skip the step that was
        going to ask for it.
      */
      const answers: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(said.value as Record<string, unknown>)) {
        if (!write?.input[name]) continue;
        if (value === undefined || value === null || value === "") continue;
        answers[name] = value;
      }
      setHeld((was) => ({ ...was, ...answers }));
      setFilled((was) => new Set([...was, ...Object.keys(answers)]));
    })();
  }, [fills, given, write, tell]);

  /*
    ⚠️ WHAT THE FLOW IS ABOUT TO DO, WORKED OUT WHEN IT IS ABOUT TO DO IT — see
    `ShowsSpec`. The mirror of the fill above and deliberately the same shape:
    an operation named in the manifest, handed the answers it was declared to
    take, remembered by WHAT was sent rather than by a flag.

    ⚠️ ON THE REVIEW AND NOWHERE ELSE. The operation reads the whole input — for
    an import that is four hundred kilobytes of spreadsheet — so running it as
    somebody types would be a round trip per keystroke on the one flow whose
    first step is a paste.

    ⚠️ AND A REPORT THAT COULD NOT BE MADE LEAVES THE REVIEW AS IT WAS. The flow
    still works: somebody can still press, and the write still refuses what it
    refuses. What must not happen is a row of zeroes, which is a confident claim
    that this spreadsheet would do nothing.
  */
  const shows = told.shows;
  const asked = React.useMemo(() => {
    if (!shows || at !== "review") return null;
    const out: Record<string, unknown> = {};
    for (const [wants, from] of Object.entries(shows.with)) {
      const value = held[from];
      if (value === undefined || value === null || value === "") return null;
      out[wants] = value;
    }
    return out;
  }, [shows, at, held]);

  const [counts, setCounts] = React.useState<Readonly<Record<string, number>> | null>(null);
  const looked = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!shows || !asked) return;
    const key = JSON.stringify(asked);
    if (looked.current === key) return;
    looked.current = key;
    void (async () => {
      const said = await api.post(shows.by, asked);
      /* ⚠️ AND A REPORT THAT COULD NOT BE MADE SAYS SO — the review is left as
         it was rather than filled with zeroes, which would be a confident claim
         that this press would do nothing. The flow still works: somebody can
         still press, and the write still refuses what it refuses. */
      if (!said.ok) { tell.failed(said.problem, "Could not work out what this would do"); return; }
      const of = (said.value as Record<string, unknown>)[shows.take];
      if (!of || typeof of !== "object") return;
      setCounts(Object.fromEntries(Object.entries(of as Record<string, unknown>)
        .filter(([, n]) => typeof n === "number")) as Record<string, number>);
    })();
  }, [shows, asked, tell]);

  /*
    ⚠️ AND IF THE WRITE IS STILL NOT THERE, IT SAYS SO. The door answered, so
    this is not a round trip in progress — it is a flow walking toward an
    operation this app does not offer, which `refuseSurface` refuses at
    composition and so should be unreachable. `return null` is what made the
    same line cover a real 404 for as long as it did: the one shape that cannot
    be told apart from a screen that is simply empty.
  */
  /* ⚠️ RAISED FROM THE CATALOGUE, LIKE EVERY OTHER REFUSAL — the `ref` names the
     operation, so what somebody reports is the flow and the write it wanted. */
  if (!write) {
    return (
      <Trouble
        problem={problem(PLATFORM_PROBLEMS, "platform.unavailable", {}, { ref: told.writes })}
      />
    );
  }

  return (
    <Create
      story={told}
      takes={write.input}
      at={at}
      onGo={setAt}
      title={screen.label}
      held={held}
      onSet={onSet}
      filled={filled}
      refused={refused}
      {...(filling ? { filling } : {})}
      /* ⚠️ THE READER SPENDS THE WORKSPACE'S MONEY, AND THE STEP THAT FEEDS IT
         HAS TO SAY SO. It runs by itself the moment the photographs are there,
         so there is no button to put the sentence on — see `CreateProps.spends`. */
      {...(told.fills && metered.includes(told.fills.by) ? { spends: true } : {})}
      {...(write.choices ? { choices: write.choices } : {})}
      /* ⚠️ THE CONSEQUENCES ABOVE THE PRESS — see `ShowsSpec`. `lead` is the
         review's own slot for "what the thing looks like", and for a flow whose
         subject is a change rather than a record, what it looks like is the
         change. */
      {...(counts ? { lead: <Consequences
        says="What this will do"
        of={Object.entries(counts).map(([key, count]) => ({
          says: shows?.says?.[key] ?? key,
          count,
          ...(key === "refused" ? { ink: "warn" as const } : {}),
        }))}
      /> } : {})}
      does={{
        /* ⚠️ THE WORD ON THE LAST PRESS IS THE FLOW'S — see `StorySpec.does`.
           "Add it" is a product's sentence about a product, written into the
           platform, and it read "Add it" over a button that applies eight
           hundred rows of somebody else's spreadsheet. Same class as the
           `/products` route this file already carries a paragraph about. */
        label: told.does ?? "Add it",
        op: told.writes,
        onDo: () => {
          void (async () => {
            const said = await made(told.writes, held);
            /* ⚠️ A REFUSAL KEEPS THE DRAFT AND NAMES THE FIELDS — `Problem.fields`
               is what puts each sentence under the control it is about, and
               `Create` carries it to the step that asks for it. */
            if ("code" in said) { setRefused(said.fields ?? {}); return; }
            /*
              ⚠️ WHERE THE FLOW SAYS, ON WHAT IT JUST MADE — see `StorySpec.lands`.
              This was `go("/products")`: one product's route, written into the
              platform, taken by every flow in every app. The second app's would
              have landed on a list it does not have.

              ⚠️ AND A FLOW THAT NAMES NOWHERE STAYS PUT rather than guessing. It
              is the right shape for one that records something — a count, a
              delivery — whose subject is the screen somebody was already on.
            */
            if (told.lands) onGo(told.lands, said.id || undefined);
          })();
        },
      }}
    />
  );
}
