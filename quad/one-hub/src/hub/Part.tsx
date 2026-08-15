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

import { Await, Working } from "@quad/web";
import { useCentre } from "../centre/data.js";
import { People } from "../centre/People.js";
import { Money } from "../centre/Money.js";
import { Packages } from "../centre/Packages.js";
import { SettingsArea } from "../centre/SettingsArea.js";
import { Trust } from "../centre/Trust.js";
import { Wording } from "../centre/Wording.js";
import { Notices } from "../centre/Notices.js";
import type { Where } from "./where.js";
import { useSession } from "../session.js";

export type Part =
  | "people" | "money" | "packages" | "settings" | "notices" | "trust" | "wording";

export function WorkspacePart({ part, slug, app, onGo }: {
  readonly part: Part;
  readonly slug: string;
  /** Which product, on the two screens that have one per product. */
  readonly app?: string;
  readonly onGo: (to: Where) => void;
}) {
  const { where } = useSession();
  const { of, again } = useCentre();

  return (
    <Await
      of={of}
      waiting={<Working says="Opening this workspace" />}
      again={again}
      then={(view) => {
        switch (part) {
          case "people": return <People view={view} />;
          case "money": return <Money view={view} />;
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
      }}
    />
  );
}
