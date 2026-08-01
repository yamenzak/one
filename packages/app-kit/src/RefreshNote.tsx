/**
 * THE ESCAPE HATCH — for the visitor a stale build has trapped.
 *
 * `hardRefresh()` has existed since the first PWA deploy, and it was reachable
 * from exactly one place: the avatar menu inside the app shell. That menu only
 * renders for someone who is signed in, which is precisely the wrong population.
 * The people a stale service worker strands are the ones who cannot get past the
 * front screen — a precached shell keeps painting the old app on a door the
 * deployment has since moved, and on iOS Safari and Android Chrome there is no
 * DevTools to unregister it from. Their only recourse was to uninstall.
 *
 * That is not hypothetical either: a proxied hostname that never reached the
 * worker still rendered a complete, wrong-looking app, out of Cache Storage. The
 * network was returning 522 and the screen looked like a product bug.
 *
 * So this goes on every screen a signed-OUT visitor can be stuck on — the login,
 * the three doorway screens, the maintenance notice, the error boundary. It is a
 * footer line rather than a button, because the overwhelmingly common case is
 * that nothing is wrong and the visitor should not be invited to fiddle: the
 * copy asks a question they will only answer "yes" to when they are actually
 * stuck.
 *
 * Deliberately not automatic. Silently unregistering the worker on some
 * heuristic ("the shell looks old") throws away the offline lane for everyone to
 * fix a problem a minority has, and an app that reloads itself unbidden is worse
 * than one that is briefly stale.
 */

import { useState } from "react";
import { RefreshCw, cn } from "@4dl/ui";
import { hardRefresh } from "./hard-refresh.js";

export function RefreshNote({
  label = "Seeing an old version of this page?",
  action = "Reload the app",
  className,
}: {
  /** The question. Override where the surrounding copy needs a different one. */
  label?: string;
  action?: string;
  className?: string;
}) {
  // `hardRefresh` ends in a navigation, so this state only ever goes one way.
  // It exists because the unregister-and-purge step takes a beat on a cold cache
  // and a control that does nothing visible for a second reads as broken.
  const [going, setGoing] = useState(false);
  return (
    <p className={cn("text-center text-xs leading-relaxed text-muted-foreground", className)}>
      {label}{" "}
      <button
        type="button"
        disabled={going}
        onClick={() => {
          setGoing(true);
          void hardRefresh();
        }}
        // min-h-11 rather than a bare inline link: this is a real target on a
        // phone, and the surrounding text is 12px.
        className="inline-flex min-h-11 items-center gap-1.5 font-medium text-foreground underline underline-offset-4 disabled:opacity-60"
      >
        <RefreshCw aria-hidden className={cn("size-3.5", going && "animate-spin")} />
        {going ? "Reloading…" : action}
      </button>
    </p>
  );
}
