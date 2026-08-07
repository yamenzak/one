/**
 * THE SHARED PACKAGES RENDER TOO, AND THEY WERE NOT BEING CHECKED.
 *
 * `conformance.ts`'s own header tells this story one level down: Kova had the
 * components and the rules, Tessa had the components and none of the rules, and
 * the asymmetry was invisible until somebody counted. The same thing was true
 * one level UP. `@4dl/ui` runs the lints over itself. Every app runs them over
 * its own source. `@4dl/app-kit` and `@4dl/admin` ran them over nothing — and
 * between them they draw the error boundary every app falls back to, the
 * offline and update notices, the passkey card, the payment sheet, the
 * notification bell, the inbox, and every operator panel on the `admin.` door.
 *
 * That is a large rendering surface to leave unmeasured, and it was not clean:
 * this package carried `text-[0.7rem]` on the one line an error boundary exists
 * to show, and `@4dl/admin` carried seven `text-[13px]` — which is `caption`,
 * spelled so the type-scale rule could not see it.
 *
 * A package that publishes a rule and does not run it is the sharpest version
 * of the problem the rule exists for.
 */

import { describe, expect, it } from "vitest";
import { formatUiViolations, uiConformance } from "@4dl/ui/conformance";

const REPO = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");

describe("@4dl/app-kit obeys the rules it ships beside", () => {
  it("passes every UI lint", () => {
    const v = uiConformance({
      roots: [`${REPO}/packages/app-kit/src`],
      repoRoot: REPO,
      exemptFiles: [],
    });
    expect(v, v.length ? `\n${v.length} violation(s):\n\n${formatUiViolations(v)}\n` : "").toEqual([]);
  });
});
