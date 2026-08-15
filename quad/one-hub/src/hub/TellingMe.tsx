/**
 * ⚠️ THE SEAM FOR "HOW YOU ARE TOLD", which needs a workspace's view to know
 * which products declare notifications — so it waits for the centre the same way
 * a workspace's own screens do, rather than the hub's frame knowing about it.
 */

import { Await, Working } from "@quad/web";
import { useCentre } from "../centre/data.js";
import { Told } from "../centre/Told.js";

export function TellingMe() {
  const { of, again } = useCentre();
  return (
    <Await
      of={of}
      waiting={<Working says="Reading your settings" />}
      again={again}
      then={(view) => <Told view={view} />}
    />
  );
}
