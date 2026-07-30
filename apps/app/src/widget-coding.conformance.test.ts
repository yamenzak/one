/**
 * Every hero widget takes its colour from a registry.
 *
 * This exists because of two findings, and the second one is why a lint rather
 * than a code review:
 *
 * 1. Six client widgets hard-coded a tone literal — and each one wrote it
 *    TWICE, once on the widget definition (which colours the picker row and the
 *    builder's toolbar) and again inside the renderer (which colours the tile).
 *    Two copies of a colour is how a metric ends up amber in the picker and blue
 *    on the home screen.
 *
 * 2. Four COACH widgets count attention types — the very same
 *    `attention.totals` the roster feed renders further down the SAME screen —
 *    and three of the four disagreed with `ATTENTION_CODING`. "At risk" was
 *    sleep-blue in the hero and danger-red in the feed, for one number, in one
 *    viewport. Nothing caught it: both tones are legal, both come from the token
 *    set, and every existing conformance layer passed.
 *
 * So the check is not "is this a valid tone" — they all were. It is "does this
 * colour come from the ONE place that owns it".
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLIENT_WIDGETS } from "./screens/client/HomeWidgets.js";
import { COACH_WIDGETS, WIDGET_ATTENTION } from "./screens/coach/CoachWidgets.js";
import { attentionCoding } from "./attention-ui.js";
import { METRICS } from "./registry/index.js";
import type { Tone } from "@4dl/ui";

const ROOT = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const read = (rel: string) => readFileSync(`${ROOT}/${rel}`, "utf8");

/** Every tone in the token set, so we can spot a literal that IS a tone. */
const TONES = new Set([
  "activity", "nutrition", "sleep", "cardio", "hydration", "supplement", "lab",
  "calories", "protein", "carbs", "fat",
  "success", "warning", "danger", "primary", "neutral",
]);

describe("hero widget colour coding", () => {
  it("no client widget writes a tone literal — colour comes from METRICS", () => {
    const src = read("apps/app/src/screens/client/HomeWidgets.tsx");
    const offenders: string[] = [];
    src.split("\n").forEach((line, i) => {
      // `tone="x"` (JSX attribute) or `tone: "x"` (object property)
      for (const m of line.matchAll(/tone[:=]\s*"([a-z]+)"/g)) {
        if (TONES.has(m[1]!)) offenders.push(`HomeWidgets.tsx:${i + 1}  tone "${m[1]}" — use METRICS.<metric>.tone`);
      }
    });
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("every client widget's tone and icon are a real METRICS entry", () => {
    // Widened deliberately: `satisfies` narrows METRICS' tones to the literals
    // actually in use, and a widget's `tone` is the full Tone union.
    const tones: Set<Tone> = new Set(Object.values(METRICS).map((m) => m.tone));
    const icons: Set<unknown> = new Set(Object.values(METRICS).map((m) => m.icon));
    const bad = CLIENT_WIDGETS.filter((w) => !tones.has(w.tone) || !icons.has(w.icon))
      .map((w) => `${w.id}: tone=${w.tone}`);
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("a coach widget that counts an attention type matches ATTENTION_CODING", () => {
    // The hero and the roster feed are on one screen. One number, one colour.
    const bad: string[] = [];
    for (const [id, type] of Object.entries(WIDGET_ATTENTION)) {
      const w = COACH_WIDGETS.find((x) => x.id === id);
      expect(w, `no coach widget "${id}" — WIDGET_ATTENTION is stale`).toBeDefined();
      const want = attentionCoding(type);
      if (w!.tone !== want.tone) bad.push(`${id}: tile is "${w!.tone}", the roster feed is "${want.tone}" (${type})`);
      if (w!.icon !== want.icon) bad.push(`${id}: icon differs from the roster feed's (${type})`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("coach widgets take coding from a named map, never an inline literal", () => {
    const src = read("apps/app/src/screens/coach/CoachWidgets.tsx");
    const offenders: string[] = [];
    src.split("\n").forEach((line, i) => {
      if (line.trimStart().startsWith("*") || line.trimStart().startsWith("//")) return;
      for (const m of line.matchAll(/"([a-z]+)"/g)) {
        // A bare tone name in a call position is a literal that escaped the map.
        if (TONES.has(m[1]!) && !line.includes("as Tone")) {
          offenders.push(`CoachWidgets.tsx:${i + 1}  tone "${m[1]}" — use ROSTER_CODING or attentionCoding()`);
        }
      }
    });
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("every widget offering a ring has a real denominator", () => {
    // The other half of the colour question: a ring is a claim about a whole.
    // `stat` exists for numbers with none, so a widget must not offer both a
    // ring and no target — the catalogue is where that is decided.
    const suspicious = CLIENT_WIDGETS.filter((w) => w.forms.includes("ring") && w.forms.includes("stat") && w.forms[0] === "stat");
    expect(suspicious.map((w) => w.id)).toEqual([]);
  });
});
