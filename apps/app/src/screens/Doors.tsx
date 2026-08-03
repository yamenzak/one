/**
 * The doorway screens — the hosts that are not a studio's app.
 *
 * Three of them, and the distinction matters because each answers a different
 * question the visitor actually has:
 *
 *   RootSignpost  `kova.4dl.app` — "this isn't anybody's studio". Deliberately not
 *                 a login: signing in here would have no tenancy to sign in to, and
 *                 the server refuses to send a code (see otp-guard). If the visitor
 *                 happens to be signed in — the session cookie covers the whole
 *                 root — it hands them their studios instead of a dead end.
 *   NoStudio      `whoever.kova.4dl.app` where no studio owns that slug. A login
 *                 here would invite someone to sign in to a place that does not
 *                 exist, and would leak nothing useful either way.
 *   WrongDoor     a reserved or too-deeply-nested host under our root. Serves
 *                 nothing and says nothing about what is here.
 *
 * ── Design notes (UI-LANGUAGE) ──────────────────────────────────────────────
 *
 * These are the first pixels of the product, and they were the last to look like
 * it: three centred columns of near-identical cards, no hierarchy, no anchor.
 *
 * Rebuilt on the spine. The anchor is the ADDRESS — that is genuinely what every
 * one of these screens is about, and saying it in `display` type answers the
 * visitor's question before they read a word of body copy. Everything else drops
 * to T3 rows in one group, so "your studios" is a scannable list rather than a
 * stack of cards competing with the thing that explains them.
 */

import {
  Anchor,
  ArrowRight,
  Building2,
  Button,
  ChevronRight,
  Group,
  GroupNote,
  MapPin,
  Row,
  Screen,
  Section,
  Store,
  TierContent,
  brandMark,
} from "@4dl/ui";
import { useTheme } from "../theme.js";
import { RefreshNote } from "@4dl/app-kit";
import { studioUrl, useSession } from "../session.js";

/**
 * The address, rendered as the anchor.
 *
 * `display` at 56px would wrap a hostname on a phone, and a wrapped hostname
 * reads as broken rather than large — so the anchor slot carries the host at a
 * size that fits it, with the label above doing the work of saying what it is.
 * This is the language's own rule applied honestly: the anchor is the largest
 * thing on the screen, not a fixed number of pixels.
 */
function AddressAnchor({ label, host, sub }: { label: string; host: string; sub?: React.ReactNode }) {
  return (
    <Anchor eyebrow={label} sub={sub} className="pb-4">
      <span className="block break-all text-title-1 sm:text-[2.5rem] sm:leading-[1.05]">{host}</span>
    </Anchor>
  );
}

/**
 * The root: a signpost, and — for someone already signed in — the way to their
 * studios.
 *
 * The studio list here is not a convenience, it is the reason this screen is not a
 * plain 404. The installed PWA's `start_url` is `/`, links get shared, and the root
 * is the address people guess; every one of those arrivals used to land on a page
 * about the product with no route back into their own studio.
 */
export function RootSignpost() {
  const { mode } = useTheme();
  const { ctx, host } = useSession();
  const root = host?.rootDomain ?? location.hostname;
  const personas = ctx?.personas ?? [];
  const signedIn = personas.length > 0;

  return (
    <Screen center width="narrow">
      <AddressAnchor
        label={signedIn ? "You're signed in at" : "You've arrived at"}
        host={root}
        sub={signedIn ? "Pick a studio to continue" : "Every studio has its own address"}
      />

      {signedIn ? (
        <Section title={personas.length === 1 ? "Your studio" : "Your studios"}>
          <Group>
            {personas.map((p) => (
              <Row
                key={p.tenantId}
                href={studioUrl(p.tenantSlug, root)}
                sub={`${p.tenantSlug}.${root}`}
                leading={
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-sm bg-primary/15 text-body-lg font-bold text-primary">
                    {brandMark(p, mode, "icon") ? (
                      <img src={brandMark(p, mode, "icon") ?? ""} alt="" className="size-full object-cover" />
                    ) : (
                      p.tenantName.charAt(0).toUpperCase()
                    )}
                  </span>
                }
              >
                {p.tenantName}
              </Row>
            ))}
          </Group>
          <GroupNote>Your sign-in works across all of them.</GroupNote>
        </Section>
      ) : (
        <Section>
          <Group>
            <Row icon={MapPin} sub="Use the link they sent you">
              Training with a coach?
            </Row>
            <Row icon={Building2} sub="30 days free" href={host?.setupUrl ?? "/"}>
              Run a coaching business?
            </Row>
          </Group>
          <GroupNote>
            Look for &ldquo;your space is ready&rdquo; in your email. It opens your studio&rsquo;s own sign-in page.
          </GroupNote>
        </Section>
      )}

      {/* One primary action, and only when it is genuinely the next step. A
          signed-in visitor's next step is a studio in the list above, so
          offering "set up a studio" there would compete with it for the same
          tap. */}
      {!signedIn && (
        <TierContent className="pt-2">
          <Button size="lg" className="w-full" asChild>
            <a href={host?.setupUrl ?? "/"}>
              Set up your studio <ArrowRight aria-hidden />
            </a>
          </Button>
        </TierContent>
      )}
      {signedIn && (
        <TierContent className="pt-1">
          <a
            href={host?.setupUrl ?? "/"}
            className="flex min-h-12 items-center justify-center gap-1.5 text-caption text-muted-foreground transition-colors hover:text-foreground"
          >
            Start another studio <ChevronRight aria-hidden className="size-3.5" />
          </a>
        </TierContent>
      )}
      {/* The signpost is where a stale shell LANDS. `resolveHostInfo` falls back
          to `root` whenever the host probe fails for a reason that is not a 404 —
          offline, a 5xx, an edge that never reached the worker — so a visitor
          whose precached bundle is talking to an unreachable origin sees exactly
          this screen, on their own studio's address, with no way to shed the
          worker holding it. */}
      <RefreshNote className="pt-6" />
    </Screen>
  );
}

/**
 * A well-formed studio address with no studio behind it.
 *
 * Kept distinct from a login on purpose. Rendering the OTP form here would ask
 * someone to sign in to a studio that does not exist, and any code they requested
 * would arrive with nowhere to go.
 *
 * The atmosphere is `quiet` rather than `brand`: this is not anybody's studio, so
 * dressing it in full brand colour would imply it is one.
 */
export function NoStudio() {
  const { host } = useSession();
  const root = host?.rootDomain ?? location.hostname;
  return (
    <Screen center width="narrow" atmosphere="quiet">
      <AddressAnchor label="No studio at" host={location.hostname} sub="Check the link your coach sent you" />
      <Section>
        <Group>
          <Row icon={MapPin} sub="It may have moved, or have a typo">
            Nothing lives here
          </Row>
          <Row icon={Store} sub="The old one stops working straight away" href={host?.setupUrl ?? `https://setup.${root}`}>
            Changed your address?
          </Row>
        </Group>
        <GroupNote>If you run this studio, your clients need the new link.</GroupNote>
      </Section>
      {/* Same reason as the signpost, one door along: a cached shell that thinks
          this slug is unclaimed keeps saying so until the worker is asked again. */}
      <RefreshNote className="pt-6" />
    </Screen>
  );
}

/**
 * A reserved or over-nested host under our root. Serves nothing, says nothing.
 *
 * No atmosphere at all — the one screen in the product with a bare canvas. This
 * host is not ours to brand and the visitor should get no signal from it either
 * way.
 *
 * The only screen of the four with no `RefreshNote`, deliberately: this one is
 * reached by an ANSWER — the worker returned 404 for the host — so the shell is
 * demonstrably fresh enough to have asked, and reloading it would change nothing.
 */
export function WrongDoor() {
  return (
    <Screen center width="narrow" atmosphere={false}>
      <Anchor eyebrow="Nothing here">
        <span className="block text-title-1">This address doesn&rsquo;t serve anything.</span>
      </Anchor>
    </Screen>
  );
}
