/**
 * Tessa must not rebuild a console panel `@4dl/admin` already ships.
 *
 * This is the check that would have caught the drift instead of a screenshot.
 * Tessa's Stripe "panel" was a `JSON.stringify` dump over `/api/admin/stripe/status`
 * plus three text boxes, while Kova had a two-lane editor with mismatch detection
 * over the SAME endpoint — and custom domains and the sign-in bot check had no
 * panel at all, though `domainAdminRoutes` (which mounts `turnstileAdminRoutes`
 * inside it) has answered on this app since day one.
 *
 * None of that was a bug anyone could see from inside one app. It only became
 * visible with a second app to compare against, which is exactly the kind of
 * thing a conformance test is for.
 */

import { describe, expect, it } from "vitest";
import { sharedPanelViolations } from "@4dl/admin/conformance";

describe("the operator console", () => {
  it("uses the shared panels rather than reaching for the endpoints itself", () => {
    const problems = sharedPanelViolations(new URL(".", import.meta.url).pathname);
    expect(problems, problems.join("\n")).toEqual([]);
  });
});
