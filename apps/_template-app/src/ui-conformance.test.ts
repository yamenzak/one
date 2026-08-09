/**
 * THIS APP'S RENDERING SURFACE, against the design system's own rules.
 *
 * ⚠️ **Keep this file.** `@4dl/ui` ships the primitives AND the lints that
 * defend them, and for a long time the lints lived in one app as nine hundred
 * lines nobody was going to copy — so "one consistent UI across our apps" meant
 * one app was policed and the others were on their honour. Adopting them in the
 * second app cost four lines and found four violations, which is the whole
 * argument: four is what six days of undefended drift looks like, and nothing
 * was going to report it.
 *
 * `ruleSelfTest` is the second assertion and it is not ceremony: a lint whose
 * matcher has quietly stopped matching reports zero violations, which is
 * indistinguishable from a clean app.
 */

import { describe, expect, it } from "vitest";
import { formatUiViolations, ruleSelfTest, uiConformance } from "@4dl/ui/conformance";

const REPO = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const APP = `${REPO}/apps/_template-app/src`;

describe("UI conformance (UI-LANGUAGE.md)", () => {
  it("obeys every rule the design system publishes", () => {
    // `@4dl/ui`'s own source is scanned by its own suite, so this reads only
    // this app. Scanning it here too would double-report one violation.
    const v = uiConformance({
      roots: [APP],
      repoRoot: REPO,
      exemptFiles: [
        // Quotes banned spellings in prose.
        "apps/_template-app/src/ui-conformance.test.ts",
        // Asserts the accent tokens by their literal values, which is its job.
        "apps/_template-app/src/tokens.accents.test.ts",
      ],
    });
    expect(v, v.length ? `\n${v.length} violation(s):\n\n${formatUiViolations(v)}\n` : "").toEqual([]);
  });

  it("the lints can still see a violation", () => {
    expect(ruleSelfTest()).toEqual([]);
  });
});
