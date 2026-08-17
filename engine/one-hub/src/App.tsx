/**
 * WHAT THIS PAGE IS — the door decides, and the hub is over all of it.
 *
 * ⚠️ THE HUB IS NOT A DOOR. It is a surface presented over whatever somebody
 * was doing, reachable from every one of them: who you are, everywhere you
 * belong, and — for the few who hold it — the deployment itself. It used to be
 * an app per door with a nav bar of its own, so a person's account lived on one
 * hostname, their workspace's roster on another, and the operator console on a
 * third, each with a permanent bar over it announcing four places they visit
 * twice a year.
 *
 * ⚠️ SO EVERY DOOR ANSWERS `/hub`, AND WHAT IS UNDERNEATH DIFFERS. On a
 * workspace's own address the product is underneath and the hub dismisses back
 * onto it; on the account and operator doors there is nothing underneath and
 * the hub IS the page, which is why it is handed no way out there.
 *
 * ⚠️ AND THE PICK IS A PURE FUNCTION, so it is a test rather than a click
 * through five hostnames. The bug it exists to catch is a state that resolves to
 * nothing: a door served by the worker with no screen behind it renders a blank
 * page, which is the same picture as a page that failed to load.
 */

import {
  Band, Center, Crown, Layout, NoticeHost, ONE_FACE, Shell, Spacer, Trouble, Working,
  whoFace,
} from "@engine/design";
import { HELLO } from "@engine/hello";
import { HELLO_ROUTES, HelloScreen } from "@engine/hello/screens";

import { useSession } from "./session.js";
import { useTravel } from "./nav.js";
import type { Face } from "./door.js";
import { Product } from "./centre/Product.js";
import { Hub } from "./hub/Hub.js";
import { HUB, inHub, pathOf } from "./hub/where.js";
import { Elsewhere } from "./screens/Elsewhere.js";
import { NewWorkspace } from "./screens/NewWorkspace.js";
import { SignIn } from "./screens/SignIn.js";
import { Signpost } from "./screens/Signpost.js";

/** What the page shows, as a name — the thing the guard and the tests read. */
export type Screen =
  | "waiting" | "stuck" | "signpost" | "sign-in" | "hub" | "new-workspace"
  | "product" | "elsewhere" | "ground";

/**
 * ⚠️ EVERY COMBINATION IS ANSWERED, INCLUDING THE ONES THAT SHOULD NOT HAPPEN.
 * "That cannot occur" is how a blank page ships: the state that could not occur
 * occurs, nothing matches, and React renders nothing at all.
 */
export function pickScreen(
  face: Face | null, signedIn: boolean | null, stuck: boolean, showcase = false,
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
  if (face === "centre") return "product";
  if (face === "create") return "new-workspace";
  /* ⚠️ THE ACCOUNT DOOR AND THE OPERATOR DOOR ARE THE SAME PAGE. Both are the
     hub with nothing underneath; what an operator holds is a place ON it, not a
     product of its own — see `hub/Console.tsx`. */
  return "hub";
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
     it — the hub's crown over a product's page, which is a layout no deployment
     serves and therefore a layout nobody was testing. */
  const ground = import.meta.env.DEV
    ? HELLO_ROUTES.find((r) => r === (query.get("screen") ?? ""))
      ?? (query.has("ground") ? HELLO_ROUTES[0] ?? null : null)
    : null;
  const showcase = ground !== null;
  const screen = pickScreen(face, me === null ? null : me !== "nobody", stuck !== null, showcase);

  /* ⚠️ The hub is the whole page here: the account door and the operator door
     have nothing underneath, so it is handed no way out. */
  if (screen === "hub") {
    return <><NoticeHost /><Hub path={path} onGo={go} onClose={null} /></>;
  }

  /* ⚠️ A workspace's own address is the PRODUCT, with the hub pulled over it —
     and the product does not move while it is open (`beneath`). */
  if (screen === "product") {
    return (
      <>
        <NoticeHost />
        <Product
          path={beneath}
          onGo={go}
          onOpenHub={() => go(HUB)}
          onOpenInbox={() => go(pathOf({ at: "inbox" }))}
        />
        {inHub(path)
          ? <Hub path={path} onGo={go} onClose={() => go(beneath)} />
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

    ⚠️ IT IS THE HUB THAT MOUNTS THE SHELL, NOT THE APP — the same call
    `centre/Product.tsx` makes for a real product, with the same manifest. An app
    that brought its own chrome would be an app that could get it wrong.
  */
  if (screen === "ground" && ground) {
    const go = (next: string) => {
      const to = new URL(location.href);
      to.searchParams.set("screen", next);
      location.assign(to.toString());
    };
    return (
      <>
        <NoticeHost />
        <Shell
          screens={HELLO.screens}
          here={ground}
          /* ⚠️ Everything, because the ground is for looking at every screen —
             what a permission HIDES is `reachable`'s job and it has its own
             test. A ground that held two of four would be a ground where two
             screens are unreachable and nothing says which. */
          held={new Set(["note:read", "note:write", "member:read", "tenant:manage"])}
          /* ⚠️ On, or the screen behind the flag is undrawable here — which is
             the one screen whose whole point is that a flag decides. */
          flags={{ "note-search": true }}
          /* ⚠️ COMMERCIAL, FOR THE SAME REASON THE FLAG IS ON: a business-only
             screen is undrawable on a personal ground, and the ground exists to
             draw every screen. What the kind WITHHOLDS is `reachable`'s job and
             has its own test — a ground that hid one would be a ground where a
             screen is unreachable and nothing says which. */
          kind="commercial"
          crown={{
            appId: HELLO.id,
            appName: HELLO.name,
            appMark: HELLO.mark,
            tenantName: "The test ground",
            unread: 2,
            personEmail: "somebody@example.com",
            personFace: whoFace("ground"),
          }}
          onGo={go}
        >
          <HelloScreen route={ground} onGo={go} />
        </Shell>
      </>
    );
  }

  /*
    ⚠️ A DOOR IS THE PAGE, AND THAT IS WHY IT IS NOT IN THE FRAME BELOW. These
    three screens brought their own `Arrival` — mark, name, one claim, one
    action, the ambience full-bleed. Sitting them inside the Hub's crown put the
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
          IS the hub, so the face is a face rather than a button (`who` with no
          `onOpen`). The email it used to carry as an `aside` is what the face
          says now; the address under the name is the deployment's. */}
      <Crown
        who={me && me !== "nobody"
          ? { name: me.email ?? "You", face: whoFace(me.accountId) }
          : undefined}
        name="One"
        width="read"
      />
      <Band width="read">
        {/* ⚠️ THE RHYTHM IS `Center`'s, NOT A `gap-6` WRITTEN HERE. A frame
            picking its own spacing is the drift `metrics` exists to refuse, and
            this one was invisible while the class sat inside a ternary. */}
        <div className="min-h-[68dvh] flex items-center justify-center py-8">
          <Center space="roomy">
            {screen === "waiting" ? <Working says="Getting your workspaces" /> : null}
            {screen === "stuck" && stuck ? <Trouble problem={stuck} /> : null}
            {screen === "elsewhere" && where ? <Elsewhere where={where} kind={where.kind} /> : null}
          </Center>
        </div>
      </Band>
      <Spacer />
    </Layout>
  );
}
