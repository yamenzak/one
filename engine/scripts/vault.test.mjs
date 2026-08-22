/**
 * A VAULT FACT IS NEVER STORED BY AN APP (D11).
 *
 * ⚠️ A HEALTH RECORD, A BELIEF OR A BIOMETRIC IN A PRODUCT'S OWN TABLE IS
 * OUTSIDE CONSENT, OUTSIDE THE GRANT LOG AND OUTSIDE CRYPTO-SHREDDING — and it
 * looks exactly like every other column, so nothing downstream will ever notice.
 * The kernel refuses it at composition; this refuses the two ways around that:
 * an app writing the vault's own tables, and an app carrying its own encryption.
 *
 * ⚠️ THE SECOND ONE IS THE INTERESTING HALF. An app that encrypts a field itself
 * has built something that LOOKS safer than a plain column and is strictly
 * worse: the key is not shredded when somebody asks to be forgotten, the read is
 * not recorded, and the export does not know the field exists — so the person is
 * told they have been erased while a copy of the fact remains readable.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appDirs, appTrees } from "./lib/trees.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

const APPS = appTrees();

const sourcesOf = (tree) => {
  const dir = join(ENGINE, tree);
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (at) => {
    for (const e of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, e.name);
      if (e.isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(path);
    }
  };
  walk(dir);
  return out;
};

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ------------------------------------------------------------- the tables --- */

const VAULT_TABLES = /\b(vault_fact|vault_subject|vault_consent|vault_grant|vault_look)\b/;

let touched = 0;
for (const [app, dir] of APPS) {
  for (const file of sourcesOf(dir)) {
    const code = stripComments(readFileSync(file, "utf8"));
    const hit = code.match(VAULT_TABLES);
    if (hit) {
      touched++;
      fail(`${rel(file)}: an app names \`${hit[1]}\` (D11).\n` +
           `       Writing the vault's own tables skips consent, the grant log and the shredding.`);
    }
  }
}
if (!touched) ok(`tables: ${APPS.length} app(s), none touch the vault's own tables`);

/* --------------------------------------------------------------- its own key --- */

/**
 * ⚠️ AN APP THAT ENCRYPTS SOMETHING ITSELF HAS BUILT A SECOND VAULT WITH NONE OF
 * THE PROPERTIES OF THE FIRST. Refused by shape, because the result looks more
 * careful than a plain column while being the thing that survives an erasure.
 */
const OWN_CRYPTO = [
  [/crypto\.subtle\.(encrypt|decrypt|deriveKey)/, "its own encryption"],
  [/\bAES-GCM\b/, "its own cipher"],
];
let rolled = 0;
for (const [app, dir] of APPS) {
  for (const file of sourcesOf(dir)) {
    const code = stripComments(readFileSync(file, "utf8"));
    for (const [re, what] of OWN_CRYPTO) {
      if (re.test(code)) {
        rolled++;
        fail(`${rel(file)}: an app carries ${what} (D11).\n` +
             `       Its key is not shredded on erasure, its reads are not recorded, and the export does not know the field exists.`);
      }
    }
  }
}
if (!rolled) ok(`keys: no app carries its own encryption`);

/* ------------------------------------------------- sensitive means vaulted --- */

/**
 * ⚠️ AND THE DECLARATION ITSELF: a field marked `sensitive` must be vault-backed.
 * The kernel refuses this at composition, so a manifest that got past it is a
 * manifest that never composed — which is worth catching here too, because the
 * one place it could slip through is an app whose tests never call `defineApp`.
 */
let stray = 0;
for (const [app, dir] of APPS) {
  for (const file of sourcesOf(dir)) {
    const code = stripComments(readFileSync(file, "utf8"));
    for (const m of code.matchAll(/holds:\s*"sensitive"([^}]*)\}/g)) {
      if (!/vault:\s*true/.test(m[1])) {
        stray++;
        fail(`${rel(file)}: a field holds a special category and is not vault-backed (D11).\n` +
             `       It would sit in a product table, outside consent and outside crypto-shredding.`);
      }
    }
  }
}
if (!stray) ok(`fields: every special category an app declares is vault-backed`);

console.log(bad
  ? `\nvault: ${bad} finding(s) — a fact outside the one place that can prove it was erased.`
  : `\nvault: every sensitive fact is somewhere erasure can reach.`);
process.exit(bad ? 1 : 0);
