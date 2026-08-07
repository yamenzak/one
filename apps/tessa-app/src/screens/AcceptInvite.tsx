/**
 * WHERE AN INVITATION LANDS.
 *
 * The link in the email is `/accept-invitation/:id` on the CENTRE's own
 * hostname — `staff-routes.ts` builds it from `canonicalHost`, not from whatever
 * origin the owner happened to be on when they sent it. That matters because
 * this screen only works on the door the tenant is served from.
 *
 * ── Signed out is the NORMAL case, not an error ─────────────────────────────
 *
 * Almost nobody clicking this has an account yet. So the screen does not refuse
 * — it explains, and sends them to sign in with the same one-time code the rest
 * of the app uses. `Login` returns them here because the URL is unchanged.
 *
 * ── Acceptance goes through Better Auth ─────────────────────────────────────
 *
 * Deliberately: its `beforeAcceptInvitation` hook re-checks the staff seat at
 * the moment the seat is actually claimed, which is the only check that can be
 * right. The invite route counted a RESERVED seat days earlier, and the centre's
 * plan may have changed since.
 */

import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@4dl/app-kit";
import { Button, Card, Screen, Spinner } from "@4dl/ui";
import { fmt } from "../data.js";
import { useT } from "../i18n.js";
import { useSession } from "../session.js";
import { Login } from "./Login.js";

export function AcceptInvite() {
  const t = useT();
  const { id = "" } = useParams();
  const { ctx, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Not signed in: show the ordinary sign-in screen. The path does not change,
  // so finishing sign-in lands them back on this component with a session.
  if (!ctx) {
    return (
      <Screen center width="narrow">
        <Card className="mb-4 space-y-2 p-6 text-center">
          <h1 className="text-title-2">{t("invite.title")}</h1>
          <p className="text-body text-muted-foreground">{t("invite.signInBody")}</p>
        </Card>
        <Login />
      </Screen>
    );
  }

  return (
    <Screen center width="narrow">
      <Card className="space-y-4 p-6 text-center">
        <h1 className="text-title-2">{t("invite.title")}</h1>
        <p className="text-body leading-relaxed text-muted-foreground">{t("invite.body")}</p>
        {error && <p className="text-body text-danger">{error}</p>}
        <Button
          className="w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api.post("/api/auth/organization/accept-invitation", { invitationId: id });
              /**
               * Reload the CONTEXT rather than navigating.
               *
               * The membership was just created, and `/api/context` is what
               * decides which screen this door renders. Pushing a route before
               * the session knows about the membership shows the "no centre
               * here" screen for a beat — on the one screen whose entire job is
               * to say the opposite.
               */
              await refresh();
              window.location.replace("/");
            } catch (e) {
              setError(fmt(e, t("invite.failed")));
              setBusy(false);
            }
          }}
        >
          {busy ? <Spinner /> : t("invite.accept")}
        </Button>
      </Card>
    </Screen>
  );
}
