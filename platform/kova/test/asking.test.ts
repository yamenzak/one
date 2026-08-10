/**
 * A REQUEST IS NOT ITS OWN ANSWER — asserted on the declarations.
 *
 * ⚠️ THIS PRODUCT HAS TWO RECORDS SHAPED LIKE A QUESTION: a client asking to swap
 * a movement, and a coach asking to be released from a client. Both are opened by
 * the person who wants something and answered by somebody else, and in both the
 * asker must hold the collection's write permission — or they could not ask.
 *
 * That is the whole trap. The answering fields sit on the same row behind the
 * same derived update, so without a NARROWER write on each of them the question
 * answers itself: a client marks their own swap allowed, a coach agrees to their
 * own release. Putting the decision behind its own operation while the update is
 * still open is a lock beside a window.
 *
 * ⚠️ ASSERTED HERE RATHER THAN THROUGH THE DOOR, because proving it end to end
 * needs two staff on one workspace and the entry plan allows one seat. The
 * ENFORCEMENT is proved in `runtime/test/collection.test.ts`, where a caller's
 * permissions can be varied; what this file proves is that Kova actually asked
 * for it, on every field that decides something.
 */

import { describe, expect, it } from "vitest";
import { releases, swaps } from "../src/manifest.js";
import type { CollectionSpec, Field } from "@one/kernel";

const fieldsOf = (c: CollectionSpec): Record<string, Field> => c.fields as Record<string, Field>;

/** A field somebody who may write the ROW must not be able to write. */
const decided = (c: CollectionSpec, names: readonly string[]) =>
  names.map((name) => [name, fieldsOf(c)[name]] as const);

describe("a swap request", () => {
  /*
    ⚠️ THE CLIENT HOLDS `swap:write` SO THEY CAN ASK. That is not an oversight to
    be tightened — it is the feature. Which is exactly why the answer cannot ride
    on the same permission.
  */
  it("is answered behind a permission the asker does not hold", () => {
    for (const [name, field] of decided(swaps, ["state", "substitute", "answer"])) {
      expect(field, `swap.${name} is missing`).toBeTruthy();
      expect(field!.write, `swap.${name} may be written by whoever opened the request`).toBe("programme:write");
    }
  });

  /*
    ⚠️ AND IT STARTS SOMEWHERE WITHOUT ANYBODY SAYING SO. A required field that
    is also write-restricted is a collection the person the feature is for cannot
    write a row into — the declaration refusing its own use.
  */
  it("starts as asked, without the asker setting it", () => {
    expect(fieldsOf(swaps).state!.initial).toBe("asked");
    expect(fieldsOf(swaps).state!.required).toBe(true);
  });

  /* ⚠️ And the question itself is the asker's — narrowing that would leave
     nobody able to open one. */
  it("leaves the question open to whoever is asking", () => {
    expect(fieldsOf(swaps).movement!.write).toBeUndefined();
    expect(fieldsOf(swaps).why!.write).toBeUndefined();
  });
});

describe("a release request", () => {
  /*
    ⚠️ A COACH REMOVING A CLIENT REMOVES THE STUDIO'S RELATIONSHIP WITH A PAYING
    CUSTOMER, and the person best placed to notice that is not the one who has
    stopped wanting to do it.
  */
  it("is answered by whoever manages the roster", () => {
    for (const [name, field] of decided(releases, ["state", "answer"])) {
      expect(field, `release.${name} is missing`).toBeTruthy();
      expect(field!.write, `release.${name} may be written by the coach who asked`).toBe("member:manage");
    }
  });

  it("starts as asked, without the asker setting it", () => {
    expect(fieldsOf(releases).state!.initial).toBe("asked");
  });

  it("leaves the asking open to the coach", () => {
    expect(fieldsOf(releases).client!.write).toBeUndefined();
    expect(fieldsOf(releases).why!.write).toBeUndefined();
    expect(fieldsOf(releases).why!.required).toBe(true);
  });
});

/*
  ⚠️ THE CHECK THAT SURVIVES A THIRD ONE BEING ADDED. Naming the two collections
  above is a test that passes forever while somebody adds a fourth request-shaped
  record with an open answer — so this walks every collection that models a
  question and insists its decision is narrower than its question.
*/
describe("every record shaped like a question", () => {
  const asking = [swaps, releases];

  it("has a state that starts at asked and is written by somebody else", () => {
    for (const c of asking) {
      const state = fieldsOf(c).state;
      expect(state, `${c.id} has no state`).toBeTruthy();
      expect(state!.kind, `${c.id}.state is not a closed set`).toBe("enum");
      expect((state as { values: readonly string[] }).values[0], `${c.id} does not start at asked`).toBe("asked");
      expect(state!.write, `${c.id}.state is writable by whoever opened it`).toBeTruthy();
      expect(state!.initial, `${c.id}.state cannot be created by the asker`).toBe("asked");
    }
  });

  /* ⚠️ Every field that carries the ANSWER, not only the state. A decision with
     an open "what we agreed" field is one the asker can write for themselves. */
  it("puts every answering field behind the same permission as its state", () => {
    for (const c of asking) {
      const state = fieldsOf(c).state!;
      const answer = fieldsOf(c).answer;
      expect(answer, `${c.id} has no answer`).toBeTruthy();
      expect(answer!.write, `${c.id}.answer is open where ${c.id}.state is not`).toBe(state.write);
    }
  });
});
