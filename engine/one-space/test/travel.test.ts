/**
 * WHICH WAY A JOURNEY GOES — a table of addresses, because that is all it is.
 *
 * ⚠️ THE CROWN'S BACK ARROW IS A `pushState` LIKE ANY OTHER, which is the whole
 * reason this cannot be answered from the history stack. Going up a level and
 * going down one are the same browser event; only the two addresses tell them
 * apart, and getting that backwards means the product slides the wrong way on
 * every press of the one control people use most.
 */

import { describe, expect, it } from "vitest";
import { wayTo } from "../src/nav.js";

describe("which way", () => {
  it("goes forward into something deeper", () => {
    expect(wayTo("/space/console", "/space/console/ai")).toBe("forward");
    expect(wayTo("/space/console/ai", "/space/console/ai/models")).toBe("forward");
    expect(wayTo("/space", "/space/workspaces")).toBe("forward");
  });

  it("goes back out to something it was inside", () => {
    expect(wayTo("/space/console/ai", "/space/console")).toBe("back");
    expect(wayTo("/space/console/ai/models", "/space/console/ai")).toBe("back");
    expect(wayTo("/space/w/acme/people", "/space/w/acme")).toBe("back");
  });

  /* ⚠️ A SIBLING IS FORWARD. Moving from one console screen to the next is
     somebody choosing to go somewhere, not retreating from where they were —
     and there is no third animation, so it has to be one of the two. */
  /* ⚠️ A SIBLING IS LATERAL, AND THIS ASSERTED "FORWARD" FOR AS LONG AS THERE
     WAS A NAV BAR. Two addresses under one parent are the five destinations, or
     two records in a collection — the move somebody makes dozens of times an
     hour. Answered as a push it ran a view transition at `DURATION.page` on
     every tap, during which the tree is already the next screen while the
     browser shows a picture of the last one. See `Way`. */
  it("moves laterally between two screens under one parent", () => {
    expect(wayTo("/space/console/keys", "/space/console/switches")).toBe("lateral");
    expect(wayTo("/space/w/acme/people", "/space/w/acme/money")).toBe("lateral");
    expect(wayTo("/inventory/stock", "/inventory/scan")).toBe("lateral");
  });

  /* ⚠️ THE SAME DEPTH IS NOT THE SAME PARENT. Two areas two segments deep are
     not siblings, and giving that a tab switch's silence would take the one
     move that genuinely changes place and make it invisible. */
  it("still travels between two areas at the same depth", () => {
    expect(wayTo("/space/console/keys", "/space/w/acme")).not.toBe("lateral");
  });

  /* ⚠️ SHALLOWER BUT UNRELATED IS BACK, and in this product it always is: the
     only way to reach a shorter address that is not an ancestor is to leave an
     area for a different one. */
  it("goes back when it leaves an area for a shorter address", () => {
    expect(wayTo("/space/console/ai/models", "/space/workspaces")).toBe("back");
  });

  /* ⚠️ `/space/` AND `/space` ARE ONE PLACE. A trailing slash arrives from a
     redirect, a pasted link and a share sheet, and untidied it makes going
     nowhere read as going one level deeper. */
  it("reads a trailing slash as the same address", () => {
    /* ⚠️ Going nowhere is lateral: there is no level between an address and
       itself, so there is nothing for a transition to say. */
    expect(wayTo("/space/console/", "/space/console")).toBe("lateral");
    expect(wayTo("/space/console", "/space/console/ai/")).toBe("forward");
    expect(wayTo("/space/console/ai/", "/space/console/")).toBe("back");
  });
});
