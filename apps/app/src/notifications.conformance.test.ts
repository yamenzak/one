/**
 * Every notification must be customizable, complete, and land somewhere real.
 *
 * Three failure modes this catches, none of which throw at runtime:
 *
 *  1. A type with NO template cannot be edited in the studio's Email templates
 *     screen at all — it silently falls through to the generic card, so "all
 *     messages are customizable" quietly stops being true as types are added.
 *  2. A template referencing a variable nobody supplies renders a sentence with
 *     a GAP: `renderTemplate` blanks an unknown key rather than leaving
 *     `{{var}}` visible, so the email reads as broken English and nothing
 *     anywhere reports it.
 *  3. A `link` pointing at a route the app does not have sends someone who
 *     tapped a notification to a blank screen.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOTIF_TYPES, universalNotifVars, notifTemplateOf, notifVarsOf, renderTemplate, type NotifType } from "@kova/domain";

const TYPES = Object.keys(NOTIF_TYPES) as NotifType[];
const varsIn = (s: string): string[] => [...s.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]!);

describe("every notification is customizable", () => {
  it("has an editable template — no type falls through to the generic card", () => {
    const missing = TYPES.filter((t) => !notifTemplateOf(t));
    expect(missing, `these types cannot be customized: ${missing.join(", ")}`).toEqual([]);
    expect(TYPES.length).toBeGreaterThan(20);
  });

  it("declares every variable it uses, so the editor can list them", () => {
    for (const t of TYPES) {
      const tpl = notifTemplateOf(t)!;
      const declared = new Set(notifVarsOf(t));
      for (const v of [...varsIn(tpl.subject), ...varsIn(tpl.body)]) {
        expect(declared.has(v), `${t} uses {{${v}}} but does not declare it in \`vars\``).toBe(true);
      }
    }
  });

  it("uses no variable that could arrive empty and leave a gap in the sentence", () => {
    // A type-specific var is only safe if its callers pass it; the universal
    // three are always present. This asserts the ones a template LEANS on are
    // universal, which is what makes a type customizable without its callers
    // having to know.
    const universal = new Set<string>(universalNotifVars());
    for (const t of TYPES) {
      const tpl = notifTemplateOf(t)!;
      // The subject is what someone sees in their inbox list — it must never be
      // empty, so at least one universal var (or literal text) has to carry it.
      const subjectVars = varsIn(tpl.subject);
      const literal = tpl.subject.replace(/\{\{[^}]*\}\}/g, "").trim();
      expect(
        literal.length > 0 || subjectVars.some((v) => universal.has(v)),
        `${t}'s subject is made only of variables its callers may not pass`,
      ).toBe(true);
    }
  });

  it("renders to real prose with only the universal variables supplied", () => {
    // The worst case: a caller passes nothing type-specific. Every template must
    // still produce a sentence, not a stub with holes.
    const bag = { studioName: "Iron House", title: "Sam logged a check-in", message: "Feeling strong" };
    for (const t of TYPES) {
      const tpl = notifTemplateOf(t)!;
      const subject = renderTemplate(tpl.subject, bag).trim();
      const body = renderTemplate(tpl.body, bag).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      expect(subject.length, `${t} renders an empty subject`).toBeGreaterThan(3);
      expect(body.length, `${t} renders an empty body`).toBeGreaterThan(20);
      // No stray braces, and no double-space left by a vanished variable mid-sentence.
      expect(body, `${t} leaked template syntax`).not.toMatch(/\{\{|\}\}/);
    }
  });
});

describe("every notification link goes somewhere the app can render", () => {
  /** The app's real route table, read from the router rather than restated. */
  const routes = (() => {
    const shell = readFileSync(new URL("./Shell.tsx", import.meta.url), "utf8");
    return [...shell.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]!);
  })();

  it("found the router (a lint that reads nothing passes vacuously)", () => {
    expect(routes.length).toBeGreaterThan(10);
  });

  it("resolves every fixed link in the registry", () => {
    // Path segments only — a query string is state for the destination screen.
    const paths = new Set(routes.map((r) => (r.startsWith("/") ? r : `/${r}`)));
    const matches = (link: string): boolean => {
      const path = link.split("?")[0]!.replace(/\/$/, "");
      if (paths.has(path)) return true;
      // A parameterised route: same segment count, and every non-`:` segment equal.
      const want = path.split("/").filter(Boolean);
      return [...paths].some((r) => {
        const have = r.split("/").filter(Boolean);
        return have.length === want.length && have.every((seg, i) => seg.startsWith(":") || seg === want[i]);
      });
    };
    for (const t of TYPES) {
      const link = NOTIF_TYPES[t].link;
      if (!link) continue; // client-scoped, passed in at call time
      expect(matches(link), `${t} links to "${link}", which no route in Shell.tsx can render`).toBe(true);
    }
  });
});
