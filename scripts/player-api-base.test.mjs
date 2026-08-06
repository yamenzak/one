#!/usr/bin/env node
/**
 * THE SCREEN PLAYER'S API BASE — the one constant that ships un-reviewed.
 *
 * `apps/scena-player` is a separate worker on a separate origin (`tv.4dl.app`),
 * so it cannot say `/api/…`: every call is cross-origin and `API_BASE` is baked
 * in at BUILD time from `VITE_API_BASE`.
 *
 * **That variable is set nowhere in this repo** — not in a `.env`, not in
 * `deploy.yml`, not in any wrangler config. So the FALLBACK in `config.ts` is
 * what a television actually runs, and it is the only thing standing between a
 * deploy and a fleet of screens that can reach nothing.
 *
 * It shipped wrong. `http://localhost:8787` was:
 *   • a loopback address no TV has, and
 *   • in this monorepo, *Kova's* port — so a developer pointing the player at
 *     Scena locally was pointing it at another product.
 *
 * The first fix was still wrong: `https://scena.4dl.app` is the DASHBOARD's
 * origin, and the pairing/manifest/asset routes answer only on the DEVICE door
 * (`play.`), which `@4dl/tenancy` classifies separately because a screen is not
 * a user session. Everywhere else they answer `{"error":"wrong_door"}` — and
 * the player renders that as "offline — no cached channel yet", two steps
 * removed from its cause.
 *
 * Neither mistake failed anywhere: no typecheck, no unit test, no build. This
 * is the check that makes the third one impossible.
 *
 * Plain Node with `node:assert`, like the repo's other script tests — the
 * workflows run these before `pnpm install`, so it cannot need vitest.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CONFIG = new URL("../apps/scena-player/src/config.ts", import.meta.url).pathname;
const src = readFileSync(CONFIG, "utf8");

let failures = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`  ✗ ${name}\n    ${e.message}`);
  }
};

console.log("the screen player's API base");

/**
 * The fallback, as written. Deliberately matched on the `??` arm and nothing
 * else: `VITE_API_BASE` is the override and may be anything a developer needs.
 */
function fallback() {
  const m = /VITE_API_BASE[\s\S]{0,120}?\?\?\s*"([^"]+)"/.exec(src);
  assert.ok(m, "could not find the `VITE_API_BASE ?? \"…\"` fallback in config.ts");
  return m[1];
}

test("there is a fallback at all — it is what ships", () => {
  assert.ok(fallback().length > 0);
});

test("it is https, because a television is not on your laptop", () => {
  const url = fallback();
  assert.ok(url.startsWith("https://"), `expected an https origin, got ${url}`);
  assert.ok(
    !/localhost|127\.0\.0\.1|:\d{4}/.test(url),
    `the fallback is a local address (${url}) — that is what shipped, twice`,
  );
});

test("it is the DEVICE door, not the dashboard's origin", () => {
  const url = fallback();
  const host = new URL(url).hostname;
  assert.ok(
    host.startsWith("play."),
    `expected the device door (play.<root>), got ${host} — the pairing, manifest and asset routes answer "wrong_door" anywhere else`,
  );
});

test("it names Scena, not another product in this monorepo", () => {
  // The specific failure this repo has already had once: 8787 is Kova's port.
  assert.match(new URL(fallback()).hostname, /scena/, "the player must point at Scena's own root domain");
});

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("✓ the player's shipped API base is Scena's device door");
