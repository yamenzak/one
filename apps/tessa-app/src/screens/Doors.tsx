/**
 * TESSA'S DOORS — the platform's screens, wearing Tessa's words, in two languages.
 *
 * `@4dl/tenancy` classifies every hostname into five doors and three of them do
 * not render a centre. Each gets a screen rather than a redirect, because each is
 * a different sentence.
 *
 * ── What these gained by moving to `@4dl/app-kit` ───────────────────────────
 *
 * They were three centred `<div>`s, and each was missing something Kova's
 * equivalents had had for months:
 *
 *   • THE ADDRESS. None of them said which hostname the visitor had reached,
 *     which is the one fact every one of these screens is actually about.
 *   • THE WAY IN. A signed-in person on the root got a tagline and no route to
 *     the centre they belong to — and the installed PWA's `start_url` is `/`, so
 *     that is where the app opens.
 *   • THE WAY OUT. No `RefreshNote`, so a stale service worker talking to an
 *     unreachable origin left the visitor on a dead page with nothing to press.
 *
 * The strings stay here. `@4dl/ui`'s own copy is deliberately untranslated, so a
 * shared component reaching for a dictionary would be wrong twice over — Tessa
 * renders in German, and what a product says about itself is the product's.
 */

import { useState } from "react";
import { api, ApiError, NoTenant, RootSignpost as KitRootSignpost, WrongDoor as KitWrongDoor, type DoorDestination } from "@4dl/app-kit";
import { Building2, Button, Callout, Field, MapPin, Row, Screen, Store } from "@4dl/ui";
import { useT } from "../i18n.js";
import { useSession } from "../session.js";

export function RootSignpost() {
  const t = useT();
  const { host } = useSession();
  /*
    Tessa has no multi-centre switcher and no memberships endpoint on the root
    door, so the list is empty and the signpost renders its signed-OUT face —
    the tagline, the way in, and the address. When a `/api/me/workspaces` lands
    here (Scena has one), this is the single line that turns it on.
  */
  const destinations: DoorDestination[] = [];
  return (
    <KitRootSignpost
      rootDomain={host?.rootDomain}
      setupUrl={host?.setupUrl}
      destinations={destinations}
      destinationUrl={(slug, root) => `${location.protocol}//${slug}.${root}`}
      copy={{
        signedInAt: t("door.root.signedInAt"),
        arrivedAt: t("door.root.arrivedAt"),
        pickOne: t("door.root.pickOne"),
        everyOneHasAnAddress: t("door.root.hint"),
        yourWorkspaces: (n) => (n === 1 ? t("door.root.yourCentre") : t("door.root.yourCentres")),
        signInWorksEverywhere: t("door.root.signInWorks"),
        audiences: (
          <Row icon={MapPin} sub={t("door.root.joiningSub")}>
            {t("door.root.joining")}
          </Row>
        ),
        audienceNote: t("app.tagline"),
        createWorkspace: t("door.root.create"),
        startAnother: t("door.root.startAnother"),
      }}
    />
  );
}

export function NoStudio() {
  const t = useT();
  const { host } = useSession();
  return (
    <NoTenant copy={{ noWorkspaceAt: t("door.none.at"), checkTheLink: t("door.none.check") }} note={t("door.none.body")}>
      <Row icon={MapPin}>{t("door.none.title")}</Row>
      <Row icon={Store} sub={t("door.none.movedSub")} href={host?.setupUrl ?? "/"}>
        {t("door.none.moved")}
      </Row>
    </NoTenant>
  );
}

export function WrongDoor() {
  const t = useT();
  return <KitWrongDoor copy={{ eyebrow: t("door.wrong.title"), title: t("door.wrong.body") }} />;
}

/**
 * CREATE A CENTRE — the setup door, and the whole of onboarding for now.
 *
 * Deliberately two fields. Kova's wizard has five steps because a studio has to
 * pick a plan, a brand and a policy before it can take a client; a medical
 * centre needs a name and an address, and everything else — locations, catalog,
 * recipes — is better learned by scanning the first box than by filling a form
 * about boxes.
 *
 * The slug becomes an ORIGIN, so it is validated server-side by `org-guard.ts`
 * (a centre at `admin.` would be a takeover). The client-side hint below is a
 * courtesy that keeps the common typo out of a round trip; it is not the check.
 */
export function Start() {
  const { refresh } = useSession();
  const t = useT();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggest = (v: string) =>
    v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

  return (
    <Screen center width="narrow">
      <div className="w-full space-y-8 py-12">
        <div className="space-y-2 text-center">
          <Building2 aria-hidden className="mx-auto size-8 text-primary" />
          <h1 className="text-title-2">{t("setup.title")}</h1>
          <p className="text-body text-muted-foreground">{t("setup.subtitle")}</p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !slug.trim()) return;
            setBusy(true);
            setError(null);
            void api
              .post<{ id: string }>("/api/auth/organization/create", { name: name.trim(), slug: slug.trim() })
              .then(async () => {
                await refresh();
                // The workspace lives at its OWN hostname, so finishing setup is
                // a navigation to a different origin rather than a route change.
                window.location.href = `${window.location.protocol}//${slug.trim()}.${window.location.host.split(".").slice(1).join(".")}`;
              })
              .catch((e2) => setError(e2 instanceof ApiError ? (e2.message || t("setup.failed")) : t("setup.failed")))
              .finally(() => setBusy(false));
          }}
        >
          <Field
            label={t("setup.name")}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slug || slug === suggest(name)) setSlug(suggest(e.target.value));
            }}
            placeholder="Praxis Nord"
            autoFocus
          />
          <Field
            label={t("setup.address")}
            value={slug}
            onChange={(e) => setSlug(suggest(e.target.value))}
            hint={t("setup.addressHint")}
          />
          <Button type="submit" className="w-full" disabled={!name.trim() || !slug.trim() || busy}>
            {busy ? t("setup.creating") : t("setup.create")}
          </Button>
        </form>

        {error && <Callout tone="danger" live="alert">{error}</Callout>}
      </div>
    </Screen>
  );
}
