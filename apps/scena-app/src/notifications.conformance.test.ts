/**
 * EVERY NOTIFICATION TYPE HAS A FACE, AND EVERY LINK LANDS SOMEWHERE.
 *
 * ── Why this exists, and why it exists NOW ──────────────────────────────────
 *
 * The bell was mounted here for the first time along with this file, and the
 * first draft of its `CODING` map got three keys wrong — `screen_online` for
 * `screen_recovered`, `emergency_started` for `emergency_active`, plus an
 * `ai_ready` that does not exist — and missed three real types entirely
 * (`channel_published`, `channel_rolled_back`, `feed_stalled`).
 *
 * Not one of those throws. `coding()` falls back to a generic bell, so the
 * result is a notification list where a siren and a paid invoice look identical
 * and nothing anywhere reports a problem. That is the same shape as every
 * finding in `docs/PLATFORM-AUDIT.md`: a wrong answer wearing a correct one's
 * face.
 *
 * ── The two directions, and they catch different mistakes ───────────────────
 *
 * A type with no coding is the one above: a real message rendered as an
 * anonymous one. A coding with no type is the reverse — dead configuration that
 * reads as coverage, and the reason a renamed type would otherwise pass this
 * file by leaving its old entry behind.
 *
 * The link check is the third: `onOpen` navigates to `n.link`, so a registry
 * entry pointing at a route the SPA does not have sends somebody who tapped a
 * notification to a blank screen.
 */

/**
 * ⚠️ The worker's registry is read as SOURCE, not imported.
 *
 * `apps/scena/src` is outside this package's `rootDir`, so importing it is a
 * `TS6059`. Reading the file is also what this check already does for `CODING`
 * and the route table, so all three sides are compared the same way — and the
 * regexes are anchored on the declaration syntax rather than on line numbers.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(new URL(p, import.meta.url).pathname, "utf8");

const REGISTRY = src("../../scena/src/notifications.ts");
// Bounded to the object literal itself: `configureNotify` below it also
// contains `audiences: { … }`, which the entry regex would otherwise read as a
// notification type called "audiences".
const registryBody = (() => {
  const from = REGISTRY.indexOf("export const NOTIF_TYPES");
  return REGISTRY.slice(from, REGISTRY.indexOf("\n};", from));
})();

/** Every type the server can dispatch, with the link it carries (or null). */
const ENTRIES: { type: string; link: string | null }[] = [
  ...registryBody.matchAll(/^\s{2}([a-z_]+):\s*\{([^}]*)\},?$/gm),
].map((m) => ({
  type: m[1]!,
  link: /link:\s*"([^"]+)"/.exec(m[2]!)?.[1] ?? null,
}));

const TYPES = ENTRIES.map((e) => e.type);

/** The keys of `CODING` in `Notifications.tsx`, read from source. */
function codedTypes(): string[] {
  const text = src("./Notifications.tsx");
  const body = text.slice(text.indexOf("const CODING"), text.indexOf("/** An unknown type is still"));
  return [...body.matchAll(/^\s{2}([a-z_]+):\s*\{\s*icon:/gm)].map((m) => m[1]!);
}

/**
 * Every `<Route path="…">` the dashboard registers.
 *
 * ⚠️ `[\s\S]*?` rather than `\s+`, because several routes put `path` on its own
 * line. The first version of this regex required them adjacent, missed
 * `/channels` and `/feeds`, and therefore reported two links as dead that are
 * fine — a checker that cries wolf gets waived, which is worse than not having
 * one.
 */
function routes(): string[] {
  return [...src("./App.tsx").matchAll(/<Route[\s\S]{0,120}?path="([^"]+)"/g)].map((m) => m[1]!);
}

describe("the notification registry and the bell agree", () => {
  it("gives every dispatched type its own icon and tone", () => {
    const coded = new Set(codedTypes());
    const missing = TYPES.filter((t) => !coded.has(t));
    expect(missing, `these types render as an anonymous bell: ${missing.join(", ")}`).toEqual([]);
  });

  it("carries no coding for a type nothing dispatches", () => {
    // Dead configuration that reads as coverage — and what a rename leaves
    // behind if only the first assertion exists.
    const known = new Set(TYPES);
    const orphans = codedTypes().filter((t) => !known.has(t));
    expect(orphans, `these codings match no notification type: ${orphans.join(", ")}`).toEqual([]);
  });

  it("has enough types to be checking something", () => {
    // A registry that got emptied would pass both assertions above vacuously.
    expect(TYPES.length).toBeGreaterThan(10);
    expect(codedTypes().length).toBe(TYPES.length);
  });
});

describe("every notification lands somewhere real", () => {
  it("links only to routes the dashboard actually has", () => {
    const known = routes();
    const matches = (link: string): boolean =>
      known.some((r) => r === link || (r.includes(":") && new RegExp(`^${r.replace(/:[^/]+/g, "[^/]+")}$`).test(link)));

    for (const { type, link } of ENTRIES) {
      if (!link) continue; // informational, and legitimately not a destination
      expect(matches(link), `${type} links to ${link}, which is not a route`).toBe(true);
    }
  });
});
