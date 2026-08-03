/**
 * THE DEMO STUDIO — one seeded world, photographed.
 *
 * The screenshot suite exists because of a failure mode this repo keeps hitting:
 * every screen ever reviewed was reviewed on a brand-new account, so every
 * review was a review of EMPTY STATES. The carousels, the day agenda, the
 * roster, the diary, the trend charts and the plan editor had never once been
 * looked at with something in them — which is exactly where cramming, bad
 * wrapping and confusing copy live (UI-LANGUAGE §16).
 *
 * So this builds one studio with a plausible amount of plausible data and hands
 * it to the capture specs. Three properties are load-bearing:
 *
 *   REAL, through the real API   nothing is stubbed and no row is written behind
 *                                the product's back. Every screen resolves its
 *                                own entitlements, its own scope and its own
 *                                gates, so a shot cannot show a surface the
 *                                product would not actually serve.
 *   PLAUSIBLE, never uniform     missed days, drifting weights, one very long
 *                                name and one very short one. Perfectly regular
 *                                data hides layout problems: every row the same
 *                                width, every number the same digit count.
 *   NO PLACEHOLDERS              no "Test Client 1", no lorem, no 1234. An image
 *                                with a placeholder in it teaches the reader the
 *                                product is a demo.
 *
 * The images are the marketing site, the Help Center and the design review, and
 * they are all the same images — which is what keeps them honest. A screenshot
 * that has to be staged by hand gets staged flatteringly.
 */

import type { Browser, BrowserContext } from "@playwright/test";
import { provisionClient, provisionStudio, seedExercise, type Client, type Studio } from "./provision.js";
import { compOntoPlan, populateClient, populateRoster, publishWorkoutPlan, seedFrontDesk, setTargets } from "./populate.js";

/** The studio every image is taken in. A real-sounding name, not "Test Studio". */
export const DEMO_STUDIO = "Northlight Strength";

/**
 * The client whose surfaces are photographed.
 *
 * Deliberately a name that is neither short nor Anglo-symmetric: a first name
 * of nine characters and a hyphenated surname is what actually finds the row
 * that stops truncating gracefully.
 */
export const DEMO_CLIENT = "Rosalind Achebe-Marsh";

export interface DemoWorld {
  studio: Studio;
  client: Client;
  /** Roster ids, in creation order. The first is the photographed client. */
  roster: string[];
  planId: string;
}

/**
 * Build it. Roughly a minute: every step is a real HTTP round-trip through a
 * cold worker, which is the cost of the images being of the real product.
 */
export async function buildDemoWorld(browser: Browser, theme: "light" | "dark"): Promise<DemoWorld> {
  const studio = await provisionStudio(browser, DEMO_STUDIO);
  themed(studio.context, theme);

  /*
   * A PLAN FIRST, comped — not an entitlement override.
   *
   * Two things depend on it. Several surfaces do not exist on the baseline: the
   * roster caps at three and the front desk renders a locked card, so a run
   * without this photographs a smaller product than the one being sold, which
   * is the most flattering possible mistake. And a studio with raised ceilings
   * but no SUBSCRIPTION still carries "No subscription — choose a plan" on every
   * screen: honest, and in every image, which makes a finished product look
   * permanently half-configured.
   *
   * Comping puts the studio in the state a paying customer is in. `pro` rather
   * than the top tier because that is the plan a studio of this size actually
   * buys — the images should show what customers see, not the maximum.
   */
  await compOntoPlan(studio, "pro");

  const client = await provisionClient(browser, studio, DEMO_CLIENT);
  themed(client.context, theme);

  // A roster with the photographed client at the top of it. The names carry
  // their own variety — lengths from "Ben Ho" to "Amara Okonkwo-Fitzgerald" —
  // which is what makes a roster row's truncation visible instead of theoretical.
  const roster = [client.id, ...(await populateRoster(studio))];

  await setTargets(studio, client);
  // Six weeks, not two: the trend charts and the streak counters only start
  // looking like themselves once there is more history than fits on screen.
  await populateClient(client, 42);

  const exercises: string[] = [];
  for (const name of ["Back squat", "Romanian deadlift", "Incline dumbbell press", "Chest-supported row"]) {
    exercises.push(await seedExercise(studio, name));
  }
  const planId = await publishWorkoutPlan(studio, client, exercises, "Upper / Lower Split");

  await seedFrontDesk(studio, client.id);

  return { studio, client, roster, planId };
}

/**
 * Pin the theme before the app boots.
 *
 * The mode is read out of local storage in the theme provider's INITIAL state,
 * so setting it after load would photograph one frame of the other theme — and
 * flipping it with the app's own toggle would additionally mark it as a user
 * choice, which then overrides the studio's default and quietly makes the
 * light/dark pair a different comparison than the one intended.
 */
function themed(context: BrowserContext, theme: "light" | "dark"): void {
  void context.addInitScript((mode) => {
    try {
      localStorage.setItem("kova-theme", mode as string);
    } catch {
      /* storage unavailable — the default theme is then photographed */
    }
  }, theme);
}
