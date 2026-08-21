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

/**
 * WHAT THE NIGHT SENDS, AND WHERE IT LANDS.
 *
 * ⚠️ COMPOSITION ALREADY REFUSES A NOTIFICATION WAITING FOR AN EVENT NOTHING
 * RAISES, AND THAT IS THE HALF THAT WAS MISSING. `eventsOf` reads a job's
 * `emits` now, so a note about something nobody was present for is declarable —
 * before that, the only way to ship one was to hang it off an unrelated
 * operation somebody happens to perform.
 *
 * ⚠️ AND A DEAD LINK IS THE FAILURE THAT SURVIVES EVERY SUITE. Four of Scena's
 * pointed at a screen that did not exist and the test asserting it was pinning
 * the bug — it passed for exactly as long as nothing rendered a notification.
 */
describe("what the nightly sweep tells people", () => {
  const BOOK = INVENTORY.notifications ?? {};
  const SWEEP = (INVENTORY.jobs ?? {})["inventory.expiry"]!;

  it("has a job whose events are the ones its notifications wait for", () => {
    expect(SWEEP.emits).toEqual(["batch.expiring", "batch.expired", "unit.service_due"]);
    for (const event of SWEEP.emits ?? []) {
      expect(Object.values(BOOK).some((d) => d.on === event), event).toBe(true);
    }
  });

  /* ⚠️ AND IT IS PER-TENANT, BECAUSE A NOTE IS FILED IN A WORKSPACE. A
     deployment-scope job holds the directory and no tenant, and `refuseJob`
     refuses `emits` there for exactly that reason. */
  it("runs per workspace, which is the only scope that can reach a person", () => {
    expect(SWEEP.scope).toBe("per-tenant");
  });

  /*
    ⚠️ EVERY `link` IS A ROUTE THIS APP DECLARES. `refuseApp` checks it and this
    says it out loud, because the three the sweep sends all point at one screen
    that had to be built before they could exist — a note saying "three things
    out of date" that opens somewhere unable to say WHICH three is a rumour
    arriving at five in the morning.
  */
  it("points every note at a screen that can answer it", () => {
    const routes = new Set((INVENTORY.screens ?? []).map((s) => s.route));
    for (const def of Object.values(BOOK)) expect(routes, def.id).toContain(def.link);
    expect(BOOK["batch.expired"]?.link).toBe("/due");
  });

  /*
    ⚠️ THE TWO THAT MAY NOT BE SILENCED, AND THEY ARE THE TWO WHERE SOMEBODY HAS
    TO DO SOMETHING. A load that finished and nobody released is stock nobody may
    use sitting in a machine; a recall names what could not be frozen because it
    was already used, and those are people somebody has to ring. `refusePolicy`
    holds an `action` to an interrupting channel, on the write.
  */
  it("makes releasing and calling back impossible to switch off", () => {
    expect(BOOK["process.pending"]?.category).toBe("action");
    expect(BOOK["process.recalled"]?.category).toBe("action");
    for (const id of ["process.pending", "process.recalled"]) {
      expect(BOOK[id]?.channels, id).toContain("push");
    }
  });

  /*
    ⚠️ AND THE LINE BETWEEN THE TWO EXPIRY NOTES IS A CHANNEL. Something entering
    a thirty-day window is worth knowing before the end of the day and is not
    worth a phone lighting up — a product that treats it that way has taught
    somebody to ignore the one that matters.
  */
  it("does not put a phone light on something thirty days away", () => {
    expect(BOOK["batch.expiring"]?.channels).not.toContain("push");
    expect(BOOK["batch.expired"]?.channels).toContain("push");
  });

  /* ⚠️ THE AUDIENCE IS A PERMISSION AND `process.pending` NAMES THE ONE THAT CAN
     ACT. Telling the person who loaded the autoclave that it needs releasing is
     telling somebody who cannot release it. */
  it("addresses a release to whoever can release", () => {
    expect(BOOK["process.pending"]?.needs).toBe("process:release");
    for (const def of Object.values(BOOK)) {
      expect(INVENTORY.access.permissions, def.id).toContain(def.needs);
    }
  });
});
