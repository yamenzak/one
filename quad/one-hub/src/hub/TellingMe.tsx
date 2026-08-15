/**
 * ⚠️ THE SEAM FOR "HOW YOU ARE TOLD", which needs a workspace's view to know
 * which products declare notifications — so it waits for the centre the same way
 * a workspace's own screens do, rather than the hub's frame knowing about it.
 */

import { Screen } from "@quad/web";
import { useCentre } from "../centre/data.js";
import { Told } from "../centre/Told.js";

export function TellingMe() {
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
