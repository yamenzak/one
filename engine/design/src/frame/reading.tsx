/**
 * WHERE THE DEPLOYMENT'S DOCUMENTS ARE READ, ASKED FOR RATHER THAN NAVIGATED TO.
 *
 * ⚠️ A LINK ON A DOOR TAKES SOMEBODY OUT OF THE DOOR. The terms are linked from
 * every entry screen — which is the one moment they are actually for — and a
 * plain anchor there is a full page load away from a half-typed email address
 * and back through the whole boot. That is not a broken link; it is a working
 * link doing the wrong thing.
 *
 * ⚠️ SO THE APP OFFERS A WAY TO READ, AND THIS IS THE SEAM. The library cannot
 * fetch — it has no transport and no idea what an operation is — so the app
 * provides one reader at its root and every door consumes it. No screen passes
 * anything, which is what stops three of four doors eventually not having it.
 *
 * ⚠️ AND THE DEFAULT IS THE ANCHOR, NEVER NOTHING. An app that provides no
 * reader still links to the published page: the fallback is a worse experience
 * and never an absent one.
 */

import * as React from "react";

export interface Reading {
  /** Open the documents. With no id, the list of them. */
  readonly read: (id?: string) => void;
}

const Ctx = React.createContext<Reading | null>(null);

export const ReadingProvider = Ctx.Provider;

/** ⚠️ `null` where the app provides none — the caller falls back to a link. */
export const useReading = (): Reading | null => React.use(Ctx);
