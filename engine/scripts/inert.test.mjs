/**
 * ENGINE CANNOT REACH THE PRODUCTION DEPLOYMENT, AND NOTHING IT BINDS IS
 * SOMETHING KOVA BINDS.
 *
 * ⚠️ ONE PRODUCTION TENANT IS LIVE ON THE LEGACY TREE WHILE THIS IS BUILT, AND
 * THE TWO SHARE A CLOUDFLARE ACCOUNT. That is the whole risk: not that the code
 * is wrong, but that a name collides. It has happened once already in this
 * repository — provisioning matched a KV namespace by title SUFFIX, `kova-CACHE`
 * and `tessa-CACHE` both end in `CACHE`, it took the first hit, and Kova's cache
 * pointed at Tessa's namespace. Nothing failed. Nothing said anything.
 *
 * ⚠️ AND THE REGISTRY CHECK OUTLIVED THE WORKFLOWS THAT READ IT. `apps.json` was
 * how `deploy.yml`, `ci.yml` and `provision.yml` chose what to ship; all three
 * are deleted, and the legacy tree is frozen. The check stays because the
 * registry is what any future pipeline over `apps/` would read first, and One
 * appearing in it is the one edit that would put the framework back on a shared
 * deploy path beside a live tenant.
 *
 * ⚠️ THE OTHER FOUR ARE THE ONES DOING THE WORK NOW. A worker name and a D1 name
 * are account-wide, and One serves `*.${ROOT}` — so a name collision or a wrong
 * ROOT reaches Kova's deployment whatever any workflow says. Nothing else is
 * watching that account any more.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { databases } from "./bind-ids.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const CONFIG = join(HERE, "..", "one", "wrangler.jsonc");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const config = readFileSync(CONFIG, "utf8");
const worker = /"name"\s*:\s*"([^"]+)"/.exec(config)?.[1] ?? "";
const root = /"ROOT"\s*:\s*"([^"]+)"/.exec(config)?.[1] ?? "";

/* -------------------------------------------------------- out of the registry --- */

const registryPath = join(ROOT, "apps.json");
const registry = JSON.parse(
  readFileSync(registryPath, "utf8").replace(/^\s*\/\/.*$/gm, ""),
);
const apps = registry.apps ?? [];

const registered = apps.filter((a) => (a.dir ?? "").startsWith("engine/"));
if (registered.length) {
  fail(`apps.json registers ${registered.map((a) => a.id).join(", ")} under engine/.\n` +
       `       That registry is what a pipeline over the frozen tree reads first,\n` +
       `       so this is the edit that puts the framework back on a shared deploy\n` +
       `       path beside a live tenant.`);
} else {
  ok(`registry: apps.json names nothing under engine/, so no pipeline over it can select One`);
}

/* ---------------------------------------------------------- no shared names --- */

/**
 * ⚠️ WORKER NAMES ARE ACCOUNT-WIDE. Two configs with one `name` are not two
 * workers — the second deploy REPLACES the first, and the only symptom is the
 * production product serving somebody else's code.
 */
const legacyWorkers = new Set();
for (const a of apps) {
  const at = join(ROOT, a.dir ?? "", "wrangler.jsonc");
  if (!existsSync(at)) continue;
  const name = /"name"\s*:\s*"([^"]+)"/.exec(readFileSync(at, "utf8"))?.[1];
  if (name) legacyWorkers.add(name);
}

/*
  ⚠️ A `scheduled` HANDLER WITH NO TRIGGER NEVER RUNS, AND NOTHING ANYWHERE
  SAYS SO. It compiles, it typechecks, its tests drive it directly and pass —
  and Cloudflare calls it exactly never, because the two halves live in
  different files and only one of them is code. The one thing this deployment's
  sweep does is destroy the records of a workspace past the ladder's last rung,
  so the failure is a legal obligation quietly not being met behind a green run.
*/
const declared = readFileSync(CONFIG, "utf8");
const handles = /async scheduled\s*\(/.test(readFileSync(join(HERE, "..", "one", "src", "index.ts"), "utf8"));
const triggered = /"crons"\s*:\s*\[\s*"/.test(declared);
if (handles && !triggered) {
  fail(`engine/one/wrangler.jsonc declares no triggers.crons and the worker has a scheduled handler.\n` +
       `       It compiles, it is tested, and Cloudflare calls it never — so nothing is ever erased.`);
} else if (triggered && !handles) {
  fail(`engine/one/wrangler.jsonc schedules a run and the worker has no scheduled handler.`);
} else if (handles) {
  ok(`clock: the sweep has a handler and a trigger`);
}

if (!worker) {
  fail(`engine/one/wrangler.jsonc declares no worker name.`);
} else if (legacyWorkers.has(worker)) {
  fail(`the worker is called "${worker}", and so is a registered app's.\n` +
       `       A worker name is account-wide: the second deploy REPLACES the first.`);
} else {
  ok(`worker: "${worker}" collides with none of ${[...legacyWorkers].join(", ")}`);
}

/**
 * ⚠️ AND A DATABASE NAME IS HOW PROVISIONING FINDS ONE. A shared name means a
 * find-or-create on either side hands back the other's database — which is not
 * an outage, it is one product reading another's rows.
 */
const legacyD1 = new Set(apps.map((a) => a.provision?.d1).filter(Boolean));
const mine = databases(config).map((d) => d.name);
const clash = mine.filter((n) => legacyD1.has(n));
if (clash.length) {
  fail(`D1 name(s) ${clash.join(", ")} are also a registered app's.\n` +
       `       Provisioning finds a database BY NAME, so either side's run can\n` +
       `       hand back the other's.`);
} else {
  ok(`d1: ${mine.join(", ")} collide with none of ${[...legacyD1].join(", ")}`);
}

/* ------------------------------------------------------------- no shared door --- */

/**
 * ⚠️ THE ROUTE IS THE COLLISION NOBODY SEES COMING. One's doors are
 * `<label>.<ROOT>`, so One needs `*.<ROOT>/*`. Kova's tenants live at
 * `<slug>.kova.4dl.app`. If ROOT were the apex, One's wildcard would cover every
 * one of them — and route precedence, not intent, would decide who answers a
 * paying customer's address.
 */
const legacyRoots = new Set();
for (const a of apps) {
  const at = join(ROOT, a.dir ?? "", "wrangler.jsonc");
  if (!existsSync(at)) continue;
  for (const [, pattern] of readFileSync(at, "utf8").matchAll(/"pattern"\s*:\s*"([^"]+)"/g)) {
    legacyRoots.add(pattern.replace(/^\*\./, "").replace(/\/\*$/, ""));
  }
}

if (!root) {
  fail(`engine/one/wrangler.jsonc sets no ROOT — every hostname would classify as no door.`);
} else if (root === "localhost" || root.endsWith(".localhost")) {
  fail(`ROOT is "${root}" in the DEPLOYED config. Every real hostname would be no\n` +
       `       door at all, and every request a 404. Local values go in .dev.vars.`);
} else {
  /* One's wildcard must not cover, and must not be covered by, a legacy root. */
  const overlap = [...legacyRoots].filter((r) => r === root || r.endsWith(`.${root}`) || root.endsWith(`.${r}`));
  if (overlap.length) {
    fail(`ROOT "${root}" overlaps the live route(s) ${overlap.join(", ")}.\n` +
         `       One serves *.\${ROOT}, so its wildcard would match a production\n` +
         `       tenant's own address and route precedence would decide who answers.`);
  } else {
    ok(`doors: *.${root} overlaps none of ${[...legacyRoots].join(", ") || "(no declared routes)"}`);
  }
}

/* ------------------------------------------------------------------ turbo --- */

/*
  ⚠️ A TURBO TASK KEY NAMING A PACKAGE THAT DOES NOT EXIST IS IGNORED IN SILENCE,
  and the keys that matter most are exactly the ones nothing else can express: a
  worker's test suite depends on its SPA's BUILD, and turbo cannot infer it
  because an `assets.directory` is a filesystem path rather than a package
  dependency. Without the edge the suite boots Miniflare against a missing
  directory and aborts reporting "no tests" — a PASS-shaped result.

  ⚠️ AND THE ENGINE'S OWN EDGE NAMED A SCOPE THE RENAME RETIRED. It stayed
  invisible because a `dist` from some earlier build was always lying around, so
  the suite ran against whatever SPA had last been built — on a stale checkout, a
  different product than the one under test.
*/
{
  /*
    ⚠️ turbo.json IS JSONC AND ITS COMMENTS ARE LINE-ANCHORED, WHICH IS WHAT
    MAKES THIS SAFE. Stripping `/* … *\/` anywhere ate the `dist/**` in an
    `outputs` glob — a comment opener inside a string, which is the classic way a
    naive JSONC strip corrupts the document it is trying to read. Only whole
    lines are dropped.
  */
  const jsonc = readFileSync(join(ROOT, "turbo.json"), "utf8")
    .split("\n")
    .filter((line, i, all) => {
      if (/^\s*\/\//.test(line)) return false;
      const opened = all.slice(0, i + 1).filter((l) => /^\s*\/\*/.test(l)).length;
      const closed = all.slice(0, i).filter((l) => /\*\/\s*$/.test(l) && /^\s*(\/\*|\*|\/\/)/.test(l)).length;
      return opened <= closed;
    })
    .join("\n");
  const turbo = JSON.parse(jsonc);
  const names = new Set();
  const scan = (dir, depth = 0) => {
    if (depth > 3) return;
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === "node_modules") continue;
      const at = `${dir}/${e.name}`;
      const pkg = join(ROOT, at, "package.json");
      if (existsSync(pkg)) names.add(JSON.parse(readFileSync(pkg, "utf8")).name);
      scan(at, depth + 1);
    }
  };
  for (const root of ["apps", "packages", "engine"]) scan(root);

  const keys = Object.keys(turbo.tasks ?? turbo.pipeline ?? {}).filter((k) => k.includes("#"));
  const ghosts = [];
  for (const key of keys) {
    const owner = key.slice(0, key.indexOf("#"));
    const needs = (turbo.tasks ?? turbo.pipeline)[key]?.dependsOn ?? [];
    for (const named of [owner, ...needs.filter((d) => d.includes("#")).map((d) => d.slice(0, d.indexOf("#")))]) {
      if (!names.has(named)) ghosts.push(`${key} names ${named}`);
    }
  }

  if (ghosts.length) {
    fail(`turbo: ${ghosts.join("; ")} — turbo ignores a key for a package it does not have, so the edge is not there and nothing says so`);
  } else {
    ok(`turbo: all ${keys.length} package-scoped task key(s) name a package that exists`);
  }
}

console.log(bad
  ? `\ninert: ${bad} finding(s) — the engine can reach the live deployment.`
  : `\ninert: the engine is off the production deploy path, and shares no name with it.`);
process.exit(bad ? 1 : 0);
