/**
 * EVERY RULE THE KERNEL STATES IS ONE SOMETHING RUNS (D12).
 *
 * ⚠️ THIS IS D12 ONE LAYER DOWN, AND IT IS THE VERSION NOBODY LOOKS FOR. The
 * surface guard asks whether every DECLARATION reaches a screen. This asks
 * whether every REFUSAL reaches a caller — and a refusal nothing calls is worse
 * than an absent check, because the rule is written down, argued for in a
 * comment, tested, and cited in other files as though it were in force.
 *
 * ⚠️ IT WAS NOT HYPOTHETICAL. `refusePolicy`'s own header says the `action` rule
 * is enforced there "rather than hidden in a screen … a screen that simply does
 * not render the switch is a rule that lasts until the second screen, or the
 * API, or the import that sets preferences in bulk" — and nothing called it, so
 * the rule lasted exactly as far as the screen and the API could silence a
 * notification that asks somebody to do something.
 *
 * ⚠️ AND THE ONLY HONEST ANSWERS ARE WIRE IT, DEFER IT, OR DELETE IT. A rule for
 * a capability that does not exist yet is legitimate — and it carries a
 * `DEFER(engine-N)` marker, so it is in the deferral list rather than in the
 * silence. That is STANDARDS §2 applied to code instead of prose.
 */

import { ENGINE, files, lanes, read, resolveRules, uses } from "./lib/rules.mjs";

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const LANES = lanes();
const bodies = new Map();
for (const lane of Object.values(LANES)) for (const f of lane) bodies.set(f, read(f));

const rules = resolveRules();
const idle = rules.filter((r) => !r.lane);
const undeclared = idle.filter((r) => !r.deferredTo);

if (undeclared.length) {
  for (const r of undeclared) {
    fail(`rules: ${r.file} states ${r.name} and nothing runs it — a rule written down, argued for, and not in force anywhere`);
  }
} else {
  const counted = {};
  for (const r of rules) if (r.lane) counted[r.lane] = (counted[r.lane] ?? 0) + 1;
  const said = Object.entries(counted).map(([l, n]) => `${n} ${l}`).join(", ");
  ok(`rules: all ${rules.length} kernel rule(s) are in force — ${said}${idle.length ? `, ${idle.length} deferred` : ""}`);
}

/*
  ⚠️ AND A RULE THE KERNEL STATES IS NOT RE-STATED SOMEWHERE ELSE. Two answers to
  "what is a valid surface" is how one of them comes to allow what the other
  refuses; the point of putting the rule in the kernel is that there is one.
*/
/*
  ⚠️ THE SHAPE HAS TO BE THE KERNEL'S OWN PRIMITIVE, NOT A WORD. `contrast(`
  matched a `backdrop-filter` in the ambience engine, which is a CSS function
  with nothing to do with whether two colours can be read against each other — a
  check reporting what it happens to find rather than what it means.
*/
const RESTATED = [
  {
    rule: "refuseTheme",
    shape: /\bluminance\s*\(/,
    where: [...LANES.runtime, ...LANES.surface],
    says: "whether two colours can be read against each other",
  },
];

let copies = 0;
for (const { rule, shape, where, says } of RESTATED) {
  for (const f of where) {
    const src = bodies.get(f) ?? "";
    if (shape.test(src) && !new RegExp(`\\b${rule}\\s*\\(`).test(src)) {
      fail(`rules: ${f} works out ${says} itself instead of asking ${rule} — two answers to one question, and they diverge in whichever direction nobody tests`);
      copies++;
    }
  }
}
if (!copies) ok(`rules: no lane works out for itself what the kernel already decides`);

console.log(bad ? `\nrules: ${bad} problem(s).` : "\nrules: green.");
process.exit(bad ? 1 : 0);
