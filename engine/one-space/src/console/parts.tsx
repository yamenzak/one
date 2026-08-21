/**
 * EVERY CONSOLE SCREEN, IN ONE CHUNK NOBODY ELSE DOWNLOADS.
 *
 * ⚠️ THIS FILE EXISTS TO BE A BOUNDARY, NOT A LAYER. Thirteen operator screens
 * were reached by static import from `space/Console.tsx`, so every person who has
 * ever opened this product downloaded the plan catalogue editor, the model
 * catalogue, the job runner and the shard map — 126 kB of source for a door
 * almost nobody in the world may open. Behind one `import()` it is a chunk the
 * operator door asks for and no other door ever does.
 *
 * ⚠️ ONE IMPORT FOR ALL THIRTEEN, DELIBERATELY. Split per screen an operator pays
 * a fetch on every row they open; split once they pay it on the first, and the
 * console is a place somebody works in for an hour rather than visits.
 *
 * ⚠️ AND THE `never` AT THE END IS THE WHOLE SAFETY OF THE ADDRESS GRAMMAR. A
 * part with no branch must be a BUILD failure — without it the switch returns
 * `undefined`, React renders nothing, and the row leads to an empty screen with
 * every suite green. That is precisely how `/space/console/stores` shipped once,
 * under the name it had then.
 */

import type * as React from "react";
import { Actions } from "./Actions.js";
import { Ai } from "./Ai.js";
import { Finding } from "./Finding.js";
import { Gateway } from "./Gateway.js";
import { Models } from "./Models.js";
import { Catalogue } from "./Catalogue.js";
import { Pass } from "./Pass.js";
import { Shards } from "./Shards.js";
import { Stores } from "./Stores.js";
import { Keys } from "./Keys.js";
import { Maintenance } from "./Maintenance.js";
import { Switch } from "./Switch.js";
import { Switches } from "./Switches.js";
import { Telling } from "./Telling.js";
import { Tenants } from "./Tenants.js";
import { Accounts } from "./Accounts.js";
import { OneAccount } from "./OneAccount.js";
import { Works } from "./Works.js";
import { OneTenant } from "./OneTenant.js";
import type { AiPart, ConsolePart, Where } from "../space/where.js";

export function ConsoleParts({ part, app, lane, onGo }: {
  readonly part: ConsolePart | AiPart;
  readonly app?: string;
  /* ⚠️ One area's screens descend, so the seam has to carry what they descend
     INTO — see `Where`'s `models`. */
  readonly lane?: string;
  readonly onGo: (to: Where) => void;
}) {
  switch (part) {
    case "tenants": return <Tenants onGo={(id) => onGo({ at: "tenant", id })} />;
    case "accounts":
      return <Accounts onGo={(email) => onGo({ at: "account", email })} />;
    case "ai": return <Ai onGo={onGo} />;
    case "models": return <Models where={{ at: "models", ...(lane ? { lane } : {}) }} onGo={onGo} />;
    case "gateway": return <Gateway onGo={onGo} />;
    case "finding": return <Finding />;
    case "actions":
      return <Actions app={app} onGo={(id) => onGo({ at: "actions", app: id })} />;
    case "catalogue": return <Catalogue />;
    case "switches": return <Switches onGo={onGo} />;
    case "maintenance": return <Maintenance />;
    case "telling": return <Telling />;
    case "works": return <Works />;
    case "shards": return <Shards />;
    case "keys": return <Keys />;
    case "stores": return <Stores />;
    case "pass": return <Pass />;
    /*
      ⚠️ A MISSING BRANCH IS A BUILD FAILURE, NOT A BLANK PAGE. Without this the
      switch simply returns `undefined` for a part nobody wrote a case for, React
      renders nothing, and the row leads to an empty screen with every suite
      green — which is precisely how the stores screen shipped once, under the
      name it had then. Same
      assertion `Inside` makes over the whole address grammar.
    */
    default: {
      const missing: never = part;
      throw new Error(`no screen for console part ${String(missing)}`);
    }
  }
}

/**
 * ⚠️ ONE WORKSPACE AS AN OPERATOR SEES IT, IN THE SAME CHUNK AS THE REST OF THE
 * CONSOLE. It is reached from the workspace list and from nowhere else, so
 * splitting it off separately would buy an operator a second fetch between two
 * screens they open in one gesture — and leaving it out of the chunk entirely put
 * it back in the bundle every visitor downloads, which is what this file is for.
 */
export { OneTenant };

/** ⚠️ THE SAME CHUNK AGAIN — one person is opened from the account list and from
    the roster of a workspace, both of which are already in here. */
export { OneAccount };

/** ⚠️ THE SAME CHUNK AGAIN, and for the same reason as `OneTenant`: a flag is
    opened from the switch list and from nowhere else, so a separate chunk would
    be a second fetch between two screens somebody opens in one gesture. */
export { Switch };
