/**
 * THE SCAN-FIRST CLAIM, driven through the forms.
 *
 * Spec 01 guards the answer; this one guards the way in. Every bug found by hand
 * while building the app lived here rather than in the recall — a portal ref
 * that was null on first render, a camera that never reported its own state, a
 * door that answered 401 to an app which then re-rendered the sign-in form.
 * None of them were visible to a typecheck or to the Miniflare suite.
 */

import { expect, test } from "@playwright/test";
import { api, createCentre, newParty, signIn, uniqueEmail } from "../src/app.js";

/** A real GS1 element string: GTIN 07612345678900, expiry 2027-01-31, lot L-9.
 *  The GS (ASCII 29) is the FNC1 separator a DataMatrix actually carries. */
const GS = String.fromCharCode(29);
const BARCODE = `010761234567890017270131${GS}10L-9`;

test("signing in on the setup door reaches the create-a-centre screen", async ({ browser }) => {
  /**
   * The regression guard for the worst bug of the build.
   *
   * `/api/context` needs a tenant, and on the setup door there is none — someone
   * who has just proved they own an address has not made a centre yet. When that
   * was refused, the app could not tell a signed-in owner from a stranger and
   * re-rendered the sign-in form they had just completed, forever. It threw
   * nothing and logged nothing; only a browser could see it.
   */
  const context = await newParty(browser);
  const page = await context.newPage();
  await signIn(page, uniqueEmail("owner"));
  await expect(page.getByLabel("Centre name")).toBeVisible({ timeout: 20_000 });
});

test("the scan sheet reads a GS1 barcode and offers to receive it", async ({ browser }) => {
  const context = await newParty(browser);
  const page = await context.newPage();
  await signIn(page, uniqueEmail("stock"));
  await createCentre(context, page);

  await page.getByRole("button", { name: "Scan", exact: true }).first().click();

  /**
   * The camera reports its own state.
   *
   * Headless has none, so the sheet must SAY so rather than showing a grey
   * rectangle indistinguishable from one that is loading. The first version left
   * "Starting the camera…" up indefinitely because the timeout guarded whether
   * the request settled rather than whether a frame arrived.
   */
  await expect(page.getByText(/type or scan the code below/i)).toBeVisible({ timeout: 20_000 });

  /**
   * The typed field is not a fallback: a hand-held USB scanner presents as a
   * KEYBOARD, so this is the path the cheapest hardware in a stock room takes.
   */
  await page.getByLabel("Or type the code").fill(BARCODE);
  await page.getByRole("button", { name: "Find it" }).click();

  // Product, lot and expiry all come off the barcode — the product's whole
  // claim, and the reason `parseGs1` is exhaustively unit-tested upstream.
  await expect(page.getByText("07612345678900", { exact: false })).toBeVisible();
  await expect(page.getByText("L-9", { exact: false })).toBeVisible();
  await expect(page.getByText("2027-01-31", { exact: false })).toBeVisible();
});

test("receiving an unknown product offers to add it, pre-filled", async ({ browser }) => {
  /**
   * A GTIN the catalog does not know is the FIRST DELIVERY of a new product,
   * which happens constantly — not an error to apologise for. The 409 carries
   * everything the scan read, so the person types a name and nothing else.
   */
  const context = await newParty(browser);
  const page = await context.newPage();
  await signIn(page, uniqueEmail("recv"));
  await createCentre(context, page);
  await api(page, "POST", "/api/locations", { name: "Bin A", kind: "bin" });

  await page.getByRole("button", { name: "Scan", exact: true }).first().click();
  await page.getByLabel("Or type the code").fill(BARCODE);
  await page.getByRole("button", { name: "Find it" }).click();
  // The action ROW — its accessible name carries its subtitle, which is why an
  // anchored /^Receive$/ matches nothing here.
  await page.getByRole("button", { name: /Add stock to a location/ }).click();

  await page.getByLabel("How many?").fill("20");
  // …and this one is the sheet's footer button, whose name really is just that.
  await page.getByRole("button", { name: "Receive", exact: true }).click();

  await expect(page.getByText(/isn't in the catalog yet/i)).toBeVisible();
  // The scan's reading is still on screen, so a name is typed against something
  // the person can check rather than against a blank form.
  await expect(page.getByText("07612345678900", { exact: false })).toBeVisible();

  await page.getByLabel("What is it called?").fill("Sterile gauze 10x10");
  await page.getByRole("button", { name: /Add it and receive/i }).click();

  await expect(page.getByText(/on the shelf/i)).toBeVisible({ timeout: 20_000 });
  // The expiry came off the barcode, not off a keyboard.
  await expect(page.getByText("2027-01-31", { exact: false })).toBeVisible();
});

test("the shelf shows the effective expiry and says which clock produced it", async ({ browser }) => {
  /**
   * TESSA.md §3.4's dangerous clock, on screen. A vial printed 2027 that is
   * unusable seven days after opening must not show 2027 — and the reason has to
   * travel with the date, or a nurse has nothing to dispute.
   */
  const context = await newParty(browser);
  const page = await context.newPage();
  await signIn(page, uniqueEmail("shelf"));
  await createCentre(context, page);

  const loc = await api<{ id: string }>(page, "POST", "/api/locations", { name: "Bin A", kind: "bin" });
  const item = await api<{ id: string }>(page, "POST", "/api/catalog", {
    name: "Multi-dose vial",
    tracking: "lot",
    consumption: "divisible",
    postOpeningDays: 7,
  });
  const lot = await api<{ lotId: string }>(page, "POST", "/api/stock/receive", {
    catalogItemId: item.id,
    locationId: loc.id,
    quantity: 5,
    expiry: "2027-01-31",
    lotCode: "L-1",
  });

  await page.getByRole("button", { name: "Stock" }).first().click();
  await expect(page.getByText("Multi-dose vial")).toBeVisible();
  // Before opening: the printed date wins and no reason chip is shown.
  await expect(page.getByText(/Opened — shortened/i)).toHaveCount(0);

  await api(page, "POST", `/api/stock/${lot.lotId}/open`, {});
  await page.reload();
  await page.getByRole("button", { name: "Stock" }).first().click();

  // After opening: the shortened clock wins, and the row says WHY.
  await expect(page.getByText(/Opened — shortened/i)).toBeVisible();
  await expect(page.getByText(/\d+d left/)).toBeVisible();
});
