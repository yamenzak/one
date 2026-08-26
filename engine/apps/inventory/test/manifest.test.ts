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
import { inventory } from "../src/index.js";

/** ⚠️ Built once here — the manifest is a thunk so that a cold isolate is not. */
const INVENTORY = inventory();
import { PROFILES, WORDS, wordsFor } from "../src/words.js";

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
/*
  ⚠️ WHAT THE NIGHTLY SWEEP TELLS PEOPLE WAS ASSERTED HERE, AND IT COMES BACK
  WITH THE NOTIFICATIONS IT WAS ABOUT. Five checks stood in this gap — that every
  event the job emits is one a notification waits for, that each note points at a
  screen that can ANSWER it, that a recall cannot be switched off, that nothing
  thirty days away lights a phone, and that a release is addressed to whoever can
  release. Not one of them is about the surface being rewritten; all five are
  about whether being told something is worth anything.

  ⚠️ THEY ARE NAMED RATHER THAN DELETED IN SILENCE, because a suite that shrinks
  by five while the run stays green is how coverage is lost. Restoring a
  notification without restoring its check is the change this paragraph exists to
  make somebody notice.
*/

describe("what this workspace is for", () => {
  it("has a vocabulary for every profile it offers", () => {
    const field = INVENTORY.settings?.["inventory.profile"]?.field;
    expect(field?.values).toEqual([...PROFILES]);
    for (const profile of PROFILES) {
      expect(WORDS[profile]?.said.length, profile).toBeGreaterThan(10);
      expect(WORDS[profile]?.place.length, profile).toBeGreaterThan(2);
    }
  });

  /* ⚠️ AND A PROFILE A LATER BUILD REMOVED READS AS THE PLAIN ONE, never as a
     screen with `undefined` where its headings go. A setting is a stored
     string. */
  it("reads an unknown profile as the plain one", () => {
    expect(wordsFor("bakery")).toEqual(WORDS.home);
    expect(wordsFor(null)).toEqual(WORDS.home);
    expect(wordsFor("clinic")).toEqual(WORDS.clinic);
  });
});

/**
 * THE SHAPES A WORKSPACE CAN START FROM.
 *
 * ⚠️ THE BASEMENT IS THE ONE TO READ. `alone` holds no `process:*` key, so the
 * Work destination is not DRAWN for somebody on it — which is the difference
 * between a screen that is hidden and a screen that is not reachable, and it is
 * the whole of what a profile that only seeded defaults was missing.
 */
describe("the roles a workspace can adopt", () => {
  const PRESETS = INVENTORY.access.presets ?? [];

  it("offers a shape for the basement that cannot reach the regulated half", () => {
    const alone = PRESETS.find((p) => p.id === "alone");
    expect(alone).toBeDefined();
    expect(alone!.permissions.some((k) => k.startsWith("process:"))).toBe(false);
    expect(alone!.permissions).toContain("stock:adjust");
  });

  /*
    ⚠️ AND THE PRODUCT'S SHARPEST ACCESS RULE SURVIVES EVERY PRESET. Somebody on
    the floor takes things all day; the moment they can also make a number agree
    with what they took, the history stops being evidence.
  */
  it("never bundles taking with correcting for somebody on the floor", () => {
    const floor = PRESETS.find((p) => p.id === "floor");
    expect(floor!.permissions).toContain("stock:move");
    expect(floor!.permissions).not.toContain("stock:adjust");
  });

  /* ⚠️ LOADING A MACHINE IS ORDINARY WORK; SAYING ITS OUTPUT MAY BE USED IS THE
     JUDGEMENT THE RAIL EXISTS FOR. A preset bundling both would hand the whole
     release rail to whoever presses start. */
  it("keeps running a machine apart from signing for it", () => {
    const operator = PRESETS.find((p) => p.id === "operator");
    expect(operator!.permissions).toContain("process:run");
    expect(operator!.permissions).not.toContain("process:release");
    expect(PRESETS.find((p) => p.id === "signs-off")!.permissions).toContain("process:release");
  });

  /* ⚠️ EVERY KEY IS ONE THIS APP DECLARES, AND EVERY ID IS ADOPTABLE. Composition
     already refuses either; said out loud because a preset that cannot be
     adopted is a row somebody presses and is refused with a sentence about
     somebody else's mistake. */
  it("offers nothing that could not be adopted", () => {
    for (const preset of PRESETS) {
      expect(INVENTORY.access.roles[preset.id], preset.id).toBeUndefined();
      for (const key of preset.permissions) {
        expect(INVENTORY.access.permissions, `${preset.id}/${key}`).toContain(key);
      }
      expect(preset.said.length, preset.id).toBeGreaterThan(15);
    }
  });
});
