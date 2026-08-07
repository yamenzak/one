/**
 * THE MOTION MAP IS A TABLE IN A MARKDOWN FILE. THIS MAKES IT EXECUTABLE.
 *
 * UI-LANGUAGE §7 carries a table naming, per component, its tier, its entrance
 * variant and its skeleton. It was written as documentation and never checked,
 * and by the time anyone looked SIX of its fifteen rows disagreed with the code:
 * `PageHeader` and `NavSidebar` had no motion at all, `StatCard` and
 * `GlanceStrip` declared no variant so an orchestrating parent had nothing to
 * hand them, `Collection` staggered its rows at a different speed from the same
 * rows in a `Group`, and `Tile` used `rowIn` while the table said `contentIn`.
 *
 * None of that is visible in a diff and none of it fails a test. It shows up
 * when two screens are photographed side by side and one of them settles
 * differently — which is precisely the "everything is consistent" this table
 * exists to promise.
 *
 * So the table is parsed, not read. Editing the doc without editing the code
 * fails here, and so does the reverse.
 *
 * ── Why source-reading rather than rendering ────────────────────────────────
 *
 * There is no DOM in this package's test environment, and a rendering test
 * would only prove the variant for the prop combination the test happened to
 * pass. The invariant is "this component declares this variant", which is a
 * property of the source.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOC = readFileSync(new URL("../../../UI-LANGUAGE.md", import.meta.url), "utf8");

/** Where each component in the table lives. A component the map names and this
 *  does not is a failure, not a skip — see the completeness test. */
const HOME: Record<string, string> = {
  Atmosphere: "layout.tsx",
  Anchor: "layout.tsx",
  Hero: "hero.tsx",
  PageHeader: "dashboard.tsx",
  Section: "layout.tsx",
  Group: "layout.tsx",
  Tile: "layout.tsx",
  TileGrid: "layout.tsx",
  Row: "layout.tsx",
  Collection: "collection.tsx",
  StatCard: "metrics.tsx",
  GlanceStrip: "metrics.tsx",
  AppBar: "shell.tsx",
  BottomTabs: "shell.tsx",
  NavRail: "shell.tsx",
  NavSidebar: "dashboard.tsx",
};

interface MapRow {
  components: string[];
  entrance: string[];
  skeleton: string[];
}

/**
 * Parse the §7 table.
 *
 * Only BACKTICKED names in a cell are treated as identifiers — the table
 * deliberately writes "charts" and "sheets, dialogs" in plain prose because
 * they are categories rather than components, and a parser that took them
 * literally would demand a `charts.tsx`.
 */
function parseMotionMap(): MapRow[] {
  const start = DOC.indexOf("### The map: which motion, which skeleton");
  expect(start, "§7's motion map is gone — this test has nothing to check").toBeGreaterThan(-1);
  /*
    Bounded by the next HEADING of any level, not by the next `##`. §7 carries
    several tables after this one and the first version swallowed them, which is
    how a row about form controls arrived here demanding to know where the
    component `<select>` lives.
  */
  const rest = DOC.slice(start + 1);
  const nextHeading = rest.search(/\n#{2,3} /);
  const section = nextHeading > 0 ? rest.slice(0, nextHeading) : rest;
  const ticked = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);

  return section
    .split("\n")
    .filter((l) => l.startsWith("|") && !l.includes("---") && !l.includes("| Component |"))
    .map((line) => {
      const cells = line.split("|").map((c) => c.trim());
      // | (empty) | component | tier | entrance | skeleton | (empty)
      return { components: ticked(cells[1] ?? ""), entrance: ticked(cells[3] ?? ""), skeleton: ticked(cells[4] ?? "") };
    })
    .filter((r) => r.components.length > 0);
}

const ROWS = parseMotionMap();
const src = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
/** The code, without the prose — a variant NAMED in a comment is not a use. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * Just ONE component's source, not the whole file.
 *
 * The first version of this test checked the file, and it passed on a row that
 * was wrong: `Section`, `Card` and `Tile` share `layout.tsx`, the row claimed
 * `contentIn` for all three, `Section` uses it — so the file contained the
 * string and `Tile` (which actually uses `rowIn`) was never checked at all. A
 * file-level match makes every crowded module a blind spot.
 */
function declarationOf(file: string, name: string): string {
  const s = code(src(file));
  const starts = [
    `export function ${name}(`,
    `export function ${name}<`,
    `export const ${name} =`,
    `const ${name}Base = forwardRef`,
    `export const ${name} = forwardRef`,
  ];
  const at = starts.map((p) => s.indexOf(p)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  expect(at, `${name} is not declared in ${file} in a shape this test recognises`).toBeGreaterThan(-1);
  // Up to the next TOP-LEVEL declaration, so nested helpers stay inside.
  const rest = s.slice(at! + 1);
  const nextRel = rest.search(/\n(?:export )?(?:function|const|interface|type|class) /);
  return nextRel > 0 ? rest.slice(0, nextRel) : rest;
}

describe("§7's motion map is the code's, not the doc's alone", () => {
  it("finds a table with every tier in it", () => {
    // A parse that silently matched nothing would make every test below vacuous.
    expect(ROWS.length).toBeGreaterThanOrEqual(8);
    const named = ROWS.flatMap((r) => r.components);
    for (const must of ["Anchor", "Row", "Section", "Collection", "AppBar"]) {
      expect(named, `${must} fell out of the map`).toContain(must);
    }
  });

  it("names a home for every component it lists", () => {
    for (const c of ROWS.flatMap((r) => r.components)) {
      expect(HOME[c], `the map names ${c} and this test does not know where it lives`).toBeTruthy();
    }
  });

  for (const row of ROWS) {
    for (const component of row.components) {
      const file = HOME[component];
      if (!file || row.entrance.length === 0) continue;

      it(`${component} enters with ${row.entrance.join(" / ")}`, () => {
        /*
          EVERY variant the row names, not any one of them.

          `.some()` was the first spelling and it let a real regression through:
          `Collection`'s row reads "`rowStagger` list · `contentStagger` grid",
          and reverting the list to the block rhythm — the exact bug this pass
          fixed — left `contentStagger` in the file, so the check passed. A row
          that names two variants is asserting BOTH, which is what makes a
          two-mode component checkable at all.
        */
        const decl = declarationOf(file, component);
        for (const v of row.entrance) {
          expect(new RegExp(`\\b${v}\\b`).test(decl), `${component} does not use ${v} — the doc and the code disagree`).toBe(true);
        }
      });

      // A component whose row names a skeleton must be able to hand you one.
      // The map writes "—", "never" and "matches the body" for the rows that
      // correctly have none, and none of those is backticked.
      if (row.skeleton.length > 0) {
        it(`${component} ships a skeleton beside it`, () => {
          const s = src(file);
          const hasStatic = new RegExp(`${component}\\.Skeleton\\s*=`).test(s)
            || new RegExp(`Object\\.assign\\(${component}Base,\\s*\\{\\s*Skeleton`).test(s);
          expect(hasStatic, `${component}.Skeleton is not defined in ${file}; a screen has to guess which shape to use`).toBe(true);
        });
      }
    }
  }
});

describe("chrome does not shimmer", () => {
  /*
    §7: "Chrome never has a skeleton. It is not waiting for data; it is the
    frame the data arrives into. A shimmering nav rail says the app is broken."

    Worth a test rather than a sentence, because adding one is a natural
    instinct the first time a shell renders before its nav data resolves — and
    the right fix there is to render the nav, not to shimmer it.
  */
  const chrome = ROWS.filter((r) => r.entrance.includes("chromeIn"));

  it("covers the four chrome components", () => {
    expect(chrome.flatMap((r) => r.components).sort()).toEqual(["AppBar", "BottomTabs", "NavRail", "NavSidebar"]);
  });

  for (const row of chrome) {
    for (const c of row.components) {
      it(`${c} declares no skeleton`, () => {
        expect(row.skeleton, `the map gives ${c} a skeleton; chrome does not load`).toEqual([]);
        expect(src(HOME[c]!)).not.toMatch(new RegExp(`${c}\\.Skeleton\\s*=`));
      });
    }
  }
});

describe("something orchestrates, or none of it runs", () => {
  /*
    THE FAILURE THIS EXISTS FOR, and it shipped.

    §8's entrances are variant-driven: a component declares `contentIn` and an
    ANCESTOR hands it the label `"show"`. Kova's `Page` does that. The dashboard
    shell did NOT — so every screen in a dashboard app rendered with its motion
    inert. The same `Section`, `Row` and `Collection`, correctly declaring their
    variants, and simply never told to show. Two products built from one design
    system, one of which animated.

    A component-level test cannot see this: every component was correct. The
    invariant lives in the shells.
  */
  /*
    Scoped to the SHELL's own declaration, not to its file.

    A file-level match was the first spelling and it did not guard: deleting the
    content panel's orchestrator from `DashboardShell` left `NavSidebar`'s
    `initial="hidden" animate="show"` a few hundred lines up, the file still
    matched, and the test stayed green through the exact regression it exists
    to catch. Every crowded module is a blind spot to a file-level check —
    which is the second time that lesson has been paid for in this file.
  */
  const orchestrates = (file: string, component: string) => {
    const decl = declarationOf(file, component);
    return /initial="hidden"/.test(decl) && /animate="show"/.test(decl);
  };

  /*
    THREE orchestrators, and all three have to be one, because a screen picks
    whichever its app reaches for:

      `Screen`  (layout.tsx)     the four-tier spine — atmosphere, column, safe
                                 areas, `contentStagger`
      `Page`    (lib/motion.tsx) the plain container for everything off the
                                 spine, on `stagger`
      `DashboardShell`           the desk shell's content panel

    `stagger` and `contentStagger` differ only by a 20ms `delayChildren`, so the
    two phone-first wrappers settle at the same speed — that is checked here so
    they cannot drift apart into two rhythms nobody chose.
  */
  it("the four-tier screen orchestrates", () => {
    expect(orchestrates("layout.tsx", "Screen")).toBe(true);
    expect(declarationOf("layout.tsx", "Screen")).toContain("contentStagger");
  });

  it("the plain page wrapper orchestrates", () => {
    expect(orchestrates("lib/motion.tsx", "Page")).toBe(true);
    expect(declarationOf("lib/motion.tsx", "Page")).toContain("stagger");
  });

  it("the dashboard shell orchestrates its content panel", () => {
    expect(orchestrates("dashboard.tsx", "DashboardShell"), "screens in a dashboard app will render with their motion inert").toBe(true);
    expect(declarationOf("dashboard.tsx", "DashboardShell"), "the panel must stagger, not just fade as one block").toContain("contentStagger");
  });
});
