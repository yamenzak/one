/**
 * NOBODY'S NAME IN A LOG LINE.
 *
 * ⚠️ THIS GUARD REPLACES A PROMISE THAT COULD NOT BE KEPT. `Residency` used to
 * say the deployment holds storage, backups AND LOGS in the jurisdiction it
 * promised. It does not: the platform runs on Workers Logs, which offer no
 * residency control at all. The honest move is to stop promising it — and then
 * to do the thing that actually protects somebody, which is keeping them out of
 * the logs in the first place.
 *
 * ⚠️ A LOG LINE IS A DISCLOSURE TO A PLACE NOTHING ELSE HERE REACHES. It leaves
 * the jurisdiction, it is retained on somebody else's schedule, it is readable
 * by anybody with dashboard access, and — the part that matters — it survives
 * every erasure this platform performs. `me.forget` walks 37 tables and a
 * bucket; it cannot walk a log.
 *
 * ⚠️ SO THE RULE IS ABOUT THE VALUES, NOT THE WORDS. Logging the STRING
 * "accountId" is fine and inevitable; logging `${accountId}` is the disclosure.
 * The check is for an interpolation or a concatenation of an identifier that
 * names a person, which is what the mistake actually looks like.
 */

import { readFileSync, readdirSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const WHO = /\b(email|accountId|account_id|subjectId|subject_id|actor|slug|name|to|token|code|body|cipher)\b/;

/**
 * ⚠️ ONE ESCAPE, AND IT HAS TO SAY WHY ON THE LINE. A rule with no way out gets
 * deleted by whoever meets the first legitimate case; a rule whose exemptions
 * are invisible stops being a rule. `logs-exempt: <reason>` is the marker, the
 * count is REPORTED on every run, and the only case in the tree today is the
 * development mailer — which prints a sign-in code to a laptop's console and is
 * unreachable outside development, because the branch above it throws.
 */
const EXEMPT = /logs-exempt:\s*\S/;

/* ⚠️ Only the runtime and the deployment. The design system logs nothing about
   anybody, and the guard scripts run on a developer's machine. */
const ROOTS = ["engine/runtime/src", "engine/one/src", "engine/apps/hello/src"];

let checked = 0;
let exempted = 0;
for (const root of ROOTS) {
  for (const file of readdirSync(root).filter((f) => f.endsWith(".ts"))) {
    const text = readFileSync(`${root}/${file}`, "utf8");
    const lines = text.split("\n");
    checked++;
    for (const m of text.matchAll(/console\.(log|error|warn|info)\(([^\n]*)/g)) {
      const args = m[2];
      /* The marker sits on the line or on the one above it. */
      const at = text.slice(0, m.index).split("\n").length;
      const near = lines.slice(Math.max(0, at - 5), at).join("\n");
      if (EXEMPT.test(near)) { exempted++; continue; }
      /* An interpolation `${…}` or a `+ x` concatenation of a person-shaped
         identifier. A bare string mentioning the word is not a disclosure. */
      const held = [...args.matchAll(/\$\{([^}]*)\}/g)].map((x) => x[1])
        .concat([...args.matchAll(/\+\s*([A-Za-z_$][\w$.]*)/g)].map((x) => x[1]));
      for (const value of held) {
        if (!WHO.test(value)) continue;
        fail(`${root}/${file}: \`console.${m[1]}\` interpolates \`${value.trim()}\` — `
          + `a log line leaves the jurisdiction, is retained on somebody else's schedule, `
          + `and survives every erasure this platform performs.\n`
          + `       Log what happened, not who it happened to.`);
      }
    }
  }
}

/*
  ⚠️ AND THE PROMISE ITSELF MUST STAY NARROW. Somebody adding "logs" back to the
  residency sentence would be re-making a claim the vendor gives us no way to
  keep, and the sentence is the only place it would appear.
*/
const tenancy = readFileSync("engine/kernel/src/tenancy.ts", "utf8");
const promise = tenancy.slice(tenancy.indexOf("A CLOSED SET"), tenancy.indexOf("export type Residency"));
if (/\bstorage, backups(,| and) logs\b/.test(promise) || /keep end to end[^.]*logs/.test(promise)) {
  fail("logs: the residency promise names logs again — Workers Logs have no "
    + "residency control, so that is a promise broken by the first request");
}

if (!checked) fail("logs: no sources were read — a check that cannot fail");
if (!bad) {
  ok(`logs: ${checked} source file(s), no person in a log line`
    + (exempted ? ` (${exempted} stated exemption(s))` : ""));
  ok("logs: the residency promise covers stored records, and does not claim logs");
}

console.log(bad
  ? `\nlogs: ${bad} disclosure(s) to a place no erasure can reach.`
  : "\nlogs: what happened is logged, and who it happened to is not.");
process.exit(bad ? 1 : 0);
