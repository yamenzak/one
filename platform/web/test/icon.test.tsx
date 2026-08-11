/**
 * THE ICONS, HELD TO THEIR OWN SHAPE.
 *
 * ⚠️ THE ANIMATIONS ADDRESS PARTS BY POSITION — `[data-icon='save'] > :nth-child(3)`
 * is the arrowhead — and Lucide redraws icons between versions. A redrawn icon
 * does not fail: the selector still matches something, so the wrong part moves,
 * quietly, forever. Nothing else in the build could notice.
 *
 * ⚠️ AND IT IS NOT HYPOTHETICAL. Both `KeyRound` and `SlidersHorizontal` were
 * redrawn between the version this was written against and the one before it —
 * the key's circle went from being the ring to being the hole, and the sliders
 * went from two rails and two knobs to nine paths. Either change would have left
 * an icon animating a part that no longer meant anything.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as Icons from "../src/icon.js";
import { ICON_PARTS, type IconName } from "../src/icon.js";
import { MOTION_CSS } from "../src/motion.css.js";

/** Every drawing component this package exports, by the name it stamps. */
const drawn: Readonly<Record<IconName, (p: Icons.IconProps) => unknown>> = {
  key: Icons.Key, adjust: Icons.Adjust, guard: Icons.Guard,
  save: Icons.Save, heartbreak: Icons.Heartbreak, edit: Icons.Edit, lens: Icons.Lens,
  letter: Icons.Letter, device: Icons.Device, add: Icons.Add,
  onward: Icons.Onward, close: Icons.Close, back: Icons.Back, tick: Icons.Tick,
  light: Icons.Light, tongue: Icons.Tongue, measure: Icons.Measure,
  buzz: Icons.Buzz, sound: Icons.Sound,
};

const partsOf = (name: IconName): readonly string[] => {
  const Glyph = drawn[name] as (p: Icons.IconProps) => never;
  const html = renderToStaticMarkup(<Glyph size={24} /> as never);
  return [...html.matchAll(/<(circle|path|line|polyline|rect|ellipse|polygon)\b/g)].map((m) => m[1]!);
};

describe("what Lucide draws is what the stylesheet animates", () => {
  it("draws exactly the parts each icon declares, in order", () => {
    for (const name of Object.keys(ICON_PARTS) as IconName[]) {
      expect(partsOf(name), `${name} has been redrawn — its animation now moves a different part`)
        .toEqual(ICON_PARTS[name]);
    }
  });

  /*
    ⚠️ AND NO RULE REACHES PAST THE END. A selector for the fourth child of a
    two-part icon matches nothing and fails silently — the icon simply stops
    moving, which reads as "we did not animate that one" rather than as a bug.
  */
  it("never addresses a part that does not exist", () => {
    const rules = MOTION_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, name, nth] of rules.matchAll(/\[data-icon='([a-z]+)'\] > :nth-child\((\d+)\)/g)) {
      const parts = ICON_PARTS[name as IconName];
      expect(parts, `an animation names an icon that does not exist: ${name}`).toBeDefined();
      expect(Number(nth), `${name} has ${parts.length} parts and the sheet moves its ${nth}`)
        .toBeLessThanOrEqual(parts.length);
    }
  });

  /*
    ⚠️ EVERY ICON IS ADDRESSED, or it is furniture that says so. An icon nobody
    styled is one that does nothing when its row is pressed — a difference nobody
    reports and everybody feels as inconsistency.
  */
  it("moves every icon that is not deliberately still", () => {
    /* The tick draws itself on arrival rather than reacting to a press. */
    const still = new Set<IconName>(["close", "back", "tick"]);
    for (const name of Object.keys(ICON_PARTS) as IconName[]) {
      if (still.has(name)) continue;
      expect(MOTION_CSS, `${name} has no movement`).toContain(`[data-icon='${name}']`);
    }
  });
});
