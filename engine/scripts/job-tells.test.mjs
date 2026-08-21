/**
 * A JOB THAT SAYS IT TELLS PEOPLE HAS TO TELL PEOPLE.
 *
 * ⚠️ THE FAILURE IS SILENT IN BOTH DIRECTIONS AND NEITHER END REPORTS IT. A job
 * declaring `emits` satisfies the manifest — `eventsOf` reads job declarations,
 * so a notification waiting for that event composes and is drawn on the policy
 * screen and offered as a preference — and if the body never calls `ctx.tell`,
 * nobody is ever told anything. Every test passes. The inbox is empty, which is
 * indistinguishable from an inbox with nothing to say.
 *
 * ⚠️ THE OTHER DIRECTION IS CAUGHT AT RUNTIME AND THIS ONE CANNOT BE. A body
 * raising an event it does not declare throws in `handed`; a body declaring an
 * event it never raises does nothing at all, forever, which is why the check has
 * to be structural.
 *
 * ⚠️ AND IT IS THE SAME SHAPE AS EVERY OTHER GUARD HERE: declared and unwired.
 * A capability with a declaration, a surface, a preference and no code path is
 * the failure this repository is a catalogue of.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/* ⚠️ Comments describe the calls they are about, and each would otherwise
   match — this file's own header would count as three. */
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

/**
 * ⚠️ ONE CHUNK PER JOB, CUT AT THE DECLARATIONS THEMSELVES. Not a parser and it
 * does not need to be: a job is one call carrying its own body (that is the
 * whole point of `JobDef.work`), so the text from one declaration to the next is
 * one job. A helper defined between two would be attributed to the first, which
 * errs towards reporting — and a false report is read and dismissed while a
 * silent notification is not.
 */
const jobsIn = (code) => {
  const at = [...code.matchAll(/\b(?:declareJob|job)\s*\(\s*\{/g)].map((m) => m.index);
  return at.map((from, i) => code.slice(from, at[i + 1] ?? code.length));
};

const apps = existsSync(join(ENGINE, "apps"))
  ? readdirSync(join(ENGINE, "apps"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => [d.name, join(ENGINE, "apps", d.name, "src", "index.ts")])
    .filter(([, path]) => existsSync(path))
  : [];

let raising = 0;
for (const [app, path] of apps) {
  const code = strip(readFileSync(path, "utf8"));
  for (const chunk of jobsIn(code)) {
    const id = /\bid:\s*["'`]([\w.-]+)["'`]/.exec(chunk)?.[1] ?? "a job";
    const declared = /\bemits:\s*\[([^\]]*)\]/.exec(chunk);
    const names = declared
      ? [...declared[1].matchAll(/["'`]([\w.-]+)["'`]/g)].map((m) => m[1])
      : [];
    /* ⚠️ `ctx.tell?.(` OR `tell?.(` — a body may destructure its context, and a
       check that only knew one spelling would pass a job that tells nobody. */
    const raised = [...chunk.matchAll(/\btell\?\.\(\s*["'`]([\w.-]+)["'`]/g)]
      .map((m) => m[1]);

    if (!names.length) {
      /* ⚠️ A job that raises without declaring is refused by the RUNNER at the
         first workspace, loudly, in the run record. Reported here anyway,
         because finding it at composition beats finding it at 05:00. */
      if (raised.length) {
        fail(`${app}: \`${id}\` raises ${raised.join(", ")} and declares no \`emits\`.\n`
          + `       The runner refuses an undeclared event, so this job fails on its first\n`
          + `       workspace every night — and the manifest could never have checked the\n`
          + `       notification waiting for it.`);
      }
      continue;
    }

    raising++;
    for (const name of names) {
      if (raised.includes(name)) continue;
      fail(`${app}: \`${id}\` declares it emits \`${name}\` and never calls \`ctx.tell\` with it.\n`
        + `       The manifest counts a job's \`emits\` as events this app raises, so a\n`
        + `       notification waiting for this one composes, appears on the policy screen\n`
        + `       and is offered as a preference somebody can narrow. Nobody is ever told.`);
    }
  }
}

/*
  ⚠️ A FLOOR, BECAUSE A GUARD THAT FINDS NOTHING PRINTS A GREEN LINE. "No job
  declares an event it does not raise" and "no job declares an event" are the
  same sentence without a number — and the second is what a renamed field
  produces, silently, on the day somebody changes `emits`.
*/
if (raising < 1) {
  fail(`job-tells: no job across ${apps.length} app(s) declares \`emits\` at all.\n`
    + `       OneInventory's nightly sweep does, so a zero here means the declaration\n`
    + `       was renamed and this check is now about nothing.`);
} else if (!bad) {
  ok(`job-tells: ${raising} job(s) declaring events, every one of them raised`);
}

console.log(bad
  ? `\njob-tells: ${bad} finding(s) — a night's work that tells nobody.`
  : `\njob-tells: what a job says it raises, it raises.`);
process.exit(bad ? 1 : 0);
