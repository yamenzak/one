#!/usr/bin/env node
/**
 * AN APP'S HARDCODED SENDER MUST BE THE ONE THE PLATFORM ACTUALLY ONBOARDED.
 *
 * There is ONE transactional address for the whole platform — `apps.json`'s
 * `defaultEmailAddress` — with a per-app display name. That is not tidiness: a
 * sending domain is onboarded in Cloudflare Email Service per DOMAIN, by hand,
 * once. Sharing the address means a new app inherits a sender that already
 * delivers instead of a plausible-looking one that bounces.
 *
 * Kova's `PLATFORM_FROM_DEFAULT` read `Kova <noreply@kova.4dl.app>` and the
 * template's read `Template <noreply@template.4dl.app>`. Both look right. Both
 * are SUBDOMAINS, which Cloudflare treats as different domains, and neither was
 * onboarded.
 *
 * ── Why it stayed hidden ────────────────────────────────────────────────────
 *
 * The two lanes read different keys. Sign-in codes go out on `email.from`,
 * which provisioning seeds to the shared address, so they deliver and email
 * looks configured. The TENANT lane reads `email.platform_from` and falls back
 * to this constant — so the first client invite is refused at the provider,
 * long after anyone would think to doubt the mail setup, and the failure looks
 * like anything except a sender address.
 *
 * Checked structurally because nothing else can: a constant that disagrees with
 * the registry is valid TypeScript, passes every test, and is wrong only in
 * production, only on one lane, and only against a provider we cannot call from
 * CI. Plain Node, no dependencies, like the rest of `scripts/`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { registry, apps } from "./apps.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
let bad = 0;
const fail = (m) => (console.error(`BAD  ${m}`), bad++);

const shared = registry.defaultEmailAddress;
if (!shared) fail("apps.json has no `defaultEmailAddress` — every check below would pass vacuously.");

/** `Name <a@b.c>` → `a@b.c`; a bare address → itself. */
const bareAddress = (s) => (/<([^<>]+)>/.exec(s)?.[1] ?? s).trim().toLowerCase();

for (const a of apps) {
  // An app with no `email` entry sends no transactional mail and needs no sender.
  if (!a.email) continue;
  const file = join(ROOT, a.dir, "src/mailer.ts");
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    fail(`${a.id} declares an email sender in apps.json but has no ${a.dir}/src/mailer.ts to hold its default.`);
    continue;
  }
  const m = /PLATFORM_FROM_DEFAULT\s*=\s*"([^"]+)"/.exec(src);
  if (!m) {
    fail(`${a.dir}/src/mailer.ts has no PLATFORM_FROM_DEFAULT. The tenant lane falls back to @4dl/email's fail-loud address instead.`);
    continue;
  }
  const got = bareAddress(m[1]);
  if (got !== shared.toLowerCase()) {
    fail(
      `${a.dir}/src/mailer.ts sends the tenant lane from "${got}", but the platform's onboarded address is "${shared}".\n` +
        `     Cloudflare onboards a sending DOMAIN, so a subdomain is a different domain and is not covered. Sign-in codes\n` +
        `     would still deliver (they read email.from), so this fails on the tenant lane only — the client invite.`,
    );
  }
}

if (bad) {
  console.error(`\n${bad} problem(s). A sender that is not the onboarded one bounces at the provider, on one lane, in production only.`);
  process.exit(1);
}
console.log(`✓ every app's transactional sender is the platform's onboarded address (${shared})`);
