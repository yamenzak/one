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
import { shippedStages } from "./lib/stages.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

/* ⚠️ Read from the one registry, so "shipped" means the same thing to every
   check — see `lib/stages.mjs`. */

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/**
 * ⚠️ THE RENDERER IS NAMED, AND SO IS THE SYMBOL IT EXPORTS. Naming only the
 * file lets a screen be gutted while the entry keeps promising it — the same way
 * a guard entry that names no assertion keeps promising a check somebody deleted.
 */
const SURFACES = {
  screens: { file: "design/src/frame/shell.tsx", renders: "export function Shell" },
  settings: { file: "design/src/rendered/settings.tsx", renders: "export function Settings" },
  /* ⚠️ The PAGES its settings live on. Rendered by the same surface, as the list
     it descends from — see `Settings`. */
  settingAreas: { file: "design/src/rendered/settings.tsx", renders: "areasOn(book, areas, level)" },
  notifications: { file: "design/src/rendered/policy.tsx", renders: "export function NotificationPolicy" },
  flags: { file: "design/src/rendered/console.tsx", renders: "export function FlagConsole" },
  plans: { file: "design/src/rendered/console.tsx", renders: "export function Shelf" },
  entitlements: { file: "design/src/rendered/console.tsx", renders: "export function Shelf" },
  whitelabel: { file: "design/src/tokens/theme.ts", renders: "export function brandCss" },
  guide: { file: "design/src/rendered/guide.tsx", renders: "export function Guide" },
  milestones: { file: "design/src/rendered/guide.tsx", renders: "export function Milestones" },
  help: { file: "design/src/rendered/guide.tsx", renders: "export function Help" },

  packs: { file: "design/src/rendered/money.tsx", renders: "export function Wallet" },
  meters: { file: "design/src/rendered/money.tsx", renders: "export function Wallet" },
  jobs: { file: "design/src/rendered/money.tsx", renders: "export function Jobs" },

  lanes: { file: "design/src/rendered/ai.tsx", renders: "export function AiLanes" },
  vault: { file: "design/src/rendered/vault.tsx", renders: "export function MyData" },
  purposes: { file: "design/src/rendered/vault.tsx", renders: "export function ConsentSheet" },
  documents: { file: "design/src/rendered/legal.tsx", renders: "export function Documents" },
  processors: { file: "design/src/rendered/legal.tsx", renders: "export function SubProcessors" },
  /* ⚠️ WHERE THE RECORDS ACTUALLY SIT, and whether that can be promised. It is
     the half of a privacy notice that is usually a sentence somebody wrote —
     derived here from the same declaration the reconciler provisions from. */
  needs: { file: "design/src/rendered/legal.tsx", renders: "export function WhereItLives" },

  /*
    ⚠️ NOTHING IS OWED TODAY, and the shape stays here on purpose: `{ owed: "N" }`
    is how the next declaration kind is added honestly — visible, against a stage,
    rather than quietly unrendered.
  */

  /* Not a surface: an app's own refusal wording is rendered wherever the
     refusal is, which is every screen. */
  problems: { file: "runtime/src/serve.ts", renders: "asProblem" },
};

/* ------------------------------------------------ what an app may declare --- */

const manifest = readFileSync(join(ENGINE, "kernel/src/manifest.ts"), "utf8");
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
  const path = join(ENGINE, entry.file);
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

/* -------------------------------------------------------- every field kind --- */

/**
 * ⚠️ AND A DECLARED FIELD KIND MUST REACH A CONTROL, WHICH IS THE SAME RULE ONE
 * LEVEL DOWN. `Field` ends in a `default` that renders a text box, so a kind
 * nobody wrote a case for does not fail — it renders as somewhere to type,
 * looking finished. `colour` shipped that way: a workspace's brand colour was a
 * box containing `#2563eb`, to be typed correctly by somebody who already knows
 * hex, on a screen where every other row worked.
 *
 * ⚠️ SHARING THE TEXT BOX IS A DECISION, SO IT IS WRITTEN DOWN. `text`, `email`
 * and `url` differ only by the input's `type`, and saying so here is what makes
 * the silence about a fourth one a failure rather than a habit.
 */
const AS_TEXT = new Set(["text", "email", "url"]);
const NO_CONTROL_YET = {
  json: "18",
  media: "18",
  ref: "18",
};

const kinds = (() => {
  const src = readFileSync(join(ENGINE, "kernel/src/field.ts"), "utf8");
  const decl = src.match(/export type FieldKind =([\s\S]*?);/);
  return decl ? [...decl[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]) : [];
})();

const controls = (() => {
  const src = readFileSync(join(ENGINE, "design/src/rendered/field.tsx"), "utf8");
  return new Set([...src.matchAll(/case "([a-z]+)":/g)].map((m) => m[1]));
})();

let unhandled = 0;
if (!kinds.length) {
  unhandled++;
  fail("FieldKind could not be read from kernel/src/field.ts — this check is inert.");
}
for (const kind of kinds) {
  if (controls.has(kind) || AS_TEXT.has(kind)) continue;
  const owes = NO_CONTROL_YET[kind];
  if (owes && !shippedStages().has(owes)) continue;
  unhandled++;
  fail(`field kind "${kind}" has no case in design/src/rendered/field.tsx and is not listed as text.\n` +
       `       It renders as a text box, which looks finished and accepts anything.`);
}
if (!unhandled) {
  ok(`controls: ${kinds.length} field kind(s), each with a control, text by declaration, or owed`);
}

/* ⚠️ A kind owed against a SHIPPED stage is the same contradiction the surface
   list has, so it is the same question asked of the same table. */
for (const [kind, stage] of Object.entries(NO_CONTROL_YET)) {
  if (!shippedStages().has(stage)) continue;
  fail(`field kind "${kind}" owes a control at stage ${stage}, which the stage registry calls shipped.`);
}

/* ------------------------------------------------------- shipped owes none --- */

const shipped = shippedStages();

let early = 0;
for (const [field, entry] of Object.entries(SURFACES)) {
  if (entry.owed && shipped.has(entry.owed)) {
    early++;
    fail(`AppSpec.${field} owes a surface at stage ${entry.owed}, which the stage registry calls shipped.\n` +
         `       Either the screen is due now, or "shipped" has stopped meaning reachable.`);
  }
}
const owed = Object.values(SURFACES).filter((s) => s.owed).length;
if (!early) ok(`owed: ${owed} declaration kind(s) awaiting a screen, none at a shipped stage`);

console.log(bad
  ? `\nsurface: ${bad} finding(s) — something declared that nobody can see.`
  : `\nsurface: every declaration renders somewhere, or owes a stage that has not shipped.`);
process.exit(bad ? 1 : 0);
