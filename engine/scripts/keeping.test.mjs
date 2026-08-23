/**
 * A FILE THAT CANNOT CHANGE IS NOT ASKED ABOUT AGAIN.
 *
 * @design a content-hashed asset is kept; the document that names it is not.
 *
 * ⚠️ EIGHTEEN CONDITIONAL ROUND TRIPS, ON EVERY VISIT, ANSWERED "STILL THE
 * SAME". Cloudflare's static assets default to `public, max-age=0,
 * must-revalidate` for everything they serve, and this deployment took the
 * default — so a phone opening the product asked the server about every hashed
 * file in `/assets/` before it could run any of them: the entry bundle, the
 * stylesheet, five Geist weights, three Onest, and every lazily-loaded chunk.
 * Measured on the live deployment with `curl -D -`, on files whose names are
 * their own content hashes.
 *
 * ⚠️ AND IT IS THE FAILURE THAT SURVIVES EVERY OTHER FIX. Twenty-five per cent
 * came off the entry chunk and the person watching noticed nothing, because the
 * cost they were paying was not the bundle's SIZE — it was a round trip per
 * file before any of it could start. Making the bundle smaller does not remove
 * a request; only telling the browser to keep the answer does.
 *
 * ⚠️ THE DOCUMENT IS THE ONE THING THAT MUST NOT BE KEPT. `index.html` names
 * which hashed files this deploy uses, so caching it pins a browser to the
 * previous build's names — and `engine/runtime/src/renewal.ts` reads that same document to
 * report which version is being served. One revalidated round trip on a 5 KB
 * file is the whole mechanism by which anybody ever gets a new build.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/**
 * ⚠️ THE WORKERS THAT SERVE A PAGE, READ FROM THEIR OWN CONFIG. A hand-written
 * list is one a second deployment is left out of, silently, on the day it is
 * added — and this is a defect nothing else in the repository can see, because
 * every suite passes and the only symptom is somebody's phone being slow.
 */
const serving = () => {
  const out = [];
  for (const entry of readdirSync(ENGINE, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const config = join(ENGINE, entry.name, "wrangler.jsonc");
    if (!existsSync(config)) continue;
    const src = readFileSync(config, "utf8");
    /* ⚠️ JSONC, so the comments come out before anything is parsed. */
    const bare = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const where = /"assets"\s*:\s*\{[^}]*?"directory"\s*:\s*"([^"]+)"/.exec(bare)?.[1];
    if (where) out.push([entry.name, join(ENGINE, entry.name, where)]);
  }
  return out;
};

const workers = serving();

if (!workers.length) {
  fail("no worker binds an assets directory — this guard would pass over nothing.\n"
    + "       It reads `assets.directory` out of each `wrangler.jsonc`, so a rename\n"
    + "       there disables the check rather than failing it.");
}

for (const [name, dist] of workers) {
  /*
    ⚠️ THE SOURCE, NOT THE BUILD. `dist` is gitignored and absent on a clean
    checkout, so asserting on it would make this guard pass by finding nothing —
    the exact shape it exists to refuse. Vite copies `public/` verbatim, so the
    file that has to exist is the one somebody wrote.
  */
  const from = join(dirname(dist), "public", "_headers");
  if (!existsSync(from)) {
    fail(`${name} serves ${dist.slice(ENGINE.length + 1)} and ships no \`_headers\`.\n`
      + "       Cloudflare's default is `max-age=0, must-revalidate` on everything,\n"
      + "       including files whose names are their own content hash — so every\n"
      + "       visit spends a round trip per asset asking whether a file that cannot\n"
      + "       have changed has changed.");
    continue;
  }

  const rules = readFileSync(from, "utf8");
  const said = rules.replace(/^#[^\n]*$/gm, "");

  /* ⚠️ BOTH WORDS. `max-age` alone is ignored on a reload, which is exactly what
     somebody does when a page feels slow — `immutable` is what covers it. */
  const kept = /^\/assets\/\*\s*$/m.test(said)
    && /Cache-Control:[^\n]*\bimmutable\b/i.test(said)
    && /Cache-Control:[^\n]*max-age=(\d{7,})/i.test(said);
  if (!kept) {
    fail(`${name}: \`_headers\` does not tell a browser to keep \`/assets/*\`.\n`
      + "       It needs `/assets/*` with a `Cache-Control` carrying both a long\n"
      + "       `max-age` and `immutable` — the second is what a reload obeys, and a\n"
      + "       reload is what somebody does when a page feels slow.");
  }

  /*
    ⚠️ AND THE DOCUMENT MUST NOT BE IN THERE. Keeping `index.html` pins a browser
    to the hashed names of the build it happened to fetch — a deploy that then
    reaches nobody, which is worse than the slowness this file exists to fix and
    much harder to see.
  */
  const pinned = [...said.matchAll(/^(\/[^\s]*)\s*$/gm)]
    .map((m) => m[1])
    .filter((p) => p === "/" || /index\.html$/.test(p) || p === "/*");
  if (pinned.length) {
    fail(`${name}: \`_headers\` has a rule for ${pinned.join(", ")}.\n`
      + "       The document names which hashed files this deploy uses, so a browser\n"
      + "       that keeps it keeps the PREVIOUS build — and `engine/runtime/src/renewal.ts`\n"
      + "       reads it to report the version being served.");
  }
}

if (!bad) {
  ok(`keeping: ${workers.length} worker(s) serving assets, each telling a browser `
    + "to keep what cannot change");
  ok("fresh: none of them keeps the document that names the build");
}

console.log(bad
  ? `\nkeeping: ${bad} finding(s) — a browser is asking about files that cannot have changed.`
  : "\nkeeping: hashed assets are kept, and the document that names them is not.");
process.exit(bad ? 1 : 0);
