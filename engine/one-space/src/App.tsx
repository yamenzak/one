/**
 * WHAT THIS PAGE IS — the door decides, and OneSpace is over all of it.
 *
 * ⚠️ THE SPACE IS NOT A DOOR. It is a surface presented over whatever somebody
 * was doing, reachable from every one of them: who you are, everywhere you
 * belong, and — for the few who hold it — the deployment itself. It used to be
 * an app per door with a nav bar of its own, so a person's account lived on one
 * hostname, their workspace's roster on another, and the operator console on a
 * third, each with a permanent bar over it announcing four places they visit
 * twice a year.
 *
 * ⚠️ SO EVERY DOOR ANSWERS `/space`, AND WHAT IS UNDERNEATH DIFFERS. On a
 * workspace's own address the product is underneath and OneSpace dismisses back
 * onto it; on the account and operator doors there is nothing underneath and
 * OneSpace IS the page, which is why it is handed no way out there.
 *
 * ⚠️ AND THE PICK IS A PURE FUNCTION, so it is a test rather than a click
 * through five hostnames. The bug it exists to catch is a state that resolves to
 * nothing: a door served by the worker with no screen behind it renders a blank
 * page, which is the same picture as a page that failed to load.
 */

import * as React from "react";
import {
  NoticeHost, Opening,
} from "@engine/design";

import { OPENING_LINES } from "./opening.js";
import { useSession } from "./session.js";
import { useTravel } from "./nav.js";
import { signpostUrl, type Face } from "./door.js";
import { Product } from "./centre/Product.js";
import { OneSpace } from "./space/OneSpace.js";
import { SPACE, inSpace, pathOf } from "./space/where.js";
import { Agreements } from "./screens/Agreements.js";
import { NewWorkspace } from "./screens/NewWorkspace.js";
import { SignIn } from "./screens/SignIn.js";
import { Signpost } from "./screens/Signpost.js";

/* ⚠️ DYNAMIC, SO THE REFERENCE APP IS NOT IN THE PRODUCTION BUNDLE. A static
   import behind `import.meta.env.DEV` reads as dev-only and is not — the module
   graph is decided before the branch is, and the ground's whole manifest was measured
   in the built `index-*.js`. See `Ground.tsx`. */
/* ⚠️ THE TERNARY IS LOAD-BEARING AND `null` IS THE PRODUCTION VALUE. A bare
   `React.lazy(() => import(...))` still puts the module in the graph: the chunk
   is emitted, index has to keep every symbol that chunk could reach EXPORTED,
   and the design system stops being tree-shakeable — measured at +147 KB in
   index while the app itself moved into a 45 KB chunk nothing requests. Behind
   `import.meta.env.DEV`, Vite folds the branch away in production and the import
   is unreachable, so no chunk is emitted at all. */
const Ground = import.meta.env.DEV
  ? React.lazy(() => import("./Ground.js").then((m) => ({ default: m.Ground })))
  : null;

/** What the page shows, as a name — the thing the guard and the tests read. */
export type Screen =
  | "waiting" | "stuck" | "signpost" | "sign-in" | "agreements" | "space" | "new-workspace"
  | "product" | "elsewhere" | "ground";

/**
 * ⚠️ EVERY COMBINATION IS ANSWERED, INCLUDING THE ONES THAT SHOULD NOT HAPPEN.
 * "That cannot occur" is how a blank page ships: the state that could not occur
 * occurs, nothing matches, and React renders nothing at all.
 */
export function pickScreen(
  face: Face | null, signedIn: boolean | null, stuck: boolean, showcase = false,
  /**
   * ⚠️ HOW MANY AGREEMENTS ARE STILL OWED, AND IT IS DECIDED HERE RATHER THAN
   * INSIDE A SCREEN. The wall holds the whole product, reads included, so it has
   * to be picked at the same moment the door is — asked later, somebody sees
   * their workspace for a moment and then loses it, and every write behind it
   * refuses with a status the screen has no reason to expect.
   */
  owed = 0,
): Screen {
  /* ⚠️ THE TEST GROUND IS A DEVELOPMENT SURFACE AND NEVER REACHABLE IN
     PRODUCTION. It renders the reference app's screens over a sample world with
     no session behind them — which is the point, and also why it must never be
     one query parameter away from a real deployment. It is asked for by a query
     the deployment only honours in development, see `App`. */
  if (showcase) return "ground";
  if (stuck) return "stuck";
  if (face === null) return "waiting";
  if (face === "signpost") return "signpost";
  if (face === "elsewhere") return "elsewhere";
  /* Every remaining door needs somebody. */
  if (signedIn === null) return "waiting";
  if (!signedIn) return "sign-in";
  /*
    ⚠️ ABOVE THE PRODUCT AND ABOVE THE SPACE, AND NOT ABOVE SIGNING IN. Nobody can
    agree to anything before we know who they are — and the wall is not a door,
    so it comes after every door has been decided. The three ways out of it live
    on the screen itself (`Agreements`): read, take a copy, delete.
  */
  if (owed > 0) return "agreements";
  if (face === "centre") return "product";
  if (face === "create") return "new-workspace";
  /* ⚠️ THE ACCOUNT DOOR AND THE OPERATOR DOOR ARE THE SAME PAGE. Both are the
     OneSpace with nothing underneath; what an operator holds is a place ON it, not a
     product of its own — see `space/Console.tsx`. */
  return "space";
}

/*
  ⚠️ WHAT THE DOOR IS FOR, NOT WHAT THE PRODUCT IS PROUD OF. Every line here
  used to sell something: one account, no password to remember. Neither is a
  thing the person standing at the door is deciding — they came to get in, and a
  claim under the heading is worth its space only when it says something they do
  not already know. The account door says nothing at all, because "Sign in" over
  an email field is already the whole sentence.
*/
/*
  ⚠️ WHAT THIS ADDRESS IS, WHEN IT IS NOT THIS BUNDLE'S. Served by this worker
  and drawn by something else: the operator console and a workspace's own product
  are their own surfaces, a paired device is not a browser's business, and an
  unknown label is served by nothing at all — which is this deployment's 404.

  ⚠️ THE HEADING IS THE SAME SENTENCE EVERY TIME AND THE LINE UNDER IT IS NOT.
  What a person needs first is that they are not where they meant to be; WHICH of
  the four it is only matters to somebody who is going to do something about it,
  and that is the second line.
*/
export const ELSEWHERE_SAYS: Readonly<Record<string, string>> = {
  operator: "Not this page",
  tenant: "Not this page",
  device: "Not this page",
  none: "Nothing is here",
};

export const ELSEWHERE_UNDER: Readonly<Record<string, string>> = {
  operator: "This is the operator console's door, and its screens are not part of OneSpace",
  tenant: "This is a workspace's own address, and its product draws these screens",
  device: "This address belongs to a paired device, and there is nothing here for a browser",
  none: "Nothing is served at this address",
};

const LEAD: Readonly<Record<string, string>> = {
  create: "A workspace belongs to somebody",
  centre: "to open this workspace",
  console: "the console admits operators only",
};

export function App() {
  const { where, face, me, stuck } = useSession();
  const { path, beneath, go } = useTravel();
  /* ⚠️ Development only, and read from the DEPLOYMENT rather than the URL: a
     query parameter alone would make the catalogue one link away in
     production. */
  const query = new URLSearchParams(location.search);
  /* ⚠️ THE ROUTE IS THE REFERENCE APP'S OWN, so what the ground renders is what
     a real screen renders — not a specimen built to look like one. A specimen
     proves a screen COULD be assembled from the vocabulary; the app's own screen
     proves one WAS, which is a different claim and the only one worth making. */
  /* ⚠️ `?ground` ALONE LANDS ON THE APP'S FIRST SCREEN, never on a bare one. It
     used to fall through to the deployment's own frame with a screen dropped in
     it — OneSpace's crown over a product's page, which is a layout no deployment
     serves and therefore a layout nobody was testing. */
  /* ⚠️ THE ROUTE IS NOT VALIDATED AGAINST THE APP HERE, because knowing the
     app's routes would mean importing it. `Ground` renders an honest notice for
     a route its app does not have — which is the same thing `AppSurface` does
     for a screen nobody registered. */
  const ground = import.meta.env.DEV
    ? query.get("screen") ?? (query.has("ground") ? "/" : null)
    : null;
  const showcase = ground !== null;
  const owed = me && me !== "nobody" ? me.owed?.length ?? 0 : 0;
  const screen = pickScreen(
    face, me === null ? null : me !== "nobody", stuck !== null, showcase, owed);

  /*
    ⚠️ THE WALL, AND THE DOORS IN IT ARE ON THE SAME SCREEN. Sending somebody to
    OneSpace for their copy would open every other screen in it — a workspace's
    roster, its bill, its settings — and every operation behind those is behind
    the wall, so each would refuse with a status the screen has no reason to
    expect. What stays open is exactly what `beforeAccepting` marks open, and
    `Agreements` is where it is offered.
  */
  if (screen === "agreements" && me && me !== "nobody") {
    return <><NoticeHost /><Agreements owed={me.owed ?? []} /></>;
  }

  /* ⚠️ The OneSpace is the whole page here: the account door and the operator door
     have nothing underneath, so it is handed no way out. */
  if (screen === "space") {
    return <><NoticeHost /><OneSpace path={path} onGo={go} onClose={null} /></>;
  }

  /* ⚠️ A workspace's own address is the PRODUCT, with OneSpace pulled over it —
     and the product does not move while it is open (`beneath`). */
  if (screen === "product") {
    return (
      <>
        <NoticeHost />
        <Product
          path={beneath}
          onGo={go}
          onOpenSpace={() => go(SPACE)}
          onOpenInbox={() => go(pathOf({ at: "inbox" }))}
        />
        {inSpace(path)
          ? <OneSpace path={path} onGo={go} onClose={() => go(beneath)} />
          : null}
      </>
    );
  }

  /* ⚠️ `NoticeHost` mounts ONCE, beside whichever frame renders — two hosts
     would show every notice twice, which reads as a fault in the thing being
     announced. */
  /*
    ⚠️ THE GROUND WEARS THE PRODUCT'S OWN FRAME, AND FOR A WHILE IT DID NOT.
    Rendering a screen on its own leaves out the largest half of this design
    system: `Shell` picks the world, `Page` MOUNTS it — the scene, the grain, the
    vignette, the hem, the scroll listener the hem's opacity is driven by — and
    reserves the room for the island. A ground without it tests the components
    and none of the frame, which is exactly the part a product cannot opt out of.

    ⚠️ AND THE SYMPTOM WAS VISIBLE BEFORE THE CAUSE WAS. The crown's hem is a
    156px wash that reaches past the sticky header, driven by `--hem-top`, which
    `Page` sets from the scroll position — so with no `Page` the property stayed
    at its default and every ground screen wore a permanent dark scrim across its
    own heading. It reads as a vignette for a chrome that is not there, which is
    what it was.

    ⚠️ IT IS THE SPACE THAT MOUNTS THE SHELL, NOT THE APP — the same call
    `centre/Product.tsx` makes for a real product, with the same manifest. An app
    that brought its own chrome would be an app that could get it wrong.
  */
  /*
    ⚠️ LAZY, AND THAT IS THE WHOLE OF WHY THIS IS NOT INLINE. The ground needs
    the reference app; a static import ships it to every customer, which is what
    was happening — measured in the built bundle. `React.lazy` puts it in a chunk
    production never requests. See `Ground.tsx`.
  */
  if (screen === "ground" && ground && Ground) {
    return (
      <>
        <NoticeHost />
        <React.Suspense fallback={null}><Ground route={ground} /></React.Suspense>
      </>
    );
  }

  /*
    ⚠️ A DOOR IS THE PAGE, AND THAT IS WHY IT IS NOT IN THE FRAME BELOW. These
    three screens brought their own `Arrival` — mark, name, one claim, one
    action, the ambience full-bleed. Sitting them inside OneSpace's crown put the
    product's name on the screen twice and the raw hostname under it, which is
    the first thing anybody ever sees of this product.
  */
  /*
    ⚠️ THE CURTAIN IS THE WHOLE SCREEN, AND IT IS NOT INSIDE THE FRAME BELOW. The
    wait used to mount the deployment's entire chrome — a crown naming One, a
    reading band, a generated sky — around eleven words, so the first thing
    anybody saw was a page that had started building itself and stopped. Nothing
    on it was knowable yet: the door was not classified, so the crown could not
    say where this was, and the sky was a decision about a place we had not
    identified.

    ⚠️ AND IT SAYS ONE THING NOW, NOT TWO. "Finding this place" and "Checking who
    you are" were an honest split and a distinction nobody outside this file can
    act on — two captions for one moment, each describing a step of a boot the
    person watching did not ask about.
  */
  if (screen === "waiting") return <Opening says={OPENING_LINES} />;

  /*
    ⚠️ EVERY WAY THIS DOES NOT BECOME A PRODUCT WEARS THE CURTAIN, and until it
    did they were cards on a half-built page. A boot that threw drew the whole
    chrome — a crown naming the deployment, a generated sky, a reading band —
    around a grey notice reading "One could not start", which is a page that
    began assembling itself and stopped: the exact thing `Opening`'s own header
    describes removing from the wait, still shipping on the screen a person is
    most likely to be looking at when something is wrong.

    ⚠️ SAME CURTAIN, NOT A SECOND ONE. A wait and a fault are the same moment
    from outside — the product is not there — so the only thing that changes is
    how it ends: the arc stops travelling, the O closes, and the line says why
    instead of passing the time.
  */
  if (screen === "stuck" && stuck) {
    return (
      <Opening
        stopped={{
          says: stuck.title,
          ...(stuck.detail ? { under: stuck.detail } : {}),
          /* ⚠️ RELOADING IS THE ONLY HONEST OFFER. Whatever this was happened
             before the app existed, so there is no state to retry from and
             nothing here knows what to fix. */
          offer: { label: "Try again", onDo: () => { location.reload(); } },
        }}
      />
    );
  }

  /*
    ⚠️ AND A DOOR THIS BUNDLE IS NOT IS THE SAME SCREEN, INCLUDING THE 404. An
    address nothing is served at, an operator console, a workspace's own product
    — from here they are all "this is not the page for this address", which is
    the curtain with a way back rather than a card floating on a sky.
  */
  if (screen === "elsewhere" && where) {
    return (
      <Opening
        stopped={{
          says: ELSEWHERE_SAYS[where.kind] ?? ELSEWHERE_SAYS.none!,
          under: ELSEWHERE_UNDER[where.kind] ?? ELSEWHERE_UNDER.none!,
          offer: {
            label: `Go to ${where.root}`,
            onDo: () => { location.assign(signpostUrl(where, location)); },
          },
        }}
      />
    );
  }

  if (screen === "signpost" && where) return <><NoticeHost /><Signpost where={where} /></>;
  if (screen === "sign-in") return <><NoticeHost /><SignIn lead={LEAD[face ?? ""]} /></>;
  if (screen === "new-workspace" && where) {
    return <><NoticeHost /><NewWorkspace where={where} /></>;
  }

  /*
    ⚠️ AND THE STATE THAT CANNOT HAPPEN GETS THE CURTAIN TOO. `pickScreen`
    answers every combination, so nothing should reach this — and "nothing should
    reach this" is how a blank page ships, which is why it was already answered
    rather than left to fall through. What it answered WITH was the deployment's
    whole chrome around two conditionals that are both handled above now: a page
    assembling itself around nothing at all.

    ⚠️ IT NAMES ITSELF AS OURS. There is no instruction to give somebody here
    because there is nothing they did and nothing they can do; what an honest
    screen owes is that this is our fault and a way back to a page that works.
  */
  return (
    <Opening
      stopped={{
        says: "This is not a screen",
        under: "Something here is wrong on our side, and nothing you did caused it",
        offer: { label: "Try again", onDo: () => { location.reload(); } },
      }}
    />
  );
}
