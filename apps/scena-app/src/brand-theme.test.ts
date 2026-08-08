/**
 * THE BRAND, ACROSS THE SEAM — and the three ways it can go wrong quietly.
 *
 * Applying a workspace's palette is `@4dl/ui`'s job now (`applyBranding`), and
 * that closes the class of bug this file was written for: between Stage 7a and
 * 7f, Scena's own `brandCss` emitted `:root { …light… }` and `.dark { …dark… }`,
 * so a tenant's dark tokens applied NOWHERE and its light tokens were injected
 * into the dark theme. Both halves compiled, the app still had colours, and they
 * were the wrong ones. `@4dl/ui`'s selectors are pinned by its own suite.
 *
 * What the move introduced instead is a SEAM, and all three of its failure modes
 * are silent:
 *
 *   1. The editor writes a token the server's allowlist does not carry, so the
 *      field saves and does nothing.
 *   2. Scena's half of the stylesheet gets folded into the element
 *      `applyBranding` owns, and is wiped on the next keystroke.
 *   3. The radius crosses the boundary in the wrong unit — rem to the page,
 *      pixels to a television.
 */

import { describe, it, expect } from "vitest";
import { THEME_TOKENS as SCENA_TOKENS } from "@scena/manifest";
import { THEME_TOKEN_GROUPS, DEFAULT_TOKENS as UI_DEFAULT_TOKENS, brandingCss } from "@4dl/ui";
import { brandExtrasCss, parseThemeCss, EMPTY_BRAND, type WorkspaceBrand } from "./brand-theme.js";

const kit = (over: Partial<WorkspaceBrand> = {}): WorkspaceBrand => ({ ...EMPTY_BRAND, ...over });

/*
  ⚠️ THE ALLOWLIST HAS TO BE A SUPERSET OF WHAT THE SHARED EDITOR OFFERS.

  `apps/scena/src/branding-store.ts` validates a saved kit against
  `@scena/manifest`'s `THEME_TOKENS` and DROPS anything absent, without a word.
  So a token the grid renders a field for and the list omits is a control a
  person fills in, presses Save on, and watches do nothing — the failure has no
  symptom except the colour not changing.

  This is a plain set comparison and it is worth a test because the two lists
  live in different packages with no dependency between them: `@scena/manifest`
  cannot import `@4dl/ui`, so nothing but this will notice the day the design
  system adds a token.
*/
describe("the two token vocabularies", () => {
  it("Scena's allowlist covers every token the shared editor can write", () => {
    const editorTokens = THEME_TOKEN_GROUPS.flatMap((g) => g.tokens);
    const allow = new Set<string>(SCENA_TOKENS);
    expect(editorTokens.filter((t) => !allow.has(t))).toEqual([]);
  });

  it("and every token the shared palette generator emits", () => {
    const generated = Object.keys({ ...UI_DEFAULT_TOKENS.dark, ...UI_DEFAULT_TOKENS.light }).map((k) => k.replace(/^--/, ""));
    const allow = new Set<string>(SCENA_TOKENS);
    // The design system's accents are an app's own (Kova registers eleven);
    // Scena registers none, so the shipped set is the whole surface.
    expect(generated.filter((t) => !allow.has(t))).toEqual([]);
  });
});

describe("brandExtrasCss — Scena's own half", () => {
  /*
    A SEPARATE ELEMENT, not appended to the platform's.

    `applyBranding` rewrites its element's `textContent` wholesale on every call,
    and the brand editor calls it on every keystroke of a live preview. Anything
    appended there survives exactly until the next drag. The assertion here is
    the observable half of that: what Scena emits must NOT be the shadcn block,
    or the two are competing to own one element.
  */
  it("carries the font and the widget theme, and no shadcn tokens", () => {
    const css = brandExtrasCss(kit({ bodyFont: "Poppins" }));
    expect(css).toContain('--font-sans: "Poppins"');
    expect(css).toContain("--w-accent");
    expect(css).toContain("--w-radius");
    expect(css).not.toContain("--background:");
    expect(css).not.toContain("[data-theme");
  });

  it("drops a font name that could close the CSS string", () => {
    const css = brandExtrasCss(kit({ bodyFont: 'Evil", x: y; }' }));
    expect(css).not.toContain("Evil");
    expect(css).not.toContain("x: y");
  });

  /*
    THE UNIT CROSSES HERE. `--radius` is rem because the page resolves it against
    a root font size; `--w-radius` is px because a television does not have one —
    the player injects the block into a bare document. Storing both is how they
    come to disagree, so the conversion is at the boundary and pinned.
  */
  it("converts the rem radius to pixels for the screen", () => {
    expect(brandExtrasCss(kit({ radius: 1.25 }))).toContain("--w-radius: 20px");
    expect(brandingCss(kit({ radius: 1.25 }))).toContain("--radius:1.25rem");
  });

  it("derives the widget accent from the brand's own --primary", () => {
    const css = brandExtrasCss(kit({ tokens: { light: {}, dark: { "--primary": "oklch(0.7 0.18 30)" } } }));
    // Hue 30, not the shipped 300 — the prefixed key has to survive the trip
    // through `@scena/manifest`'s resolver. It did not, before that resolver
    // learned to accept both conventions.
    expect(/--w-accent: oklch\([\d.]+ [\d.]+ 30/.test(css)).toBe(true);
  });
});

describe("parseThemeCss", () => {
  it("reads :root as light and .dark as dark, and prefixes the keys", () => {
    const parsed = parseThemeCss(`
      :root { --primary: oklch(0.5 0.2 100); --background: #fff; }
      .dark { --primary: oklch(0.8 0.2 100); }
    `);
    expect(parsed.light["--primary"]).toBe("oklch(0.5 0.2 100)");
    expect(parsed.light["--background"]).toBe("#fff");
    expect(parsed.dark["--primary"]).toBe("oklch(0.8 0.2 100)");
  });

  it("ignores tokens outside the allowlist", () => {
    const parsed = parseThemeCss(":root { --primary: #111; --not-a-real-token: #222; }");
    expect(Object.keys(parsed.light)).toEqual(["--primary"]);
  });

  it("returns empty maps for text that is not a theme", () => {
    const parsed = parseThemeCss("hello");
    expect(parsed.light).toEqual({});
    expect(parsed.dark).toEqual({});
  });
});
