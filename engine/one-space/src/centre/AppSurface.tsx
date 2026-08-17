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
import { Group, NoteRow, RowsWaiting, Section, Stack, appFace } from "@engine/design";
import { screensOf } from "../apps.js";
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
export interface AppScreen { readonly app: unknown }

const MOUNTS = new Map<string, React.ComponentType<AppScreen>>();

export const mountScreen = (
  appId: string, route: string, screen: React.ComponentType<AppScreen>,
): void => { MOUNTS.set(`${appId}${route}`, screen); };

export function AppSurface({ app, route }: {
  readonly app: CentreApp;
  readonly route: string;
}) {
  /*
    ⚠️ THE PRODUCT'S OWN CHUNK IS ASKED FOR HERE, because this is the first place
    that knows which product is open — and one bundle serves every product, so it
    cannot have been loaded before now (D17, `apps.ts`).

    ⚠️ AND THE NOTICE IS NOT DRAWN WHILE IT LOADS. "This screen ships with Hello"
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

  const declared = app.screens.find((s) => s.route === route)
    ?? app.screens.find((s) => s.route === "/")
    ?? app.screens[0];

  const Mounted = declared && asked ? MOUNTS.get(`${app.id}${declared.route}`) : undefined;
  if (Mounted) return <Mounted app={app} />;
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
