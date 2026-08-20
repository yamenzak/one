/**
 * ONE WORKSPACE'S OWN SCREENS, inside OneSpace.
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

import { Screen } from "@engine/design";
import { useCentre } from "../centre/data.js";
import { People } from "../centre/People.js";
import { Money } from "../centre/Money.js";
import { Packages } from "../centre/Packages.js";
import { Plan } from "../centre/Plan.js";
import { SettingsArea } from "../centre/SettingsArea.js";
import { Trust } from "../centre/Trust.js";
import { Tried } from "../centre/Tried.js";
import { Trying } from "../centre/Trying.js";
import { Wording } from "../centre/Wording.js";
import { Notices } from "../centre/Notices.js";
import { Brand } from "../centre/Brand.js";
import type { Where, WorkspaceScreen } from "./where.js";
import { useSession } from "../session.js";

/**
 * ⚠️ THE SAME LIST THE DISPATCHER USES, NEVER A SECOND SPELLING OF IT. This was
 * written out here and in `OneSpace.tsx`, and the two disagreed by one member —
 * which is not a type error in either direction, because each is internally
 * consistent. See `OF_WORKSPACE_SCREEN`.
 */
export type Part = WorkspaceScreen;

export function WorkspacePart({ part, slug, app, area, id, onGo }: {
  readonly part: Part;
  readonly slug: string;
  /** Which product, on the two screens that have one per product. */
  readonly app?: string;
  /** Which page of a product's settings — they descend (DESIGN.md §3). */
  readonly area?: string;
  /** Which feature, on the one screen that is about a single one. */
  readonly id?: string;
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
      return <Money view={view} onGo={() => onGo({ at: "plan", slug })} />;
    /* ⚠️ NO APP ID: THERE IS ONE MEMBERSHIP, so there is one catalogue. */
    case "plan": return <Plan />;
    case "packages": return <Packages view={view} />;
    /* ⚠️ THE WORKSPACE'S SETTINGS ONLY. A person's own preferences are `prefs`,
       under YOU — see `where.ts`. */
    case "settings":
      return (
        <SettingsArea
          view={view}
          level="tenant"
          app={app}
          area={area}
          onGo={(id) => onGo({ at: "settings", slug, app: id })}
          onArea={(id) => onGo({ at: "settings", slug, app, area: id })}
        />
      );
    case "brand": return <Brand name={view.tenant.name} slug={slug} />;
    case "notices": return <Notices view={view} />;
    case "trust": return <Trust view={view} where={where} />;
    case "trying":
      return <Trying view={view} app={app} slug={slug} onGo={onGo} />;
    case "tried":
      /* ⚠️ WITHOUT ONE THERE IS NO SCREEN, and the honest answer is the
         workspace rather than a page about no feature. */
      return id ? <Tried view={view} id={id} /> : null;
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
