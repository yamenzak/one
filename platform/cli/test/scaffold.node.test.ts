/**
 * THE TEMPLATE, HELD TO THE PLATFORM IT SCAFFOLDS.
 *
 * ⚠️ A TEMPLATE ROTS SILENTLY AND IN ONE DIRECTION. The platform gains a
 * required field, a schema module, a wired capability — and the template keeps
 * emitting what it emitted last year. Nothing fails: the generated app compiles,
 * boots, and is missing exactly the thing that was added since anybody last
 * looked at it. Every audit this repository has run found that shape.
 *
 * So the checks here read the PLATFORM and compare, rather than describing what
 * the template ought to contain. A list of expected strings would be a second
 * copy of the template, and it would rot beside it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
/*
  ⚠️ IMPORTED AS PLAIN JAVASCRIPT, on purpose. The CLI has to run in a fresh
  checkout before anything is installed or built, so it cannot be TypeScript —
  and `allowJs` is what lets this suite read it without a build step of its own.
*/
import { filesFor, idProblem } from "../src/scaffold.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const files = filesFor("demo") as Record<string, string>;
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/* ------------------------------------------------------------------- id --- */

describe("the app id", () => {
  /*
    ⚠️ IT IS A DNS LABEL AND A PACKAGE NAME AND A HOST AT ONCE, and it is not
    renameable: it is the relying party's subdomain, the value stamped into every
    payment object, and the directory every module ids itself from.
  */
  it("refuses anything that is not a DNS label", () => {
    for (const bad of ["A", "-x", "x-", "x", "with space", "with_underscore", "x".repeat(40)]) {
      expect(idProblem(bad), bad).toBeTruthy();
    }
    expect(idProblem("clinic")).toBeNull();
    expect(idProblem("north-clinic")).toBeNull();
  });

  it("refuses a door and a platform package", () => {
    for (const taken of ["admin", "setup", "kernel", "runtime", "ui"]) expect(idProblem(taken), taken).toBeTruthy();
  });
});

/* ------------------------------------------------------------- day zero --- */

describe("the generated manifest keeps up with the manifest type", () => {
  /*
    ⚠️ READ FROM `AppSpec` ITSELF. Every field on it is one MANIFEST.md §9 marks
    day-zero: each implies a column, a table or a legal record that cannot be
    applied retroactively. A template missing one produces an app that needs a
    migration rather than an edit — and the whole reason to generate a manifest
    is that nobody has to know which those are.
  */
  const app = read("kernel/src/app.ts");
  const body = /export interface AppSpec<[^]*?^}/m.exec(app)![0];
  const required = [...body.matchAll(/^\s{2}readonly (\w+)[?]?:/gm)]
    .filter((m) => !m[0].includes("?:"))
    .map((m) => m[1]!);

  it("sets every required field", () => {
    expect(required.length).toBeGreaterThan(10);
    const manifest = files["src/manifest.ts"]!;
    /* Shorthand counts: `bindings,` is the same declaration as `bindings: bindings`. */
    const missing = required.filter((field) => !new RegExp(`(^|[\\s{,])${field}\\s*[:,]`, "m").test(manifest));
    expect(missing, "AppSpec requires these and the template does not set them").toEqual([]);
  });
});

/* --------------------------------------------------------------- modules --- */

describe("the generated worker composes what the platform exports", () => {
  /*
    ⚠️ A MISSING SCHEMA MODULE IS A TABLE THAT IS NEVER CREATED, so the feature
    above it fails at the first request that reaches it — which for an inbox, a
    dead letter or a maintenance switch is a request nobody makes for weeks.
    Compared against what the runtime EXPORTS rather than against a list, so a
    module added to the platform is a red run here until it is mounted.
  */
  const index = read("runtime/src/index.ts");
  const sources = [...index.matchAll(/from "\.\/([\w-]+)\.js"/g)].map((m) => m[1]!);
  const modules = sources.flatMap((f) => [...read(`runtime/src/${f}.ts`).matchAll(/export const (\w+_SCHEMA)\b/g)].map((m) => m[1]!));

  it("mounts every schema module the runtime ships", () => {
    expect(modules.length).toBeGreaterThan(5);
    /*
      ⚠️ THE MOUNTED ARRAYS, NOT THE FILE. A module that is imported and never
      composed is the exact failure this check exists for — the name is present,
      the reader sees it, and the table is never created. Searching the whole
      file would find the import and call it mounted.
    */
    const worker = files["src/worker.ts"]!;
    const mounted = [...worker.matchAll(/_MODULES = \[([^\]]*)\]/g)].map((m) => m[1]!).join(",");
    expect(mounted).not.toBe("");
    expect(modules.filter((name) => !mounted.includes(name))).toEqual([]);
  });

  it("names the ones the app derives for itself, so erasure and export cover them", () => {
    expect(files["src/worker.ts"]).toContain("regionalModules: REGIONAL_MODULES");
    expect(files["src/worker.ts"]).toContain("derived.module");
  });
});

/* ---------------------------------------------------------------- shape --- */

describe("what a new app arrives with", () => {
  it("has the files a package in this workspace needs", () => {
    for (const path of ["package.json", "tsconfig.json", "vitest.config.ts", "vitest.node.config.ts", "src/manifest.ts", "src/worker.ts"]) {
      expect(Object.keys(files), path).toContain(path);
    }
  });

  /*
    ⚠️ THE LOCK SHIPS EMPTY RATHER THAN ABSENT. A guard refuses an app that has
    none, and an app whose first commit adds one later has a window where a
    removal is invisible — which is the window a new app does most of its
    renaming in.
  */
  it("ships a manifest lock from the first commit", () => {
    expect(files["manifest.lock.json"]).toBe("{}\n");
    expect(files["test/manifest.node.test.ts"]).toContain("removals(");
  });

  it("declares every event the platform's own operations raise", () => {
    for (const type of ["workspace.created", "plan.chosen", "package.granted"]) {
      expect(files["src/manifest.ts"], type).toContain(`"${type}"`);
    }
  });

  it("refuses to overwrite, so a manifest somebody wrote cannot be replaced", () => {
    expect(read("cli/src/one.mjs")).toContain("already exists");
  });
});
