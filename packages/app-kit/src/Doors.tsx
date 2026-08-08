/**
 * THE DOORS THAT ARE NOT THE APP.
 *
 * `@4dl/tenancy` classifies every hostname into five doors and three of them do
 * not render a workspace. Each gets a SCREEN rather than a redirect, because each
 * is a different sentence to a different person:
 *
 *   RootSignpost  the bare root (`kova.4dl.app`, `scena.4dl.app`). Not anybody's
 *                 workspace, and deliberately NOT a login: the server refuses to
 *                 issue a sign-in code here, so offering the form would be a lie
 *                 the visitor only discovers after typing their address. If they
 *                 are already signed in — the session cookie covers the whole
 *                 root — it hands them their workspaces instead of a dead end.
 *   NoTenant      a well-formed subdomain with nothing behind it. Telling someone
 *                 the address is wrong beats inviting them to sign in to a place
 *                 that does not exist, and it leaks nothing either way.
 *   WrongDoor     a reserved or over-nested host under the root. Serves nothing
 *                 and says nothing about what is here.
 *
 * ── Why these are the platform's ────────────────────────────────────────────
 *
 * They are about the HOST MODEL and nothing else, and the host model is
 * `@4dl/tenancy`'s. Every app needs all three the moment it has more than one
 * door, and the cost of each app owning its own was not the duplication:
 *
 *   • Kova's were the good ones — the address as the anchor, a real list of your
 *     studios, a `RefreshNote` for the stale-shell case.
 *   • Tessa's were three centred `<div>`s with no address, no destination list
 *     and no way out of a cached shell.
 *   • Scena had NONE. Its door cascade handled `admin` and fell through to the
 *     workspace Shell for every other role, so on `scena.4dl.app` the whole app
 *     mounted — believing the session's active org was the tenancy — and then
 *     every single data call 404'd, because the route guard answers six paths on
 *     the root and refuses the rest. Signed in, app rendered, nothing worked.
 *
 * That last one is the reason this file exists. An app cannot forget a door it
 * does not implement.
 *
 * ── Copy is INJECTED; the shape is not ──────────────────────────────────────
 *
 * A signpost has to say what the product is to whoever guessed the address, and
 * that sentence is the product's — Kova asks whether you coach or are coached,
 * Tessa is a clinic tool nobody arrives at by accident, Scena is signage. Tessa
 * also renders in German, and `@4dl/ui`'s own strings are deliberately not
 * translated, so a component that reached for a dictionary would be wrong for
 * two different reasons. Props, therefore, exactly as `AccountExitRows` takes
 * its `noun`.
 */

import type { ReactNode } from "react";
import { Anchor, Button, Group, GroupNote, Row, Screen, Section, brandMark, hasIcon, type BrandMarks, type ThemeMode } from "@4dl/ui";
import { ArrowRight, ChevronRight } from "@4dl/ui";
import { RefreshNote } from "./RefreshNote.js";

/**
 * One place this person can go — a workspace they belong to.
 *
 * Deliberately not named for any product's word (Kova's `persona`, Scena's
 * workspace, Tessa's centre): the signpost's job is to turn an address into a
 * destination, and `brandMark` already reads this shape.
 */
export interface DoorDestination extends BrandMarks {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
}

/**
 * The address, rendered as the anchor.
 *
 * `display` at 56px would wrap a hostname on a phone, and a wrapped hostname
 * reads as broken rather than large — so the anchor carries the host at a size
 * that fits it, with the label above doing the work of saying what it is. The
 * language's own rule applied honestly: the anchor is the largest thing on the
 * screen, not a fixed number of pixels.
 */
function AddressAnchor({ label, host, sub }: { label: string; host: string; sub?: ReactNode }) {
  return (
    <Anchor eyebrow={label} sub={sub} className="pb-4">
      <span className="block break-all text-title-1 sm:text-title-1 sm:leading-[1.05]">{host}</span>
    </Anchor>
  );
}

export interface RootSignpostProps {
  /** The apex workspaces live under. Falls back to the current hostname. */
  rootDomain?: string | null;
  /** Where a new workspace is created. The one primary action for a visitor with none. */
  setupUrl?: string | null;
  /** Workspaces this visitor can already open. Empty ⇒ they are not signed in here. */
  destinations?: readonly DoorDestination[];
  /** The painted mode, for picking a light or dark brand mark. */
  mode?: ThemeMode;
  /** `<slug>.<root>` → the URL to open it. Injected because a custom domain is
   *  the app's fact, not a string this component can derive. */
  destinationUrl: (slug: string, root: string) => string;
  copy: {
    /** Eyebrow when they have somewhere to go, and when they do not. */
    signedInAt: string;
    arrivedAt: string;
    pickOne: string;
    everyOneHasAnAddress: string;
    /** Heading over the list. Takes the count so a single workspace reads singular. */
    yourWorkspaces: (n: number) => string;
    signInWorksEverywhere: string;
    /** The rows a signed-OUT visitor sees: who the product is for, and the way in. */
    audiences?: ReactNode;
    audienceNote?: ReactNode;
    createWorkspace: string;
    startAnother: string;
  };
}

/**
 * The root: a signpost, and — for someone already signed in — the way to their
 * workspaces.
 *
 * The destination list is not a convenience, it is the reason this is not a plain
 * 404. The installed PWA's `start_url` is `/`, links get shared, and the root is
 * the address people guess; every one of those arrivals would otherwise land on a
 * page about the product with no route back into their own workspace.
 */
export function RootSignpost({ rootDomain, setupUrl, destinations = [], mode = "dark", destinationUrl, copy }: RootSignpostProps) {
  const root = rootDomain || (typeof location === "undefined" ? "" : location.hostname);
  const signedIn = destinations.length > 0;

  return (
    <Screen center width="narrow">
      <AddressAnchor
        label={signedIn ? copy.signedInAt : copy.arrivedAt}
        host={root}
        sub={signedIn ? copy.pickOne : copy.everyOneHasAnAddress}
      />

      {signedIn ? (
        <Section title={copy.yourWorkspaces(destinations.length)}>
          <Group>
            {destinations.map((d) => (
              <Row
                key={d.tenantId}
                href={destinationUrl(d.tenantSlug, root)}
                sub={`${d.tenantSlug}.${root}`}
                leading={
                  <span
                    aria-hidden
                    className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-sm bg-primary/15 text-body-lg font-bold text-primary"
                  >
                    {brandMark(d, mode, "icon") ? (
                      <img
                        src={brandMark(d, mode, "icon") ?? ""}
                        alt=""
                        className={hasIcon(d, mode) ? "size-full object-cover" : "size-full object-contain p-1"}
                      />
                    ) : (
                      d.tenantName.charAt(0).toUpperCase()
                    )}
                  </span>
                }
              >
                {d.tenantName}
              </Row>
            ))}
          </Group>
          <GroupNote>{copy.signInWorksEverywhere}</GroupNote>
        </Section>
      ) : (
        copy.audiences && (
          <Section>
            <Group>{copy.audiences}</Group>
            {copy.audienceNote && <GroupNote>{copy.audienceNote}</GroupNote>}
          </Section>
        )
      )}

      {/* ONE primary action, and only when it is genuinely the next step. A
          signed-in visitor's next step is a workspace in the list above, so
          offering "create one" there would compete for the same tap — it drops
          to a quiet link instead. */}
      {!signedIn && setupUrl && (
        <div className="pt-2">
          <Button size="lg" className="w-full" asChild>
            <a href={setupUrl}>
              {copy.createWorkspace} <ArrowRight aria-hidden />
            </a>
          </Button>
        </div>
      )}
      {signedIn && setupUrl && (
        <div className="pt-1">
          <a
            href={setupUrl}
            className="flex min-h-12 items-center justify-center gap-1.5 text-caption text-muted-foreground transition-colors hover:text-foreground"
          >
            {copy.startAnother} <ChevronRight aria-hidden className="size-3.5" />
          </a>
        </div>
      )}
      {/* The signpost is where a STALE SHELL lands. Host resolution falls back to
          `root` whenever the probe fails for a reason that is not a 404 —
          offline, a 5xx, an edge that never reached the worker — so a visitor
          whose precached bundle is talking to an unreachable origin sees exactly
          this screen, on their own workspace's address, with no other way to shed
          the service worker holding it. */}
      <RefreshNote className="pt-6" />
    </Screen>
  );
}

export interface NoTenantProps {
  /** Rows explaining that nothing lives here and what to do. The product's copy. */
  children?: ReactNode;
  note?: ReactNode;
  copy: { noWorkspaceAt: string; checkTheLink: string };
}

/**
 * A well-formed workspace address with no workspace behind it.
 *
 * Kept distinct from a login on purpose: rendering the OTP form here would ask
 * someone to sign in to a workspace that does not exist, and any code they
 * requested would arrive with nowhere to go.
 *
 * The atmosphere is `quiet` rather than `brand` — this is not anybody's
 * workspace, so dressing it in full brand colour would imply it is one.
 */
export function NoTenant({ children, note, copy }: NoTenantProps) {
  return (
    <Screen center width="narrow" atmosphere="quiet">
      <AddressAnchor
        label={copy.noWorkspaceAt}
        host={typeof location === "undefined" ? "" : location.hostname}
        sub={copy.checkTheLink}
      />
      {children && (
        <Section>
          <Group>{children}</Group>
          {note && <GroupNote>{note}</GroupNote>}
        </Section>
      )}
      {/* Same reason as the signpost, one door along: a cached shell that thinks
          this slug is unclaimed keeps saying so until the worker is asked again. */}
      <RefreshNote className="pt-6" />
    </Screen>
  );
}

/**
 * A reserved or over-nested host under the root. Serves nothing, says nothing.
 *
 * No atmosphere at all — the one screen in the product with a bare canvas. This
 * host is not ours to brand and the visitor should get no signal from it either
 * way.
 *
 * The only one of the three with no `RefreshNote`, deliberately: this screen is
 * reached by an ANSWER — the worker returned a shape for the host — so the shell
 * is demonstrably fresh enough to have asked, and reloading would change nothing.
 */
export function WrongDoor({ copy }: { copy: { eyebrow: string; title: string } }) {
  return (
    <Screen center width="narrow" atmosphere={false}>
      <Anchor eyebrow={copy.eyebrow}>
        <span className="block text-title-1">{copy.title}</span>
      </Anchor>
    </Screen>
  );
}
