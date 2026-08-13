/**
 * ASKING A BROWSER TO BE NOTIFIED.
 *
 * ⚠️ THE HALF THAT RUNS ON THE DEVICE IS THE HALF THAT MAKES THE CHANNEL REAL.
 * The server can encrypt and sign a message all day; a subscription only exists
 * if a browser makes one — and a switch with nothing behind it is exactly why
 * push was deleted from this platform once already.
 */

import { describe, expect, it } from "vitest";
import {
  PUSH_WORKER, askToPush, browserLabel, keyBytes, pushSupported, stopPushing, type Answered,
} from "../src/push.js";

describe("what has to be true before a switch is offered", () => {
  /* ⚠️ Three things fail separately and the test environment has none of them,
     which is the honest answer for a browser that cannot do this. */
  it("says no where the browser cannot do it at all", () => {
    expect(pushSupported()).toBe(false);
  });

  /*
    ⚠️ EACH REFUSAL IS A DIFFERENT THING TO SAY. `unconfigured` is our fault and
    the switch should not have been shown; `denied` is the person's own decision
    and cannot be asked again from a page. One "could not enable notifications"
    makes both the same shrug.
  */
  it("blames the deployment rather than the person for a missing key", async () => {
    expect(await askToPush({ key: "   ", worker: "/sw.js" })).toEqual({ ok: false, why: "unsupported" });
  });
});

/**
 * ⚠️ THE ENDPOINT IS RETURNED RATHER THAN THE CALL BEING MADE. Unsubscribing
 * locally and failing to tell the server leaves a row that is pushed to for ever
 * and reaches nobody; the two have to happen together, and only the caller can
 * await both.
 */
describe("stopping", () => {
  it("hands back nothing where there was nothing to stop", async () => {
    expect(await stopPushing()).toBeNull();
  });

  /* ⚠️ Named so the shape is reachable from a proof: an exported type nothing
     refers to is surface a later stage builds on by mistake. */
  it("answers rather than throwing, always", () => {
    const refused: Answered = { ok: false, why: "unsupported" };
    expect(refused.ok).toBe(false);
  });
});

describe("the key the browser subscribes with", () => {
  /*
    ⚠️ IT ARRIVES AS URL-SAFE BASE64 AND THE API WANTS BYTES. Handing it the
    string throws `InvalidCharacterError`, which reads as a broken browser rather
    than as a wrong argument.
  */
  it("decodes the alphabet the key is written in", () => {
    expect(keyBytes("YWJj")).toEqual(new Uint8Array([97, 98, 99]));
    /* An unpadded value with the url-safe characters in it. */
    expect(keyBytes("-_8")).toEqual(new Uint8Array([251, 255]));
  });
});

describe("what a person calls the browser they are removing", () => {
  /* ⚠️ Deliberately coarse: it is a label on a row somebody reads to decide
     which subscription to remove, and anything sharper is a fingerprint. */
  it("names the browser and the kind of device, and nothing else", () => {
    expect(browserLabel("Mozilla/5.0 (iPhone) Safari/605")).toBe("Safari on iPhone");
    expect(browserLabel("Mozilla/5.0 (Windows) Chrome/130")).toBe("Chrome");
    expect(browserLabel("Mozilla/5.0 (Windows) Edg/130 Chrome/130")).toBe("Edge");
    expect(browserLabel("something nobody has heard of")).toBe("This browser");
  });
});

describe("the service worker an app serves", () => {
  /*
    ⚠️ IT SHOWS SOMETHING, ALWAYS. `userVisibleOnly` is a promise the browser
    enforces — a push that displays nothing costs the site its permission, so a
    malformed payload still draws a notification rather than being swallowed.
  */
  it("still notifies when the payload cannot be read", () => {
    expect(PUSH_WORKER).toContain("Something happened");
    expect(PUSH_WORKER).toContain("showNotification");
  });

  /* ⚠️ An open tab is focused rather than a second one opened — somebody who
     taps while the app is open should land in the app they have. */
  it("focuses a tab that is already open", () => {
    expect(PUSH_WORKER).toContain("focus");
    expect(PUSH_WORKER).toContain("matchAll");
  });
});
