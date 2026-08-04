/**
 * GOLDEN PATH 3 — the nutrition loop.
 *
 *   client opens Eat → adds a food by hand (name + macros) → logs a portion of it
 *   as a snack → their own diary and macro totals move
 *   → the coach sees the meal on the client's day.
 *
 * The manual entry route is deliberate. "Snap a meal" and the barcode/label
 * readers all need a camera and a live Gemini key, and web search leaves the
 * machine (`externalSearch` → OpenFoodFacts) — none of that belongs in a gate
 * that must pass deterministically with no external service. Manual entry hits the same
 * two writes every other route funnels into: `POST /api/foods` (create the food)
 * and `POST /api/logs/food` (put a portion of it in today's diary).
 *
 * As with the workout path, the failure this catches is the quiet one: the client
 * logs a meal, sees it on their own screen, and the coach's day never shows it.
 */

// Navigations are ABSOLUTE against the studio's own origin (`studio.base` /
// `client.base`), not relative against `baseURL`. `baseURL` is the setup door,
// which has no tenancy of its own — the studio's hostname is what pins it, so a
// relative `/clients/...` here would exercise session-scoped fallback instead of
// the path that ships.
import { test, expect } from "@playwright/test";
import { sheet, tab } from "../src/app.js";
import { provisionClient, provisionStudio, teardown, type Client, type Studio } from "../src/provision.js";

const FOOD = "E2E Oat Bar";
const KCAL = "240";
const PROTEIN = "12";

test("client logs a meal and the coach sees it on the client's day", async ({ browser }) => {
  const studio: Studio = await provisionStudio(browser, "E2E Nutrition Lab");
  const client: Client = await provisionClient(browser, studio, "Sam Eater");
  const eater = client.page;
  const coach = studio.page;

  await test.step("the client's diary starts empty", async () => {
    await eater.goto(`${client.base}/eat`);
    await expect(tab(eater, "Eat")).toBeVisible({ timeout: 30_000 });
    await expect(eater.getByText("Nothing logged today")).toBeVisible({ timeout: 30_000 });
  });

  await test.step("the client creates a custom food", async () => {
    await eater.getByRole("button", { name: "Log food" }).first().click();
    await sheet(eater, "Add food").getByRole("button", { name: /Add manually/ }).click();

    // Step 1 of the composer: name it, then choose how to fill the macros.
    const compose = sheet(eater, "Add a food");
    await compose.getByLabel("Food name").fill(FOOD);
    await compose.getByRole("button", { name: /Enter manually/ }).click();

    // Step 2: the review form. The four macro inputs are icon-labelled cells.
    const review = sheet(eater, "Review food");
    await review.getByRole("textbox", { name: /^Cal/ }).fill(KCAL);
    await review.getByRole("textbox", { name: /^Protein/ }).fill(PROTEIN);
    await review.getByRole("button", { name: "Add food" }).click();
  });

  await test.step("the client logs one serving of it as a snack", async () => {
    const portion = sheet(eater, FOOD);
    await expect(portion).toBeVisible();
    await portion.getByRole("button", { name: "snack", exact: true }).click();
    // One 100 g serving — the default portion, scaled 1×.
    await expect(portion.getByLabel("Amount (g)")).toHaveValue("100");
    await portion.getByRole("button", { name: "Log it" }).click();

    await expect(eater.getByText("Nothing logged today")).toHaveCount(0, { timeout: 30_000 });
  });

  await test.step("the diary and the day's totals both move — and survive a reload", async () => {
    // Reloading makes this a statement about server state, not about React state
    // the write path happened to leave behind.
    await eater.reload();
    await expect(eater.getByRole("button", { name: `${FOOD} 100 g` })).toBeVisible({ timeout: 30_000 });
    // The aggregate the `/today` bundle computes — the same figure the coach reads.
    await expect(eater.getByText(`${KCAL} kcal`).first()).toBeVisible();
  });

  await test.step("the coach sees the snack on the client's day", async () => {
    await coach.goto(`${studio.base}/clients/${client.id}/today`);
    await expect(coach.locator("[data-coach-view]")).toBeVisible();
    // Feed rows are "<meal> · <n items> · <kcal> · <time>". Anchored to the start
    // of the accessible name so nothing above the timeline can satisfy it.
    await expect(coach.getByRole("button", { name: /^Snack 1 item/ })).toBeVisible({ timeout: 30_000 });
    await expect(coach.getByRole("button", { name: new RegExp(`^Snack 1 item.*${KCAL}`) })).toBeVisible();
  });

  await teardown(studio, client);
});
