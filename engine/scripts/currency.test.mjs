/**
 * A FACT THE RENDERER READS OFF `Has` REACHES IT, ON EVERY MOUNT.
 *
 * @design a workspace fact a declared screen draws with is threaded from the
 * read that already carries it, and a screen mounted without it draws a blank.
 *
 * ⚠️ THE FAULT IS A PROP THAT EXISTS, IS TYPED, IS DOCUMENTED AND IS NEVER
 * PASSED. `Has.currency` was declared on the renderer with a paragraph saying
 * why a declaration cannot guess it, `Declared` accepted it and spread it into
 * `Has` — and `AppSurface` never sent one. So `DRAWN.money` took the branch that
 * draws NOTHING, and every price on every app screen was an empty cell. Nothing
 * failed: not the compiler (the prop is optional, correctly — the account door
 * has no workspace), not a test, not a photograph, because no screen had shipped
 * a money field yet.
 *
 * ⚠️ SO THE CHECK IS DERIVED FROM WHAT THE RENDERER ACTUALLY READS, never from a
 * list of prop names. `DRAWN` is where a `Format` becomes a component, and every
 * `has.<name>` inside it is a fact the browser must supply or that format draws
 * blank. A second one added tomorrow is asked the same three questions with no
 * edit here — which is the only version of this guard that survives the next
 * fact.
 *
 * ⚠️ AND THE THREE QUESTIONS ARE THE THREE PLACES IT WENT MISSING: the server
 * sends it, the browser's view declares it, and every mount of the renderer
 * passes it. Checking only the last would pass on a payload that never carried
 * the field; checking only the first would pass on today's bug exactly.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const read = (rel) => {
  const at = join(ENGINE, rel);
  return existsSync(at) ? readFileSync(at, "utf8") : null;
};

/* ⚠️ Comments are prose, and every paragraph above and in the renderer names
   the very shape being refused. */
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

const BODY = "design/src/rendered/body.tsx";
const DECLARED = "one-space/src/centre/Declared.tsx";
const SURFACE = "one-space/src/centre/AppSurface.tsx";
const DATA = "one-space/src/centre/data.tsx";
const CENTRE = "runtime/src/centre-ops.ts";

/* --------------------------------------------------- what the renderer reads --- */

/**
 * ⚠️ THE FACTS `DRAWN` DEPENDS ON, READ OUT OF `DRAWN` ITSELF. Anything else is
 * a hand-kept list, and a hand-kept list of "things that must be threaded" is
 * exactly the artefact that was already missing an entry.
 */
const bodySrc = read(BODY);
if (!bodySrc) {
  fail(`${BODY}: not here — this guard is reading a renderer that has moved.`);
  process.exit(1);
}

const drawn = strip(bodySrc).match(/const DRAWN[\s\S]*?\n\};/);
if (!drawn) {
  fail(`${BODY}: no \`DRAWN\` table found. This guard derives what a screen`
    + ` needs from that table, so it cannot check anything without it.`);
  process.exit(1);
}

/* ⚠️ `has.x` inside a formatter — the fact that formatter cannot draw without. */
const FACTS = [...new Set([...drawn[0].matchAll(/\bhas\.(\w+)\b/g)].map((m) => m[1]))];

if (!FACTS.length) {
  fail(`${BODY}: \`DRAWN\` reads no workspace fact at all. Either every format`
    + ` became self-sufficient — in which case delete this guard deliberately —`
    + ` or the table's shape changed and this stopped looking at anything.`);
}

/* ------------------------------------------------------- the three questions --- */

/**
 * ⚠️ THE BRACES ARE MATCHED, BECAUSE GREPPING THE FILE IS THE WEAK VERSION AND
 * IT WAS TRIED. `data.tsx` names `currency` on a bill line and on the wallet's
 * packs, so a whole-file search reported the workspace's own currency present
 * while `CentreView.tenant` had lost it — the guard's own mutation test is what
 * caught that, which is the argument for running one.
 */
const blockAfter = (src, marker) => {
  const at = src.indexOf(marker);
  if (at < 0) return null;
  let i = src.indexOf("{", at + marker.length - 1);
  if (i < 0) return null;
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) return src.slice(i, j + 1);
  }
  return null;
};

const carries = (where, marker, what, why) => {
  const src = read(where);
  if (src === null) { fail(`${where}: not here.`); return; }
  const block = blockAfter(strip(src), marker);
  if (block === null) {
    fail(`${where}: no \`${marker}\` block. This guard reads that block to ask`
      + ` whether \`${what}\` is carried, so it cannot check anything without it.`);
    return;
  }
  if (!new RegExp(`\\b${what}\\b`).test(block)) {
    fail(`${where}: \`${marker}\` does not carry \`${what}\`.\n       ${why}`);
  }
};

for (const fact of FACTS) {
  /*
    ⚠️ THE SERVER SENDS IT. Without this the payload has no such field and every
    check below passes over an `undefined` that is threaded perfectly.
  */
  carries(CENTRE, "tenant: {", fact,
    `\`DRAWN\` draws a format from \`has.${fact}\`, so the read every screen`
    + ` stands on has to carry it. A screen cannot work it out and must not guess.`);

  /* ⚠️ THE BROWSER'S OWN SHAPE DECLARES IT, or the value arrives on the wire and
     is dropped by the type it is read through. */
  carries(DATA, "readonly tenant: {", fact,
    `\`CentreView\` has to declare \`${fact}\` or the field arrives and is`
    + ` unreadable — the payload is right and the screen still draws blank.`);

  /* ⚠️ AND THE RENDERER TAKES IT. */
  carries(DECLARED, "export function Declared(", fact,
    `\`Declared\` spreads \`Has\`, so it has to accept \`${fact}\` and pass it on.`);

  /*
    ⚠️ AND EVERY MOUNT PASSES IT — which is the one that was wrong. A prop that
    is accepted and never sent is invisible to the compiler, because absent is a
    legitimate state (the account door has no workspace) and the renderer's
    refusal to guess is correct behaviour.
  */
  const surface = read(SURFACE);
  if (surface === null) { fail(`${SURFACE}: not here.`); continue; }
  const mounts = [...strip(surface).matchAll(/<Declared\b([\s\S]*?)\/?>/g)];
  if (!mounts.length) {
    fail(`${SURFACE}: mounts no \`<Declared>\`. Either the renderer is reached`
      + ` from somewhere else now — point this guard there — or nothing draws a`
      + ` declared screen at all.`);
    continue;
  }
  for (const mount of mounts) {
    if (new RegExp(`\\b${fact}\\s*=`).test(mount[1])) continue;
    fail(`${SURFACE}: \`<Declared>\` is mounted without \`${fact}\`.\n`
      + `       \`DRAWN\` draws a format from \`has.${fact}\`, and its absence is a\n`
      + `       legitimate state — so the renderer correctly draws NOTHING and the\n`
      + `       compiler correctly says nothing. On the screen that is a blank cell\n`
      + `       where a figure belongs, which reads as a value that failed to load.`);
  }
}

if (!bad) {
  ok(`threaded: ${FACTS.length} workspace fact(s) — ${FACTS.join(", ")} — sent, declared and passed`);
}

/* --------------------------------------------- the default is never nothing --- */

/**
 * ⚠️ A CURRENCY IS A DEFAULT SOMEBODY CHANGES, NEVER AN ABSENCE THEY FILL IN.
 * `currencyFor` answering null for an unlisted country would put a workspace
 * straight back into the blank-column state above, over a code somebody typed in
 * lower case. The fallback is what makes that impossible, so it is pinned.
 */
{
  const src = read("kernel/src/tenancy.ts");
  if (src === null) {
    fail("kernel/src/tenancy.ts: not here.");
  } else {
    const clean = strip(src);
    const fn = clean.match(/export const currencyFor[\s\S]*?;\n/);
    if (!fn) {
      fail("kernel/src/tenancy.ts: no `currencyFor`. The workspace currency has to"
        + " come from somewhere, and a lookup written at each call site is a"
        + " default that differs per caller.");
    } else if (!/\?\?\s*"[A-Z]{3}"/.test(fn[0])) {
      fail("kernel/src/tenancy.ts: `currencyFor` has no currency fallback.\n"
        + "       An unlisted country must land on a currency, not on nothing — a\n"
        + "       default in the wrong currency is visible and one control away,\n"
        + "       while a blank column is neither.");
    } else {
      ok("default: `currencyFor` answers a currency for every country, listed or not");
    }
  }
}

console.log("\ncurrency: a fact the renderer reads off `Has` reaches it, on every mount.");
process.exit(bad ? 1 : 0);
