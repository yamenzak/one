/**
 * A DOOR THIS BUNDLE IS NOT.
 *
 * ⚠️ SERVED BY THIS WORKER, DRAWN BY SOMETHING ELSE. The operator console and a
 * workspace's own product are their own surfaces; when one of them has not
 * shipped, the honest answer is that this is not the page for this address —
 * with the address that is.
 *
 * ⚠️ THE ALTERNATIVE IS A BLANK PAGE, which is the same picture as a page that
 * failed to load. A person cannot tell those apart, and the one they assume is
 * the one that makes them reload for a minute before giving up.
 */

import { Button } from "@heroui/react";
import { signpostUrl, type DoorKind, type Where } from "../door.js";
import { Sheet } from "../ui.js";

const WHAT: Readonly<Record<string, string>> = {
  operator: "This is the operator console's door. Its screens are not part of the Hub.",
  tenant: "This is a workspace's own address. Its product draws these screens, not the Hub.",
  device: "This address belongs to a paired device. There is nothing here for a browser.",
  none: "Nothing is served at this address.",
};

export function Elsewhere({ where, kind }: { readonly where: Where; readonly kind: DoorKind }) {
  return (
    <Sheet title="Not this page" lead={WHAT[kind] ?? WHAT.none}>
      <div className="flex">
        <Button variant="secondary" onPress={() => { location.assign(signpostUrl(where, location)); }}>
          Go to {where.root}
        </Button>
      </div>
    </Sheet>
  );
}
