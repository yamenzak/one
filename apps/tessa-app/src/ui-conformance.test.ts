/**
 * Tessa's rendering surface, against the design system's own rules.
 *
 * Until this file, Tessa had the components and none of the rules — `@4dl/ui`
 * shipped the primitives and the seven lints that defend them lived in Kova, as
 * nine hundred lines nobody was going to copy. So "unified UI experience" meant
 * one app was policed and the other was on its honour.
 *
 * Adopting them cost four lines and found four violations, which is the whole
 * argument: four is what six days of drift looks like, and nothing was going to
 * report it.
 */

import { describe, expect, it } from "vitest";
import { formatUiViolations, ruleSelfTest, uiConformance } from "@4dl/ui/conformance";

const REPO = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const APP = `${REPO}/apps/tessa-app/src`;

describe("Tessa's UI conformance (UI-LANGUAGE.md)", () => {
  it("obeys every rule the design system publishes", () => {
    // `@4dl/ui`'s own source is scanned by its own suite and by Kova's, so this
    // reads only Tessa. Scanning it here too would triple-report one violation.
    const v = uiConformance({
      roots: [APP],
      repoRoot: REPO,
      exemptFiles: [
        // Quotes banned spellings in prose.
        "apps/tessa-app/src/ui-conformance.test.ts",
        // Asserts the accent tokens by their literal values, which is its job.
        "apps/tessa-app/src/tokens.accents.test.ts",
      ],
    });
    expect(v, v.length ? `\n${v.length} violation(s):\n\n${formatUiViolations(v)}\n` : "").toEqual([]);
  });

  it("the lints can still see a violation", () => {
    expect(ruleSelfTest()).toEqual([]);
  });
});
