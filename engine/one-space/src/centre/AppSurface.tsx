/**
 * A PRODUCT'S OWN SCREENS, INSIDE THE SAME SHELL.
 *
 * ⚠️ THE SHELL IS THE PLATFORM'S; THE SCREEN'S CONTENT IS THE APP'S. Routing,
 * chrome, reachability and the switcher are all decided out here — what a
 * product contributes is the inside of each declared screen, registered by
 * route through `mountScreen`. A screen an app has declared and not yet
 * shipped renders an honest notice rather than a blank page, because those
 * are indistinguishable and only one of them gets reported.
 */

import * as React from "react";
import { Allowed, Group, NoteRow, RowsWaiting, Section, Stack, appFace } from "@engine/design";
import { screensOf } from "../apps.js";
import { routeIn } from "./route.js";
import { beneath, screenFor } from "@engine/kernel";
import type { CentreApp } from "./data.js";

/**
 * ⚠️ THE ONE REGISTRY, keyed `appId + declared route`. A deployment that ships
 * a product's screens fills it at boot; nothing else may draw inside an app's
 * frame. This is the seam the app-migration stages fill — the centre does not
 * grow product screens of its own (D12, applied to UI).
 */
/**
 * ⚠️ `unknown`, FOR THE REASON THE KERNEL TYPES A HANDLER'S CONTEXT THAT WAY. A
 * product may not import this page — the arrow points `apps → design → runtime →
 * kernel` — so it cannot name `CentreApp`, and typing the registry against it
 * would make the one legal caller unable to satisfy it. What crosses the seam is
 * data; the narrowing is the app's, right at the point it uses one.
 */
export interface AppScreen {
  readonly app: unknown;
  /**
   * ⚠️ HOW A PRODUCT REACHES ITS OWN OTHER SCREENS, and it takes the app's OWN
   * route — `/thing`, not `/inventory/thing`. The prefix is the platform's
   * business: a product that wrote its own would be a product that knows where
   * the centre mounted it, and the day that changes every list in every app
   * opens a page that does not exist.
   *
   * ⚠️ AND IT IS A PROP RATHER THAN PART OF `mount`. `mount` runs once when the
   * chunk arrives; navigation belongs to whatever is rendering NOW, and a
   * function captured at load time would go on driving a router that has since
   * been replaced.
   */
  readonly go: (route: string) => void;
  /**
   * ⚠️ WHAT THIS SCREEN'S ADDRESS SAYS IT IS ABOUT — the segments past the
   * screen's own route. `/thing/t-glove` arrives here as `["t-glove"]`, which is
   * what makes a detail screen linkable, reloadable and something support can
   * ask somebody to open. Held in component state instead, a list and the record
   * it opened share one address and the back button leaves the product.
   */
  readonly at: readonly string[];
}

const MOUNTS = new Map<string, React.ComponentType<AppScreen>>();

/**
 * ⚠️ BEHIND A BOUNDARY, BECAUSE THE RENDERER IS EVERY BLOCK IT CAN DRAW.
 * `Declared` reaches `@engine/design/body`, which reaches the whole block
 * registry — imported statically it put 14 KiB into the module the first paint
 * blocks on, for a page that is only ever reached after somebody has opened a
 * product. Measured, by doing it: `weight.test.ts` went over its ceiling on the
 * commit that added the import, which is the only reason this was noticed at
 * all.
 */
const Declared = React.lazy(() => import("./Declared.js")
  .then((m) => ({ default: m.Declared })));

export const mountScreen = (
  appId: string, route: string, screen: React.ComponentType<AppScreen>,
): void => { MOUNTS.set(`${appId}${route}`, screen); };

/**
 * WHICH OF THE THREE DRAWS THIS SCREEN — a pure function, so that it is a test.
 *
 * ⚠️ THERE ARE THREE KINDS OF SCREEN AND ONLY TWO WERE ASKED ABOUT. A body is
 * READ, a story is WALKED, a session is the app's own code — and this condition
 * used to be `screen.body` alone, so every declared flow fell past the renderer,
 * past the mount table it is not in, and into the "this screen ships with…"
 * notice. Nothing failed anywhere: the manifest composed, every guard passed,
 * and the shots harness draws a flow directly so the photographs showed it
 * working. Only opening the product did.
 *
 * ⚠️ AND IT IS A FUNCTION RATHER THAN A CONDITION IN THE JSX for that reason. A
 * condition is checkable by reading it and by nothing else; the day a fourth
 * kind of screen arrives, this is where the compiler and the test both land.
 */
export const drawnBy = (
  screen: { readonly body?: unknown; readonly story?: unknown } | undefined,
  mounted: boolean,
): "declared" | "mounted" | "notice" => {
  if (screen?.body || screen?.story) return "declared";
  return mounted ? "mounted" : "notice";
};

export function AppSurface({ app, route, onGo }: {
  readonly app: CentreApp;
  readonly route: string;
  /** Takes a WHOLE path — the centre's own address, prefix and all. */
  readonly onGo: (path: string) => void;
}) {
  /*
    ⚠️ THE PRODUCT'S OWN CHUNK IS ASKED FOR HERE, because this is the first place
    that knows which product is open — and one bundle serves every product, so it
    cannot have been loaded before now (D17, `apps.ts`).

    ⚠️ AND THE NOTICE IS NOT DRAWN WHILE IT LOADS. "This screen ships with the product"
    is what an unwritten screen says; showing it for the length of a fetch and
    then replacing it makes a working product look broken for a beat, which is
    the reading somebody reports.
  */
  const [asked, setAsked] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    setAsked(false);
    void screensOf(app.id).then(() => { if (live) setAsked(true); });
    return () => { live = false; };
  }, [app.id]);

  /* ⚠️ THE MOST SPECIFIC DECLARED SCREEN THE ADDRESS IS UNDER — see `screenFor`.
     An exact match meant `/thing/t-glove` fell through to the app's root, so
     every detail screen in every product drew the list it was opened from. */
  const declared = screenFor(app.screens, route)
    ?? app.screens.find((s) => s.route === "/")
    ?? app.screens[0];

  /* ⚠️ THE PREFIX IS ADDED HERE AND NOWHERE ELSE — see `AppScreen.go`. It is the
     same shape `Product` gives the nav, so a screen reached from a row and the
     same screen reached from the bar are one address. */
  const go = React.useCallback(
    (to: string) => onGo(routeIn(app.id, to)),
    [app.id, onGo],
  );

  /*
    ⚠️ A DECLARED BODY OUTRANKS A MOUNTED COMPONENT, AND THE ORDER IS WHAT MAKES
    A PORT A DELETION. A screen gains a `body`, the file that used to draw it
    stops being reached, and the day somebody removes that file nothing changes
    — which is the only way twenty-five screens move without a flag day. The
    other order would make a stale mount silently win over the declaration it
    was replaced by, and the screen would go on looking correct.

    ⚠️ AND IT DOES NOT WAIT FOR THE PRODUCT'S CHUNK. A declared body needs the
    manifest and the renderer, both of which are already here; holding it behind
    `asked` would pay for a download it does not read.

    ⚠️ AND WHICH OF THE THREE IT IS, IS `drawnBy` — see there. A story is a
    declared screen too, and this condition asked for a body alone.
  */
  const Mounted = declared && asked ? MOUNTS.get(`${app.id}${declared.route}`) : undefined;
  const draws = drawnBy(declared, Boolean(Mounted));

  if (draws === "declared" && declared) {
    return (
      <Allowed may={app.may}>
        {/* ⚠️ THE SAME WAIT THE SCREEN ITSELF DRAWS. The chunk and the screen's
            own data land at about the same moment, so a different placeholder
            here would be a second shape flashing in front of the first. */}
        <React.Suspense fallback={<RowsWaiting />}>
          <Declared
            screen={declared}
            screens={app.screens}
            at={beneath(declared.route, route)}
            go={go}
            /* ⚠️ THE BOOKS AND THE GRANTS, NOT A SECOND REQUEST FOR EITHER — see
               `Declared.app`. The centre already resolved both to draw the nav. */
            app={{
              guide: app.guide,
              milestones: app.milestones,
              permissions: app.permissions,
              ...(app.chose ? { chose: app.chose } : {}),
              ...(app.metered ? { metered: app.metered } : {}),
            }}
          />
        </React.Suspense>
      </Allowed>
    );
  }

  if (draws === "mounted" && Mounted) {
    return (
      /*
        ⚠️ WHAT THE GATE WOULD REFUSE, PUT WHERE EVERY CONTROL CAN REACH IT. It
        is provided here rather than threaded through each screen's props
        because the fault a prop produces is silent: the one screen somebody
        forgot draws a control that still fails after the press, which is the
        whole thing this mechanism exists to stop.
      */
      <Allowed may={app.may}>
        <Mounted app={app} go={go} at={beneath(declared?.route ?? "/", route)} />
      </Allowed>
    );
  }
  if (!asked) return <RowsWaiting />;

  return (
    /* ⚠️ THE PRODUCT WEARS ITS PLATE HERE TOO. The mark was a bare glyph set
       inline in the title, so it read as a character somebody had typed rather
       than as the product's mark — and it was the one place in OneSpace where a
       product appeared with no ground under it. */
    <Section label={declared?.label ?? app.name}>
      <Stack space="snug">
        {/* ⚠️ THE CARD IS ABOUT THE PRODUCT, THE PAGE IS ABOUT THE SCREEN. Both
            were headed "Today" for a moment — the section title and the card
            title saying the same word twice, four lines apart. What the note
            actually says is which product this screen belongs to, so that is
            what the card is headed. */}
        <Group face={appFace(app.id, app.mark)} label={app.name}>
          <NoteRow>
            This screen ships with {app.name}. The workspace itself — its people, its money,
            its settings — is already live, in OneSpace.
          </NoteRow>
        </Group>
      </Stack>
    </Section>
  );
}
