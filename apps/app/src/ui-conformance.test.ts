/**
 * Kova's rendering surface, against the design system's own rules.
 *
 * These seven lints used to live here as seven files and nine hundred lines.
 * They now live in `@4dl/ui/conformance`, next to the components they defend,
 * because the rules are as much a part of a design system as the components —
 * and keeping them in one app meant the second app got the components and none
 * of the rules. Tessa's drift was four instances on the day this moved, which
 * reads as "fine" and is really "six days old".
 *
 * What stays here is the part that genuinely is Kova's: which files it waives,
 * and why.
 */

import { describe, expect, it } from "vitest";
import { formatUiViolations, ruleSelfTest, uiConformance } from "@4dl/ui/conformance";

const REPO = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const APP = `${REPO}/apps/app/src`;
const SYSTEM = `${REPO}/packages/ui/src`;

/**
 * Files that draw ON TOP OF photographs or live camera video, where `white` and
 * `black` are the correct vocabulary and must NOT follow the brand.
 *
 * This is the one place the token rules bend, and the reasoning matters. A
 * cover-image caption, a scrim over a meal photo, a viewfinder frame — these sit
 * over content the theme does not control. Forcing them through the tokens makes
 * them WORSE: a studio on a pale primary would get a near-white caption over a
 * bright photo and lose it entirely.
 *
 * Scoped to a file list rather than waived globally, because the same class of
 * value on app CHROME is a real bug and was found three times while writing the
 * original lint: a white skeleton shimmer that vanished on a light theme, a
 * `bg-black/15` code panel invisible on a dark one, and white overlays on
 * `bg-primary` that would disappear under a pale brand colour. A new
 * `bg-white/20` in any file NOT on this list still fails.
 *
 * Named palettes are never allowed, on this list or off it — the waiver relaxes
 * white/black only.
 */
const MEDIA_OVERLAYS = [
  // Photo/video viewers and the chrome drawn over them.
  "packages/ui/src/media.tsx",
  "apps/app/src/screens/client/BarcodeScanner.tsx",
  "apps/app/src/screens/client/bodyscan/BodyScanFlow.tsx",
  // Cards and headers whose background is a cover image, with a scrim + caption.
  "apps/app/src/screens/client/Explore.tsx",
  "apps/app/src/screens/client/Today.tsx",
  "apps/app/src/screens/client/Train.tsx",
  "apps/app/src/screens/client/WorkoutPlayer.tsx",
  "apps/app/src/screens/client/MealPlanDrawer.tsx",
  "apps/app/src/screens/coach/WorkoutBuilder.tsx",
  "apps/app/src/screens/coach/MealBuilder.tsx",
  // Full-screen modal scrims (black dimming is correct in both modes).
  "apps/app/src/tour.tsx",
];

describe("Kova's UI conformance (UI-LANGUAGE.md)", () => {
  it("obeys every rule the design system publishes", () => {
    const v = uiConformance({
      roots: [APP, SYSTEM],
      repoRoot: REPO,
      exemptFiles: [
        // Both of these carry banned spellings as prose or as sample data, so
        // they match themselves. Every one of the original seven lints exempted
        // itself for the same reason.
        "apps/app/src/ui-conformance.test.ts",
        "packages/ui/src/conformance.ts",
      ],
      waive: { "design-tokens": MEDIA_OVERLAYS },
      // Unchanged from the original lint, deliberately — see `scopeTo`'s note.
      // Widening this to the whole app surfaces nine pre-existing instances and
      // is worth doing on its own, not inside a move.
      scopeTo: {
        "save-lifecycle": [
          "apps/app/src/screens/Settings.tsx",
          "apps/app/src/screens/AiSettings.tsx",
          "apps/app/src/screens/PreferencesEditor.tsx",
          "apps/app/src/screens/admin/AdminConsole.tsx",
        ],
      },
    });
    expect(v, v.length ? `\n${v.length} violation(s):\n\n${formatUiViolations(v)}\n` : "").toEqual([]);
  });

  it("the lints can still see a violation", () => {
    // Belt and braces — `@4dl/ui` asserts this too. A lint that silently stops
    // matching passes everything, and this suite is where someone editing a
    // screen would notice.
    expect(ruleSelfTest()).toEqual([]);
  });
});
