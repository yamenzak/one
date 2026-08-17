/**
 * ONE BUNDLE FOR EVERY PRODUCT (D17), AND ONE LANE TO EVERY PROVIDER (D14).
 *
 * ⚠️ BOTH DECISIONS SAY "THEREFORE NEVER" AND NEITHER HAD A CHECK. D17's list
 * opens with *a page importing `@engine/<app>`* — which OneSpace did, at module
 * scope, behind an `import.meta.env.DEV` branch that reads as dev-only and is
 * not: a module graph is decided before a branch is. The reference app's whole
 * manifest and every screen shipped to every customer, and the marker string was
 * measurable in the built `index-*.js`.
 *
 * ⚠️ AND THE OBVIOUS FIX IS HALF A FIX. Moving it behind a bare `React.lazy`
 * emits the chunk anyway, which forces the shared chunk to keep every symbol
 * that chunk could reach exported — the design system stops being tree-shakeable
 * and index grew 147 KB while the app moved into 45 KB nothing requests. The
 * import has to be unreachable in production, not merely deferred.
 *
 * ⚠️ D14 IS THE SAME SHAPE ONE LAYER DOWN: every provider call goes through the
 * platform AI binding, because the gateway is where the actual token count and
 * cost of the actual call are reported. A direct `fetch` past it is a cost this
 * side of the meter cannot see, which is how a model came to be priced at
 * flash-tier rates while a Pro model answered.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const files = (dir, match = /\.(ts|tsx)$/) => {
  const out = [];
  const walk = (at) => {
    let entries;
    try { entries = readdirSync(join(ENGINE, at), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const p = `${at}/${entry.name}`;
      if (entry.isDirectory()) walk(p);
      else if (match.test(entry.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
};
const read = (p) => readFileSync(join(ENGINE, p), "utf8");

/* ------------------------------------------------------------------ bundle --- */

/*
  ⚠️ THE ONE EXEMPTION IS THE TEST GROUND, AND IT IS EXEMPT ONLY BECAUSE NOTHING
  IN PRODUCTION CAN REACH IT. A file naming an app is fine; a file naming an app
  that production's module graph includes is the whole finding.
*/
const GROUND = "one-space/src/Ground.tsx";
const APP_IMPORT = /^import[\s\S]*?from "@engine\/(hello|[a-z-]+)\/?[\w./]*";$/gm;

const importers = files("one-space/src").filter((f) => {
  const src = read(f);
  return [...src.matchAll(APP_IMPORT)]
    .some((m) => !["design", "kernel", "runtime"].includes(m[1]));
});

const strays = importers.filter((f) => f !== GROUND);
if (strays.length) {
  fail(`bundle: ${strays.join(", ")} import a product at module scope — D17's first "therefore never", and it ships that product's whole manifest to every customer of every other one`);
} else {
  ok(`bundle: ${files("one-space/src").length} page file(s), none importing a product`);
}

/*
  ⚠️ AND THE GROUND IS REACHED ONLY WHERE IT CANNOT SHIP. `import.meta.env.DEV`
  around the dynamic import is what makes it unreachable rather than merely lazy
  — and the difference is not subtle, it is whether a chunk is emitted and the
  shared bundle stops shaking.
*/
const app = read("one-space/src/App.tsx");
const gated = /import\.meta\.env\.DEV[\s\S]{0,120}?import\("\.\/Ground\.js"\)/.test(app);

if (gated) {
  ok("bundle: the ground is unreachable in production, so no chunk is emitted for it");
} else {
  fail("bundle: the ground's import is not behind import.meta.env.DEV — a bare lazy import still emits the chunk and pins every symbol it could reach as an export of the shared one, which stops the design system tree-shaking");
}

/* --------------------------------------------------------------- provider --- */

/*
  ⚠️ THE AI LANE HAS ONE DOOR. `services.ts` is where a provider is spoken to;
  everywhere else a `fetch` to a model API is a call the gateway never sees, so
  its tokens and its cost are invisible to the half of metering that pays for
  them.
*/
const PROVIDER = /fetch\(\s*[`"']https?:\/\/[^`"']*(googleapis|openai|anthropic|api\.cloudflare)/i;
const LANE_DOOR = "runtime/src/services.ts";

const direct = files("runtime/src")
  .filter((f) => f !== LANE_DOOR && PROVIDER.test(read(f)));

if (direct.length) {
  fail(`bundle: ${direct.join(", ")} calls a provider directly — past the gateway, so the actual token count and cost of that call are never reported and the reserve is settled against a guess`);
} else {
  ok(`bundle: ${files("runtime/src").length} runtime file(s), every provider call through the one lane`);
}

console.log(bad ? `\nbundle: ${bad} problem(s).` : "\nbundle: green.");
process.exit(bad ? 1 : 0);
