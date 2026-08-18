/**
 * WHAT EACH PACKAGE CAN DO, AND WHETHER ANYTHING REACHES IT — resolved ONCE.
 *
 * ⚠️ THE GUARD AND THE INVENTORY READ THIS, FOR THE REASON `lib/rules.mjs`
 * EXISTS. Those two had written their own walks and disagreed about four rules;
 * a guard and the document describing it giving different answers is the failure
 * the guard refuses, one level up. Two walks over one question is one walk and a
 * copy, and the copy is the one that goes stale.
 */

import { files, read } from "./rules.mjs";

/**
 * ⚠️ THE KERNEL IS ASKED THE SAME QUESTION, and it is not a smaller one. A
 * kernel export is what an APP reaches for, so one nothing reaches is either a
 * promise no product could keep or — twice already — a second, SMALLER answer to
 * a question the runtime answers correctly. `surfaceOf` claimed to be
 * "everything an app answers on" and knew nothing of the roster, the package
 * rail, the settings or the bill; `toolsOf` built a catalogue the agent door
 * cannot use, because the real one is filtered per caller by the gate. Both were
 * deleted rather than deferred, which is the third honest answer.
 */
const PACKAGES = [
  { pkg: "runtime", barrel: "@engine/runtime",
    consumers: ["one/src", "one-space/src", "apps/hello/src"] },
  { pkg: "kernel", barrel: "@engine/kernel",
    consumers: ["runtime/src", "design/src", "one/src", "one-space/src", "apps/hello/src"] },
];

/**
 * ⚠️ VALUES ONLY. A type has no lane to be mounted in — it either compiles or it
 * does not, and asking this question of one produces noise nobody can act on.
 */
const VALUE = /^export (?:async )?(?:function|const|class) (\w+)/gm;

/* --------------------------------------------------------------- reached --- */

/** The names one file takes from one source, as the import statement lists them. */
const namesFrom = (text, from) => {
  const out = new Set();
  const at = new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*"${from}"`, "g");
  for (const m of text.matchAll(at)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (name) out.add(name);
    }
  }
  return out;
};

/*
  ⚠️ WHAT IS ABOVE A PACKAGE IS ITS OUTSIDE, AND IT REACHES IN THROUGH ONE
  BARREL. So what those files import from `@engine/<pkg>` is the whole of what
  the layers above actually use — and a guard is one of them, because a guard
  that applies a kernel rule imports it and calls it.
*/
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const load = (of) => {
  const paths = files(`${of.pkg}/src`).filter((f) => !f.endsWith("/index.ts"));
  const src = new Map(paths.map((f) =>
    [f.replace(`${of.pkg}/src/`, "").replace(/\.tsx?$/, ""), read(f)]));

  const above = [
    ...of.consumers.flatMap((d) => files(d)),
    ...files("scripts", /\.test\.mjs$/),
  ].map(read).join("\n");
  const outside = new Set([
    ...namesFrom(above, of.barrel.replace("/", "\\/")),
    ...namesFrom(above, `\\.\\./${of.pkg}/src/[\\w.]+`),
  ]);

  const declared = new Map();
  for (const [mod, text] of src) {
    for (const m of text.matchAll(VALUE)) declared.set(m[1], mod);
  }

  const reaches = (name, own) => {
    if (outside.has(name)) return true;
    for (const [mod, text] of src) {
      if (mod !== own && namesFrom(text, `\\./${own}\\.js`).has(name)) return true;
    }
    /* Its own module may use it — a store's read behind its own operation. */
    const body = strip(src.get(own)).replace(
      new RegExp(`^export (?:async )?(?:function|const|class) ${name}\\b`, "gm"), "");
    return new RegExp(`\\b${name}\\b`).test(body);
  };

  return { src, declared, reaches };
};

/* -------------------------------------------------------------- deferred --- */

/**
 * ⚠️ A MARKER ON THE MODULE COVERS THE MODULE. The vault is not mounted as a
 * feature, not as ten separate oversights, and ten copies of one sentence is
 * nine that go stale. The per-module count is printed instead, so a capability
 * quietly added to a waiting module shows up as the number going up.
 */
const MARKER = /DEFER\(engine-(\d+)\)/;

/*
  ⚠️ AND THE WINDOW IS THE PREVIOUS EXPORT, NOT A CHARACTER COUNT. A 900-character
  look-back excused whatever happened to sit near a marker: `forget` and
  `surfaceOfComposed` are adjacent in `compose.ts`, so un-mounting the second one
  was absorbed by the first one's deferral and the mutation test passed. The
  comment block between one export and the next belongs to exactly one of them.
*/
const deferralFor = (src, name, mod) => {
  const text = src.get(mod);
  const at = Math.max(
    text.indexOf(`export function ${name}`),
    text.indexOf(`export const ${name}`),
    text.indexOf(`export async function ${name}`),
    text.indexOf(`export class ${name}`),
  );
  const before = text.slice(0, at);
  const previous = [...before.matchAll(/^export /gm)].pop();
  const own = before.slice(previous ? previous.index : 0).match(MARKER)?.[1];
  if (own) return own;
  /* The file header — everything above the first import. */
  const head = text.slice(0, text.search(/^import /m) < 0 ? 0 : text.search(/^import /m));
  return head.match(MARKER)?.[1] ?? null;
};


/** Every value a package exports, its module, and the stage it waits on. */
export function resolveCapabilities(pkg) {
  const of_ = PACKAGES.find((p) => p.pkg === pkg);
  if (!of_) throw new Error(`no such package: ${pkg}`);
  const { src, declared, reaches } = load(of_);
  return [...declared].map(([name, module]) => {
    const mounted = reaches(name, module);
    return { name, module, mounted, stage: mounted ? null : deferralFor(src, name, module) };
  });
}

export { PACKAGES, load, deferralFor };
