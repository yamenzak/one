/**
 * AN AI ACTION NAMES A LANE, AND ITS WORDS ARE BOUNDED (D19).
 *
 * ⚠️ A MODEL ID IN AN APP'S MANIFEST IS A DEPLOYMENT DECISION SHIPPED THROUGH A
 * RELEASE. It cannot be changed without one, it is wrong the day the provider
 * retires the row, and each app then carries its own idea of which model is
 * current — none of which fails a test, because a wrong-but-live model answers
 * perfectly well.
 *
 * ⚠️ AND AN UNBOUNDED PROMPT EDIT IS THE LETTERHEAD BUG WITH THE VOLUME UP. A
 * template naming `{coach}` renders a brace to a person, who reports it; a
 * PROMPT naming it sends the brace to a model, and the answer comes back
 * subtly wrong with nobody the wiser. Both write paths must ask the kernel.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* --------------------------------------------------------------- the lane --- */

/**
 * ⚠️ NO APP NAMES A MODEL. Provider paths are unmistakable — `@cf/…`,
 * `gemini-…`, `gpt-…`, `claude-…` — and an app source is the one place none of
 * them belongs.
 */
const apps = readdirSync(join(ENGINE, "apps"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => [d.name, join(ENGINE, "apps", d.name, "src", "index.ts")]);

const MODEL_ID = /["'`](@cf\/[\w.\-/]+|gemini-[\w.\-]+|gpt-[\w.\-]+|claude-[\w.\-]+)["'`]/;
const named = apps
  .map(([name, file]) => {
    let src = "";
    try { src = strip(readFileSync(file, "utf8")); } catch { return null; }
    const hit = MODEL_ID.exec(src);
    return hit ? `${name} (${hit[1]})` : null;
  })
  .filter(Boolean);

if (named.length) {
  fail(`apps/*/src: ${named.join(", ")} names a provider's model — a deployment\n` +
       `       decision shipped through a release, wrong the day the provider retires\n` +
       `       it, and different in every app. An app names a LANE.`);
} else {
  ok(`lane: ${apps.length} app(s), none names a model — the operator binds the row`);
}

/* ------------------------------------------------------------- the words --- */

const operator = strip(readFileSync(join(ENGINE, "runtime/src/operator.ts"), "utf8"));
const settings = strip(readFileSync(join(ENGINE, "runtime/src/settings.ts"), "utf8"));
const actions = strip(readFileSync(join(ENGINE, "runtime/src/ai-actions.ts"), "utf8"));

const unchecked = [
  ["runtime/src/operator.ts (op.ai.bind)", operator, /refusePrompt\(action\.ai, text, "operator"\)/],
  ["runtime/src/settings.ts (ai.word)", settings, /refusePrompt\(action\.ai, text, "tenant"\)/],
].filter(([, src, wants]) => !wants.test(src));

if (unchecked.length) {
  fail(`${unchecked.map(([n]) => n).join(", ")}: an edited prompt is stored without\n` +
       `       asking the kernel — a variable nothing offers is now sent to a model as\n` +
       `       a literal brace, and the answer is wrong rather than broken.`);
} else if (!/level === "tenant" && !def\.brandable/.test(
  strip(readFileSync(join(ENGINE, "kernel/src/ai.ts"), "utf8")))) {
  fail(`kernel/src/ai.ts: \`refusePrompt\` no longer refuses a tenant editing an\n` +
       `       action the app did not mark brandable — a lab-extraction prompt is\n` +
       `       nobody's to reword, and the app is the only thing that can say so.`);
} else {
  ok(`words: both write paths ask the kernel, and brandable is what a tenant may touch`);
}

/* ------------------------------------------------------------ resolution --- */

/**
 * ⚠️ ONE RESOLVER, AND THE RUN USES IT. `boundModel` falling back is what keeps
 * a retired binding from taking an action down; the run reading a DIFFERENT
 * model from the one the screens report is how a bill stops matching what
 * anybody was shown.
 */
const services = strip(readFileSync(join(ENGINE, "runtime/src/services.ts"), "utf8"));
if (!/boundModel\(rows, ask\.lane, ask\.model\)/.test(services)) {
  fail(`runtime/src/services.ts: the run no longer resolves the bound model — it\n` +
       `       runs on whatever the election picks while every screen reports the\n` +
       `       binding, so the bill stops matching what anybody was shown.`);
} else if (!/composePrompt\(base, theirs\)/.test(actions)) {
  /*
    ⚠️ A WORKSPACE ADDS AND NEVER REPLACES, WHICH IS WHAT KEEPS THE BASE OFF THE
    WIRE. It used to substitute — and a substitution has to be seeded with the
    current text to be editable at all, so every prompt the deployment had was
    shipped to the browser of anybody who could open the screen. Composition
    needs no seed: the box starts empty.
  */
  fail(`runtime/src/ai-actions.ts: a workspace's wording no longer composes with\n` +
       `       ours — so either the base has to be sent to a browser to be edited, or\n` +
       `       our instructions are silently dropped from every run.`);
} else if (!/def\.brandable && tenantPrompt/.test(actions)) {
  fail(`runtime/src/ai-actions.ts: a tenant's wording is applied without asking\n` +
       `       whether the app allows it — a row written before the app changed its\n` +
       `       mind would still be in force.`);
} else {
  ok(`resolution: ours composed with theirs, one bound model, and the base stays here`);
}

/* ------------------------------------------------- and the base stays here --- */

/**
 * ⚠️ AN OPERATION THAT ANSWERS WITH THE PROMPT MUST BE THE OPERATOR'S.
 * `Running.prompt` holds the app's or the operator's instructions, and sending
 * it anywhere else publishes the one thing the addendum design exists to keep
 * off the wire. The OPERATOR may read it — it is theirs, and they are the ones
 * editing it. A workspace may not, which is why the addendum is a separate field.
 *
 * ⚠️ AND THIS IS ASKED OF EVERY OPERATION RATHER THAN OF A NAMED ONE. The check
 * that names `op.ai` goes on passing the day somebody adds `op.ai.mine` — which
 * is exactly the operation that would leak it.
 */
{
  const ops = strip(readFileSync(join(ENGINE, "runtime/src/operator.ts"), "utf8"));
  const blocks = [...ops.matchAll(/"(op\.[\w.]+)":\s*\{([\s\S]*?)\n    \},/g)];
  const leaks = blocks.filter(([, , body]) =>
    /\brunning\(/.test(body) && /\bprompt\b/.test(body) && !/doors:\s*\["operator"\]/.test(body));

  if (!blocks.length) {
    fail("runtime/src/operator.ts: no operations parsed — this check is passing over nothing.");
  } else if (leaks.length) {
    fail(`runtime/src/operator.ts: ${leaks.map((l) => l[1]).join(", ")} answers with a resolved\n` +
         `       prompt and is not operator-only. That is our text on somebody else's\n` +
         `       screen — send \`wordedBy\` and \`addendum\` instead.`);
  } else {
    ok(`privacy: ${blocks.length} operation(s), and the instructions leave only by the operator's door`);
  }
}

/* ------------------------------------------------------------------ end --- */

console.log(`\nai actions: a lane, a letterhead, and one resolver.`);
if (bad) process.exit(1);
