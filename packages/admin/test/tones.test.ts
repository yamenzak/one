/**
 * A SHARED PANEL MAY ONLY WEAR A STATUS TONE.
 *
 * `Tone` is `StatusTone | (string & {})` — five status tones, plus whatever
 * accents the consuming APP has registered. That second half is the trap for a
 * shared package: `tone="sleep"` typechecks perfectly, renders correctly in the
 * one product that happens to define `--sleep`, and renders an UNCOLOURED icon
 * in every other one. Tailwind never generates `text-sleep` for an app whose
 * scan has never seen the literal, so there is nothing to see and nothing to
 * debug — the icon is simply the default colour.
 *
 * It shipped here exactly once, in the shared-config index: five groups given
 * Kova's `activity` / `supplement` / `sleep` accents because UI-LANGUAGE §7 says
 * colour is navigation. The rule is right and the palette was the app's. The fix
 * was to make the colour a STATE (a Turnstile secret with no site key is
 * `danger`), which is the only claim this package can make in every product.
 *
 * A type cannot catch this — the whole point of `(string & {})` is that an app
 * may invent tones. So it is checked structurally, over this package's source.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const STATUS = new Set(["success", "warning", "danger", "primary", "neutral"]);
const SRC = join(new URL("..", import.meta.url).pathname, "src");

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

describe("tones", () => {
  it("uses no accent this package cannot guarantee exists", () => {
    const bad: string[] = [];
    for (const file of sources(SRC)) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        // `tone="x"` (a prop) and `tone: "x"` (a registry entry) are the two
        // shapes. A `Tone` arriving as a variable is the app's to get right.
        for (const m of line.matchAll(/\btone[:=]\s*"([a-z-]+)"/g)) {
          if (!STATUS.has(m[1]!)) {
            bad.push(
              `${file.slice(SRC.length + 1)}:${i + 1} uses tone "${m[1]}", which is not a status tone. ` +
                `Accents belong to the app — in a product that has not registered this one, ` +
                `Tailwind generates no class and the element is simply uncoloured.`,
            );
          }
        }
      });
    }
    expect(bad, `\n${bad.join("\n")}`).toHaveLength(0);
  });
});
