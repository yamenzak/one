/**
 * THE TEST GROUND — the reference app's own screens, in the deployment's frame.
 *
 * ⚠️ ITS OWN MODULE, AND REACHED ONLY BY `import()`. This lived in `App.tsx`
 * behind an `import.meta.env.DEV` check, which reads as dev-only and is not: the
 * IMPORT is static, so the reference app's whole manifest and every one of its
 * screens shipped in the production bundle. Measured — a marker string from
 * hello's own settings was in the built `index-*.js`. D17 says a page never
 * imports `@engine/<app>`, and the reason is exactly this: a bundle that grows
 * with the catalogue, holding a second copy of what the deployment already
 * knows. A dynamic import puts it in a chunk nothing in production ever asks
 * for.
 *
 * ⚠️ THE GROUND WEARS THE PRODUCT'S OWN FRAME. Rendering a screen on its own
 * leaves out the largest half of this design system: `Shell` picks the world,
 * `Page` MOUNTS it — the scene, the grain, the vignette, the hem, the scroll
 * listener the hem's opacity is driven by — and reserves the room for the
 * island. A ground without it tests the components and none of the frame, which
 * is exactly the part a product cannot opt out of.
 *
 * ⚠️ AND IT IS THE HUB THAT MOUNTS THE SHELL, NOT THE APP — the same call
 * `centre/Product.tsx` makes for a real product, with the same manifest. An app
 * that brought its own chrome would be an app that could get it wrong.
 */

import { Shell, whoFace } from "@engine/design";
import { HELLO } from "@engine/hello";
import { HelloScreen } from "@engine/hello/screens";

export function Ground({ route }: { readonly route: string }) {
  const go = (next: string) => {
    const to = new URL(location.href);
    to.searchParams.set("screen", next);
    location.assign(to.toString());
  };

  return (
    <Shell
      screens={HELLO.screens}
      here={route}
      /* ⚠️ Everything, because the ground is for looking at every screen — what
         a permission HIDES is `reachable`'s job and it has its own test. A
         ground that held two of four would be a ground where two screens are
         unreachable and nothing says which. */
      held={new Set(["note:read", "note:write", "member:read", "tenant:manage"])}
      /* ⚠️ On, or the screen behind the flag is undrawable here — which is the
         one screen whose whole point is that a flag decides. */
      flags={{ "note-search": true }}
      /* ⚠️ COMMERCIAL, FOR THE SAME REASON THE FLAG IS ON: a business-only
         screen is undrawable on a personal ground, and the ground exists to draw
         every screen. */
      kind="commercial"
      crown={{
        appId: HELLO.id,
        appName: HELLO.name,
        appMark: HELLO.mark,
        tenantName: "The test ground",
        unread: 2,
        personEmail: "somebody@example.com",
        personFace: whoFace("ground"),
      }}
      onGo={go}
    >
      <HelloScreen route={route} onGo={go} />
    </Shell>
  );
}

/** ⚠️ The app's own routes, for the address bar — same module, same chunk. */
export const GROUND_ROUTES: readonly string[] = (HELLO.screens ?? []).map((s) => s.route);
