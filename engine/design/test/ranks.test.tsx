/**
 * THREE HEADING RANKS, AND EACH ONE OUTRANKS WHAT IT HEADS.
 *
 * ⚠️ A HEADING LEVEL WITH THE ONE ABOVE IT IS A PAGE BREAK NOBODY INTENDED. A
 * screen names itself, names each part of itself, and names each card inside a
 * part; when two of those three come out the same size the reader gets a stack
 * of peers instead of a structure — four pages where there is one screen, or a
 * nesting that is simply invisible. Both have shipped, in opposite directions,
 * because each was fixed by moving one rank without measuring the other.
 *
 * ⚠️ SO IT IS MEASURED RATHER THAN READ. The sizes are Tailwind classes resolved
 * by a stylesheet against a face with its own metrics — `text-xl` and
 * `text-[1.75rem]` are strings until a browser computes them, and no static
 * check can compare two strings for loudness.
 *
 * ⚠️ AND THE SPECIMEN IS THE REAL NESTING, INSIDE A `Shell`. Rendering the three
 * components in a row would prove the tokens differ; what has to hold is that a
 * `Group` inside a `Section` inside a `Screen` comes out as three ranks. The
 * shell is not decoration here — it is what decides where a screen's own name is
 * drawn. Standing alone, a `Screen` draws a display heading in its own crown,
 * which is a fourth size and outranks a section however loud the section is; the
 * arrangement every product ships puts the name in the CONTENT, at `TYPE.title`,
 * which is exactly where a section can draw level with it.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Group, NavRow, Screen, Section, Shell } from "../src/index.js";
import { PHONE, html, pageFor, stylesheet } from "../src/measure/index.js";

let browser: Browser;
let css: string;
beforeAll(async () => { css = stylesheet(); browser = await chromium.launch(); }, 120_000);
afterAll(async () => { await browser?.close(); });

const HERE = "/";

const specimen = (
  <Shell
    screens={[{ id: "one", route: HERE, label: "One", nav: "primary", permission: "any:read" }]}
    here={HERE}
    held={new Set(["any:read"])}
    crown={{ appId: "one", appName: "One", appMark: "◆", tenantName: "A workspace" }}
    onGo={() => {}}
  >
    <Screen
      shape="list"
      title="The screen"
      of={{ status: "ready", value: 1 } as never}
      then={() => (
        <Section label="The part">
          <Group label="The block">
            <NavRow label="A row" under="a fact" onOpen={() => {}} />
          </Group>
        </Section>
      )}
    />
  </Shell>
);

interface Rank { readonly text: string; readonly size: number; readonly weight: number }

const ranksIn = async (): Promise<readonly Rank[]> => {
  const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
  try {
    await page.setContent(pageFor(html(specimen), css));
    return await page.evaluate(() =>
      (Array.prototype.slice.call(document.querySelectorAll("h1, h2, h3")) as Element[])
        .map((el) => {
          const style = getComputedStyle(el);
          return {
            text: (el.textContent ?? "").trim(),
            size: Number.parseFloat(style.fontSize),
            weight: Number.parseInt(style.fontWeight, 10),
          };
        }));
  } finally {
    await page.close();
  }
};

describe("the heading ranks", () => {
  it("draws all three, in the order they nest", async () => {
    const seen = await ranksIn();
    expect(seen.map((r) => r.text)).toEqual(["The screen", "The part", "The block"]);
  }, 30_000);

  /* ⚠️ STRICTLY DECREASING, NOT MERELY DIFFERENT. Equal is the fault; larger is
     the same fault upside down, and it has been shipped that way too. */
  it("makes each one quieter than the one it sits under", async () => {
    const seen = await ranksIn();
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!.size,
        `"${seen[i]!.text}" is ${seen[i]!.size}px under "${seen[i - 1]!.text}" at ${seen[i - 1]!.size}px`)
        .toBeLessThan(seen[i - 1]!.size);
    }
  }, 30_000);

  /* ⚠️ AND FAR ENOUGH APART TO READ AS RANKS. Two points of difference is a
     measurement, not a hierarchy — nobody scanning a screen sees 20 against 19. */
  it("separates them by enough to be seen", async () => {
    const seen = await ranksIn();
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i - 1]!.size - seen[i]!.size,
        `"${seen[i - 1]!.text}" and "${seen[i]!.text}" are within 3px of each other`)
        .toBeGreaterThanOrEqual(3);
    }
  }, 30_000);
});
