/**
 * THE SIGNPOST — the root, which is not an app.
 *
 * ⚠️ IT DOES NOT SIGN ANYBODY IN, and the runtime refuses to issue a code here:
 * there is no tenancy for one to be about, so a code sent from the root is a
 * code that signs you in to nothing. What this page owes somebody who arrived at
 * the bare domain is the two addresses that are real.
 *
 * ⚠️ AND THE TWO ARE NOT PEERS. Signing in is what almost everybody arriving
 * here came to do; starting a business is a decision somebody makes once. Drawn
 * as two buttons of one weight — which is what it was — the page asks a person
 * to choose between them before it has told them anything.
 */

import { Button } from "@heroui/react";
import { Arrival, AsideRoute } from "@quad/web";
import { accountUrl, here, setupUrl, type Where } from "../door.js";

export function Signpost({ where }: { readonly where: Where }) {
  return (
    <Arrival
      name="One"
      claim="Every product you use, on one account."
      aside={(
        <AsideRoute
          says="New here?"
          label="Start a workspace"
          href={setupUrl(where, here())}
        />
      )}
    >
      <Button
        variant="primary"
        size="lg"
        fullWidth
        onPress={() => { location.assign(accountUrl(where, location)); }}
      >
        Sign in
      </Button>
    </Arrival>
  );
}
