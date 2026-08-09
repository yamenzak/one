/**
 * Scena must not rebuild a console panel `@4dl/admin` already ships.
 *
 * ── What this file is here to hold down ─────────────────────────────────────
 *
 * Scena's console arrived from another repo with its own screens for three
 * things the platform owns, and each was a working screen that was worse in a
 * way nobody could see from inside this app:
 *
 *   Stripe        one flat set of keys, where the shared panel has two LANES
 *                 (test/live), the mismatch alarm, and the catalog-id stash —
 *                 so this one could not tell an operator the stored catalog
 *                 belonged to the other lane.
 *   Email         a test-send button and the sender rows, in a form three rows
 *                 above the console's OWN `PlatformEmailSection`. Two screens
 *                 writing the same `app_config` rows, with no rule about which
 *                 wins.
 *   AI models     a rate table and three toggles, with no read of the MERGED
 *                 config (so a key set once in the shared platform store read
 *                 as "not set" and invited an operator to paste a permanent
 *                 per-app override), no per-lane default picker, and no way to
 *                 send or receive the "apply to every 4DL app" broadcast.
 *
 * None of the three failed anything. They rendered, they saved, and the app was
 * simply on a private copy of a shared capability — which is the exact shape
 * `docs/PLATFORM-AUDIT.md` catalogues eight times over, and the reason the rule
 * is a test rather than a paragraph.
 */

import { describe, expect, it } from "vitest";
import { sharedPanelViolations } from "@4dl/admin/conformance";

describe("the operator console", () => {
  it("uses the shared panels rather than reaching for the endpoints itself", () => {
    const problems = sharedPanelViolations(new URL(".", import.meta.url).pathname);
    expect(problems, problems.join("\n")).toEqual([]);
  });
});
