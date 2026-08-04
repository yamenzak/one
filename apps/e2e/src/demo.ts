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
import { compOntoPlan, populateClient, populateRoster, publishMealPlan, publishWorkoutPlan, seedFoods, seedFrontDesk, setTargets } from "./populate.js";

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
  /** The published meal plan. The meal builder is a bank of OPTIONS, and a
   *  screen designed around picking between them cannot be photographed with a
   *  single one. */
  mealPlanId: string;
}

/**
 * Build it. Roughly a minute: every step is a real HTTP round-trip through a
 * cold worker, which is the cost of the images being of the real product.
 */
export async function buildDemoWorld(browser: Browser, theme: "light" | "dark"): Promise<DemoWorld> {
  const studio = await provisionStudio(browser, DEMO_STUDIO);
  await prepare(studio.context, theme);

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
  await prepare(client.context, theme);

  // A roster with the photographed client at the top of it. The names carry
  // their own variety — lengths from "Ben Ho" to "Amara Okonkwo-Fitzgerald" —
  // which is what makes a roster row's truncation visible instead of theoretical.
  const roster = [client.id, ...(await populateRoster(studio))];

  await setTargets(studio, client);
  // Six weeks, not two: the trend charts and the streak counters only start
  // looking like themselves once there is more history than fits on screen.
  await populateClient(client, 42);

  /*
   * A library with VARIETY, not four rows of "Quadriceps · Barbell".
   *
   * Every seeded exercise used to carry the same muscle group and the same
   * equipment, which made the library screenshots read as one row repeated four
   * times — and hid the browse facets entirely, because a facet with one option
   * cannot narrow anything and correctly renders nothing. The demo world has to
   * be varied enough for the controls it is meant to demonstrate to exist.
   */
  const exercises: string[] = [];
  for (const [name, muscles, kit] of [
    ["Back squat", ["quadriceps", "glutes"], ["barbell"]],
    ["Romanian deadlift", ["hamstrings", "glutes"], ["barbell"]],
    ["Incline dumbbell press", ["chest", "shoulders"], ["dumbbell"]],
    ["Chest-supported row", ["back", "biceps"], ["machine"]],
    ["Walking lunge", ["quadriceps", "glutes"], ["dumbbell"]],
    ["Lat pulldown", ["back"], ["cable"]],
    ["Standing calf raise", ["calves"], ["machine"]],
    ["Hanging leg raise", ["core"], ["bodyweight"]],
  ] as const) {
    exercises.push(await seedExercise(studio, name, [...muscles], [...kit]));
  }
  const planId = await publishWorkoutPlan(studio, client, exercises, "Upper / Lower Split");
  const mealPlanId = await publishMealPlan(studio, client, await seedFoods(studio));

  await seedFrontDesk(studio, client.id);

  return { studio, client, roster, planId, mealPlanId };
}

/**
 * DRAW THE FACES, without asking the browser to reach the internet.
 *
 * A studio's people are drawn by DiceBear from a seed whenever nobody uploaded
 * a photo — which is most of a real roster, and is exactly what the roster
 * screens are supposed to show. Chromium here cannot reach `api.dicebear.com`
 * (the sandbox's egress proxy refuses the CONNECT), so every avatar fell back
 * to a two-letter monogram and the images were a grid of grey initials: a real
 * state, but the least representative one and the flattest possible thing to
 * put in front of a customer.
 *
 * Node CAN reach it, so the request is fulfilled from there. What lands in the
 * page is the genuine asset from the genuine URL — only the transport differs,
 * which is the one thing a screenshot does not document. Responses are cached
 * per URL because a ten-person roster asks for the same handful repeatedly.
 *
 * If the fetch fails the route is left ALONE rather than stubbed: the app then
 * shows its real initials fallback, which is the honest picture of a machine
 * with no egress — better than a placeholder that looks like a product
 * decision.
 */
const avatarCache = new Map<string, string>();

async function serveAvatars(context: BrowserContext): Promise<void> {
  await context.route("https://api.dicebear.com/**", async (route) => {
    const url = route.request().url();
    try {
      let svg = avatarCache.get(url);
      if (svg === undefined) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`dicebear ${res.status}`);
        svg = await res.text();
        avatarCache.set(url, svg);
      }
      await route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg });
    } catch {
      await route.fallback();
    }
  });
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
export async function prepare(context: BrowserContext, theme: "light" | "dark"): Promise<void> {
  await context.addInitScript((mode) => {
    try {
      localStorage.setItem("kova-theme", mode as string);
    } catch {
      /* storage unavailable — the default theme is then photographed */
    }
  }, theme);
  await serveAvatars(context);
}
