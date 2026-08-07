/**
 * "The published plan" is never a question a plan list can answer alone.
 *
 * A client runs one published plan PER LANE, so picking one without the lane
 * takes whichever the server returned first. Four surfaces shipped that way —
 * `MealPlanDrawer`, `TodayAgenda`, `WorkoutPlayer`, `PlanHistorySheet` — while
 * `Eat` and `Train` filtered correctly, which is exactly what made it so hard
 * to see: the summary card named the right plan and the drawer you opened from
 * it showed a different lane's meals.
 *
 * So this is a lint, not a unit test. `lanes.ts` has the rule; this makes
 * writing it out by hand a test failure, because the next person to add a plan
 * surface will reach for `plans.find((p) => p.status === "published")` — it is
 * the obvious line, and it is wrong.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { publishedInLane, supersededInLane, laneOf } from "./lanes.js";

const HERE = new URL(".", import.meta.url).pathname;

/** Every source file on the client surfaces, minus this test and the rule. */
function clientSources(): { name: string; body: string }[] {
  return readdirSync(HERE)
    .filter((f) => (f.endsWith(".tsx") || f.endsWith(".ts")) && !f.includes(".test.") && f !== "lanes.ts")
    .map((name) => ({ name, body: readFileSync(join(HERE, name), "utf8") }));
}

/** Comments describe the trap; they must not be mistaken for it. */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the lane rule", () => {
  it("picks the published plan in the given lane, and nothing from another", () => {
    const plans = [
      { id: "a", status: "published", variantId: null },
      { id: "b", status: "published", variantId: "lane2" },
      { id: "c", status: "draft", variantId: "lane2" },
    ];
    expect(publishedInLane(plans, null)?.id).toBe("a");
    expect(publishedInLane(plans, "lane2")?.id).toBe("b");
    // The state that was being papered over: a lane with nothing published is
    // "no plan in this lane", never another lane's plan.
    expect(publishedInLane(plans, "lane3")).toBeNull();
  });

  it("treats an absent variantId as the default lane", () => {
    expect(laneOf({ status: "published" })).toBeNull();
    expect(publishedInLane([{ status: "published" }], null)).not.toBeNull();
  });

  it("scopes history to the lane — another lane's superseded plan is not this lane's past", () => {
    const plans = [
      { id: "old-main", status: "superseded", variantId: null },
      { id: "old-two", status: "superseded", variantId: "lane2" },
    ];
    expect(supersededInLane(plans, null).map((p) => p.id)).toEqual(["old-main"]);
    expect(supersededInLane(plans, "lane2").map((p) => p.id)).toEqual(["old-two"]);
  });

  /**
   * The lint. A file may compare a plan's status to "published"/"superseded"
   * for DISPLAY (a badge, a tone) — what it may not do is SELECT a plan that
   * way. Selection is `.find(...)` / `.filter(...)`, so that is what this looks
   * for, and `lanes.ts`'s helpers are the sanctioned spelling.
   */
  it("no client surface selects a plan by status alone", () => {
    const select = /\.(find|filter)\(\s*\(?\s*\w+\)?\s*=>\s*[^)]*\.status\s*===\s*"(published|superseded)"/;
    const offenders = clientSources()
      .filter(({ body }) => {
        const src = stripComments(body);
        const m = select.exec(src);
        if (!m) return false;
        // A selection that also names the lane in the same predicate is fine —
        // it is the rule inlined rather than skipped.
        return !/variantId/.test(m[0]);
      })
      .map(({ name }) => name);

    expect(
      offenders,
      `these pick a plan by status without its lane — use publishedInLane / supersededInLane from lanes.ts:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("still scans the files it is meant to", () => {
    const names = clientSources().map((f) => f.name);
    // If a rename empties the sweep, the lint above passes vacuously.
    for (const f of ["MealPlanDrawer.tsx", "TodayAgenda.tsx", "WorkoutPlayer.tsx", "PlanHistorySheet.tsx", "Eat.tsx", "Train.tsx"]) {
      expect(names, `${f} is missing — did it move? The lint is now blind to it.`).toContain(f);
    }
  });
});
