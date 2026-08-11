/**
 * THE ACCOUNT CENTRE — the presentation, and only the presentation.
 *
 * ⚠️ THE SCREENS AND THE PRESENTATION ARE SEPARATE FILES, and this is the seam. A
 * surface laid over an app has to trap focus, lock the scroll behind it, close on
 * Escape and announce itself to a reader as a thing that has taken over — none of
 * which is a fact about an account, and all of which is the same for every screen
 * inside. `home.tsx` and `details.tsx` know none of it.
 *
 * ⚠️ RADIX SUPPLIES BEHAVIOUR AND NOT ONE DECLARATION OF APPEARANCE, which is the
 * whole reason it is the dependency we take. The trade a component library offers
 * is the opposite one — it styles a dialog and leaves the focus trap to you — and
 * appearance is the half we have opinions about.
 *
 * ⚠️ IT IS A ROUTE, NOT A POPUP. `/account` in every app: the person can link to
 * it, land on it and reload it. `open` is therefore the router's state and this
 * component never owns it. So is which screen is showing, which is why the screen
 * is passed in rather than chosen here.
 */

import type { ElementType, ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";

export interface AccountCenterProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /**
   * ⚠️ THE SCREEN IS HANDED THE ELEMENT THAT NAMES IT. Inside a presentation the
   * title is what LABELS the presentation, so it has to be the presenter's — and
   * passing it down means the name exists once. The alternative is a visually
   * hidden second copy, which is a name written twice and then changed in one
   * place, with nothing anywhere failing.
   */
  readonly children: (props: { readonly Heading: ElementType }) => ReactNode;
}

export function AccountCenter({ open, onClose, children }: AccountCenterProps): ReactNode {
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
        {/* ⚠️ FOCUS LANDS ON THE SURFACE, NOT ON ITS FIRST CONTROL. Left alone, the
            focus scope takes the first tabbable thing — which here is the close
            button, so the screen opens with a ring drawn round the way OUT of it,
            and a reader is told "Close" before it is told where it is. */}
        <Dialog.Content
          className="over-content"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
        >
          {children({ Heading: Dialog.Title })}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
