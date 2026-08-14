/**
 * EVERY DECLARATION REACHES A SURFACE (D12).
 *
 * ⚠️ THIS IS THE FAILURE THE WHOLE FRAMEWORK EXISTS TO PREVENT, and it is the
 * one that never goes red on its own. A previous platform shipped it
 * repeatedly: a notification registry with sixteen dispatch sites and no bell; a
 * schema applied, a Durable Object bound, rows being written, and no route to
 * reach any of it; an entitlement on a price list that nothing gated. Every one
 * of those passed every test, because a mechanism with no surface behaves
 * exactly like a mechanism nobody has used yet.
 *
 * ⚠️ SO THE CHECK IS AGAINST THE MANIFEST ITSELF. Every optional field on
 * `AppSpec` is a kind of declaration an app can make, and each one must either
 * name the module that renders it or say which stage owes it. A field added
 * without either fails here — the day it is added, rather than the day a
 * customer looks for it.
 *
 * ⚠️ AND A SHIPPED STAGE MAY OWE NOTHING, exactly as with the guard registry.
 * Without that the owed list is a place to put things so they stop being
 * mentioned.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const QUAD = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/**
 * ⚠️ THE RENDERER IS NAMED, AND SO IS THE SYMBOL IT EXPORTS. Naming only the
 * file lets a screen be gutted while the entry keeps promising it — the same way
 * a guard entry that names no assertion keeps promising a check somebody deleted.
 */
const SURFACES = {
  screens: { file: "web/src/shell.tsx", renders: "export function Shell" },
  settings: { file: "web/src/settings.tsx", renders: "export function Settings" },
  notifications: { file: "web/src/policy.tsx", renders: "export function NotificationPolicy" },
  flags: { file: "web/src/console.tsx", renders: "export function FlagConsole" },
  plans: { file: "web/src/console.tsx", renders: "export function Shelf" },
  entitlements: { file: "web/src/console.tsx", renders: "export function Shelf" },
  whitelabel: { file: "web/src/theme.ts", renders: "export function brandCss" },
  guide: { file: "web/src/guide.tsx", renders: "export function Guide" },
  milestones: { file: "web/src/guide.tsx", renders: "export function Milestones" },
  help: { file: "web/src/guide.tsx", renders: "export function Help" },

  packs: { file: "web/src/money.tsx", renders: "export function Wallet" },
  meters: { file: "web/src/money.tsx", renders: "export function Wallet" },
  jobs: { file: "web/src/money.tsx", renders: "export function Jobs" },

  /*
    ⚠️ OWED, WITH A STAGE. Each of these is a declaration an app can already
    make and a screen that does not exist yet — which is exactly the state this
    guard exists to keep visible rather than let anybody forget.
  */
  lanes: { file: "web/src/ai.tsx", renders: "export function AiLanes" },
  vault: { owed: "8" },
  purposes: { owed: "8" },
  documents: { owed: "8" },
  processors: { owed: "8" },

  /* Not a surface: an app's own refusal wording is rendered wherever the
     refusal is, which is every screen. */
  problems: { file: "runtime/src/serve.ts", renders: "asProblem" },
};

/* ------------------------------------------------ what an app may declare --- */

const manifest = readFileSync(join(QUAD, "kernel/src/manifest.ts"), "utf8");
const spec = manifest.match(/export interface AppSpec \{([\s\S]*?)\n\}/);
if (!spec) {
  fail("kernel/src/manifest.ts: cannot find AppSpec, so nothing here is checking anything");
}

const declared = [...(spec?.[1] ?? "").matchAll(/^\s*readonly (\w+)\??:/gm)].map((m) => m[1]);
/* The four every app must have and which are not a screen of their own. */
const CORE = ["id", "name", "mark", "access", "collections", "operations"];

let missing = 0;
for (const field of declared) {
  if (CORE.includes(field)) continue;
  const entry = SURFACES[field];
  if (!entry) {
    missing++;
    fail(`AppSpec.${field} is a declaration an app can make and nothing renders it (D12).\n` +
         `       Name its surface in scripts/surface.test.mjs, or owe it against a stage.`);
    continue;
  }
  if (entry.owed) continue;
  const path = join(QUAD, entry.file);
  if (!existsSync(path)) {
    missing++;
    fail(`AppSpec.${field}: ${entry.file} does not exist.`);
    continue;
  }
  if (!readFileSync(path, "utf8").includes(entry.renders)) {
    missing++;
    fail(`AppSpec.${field}: "${entry.renders}" is gone from ${entry.file}.\n` +
         `       The screen was renamed or removed and this went on promising it.`);
  }
}
if (!missing) {
  ok(`surfaced: ${declared.length - CORE.length} declaration kind(s), each rendered or owed`);
}

/* ------------------------------------------------------- shipped owes none --- */

const progress = readFileSync(join(QUAD, "docs/PROGRESS.md"), "utf8");
const shipped = new Set(
  [...progress.matchAll(/^\|\s*(\d+)\s*\|[^|]*\|\s*shipped\s*\|/gm)].map((m) => m[1]));

let early = 0;
for (const [field, entry] of Object.entries(SURFACES)) {
  if (entry.owed && shipped.has(entry.owed)) {
    early++;
    fail(`AppSpec.${field} owes a surface at stage ${entry.owed}, which PROGRESS.md calls shipped.\n` +
         `       Either the screen is due now, or "shipped" has stopped meaning reachable.`);
  }
}
const owed = Object.values(SURFACES).filter((s) => s.owed).length;
if (!early) ok(`owed: ${owed} declaration kind(s) awaiting a screen, none at a shipped stage`);

console.log(bad
  ? `\nsurface: ${bad} finding(s) — something declared that nobody can see.`
  : `\nsurface: every declaration renders somewhere, or owes a stage that has not shipped.`);
process.exit(bad ? 1 : 0);
