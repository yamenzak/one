#!/usr/bin/env node
/**
 * DID IT ACTUALLY COME UP?
 *
 * ⚠️ "DEPLOYED" IS NOT "WORKING", AND ONLY A REQUEST TELLS THEM APART. A
 * previous platform shipped green from its deploy workflow for a day while the
 * auth factory threw in the first middleware, so every route answered 500 —
 * `/health` included — and the page still loaded, because static assets never
 * reach the worker. Nothing in the workflow noticed, because nothing asked.
 *
 * ⚠️ AND A HOSTNAME THAT DOES NOT RESOLVE IS A NOTICE, NOT A FAILURE. DNS and
 * the worker routes are dashboard steps; failing the deploy over them would mean
 * a correct deploy is red until somebody clicks through Cloudflare. A hostname
 * that DOES resolve and answers wrongly is a failure, because that is ours.
 *
 * Usage: node engine/scripts/boot-check.mjs [origin]
 * Default origin: https://<ROOT from wrangler.jsonc>
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = join(HERE, "..", "one", "wrangler.jsonc");

const root = /"ROOT"\s*:\s*"([^"]+)"/.exec(readFileSync(CONFIG, "utf8"))?.[1];
if (!root) {
  console.error("BAD  engine/one/wrangler.jsonc sets no ROOT — every hostname would classify as no door.");
  process.exit(1);
}

const origin = process.argv[2] ?? `https://${root}`;
const notice = (m) => console.log(`::notice::${m}`);

/**
 * ⚠️ THE SIGNPOST AND ONE OTHER DOOR. Probing only the apex would pass on a
 * deployment whose wildcard route is missing — which is the failure that leaves
 * every workspace and the account door unreachable while the landing page is
 * fine, and it is the one most likely to happen first.
 */
const DOORS = [
  { url: `${origin}/health`, expect: "signpost" },
  { url: origin.replace("//", "//id."), expect: "account", path: "/health" },
];

let bad = 0;

for (const door of DOORS) {
  const url = door.path ? `${door.url}${door.path}` : door.url;
  let res;
  try {
    res = await fetch(url, { redirect: "manual" });
  } catch (why) {
    const code = why?.cause?.code ?? why?.code ?? "";
    /* ⚠️ Not resolving is DNS, which is a dashboard step and therefore ours to
       report rather than to fail on. Anything else reached the network. */
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
      notice(`${url} does not resolve yet — DNS and the worker route are dashboard steps.`);
      continue;
    }
    console.error(`BAD  ${url}: ${code || why}`);
    bad++;
    continue;
  }

  if (res.status !== 200) {
    console.error(`BAD  ${url} answered ${res.status}. It resolves, so this is ours.`);
    /* 503 is the worker saying it is not configured — name it, because the
       reason is in the worker's log and nowhere else. */
    if (res.status === 503) console.error(`     A 503 here means ROOT or AUTH_SECRET is unset. Check the worker's logs.`);
    bad++;
    continue;
  }

  const body = await res.json().catch(() => null);
  if (body?.door !== door.expect) {
    console.error(`BAD  ${url} reports door "${body?.door}", expected "${door.expect}".`);
    console.error(`     ROOT is "${root}" — a mismatch here means the worker's ROOT and its route disagree.`);
    bad++;
    continue;
  }
  console.log(`ok   ${url} → ${door.expect}`);
}

console.log(bad ? `\nboot: ${bad} door(s) deployed and not working.` : `\nboot: One is up.`);
process.exit(bad ? 1 : 0);
