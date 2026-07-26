/**
 * GOLDEN PATH 2 — the core coaching loop.
 *
 *   coach creates a workout plan → adds a day, a block and an exercise from the
 *   library → publishes it → the client sees it as their active plan → opens the
 *   session player → logs a set → the coach sees the set on the client's day.
 *
 * The two ends are what matter. Publishing is the only moment a plan crosses from
 * the coach's draft into the client's app (`plan-routes.ts` supersedes the lane's
 * previous plan), and set logging is the app's most concurrency-sensitive write
 * (`POST /logs/workout-sets`, INSERT OR IGNORE + CAS re-select). A plan that
 * publishes but does not reach the client, or a set that logs but does not reach
 * the coach, are both silent failures in production — nothing errors, the other
 * person just never sees it. Only a two-persona test catches that.
 */

import { test, expect } from "@playwright/test";
import { sheet, tab } from "../src/app.js";
import { provisionClient, provisionStudio, teardown, type Client, type Studio } from "../src/provision.js";

const EXERCISE = "Barbell Back Squat";

test("coach publishes a workout plan, the client logs a set, and the coach sees it", async ({ browser }) => {
  const studio: Studio = await provisionStudio(browser, "E2E Barbell Club");
  const client: Client = await provisionClient(browser, studio, "Rowan Lifter");
  const coach = studio.page;
  const planName = `PPL ${Date.now().toString(36)}`;

  await test.step("coach opens the client's Plans tab", async () => {
    // Deep-link: the plan builder and the client sub-tabs are real routes
    // (Shell.tsx), so this is the same destination the segmented control reaches.
    await coach.goto(`/clients/${client.id}/plans`);
    await expect(coach.getByText("Coach view")).toBeVisible();
    await expect(coach.getByText("No workout plans")).toBeVisible();
  });

  await test.step("coach creates the plan and lands in the builder", async () => {
    await coach.getByRole("button", { name: "New", exact: true }).click();
    const form = sheet(coach, "New workout plan");
    await form.getByLabel("Plan name").fill(planName);
    await form.getByRole("button", { name: "Create & build" }).click();

    await expect(coach).toHaveURL(/\/clients\/[^/]+\/plans\/workout\/[^/]+$/);
    await expect(coach.getByText("draft", { exact: true })).toBeVisible();
    await expect(coach.getByText("Empty plan")).toBeVisible();
  });

  await test.step("coach builds one day with one exercise", async () => {
    await coach.getByRole("button", { name: "Day", exact: true }).click();
    await expect(coach.getByLabel("Day name")).toHaveValue("Day 1");

    await coach.getByRole("button", { name: "Block", exact: true }).click();
    await coach.getByRole("button", { name: "Add exercise" }).click();

    const picker = sheet(coach, "Add exercise");
    await picker.getByLabel("Search your library").fill(EXERCISE);
    await picker.getByRole("button", { name: new RegExp(EXERCISE) }).click();

    // A picked exercise arrives with three prescribed sets (`emptySlot`), which is
    // what the client's player will count down.
    await expect(coach.getByRole("combobox", { name: "Measurement mode" })).toBeVisible();
    await expect(coach.getByRole("spinbutton", { name: "Reps" })).toHaveCount(3);
  });

  await test.step("coach publishes it", async () => {
    await coach.getByRole("button", { name: "Publish", exact: true }).click();
    // The badge is the plan's server-side status, re-read after the publish call.
    await expect(coach.getByText("published", { exact: true })).toBeVisible({ timeout: 30_000 });
  });

  await test.step("the client sees the published plan on Train", async () => {
    await client.page.goto("/train");
    await expect(tab(client.page, "Train")).toBeVisible({ timeout: 30_000 });
    await expect(client.page.getByText("Active plan")).toBeVisible({ timeout: 30_000 });
    await expect(client.page.getByRole("heading", { name: planName })).toBeVisible();
    await expect(client.page.getByText("1 training day")).toBeVisible();
  });

  await test.step("the client opens the session and logs a set", async () => {
    await client.page.getByRole("button", { name: "Start workout" }).click();
    // Day picker → Day 1. (One exercise, three prescribed sets.)
    const player = client.page.getByRole("dialog", { name: "Workout plan" });
    await expect(player).toBeVisible();
    await player.getByRole("button").filter({ hasText: "Day 1" }).click();

    await expect(client.page.getByText("0 of 3 sets logged")).toBeVisible();
    await client.page.getByRole("button", { name: "Log · 0/3" }).click();

    const drawer = sheet(client.page, EXERCISE);
    await expect(drawer.getByText("Set 1 of 3")).toBeVisible();
    await drawer.getByLabel("Reps").fill("8");
    await drawer.getByRole("button", { name: "Log set" }).click();

    // Server-confirmed: the header counter is recomputed from the saved session.
    await expect(client.page.getByText("1 of 3 sets logged")).toBeVisible({ timeout: 30_000 });
  });

  await test.step("the coach sees the logged set on the client's day", async () => {
    await coach.goto(`/clients/${client.id}/today`);
    await expect(coach.getByText("Coach view")).toBeVisible();
    // The day's activity timeline. Anchored to the start of the accessible name
    // ("Workout · 1 set · <time>") so it can't be satisfied by the agenda card
    // above it, which also says "workout" and "1 sets".
    const workoutEvent = coach.getByRole("button", { name: /^Workout 1 set\b/ });
    await expect(workoutEvent).toBeVisible({ timeout: 30_000 });
  });

  await teardown(studio, client);
});
