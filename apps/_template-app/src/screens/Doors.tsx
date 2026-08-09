/**
 * THE DOORS — the three hostnames that do not render a tenant.
 *
 * `@4dl/tenancy` classifies every hostname into five doors, and three of them
 * have nothing to show: the root, a hostname with no tenant behind it, and one
 * that is not ours at all. Each gets a SCREEN rather than a redirect, because
 * each is a different sentence and a redirect answers all three with the same
 * one.
 *
 * ── What `@4dl/app-kit` supplies, and why it is worth taking ────────────────
 *
 * These were three centred `<div>`s in the app that shipped them first, and each
 * was missing something that only became obvious after a support conversation:
 *
 *   THE ADDRESS. None of them said which hostname the visitor had reached,
 *   which is the one fact every one of these screens is actually about.
 *
 *   THE WAY IN. A signed-in person on the root got a tagline and no route to the
 *   tenant they belong to — and an installed PWA's `start_url` is `/`, so that
 *   is where the app opens every morning.
 *
 *   THE WAY OUT. No `RefreshNote`, so a stale service worker talking to an
 *   unreachable origin left the visitor on a dead page with nothing to press.
 *
 * ⚠️ The COPY stays here, in the app. `@4dl/ui`'s and `@4dl/app-kit`'s own
 * strings are deliberately untranslated, and what a product says about itself is
 * the product's — so a shared component reaching for a dictionary would be wrong
 * twice over. If the app is translated, these become `t(…)` calls.
 */

import { NoTenant, RootSignpost as KitRootSignpost, WrongDoor as KitWrongDoor, type DoorDestination } from "@4dl/app-kit";
import { Building2, MapPin, Row } from "@4dl/ui";
import { useSession } from "../session.js";

export function RootSignpost() {
  const { host, ctx } = useSession();
  /*
    THE MULTI-TENANT SWITCHER, in one line.

    An app with a `/api/me/tenants` endpoint on the root door fills this and the
    signpost renders its signed-IN face: "you're signed in — here are your
    workspaces". Without one it renders the signed-out face, which is correct
    rather than degraded. Do not fabricate the list from `ctx.tenants`: on the
    ROOT door there is no tenancy, so that array is empty by construction and a
    signpost claiming otherwise is a signpost that lies once and then never.
  */
  const destinations: DoorDestination[] = (ctx?.tenants ?? []).map((t) => ({ tenantId: t.id, tenantName: t.name, tenantSlug: t.slug }));
  return (
    <KitRootSignpost
      rootDomain={host?.rootDomain}
      setupUrl={host?.setupUrl}
      destinations={destinations}
      destinationUrl={(slug, root) => `${location.protocol}//${slug}.${root}`}
      copy={{
        signedInAt: "You're signed in",
        arrivedAt: "You've arrived at",
        pickOne: "Open one of yours",
        everyOneHasAnAddress: "Every workspace has its own address.",
        yourWorkspaces: (n) => (n === 1 ? "Your workspace" : "Your workspaces"),
        signInWorksEverywhere: "One sign-in covers every workspace you belong to.",
        createWorkspace: "Create a workspace",
        startAnother: "Start another workspace",
        audiences: (
          <Row icon={MapPin} sub="Open the link they sent you — it points at their address.">
            Joining somebody else's workspace?
          </Row>
        ),
      }}
    />
  );
}

export function NoTenantHere() {
  const { host } = useSession();
  return (
    <NoTenant
      copy={{ noWorkspaceAt: "No workspace uses this address", checkTheLink: "Check the link and try again." }}
      note="If a workspace was here, it may have moved or been closed."
    >
      <Row icon={MapPin}>Nothing is served at this address.</Row>
      <Row icon={Building2} sub="Create one at the setup address." href={host?.setupUrl ?? "/"}>
        Starting a new workspace?
      </Row>
    </NoTenant>
  );
}

export function WrongDoor() {
  return <KitWrongDoor copy={{ eyebrow: "Not this address", title: "Nothing is served here." }} />;
}
