/**
 * ⚠️ THE SEAM FOR "HOW YOU ARE TOLD", AND IT SPLITS ON THE DOOR. Inside a
 * workspace it is the settings themselves, which need that workspace's view to
 * know which products declare notifications — so it waits for the centre the
 * same way a workspace's own screens do, rather than OneSpace's frame knowing
 * about it. On the account door it is `PickWorkspace`, whose header carries the
 * whole argument for why.
 */

import { Screen } from "@engine/design";
import { useSession } from "../session.js";
import { useCentre } from "../centre/data.js";
import { Told } from "../centre/Told.js";
import { PickWorkspace } from "./PickWorkspace.js";
import type { Where } from "./where.js";

export function TellingMe({ onGo }: { readonly onGo: (to: Where) => void }) {
  const { where } = useSession();
  if (where?.kind !== "tenant") {
    return (
      <PickWorkspace
        to={{ at: "told" }}
        under="Each one has its own products, and this browser is asked once per workspace"
        empty="Notifications come from a workspace, and you are not in one"
        onGo={onGo}
      />
    );
  }
  return <Here />;
}

function Here() {
  const { of, again } = useCentre();
  /* ⚠️ THE FRAME HAS TO SURVIVE THE WAIT, which a bare `Working` did not. A
     dispatcher that renders a spinner and nothing else renders a page with no
     name and no way back for the length of a round trip — and on a slow
     connection that is the whole of what somebody sees. The shape's own
     skeleton draws under the real crown instead. */
  if (of.status !== "ready") {
    return <Screen shape="settings" of={of} again={again} then={() => null} />;
  }
  return <Told view={of.data} />;
}
