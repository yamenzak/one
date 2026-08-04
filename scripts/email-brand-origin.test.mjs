#!/usr/bin/env node
/**
 * AN APP'S HARDCODED EMAIL ORIGIN MUST BE THE ORIGIN IT IS ACTUALLY DEPLOYED ON.
 *
 * A mail client fetches an image over the open internet: no session, no cookies,
 * no notion of our origin. So every brand asset in an email has to be an
 * ABSOLUTE url, and the app's own brand kit is bound at module load — where
 * there is no `env` and therefore no `BETTER_AUTH_URL` to read. The origin is
 * written out by hand in `src/mailer.ts`, and this is what stops it drifting.
 *
 * The drift is silent in the way this repo keeps finding: a wrong origin is
 * valid TypeScript, passes every unit and integration test, and is wrong only in
 * a real inbox — where it presents as a broken image at the top of the message,
 * with nothing anywhere saying which constant caused it. Nobody re-reads a
 * hardcoded hostname when they move an app to a new domain; they change
 * `wrangler.jsonc` and ship.
 *
 * Only apps that HAVE the constants are checked. An app whose mail is a plain
 * wordmark on a dark card is a complete, correct email — `iconUrl` and `siteUrl`
 * are both optional in `BrandKit`, and pointing at an asset that does not exist
 * is strictly worse than pointing at none.
 *
 * Plain Node, no dependencies, like the rest of `scripts/`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apps } from "./apps.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
let bad = 0;
let checked = 0;
const fail = (m) => (console.error(`BAD  ${m}`), bad++);

/** `BETTER_AUTH_URL` out of a wrangler JSONC `vars` block, without a parser. */
const authUrlOf = (jsonc) => /"BETTER_AUTH_URL"\s*:\s*"([^"]+)"/.exec(jsonc)?.[1]?.replace(/\/$/, "") ?? null;

/** The value of one key in the app's exported BrandKit literal. */
const brandField = (src, key) => new RegExp(`\\b${key}\\s*:\\s*"([^"]+)"`).exec(src)?.[1] ?? null;

for (const a of apps) {
  if (!a.email) continue;
  let mailer;
  let wrangler;
  try {
    mailer = readFileSync(join(ROOT, a.dir, "src/mailer.ts"), "utf8");
    wrangler = readFileSync(join(ROOT, a.dir, "wrangler.jsonc"), "utf8");
  } catch {
    // `sender-default.test.mjs` already fails on a missing mailer; not twice.
    continue;
  }
  const origin = authUrlOf(wrangler);
  if (!origin) {
    fail(`${a.dir}/wrangler.jsonc declares no BETTER_AUTH_URL, so nothing here can be checked against it.`);
    continue;
  }

  const site = brandField(mailer, "siteUrl");
  if (site) {
    checked++;
    if (site.replace(/\/$/, "") !== origin) {
      fail(
        `${a.dir}/src/mailer.ts puts "${site}" in the email footer, but the app is deployed at "${origin}".\n` +
          `     The footer link is the only line in the message that says where it came from — a stale one sends people to a dead host.`,
      );
    }
  }

  const icon = brandField(mailer, "iconUrl");
  if (icon) {
    checked++;
    if (!icon.startsWith(`${origin}/`)) {
      fail(
        `${a.dir}/src/mailer.ts serves its email icon from "${icon}", which is not under the app's origin "${origin}".\n` +
          `     A mail client fetches it with no session, so it has to be an absolute url on a host that actually serves the asset.`,
      );
    } else if (!/^https:/.test(icon)) {
      fail(`${a.dir}/src/mailer.ts serves its email icon over plain HTTP (${icon}). Mail clients block mixed content.`);
    }
  }
}

if (bad) {
  console.error(`\n${bad} problem(s). A hardcoded email origin is wrong only in a real inbox, and only as a broken image.`);
  process.exit(1);
}
console.log(`✓ ${checked} hardcoded email origin(s) match their app's deployed BETTER_AUTH_URL`);
