/**
 * A SEND FAILURE HAS TO SAY SOMETHING THE READER CAN ACT ON.
 *
 * The strings this package produces are provider mechanics, and every caller
 * that showed one to a human had the same defect: a lookup keyed on codes the
 * send path never returns. Kova's invite screen listed four reasons — three
 * `skipped` codes and one HTTP error code from an unrelated route — so a real
 * Cloudflare failure fell through to "The invite email couldn't be delivered",
 * which is the sentence a coach cannot do anything with.
 *
 * The case worth naming is the one a new deployment hits first and cannot
 * guess: Cloudflare's binding will only deliver to VERIFIED DESTINATION
 * ADDRESSES until the sending domain is onboarded. Sign-in codes to the
 * operator's own address work perfectly — theirs is a verified destination —
 * and the first invite to a real customer fails. Everything looks configured
 * right up until it matters.
 */

import { describe, expect, it } from "vitest";
import { explainSendError } from "../src/mailer.js";

describe("explainSendError", () => {
  it("names the verified-destination rule, the failure a new deployment hits first", () => {
    const msg = explainSendError("Error: could not send email: destination address not verified");
    expect(msg).toMatch(/verified destination/i);
    expect(msg).toMatch(/onboard/i);
  });

  it("recognises the provider being switched off", () => {
    expect(explainSendError("email disabled")).toMatch(/switched off/i);
  });

  it("recognises a deployment still on the mock lane", () => {
    expect(explainSendError("mock email provider is disabled outside development — configure a real provider"))
      .toMatch(/mock email provider/i);
  });

  it("separates a rejected Brevo key from any other Brevo refusal", () => {
    expect(explainSendError("brevo 401")).toMatch(/API key/i);
    expect(explainSendError("brevo 503")).toMatch(/HTTP 503/);
  });

  /**
   * The important half. An unrecognised failure returns the RAW string rather
   * than a friendly nothing — these carry no secrets, and an operator with the
   * actual message can search for it where "couldn't be delivered" leaves them
   * asking someone to read the logs.
   */
  it("passes an unrecognised failure through instead of swallowing it", () => {
    expect(explainSendError("TypeError: Cannot read properties of undefined")).toContain("TypeError: Cannot read properties of undefined");
  });

  it("still says something when there is no error at all", () => {
    expect(explainSendError(undefined)).toMatch(/couldn't be delivered/i);
    expect(explainSendError("   ")).toMatch(/couldn't be delivered/i);
  });
});
