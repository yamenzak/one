/**
 * ONE BLOCK, AND ALL FOUR OF THE THINGS THAT CAN BE TRUE OF IT.
 *
 * ⚠️ EVERY CASE HERE IS ONE A SCREEN HAS SHIPPED WRONG. An empty array drawn as
 * a confident fact while the request was still in flight; a failed load drawn as
 * "no media yet"; a control drawn for somebody who was never going to be allowed
 * to press it. They are the caller's job to wire today, which is exactly the
 * class of thing a caller forgets — so what this proves is that the wiring is no
 * longer anybody's to get wrong.
 *
 * ⚠️ AND THE ORDER IS MOST OF THE VALUE. Four outcomes with no stated precedence
 * is four screens that each pick a different one, and the ones that get picked
 * wrong are the ones nobody sees while building: in development the request is
 * instant and it succeeds.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PLATFORM_PROBLEMS, problem, type Bones } from "@engine/kernel";
import { BLOCKS } from "@engine/kernel";
import { Allowed, Region, ready, trouble, waiting } from "../src/index.js";

const NOTHING = { says: "Nothing on this shelf yet", under: "Put something on it" } as const;

const drawn = <T,>(
  of: Parameters<typeof Region<T>>[0]["of"],
  over: Partial<Parameters<typeof Region<T>>[0]> = {},
  may: Readonly<Record<string, "permission" | "entitlement" | "standing">> = {},
) => renderToStaticMarkup(
  <Allowed may={may}>
    <Region bones="rows" of={of} nothing={NOTHING} then={(d) => <p>{String(d)}</p>} {...over} />
  </Allowed>,
);

/* ------------------------------------------------------------- the outcomes --- */

describe("a region draws exactly one of four things", () => {
  it("draws the content when there is content", () => {
    expect(drawn(ready("eighteen litres"))).toContain("eighteen litres");
  });

  it("draws a skeleton while it is waiting, and never the empty state", () => {
    const html = drawn(waiting<string>());
    expect(html).not.toContain(NOTHING.says);
    expect(html, "a wait with nothing shaped like what is coming is a layout that jumps")
      .toContain('aria-label="Loading"');
  });

  /*
    ⚠️ THE FAILURE THAT READS AS A FACT. `catch(() => setItems([]))` turns a
    dropped request into "no media yet", and the person is told something about
    their data that is not true. Trouble outranks emptiness for that reason: a
    failed request has no data, and `[]` is what a naive reading of it produces.
  */
  it("draws trouble rather than emptiness when the request failed", () => {
    const html = drawn(trouble<string>(problem(PLATFORM_PROBLEMS, "platform.unavailable")));
    expect(html).not.toContain(NOTHING.says);
  });

  it("draws what emptiness MEANS, in the caller's own words", () => {
    const html = drawn(ready<readonly string[]>([]));
    expect(html).toContain(NOTHING.says);
    expect(html).toContain(NOTHING.under);
  });
});

/* ---------------------------------------------------------------- the gate --- */

/**
 * ⚠️ DENIED COMES FIRST, WHICH IS NOT THE ORDER `Await` USES. The other three
 * are about a request; this one is about whether there should be a request at
 * all. A skeleton followed by a refusal is a promise the screen breaks a second
 * later — and it is worse than the refusal alone, because somebody has already
 * started waiting for it.
 */
describe("a region that is not for this person says so first", () => {
  it("refuses before it draws a skeleton", () => {
    const html = drawn(waiting<string>(), { needs: "stock.list" }, { "stock.list": "permission" });
    expect(html, "a skeleton for something that will never arrive")
      .not.toContain('aria-label="Loading"');
    expect(html).toContain("Your role does not include this");
  });

  it("refuses before it draws the content, even when the content is there", () => {
    const html = drawn(ready("eighteen litres"), { needs: "stock.list" }, { "stock.list": "entitlement" });
    expect(html).not.toContain("eighteen litres");
    expect(html).toContain("Your plan does not include this");
  });

  /*
    ⚠️ EMPTY MEANS ALLOWED, WHICH IS THE ONLY SAFE DIRECTION FOR A SURFACE. The
    gate itself is the enforcement; drawing something the server will refuse
    costs a wasted press, while HIDING something the server would have allowed
    costs a feature somebody paid for and cannot find.
  */
  it("draws the content when no verdict says otherwise", () => {
    expect(drawn(ready("eighteen litres"), { needs: "stock.list" })).toContain("eighteen litres");
  });

  it("says nothing about a gate the region does not name", () => {
    expect(drawn(ready("eighteen litres"), {}, { "stock.list": "permission" }))
      .toContain("eighteen litres");
  });
});

/* --------------------------------------------------------------- the bones --- */

describe("every skeleton a block can name is one the frame can draw", () => {
  /*
    ⚠️ THE MAP IS EXHAUSTIVE BY TYPE AND ASSERTED ANYWAY, because the failure is
    not a type error at the call site — it is `SKELETON[bones]` returning
    undefined and the region drawing NOTHING while it waits. A wait with no
    skeleton looks like an empty screen, which is the outcome this component
    exists to stop being confused with.
  */
  /* ⚠️ EXHAUSTIVE BY THE COMPILER, NOT BY A LIST SOMEBODY MAINTAINS. A `Bones`
     name added to the union and not to this record is a type error in this file,
     so the sweep cannot narrow in silence — which is what an exported
     `readonly Bones[]` beside the union could not promise. */
  const EVERY: Readonly<Record<Bones, true>> = {
    rows: true, hero: true, figure: true, chart: true,
    tiles: true, table: true, form: true, text: true,
  };

  it.each(Object.keys(EVERY) as Bones[])("draws something for %s", (bones: Bones) => {
    expect(drawn(waiting<string>(), { bones })).not.toBe("");
  });

  it("is a name the frame knows, for every block in the registry", () => {
    for (const entry of Object.values(BLOCKS)) {
      expect(drawn(waiting<string>(), { bones: entry.bones }),
        `${entry.id} names "${entry.bones}" and the frame drew nothing for it`)
        .not.toBe("");
    }
  });
});
