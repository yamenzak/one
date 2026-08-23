/**
 * A DATABASE'S PLACE IS DECIDED ONCE AND CANNOT BE CHANGED.
 *
 * @design where records sit is declared, checked, and never a default in a script.
 *
 * ⚠️ TWO PATHS CREATE A DATABASE AND ONLY ONE OF THEM KNEW THE RULE. The
 * reconciler that GROWS a shard sets `jurisdiction` from the residency and says
 * in writing that Cloudflare fixes it at creation — no edit, no migration, no
 * ticket. The workflow that makes the FIRST databases called `wrangler d1 create`
 * bare, so they landed wherever the runner happened to be. Measured on the live
 * deployment: every operation was four or five sequential round trips at ~260 ms
 * each against a worker spending nine milliseconds of CPU. Distance, not work.
 *
 * ⚠️ AND THE SECOND CONSEQUENCE IS NOT LATENCY. The deployment's own documents
 * say records are stored in the region the workspace was created for and stay
 * there. A shard promised `eu` and created with no jurisdiction is a sentence
 * somebody agreed to that nothing enforces.
 *
 * ⚠️ SO THE PLACEMENT IS DERIVED FROM ONE DECLARATION AND BOTH PATHS READ IT.
 * This checks that they still do: every database the config binds resolves to a
 * placement, an `eu` shard gets the jurisdiction rather than a hint, and the
 * workflow asks rather than deciding for itself.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { baseName, databases, nextName, placement, SOURCE } from "./bind-ids.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FLOWS = join(HERE, "..", "..", ".github", "workflows");
const RECONCILER = join(HERE, "..", "runtime", "src", "cloudflare.ts");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const said = readFileSync(SOURCE, "utf8");
const bound = databases();

if (!bound.length) {
  fail("the config binds no database — this guard would pass over nothing.");
}

/* ⚠️ EVERY ONE, INCLUDING A SHARD ADDED TOMORROW. `placement` throws on a name
   it cannot resolve, which is what makes a new binding without a declaration a
   failure here rather than a database made in the wrong place. */
for (const { name } of bound) {
  let flags;
  try {
    flags = placement(name, said);
  } catch (why) {
    fail(`${name}: ${(why && why.message) || why}\n`
      + "       A database this config binds must resolve to a declared place —\n"
      + "       where it goes is fixed the moment it is created.");
    continue;
  }
  const shard = /^one-shard-(.+)$/.exec(name)?.[1];
  const eu = shard && new RegExp(`id:\\s*"${shard}",\\s*where:\\s*"eu"`).test(said);
  if (eu && flags[0] !== "--jurisdiction") {
    fail(`${name} is promised EU residency and would be created with ${flags.join(" ")}.\n`
      + "       A hint is not a promise, and the documents say records stay in the\n"
      + "       region the workspace was created for.");
  }
  /* ⚠️ NEVER BOTH. Cloudflare ignores the hint when a jurisdiction is set, so
     sending the pair is a promise that reads as kept and is not. */
  if (flags.length !== 2 || (flags[0] !== "--jurisdiction" && flags[0] !== "--location")) {
    fail(`${name}: ${flags.join(" ")} is not one flag and one value.`);
  }
}

/*
  ⚠️ EVERY WORKFLOW THAT MAKES ONE, NOT THE ONE THAT MADE THEM FIRST. This
  checked `engine.yml` by name — and the whole finding is that a SECOND path
  creating a database is how the rule gets lost. Naming one file would have let
  the next workflow be exactly that, which is a guard writing its own bug.
*/
const flows = readdirSync(FLOWS)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({ name: f, text: readFileSync(join(FLOWS, f), "utf8") }))
  .filter((f) => /wrangler d1 create/.test(f.text));

if (!flows.length) {
  fail("no workflow creates a D1 — this half of the guard would pass over nothing.\n"
    + "       It matches `wrangler d1 create`, so a rename disables the check\n"
    + "       rather than failing it.");
}

for (const { name, text } of flows) {
  /* ⚠️ IT ASKS RATHER THAN DECIDING. A hard-coded flag is a second answer to a
     question the deployment already declares, and the two drift silently — the
     database is simply made in the wrong place, once, for ever. */
  /* ⚠️ BOTH ASKING FORMS, NAMED. `--place <database_name>` is provisioning's,
     which knows only a name; `--placeof <BINDING>` is the relocation's, which
     must survive the name changing under it. A pattern matching one as a prefix
     of the other passes for the wrong reason, and a guard that is right by
     accident is one nobody notices going wrong. */
  if (!/bind-ids\.mjs --place(of)?\s/.test(text)) {
    fail(`${name} creates a D1 without asking where it goes.\n`
      + "       `wrangler d1 create` with no placement puts the records wherever the\n"
      + "       runner is, and nothing can move them afterwards.");
  }
  for (const [, flag] of text.matchAll(/wrangler d1 create[^\n]*?(--(?:location|jurisdiction))/g)) {
    fail(`${name} passes ${flag} to \`d1 create\` itself.\n`
      + "       It must come from `--place`, or this workflow and the reconciler are\n"
      + "       two answers to where a workspace's records live.");
  }
}

/* ⚠️ AND THE RECONCILER STILL KNOWS ITS HALF. This guard exists because the two
   disagreed; asserting only the workflow would let the other side go quiet. */
const grew = readFileSync(RECONCILER, "utf8");
if (!/jurisdiction:\s*"eu"/.test(grew)) {
  fail("the reconciler no longer sets a jurisdiction when it creates a D1.\n"
    + "       A grown shard would inherit the account's default and the residency\n"
    + "       a workspace was promised would be a column with nothing behind it.");
}

if (!bad) {
  ok(`placed: ${bound.length} database(s), each resolving to a declared place`);
  ok(`agreed: ${flows.length} workflow(s) that create one ask, `
    + "and the reconciler still sets its own");
}

/* ------------------------------------------------- the name and the id --- */

/**
 * ⚠️ A RELOCATION THAT WRITES THE ID AND NOT THE NAME LEAVES THE CONFIG NAMING A
 * DATABASE THAT IS NO LONGER THE LIVE ONE. `wrangler d1 <anything> <name>`
 * resolves against the account, so every command typed from that config reaches
 * the SUPERSEDED database and answers from it with no error — including the
 * relocation's own copy step, which would then take its next copy from a
 * database that has been out of service since the last window. It happened: the
 * directory was relocated to `one-directory-eu` and the config went on saying
 * `one-directory`.
 */
if (!/--rebind/.test(readFileSync(join(HERE, "bind-ids.mjs"), "utf8"))) {
  fail("bind-ids.mjs offers no `--rebind`, so a relocation can only write the id.\n"
    + "       The config then names a database that is not the live one.");
} else ok("rebind: a relocated database's name is written beside its id");

/**
 * ⚠️ READ WITH THE COMMENTS STRIPPED, because the first version of this did not
 * and every check passed on the prose above the command. A workflow explaining
 * why it uses `--rebind` satisfied a guard asking whether it does — which is a
 * guard that can only ever agree with the file it is reading.
 */
const commands = readFileSync(join(FLOWS, "relocate.yml"), "utf8")
  .split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

if (!/bind-ids\.mjs --rebind /.test(commands)) {
  fail("relocate.yml binds without `--rebind`, so the config keeps the old name\n"
    + "       while the id moves — and every `wrangler d1` command typed against that\n"
    + "       config then reaches the superseded database.");
} else ok("rebind: relocate.yml writes the name beside the id");

/**
 * ⚠️ AND THE COPY'S SOURCE IS THE ID. Asking only whether `--id` appears
 * ANYWHERE passes on a workflow that reads the id for one thing and exports a
 * hard-coded name for another — which is the version that would silently copy
 * the superseded database. So the export's own argument is what is checked.
 */
const exports_ = [...commands.matchAll(/wrangler d1 export\s+(\S+)/g)].map((m) => m[1]);
const literal = exports_.filter((a) => !a.startsWith('"$') && !a.startsWith("$"));
if (!exports_.length) {
  fail("relocate.yml exports nothing — this check would pass over no copy at all.");
} else if (literal.length) {
  fail(`relocate.yml exports from a literal name: ${literal.join(", ")}.\n`
    + "       `wrangler d1` resolves a name against the account, so after one\n"
    + "       relocation that name is the superseded database and the copy is of it.");
} else if (!/from=\$\(node [^)]*bind-ids\.mjs --id /.test(commands)) {
  fail("relocate.yml exports from a variable that does not come from `--id`.\n"
    + "       The bound id is the only thing that names the database the worker reads.");
} else ok(`source: ${exports_.length} copy source(s), each the bound id`);

/**
 * ⚠️ AND THE GENERATION IS NOT PART OF A SHARD'S IDENTITY. `one-shard-eu-1-g2`
 * is the same shard relocated; read whole it matches no declared shard, so
 * `placement` throws — refusing to place the very copy being made to correct a
 * placement. Asserted against `placement` itself, not against the naming helpers,
 * because it is `placement` that decides where the records go.
 */
try {
  const flags = placement("one-shard-eu-1-g2", said);
  if (flags[0] !== "--jurisdiction") {
    fail(`a relocated EU shard would be created with ${flags.join(" ")}.\n`
      + "       The copy made to put records in the EU would land outside it.");
  } else ok("generation: a relocated shard is still placed as the shard it is");
} catch (why) {
  fail(`placement refuses a relocated shard: ${(why && why.message) || why}\n`
    + "       The generation is not part of the shard's id — strip it before deciding.");
}

console.log(bad
  ? `\nplaced: ${bad} finding(s) — a database would be created somewhere nobody chose.`
  : "\nplaced: where records go is declared once, and both paths read it.");
process.exit(bad ? 1 : 0);
