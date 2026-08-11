import { chromium } from "/home/user/one/apps/e2e/node_modules/@playwright/test/index.mjs";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2260, height: 1000 }, deviceScaleFactor: 2 });
for (const name of process.argv.slice(2)) {
  await page.goto(new URL(name, import.meta.url).href);
  await page.waitForTimeout(250);
  await page.screenshot({ path: name.replace(".html", ".png"), fullPage: true });
  console.log("shot", name);
}
await browser.close();
