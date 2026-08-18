/**
 * YOUR OWN PREFERENCES, ACROSS EVERY PRODUCT.
 *
 * ⚠️ A LEVEL IS AN AUTHORITY, SO IT IS A DESTINATION. What a workspace is set to
 * is decided by whoever runs it and applies to everybody in it; what you prefer
 * is yours and follows you into every workspace you are in. Those were rendered
 * one under the other on the workspace's settings screen — an administration
 * surface with a preference inside it, which also meant a member with no
 * `tenant:manage` could not reach their own.
 *
 * ⚠️ AND IT CARRIES NO WORKSPACE, WHICH IS THE POINT. This is the same split the
 * OneSpace already draws between `told` (how YOU are told) and `notices` (what
 * everybody here may be sent). It reuses the workspace centre's own view for the
 * manifests, because that is where the deployment keeps them — the level is what
 * makes this a different screen, not a different source.
 */

import { SettingsArea } from "./SettingsArea.js";
import { useCentre } from "./data.js";
import { Screen } from "@engine/design";
import { useSession } from "../session.js";
import { PickWorkspace } from "../space/PickWorkspace.js";
import type { Where } from "../space/where.js";

export function Preferences({ where, onGo }: {
  readonly where: Extract<Where, { at: "prefs" }>;
  readonly onGo: (to: Where) => void;
}) {
  /*
    ⚠️ ON THE ACCOUNT DOOR IT IS A CHOOSER, and the header above is why it looked
    as though it should not need to be. What you prefer does follow you — but the
    SETTINGS are declared by apps, and which apps you have is a fact about a
    workspace, so the manifests this screen renders come from `centre.view`. On
    `id.` that 404s, and the whole page drew a title over "That is not here".
  */
  const door = useSession().where;
  if (door?.kind !== "tenant") {
    return (
      <PickWorkspace
        to={{ at: "prefs" }}
        under="What a product does for you is set where the product is"
        empty="Products are switched on in a workspace, and you are not in one"
        onGo={onGo}
      />
    );
  }
  return <Inside where={where} onGo={onGo} />;
}

function Inside({ where, onGo }: {
  readonly where: Extract<Where, { at: "prefs" }>;
  readonly onGo: (to: Where) => void;
}) {
  const { of, again } = useCentre();

  /* ⚠️ THE FRAME SURVIVES THE WAIT — see `WorkspacePart`. A bare spinner over
     the surface leaves the screen nameless and un-leavable while it loads. */
  if (of.status !== "ready") {
    return <Screen shape="detail" of={of} again={again} then={() => null} />;
  }

  return (
    <SettingsArea
      view={of.data}
      level="person"
      app={where.app}
      area={where.area}
      onGo={(id) => onGo({ at: "prefs", app: id })}
      onArea={(id) => onGo({ at: "prefs", app: where.app, area: id })}
    />
  );
}
