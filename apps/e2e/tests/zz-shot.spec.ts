/** Throwaway screenshot harness — deleted after use. Not a golden path. */
import { test, expect } from "@playwright/test";
import { tab } from "../src/app.js";
import { provisionClient, provisionStudio, type Client, type Studio } from "../src/provision.js";

const OUT = "/tmp/claude-0/-home-user-mossa/f1353c61-c103-59ec-ad8c-6bd956d28fe7/scratchpad";

test("shot", async ({ browser }) => {
  const studio: Studio = await provisionStudio(browser, "E2E Shot Lab");
  const client: Client = await provisionClient(browser, studio, "Shot Client");
  const p = client.page;

  // A Sheet, open, with its scrim.
  await p.goto(`${client.base}/eat`);
  await expect(tab(p, "Eat")).toBeVisible({ timeout: 30_000 });
  await p.getByRole("button", { name: "Log food" }).first().click();
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${OUT}/sheet.png` });

  // Keyboard focus on a segmented control / tab trigger.
  await p.keyboard.press("Escape");
  await p.waitForTimeout(600);
  await p.goto(`${client.base}/progress`);
  await p.waitForTimeout(2000);
  for (let i = 0; i < 6; i++) await p.keyboard.press("Tab");
  await p.screenshot({ path: `${OUT}/focus.png` });
});
