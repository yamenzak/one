/**
 * THE SIGNPOST — the root, which is not an app.
 *
 * ⚠️ IT DOES NOT SIGN ANYBODY IN, and the runtime refuses to issue a code here:
 * there is no tenancy for one to be about, so a code sent from the root is a
 * code that signs you in to nothing. What this page owes somebody who arrived at
 * the bare domain is the two addresses that are real.
 */

import { Button } from "@heroui/react";
import { accountUrl, setupUrl, type Where } from "../door.js";
import { Sheet } from "../ui.js";

export function Signpost({ where }: { readonly where: Where }) {
  return (
    <Sheet
      title="One"
      lead="Every product on one account. Sign in to see your workspaces, or start one."
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onPress={() => { location.assign(accountUrl(where, location)); }}>
          Sign in
        </Button>
        <Button variant="secondary" onPress={() => { location.assign(setupUrl(where, location)); }}>
          Start a workspace
        </Button>
      </div>
    </Sheet>
  );
}
