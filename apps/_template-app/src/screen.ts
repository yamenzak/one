/**
 * WHICH SCREEN — the whole client-side gate, as one PURE function.
 *
 * ⚠️ It lives in its own file rather than in `main.tsx` because `main.tsx` calls
 * `createRoot(document…)` at module scope, so importing it outside a browser
 * throws. That is not a detail: this function decides whether somebody sees the
 * app, a closed sign or a login, and in Tessa it was UNTESTABLE for as long as
 * it sat next to that call — which is a large part of why two of its inputs
 * (`gate.blocked`, `maintenance.level`) were declared and never read.
 *
 * It takes structural types rather than the app's context objects, so a test can
 * state a situation in one line. `screen-gate.test.ts` is that test; keep it.
 */

export type ScreenName =
  | "boot"
  | "maintenance"
  | "blocked"
  | "login"
  | "signpost"
  | "notenant"
  | "wrongdoor"
  | "start"
  | "admin"
  | "shell";

export function pickScreen(
  loading: boolean,
  /*
    `readOnly` is named below even though this function never branches on it, and
    that is deliberate: it documents that the rung EXISTS and is handled
    elsewhere (a banner inside the Shell), so the next reader does not add a
    branch for it. Reads are never withheld over a bill, at any rung.
  */
  ctx: { active: { gate?: { blocked?: boolean; readOnly?: boolean } | null } | null } | null,
  host: { role: string; tenant: unknown; maintenance?: { level?: string } | null } | null,
): ScreenName {
  // Both are needed before anything can be chosen. Guessing flashes the wrong
  // screen, which on this set of doors means flashing a login at somebody who
  // has no tenant to log in to.
  if (loading || !host) return "boot";

  /*
    THE DEPLOYMENT IS CLOSED — checked FIRST, and above the door switch.

    `platform.maintenance = "full"` withholds the app for everybody at once, and
    `/api/host` is one of the few endpoints that still answers precisely so the
    client can say so. Without this the app falls through to a login nobody can
    complete: the sign-in lane is refused at `full`, so the code never arrives
    and the screen gives no reason.

    ⚠️ The `admin.` door is EXEMPT, as it is server-side — the console is how an
    operator ends the window, and locking them out of it makes the switch a
    one-way door.

    It is also above the tenant's own standing, because a deployment-wide window
    is the wider truth and the one nobody reading it can act on. Showing "settle
    your invoice" during our own outage sends somebody to fix a bill that is not
    the reason they are stuck.
  */
  if (host.maintenance?.level === "full" && host.role !== "admin") return "maintenance";

  switch (host.role) {
    case "invalid":
      return "wrongdoor";
    case "root":
      // A signpost, never a login: the server refuses to send a sign-in code
      // here, so a form would be a lie about what pressing it does.
      return "signpost";
    case "setup":
      return ctx ? "start" : "login";
    /**
     * The OPERATOR door. It has no tenant by construction, so without this case
     * it falls into `default`, fails `!host.tenant`, and renders "no tenant at
     * this address" — while `/api/admin/*` answers underneath it. Tessa did
     * exactly that. Signed out it shows the sign-in form: this is a platform
     * door and the server will issue a code for it.
     */
    case "admin":
      return ctx ? "admin" : "login";
    default: {
      if (!host.tenant) return "notenant";
      if (!ctx) return "login";
      // Signed in, but not a member of THIS tenant. The setup door is where a
      // tenant is made; here there is nothing to show them, and "pay your
      // invoice" would be addressed to a stranger.
      if (!ctx.active) return "notenant";
      /*
        RUNG TWO OF THE STANDING LADDER. `readOnly` deliberately does NOT come
        here — reads are never withheld over a bill, at any rung, so that one
        stays a banner inside the Shell. `blocked` replaces the app.

        Both Kova's and Tessa's Shells claimed in a comment that `blocked` was
        "handled before the Shell ever mounts". In Tessa nothing handled it, so a
        centre thirty days past due got the ordinary application with a small
        read-only chip and every write failing one at a time — which reads as
        "the software is broken", not as "the invoice is unpaid".
      */
      if (ctx.active.gate?.blocked) return "blocked";
      return "shell";
    }
  }
}
