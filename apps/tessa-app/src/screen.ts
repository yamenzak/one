/**
 * WHICH SCREEN — the whole client-side gate, as one pure function.
 *
 * ⚠️ It lives here rather than in `main.tsx` because `main.tsx` calls
 * `createRoot(document…)` at module scope, so importing it outside a browser
 * throws. That is not a detail: this function decides whether somebody sees the
 * app, a closed sign or a login, and it was UNTESTABLE for as long as it sat
 * next to that call — which is a large part of why two of its inputs
 * (`gate.blocked`, `maintenance.level`) were declared and never read.
 *
 * Pure, and takes structural types rather than the app's context objects, so a
 * test can state a situation in one line.
 */

export type ScreenName = "boot" | "maintenance" | "blocked" | "login" | "signpost" | "nostudio" | "wrongdoor" | "start" | "admin" | "shell";

export function pickScreen(
  loading: boolean,
  /*
    `readOnly` is named here even though this function never branches on it, and
    that is deliberate: it documents that the rung EXISTS and is handled
    elsewhere (a banner inside the Shell), so the next reader does not add a
    branch for it. Reads are never withheld over a bill, at any rung.
  */
  ctx: { active: { gate?: { blocked?: boolean; readOnly?: boolean } | null } | null } | null,
  host: { role: string; tenant: unknown; maintenance?: { level?: string } | null } | null,
): ScreenName {
  // Both are needed before anything can be chosen. Guessing flashes the wrong
  // screen, which on this set of doors means flashing a login at someone who has
  // no centre to log in to.
  if (loading || !host) return "boot";

  /*
    THE DEPLOYMENT IS CLOSED — checked FIRST, and above the door switch.

    `platform.maintenance = "full"` withholds the app for everybody at once, and
    `/api/host` is one of the few endpoints that still answers precisely so the
    client can say so. Without this the app fell through to a login nobody could
    complete: the sign-in lane is refused at `full`, so the code never arrives
    and the screen gives no reason.

    The `admin.` door is exempt, as it is server-side — the console is how an
    operator ENDS the window, and locking them out of it would make the switch a
    one-way door.
  */
  if (host.maintenance?.level === "full" && host.role !== "admin") return "maintenance";

  switch (host.role) {
    case "invalid":
      return "wrongdoor";
    case "root":
      return "signpost";
    case "setup":
      return ctx ? "start" : "login";
    /**
     * The OPERATOR door. It has no tenant by construction, so without this case
     * it fell into `default` below, failed `!host.tenant`, and rendered "no
     * centre at this address" — while `/api/admin/*` answered underneath it.
     * Signed out, it shows the sign-in form: this is a platform door and the
     * server will issue a code for it.
     */
    case "admin":
      return ctx ? "admin" : "login";
    default: {
      if (!host.tenant) return "nostudio";
      if (!ctx) return "login";
      // Signed in, but not a member of THIS centre. The setup door is where a
      // centre is made; here there is nothing to show them.
      if (!ctx.active) return "nostudio";
      /*
        RUNG TWO OF THE LADDER, and the Shell's own comment has claimed since it
        was written that `blocked` "is handled before the Shell ever mounts".
        Nothing handled it: `session.ts` declared the field and no code read it,
        so a centre 30 days past due got the ordinary app with a read-only chip
        and every write failing one at a time.

        `readOnly` deliberately does NOT come here — reads are never withheld
        over a bill, at any rung. That one stays a banner inside the Shell.
      */
      if (ctx.active.gate?.blocked) return "blocked";
      return "shell";
    }
  }
}
