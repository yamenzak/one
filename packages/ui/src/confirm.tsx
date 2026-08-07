/**
 * `await confirm({...})` — the imperative half of `ConfirmDialog`.
 *
 * ── Why both shapes exist ───────────────────────────────────────────────────
 *
 * `ConfirmDialog` is declarative and right when the dialog is PART OF A SCREEN:
 * it is rendered where it belongs, its copy sits beside the thing it guards,
 * and the screen owns whether it is open.
 *
 * It is the wrong shape when the confirmation interrupts a FUNCTION. A handler
 * that wants "delete this, unless they say no" has to hoist a `useState`, park
 * the pending item in it, split its own body across a callback, and remember to
 * clear the state on both paths. There are 39 `<ConfirmDialog>` call sites in
 * this repo across three apps and the admin console, and every one of them
 * carries that machinery. Scena wrote this wrapper rather than repeat it a
 * fortieth time — which is the signal for a name to move here (README: "a name
 * belongs in this package if a second app could plausibly import it").
 *
 * ── The one thing to know about the fallback ────────────────────────────────
 *
 * With no `<ConfirmHost>` mounted this degrades to the browser's own
 * `window.confirm`. That is deliberate and it is NOT the "answer a failure with
 * a confident fact" pattern this codebase otherwise refuses: the user is still
 * asked, and still gets to say no. What they lose is the styling. Silently
 * resolving `true` — or `false` — would be the unacceptable version, because
 * one deletes without asking and the other makes every destructive button
 * appear broken.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./primitives.js";
import { Dialog, DialogContent, DialogDescription, DialogFooter } from "./overlays.js";

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button. Use it whenever the action cannot be undone. */
  destructive?: boolean;
}

type Pending = ConfirmOptions & { resolve: (v: boolean) => void };

/*
  A module-level ref rather than a context, and the reason is the whole point of
  the component: `confirm()` is called from an async handler that has no hook
  scope. A context would put it back behind `useConfirm()`, which is a hook, and
  a hook cannot be called from inside `async function remove(id)`.
*/
let host: ((p: Pending | null) => void) | null = null;

/** Ask, and resolve `true` only if they said yes. */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!host) {
      // eslint-disable-next-line no-alert
      resolve(window.confirm(typeof opts.description === "string" ? opts.description : opts.title));
      return;
    }
    host({ ...opts, resolve });
  });
}

/** Mount ONCE, near the app root. Without it `confirm()` falls back (see above). */
export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    host = setPending;
    return () => {
      host = null;
    };
  }, []);

  const close = (result: boolean) => {
    pending?.resolve(result);
    setPending(null);
  };

  return (
    <Dialog open={Boolean(pending)} onOpenChange={(o) => !o && close(false)}>
      <DialogContent title={pending?.title ?? ""} className="sm:max-w-sm">
        {pending?.description ? <DialogDescription>{pending.description}</DialogDescription> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            {pending?.cancelLabel ?? "Cancel"}
          </Button>
          <Button variant={pending?.destructive ? "destructive" : "default"} onClick={() => close(true)}>
            {pending?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
