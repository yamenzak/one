/**
 * WHICH PRODUCT — the only screen a workspace's own address has that is not a
 * product's.
 *
 * ⚠️ IT IS NOT A DASHBOARD, AND THAT IS THE CORRECTION. There was a Home here
 * once: unread counts, cards into People and Money, a chip saying who you are —
 * a summary of four surfaces, none of which it could act on, standing between
 * somebody and the product they came to open. All four are the hub's now, one
 * gesture from every screen, so what is left is the choice this address cannot
 * make for you.
 *
 * ⚠️ AND IT IS ONLY DRAWN WHEN THERE IS A CHOICE. One product opens directly —
 * a chooser with one card is a screen whose entire content is a button.
 */

import { Nothing, Place, Stack, Title, appFace } from "@quad/web";
import type { CentreView } from "./data.js";

export function Choose({ view, onGo }: {
  readonly view: CentreView;
  readonly onGo: (path: string) => void;
}) {
  if (view.apps.length === 0) {
    return (
      <Nothing
        says="This workspace has no products switched on"
        under="Somebody who runs it can add one from Money"
      />
    );
  }

  return (
    <Stack space="roomy">
      <Title under={view.tenant.name}>Open</Title>
      <Stack space="snug">
        {view.apps.map((app, i) => (
          <Place
            key={app.id}
            at={i}
            tone={i === 0 ? "info" : "neutral"}
            face={appFace(app.id, app.mark)}
            name={app.name}
            said={app.screens.map((s) => s.label).slice(0, 3).join(" · ")}
            foot={view.you.appRoles[app.id]
              ? `You are ${an(view.you.appRoles[app.id]!)} here`
              : "You are not a user of this one"}
            onOpen={() => onGo(`/${app.id}`)}
          />
        ))}
      </Stack>
    </Stack>
  );
}

const an = (word: string): string => `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
