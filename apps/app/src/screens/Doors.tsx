/**
 * KOVA'S DOORS — the platform's screens, wearing Kova's words.
 *
 * The three of them (`RootSignpost`, `NoStudio`, `WrongDoor`) were written here
 * and were the best of the three apps': the address as the anchor, a real list of
 * your studios, a `RefreshNote` for the stale-shell case. That is exactly why
 * they moved to `@4dl/app-kit` — Tessa's were three centred `<div>`s with none of
 * it, and Scena had no door screens at all, which is how `scena.4dl.app` came to
 * render the whole app with every data call 404ing.
 *
 * What stays here is what genuinely is Kova's: who the product is for. The
 * signpost has to answer "am I in the right place?" for two different people — a
 * client with a coach and someone starting a business — and that sentence is not
 * the platform's to write.
 */

import { Building2, Group, MapPin, Row, Store } from "@4dl/ui";
import { NoTenant, RootSignpost as KitRootSignpost, WrongDoor as KitWrongDoor } from "@4dl/app-kit";
import { useTheme } from "../theme.js";
import { studioUrl, useSession } from "../session.js";

/**
 * The root: a signpost, and — for someone already signed in — the way to their
 * studios.
 *
 * The studio list is not a convenience, it is the reason this is not a plain 404.
 * The installed PWA's `start_url` is `/`, links get shared, and the root is the
 * address people guess; every one of those arrivals used to land on a page about
 * the product with no route back into their own studio.
 *
 * Kova's `personas` already carry the four brand-mark URLs flat, which is the
 * shape `DoorDestination` asks for — no mapping, and `brandMark` reads it
 * directly.
 */
export function RootSignpost() {
  const { mode } = useTheme();
  const { ctx, host } = useSession();
  return (
    <KitRootSignpost
      rootDomain={host?.rootDomain}
      setupUrl={host?.setupUrl}
      destinations={ctx?.personas ?? []}
      mode={mode}
      destinationUrl={studioUrl}
      copy={{
        signedInAt: "You're signed in at",
        arrivedAt: "You've arrived at",
        pickOne: "Pick a studio to continue",
        everyOneHasAnAddress: "Every studio has its own address",
        yourWorkspaces: (n) => (n === 1 ? "Your studio" : "Your studios"),
        signInWorksEverywhere: "Your sign-in works across all of them.",
        audiences: (
          <>
            <Row icon={MapPin} sub="Use the link they sent you">
              Training with a coach?
            </Row>
            <Row icon={Building2} sub="30 days free" href={host?.setupUrl ?? "/"}>
              Run a coaching business?
            </Row>
          </>
        ),
        audienceNote: (
          <>Look for &ldquo;your space is ready&rdquo; in your email. It opens your studio&rsquo;s own sign-in page.</>
        ),
        createWorkspace: "Set up your studio",
        startAnother: "Start another studio",
      }}
    />
  );
}

/**
 * A well-formed studio address with no studio behind it.
 *
 * Kept distinct from a login on purpose: rendering the OTP form here would ask
 * someone to sign in to a studio that does not exist, and any code they requested
 * would arrive with nowhere to go.
 */
export function NoStudio() {
  const { host } = useSession();
  const root = host?.rootDomain ?? location.hostname;
  return (
    <NoTenant
      copy={{ noWorkspaceAt: "No studio at", checkTheLink: "Check the link your coach sent you" }}
      note="If you run this studio, your clients need the new link."
    >
      <Row icon={MapPin} sub="It may have moved, or have a typo">
        Nothing lives here
      </Row>
      <Row icon={Store} sub="The old one stops working straight away" href={host?.setupUrl ?? `https://setup.${root}`}>
        Changed your address?
      </Row>
    </NoTenant>
  );
}

/** A reserved or over-nested host under our root. Serves nothing, says nothing. */
export function WrongDoor() {
  return <KitWrongDoor copy={{ eyebrow: "Nothing here", title: "This address doesn’t serve anything." }} />;
}
