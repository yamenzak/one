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

import { Band, Crown, Layout, NoticeHost, ONE_FACE, Spacer, Trouble, Working, whoFace } from "@quad/web";
import { Gallery } from "./screens/Gallery.js";
import { SPECIMEN_IDS, Specimen, type SpecimenId } from "./screens/Specimens.js";

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
  | "product" | "elsewhere" | "gallery";

/**
 * ⚠️ EVERY COMBINATION IS ANSWERED, INCLUDING THE ONES THAT SHOULD NOT HAPPEN.
 * "That cannot occur" is how a blank page ships: the state that could not occur
 * occurs, nothing matches, and React renders nothing at all.
 */
export function pickScreen(
  face: Face | null, signedIn: boolean | null, stuck: boolean, showcase = false,
): Screen {
  /* ⚠️ THE VOCABULARY CATALOGUE IS A DEVELOPMENT SURFACE AND NEVER REACHABLE IN
     PRODUCTION. A page listing every component a product has is a page that
     leaks every capability it has, including the ones a workspace has not
     bought. It is asked for by a query the deployment only honours in
     development — see `App`. */
  if (showcase) return "gallery";
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
  const showcase = import.meta.env.DEV && query.has("gallery");
  /* ⚠️ A WHOLE SCREEN, ASSEMBLED FROM THE VOCABULARY AND NOTHING ELSE. The
     catalogue proves each piece renders; a specimen proves a real screen can be
     built without reaching around any of them. Development only, for the same
     reason the catalogue is. */
  const specimen = import.meta.env.DEV
    ? SPECIMEN_IDS.find((id) => id === query.get("screen")) ?? null
    : null;
  const screen = pickScreen(face, me === null ? null : me !== "nobody", stuck !== null, showcase);

  /* ⚠️ A SCREEN SOMEBODY WORKS IN AND A SCREEN SOMEBODY ARRIVES AT ARE NOT THE
     SAME LAYOUT. The first is a column under a ruled crown; the second is a
     centred sheet with no chrome. Using one for both makes the sign-in look like
     a settings page — which is how a product comes to feel like a form. */
  const settled = screen === "gallery";

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

  /* ⚠️ A specimen brings its OWN page, crown and ambience — that is the whole
     claim being tested — so it replaces the frame rather than sitting inside it. */
  /* ⚠️ `NoticeHost` mounts ONCE, beside whichever frame renders — two hosts
     would show every notice twice, which reads as a fault in the thing being
     announced. */
  if (specimen) return <><NoticeHost /><Specimen id={specimen as SpecimenId} /></>;

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
        under={where?.root}
        width={settled ? "work" : "read"}
      />
      <Band width={settled ? "work" : "read"}>
        <div
          className={settled
            ? "py-8"
            : "min-h-[68dvh] flex flex-col items-center justify-center gap-6 py-8"}
        >
          {screen === "waiting" ? <Working says="Getting your workspaces" /> : null}
          {screen === "stuck" && stuck ? <Trouble problem={stuck} /> : null}
          {screen === "elsewhere" && where ? <Elsewhere where={where} kind={where.kind} /> : null}
          {screen === "gallery" ? <Gallery /> : null}
        </div>
      </Band>
      <Spacer />
    </Layout>
  );
}
