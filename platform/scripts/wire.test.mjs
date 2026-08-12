#!/usr/bin/env node
/**
 * THE WIRE — a screen may not INVENT the shape of what an operation answers with.
 *
 * ⚠️ THIS EXISTS BECAUSE IT HAPPENED. A screen was written against
 * `subprocessor: { name, purpose, region }` when the kernel declares
 * `{ id, name, role, receives, where, safeguard, terms, publishes }` — `purpose`
 * and `region` are fields nobody has ever sent. It typechecked, every test
 * passed, and the screenshots looked right, because the FIXTURES were written to
 * match the invention. A picture of a fiction is the most convincing wrong answer
 * available, and it is what a hand-written wire type buys.
 *
 * ⚠️ THE HOLE IT CLOSES IS `s.json()`. An operation declares its structured
 * output as opaque JSON, so nothing at the boundary knows a subprocessor from a
 * transfer — the only place the real shape is written down is the KERNEL type the
 * handler returns. So the rule is: reference it. A wire type whose fields are
 * primitives or imported kernel types cannot describe a payload that does not
 * exist; one that spells out its own nested object always can.
 *
 * ⚠️ IT CHECKS THE `wire` MODULE ONLY, AND THAT IS THE POINT OF HAVING ONE. It is
 * the single declared seam between what an operation answers and what a component
 * takes; a rule that applied everywhere would be a rule against ordinary props.
 *
 * ⚠️ WHAT IT DOES NOT CATCH, SAID PLAINLY: a field given the WRONG PRIMITIVE. The
 * same mistake also typed `inference` as `readonly string[]` where the handler
 * sends an object keyed by binding and region, and no structural rule can see
 * that — only the kernel type can, by being named. So this narrows the opening
 * rather than closing it, and a guard that claimed otherwise would be the more
 * dangerous of the two.
 *
 * Dependency-free Node — these run before `pnpm install` in CI.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let bad = 0;
const fail = (m) => (console.error(`BAD  ${m}`), bad++);
const ok = (m) => console.log(`ok   ${m}`);

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
};

/* ⚠️ COMMENTS GO FIRST, blanked rather than removed so line numbers survive. Every
   rule below is about code, and this file's own prose is full of the shapes it
   refuses. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
     .replace(/(^|[^:\w])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));

/* ------------------------------------------------- what the kernel declares */

/**
 * ⚠️ EVERY EXPORTED TYPE NAME, so "is this a real shape" is answered by reading
 * rather than by a list somebody keeps. A name that stops being exported stops
 * being allowed here on the same commit.
 */
const kernelTypes = new Set();
for (const file of walk(join(ROOT, "kernel", "src"))) {
  for (const m of stripComments(readFileSync(file, "utf8"))
    .matchAll(/export\s+(?:interface|type)\s+([A-Z][A-Za-z0-9_]*)/g)) kernelTypes.add(m[1]);
}
if (kernelTypes.size < 20) {
  fail(`kernel: only ${kernelTypes.size} exported type(s) found — the scan is broken, not the kernel`);
}


/**
 * ⚠️ EVERY INLINE `{ … }` IN A TYPE BODY, WITH ITS FIELD COUNT. Counted at the
 * object's own depth so a nested one is not credited to its parent — the shape
 * being judged is the one somebody wrote, not the sum of everything inside it.
 */
function inlineObjects(body) {
  const out = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== "{") continue;
    let depth = 1;
    let fields = 0;
    let j = i + 1;
    let atOwnDepth = "";
    while (j < body.length && depth > 0) {
      const c = body[j];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      if (depth === 1 && c !== "{" && c !== "}") atOwnDepth += c;
      j++;
    }
    fields = [...atOwnDepth.matchAll(/(?:^|[;,\n])\s*(?:readonly\s+)?[A-Za-z_$][\w$]*\s*\??\s*:/g)].length;
    out.push({ index: i, fields });
  }
  return out;
}

/* ------------------------------------------------------------- the wire ---- */

const wires = walk(join(ROOT, "web", "src")).filter((f) => /wire\.ts$/.test(f));
if (wires.length === 0) fail("web: no wire module found — this guard is checking nothing");

/**
 * ⚠️ PRIMITIVES AND `Readonly<Record<…>>` ARE FINE. What is refused is an
 * INLINE OBJECT with fields — `{ name: string; purpose: string }` — because that
 * is a shape being described rather than referenced, and describing is where an
 * invented field comes from.
 */
const PRIMITIVE = /^(string|number|boolean|null|undefined|unknown|never|void|Instant|Date)$/;

let interfaces = 0;
let referenced = 0;

for (const file of wires) {
  const rel = relative(ROOT, file);
  const src = stripComments(readFileSync(file, "utf8"));

  /* Every `export interface X { … }`, body taken to the matching brace depth. */
  for (const m of src.matchAll(/export\s+interface\s+([A-Z][A-Za-z0-9_]*)[^{]*\{/g)) {
    const name = m[1];
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < src.length && depth > 0) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    const body = src.slice(start, i - 1);
    interfaces++;

    /*
      ⚠️ AN INLINE OBJECT WITH TWO OR MORE FIELDS IS A SHAPE BEING DESCRIBED, and
      describing is where an invented field comes from. One field is not: that is
      how a named type is narrowed or its formatting changed —
      `Omit<Looked, "on"> & { on: Instant }` names the real type and re-types one
      column of it, which is the whole job of this module. Two or more fields
      means nothing was named, and nothing was named means nothing was checked.
    */
    for (const at of inlineObjects(body)) {
      if (at.fields < 2) continue;
      const line = src.slice(0, start + at.index).split("\n").length;
      fail(
        `${rel}:${line}: "${name}" spells out a ${at.fields}-field object instead of naming a kernel type.\n` +
        `       A described shape is one nobody checked against what the handler returns — ` +
        `which is how a screen came to render \`purpose\` and \`region\` on a subprocessor that has neither.`,
      );
    }

    /*
      ⚠️ AND EVERY CAPITALISED TYPE IT NAMES MUST BE ONE THE KERNEL EXPORTS or one
      declared in this package. A type imported from nowhere is the same invention
      with an extra step.
    */
    const named = [...body.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map((x) => x[1]);
    const local = new Set([...src.matchAll(/(?:interface|type)\s+([A-Z][A-Za-z0-9_]*)/g)].map((x) => x[1]));
    /* What the module imports, from anywhere — a name it did not invent. */
    const imported = new Set(
      [...src.matchAll(/import[^;]*?\{([^}]*)\}\s*from/g)]
        .flatMap((x) => x[1].split(",").map((t) => t.replace(/\btype\b/, "").trim().split(/\s+as\s+/).pop()))
        .filter(Boolean),
    );
    for (const t of named) {
      if (PRIMITIVE.test(t) || t === "Readonly" || t === "Record" || t === "Omit" || t === "Pick" || t === "Partial") continue;
      if (kernelTypes.has(t)) { referenced++; continue; }
      if (local.has(t) || imported.has(t)) continue;
      fail(`${rel}: "${name}" names "${t}", which neither the kernel exports nor this module imports.`);
    }
  }
}

if (!bad) {
  ok(`wire: ${interfaces} interface(s) across ${wires.length} module(s), ${referenced} kernel reference(s), no shape described twice`);
}

console.log(
  bad
    ? `\n${bad} wire failure(s). A screen may not describe a payload; it may only name one.`
    : "\nwire: every screen's input is a kernel type or a primitive — no shape is described twice.",
);
process.exit(bad ? 1 : 0);
