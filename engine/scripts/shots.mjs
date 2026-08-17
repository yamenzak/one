/**
 * PHOTOGRAPHS OF THE REAL PRODUCT, THROUGH THE REAL DOORS.
 *
 * ⚠️ A SCREEN IS THE ONE THING NO TEST IN THIS REPOSITORY CAN CHECK. Everything
 * here typechecks, unit-tests and gates; none of that sees a logo rendering 36%
 * short, a stencil mask cutting the stem off a mark, or a column whose left edge
 * does not line up. Both of the first two shipped, both were caught by looking,
 * and this is what makes looking a command rather than an afternoon.
 *
 * ⚠️ IT DRIVES A REAL WORKER AND MAKES A REAL WORKSPACE. Photographing a mocked
 * screen proves the component renders, which is what the component test already
 * proves; what is worth a picture is what somebody actually meets, gate and all.
 *
 *   pnpm --filter @engine/space build
 *   (cd engine/one && npx wrangler dev --local --port 8099 --persist-to /tmp/wone)
 *   node engine/scripts/shots.mjs 8099 /tmp/wone.log
 *
 * ⚠️ IT NEEDS THE WORKER'S LOG, because the sign-in code is never stored — only
 * its hash is, which is the design. The development mailer prints it, and that
 * is the only place it exists.
 *
 * ⚠️ AND THE BUILD IS NOT OPTIONAL. `assets.directory` is a filesystem path, so
 * nothing connects the worker to the SPA's build: a stale one does not fail, it
 * produces convincing photographs of the previous design.
 */

import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
/* ⚠️ node:http, not fetch — undici REFUSES a `host` header and silently sends
   the URL's own, so every door-scoped call lands on the signpost and 404s. The
   whole product is addressed by host (D1), so this is not a detail. */
import { request as httpRequest } from "node:http";

/*
  ⚠️ PLAYWRIGHT IS NOBODY'S DIRECT DEPENDENCY HERE, and adding it as one would
  put a browser in the install of every package that never opens one. It arrives
  transitively through the E2E suite, so it is found rather than imported —
  and a version bump moves the directory, which is why the store is searched by
  name instead of a path being written down.
*/
const playwright = async () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  try { return await import("playwright"); } catch { /* not hoisted */ }
  const store = join(root, "node_modules", ".pnpm");
  const at = readdirSync(store).find((d) => /^playwright@/.test(d));
  if (!at) throw new Error("playwright is not installed — run pnpm install");
  return import(pathToFileURL(join(store, at, "node_modules/playwright/index.mjs")).href);
};

const PORT = Number(process.argv[2] ?? 8099);
const LOG = process.argv[3] ?? "/tmp/wone.log";
const OUT = process.argv[4] ?? "/tmp/shots";
mkdirSync(OUT, { recursive: true });

/* ⚠️ A FRESH PERSON AND A FRESH WORKSPACE EVERY RUN, so the script is
   re-runnable against a database that already has yesterday's in it. */
const STAMP = Date.now();
const EMAIL = `sam+${STAMP}@example.com`;
const SLUG = `northwind${String(STAMP).slice(-5)}`;

/* --------------------------------------------------------- a real session --- */

const call = (host, path, body, cookie) => new Promise((resolve, reject) => {
  const payload = JSON.stringify(body);
  const req = httpRequest({
    host: "127.0.0.1", port: PORT, path, method: "POST",
    headers: {
      host, "content-type": "application/json",
      "content-length": Buffer.byteLength(payload),
      ...(cookie ? { cookie } : {}),
    },
  }, (res) => {
    let text = "";
    res.on("data", (c) => { text += c; });
    res.on("end", () => resolve({
      status: res.statusCode,
      cookies: res.headers["set-cookie"] ?? [],
      json: (() => { try { return JSON.parse(text); } catch { return text.slice(0, 120); } })(),
    }));
  });
  req.on("error", reject);
  req.end(payload);
});

const get = (host, path, cookie) => new Promise((resolve, reject) => {
  const req = httpRequest({ host: "127.0.0.1", port: PORT, path, method: "GET",
    headers: { host, ...(cookie ? { cookie } : {}) } }, (res) => {
    let text = "";
    res.on("data", (c) => { text += c; });
    res.on("end", () => resolve({ status: res.statusCode,
      json: (() => { try { return JSON.parse(text); } catch { return text.slice(0, 120); } })() }));
  });
  req.on("error", reject);
  req.end();
});

const codeFor = (email) => {
  const lines = readFileSync(LOG, "utf8").split("\n").filter((l) => l.includes(`[sign-in] ${email}`));
  const last = lines.at(-1);
  return last?.match(/→\s*(\d{6})/)?.[1] ?? null;
};

const cookieOf = (out) => out.cookies.map((c) => c.split(";")[0]).join("; ");

console.log("signing in as", EMAIL);
await call("id.localhost", "/api/me.code", { email: EMAIL });
await new Promise((r) => setTimeout(r, 400));
const code = codeFor(EMAIL);
if (!code) throw new Error("no code was logged — is ENVIRONMENT=development?");

const exchanged = await call("id.localhost", "/api/me.session", { email: EMAIL, code });
const cookie = cookieOf(exchanged);
console.log("  session:", exchanged.status, cookie ? "cookie set" : "NO COOKIE", JSON.stringify(exchanged.json).slice(0, 160));
if (!cookie) throw new Error("no session cookie");

const made = await call("setup.localhost", "/api/me.tenant.create", { name: "Northwind Strength", slug: SLUG, country: "DE" }, cookie);
console.log("  workspace:", made.status, JSON.stringify(made.json).slice(0, 200));

/* ⚠️ THE AGREEMENTS GATE STANDS IN FRONT OF EVERY SIGNED-IN SCREEN, which is
   correct and is also why every authenticated shot was a photograph of it. The
   workspace-bound documents are accepted at the workspace's own door. */
const owed = await get("id.localhost", "/api/me.agreements", cookie);
console.log("  agreements:", owed.status, JSON.stringify(owed.json).slice(0, 300));
for (const doc of owed.json?.documents ?? []) {
  if (!doc.mustAccept) continue;
  const at = doc.binds === "person" ? "id.localhost" : `${SLUG}.localhost`;
  const said = await call(at, "/api/me.accept", { document: doc.id, version: doc.version }, cookie);
  console.log(`  accepted ${doc.id} (${doc.binds}) at ${at}:`, said.status);
}

/* -------------------------------------------------------------- the shots --- */

/* ⚠️ A BUSINESS, BECAUSE THE BRAND SCREEN IS COMMERCIAL-ONLY. A personal
   workspace is photographed as the offer to become one, which is the other half
   of the same screen and worth seeing. */
/* ⚠️ THROUGH THE OPERATOR DOOR, WHICH IS THE ONLY ROUTE WITHOUT A PAYMENT — and
   in development an empty operator allow-list means the signed-in developer.
   Comping it here is what the gate is FOR: a business is a plan or an operator's
   decision, and a screenshot tool must not be a third way. */
const comped = await call("admin.localhost", "/api/op.account.commercial", {
  email: EMAIL, granted: 1,
}, cookie);
console.log("  commercial allowance:", comped.status);
const business = await call("id.localhost", "/api/me.tenant.commercial", {
  slug: SLUG, legalName: "Northwind Strength GmbH",
}, cookie);
console.log("  became a business:", business.status, JSON.stringify(business.json).slice(0, 160));

/* ⚠️ PUSH IS OFF UNTIL A KEYPAIR EXISTS, and the switch is correctly absent
   without one — so photographing the notification screen means generating one
   first, through the same operator route the console presses. */
const push = await call("admin.localhost", "/api/op.push.generate", {}, cookie);
console.log("  push keypair:", push.status, JSON.stringify(push.json).slice(0, 80));

const SHOTS = [
  { id: "door-signin", host: "id.localhost", path: "/", auth: false },
  { id: "told", host: `${SLUG}.localhost`, path: "/space/told", auth: true },
  { id: "console-telling", host: "admin.localhost", path: "/space/console/telling", auth: true },
  { id: "brand", host: `${SLUG}.localhost`, path: `/space/w/${SLUG}/brand`, auth: true },
  { id: "door-setup", host: "setup.localhost", path: "/", auth: false },
  { id: "elsewhere-crown", host: "nowhere.localhost", path: "/", auth: true },
  { id: "space-home", host: "id.localhost", path: "/space", auth: true },
  { id: "space-workspaces", host: "id.localhost", path: "/space/workspaces", auth: true },
  { id: "workspace", host: `${SLUG}.localhost`, path: "/", auth: true },
];

const { chromium } = await playwright();
const b = await chromium.launch({
  /* ⚠️ The pre-installed browser, never a download. */
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium",
  /* ⚠️ Some container images do not implement RFC 6761, so `.localhost` does
     not resolve on its own — and every door in this product is a subdomain. */
  args: ["--host-resolver-rules=MAP *.localhost 127.0.0.1"],
});

for (const scheme of ["dark", "light"]) {
  for (const shot of SHOTS) {
    const c = await b.newContext({
      viewport: { width: 1280, height: 900 },
      colorScheme: scheme,
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
    });
    if (shot.auth) {
      /* ⚠️ THE COOKIE IS CARRIED TO EVERY DOOR BY HAND, and that is a real
         difference from production rather than a shortcut. A `Domain=localhost`
         cookie is refused by browsers, so each `*.localhost` has its own jar —
         production issues one for the whole root and one sign-in covers every
         door. Without this, following a link from the account door to a
         workspace lands on that workspace's sign-in page. */
      const [name, value] = cookie.split("=");
      await c.addCookies([
        { name, value, domain: shot.host, path: "/" },
        { name, value, domain: `${SLUG}.localhost`, path: "/" },
      ]);
    }
    const p = await c.newPage();
    p.on("console", (m) => { if (m.type() === "error") console.log(` [page:${shot.id}]`, m.text().slice(0, 160)); });
    const url = `http://${shot.host}:${PORT}${shot.path}`;
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 })
      .catch((e) => console.log(` [goto:${shot.id}]`, e.message.slice(0, 80)));
    await p.waitForTimeout(3500);
    const out = `${OUT}/${shot.id}-${scheme}.png`;
    await p.screenshot({ path: out, animations: "disabled", timeout: 60000 })
      .catch((e) => console.log(` [shot:${shot.id}]`, e.message.slice(0, 60)));
    const text = (await p.innerText("body").catch(() => "")).slice(0, 130).replace(/\n+/g, " / ");
    console.log(`${out}  "${text}"`);
    await c.close();
  }
}
await b.close();
console.log("done");
