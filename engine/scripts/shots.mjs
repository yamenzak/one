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

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
/*
  ⚠️ AND THE SEED, WHICH IS THE OTHER THING THIS RUN PRODUCES. Photographs are
  for a person; the geometry is for the product — see `SEED` at the bottom.
*/
const SEED = join(dirname(fileURLToPath(import.meta.url)), "..", "one-space", "src", "shapes.ts");
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

/**
 * ⚠️ READ OUT OF THE LETTER, NOT OUT OF A LOG LINE ABOUT ONE. This matched
 * `[sign-in] <email> → 123456`, which the mailer stopped printing when mail
 * moved behind one sender — so every run of this script died at the first step
 * with "no code was logged — is ENVIRONMENT=development?", which is a question
 * about the config and the config was fine. What is printed now is the letter
 * itself (`runtime/src/mail.ts`), and the subject line carries the code.
 *
 * ⚠️ AND IT IS MATCHED ON THE ADDRESS AND THE SUBJECT TOGETHER. A run makes a
 * fresh person every time, so a log with yesterday's sign-ins in it has several
 * six-digit numbers in it and only one of them is ours.
 */
const codeFor = (email) => {
  const said = readFileSync(LOG, "utf8").split("\n")
    .filter((l) => l.includes(`to=${email}`) && l.includes("sign-in code"));
  /* ⚠️ ANCHORED ON THE SUBJECT, BECAUSE THE ADDRESS HAS DIGITS IN IT TOO. A run
     makes a fresh person named for the clock — `sam+1787228440869@example.com` —
     and a bare six-digit match takes the first six of the timestamp. It reports
     as a 401 two steps later, about a code that was read from the wrong half of
     the line. */
  return said.at(-1)?.match(/subject="(\d{6}) is your sign-in code"/)?.[1] ?? null;
};

const cookieOf = (out) => out.cookies.map((c) => c.split(";")[0]).join("; ");

console.log("signing in as", EMAIL);
await call("id.localhost", "/api/me.code", { email: EMAIL });
/* ⚠️ POLLED, NOT SLEPT. The worker's log is written by another process and
   flushed when it feels like it; a fixed wait was long enough on the machine it
   was written on and short enough here that the code arrived after the script
   had given up — which reports as `401 NO COOKIE` two steps later, about a code
   that was never read. */
let code = null;
for (let i = 0; i < 40 && !code; i++) {
  code = codeFor(EMAIL);
  if (!code) await new Promise((r) => setTimeout(r, 250));
}
if (!code) {
  throw new Error(`no sign-in code for ${EMAIL} in ${LOG}.\n`
    + `  The development mailer prints the letter it would have sent; if there is`
    + ` no [mail] line at all,\n  ENVIRONMENT is not development. If there is one`
    + ` and this still failed, its shape has changed — see codeFor.`);
}

const exchanged = await call("id.localhost", "/api/me.session", { email: EMAIL, code });
const cookie = cookieOf(exchanged);
console.log("  session:", exchanged.status, cookie ? "cookie set" : "NO COOKIE", JSON.stringify(exchanged.json).slice(0, 160));
if (!cookie) throw new Error("no session cookie");

/* ⚠️ `apps` IS NOT OPTIONAL AND WAS MISSING HERE. Founding narrows what was
   asked for to what the deployment sells and refuses an empty result — "a
   workspace with no product is a name, an address and nothing to open". Without
   it every call 400'd on `Choose at least one`, so every workspace-scoped shot
   below photographed a 404 under a correct heading and the run still said
   `done`. The list is the catalogue's own, so a product added to the deployment
   is photographed without anybody editing this line. */
const offered = await get("id.localhost", "/api/me.products", cookie);
const wants = (offered.json?.items ?? []).map((one) => one.id).filter(Boolean);
const made = await call("setup.localhost", "/api/me.tenant.create",
  { name: "Northwind Strength", slug: SLUG, country: "DE", apps: wants }, cookie);
console.log("  wants:", JSON.stringify(wants));
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

/* ⚠️ TWO REAL NOTES, THROUGH THE REAL OPERATION. The product screen draws the
   workspace's own records now, so an empty workspace photographs the empty state
   — which is worth seeing once and is not what "the screen works" looks like. */
for (const [title, body, kind] of [
  ["Pricing for the second tier", "Three seats felt low. Worth revisiting before the launch.", "decision"],
  ["Why the sweep runs at 03:00", "Far from any month boundary somebody watches.", "record"],
]) {
  const made = await call(`${SLUG}.localhost`, "/api/note.create",
    { title, body, kind, happened: "2026-08-17" }, cookie);
  console.log("  note:", made.status, JSON.stringify(made.json).slice(0, 80));
}

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
  /* ⚠️ ONE SCREEN PER PRODUCT, BECAUSE A PRODUCT NOBODY PHOTOGRAPHS IS ONE
     NOBODY LOOKS AT. Everything above is the platform's own surface; these are
     what a workspace actually opens, drawn entirely by the renderer from three
     manifests. The party list is the sharpest of the three — it is the record
     OneInventory borrows a name from, and seeing both is the seam. */
  { id: "app-parties", host: `${SLUG}.localhost`, path: "/party/parties", auth: true },
  { id: "app-accounts", host: `${SLUG}.localhost`, path: "/book/accounts", auth: true },
  { id: "app-suppliers", host: `${SLUG}.localhost`, path: "/inventory/suppliers", auth: true },
];

const { chromium } = await playwright();
const b = await chromium.launch({
  /* ⚠️ The pre-installed browser, never a download. */
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium",
  /* ⚠️ Some container images do not implement RFC 6761, so `.localhost` does
     not resolve on its own — and every door in this product is a subdomain. */
  args: ["--host-resolver-rules=MAP *.localhost 127.0.0.1"],
});

/* ⚠️ ONE ENTRY PER PATH, AND THE LAST WRITER WINS — the light pass measures the
   same screens as the dark one and gets the same numbers, because nothing here
   is sized by the theme. */
const shapes = new Map();

/**
 * ⚠️ THE WORKSPACE IN THE ADDRESS IS A NAME, NOT A SCREEN, AND WITHOUT THIS THE
 * SEED FOR EVERY WORKSPACE SCREEN IS DEAD ON ARRIVAL. Each run makes a workspace
 * called for the clock, so `/space/w/northwind61586/brand` is a key no person
 * will ever have — and the entry sits in the file looking like coverage.
 *
 * ⚠️ AND IT IS RIGHT BEYOND THE HARNESS: two workspaces' brand screens are the
 * same screen, so starring the slug is what lets the SECOND workspace somebody
 * opens be exact on its first visit rather than starting over. The generator
 * decides what varies because the generator is the one that knows; `recall` only
 * has to understand that a starred segment matches any one segment.
 */
const varying = (path) => path.split("/").map((seg) => (seg === SLUG ? "*" : seg)).join("/");

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
    /*
      ⚠️ THE PRODUCT'S OWN MEASUREMENT, READ BACK — NOT A SECOND ONE WRITTEN
      HERE. `useRecalledShape` has already measured this screen and put it in
      session storage under `one.shape.<path>`; re-implementing the same walk in
      this script would be two definitions of "the shape of a screen", and the
      one nobody runs is the one that drifts. Whatever the component stores is
      exactly what is seeded, by construction.
    */
    for (const [path, blocks] of Object.entries(await p.evaluate(() => {
      const out = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key?.startsWith("one.shape.")) {
          try { out[key.slice("one.shape.".length)] = JSON.parse(sessionStorage.getItem(key)); }
          catch { /* somebody else's key */ }
        }
      }
      return out;
    }).catch(() => ({})))) shapes.set(varying(path), blocks);
    await c.close();
  }
}
await b.close();

/* ------------------------------------------------------------ the seed --- */

/**
 * ⚠️ WHAT A SCREEN LOOKS LIKE BEFORE ANYBODY HAS SEEN IT. `recall` is exact from
 * the second visit and has nothing to go on for the first — and because it keeps
 * what it measures in SESSION storage, "the first visit" is the first visit in
 * every tab, not once ever. This is that first visit, measured here, from the
 * real screens with real data in them.
 *
 * ⚠️ AND A STALE SEED IS SAFE IN A WAY MOST GENERATED THINGS ARE NOT. It is used
 * for one paint and then replaced by what the screen actually drew, so a screen
 * that changed since the last run waits behind slightly-wrong bars for a frame
 * instead of the generic preset's very-wrong ones. It degrades to today.
 */
const sorted = [...shapes.entries()].sort(([a], [b]) => a.localeCompare(b));
writeFileSync(SEED, [
  "/**",
  " * WHAT EACH SCREEN MEASURED, SO THE FIRST VISIT IS NOT A GUESS.",
  " *",
  " * ⚠️ GENERATED — `node engine/scripts/shots.mjs`. Every number here was read",
  " * off a real screen, in a real browser, holding real data: the harness that",
  " * photographs the product also reads back what `useRecalledShape` measured,",
  " * so this file and the runtime cannot disagree about what a shape is.",
  " *",
  " * ⚠️ AND IT IS ONLY THE FIRST PAINT. `recall` replaces every one of these with",
  " * what the screen actually drew, on the first render after it arrives — so a",
  " * screen that has changed since this was generated costs one frame of",
  " * slightly-wrong bars rather than the generic preset's very-wrong ones.",
  " */",
  "",
  'import type { Block } from "@engine/design";',
  "",
  "export const SHAPES: Readonly<Record<string, readonly Block[]>> = {",
  ...sorted.map(([path, blocks]) =>
    `  ${JSON.stringify(path)}: ${JSON.stringify(blocks)},`),
  "};",
  "",
].join("\n"));
console.log(`seeded ${sorted.length} screen(s) -> ${SEED}`);

console.log("done");
