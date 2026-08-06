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

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { registry, apps } from "./apps.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
let bad = 0;
const fail = (m) => (console.error(`BAD  ${m}`), bad++);

const shared = registry.defaultEmailAddress;
if (!shared) fail("apps.json has no `defaultEmailAddress` — every check below would pass vacuously.");

/** `Name <a@b.c>` → `a@b.c`; a bare address → itself. */
const bareAddress = (s) => (/<([^<>]+)>/.exec(s)?.[1] ?? s).trim().toLowerCase();

/** Every `.ts` under an app's `src/`, one level deep — enough for every app here. */
function appSources(dir) {
  const out = [];
  for (const sub of ["src"]) {
    let names;
    try {
      names = readdirSync(join(ROOT, dir, sub));
    } catch {
      continue;
    }
    for (const n of names) if (n.endsWith(".ts")) out.push(`${sub}/${n}`);
  }
  return out;
}

for (const a of apps) {
  // An app with no `email` entry sends no transactional mail and needs no sender.
  if (!a.email) continue;

  /*
    The constant is searched for across the app's `src/`, not read out of
    `mailer.ts` by name.

    It used to be the latter, and Scena had to move its definition into
    `billing-seed.ts` to break an import cycle (mailer → billing-store →
    billing-seed → mailer, which resolved the constant to `undefined` at module
    init and surfaced as a D1 type error on a fresh database). A guard that
    insists on a FILENAME turns a legitimate refactor into a failure and invites
    someone to weaken it. What it actually cares about is that the app has ONE
    sender constant and that it matches the registry.
  */
  const found = [];
  for (const f of appSources(a.dir)) {
    let src;
    try {
      src = readFileSync(join(ROOT, a.dir, f), "utf8");
    } catch {
      continue;
    }
    for (const hit of src.matchAll(/PLATFORM_FROM_DEFAULT\s*=\s*"([^"]+)"/g)) found.push({ f, value: hit[1] });
  }
  if (found.length === 0) {
    fail(`${a.dir}/src has no PLATFORM_FROM_DEFAULT. The tenant lane falls back to @4dl/email's fail-loud address instead.`);
    continue;
  }
  if (found.length > 1) {
    fail(`${a.dir}/src defines PLATFORM_FROM_DEFAULT ${found.length} times (${found.map((x) => x.f).join(", ")}). Two answers to one question.`);
    continue;
  }
  const m = [null, found[0].value];
  const got = bareAddress(m[1]);
  if (got !== shared.toLowerCase()) {
    fail(
      `${a.dir}/${found[0].f} sends the tenant lane from "${got}", but the platform's onboarded address is "${shared}".\n` +
        `     Cloudflare onboards a sending DOMAIN, so a subdomain is a different domain and is not covered. Sign-in codes\n` +
        `     would still deliver (they read email.from), so this fails on the tenant lane only — the client invite.`,
    );
  }

  /*
    THE SEED IS THE OTHER DOOR, and it is the one that actually decides.

    `PLATFORM_FROM_DEFAULT` is only a FALLBACK: it applies when `email.from`
    has no row. An app that SEEDS that key on first boot writes a real row, and
    the row wins — so an app can pass every check above and still send from a
    domain nobody onboarded. Scena did: its catalog seed carried
    `Scena <noreply@fourdegreelabs.com>` while its constant was correct.

    Checked by literal, deliberately. Any `"email.from": "…"` in the app's
    source with an address in it is a second answer to a question that has one,
    and the fix is always the same — reference the constant.
  */
  for (const f of appSources(a.dir)) {
    let seedSrc;
    try {
      seedSrc = readFileSync(join(ROOT, a.dir, f), "utf8");
    } catch {
      continue;
    }
    for (const hit of seedSrc.matchAll(/"email\.from"\s*:\s*"([^"]*@[^"]*)"/g)) {
      const seeded = bareAddress(hit[1]);
      if (seeded !== shared.toLowerCase()) {
        fail(
          `${a.dir}/${f} SEEDS email.from as "${seeded}", but the platform's onboarded address is "${shared}".\n` +
            `     A seeded row beats PLATFORM_FROM_DEFAULT, so this silently overrides the constant checked above.\n` +
            `     Reference PLATFORM_FROM_DEFAULT instead of writing a second literal.`,
        );
      }
    }
  }
}

if (bad) {
  console.error(`\n${bad} problem(s). A sender that is not the onboarded one bounces at the provider, on one lane, in production only.`);
  process.exit(1);
}
console.log(`✓ every app's transactional sender is the platform's onboarded address (${shared})`);
