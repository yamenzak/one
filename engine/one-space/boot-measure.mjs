/**
 * WHAT THE FIRST PIXEL COSTS, ON A PHONE'S CPU, WITH THE NETWORK TAKEN OUT.
 *
 * ⚠️ SERVED FROM LOOPBACK ON PURPOSE. The question is not how long the bundle
 * takes to arrive — that is a number about somebody's signal — it is how long
 * the browser spends parsing, compiling and running it before anything is drawn.
 * That cost is paid on every cold visit on every connection, and it is the one
 * this repository decides.
 *
 * ⚠️ AND IT IS A TOOL RATHER THAN A TEST, which is why it has no `.seen.`
 * suffix and no assertion in it. What a boot SHOULD cost is a ceiling somebody
 * has to choose; this only reports what it does cost, so a change can be
 * measured before and after rather than argued about.
 *
 * ⚠️ RUN IT AGAINST A FRESH `dist`. It reads the built bundle, so a stale build
 * reports the previous design's numbers under the current commit — the same trap
 * the geometry harness carries, and it does not fail, it merely lies.
 *
 *   pnpm --filter @engine/space build
 *   node boot-measure.mjs 6
 *
 * Measured 2026-08-23, entry 1.32 MB: curtain at 380 ms (x1), 1568 ms (x4),
 * 1924 ms (x6).
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const SLOW = Number(process.argv[2] ?? 4);
const DIST = new URL("./dist/", import.meta.url).pathname;

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json",
  ".woff2": "font/woff2", ".webmanifest": "application/manifest+json",
};

const server = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  /* The API is not the subject — answer it instantly so nothing waits on it. */
  if (path === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, door: "tenant", root: "one.test", slug: "acme" }));
    return;
  }
  if (path.startsWith("/api/")) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ problem: { code: "platform.unauthorized", status: 401 } }));
    return;
  }
  const file = join(DIST, normalize(path === "/" ? "/index.html" : path));
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    const body = await readFile(join(DIST, "index.html"));
    res.writeHead(200, { "content-type": "text/html" });
    res.end(body);
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext({
  viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true,
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: SLOW });

const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "commit" });

let ink = 0;
const deadline = Date.now() + 60_000;
while (!ink && Date.now() < deadline) {
  const n = await page.evaluate(
    () => document.getElementById("root")?.querySelectorAll("*").length ?? 0,
  ).catch(() => 0);
  if (n > 0) ink = Date.now() - t0;
  else await new Promise((r) => setTimeout(r, 25));
}

const perf = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  return {
    paints: performance.getEntriesByType("paint")
      .map((p) => [p.name, Math.round(p.startTime)]),
    res: performance.getEntriesByType("resource")
      .filter((r) => /\.(js|css)$/.test(r.name))
      .map((r) => [
        r.name.split("/").pop(), Math.round(r.startTime), Math.round(r.responseEnd),
        r.decodedBodySize,
      ]),
    dcl: Math.round(nav?.domContentLoadedEventEnd ?? 0),
  };
});

console.log(`\n== dist, loopback, CPU x${SLOW} ==\n`);
for (const [name, at] of perf.paints) console.log(`${String(at).padStart(6)} ms  ${name}`);
console.log(`${String(ink).padStart(6)} ms  first node inside #root  <-- the curtain`);
console.log(`${String(perf.dcl).padStart(6)} ms  domContentLoaded`);
console.log("\n-- code --");
for (const [name, start, end, raw] of perf.res) {
  console.log(`${String(start).padStart(6)} → ${String(end).padStart(6)} ms  `
    + `${(raw / 1024).toFixed(0).padStart(6)} KB  ${name}`);
}

await browser.close();
server.close();
