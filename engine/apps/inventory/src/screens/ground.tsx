/**
 * ONEINVENTORY IN THE CHROME A PERSON ACTUALLY SEES IT THROUGH.
 *
 * ⚠️ A SCREEN ON ITS OWN LEAVES OUT THE HALF A PRODUCT CANNOT OPT OUT OF.
 * `Shell` picks the world and `Page` mounts it: the scene, the grain, the
 * vignette, the hem, the nav, the crown and the room reserved for the island. A
 * photograph of the screen alone is a photograph of a component; a screen that
 * fits at 390 by itself can still be pushed sideways by what surrounds it.
 *
 * ⚠️ EVERYTHING IS HELD AND EVERY FEATURE IS SOLD, BECAUSE THE GROUND EXISTS TO
 * REACH EVERY SCREEN. What a permission hides and what a plan withholds are both
 * real behaviour with their own tests — `reachable` and `publicFace` — and a
 * ground holding half the grants would be a ground where half the screens are
 * unreachable and nothing says which.
 *
 * ⚠️ AND IT IS THE SAME `Shell` CALL THE DEPLOYMENT MAKES. An app that brought
 * its own chrome would be an app that could get it wrong.
 */

import * as React from "react";
import { Screen, Shell, ready, whoFace } from "@engine/design";
import { Body, type Has } from "@engine/design/body";
import { Create, type Answers } from "@engine/design/create";
import type { ScreenSpec } from "@engine/kernel";
import { inventory } from "../index.js";
import { INVENTORY_SESSIONS, INVENTORY_SURFACES } from "./index.js";
import { COUNTS, LINES, PLACES, THINGS } from "./sample.js";

/** ⚠️ Every permission a screen names, so none of them is undrawable here. */
const EVERYTHING = new Set([
  "product:read", "product:write", "location:read", "location:write",
  "stock:read", "stock:move", "stock:adjust", "ledger:read",
  "process:read", "process:write",
]);

/**
 * ⚠️ EVERY GATED SCREEN'S KEY, ON. `/work`, `/run`, `/case` and `/import` are
 * gated on what the plan includes, and a ground on the floor tier could not draw
 * four of nineteen screens.
 */
const SOLD = ["processes", "jobs", "imports"];

export function InventoryGround({ route, onGo, sky }: {
  readonly route: string;
  /** ⚠️ Absent on the ground, where there is no router to go anywhere with. */
  readonly onGo?: (route: string) => void;
  /**
   * DRAW EVERY SCREEN UNDER THIS WORLD INSTEAD OF THE ONE IT DECLARES.
   *
   * ⚠️ FOR CHOOSING ONE, AND FOR NOTHING ELSE. A sky is React state built from
   * the manifest and set as inline custom properties, so it cannot be swapped by
   * appending a stylesheet the way a ground ladder can — and comparing nine
   * families by editing the manifest nine times is nine commits to answer a
   * question that is answered by looking.
   *
   * ⚠️ THE BOARD IS WHERE IT BELONGS. A fixture exists to draw the product under
   * conditions the product does not choose for itself; the deployment reads the
   * declaration and has no way to reach this.
   */
  readonly sky?: string;
}) {
  const go = onGo ?? (() => undefined);
  /* ⚠️ Asked for rather than imported as a value — the manifest is a thunk so a
     cold isolate does not build and re-check it before anything wants it. */
  const INVENTORY = inventory();
  const screens = (INVENTORY.screens ?? [])
    .filter((s) => !s.features?.length || s.features.some((f) => SOLD.includes(f)))
    .map((s) => (sky ? { ...s, sky } : s));

  const here = screens.find((s) => s.route === route);

  /* ⚠️ Undefined while the surface is being rewritten — see the note below. */
  const Drawn = INVENTORY_SESSIONS[
    route.startsWith("surface:") ? route.slice("surface:".length) : route
  ] as React.ComponentType<{ route: string; onGo: (to: string) => void }> | undefined;

  return (
    <Shell
      screens={screens}
      /* ⚠️ THE MANIFEST'S, NOT A LITERAL. A specimen board that named its own
         colour would photograph a product nobody ships. */
      hue={INVENTORY.hue}
      here={route}
      held={EVERYTHING}
      kind="commercial"
      crown={{
        appId: INVENTORY.id,
        appName: INVENTORY.name,
        appMark: INVENTORY.mark,
        tenantName: "Harbour Works",
        unread: 3,
        personEmail: "sam@harbourworks.example",
        personFace: whoFace("harbour"),
      }}
      onGo={go}
    >
      {/*
        ⚠️ A SURFACE IS ASKED FOR THROUGH THE SAME STRING A ROUTE IS, and the
        prefix is what keeps it one parameter. The harness passes one route down
        a chain four deep — page, mount, ground, screen — and a second argument
        for "or a sheet" would have to be threaded through every one of them and
        defaulted at each, which is four places to forget it.

        ⚠️ AND THE SCREEN BEHIND IT IS HOME, BECAUSE A SHEET IS OVER SOMETHING.
        Measured against a blank page a drawer has no scrim to be legible over
        and no page under it to push sideways — which is not the thing that
        ships.
      */}
      {/*
        ⚠️ A DECLARED SCREEN IS DRAWN THROUGH THE RENDERER AND A WRITTEN ONE
        THROUGH ITS FILE — which is the difference between a photograph OF the
        screen and a photograph of a file that shares its name. The board handed
        every route to the hand-written map once, and eighty-four images were
        taken of screens no customer could open, filed under the ids of the ones
        they could, with every suite green.

        ⚠️ AND A DECLARED BODY GOES IN A `Screen`, WHICH IS THE FRAME EVERY
        WRITTEN ONE ALREADY BRINGS. `Body` places blocks and states; the gutter,
        the reading width, the crown's collapse and the shape's own skeleton are
        the frame's, and mounting a body bare leaves every one of them off.
      */}
      {/*
        ⚠️ A FLOW IS THE THIRD KIND OF SCREEN AND IT BRINGS ITS OWN FRAME. `Story`
        renders a `Screen` of its own — the progress, the dock's pair, the
        question as the section — so wrapping it in one here would be two frames,
        two titles and two gutters. It also holds ANSWERS, which is what makes a
        board able to photograph it at all: the board supplies the step and a
        draft, and every state of the flow is one prop away.
      */}
      {Drawn
        ? <Drawn route={route} onGo={go} />
        : here?.story
          ? <Walked screen={here} />
          : here?.body
          ? (
            <Screen shape={here.body.shape} title={here.label}>
              {/*
                ⚠️ A DETAIL SCREEN IS ABOUT A RECORD AND A BOARD HAS NO ADDRESS
                BAR, so it opens the first one. Without it `has.record` is
                undefined, every `field` binding resolves to nothing and the
                screen draws as a column of blank rows under correct headings —
                a picture of a state the product never shows, measured and
                photographed as though it were the screen. The deployment gets
                the record from the URL (`Declared.tsx`); this is the one thing
                a fixture has to answer for itself.
              */}
              <Body
                body={here.body}
                has={{
                  ...SEEN,
                  ...(here.of ? { record: firstOf(here.of) } : {}),
                  named: namedIn(screens),
                }}
              />
            </Screen>
          )
          : null}
    </Shell>
  );
}

/**
 * THE SAMPLE WORLD A DECLARED SCREEN READS.
 *
 * ⚠️ THE ROWS ARE THE COLLECTION'S FIELDS, NOT THE OLD SCREENS' PROPS. A
 * declaration names fields by string and the door answers with flat rows — a
 * one-hop column arriving as the plain key `"product.name"`, resolved on the
 * server — so what is written here is what a real read returns. The sample's own
 * types are shaped for the hand-written screens that used to draw them, which is
 * a different shape and would have drawn six blank columns under six correct
 * headings.
 *
 * ⚠️ AND THE NARROWED VIEWS ARE NARROWED HERE TOO, RATHER THAN GIVEN A NUMBER. A
 * figure is a `count` over a view, so a board answering each one with a plausible
 * integer would photograph a screen whose figures agree with nothing — and the
 * one fault this shape exists to prevent is a figure and the list behind it
 * disagreeing. Filtering the same sample the list draws is what makes the picture
 * check the declaration rather than illustrate it.
 */
const rows = (of: readonly Readonly<Record<string, unknown>>[]) =>
  ready({ items: of, count: of.length });

const SHELF = LINES.map((one) => ({
  id: one.id,
  /* ⚠️ THE REFERENCE ITSELF, BESIDE THE NAME READ THROUGH IT. A row leads to the
     PRODUCT it is of (`goes: { by: "product" }`), so the id has to travel with
     the row — a list showing only the joined name is one whose rows can be read
     and not opened. */
  product: one.product,
  "product.name": one.name,
  "location.name": one.whereName,
  quantity: one.quantity,
  seen: one.seen,
}));

const CATALOGUE = THINGS.map((one) => ({
  id: one.id,
  name: one.name,
  brand: one.brand ?? "",
  unit: one.unit,
  tracking: one.tracking,
  ...(one.par === undefined ? {} : { par: one.par }),
  ...(one.storage ? { storage: one.storage } : {}),
  ...(one.handling ? { handling: one.handling } : {}),
}));

/**
 * ⚠️ THE RECORD A DETAIL SCREEN OPENS ON, AND IT IS THE ONE WITH THE MOST TO
 * DRAW. A board has no address bar, so it picks; picking the first alphabetically
 * or the first written down would photograph whichever row happened to be
 * shortest. The solvent carries a brand, a par level, two shelves and both
 * pieces of prose, so the picture shows the screen at its fullest — and the
 * emptier rows are the ones a `when` is there for.
 */
const FIRST = CATALOGUE.find((one) => one.storage) ?? CATALOGUE[0]!;

/** ⚠️ What the board opens for a screen that is ABOUT something — see `Screen.of`. */
const firstOf = (collection: string): Readonly<Record<string, unknown>> | undefined =>
  collection === "product" ? FIRST : undefined;

const SEEN: Has = {
  /*
    ⚠️ A NO-OP, AND IT IS NOT NOTHING. Every affordance in the renderer is gated
    on the handler being there — a tile opens a list only if something can go
    somewhere — so a board without one photographs a screen with its presses
    silently removed, which looks exactly like a screen never given them.
  */
  onGo: () => undefined,
  views: {
    "shelf-lines": rows(SHELF),
    "run-out": rows(SHELF.filter((one) => one.quantity === 0)),
    "catalogue": rows(CATALOGUE),
    /* ⚠️ NARROWED TO THE RECORD, EXACTLY AS THE DECLARATION SAYS — see
       `Value.here`. A board answering this with every line would draw a product
       page reporting shelves the thing is not on, which is the one fault a
       narrowed view exists to prevent and the hardest to notice in a picture. */
    "lines-of-this": rows(SHELF.filter((one) => one.product === FIRST.id)),
    "every-place": rows(PLACES.map((one) => ({
      id: one.id,
      name: one.name,
      "within.name": PLACES.find((p) => p.id === one.of)?.name ?? "",
      kind: one.kind,
    }))),
    "counting": rows(COUNTS.map((one) => ({
      id: one.id, "location.name": one.whereName, day: one.day, blind: one.blind,
    }))),
  },
};

/**
 * ⚠️ WHAT A SHORTCUT SAYS, OUT OF THE MANIFEST — see `Has.named`. Without it
 * every `leads` in every declaration resolves to nothing and is DROPPED, which
 * is correct behaviour (a screen this person may not open has no shortcut) and
 * indistinguishable in a photograph from a row that was never declared.
 */
const namedIn = (screens: readonly { id: string; label: string; icon?: string }[]) =>
  (id: string) => {
    const one = screens.find((s) => s.id === id);
    return one ? { label: one.label, ...(one.icon ? { icon: one.icon } : {}) } : undefined;
  };

/**
 * A DECLARED FLOW ON THE BOARD, WITH A DRAFT IN IT.
 *
 * ⚠️ THE STEP AND THE ANSWERS ARE STATE HERE FOR THE SAME REASON THE RECORD IS
 * ABOVE: a board has no address bar and no server. What the deployment holds in
 * `Declared.tsx` and fills from a run, this holds as a starting draft — so the
 * picture is of a flow part way through rather than of five empty controls, and
 * the review has clauses in it rather than five rows saying "Nothing set".
 *
 * ⚠️ AND THE PICTURES ARE ALREADY TAKEN, WHICH IS THE STATE WORTH DRAWING. The
 * first step is a camera; photographed empty it is a picker over an empty rail,
 * which is a real state and not the one that shows what the block is for.
 */
function Walked({ screen }: { readonly screen: ScreenSpec }) {
  const told = screen.story!;
  const [at, setAt] = React.useState(told.asks[0]?.id ?? "review");
  const [held, setHeld] = React.useState<Answers>(DRAFT);
  return (
    <Create
      story={told}
      /* ⚠️ THE WRITE'S OWN INPUT, OUT OF THE MANIFEST. A board handing over a
         made-up field map would photograph controls the operation does not take
         — the same fault as a figure that agrees with no list. */
      takes={inventory().operations?.find((o) => o.id === told.writes)?.input ?? {}}
      at={at}
      onGo={setAt}
      title={screen.label}
      held={held}
      onSet={(name, value) => { setHeld((was) => ({ ...was, [name]: value })); }}
      /* ⚠️ WHAT THE MODEL ANSWERED, SO THE SKIPPING IS VISIBLE. Without it every
         step is asked and the flow photographs as the form it replaced. */
      filled={FILLED}
      does={{ label: "Add it", op: told.writes, onDo: () => undefined }}
    />
  );
}

/**
 * ⚠️ WHAT SIX PHOTOGRAPHS CAME BACK AS — the shape `product.see` answers, not a
 * plausible-looking one. A board that invented its own draft would photograph a
 * review of facts the reader never produces.
 */
/**
 * ⚠️ A REAL PICTURE, NOT A PATH TO ONE. A flow holds `data:` URLs — nothing is
 * uploaded until the write, so a product abandoned on step three leaves no object
 * in the bucket. A board pointing at a file would photograph a broken image and
 * a fixture that reads one from disk would make this suite need a filesystem.
 * One warm pixel, scaled: what is being looked at is the TILE.
 */
const SHOT = "data:image/gif;base64,R0lGODlhAQABAIAAALyeftyefiH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";

const DRAFT: Answers = {
  shots: [SHOT],
  name: "Casting resin, clear",
  brand: "Smooth-On",
  unit: "tin",
  tracking: "batched",
};

/** ⚠️ Everything above that ARRIVED rather than being typed — see `Create.filled`. */
const FILLED = new Set(["name", "brand", "unit", "tracking"]);
