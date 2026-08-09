/**
 * SCENA'S DOORS — the platform's screens, wearing Scena's words.
 *
 * ── The bug this file closes ────────────────────────────────────────────────
 *
 * `App.tsx`'s cascade handled `admin` and then fell through to the workspace
 * Shell for EVERY other role. So on `scena.4dl.app` — the root, which is a
 * signpost and not a workspace — the entire operator app mounted, because
 * `/api/me` answers on the root door and reports the session's active
 * organization as `tenantId`. The Shell believed it had a tenancy; the route
 * guard, correctly, answers six paths on the root and refuses the rest. The
 * result was a fully-drawn app in which `/api/channels`, `/api/billing`,
 * `/api/branding` and `/api/emergency/active` all 404'd.
 *
 * The fix is not "handle root" — it is that the cascade is now EXHAUSTIVE over
 * `DoorRole`, so a door added later cannot be forgotten: the switch has no
 * default, and TypeScript refuses the file until every role is answered.
 *
 * ⚠️ THE DOOR DECIDES, NOT `/api/me`. Mounting the workspace app must depend on
 * `host.role`, never on the session carrying a `tenantId` — the session's active
 * org is a fact about the PERSON and the door is a fact about the ADDRESS, and
 * on the root they disagree. That is exactly the disagreement that produced the
 * outage.
 */

import { NoTenant, RefreshNote, RootSignpost, WrongDoor, type DoorDestination } from "@4dl/app-kit";
import { AlertTriangle, ArrowRight, Button, Card, IconBadge, MapPin, Monitor, Page, Row, Stagger, Store, TierAnchor } from "@4dl/ui";
import { useEffect, useState } from "react";
import { apiFetch, API_BASE } from "../api.js";
import { useTheme } from "../theme.js";
import type { HostInfo } from "../host.js";

/**
 * The workspaces this visitor can open, or `[]` while unknown.
 *
 * `null` until the answer lands, because an empty list is the SIGNED-OUT state
 * and rendering it early would show "create a workspace" to somebody who has
 * five (UI-LANGUAGE §7 — `[]` is not "not yet"). The signpost takes `[]` for
 * both, so this hook holds the distinction and renders nothing until it knows.
 */
function useMyWorkspaces(): DoorDestination[] | null {
  const [rows, setRows] = useState<DoorDestination[] | null>(null);
  useEffect(() => {
    let live = true;
    apiFetch(`${API_BASE}/api/me/workspaces`)
      .then((r) => (r.ok ? (r.json() as Promise<{ workspaces: DoorDestination[] }>) : { workspaces: [] }))
      .then((d) => live && setRows(d.workspaces ?? []))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, []);
  return rows;
}

/**
 * `scena.4dl.app` — a signpost, and for a signed-in visitor the way to their
 * workspaces.
 *
 * Not a login. The server refuses to issue a sign-in code on this door, so a
 * form here would be a lie discovered only after typing an address.
 */
export function ScenaRootSignpost({ host }: { host: HostInfo }) {
  const { mode } = useTheme();
  const workspaces = useMyWorkspaces();
  // Nothing until the list is known — see `useMyWorkspaces`.
  if (!workspaces) return null;
  return (
    <RootSignpost
      rootDomain={host.rootDomain}
      setupUrl={host.setupUrl}
      destinations={workspaces}
      mode={mode}
      destinationUrl={(slug, root) => `${location.protocol}//${slug}.${root}${location.port ? `:${location.port}` : ""}`}
      copy={{
        signedInAt: "You're signed in at",
        arrivedAt: "You've arrived at",
        pickOne: "Pick a workspace to continue",
        everyOneHasAnAddress: "Every workspace has its own address",
        yourWorkspaces: (n) => (n === 1 ? "Your workspace" : "Your workspaces"),
        signInWorksEverywhere: "Your sign-in works across all of them.",
        audiences: (
          <>
            <Row icon={Monitor} sub="Pair it from your workspace's Screens tab">
              Setting up a screen?
            </Row>
            <Row icon={MapPin} sub="Use the link your team sent you">
              Joining a workspace?
            </Row>
          </>
        ),
        audienceNote: "A workspace invitation opens its own sign-in page.",
        createWorkspace: "Create a workspace",
        startAnother: "Start another workspace",
      }}
    />
  );
}

/** A well-formed workspace address with nothing behind it. */
export function ScenaNoWorkspace({ host }: { host: HostInfo }) {
  return (
    <NoTenant
      copy={{ noWorkspaceAt: "No workspace at", checkTheLink: "Check the link you were sent" }}
      note="If you run this workspace, your team needs the new address."
    >
      {/* Bare rows: `NoTenant` supplies the `Group` around them. */}
      <Row icon={MapPin} sub="It may have moved, or have a typo">
        Nothing lives here
      </Row>
      <Row icon={Store} sub="The old address stops working straight away" href={host.setupUrl}>
        Changed your address?
      </Row>
    </NoTenant>
  );
}

/** A reserved or over-nested host under the root. Serves nothing, says nothing. */
export function ScenaWrongDoor() {
  return <WrongDoor copy={{ eyebrow: "Nothing here", title: "This address doesn’t serve anything." }} />;
}

/**
 * The workspace is closed for non-payment — the whole dashboard, replaced.
 *
 * Rung two of the platform ladder (`@4dl/billing`'s `DUNNING_DAYS`): past due →
 * read-only at 7 days → blocked at 30 → erased at 37. Read-only still serves the
 * dashboard and refuses writes; this withholds it.
 *
 * ── Why the SCREENS keep playing, and why that has to be said here ──────────
 *
 * This is the one thing a signage product owes its customer that the other apps
 * do not have to think about: a blocked workspace is a dashboard nobody can use,
 * not sixty dark panels in a hotel lobby. The player holds its cached manifest
 * and keeps running on the clock, so what stops is EDITING, not playout.
 * Somebody reading this screen is standing in a building full of screens they
 * can see, and telling them nothing about those screens invites the worst guess.
 *
 * ── Two doors stay open ─────────────────────────────────────────────────────
 *
 * `@4dl/tenancy`'s gate exempts `/api/tenant/close` and `/api/me/*` from every
 * rung so leaving is always possible, and a screen with no exit would make that
 * exemption protect nothing. Paying must be A way out, not the ONLY one.
 */
export function WorkspaceBlocked({ host }: { host: HostInfo }) {
  const name = host.tenant?.name ?? "This workspace";
  return (
    <Page className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      {/* No T1 anchor: the subject is a state, not a value — the icon and the
          sentence are the anchor. */}
      <TierAnchor className="flex flex-col items-center gap-3 text-center">
        <IconBadge icon={AlertTriangle} tone="danger" size="lg" />
        <div className="space-y-1.5">
          <h1 className="text-title-1">{name} is paused</h1>
          <p className="text-body text-muted-foreground">
            The subscription is unpaid, so the dashboard is on hold. Nothing has been deleted.
          </p>
        </div>
      </TierAnchor>

      <Stagger className="space-y-3">
        <Card className="space-y-3">
          <Row icon={Monitor} sub="They keep playing the last published channel from their own cache">
            Your screens are still running
          </Row>
          <p className="text-caption leading-relaxed text-muted-foreground">
            Channels, media and boards are all still here. Settling the invoice restores editing immediately, and
            closing the workspace and exporting stay available either way.
          </p>
          {/* A full page load, not a router navigation: the Shell is not mounted,
              so there is no route table to navigate inside. */}
          <Button size="lg" className="w-full" onClick={() => { window.location.href = "/billing"; }}>
            Go to billing
            <ArrowRight aria-hidden />
          </Button>
        </Card>
        {/* The gate was read once, at boot. When the invoice clears, asking again
            is the only way back in. */}
        <RefreshNote label="Already settled?" action="Check again" />
      </Stagger>
    </Page>
  );
}
