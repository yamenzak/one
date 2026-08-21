/**
 * THE MANIFEST COMPOSES, AND WHAT IT REFUSES IS WHAT IT MEANT TO.
 *
 * ⚠️ COMPOSITION IS THE ONE CHECK THAT COVERS EVERY DECLARATION AT ONCE. A
 * screen naming a permission nothing holds, a guide step waiting on an event
 * nothing raises, an entitlement no gate reads, a role bundling a platform key —
 * each is a `refuseApp` finding, and each is otherwise invisible until a
 * customer meets it.
 */

import { describe, expect, it } from "vitest";
import { refuseApp } from "@engine/kernel";
import { INVENTORY } from "../src/index.js";

describe("the manifest", () => {
  it("composes with nothing outstanding", () => {
    expect(refuseApp(INVENTORY)).toEqual([]);
  });

  /*
    ⚠️ THE ACCESS RULE THIS PRODUCT RESTS ON, ASSERTED RATHER THAN COMMENTED.
    Somebody on the floor takes things all day; the moment they can also make a
    number agree with what they took, the history stops being evidence.
  */
  it("lets the common role take things and never correct them", () => {
    const user = INVENTORY.access.roles["user"]!;
    expect(user).toContain("stock:move");
    expect(user).not.toContain("stock:adjust");
    expect(user).not.toContain("product:write");
  });

  /*
    ⚠️ A BALANCE IS A PROJECTION AND A HISTORY IS APPEND-ONLY, and both are
    expressed as an opt-out rather than an intention. A generated `create` on
    either is a client writing its own history.
  */
  it("gives nobody a way to write a balance or a history by hand", () => {
    for (const id of ["stock", "ledger"]) {
      const spec = INVENTORY.collections.find((c) => c.id === id)!;
      expect(spec.without).toEqual(expect.arrayContaining(["create", "update", "delete"]));
    }
  });

  /* ⚠️ The whole catalogue may be read with no signal, and a product or a place
     may be written without one — an unknown thing recorded in the back of a
     warehouse is the difference between a system used and one worked around. */
  it("lets a phone work with no signal, where it matters", () => {
    const of = (id: string) => INVENTORY.collections.find((c) => c.id === id)!.offline;
    expect(of("product")).toBe("queue");
    expect(of("location")).toBe("queue");
    expect(of("stock")).toBe("cache");
  });
});
