#!/usr/bin/env node
/**
 * DID IT COME UP? — the check that stands between "deployed" and "working".
 *
 * `apps.mjs ready` asks whether an app's wrangler.jsonc binds REAL resource ids.
 * That is a question about the CONFIG, and it is blind to the failure that has
 * actually cost days here: a worker that deploys perfectly and then throws on
 * every request.
 *
 * Tessa shipped green from `deploy.yml` for a day while `createAuth` threw
 * "BETTER_AUTH_SECRET is not set" in the first middleware. Every route 500'd —
 * `/health` included, because it is mounted behind that middleware — and the SPA
 * still loaded, because static assets are served by the assets binding and never
 * touch the worker. So the app looked alive, CI was green, the deploy was green,
 * and nothing anywhere said a word.
 *
 * `/health` is the right probe precisely BECAUSE it sits behind the whole
 * middleware chain: reaching it proves the worker can resolve a host, apply its
 * schema and construct its auth instance. A `/health` that answered before the
 * middleware would be a liveness check for the runtime, not for the app.
 *
 * ── The one outcome that is NOT a failure ───────────────────────────────────
 *
 * DNS and the ACM certificate are dashboard steps (DEPLOY.md §11) and legitimately
 * lag a first deploy. An address that does not RESOLVE is therefore a notice: the
 * worker may be perfect and simply unaddressed. An address that resolves and
 * answers wrongly is a failure — that is a live app down.
 *
 * Plain Node, no dependencies: the workflows run this without `pnpm install`.
 *
 * Usage: node scripts/boot-check.mjs <app-id> [--attempts N] [--delay SECONDS]
 */

import { publicOrigin } from "./apps.mjs";

const [, , id, ...rest] = process.argv;
if (!id) {
  console.error("Usage: node scripts/boot-check.mjs <app-id> [--attempts N] [--delay SECONDS]");
  process.exit(2);
}

const flag = (name, fallback) => {
  const i = rest.indexOf(name);
  return i === -1 ? fallback : Number(rest[i + 1]);
};
/**
 * Retried, because a deploy and a `secret put` both take a moment to reach every
 * edge. A single probe would turn propagation into a red build, and a check that
 * cries wolf is a check people start ignoring — which is worse than not having it.
 */
const attempts = flag("--attempts", 5);
const delayMs = flag("--delay", 6) * 1000;

/** GitHub renders these; outside Actions they are just prefixed lines. */
const annotate = (level, msg) => console.log(`::${level}::${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** DNS has not been pointed here yet — distinct from every other failure. */
const UNRESOLVED = new Set(["ENOTFOUND", "EAI_AGAIN"]);
function unresolved(err) {
  for (let e = err; e; e = e.cause) if (UNRESOLVED.has(e.code)) return true;
  return false;
}

const origin = publicOrigin(id);
if (!origin) {
  console.log(`${id} declares no public origin (no BETTER_AUTH_URL) — nothing to probe.`);
  process.exit(0);
}

const url = `${origin}/health`;
let last = null;

for (let i = 1; i <= attempts; i++) {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    if (res.ok) {
      console.log(`✓ ${url} → ${res.status}. ${id} boots.`);
      process.exit(0);
    }
    last = { kind: "status", status: res.status, body: (await res.text().catch(() => "")).slice(0, 200) };
  } catch (err) {
    if (unresolved(err)) {
      annotate(
        "notice",
        `${origin} does not resolve yet — DNS and the ACM certificate are dashboard steps (DEPLOY.md §11). ` +
          `Skipping the boot check for ${id}; it is not evidence the worker is broken.`,
      );
      process.exit(0);
    }
    last = { kind: "network", message: String(err?.message ?? err) };
  }
  if (i < attempts) await sleep(delayMs);
}

if (last?.kind === "status") {
  annotate(
    "error",
    `${id} deployed, but ${url} answered ${last.status} instead of 200 — the worker is up and failing every ` +
      `request. Most likely BETTER_AUTH_SECRET is not set on it: auth refuses to start on a fallback key outside ` +
      `development, and it throws in the FIRST middleware, so /health goes down with everything else. ` +
      `Run the "Provision an app on Cloudflare" workflow for ${id} (it mints the secret only when confirmed absent), ` +
      `and read \`wrangler tail --name ${id}\` for the actual exception.` +
      (last.body ? ` Response: ${JSON.stringify(last.body)}` : ""),
  );
} else {
  annotate("error", `Could not reach ${url} after ${attempts} attempts: ${last?.message ?? "unknown"}.`);
}
process.exit(1);
