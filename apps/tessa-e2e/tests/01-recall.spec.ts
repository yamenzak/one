/**
 * THE GOLDEN PATH: a load fails on Thursday, and the app says where it went.
 *
 * This is TESSA.md §1.1 driven end to end in a browser. Everything else the
 * product does is inventory; this is the sentence a centre buys it for, and it
 * is the one path where a silent break would be worth real money.
 *
 * ── What is driven through the UI, and what is not ──────────────────────────
 *
 * The RECALL is driven through the UI in full: the failed-load callout on Today,
 * the report itself, and the concern on the case. Everything before it — a
 * catalog item, an instrument, a tray, a load — is arranged over the same HTTP
 * surface the UI uses, with the same cookie.
 *
 * That split is deliberate rather than lazy. Driving twenty pieces of setup
 * through forms would make this a test of forms, and it would fail for form
 * reasons long before it ever reached the thing it exists to protect. The forms
 * get their own spec (02); this one guards the answer.
 */

import { expect, test } from "@playwright/test";
import { api, createCentre, newParty, signIn, uniqueEmail } from "../src/app.js";

test("a load fails after release — the recall names what it cannot reach", async ({ browser }) => {
  const context = await newParty(browser);
  const page = await context.newPage();

  await signIn(page, uniqueEmail("cssd"));
  await createCentre(context, page);

  // ── Arrange: two trays, released from one load ──────────────────────────
  const item = await api<{ id: string }>(page, "POST", "/api/catalog", {
    name: "Kelly forceps 14cm",
    kind: "instrument",
    tracking: "unit",
  });
  const recipe = await api<{ id: string }>(page, "POST", "/api/recipes", {
    name: "Minor surgery tray",
    sterileShelfDays: 180,
  });

  const trays: string[] = [];
  for (const n of [1, 2]) {
    const unit = await api<{ id: string }>(page, "POST", "/api/instruments", { catalogItemId: item.id, labelCode: `INS-${n}` });
    const pack = await api<{ id: string }>(page, "POST", "/api/packs", {
      recipeId: recipe.id,
      labelCode: `TRAY-${n}`,
      unitIds: [unit.id],
    });
    trays.push(pack.id);
  }

  const cycle = await api<{ id: string }>(page, "POST", "/api/cycles", { machine: "Autoclave 1", cycleNumber: "47", packIds: trays });
  // Tuesday: out of the machine, both fast indicators pass, a person releases it.
  await api(page, "POST", `/api/cycles/${cycle.id}/end`, { physicalOk: true, chemicalOk: true });
  await api(page, "POST", `/api/cycles/${cycle.id}/release`, {});

  // Wednesday: one tray is opened over a patient, against a case.
  const kase = await api<{ id: string }>(page, "POST", "/api/cases", { caseRef: "OP-2026-114" });
  await api(page, "POST", `/api/packs/${trays[1]}/open`, { caseId: kase.id });

  // ── Thursday: the spore test comes back positive ────────────────────────
  await api(page, "POST", `/api/cycles/${cycle.id}/biological`, { passed: false });

  // ── Assert, through the app ─────────────────────────────────────────────
  await page.reload();

  // Today leads with it. A recall that a person has to go looking for is a
  // recall that waits until somebody happens to open the right tab.
  const callout = page.getByText(/Load 47 failed/i);
  await expect(callout).toBeVisible();

  await page.getByRole("button", { name: /Open the recall/i }).click();
  await expect(page).toHaveURL(/\/recall\//);

  /**
   * The load-bearing assertion of the whole product.
   *
   * The report names what it COULD NOT reach — the opened tray — as well as
   * what it froze. A report showing only the frozen one would read as a
   * completed job while the tray that reached a patient went unmentioned.
   */
  await expect(page.getByText(/Tessa could not reach these/i)).toBeVisible();
  await expect(page.getByText("TRAY-2")).toBeVisible();
  await expect(page.getByText(/Couldn't reach/i)).toBeVisible();
  await expect(page.getByText("1 tray", { exact: false })).toBeVisible();

  // …and the one still on a shelf is frozen rather than left usable.
  await expect(page.getByText("TRAY-1")).toBeVisible();
  await expect(page.getByText(/quarantined/i).first()).toBeVisible();

  /**
   * Rule 1, on the screen where the temptation is greatest. The unreachable
   * tray is tied to a case REFERENCE and nothing else — Tessa cannot resolve it
   * to a person and the copy says so, rather than leaving someone waiting for a
   * name that is never coming.
   */
  await expect(page.getByText(/case reference and nothing else about the patient/i)).toBeVisible();
});

test("the case that used it says so, from the other direction", async ({ browser }) => {
  /**
   * The reverse trace. A case correct on Tuesday acquires a concern on Thursday
   * without anything about the case changing — only the evidence around it did.
   * This is the assertion that a status stored at close time would have missed.
   */
  const context = await newParty(browser);
  const page = await context.newPage();

  await signIn(page, uniqueEmail("clinical"));
  await createCentre(context, page);

  const item = await api<{ id: string }>(page, "POST", "/api/catalog", { name: "Kelly forceps", kind: "instrument", tracking: "unit" });
  const recipe = await api<{ id: string }>(page, "POST", "/api/recipes", { name: "Minor tray", sterileShelfDays: 180 });
  const unit = await api<{ id: string }>(page, "POST", "/api/instruments", { catalogItemId: item.id, labelCode: "INS-A" });
  const pack = await api<{ id: string }>(page, "POST", "/api/packs", { recipeId: recipe.id, labelCode: "TRAY-A", unitIds: [unit.id] });
  const cycle = await api<{ id: string }>(page, "POST", "/api/cycles", { machine: "Autoclave 1", cycleNumber: "51", packIds: [pack.id] });
  await api(page, "POST", `/api/cycles/${cycle.id}/end`, { physicalOk: true, chemicalOk: true });
  await api(page, "POST", `/api/cycles/${cycle.id}/release`, {});

  const kase = await api<{ id: string }>(page, "POST", "/api/cases", { caseRef: "OP-2026-200" });
  await api(page, "POST", `/api/packs/${pack.id}/open`, { caseId: kase.id });
  await api(page, "POST", `/api/cases/${kase.id}/close`, {});

  // Clean at close time.
  await page.reload();
  await page.getByRole("button", { name: "Cases" }).first().click();
  await page.getByText("OP-2026-200").click();
  await expect(page.getByText(/What was used/i)).toBeVisible();
  await expect(page.getByText(/has since FAILED/i)).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Thursday.
  await api(page, "POST", `/api/cycles/${cycle.id}/biological`, { passed: false });

  await page.reload();
  await page.getByRole("button", { name: "Cases" }).first().click();
  await page.getByText("OP-2026-200").click();
  // At the top, in danger — not in a corner under the list of what was used.
  await expect(page.getByText(/has since FAILED/i)).toBeVisible();
  await expect(page.getByText(/load 51/i)).toBeVisible();
});
