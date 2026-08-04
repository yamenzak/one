/**
 * EVERY APP ROOT IS INSIDE AN ERROR BOUNDARY.
 *
 * A React error boundary only catches what is BELOW it. Wrapping `<Routes>` and
 * stopping there — which is what Kova did — leaves the session provider, the
 * theme provider, the screen picker and every early `return` above the router
 * unguarded, and a throw in any of them does not white-screen: React unmounts
 * the root, `#root` empties, and the visitor is left looking at the `body`
 * background. On a phone that is a black rectangle with no message, no button
 * and no console, which is exactly as reportable as it sounds — a real client
 * hit it after finishing their intake and the only evidence anyone could
 * produce was a photograph.
 *
 * This is a SOURCE check rather than a render test on purpose. What went wrong
 * was structural — a component tree missing one wrapper — and a render test
 * would have to mount the whole app (providers, router, network) to notice.
 * Reading the tree is both cheaper and closer to the actual invariant: the
 * boundary must ENCLOSE the providers, not sit inside them.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(fileURLToPath(new URL("./main.tsx", import.meta.url)), "utf8");
const root = SRC.slice(SRC.indexOf("createRoot("));

describe("the root render tree", () => {
  it("wraps everything in an ErrorBoundary", () => {
    expect(root, "main.tsx's createRoot(...) must render an <ErrorBoundary>").toContain("<ErrorBoundary>");
  });

  it("puts the boundary ABOVE every provider, not inside them", () => {
    // The ordering IS the invariant. A boundary under `SessionProvider` cannot
    // catch a throw from `SessionProvider`, and that provider is the one doing
    // network work on the very first render.
    const boundary = root.indexOf("<ErrorBoundary>");
    for (const provider of ["<MotionConfig", "<BrowserRouter>", "<SessionProvider>", "<ThemeProvider>", "<App />"]) {
      const at = root.indexOf(provider);
      expect(at, `${provider} must appear in the root tree`).toBeGreaterThan(-1);
      expect(at, `${provider} must be INSIDE the root ErrorBoundary`).toBeGreaterThan(boundary);
    }
  });
});
