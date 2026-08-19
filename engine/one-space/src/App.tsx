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
  Band, Center, Crown, Layout, NoticeHost, ONE_FACE, Shell, Spacer, Trouble, Working,
  whoFace,
} from "@engine/design";

import { useSession } from "./session.js";
import { useTravel } from "./nav.js";
import type { Face } from "./door.js";
import { Product } from "./centre/Product.js";
import { OneSpace } from "./space/OneSpace.js";
import { SPACE, inSpace, pathOf } from "./space/where.js";
import { Agreements } from "./screens/Agreements.js";
import { Elsewhere } from "./screens/Elsewhere.js";
import { NewWorkspace } from "./screens/NewWorkspace.js";
import { SignIn } from "./screens/SignIn.js";
import { Signpost } from "./screens/Signpost.js";

/* ⚠️ DYNAMIC, SO THE REFERENCE APP IS NOT IN THE PRODUCTION BUNDLE. A static
   import behind `import.meta.env.DEV` reads as dev-only and is not — the module
   graph is decided before the branch is, and hello's whole manifest was measured
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
    176px wash that reaches past the sticky header, driven by `--hem-top`, which
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
  if (screen === "signpost" && where) return <><NoticeHost /><Signpost where={where} /></>;
  if (screen === "sign-in") return <><NoticeHost /><SignIn lead={LEAD[face ?? ""]} /></>;
  if (screen === "new-workspace" && where) {
    return <><NoticeHost /><NewWorkspace where={where} /></>;
  }

  return (
    /*
      ⚠️ THE DEPLOYMENT'S OWN WORLD, ON THE DOOR THAT IS THE DEPLOYMENT. Every
      other subject in this product has a face and a ground from it — a workspace
      is a planet on its own sky, a person is their own aura — and ONE was the
      one identity standing on a named material like any other screen. It is
      `blobs`: shapes with no grid at all, because the deployment is the thing
      every workspace and every product is INSIDE, and a lattice or a horizon
      would put it beside them instead.

      ⚠️ AND ITS TWO COLOURS ARE THE THEME'S, not a picture's. ONE's mark is
      drawn rather than generated, so there is nothing to read — `worldFor` hands
      the family `var(--background)` and `var(--brand)`, which is why that family
      draws in ink and lets the ground carry the hue (`Family.ink`).
    */
    <Layout subject={ONE_FACE}>
      <NoticeHost />
      {/* ⚠️ THE LEAD IS THE ACCOUNT AND THERE IS NOWHERE FOR IT TO GO — this
          IS OneSpace, so the face is a face rather than a button (`who` with no
          `onOpen`). The email it used to carry as an `aside` is what the face
          says now; the address under the name is the deployment's. */}
      <Crown
        who={me && me !== "nobody"
          ? { name: me.email ?? "You", face: whoFace(me.accountId) }
          : undefined}
        name="One"
        /* ⚠️ THE ONLY CROWN THAT WEARS THE LOGO, and the mark rather than the
           lockup — the name is already beside it. Every other crown in the
           product names a workspace, where our mark would sit over somebody
           else's brand. */
        mark="one"
        width="read"
      />
      <Band width="read">
        {/* ⚠️ THE RHYTHM IS `Center`'s, NOT A `gap-6` WRITTEN HERE. A frame
            picking its own spacing is the drift `metrics` exists to refuse, and
            this one was invisible while the class sat inside a ternary. */}
        <div className="min-h-[68svh] flex items-center justify-center py-8">
          <Center space="roomy">
            {/*
              ⚠️ TWO STATES WORE ONE CAPTION, AND IT DESCRIBED NEITHER. `waiting`
              is either "the door is not classified yet" or "the session is not
              resolved yet"; it said "Getting your workspaces" for both, which is
              a third thing that happens later and only for somebody signed in.
              A person watching a slow boot was reading an explanation of work
              that was not being done.
            */}
            {screen === "waiting"
              ? <Working says={face === null ? "Finding this place" : "Checking who you are"} />
              : null}
            {screen === "stuck" && stuck ? <Trouble problem={stuck} /> : null}
            {screen === "elsewhere" && where ? <Elsewhere where={where} kind={where.kind} /> : null}
          </Center>
        </div>
      </Band>
      <Spacer />
    </Layout>
  );
}
