/**
 * THE ACCOUNT CENTRE — the account home, PRESENTED.
 *
 * ⚠️ THE SCREEN AND THE PRESENTATION ARE TWO FILES, and this is the seam. A
 * screen laid over an app has to trap focus, lock the scroll behind it, close on
 * Escape, and announce itself to a reader as a thing that has taken over — none
 * of which is a fact about the account, and all of which is the same for every
 * screen presented this way. `home.tsx` knows none of it.
 *
 * ⚠️ RADIX SUPPLIES BEHAVIOUR AND NOT ONE DECLARATION OF APPEARANCE, which is the
 * whole reason it is the dependency we take. The trade a component library
 * offers is the opposite one — it styles a dialog and leaves the focus trap to
 * you — and appearance is the half we have opinions about.
 *
 * ⚠️ IT IS A ROUTE, NOT A POPUP. `/account` in every app: the person can link to
 * it, land on it, and reload it. `open` is therefore the router's state and this
 * component never owns it.
 */

import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AccountHome, type AccountHomeProps } from "./home.js";

export interface AccountCenterProps extends Omit<AccountHomeProps, "Heading"> {
  readonly open: boolean;
}

export function AccountCenter({ open, onClose, ...screen }: AccountCenterProps): ReactNode {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        {/* ⚠️ NO OVERLAY, BECAUSE THE SURFACE IS OPAQUE AND COVERS THE VIEWPORT.
            It had one, and on a wide window it was visible as a seam: the sky
            bleeds past the capped column by design, so either side of the column
            it fell on a dimmed app instead of on the page's own ground, and the
            two greys did not meet. A dimmed layer under an opaque one is a
            gradient nobody asked for. */}
        {/* ⚠️ NO DESCRIPTION, AND SAID SO. Radix warns about a missing one, and the
            fix is not to invent a sentence — a screen with a title and a list of
            named rows has nothing left for a description to add that is not
            already read aloud. */}
        {/* ⚠️ FOCUS LANDS ON THE SURFACE, NOT ON ITS FIRST CONTROL. Left alone,
            the focus scope takes the first tabbable thing — which here is the
            close button, so the screen opens with a ring drawn round the way OUT
            of it, and a reader is told "Close" before it is told where it is. */}
        <Dialog.Content
          className="over-content"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
        >
          {/*
            ⚠️ THE SCREEN'S OWN TITLE IS THE DIALOG'S TITLE, passed in rather than
            duplicated. A hidden second copy is the ordinary way this is done and
            it means the name is written twice — so the visible one gets changed
            and the announced one does not, and nothing anywhere fails.
          */}
          <AccountHome {...screen} onClose={onClose} Heading={Dialog.Title} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

