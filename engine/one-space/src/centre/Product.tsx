/**
 * A WORKSPACE'S OWN ADDRESS — the product, and the product only.
 *
 * ⚠️ THE FIVE AREAS ARE GONE FROM THE BAR. People, money, settings, trust and a
 * cross-app home used to be the permanent nav here, with each product filed
 * underneath them — so the thing somebody signed in to use was one level below
 * four things they visit twice a year, and every one of those four was
 * unreachable from any other door. They are OneSpace's now, over every screen,
 * from every door; what is left in the nav is what the product declared.
 *
 * ⚠️ THE SHELL IS THE PLATFORM'S; THE SCREEN'S CONTENT IS THE APP'S. Routing,
 * chrome, reachability and the switcher are decided out here — see
 * `AppSurface`.
 *
 * ⚠️ AND THE ROUTE THE SPACE IS AT NEVER REACHES THIS FILE. `beneath` in
 * `nav.ts` holds the last address that was not OneSpace's, so opening OneSpace
 * does not quietly change the product underneath it.
 */

import {
  Await, Band, Crown, Face, Layout, Opening, Shell, Spacer, TYPE, placeFace, whoFace,
} from "@engine/design";
import type { ScreenSpec } from "@engine/kernel";
import { Button } from "@heroui/react";
import { OPENING_LINES } from "../opening.js";
import { useSession } from "../session.js";
import { AppSurface } from "./AppSurface.js";
import { Choose } from "./Choose.js";
import { useCentre, useLoad, type InboxView } from "./data.js";
import { parseStop, shellAt } from "./route.js";

export function Product({ path, onGo, onOpenSpace, onOpenInbox }: {
  readonly path: string;
  readonly onGo: (path: string) => void;
  readonly onOpenSpace: () => void;
  readonly onOpenInbox: () => void;
}) {
  const { me } = useSession();
  const { of, again } = useCentre();
  /* ⚠️ Polled gently, so the badge is honest without a socket. */
  const inbox = useLoad<InboxView>("inbox.list");
  const unread = inbox.of.status === "ready" ? inbox.of.data.unseen : undefined;
  const person = me && me !== "nobody" ? me : null;
  const email = person?.email ?? undefined;

  return (
    <Await
      of={of}
      waiting={<Opening says={OPENING_LINES} />}
      again={again}
      then={(view) => {
        const stop = parseStop(path, view.apps.map((a) => a.id));
        /* ⚠️ THE STOP TRAVELS, NOT JUST ITS PARTS. `shellAt` needs the whole of
           it to write an address in the same space as the screens it rewrites,
           and pulling `route` out here left nothing to narrow against. */
        const open = stop.kind === "app" ? stop : null;
        const app = open ? view.apps.find((a) => a.id === open.app) ?? null : null;
        const route = open?.route ?? "/";

        /* ⚠️ No product open: no product's nav either. A shell drawn around a
           chooser would put one app's five destinations over the choice of
           which app somebody wants. */
        if (!app || !open) {
          return (
            /* ⚠️ THE WORKSPACE'S OWN PLANET, LIKE EVERY OTHER SCREEN OF IT.
               This named `glow` by hand — the one surface in the product that
               chose its own ground, which is what `groundOf` says must never
               happen — so the door INTO a workspace was the one place that
               workspace's world was absent.

               ⚠️ AND IT NAMES THE SUBJECT RATHER THAN BUILDING THE WORLD.
               `Layout` derives the ground, the density and the subject context
               from one face; a screen calling `worldFor` itself is a second
               derivation of one fact, which `scripts/scene.test.mjs` refuses. */
            <Layout subject={placeFace(view.tenant.slug)}>
              {/* ⚠️ THE SAME LEAD EVERY OTHER CROWN HAS. This screen used to
                  hand-assemble an `aside` from a face and an email — the `You`
                  helper — which is how the one screen with no product open came
                  to draw somebody differently from every screen that has one. */}
              <Crown
                who={{
                  name: email ?? "You",
                  face: person ? whoFace(person.accountId) : undefined,
                  onOpen: onOpenSpace,
                }}
                name={view.tenant.name}
                under="One"
              />
              <Band width="read"><div className="py-2"><Choose view={view} onGo={onGo} /></div></Band>
              <Spacer />
            </Layout>
          );
        }

        /* ⚠️ BOTH HALVES FROM ONE CALL — see `shellAt`. The screens carry the
           workspace's addressing and `here` is written by the same function, so
           the shell cannot be handed an address its own screens are not in. Built
           separately, the root was `/` while every screen was under `/<app>`, and
           the screen being drawn was one the shell could not find. */
        const { screens, here } = shellAt<ScreenSpec>(open, app.screens);

        return (
          <Shell
            screens={screens}
            /* ⚠️ THE PRODUCT'S OWN COLOUR — see `AppSpec.hue`. It travels with
               the manifest, so switching products changes the world as well as
               the nav; a colour resolved anywhere else would be one more thing
               that has to agree. */
            hue={app.hue}
            here={here}
            held={new Set(app.permissions)}
            /* ⚠️ WHAT THE WORKSPACE IS, so a business-only screen is not offered
               to one that is not — the same question the gate asks, in the same
               order (D21). */
            kind={view.tenant.kind ?? "personal"}
            crown={{
              appId: app.id,
              appName: app.name,
              appMark: app.mark,
              tenantName: view.tenant.name,
              /* ⚠️ The switcher lists the OTHER products — a button back to
                 where you already are is a control that does nothing. */
              apps: view.apps.filter((a) => a.id !== app.id)
                .map((a) => ({ id: a.id, name: a.name, mark: a.mark })),
              unread,
              personEmail: email,
              personFace: person ? whoFace(person.accountId) : undefined,
            }}
            onGo={onGo}
            onSwitchApp={(id) => onGo(`/${id}`)}
            onOpenInbox={onOpenInbox}
            onOpenSpace={onOpenSpace}
          >
            <AppSurface app={app} route={route} onGo={onGo} />
          </Shell>
        );
      }}
    />
  );
}

