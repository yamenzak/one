/**
 * WHERE A PRODUCT'S OWN SCREENS COME FROM — one registry, one chunk each.
 *
 * ⚠️ ONE BUNDLE SERVES EVERY PRODUCT (D17), SO A PAGE MAY NOT IMPORT ONE. A
 * static import here would ship every product's screens to every customer of
 * every other one — measurable in the built `index-*.js`, and the first entry on
 * D17's own "therefore never" list. `scripts/bundle.test.mjs` refuses it.
 *
 * ⚠️ SO THE LANE IS A DYNAMIC IMPORT PER APP, REQUESTED WHEN THAT APP IS OPENED.
 * The chunk is emitted and is fetched by exactly the workspaces that have the
 * product switched on, which is what code-splitting is for — different from the
 * test ground, whose chunk nothing in production requests and which is therefore
 * gated on `import.meta.env.DEV` instead.
 *
 * ⚠️ AND AN APP DOES NOT IMPORT THIS PAGE. It exports a `mount` that is HANDED
 * what it needs — a way to register a screen, and the typed door to the API. The
 * arrow points `apps → design → runtime → kernel`, so a product reaching back
 * into OneSpace would be the one direction the boundary guard exists to refuse.
 *
 * ⚠️ AND THE GROUND IS NOT HERE, WHICH IS THE WHOLE OF WHAT IT MEANS FOR IT NOT
 * TO BE A PRODUCT. `@engine/ground` had an entry beside the real ones, over the
 * workspace's own records — so a customer could switch on a notebook demo and
 * find sample content in their own workspace. A fixture with a live browser half
 * is not a fixture; it is a product nobody decided to sell.
 *
 * ⚠️ AND AN APP WITH NO ENTRY IS NOT A FAILURE. Its declared screens render an
 * honest notice (`AppSurface`), which is the state of every product before its
 * browser half is written — a blank page and a page that failed to load are the
 * same picture, and only one of them gets reported.
 */

import { api } from "./api.js";
import { mountScreen } from "./centre/AppSurface.js";

/**
 * What an app's browser half is handed. Both halves are the platform's: the
 * registration, so the routing stays out here, and the door, so a product never
 * writes its own fetch and never learns what an expired session looks like.
 */
export interface Mounting {
  readonly register: typeof mountScreen;
  readonly api: typeof api;
}

/**
 * ⚠️ THE ONE PLACE AN APP IS NAMED IN THIS PAGE, and it is a thunk. Adding a
 * product is a line here and a `mount` in that product's browser half.
 */
const LOADERS: Readonly<Record<string, () => Promise<{ mount: (at: Mounting) => void }>>> = {
  inventory: () => import("@engine/inventory/live"),
};

/**
 * ⚠️ ONCE PER APP, AND THE PROMISE IS THE MEMO. Two screens of one product
 * mounting at the same moment would otherwise each start the import, and the
 * second registration would race the first.
 */
const asked = new Map<string, Promise<void>>();

export function screensOf(appId: string): Promise<void> {
  const held = asked.get(appId);
  if (held) return held;

  const load = LOADERS[appId];
  /* ⚠️ Resolved rather than rejected. A product with no browser half is an
     ordinary state, and it already has a screen that says so. */
  const run = load
    ? load().then((m) => m.mount({ register: mountScreen, api }))
      .catch(() => undefined)
    : Promise.resolve();

  asked.set(appId, run);
  return run;
}
