/**
 * THE ROOT, WHICH IS NOT A SCREEN.
 *
 * ⚠️ IT WAS ONE, AND IT WAS A PAGE WHOSE ONLY CONTENT WAS A BUTTON TO ANOTHER
 * PAGE. The bare domain offered "sign in" and "start a workspace" — one of
 * which everybody arriving wanted, and both of which were somewhere else. A
 * screen that exists to point at the next screen is a step, and a step nobody
 * needs is one everybody pays for.
 *
 * ⚠️ SO THE ROOT GOES TO THE SIGN-IN, AND THE SIGN-IN CARRIES THE OTHER ROUTE.
 * The runtime refuses to issue a code here — there is no tenancy for one to be
 * about — which is exactly why this cannot be a form: it has to be a journey to
 * the door that can.
 *
 * ⚠️ `replace`, NEVER `assign`. With a history entry, pressing back from the
 * sign-in lands here, which redirects forward again — a back button that does
 * nothing, which is the one navigation fault a person cannot work around.
 */

import { useEffect } from "react";
import { Opening } from "@engine/design";
import { accountUrl, here, type Where } from "../door.js";
import { OPENING_LINES } from "../opening.js";

export function Signpost({ where }: { readonly where: Where }) {
  useEffect(() => {
    location.replace(accountUrl(where, here()));
  }, [where]);

  /* ⚠️ Not nothing. The redirect is a round trip on a slow connection, and a
     blank page for the length of it is indistinguishable from a broken one.

     ⚠️ AND IT IS THE SAME CURTAIN THE BOOT DRAWS, which is what makes the hop
     invisible: this screen exists for the length of one redirect, so anything
     that differed from what was on the screen a moment ago would read as a
     flash between two products. */
  return <Opening says={OPENING_LINES} />;
}
