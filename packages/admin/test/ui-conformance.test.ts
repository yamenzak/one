/**
 * The operator console's panels, against the design system's own rules.
 *
 * See `packages/app-kit/test/ui-conformance.test.ts` for why this did not
 * exist: the shared packages render a large surface — every panel on the
 * `admin.` door of every app — and were the one part of the rendering surface
 * nothing measured. `sections/stripe.tsx` carried seven `text-[13px]`, which is
 * `caption` spelled so the type-scale rule could not see it.
 */

import { describe, expect, it } from "vitest";
import { formatUiViolations, uiConformance } from "@4dl/ui/conformance";

const REPO = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");

describe("@4dl/admin obeys the rules it ships beside", () => {
  it("passes every UI lint", () => {
    const v = uiConformance({
      roots: [`${REPO}/packages/admin/src`],
      repoRoot: REPO,
      exemptFiles: [
        // Names banned spellings as prose, so it matches itself — the same
        // exemption every app's harness takes for its own conformance file.
        "packages/admin/src/conformance.ts",
      ],
    });
    expect(v, v.length ? `\n${v.length} violation(s):\n\n${formatUiViolations(v)}\n` : "").toEqual([]);
  });
});
