/**
 * THE ICONS.
 *
 * ⚠️ A GENERATED FILE THAT NOTHING RE-DERIVES IS A COPY, AND A COPY DRIFTS. The
 * geometry is committed rather than imported — the package is loaded by workers
 * rendering on a server, and a runtime dependency for twenty-two shapes that
 * never change is a dependency in every one of them — so the check is that the
 * committed file still equals what the generator produces.
 */

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { ICONS, ICON_NAMES, type IconName } from "../src/icons.js";
import { CHOREOGRAPHY } from "../src/motion.js";
import { STRUCTURE } from "../src/styles.js";
import { Icon } from "../src/components/icon.js";
import { FROM_LUCIDE, geometry } from "../reference/build-icons.js";

const html = (node: React.ReactNode): string => renderToStaticMarkup(node as never);

describe("the set is closed, and it is lucide's", () => {
  /*
    ⚠️ RE-DERIVED FROM THE PACKAGE WHERE IT IS INSTALLED. Skipped rather than
    failed when it is absent, because it is not a dependency of the product — but
    where it IS present, a hand-edited path fails here rather than shipping a
    glyph that is subtly not the one every other product draws.
  */
  it("still equals what the generator produces", () => {
    if (!existsSync("node_modules/lucide-static/icons/plus.svg")) return;
    for (const [ours, theirs] of Object.entries(FROM_LUCIDE)) {
      expect(ICONS[ours as IconName], ours).toBe(geometry(theirs));
    }
  });

  /*
    ⚠️ TWO THOUSAND ICONS IS NOT AN ICON LANGUAGE, IT IS A SEARCH BOX. The set is
    small enough to hold in mind, which is the property that makes a product's
    glyphs feel drawn for it rather than picked per screen.
  */
  it("stays small enough to be a language", () => {
    expect(ICON_NAMES.length).toBeLessThanOrEqual(40);
    expect(new Set(Object.values(FROM_LUCIDE)).size, "one lucide icon under two of our names").toBe(ICON_NAMES.length);
  });

  /*
    ⚠️ GEOMETRY ONLY. The wrapper, the size and the colour are the component's —
    and the first version of this check banned every `width=`, which is wrong:
    inside a 24×24 viewBox a rect's width IS the drawing. What must not appear is
    the element's OWN size, which is what a nested svg or a stroke-width carries.
  */
  it("carries no wrapper, no size and no colour of its own", () => {
    for (const [name, drawing] of Object.entries(ICONS)) {
      expect(drawing, name).not.toContain("<svg");
      expect(drawing, name).not.toContain("stroke-width=");
      expect(drawing, name).not.toContain("class=");
      /* A `fill="currentColor"` dot is lucide's; it is ink, not a colour. */
      expect(drawing, name).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|oklch)\s*\(/i);
    }
  });
});

describe("an icon takes its size and its meaning from where it stands", () => {
  /*
    ⚠️ AN ICON BESIDE ITS OWN LABEL IS DECORATION AND IS HIDDEN; one standing
    alone IS the label. Getting this backwards is how a screen reader reads
    "Back, Back" on every app bar, or nothing at all.
  */
  it("hides itself unless it is the whole meaning", () => {
    expect(html(Icon({ name: "search" }))).toContain('aria-hidden="true"');
    const alone = html(Icon({ name: "back", label: "Back" }));
    expect(alone).toContain('aria-label="Back"');
    expect(alone).toContain('role="img"');
    expect(alone).not.toContain("aria-hidden");
  });

  it("emits no size of its own — the sheet places it by position", () => {
    const out = html(Icon({ name: "plus" }));
    /* ⚠️ The OPENING TAG only: a rect inside the viewBox has a width of its own. */
    const open = out.slice(0, out.indexOf(">"));
    expect(open).not.toMatch(/\swidth=|\sheight=/);
    expect(out).toContain('viewBox="0 0 24 24"');
    expect(out).toContain('stroke="currentColor"');
    /* And the sheet does size it, per §5.2's roles. */
    expect(STRUCTURE).toMatch(/\[data-one='icon'\][^}]*inline-size/);
    expect(STRUCTURE).toMatch(/quick-action-well'\] \[data-one='icon'\]/);
  });
});

describe("the motion plays on interaction, and never on hover", () => {
  /*
    ⚠️ THE WHOLE ANIMATED-ICON GENRE IS BUILT ON HOVER, and hover is a capability
    half the devices this ships to do not have. An icon that only moves under a
    mouse is an animation nobody on a phone will ever see — and `one lint` fails
    anything reachable that way, so it would not ship regardless.
  */
  it("triggers on press and on keyboard focus, never on hover", () => {
    const rules = CHOREOGRAPHY.replace(/\/\*[\s\S]*?\*\//g, "");
    const icon = rules.split("data-icon=").slice(1).join("");
    expect(icon).toContain(":active");
    expect(icon).toContain(":focus-visible");
    expect(icon, "an icon that only moves under a mouse is invisible on a phone").not.toContain(":hover");
  });

  /*
    ⚠️ EVERY ICON MOVES, AND THE MOTION IS ITS OWN. A shared motion applied to
    everything was the first version, and four of them across twenty-seven icons
    is a page effect rather than either object behaving: a bell that scales and a
    key that scales are the same animation wearing two glyphs. An icon the sheet
    never names stands still while its neighbours move, which reads as a broken
    icon rather than as a missing rule — so the check is COVERAGE, by name.
  */
  it("gives every icon a motion, and defines every motion it names", () => {
    const named = new Set([...CHOREOGRAPHY.matchAll(/\[data-icon='([a-z-]+)'\]/g)].map((m) => m[1]!));
    for (const name of ICON_NAMES) expect(named, `${name} has no motion`).toContain(name);
    const assigned = new Set([...CHOREOGRAPHY.matchAll(/animation: (icon-[a-z]+)/g)].map((m) => m[1]!));
    for (const motion of assigned) expect(CHOREOGRAPHY, motion).toContain(`@keyframes ${motion}`);
  });

  /*
    ⚠️ AND A PART-LEVEL RULE COUNTS CHILDREN, which is only safe because the
    geometry is GENERATED and re-derived above. A hand-edited path would move a
    part out from under its rule — the check draws its own tail, the shutter
    closes the wrong circle — so this test asserts the two halves are in the same
    file for a reason, and that no positional rule outruns its icon's parts.
  */
  it("never addresses a part its icon does not have", () => {
    for (const m of CHOREOGRAPHY.matchAll(/\[data-icon='([a-z-]+)'\] > :nth-child\((\d+)\)/g)) {
      const parts = (ICONS[m[1] as IconName].match(/<(path|circle|rect|polyline|line)/g) ?? []).length;
      expect(Number(m[2]), `${m[1]} has ${parts} parts`).toBeLessThanOrEqual(parts);
    }
  });

  /* ⚠️ And it holds no duration: the motions are on the same clock as everything. */
  it("runs on the shared clock", () => {
    for (const m of CHOREOGRAPHY.matchAll(/animation: icon-[a-z]+ ([^;]+);/g)) {
      expect(m[1], "an icon with a timing of its own").toMatch(/^var\(--t-/);
    }
  });
});
