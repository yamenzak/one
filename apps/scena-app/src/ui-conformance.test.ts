/**
 * Scena's rendering surface, against the design system's own rules.
 *
 * ── Why this file did not exist until now ────────────────────────────────────
 *
 * Kova and Tessa have both run `@4dl/ui/conformance` since the lints moved into
 * the package. Scena did not — it arrived from its own repository after that
 * move, and nothing makes opting in mandatory. So it had the components and
 * none of the rules, which is exactly the asymmetry `conformance.ts`'s own
 * header describes, and the drift was not four instances: it was 109
 * hand-rolled type sizes, 99 of them below the scale's floor.
 *
 * That is the argument for the check being structural. A shared-UI rule each
 * app opts into is a rule the next app forgets, and the forgetting is silent —
 * every one of those sizes compiled, rendered, and looked deliberate.
 *
 * What stays here is the part that genuinely is Scena's: which files it waives,
 * and why.
 */

import { describe, expect, it } from "vitest";
import { formatUiViolations, ruleSelfTest, uiConformance } from "@4dl/ui/conformance";

const REPO = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const APP = `${REPO}/apps/scena-app/src`;

/**
 * Surfaces that draw over VIDEO, over a live preview of a screen, or on a
 * device that is deliberately dark whatever the operator's theme is.
 *
 * The reasoning is the same one Kova's list carries: these sit over content the
 * theme does not control. A device preview renders a miniature of what is on a
 * television; a kiosk hangs in a lobby. Forcing white/black through the tokens
 * makes them worse, not more consistent — a workspace on a pale brand would get
 * a near-white caption over a bright slide and lose it entirely.
 *
 * Scoped to a file list, never waived globally, and it relaxes white/black
 * only: a named palette (`bg-zinc-900`) is wrong on this list too.
 */
const MEDIA_OVERLAYS = [
  // A live miniature of what is on a television, and the chrome drawn over it.
  "apps/scena-app/src/components/device-preview.tsx",
  "apps/scena-app/src/components/media-picker.tsx",
  "apps/scena-app/src/components/html-editor.tsx",
  // Screens that ARE a device: they hang in a lobby or sit on a counter, and
  // they are dark whatever the operator's theme is.
  "apps/scena-app/src/pages/Kiosk.tsx",
  "apps/scena-app/src/pages/Station.tsx",
  "apps/scena-app/src/pages/BoardControlApp.tsx",
  // Lists and editors whose tiles are slide/screen thumbnails, with a status
  // pill or a hover control sitting on top of one.
  "apps/scena-app/src/pages/Screens.tsx",
  "apps/scena-app/src/pages/Studio.tsx",
  "apps/scena-app/src/pages/Playlists.tsx",
  "apps/scena-app/src/pages/MediaLibrary.tsx",
  "apps/scena-app/src/pages/LiveBoards.tsx",
  "apps/scena-app/src/pages/WidgetBuilder.tsx",
  // A slide/scene preview with a caption over it.
  "apps/scena-app/src/builder/ProfileStartDialog.tsx",
  // A full-screen takeover, previewed in its own broadcast gradient.
  "apps/scena-app/src/components/EmergencyModal.tsx",
];

/**
 * THE SLIDE'S OWN CSS — a different exemption, and a stronger one.
 *
 * These files do not style the app. They compute the CSS of a WIDGET as it will
 * appear on a screen in a lobby, and `@scena/widgets` shares that computation
 * byte-identically with the player. The player is dependency-free by design
 * (SCENA.md §4): it has no `@4dl/ui`, no tokens, and 512 MB of RAM.
 *
 * So `borderRadius: radius` here is the WIDGET's configured corner, not the
 * app's `--radius`, and routing it through a token would make the builder's
 * preview disagree with the television — which is the one thing a WYSIWYG
 * builder may never do. The placeholder colours are the same: they are what an
 * unconfigured widget looks like on air.
 *
 * These go in `exemptFiles` rather than `waive`, and the difference matters.
 * `waive` relaxes ONE pattern (white/black) of ONE rule, which is right for a
 * caption sitting over a thumbnail. It cannot express "this file is not app UI
 * at all", which is what these three are: a widget renderer, the drag handles
 * drawn over it, and a table of starter scenes. No app rule has anything true
 * to say about them, and pretending otherwise would mean 33 inline waivers
 * whose reason is identical.
 */
const SLIDE_CSS = [
  "apps/scena-app/src/builder/WidgetView.tsx",
  "apps/scena-app/src/builder/TransformBox.tsx",
  "apps/scena-app/src/builder/templates.ts",
  // The canvas colour itself, and its one definition.
  "apps/scena-app/src/builder/canvas.ts",
];

describe("Scena's UI conformance (UI-LANGUAGE.md)", () => {
  it("obeys every rule the design system publishes", () => {
    const v = uiConformance({
      roots: [APP],
      repoRoot: REPO,
      exemptFiles: [
        // Carries banned spellings as prose, so it matches itself — the same
        // exemption Kova's and Tessa's harnesses take.
        "apps/scena-app/src/ui-conformance.test.ts",
        ...SLIDE_CSS,
      ],
      waive: { "design-tokens": MEDIA_OVERLAYS },
    });
    expect(v, v.length ? `\n${v.length} violation(s):\n\n${formatUiViolations(v)}\n` : "").toEqual([]);
  });

  it("the lints can still see a violation", () => {
    // A lint that silently stops matching passes everything, and a vacuous pass
    // is indistinguishable from a clean app.
    expect(ruleSelfTest()).toEqual([]);
  });
});
