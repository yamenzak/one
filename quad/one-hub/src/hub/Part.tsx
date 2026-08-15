/**
 * ONE WORKSPACE'S OWN SCREENS, inside the hub.
 *
 * ⚠️ THEY ANSWER AT THE WORKSPACE'S OWN ADDRESS AND NOWHERE ELSE. A workspace's
 * roster, its bill and its settings are its records; they live where its records
 * live, and the worker serving another door cannot answer for them. That is the
 * same boundary the membership index exists because of, and it must not be
 * crossed by copying — publishing one business's configuration into a store
 * every product reads is a worse answer than travelling.
 *
 * ⚠️ SO THE BODIES ARE THE ONES THAT ALREADY EXIST, and this file is only the
 * seam. What changed in the rewrite is where they are reached FROM: rows under
 * a workspace, rather than tabs in a bar that never goes away.
 */

import { Screen } from "@quad/web";
import { useCentre } from "../centre/data.js";
import { People } from "../centre/People.js";
import { Money } from "../centre/Money.js";
import { Packages } from "../centre/Packages.js";
import { Plan } from "../centre/Plan.js";
import { SettingsArea } from "../centre/SettingsArea.js";
import { Trust } from "../centre/Trust.js";
import { Wording } from "../centre/Wording.js";
import { Notices } from "../centre/Notices.js";
import type { Where } from "./where.js";
import { useSession } from "../session.js";

export type Part =
  | "people" | "money" | "plan" | "packages" | "settings" | "notices" | "trust" | "wording";

export function WorkspacePart({ part, slug, app, onGo }: {
  readonly part: Part;
  readonly slug: string;
  /** Which product, on the two screens that have one per product. */
  readonly app?: string;
  readonly onGo: (to: Where) => void;
}) {
  const { where } = useSession();
  const { of, again } = useCentre();

  /* ⚠️ THE FRAME HAS TO SURVIVE THE WAIT — see `TellingMe`. This drew a bare
     spinner over the whole surface, so every workspace screen was nameless and
     un-leavable while the centre view loaded. Each part below renders its own
     `Screen`, which is where the crown comes from once the answer is here. */
  if (of.status !== "ready") {
    return <Screen shape="detail" of={of} again={again} then={() => null} />;
  }
  const view = of.data;

  switch (part) {
    case "people": return <People view={view} />;
    case "money":
      return <Money view={view} onGo={(id) => onGo({ at: "plan", slug, app: id })} />;
    case "plan": return <Plan app={app ?? ""} />;
    case "packages": return <Packages view={view} />;
    case "settings":
      return (
        <SettingsArea
          view={view}
          app={app}
          onGo={(id) => onGo({ at: "settings", slug, app: id })}
        />
      );
    case "notices": return <Notices view={view} />;
    case "trust": return <Trust view={view} where={where} />;
    case "wording":
      return (
        <Wording
          view={view}
          app={app}
          onGo={(id) => onGo({ at: "wording", slug, app: id })}
        />
      );
  }
}
