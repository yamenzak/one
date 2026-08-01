/**
 * GERMAN STAYS COMPLETE.
 *
 * `Translation<D>` is `Partial` on purpose — a half-finished locale must still
 * compile, or nobody can start one. The cost of that decision is that nothing
 * stops a half-finished locale from SHIPPING, and the fallback is silent by
 * design: a missing key renders the English sentence, which looks like a
 * translation nobody got round to rather than like a bug.
 *
 * That is the right runtime behaviour and the wrong development behaviour, so
 * this is the other half of the trade. Adding an English string without its
 * German is a test failure here, at the moment it is added, rather than a
 * discovery made by a customer reading English in the middle of a German screen.
 *
 * It also catches the quieter one: a key RENAMED in English leaves its old
 * German behind, where nothing renders it and nothing complains.
 */

import { describe, expect, it } from "vitest";
import { missingKeys, strayKeys } from "@4dl/i18n";
import { de, en } from "./i18n.js";

describe("german", () => {
  it("translates every string the app can show", () => {
    const missing = missingKeys(en, de);
    expect(missing, `de is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("carries no keys English has dropped", () => {
    const stray = strayKeys(en, de);
    expect(stray, `de has keys English does not: ${stray.join(", ")}`).toEqual([]);
  });

  it("keeps the plural forms in step", () => {
    /**
     * A `one|other` string whose translation has only one form silently renders
     * the singular for every count — "2 Sieb". English and German share the
     * two-form rule, so the shapes must match exactly.
     */
    const mismatched = Object.keys(en).filter((k) => {
      const e = (en as Record<string, string>)[k]!;
      const d = (de as Record<string, string | undefined>)[k];
      return d !== undefined && e.includes("|") !== d.includes("|");
    });
    expect(mismatched, `plural shape differs: ${mismatched.join(", ")}`).toEqual([]);
  });

  it("keeps the placeholders in step", () => {
    // A translation that dropped `{count}` renders a sentence with a number
    // missing from it, which reads as a rendering fault rather than as a
    // translation fault and therefore never gets reported as one.
    const names = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
    const bad = Object.keys(en).filter((k) => {
      const d = (de as Record<string, string | undefined>)[k];
      return d !== undefined && names((en as Record<string, string>)[k]!).join() !== names(d).join();
    });
    expect(bad, `placeholders differ: ${bad.join(", ")}`).toEqual([]);
  });
});
