/**
 * THE DOORS THAT ARE NOT THE APP.
 *
 * `@4dl/tenancy` classifies every hostname into five doors, and three of them do
 * not render a workspace. Each gets a screen rather than a redirect, because
 * each is a different sentence:
 *
 *   root      a signpost. NOT a login — the server will not issue a sign-in code
 *             here, so offering the form would be a lie the person only
 *             discovers after typing their address.
 *   setup     where a centre is created. The only door that can.
 *   nostudio  a well-formed subdomain with nothing behind it. Telling someone
 *             the address is wrong beats inviting them to sign in to a place
 *             that does not exist.
 *
 * `wrongdoor` is anything else under the root and is the same shape, said more
 * plainly.
 */

import { useState } from "react";
import { api, ApiError } from "@4dl/app-kit";
import { Building2, Button, Callout, Field, Screen } from "@4dl/ui";
import { useSession } from "../session.js";

export function RootSignpost() {
  return (
    <Screen center width="narrow">
      <div className="space-y-4 py-16 text-center">
        <h1 className="text-title-1">Tessa</h1>
        <p className="text-body text-muted-foreground">
          Scan it, count it, prove it. Sterile-supply and consumable traceability for medical centres.
        </p>
        <p className="text-caption text-muted-foreground">
          Your centre has its own address. Open the link your centre gave you.
        </p>
      </div>
    </Screen>
  );
}

export function NoStudio() {
  return (
    <Screen center width="narrow">
      <div className="space-y-3 py-16 text-center">
        <h1 className="text-title-2">Nothing here</h1>
        <p className="text-body text-muted-foreground">
          No centre uses this address. Check the link — a mistyped subdomain looks exactly like this.
        </p>
      </div>
    </Screen>
  );
}

export function WrongDoor() {
  return (
    <Screen center width="narrow">
      <div className="space-y-3 py-16 text-center">
        <h1 className="text-title-2">Wrong address</h1>
        <p className="text-body text-muted-foreground">This isn't a Tessa address.</p>
      </div>
    </Screen>
  );
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
          <h1 className="text-title-2">Set up your centre</h1>
          <p className="text-body text-muted-foreground">Two things, then you can start scanning.</p>
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
              .catch((e2) => setError(e2 instanceof ApiError ? (e2.message || "Couldn't create it.") : "Couldn't create it."))
              .finally(() => setBusy(false));
          }}
        >
          <Field
            label="Centre name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slug || slug === suggest(name)) setSlug(suggest(e.target.value));
            }}
            placeholder="Praxis Nord"
            autoFocus
          />
          <Field
            label="Address"
            value={slug}
            onChange={(e) => setSlug(suggest(e.target.value))}
            hint="Letters, numbers and hyphens. This becomes your web address and can't be changed easily."
          />
          <Button type="submit" className="w-full" disabled={!name.trim() || !slug.trim() || busy}>
            {busy ? "Creating…" : "Create it"}
          </Button>
        </form>

        {error && <Callout tone="danger" live="alert">{error}</Callout>}
      </div>
    </Screen>
  );
}
