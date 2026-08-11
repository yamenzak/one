/**
 * THE FILMSTRIP — motion, reviewed as frames rather than as a still.
 *
 * ⚠️ A SCREENSHOT CANNOT SHOW CHOREOGRAPHY. Two defects in this package were
 * invisible in every still and obvious in a strip: a stagger whose delays landed
 * on the wrong elements, and a scrim arriving after its sheet.
 *
 * Stitches the frames itself in the page, so the output is one image to look at
 * rather than twelve files to open in order.
 */
import { chromium } from "/home/user/one/apps/e2e/node_modules/@playwright/test/index.mjs";
const [, , file, out, ms = "90", frames = "12"] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 460, height: 940 }, deviceScaleFactor: 1 });
await p.goto("file://" + file);
/*
  ⚠️ THE HARNESS SLOWS THE CLOCK; THE PACKAGE CARRIES NO REVIEW HOOK. A
  screenshot round trip costs about a quarter of a second, so sampling a 600ms
  entrance in real time returns the same finished frame every time — which is
  exactly what the first strip showed, and it reads as "the animation is broken"
  rather than as "the camera is too slow". Multiplying the tokens here keeps the
  shipped sheet free of a debug switch that would eventually ship set to 2.
*/
const SLOW = Number(process.env.SLOW ?? 8);
await p.evaluate((slow) => {
  const read = (n) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n));
  const css = ["--t-tap", "--t-move", "--t-enter", "--t-entrance", "--t-exit", "--stagger"]
    .map((n) => `${n}: ${read(n) * slow}ms;`).join("");
  const el = document.createElement("style");
  el.textContent = `:root{${css}}`;
  document.head.append(el);
}, SLOW);
const step = Number(ms), n = Number(frames);
/*
  ⚠️ THE REPLAY IS CLICKED BEFORE THE CHROME IS STRIPPED. Removing the controls
  first deleted the button, the click missed, `.catch` swallowed it, and every
  frame was the finished state — which reads as "the animation does not run"
  rather than as "the harness pressed nothing".
*/
await p.click("button[data-act='replay']");
await p.evaluate(() => {
  document.querySelector(".wrap").style.padding = "0";
  document.querySelectorAll(".controls,h1,.sub,.cap,.note").forEach((e) => e.remove());
});
const shots = [];
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const at = Date.now() - t0;
  shots.push({ at: Math.round(at / SLOW), data: (await p.locator(".rail .slot").first().screenshot()).toString("base64") });
  await p.waitForTimeout(step);
}
const strip = await b.newPage({ viewport: { width: 200 * n, height: 900 } });
await strip.setContent(
  `<body style="margin:0;background:#111;display:flex">` +
  shots.map((s) => `<figure style="margin:0;flex:none;width:200px"><img src="data:image/png;base64,${s.data}" style="width:200px;display:block"><figcaption style="color:#8b8d95;font:600 13px ui-monospace,monospace;padding:6px 8px">${s.at}ms</figcaption></figure>`).join("") +
  `</body>`,
);
await strip.screenshot({ path: out, fullPage: true });
console.log(`${n} frames every ${step}ms → ${out}`);
await b.close();
