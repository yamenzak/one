/**
 * THE TWO TEST LANES, AND THE SUFFIX THAT KEEPS THEM APART.
 *
 * ⚠️ A BROWSER-BACKED SUITE COSTS MORE THAN EVERYTHING ELSE PUT TOGETHER, AND
 * ANSWERS A DIFFERENT QUESTION. It renders the shipped stylesheet in real
 * Chromium and asserts pixels — where a row wraps, how tall a control is,
 * whether a ground actually moves. Nothing static can ask any of that, which is
 * why they exist; and none of their answers is "the deployment boots", which is
 * the only question a deploy gate is asking. So they are `*.seen.test.*`, they
 * run in `pnpm engine:seen`, and CI opens no browser at all.
 *
 * ⚠️ THE WHOLE ARRANGEMENT IS A FILENAME, WHICH IS WHY IT NEEDS A GUARD. A
 * geometry suite written without the suffix lands back in the fast lane and
 * nothing says so — the tests pass, the run is simply minutes longer, and a
 * deploy gets slow again by a route nobody chose. That is how it got slow the
 * first time.
 *
 * ⚠️ AND THE OTHER DIRECTION IS WORSE: A LANE NOBODY RUNS. A package holding a
 * `.seen.` file with no `seen` script has quietly deleted those tests — they are
 * excluded from `test` by name and reachable by no command. Both halves are
 * checked here.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");
const ROOT = join(ENGINE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/**
 * ⚠️ NOTHING HERE STRIPS COMMENTS, AND THAT IS DELIBERATE. A glob contains `/*`
 * — `"**\/*.screens.test.tsx"` opens a block comment the moment a stripper reads
 * it, and everything to the next `*\/` disappears. The first version of this
 * file did strip, and it read one config's exclude list as running to the
 * middle of its Miniflare bindings. The subjects below are a launch call and an
 * array of globs; neither is plausible inside prose.
 */

/* ---------------------------------------------------------------- the corpus --- */

/** Every test file under `engine/`, with the package that holds it. */
const tests = [];
const packages = new Map(); // dir → package.json

const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (e.name === "package.json") {
      try { packages.set(dir, JSON.parse(readFileSync(p, "utf8"))); } catch { /* not ours */ }
      continue;
    }
    if (/\.test\.[cm]?[jt]sx?$/.test(e.name)) tests.push(p);
  }
};
walk(ENGINE);

/** The package a file belongs to: the nearest ancestor with a `package.json`. */
const packageOf = (file) => {
  let at = dirname(file);
  while (at.startsWith(ENGINE)) {
    if (packages.has(at)) return at;
    at = dirname(at);
  }
  return null;
};

/* ⚠️ A BROWSER IS A LAUNCH, NOT AN IMPORT. `design/src/measure` names
   playwright in a `import type`, which costs nothing and runs nothing — a rule
   keyed on the word would sweep the pure suites that measure the STYLESHEET into
   the slow lane and prove the split works by emptying the fast one. */
const LAUNCHES = /\b(?:chromium|firefox|webkit)\s*\.\s*launch\s*\(|\blaunchBrowser\s*\(|\bopenBrowser\s*\(/;

const opens = tests.filter((p) => LAUNCHES.test(readFileSync(p, "utf8")));
const named = tests.filter((p) => /\.seen\.test\./.test(p));

if (!tests.length) {
  fail("seen: walked engine/ and found no test files at all — this guard sees nothing.");
} else if (!opens.length) {
  fail(`seen: none of ${tests.length} test file(s) launches a browser.\n`
    + "       Either the geometry suites are gone, or the launch moved behind a helper this\n"
    + "       guard cannot see. Either way the split below is passing over nothing.");
} else {
  ok(`corpus: ${tests.length} test file(s), ${opens.length} of them open a browser`);
}

/* ------------------------------------ a browser test is named for its lane --- */

{
  const wrong = opens.filter((p) => !/\.seen\.test\./.test(p));
  if (wrong.length) {
    fail(`seen: ${wrong.length} suite(s) launch a browser without the \`.seen.\` suffix:\n`
      + wrong.map((p) => `         ${relative(ROOT, p)}`).join("\n") + "\n"
      + "       Rename to `<name>.seen.test.tsx`. Without it the file runs in `pnpm engine:test`,\n"
      + "       which is what a deploy waits for — and the whole cost of a browser lands back in\n"
      + "       front of shipping, silently, because the tests still pass.");
  } else {
    ok(`lane: all ${opens.length} browser suite(s) carry the \`.seen.\` suffix`);
  }
}

/* ---------------------------------- ...and nothing else does, so it is real --- */

{
  const idle = named.filter((p) => !opens.includes(p));
  if (idle.length) {
    fail(`seen: ${idle.length} \`.seen.\` file(s) open no browser:\n`
      + idle.map((p) => `         ${relative(ROOT, p)}`).join("\n") + "\n"
      + "       The suffix means \"this needs Chromium and therefore does not gate a deploy\".\n"
      + "       A suite that does not need one is being kept out of CI for no reason — rename it\n"
      + "       back and let the gate run it.");
  } else {
    ok(`honest: no \`.seen.\` file that could have run in the fast lane`);
  }
}

/* --------------------------------- every package with one can actually run it --- */

const holders = [...new Set(named.map(packageOf).filter(Boolean))];

{
  const broken = [];
  for (const dir of holders) {
    const pkg = packages.get(dir);
    const where = relative(ROOT, dir);
    if (!pkg.scripts?.seen) {
      broken.push(`${where}: holds a \`.seen.\` suite and has no \`seen\` script`);
      continue;
    }
    if (!existsSync(join(dir, "vitest.seen.config.ts"))) {
      broken.push(`${where}: has a \`seen\` script and no \`vitest.seen.config.ts\``);
    }
  }
  if (broken.length) {
    fail(`seen: ${broken.length} package(s) cannot run the lane they were put in:\n`
      + broken.map((s) => `         ${s}`).join("\n") + "\n"
      + "       A `.seen.` file with nothing to run it is a deleted test: excluded from `test` by\n"
      + "       name, reachable by no command, and green for ever.");
  } else {
    ok(`runnable: ${holders.length} package(s) hold browser suites, each with a \`seen\` script`);
  }
}

/* --------------------------- ...and `test` in those packages does NOT run them --- */

/**
 * ⚠️ THE EXCLUSION IS PER CONFIG, AND A PACKAGE CAN HAVE THREE. `apps/hello`
 * runs a Workers-pool config and a screens config from one `test` script; a
 * `.seen.` file left in either one is the whole cost back in front of the
 * deploy, and the second config is the one nobody remembers.
 *
 * ⚠️ THE GLOBS ARE RUN, NOT READ. A check that looked for the word `seen` in a
 * config would be satisfied by this paragraph. What decides it is whether the
 * config's own include/exclude, applied to the real filenames, matches.
 */
/**
 * ⚠️ EXTGLOB, NOT JUST STARS — vitest's own default include is
 * `**\/*.{test,spec}.?(c|m)[jt]s?(x)`, and a translator that read `?(x)` as "one
 * character then a literal (x)" matches nothing at all. A rule that matches
 * nothing reports every config as clean, which is this check passing by being
 * broken. It was, on the first run.
 */
const globRx = (glob) => {
  let out = "";
  const quantifier = [];
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if ("?*+@!".includes(c) && glob[i + 1] === "(") {
      out += "(";
      quantifier.push(c === "?" ? "?" : c === "*" ? "*" : c === "+" ? "+" : "");
      i++;
    } else if (c === "(" || c === "{") { out += "("; quantifier.push(""); }
    else if (c === ")" || c === "}") { out += `)${quantifier.pop() ?? ""}`; }
    else if (c === "," || c === "|") out += "|";
    else if (c === "[") {
      /* A character class is already regex — pass it through whole. */
      const end = glob.indexOf("]", i + 1);
      if (end < 0) { out += "\\["; continue; }
      out += glob.slice(i, end + 1);
      i = end;
    } else if (c === "*") {
      if (glob[i + 1] === "*") { out += ".*"; i++; if (glob[i + 1] === "/") i++; }
      else out += "[^/]*";
    } else if (c === "?") out += "[^/]";
    else out += c.replace(/[.+^$\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
};

/* ⚠️ THE TRANSLATOR IS CHECKED BEFORE IT IS TRUSTED, for the reason above: it
   fails by matching nothing, and matching nothing is indistinguishable from a
   clean repository. */
for (const [glob, hit, miss] of [
  ["**/*.{test,spec}.?(c|m)[jt]s?(x)", "test/geometry.seen.test.tsx", "src/index.ts"],
  ["test/**/*.test.ts?(x)", "test/geometry.seen.test.tsx", "test/notes.md"],
  ["**/*.seen.test.*", "test/a/b.seen.test.tsx", "test/a/b.test.tsx"],
  ["**/node_modules/**", "node_modules/x/y.test.js", "test/x.test.ts"],
]) {
  if (!globRx(glob).test(hit) || globRx(glob).test(miss)) {
    fail(`seen: the glob translator is wrong about \`${glob}\`.\n`
      + "       It fails by matching NOTHING, which reads as every config being clean.");
  }
}

/* Vitest's own defaults, for a config that names neither. */
const DEFAULT_INCLUDE = ["**/*.{test,spec}.?(c|m)[jt]s?(x)"];
const DEFAULT_EXCLUDE = ["**/node_modules/**", "**/dist/**"];

const listOf = (src, key) => {
  const m = new RegExp(`\\b${key}:\\s*\\[([^\\]]*)\\]`).exec(src);
  if (!m) return null;
  return [...m[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((x) => x[1]);
};

{
  const leaks = [];
  let configs = 0;
  for (const dir of holders) {
    const mine = named.filter((p) => packageOf(p) === dir)
      .map((p) => relative(dir, p).split("\\").join("/"));
    for (const f of readdirSync(dir)) {
      if (!/^vitest(\..+)?\.config\.ts$/.test(f)) continue;
      if (f === "vitest.seen.config.ts") continue;
      /* The shots config photographs; it is its own command and gates nothing. */
      if (f === "vitest.shots.config.ts") continue;
      configs++;
      const src = readFileSync(join(dir, f), "utf8");
      const include = listOf(src, "include") ?? DEFAULT_INCLUDE;
      const exclude = listOf(src, "exclude") ?? DEFAULT_EXCLUDE;
      const inc = include.map(globRx);
      const exc = exclude.map(globRx);
      for (const rel of mine) {
        if (!inc.some((r) => r.test(rel))) continue;
        if (exc.some((r) => r.test(rel))) continue;
        leaks.push(`${relative(ROOT, join(dir, f))} still runs ${rel}`);
      }
    }
  }

  if (!configs) {
    fail("seen: found no `test` config in any package holding a browser suite — nothing checked.");
  } else if (leaks.length) {
    fail(`seen: ${leaks.length} browser suite(s) are still in the fast lane:\n`
      + leaks.map((s) => `         ${s}`).join("\n") + "\n"
      + "       Add `\"**/*.seen.test.*\"` to that config's `exclude`. Named but not excluded is\n"
      + "       the worst of both: the deploy pays for the browser AND `pnpm engine:seen` runs it\n"
      + "       a second time.");
  } else {
    ok(`excluded: ${configs} \`test\` config(s) across ${holders.length} package(s), none of `
      + "which picks up a `.seen.` file");
  }
}

/* ------------------------------------------ one command runs the whole lane --- */

{
  const root = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const turbo = readFileSync(join(ROOT, "turbo.json"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  const script = root.scripts?.["engine:seen"] ?? "";

  if (!script) {
    fail("package.json: no `engine:seen`.\n"
      + "       Every browser suite is excluded from `test` by name, so without one command that\n"
      + "       runs them all, they are found by whoever happens to remember the per-package\n"
      + "       script — which over a month is nobody.");
  } else if (!/\brun seen\b/.test(script)) {
    fail(`package.json: \`engine:seen\` does not run the \`seen\` task (${script}).`);
  } else if (!/"seen"\s*:\s*\{/.test(turbo)) {
    fail("turbo.json: no `seen` task.\n"
      + "       Turbo ignores a task it has no definition for, silently, so `engine:seen` would\n"
      + "       report success having run nothing.");
  } else if (!/"seen"\s*:\s*\{[^}]*"dependsOn"[^}]*@engine\/space#build/.test(turbo)) {
    fail("turbo.json: the `seen` task does not depend on `@engine/space#build`.\n"
      + "       These are the suites that measure real geometry against the CSS that SHIPS. An\n"
      + "       `assets.directory` is a filesystem path, not a package dependency — without the\n"
      + "       edge they measure whichever build was lying around, and stay green doing it.");
  } else {
    ok("command: `pnpm engine:seen` runs a real turbo task, built against the shipped stylesheet");
  }
}

/* ---------------------------------------- and the deploy gate opens no browser --- */

/**
 * ⚠️ THIS IS THE POINT OF THE WHOLE FILE, SO IT IS ASSERTED RATHER THAN TRUSTED.
 * The split saves nothing the moment CI installs Chromium again — and it would
 * be reinstalled by somebody fixing a red run, in one line, for a reason that
 * looked good at the time.
 */
{
  const yml = readFileSync(join(ROOT, ".github", "workflows", "engine.yml"), "utf8")
    .replace(/^\s*#.*$/gm, "");
  const installs = /playwright install/.test(yml);
  const runs = /\brun seen\b|engine:seen/.test(yml);

  if (installs || runs) {
    fail(".github/workflows/engine.yml: the deploy gate "
      + `${installs ? "installs a browser" : ""}${installs && runs ? " and " : ""}`
      + `${runs ? "runs the browser lane" : ""}.\n`
      + "       A browser answers whether a screen LOOKS right, which is worth asking and is not\n"
      + "       what a deploy is waiting to know. It is also ~400 MB, its system libraries, and\n"
      + "       more minutes than every other check in this repository combined.");
  } else if (!/turbo run test/.test(yml)) {
    fail(".github/workflows/engine.yml: the gate no longer runs the fast test lane either.\n"
      + "       Splitting the browser out is only correct while the rest still runs.");
  } else {
    ok("gate: CI runs the fast lane and opens no browser");
  }
}

console.log(bad
  ? `\nseen: ${bad} finding(s) — the two test lanes are not where they say they are.`
  : `\nseen: ${opens.length} browser suite(s), all in their own lane, all runnable, none in CI.`);
process.exit(bad ? 1 : 0);
