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

import { Band, Crown, NoticeHost, Page, Spacer, Trouble, Working, TYPE } from "@quad/web";
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

const LEAD: Readonly<Record<string, string>> = {
  create: "Sign in first — a workspace belongs to somebody.",
  centre: "Sign in to open this workspace.",
  console: "Sign in. The console admits operators only.",
  hub: "We will email you a code. There is no password to remember or lose.",
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

  return (
    /* ⚠️ The ambience is an attribute on the frame, read by a stylesheet rule
       built from theme tokens — never an inline style, which would beat every
       token and stop a workspace's branding reaching any screen. */
    <Page sky="calm">
      <NoticeHost />
      <Crown
        name="One"
        under={where?.root}
        width={settled ? "work" : "read"}
        ruled={settled}
        aside={me && me !== "nobody" ? <span className={TYPE.note}>{me.email}</span> : null}
      />
      <Band width={settled ? "work" : "read"}>
        <div
          className={settled
            ? "py-8"
            : "min-h-[68dvh] flex flex-col items-center justify-center gap-6 py-8"}
        >
          {screen === "waiting" ? <Working says="Getting your workspaces" /> : null}
          {screen === "stuck" && stuck ? <Trouble problem={stuck} /> : null}
          {screen === "signpost" && where ? <Signpost where={where} /> : null}
          {screen === "sign-in" ? <SignIn lead={LEAD[face ?? ""] ?? LEAD.hub!} /> : null}
          {screen === "new-workspace" && where ? <NewWorkspace where={where} /> : null}
          {screen === "elsewhere" && where ? <Elsewhere where={where} kind={where.kind} /> : null}
          {screen === "gallery" ? <Gallery /> : null}
        </div>
      </Band>
      <Spacer />
    </Page>
  );
}
