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
  it("goes forward between two screens at the same depth", () => {
    expect(wayTo("/space/console/keys", "/space/console/switches")).toBe("forward");
    expect(wayTo("/space/w/acme/people", "/space/w/acme/money")).toBe("forward");
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
    expect(wayTo("/space/console/", "/space/console")).toBe("forward");
    expect(wayTo("/space/console", "/space/console/ai/")).toBe("forward");
    expect(wayTo("/space/console/ai/", "/space/console/")).toBe("back");
  });
});
