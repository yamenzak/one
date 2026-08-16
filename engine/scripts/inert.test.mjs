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
 * ⚠️ AND THE INERTNESS IS A FACT ABOUT `apps.json`, NOT A HABIT. `deploy.yml`,
 * `ci.yml` and `provision.yml` derive every app they touch from that registry.
 * One is absent from it, which is what makes it unreachable by all three — so
 * the day somebody "tidily" registers One there, the production deploy workflow
 * gains a new app and this check is what says so.
 */

import { readFileSync, existsSync } from "node:fs";
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
       `       deploy.yml derives its app list from that file, so this puts the\n` +
       `       framework on the production deploy path beside a live tenant.`);
} else {
  ok(`registry: apps.json names nothing under engine/, so deploy.yml cannot select it`);
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

console.log(bad
  ? `\ninert: ${bad} finding(s) — the engine can reach the live deployment.`
  : `\ninert: the engine is off the production deploy path, and shares no name with it.`);
process.exit(bad ? 1 : 0);
